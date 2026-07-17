/**
 * Subscription Management Service
 * 
 * Handles subscription lifecycle including:
 * - Creating subscriptions (both Razorpay and internal)
 * - Upgrading/downgrading plans
 * - Cancellations and pauses
 * - Prorated billing calculations
 * - Trial period management
 */

import Razorpay from 'razorpay';
import { storage } from '../storage';
import type { Subscription, Brand } from '@shared/schema';

// Initialize Razorpay client
let razorpayClient: Razorpay | null = null;

export function initializeRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    console.warn('[Razorpay] API keys not configured, subscription features will be disabled');
    return;
  }

  razorpayClient = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  console.log('[Razorpay] Client initialized successfully');
}

export function getRazorpayClient(): Razorpay {
  if (!razorpayClient) {
    throw new Error('Razorpay client not initialized');
  }
  return razorpayClient;
}

const DEFAULT_PLAN_PRICING_PAISE: Record<string, number> = {
  free: 0,
  starter: 3000,
  growth: 10000,
  enterprise: 100000,
};

const USD_TO_INR_RATE = Number(process.env.USD_TO_INR_RATE || 94);

async function getPlanPricePaise(planId: string): Promise<number> {
  const configured = await storage.getPlanCapability(planId);
  if (configured && typeof configured.monthlyPrice === 'number' && configured.monthlyPrice >= 0) {
    const monthlyInr = configured.monthlyPrice * USD_TO_INR_RATE;
    return Math.round(monthlyInr * 100);
  }
  return DEFAULT_PLAN_PRICING_PAISE[planId] ?? 0;
}

/**
 * Create a Razorpay subscription plan if it doesn't exist
 */
async function ensureRazorpayPlan(planId: string): Promise<string> {
  const client = getRazorpayClient();
  
  // Check if plan already exists (you should cache this)
  const planName = `airank_${planId}`;
  const amount = await getPlanPricePaise(planId);
  const interval = 'monthly';

  try {
    // Create plan in Razorpay
    const plan = await client.plans.create({
      period: interval,
      interval: 1,
      item: {
        name: `AIRank ${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`,
        amount: amount,
        currency: 'INR',
        description: `AIRank ${planId} subscription`,
      },
      notes: {
        plan_id: planId,
      },
    });

    console.log(`[Razorpay] Created plan: ${plan.id}`);
    return plan.id;
  } catch (error: any) {
    // Plan might already exist, return a cached ID or handle error
    console.error('[Razorpay] Error creating plan:', error.message);
    throw error;
  }
}

/**
 * Create a new subscription (dual-layer: Razorpay + internal)
 */
export async function createSubscription(params: {
  brandId: string;
  planId: string;
  userId: string;
  customerEmail?: string;
  customerPhone?: string;
  startTrial?: boolean;
}): Promise<{ subscriptionId: string; razorpaySubscriptionId: string }> {
  const { brandId, planId, userId, customerEmail, customerPhone, startTrial } = params;
  const planPricePaise = await getPlanPricePaise(planId);

  // Reuse an existing pending subscription checkout for the same plan.
  const existing = await storage.getSubscriptionByBrandId(brandId);
  if (
    existing &&
    existing.planId === planId &&
    existing.status === 'pending' &&
    existing.razorpaySubscriptionId &&
    existing.razorpaySubscriptionId !== 'free_plan'
  ) {
    return {
      subscriptionId: existing.id,
      razorpaySubscriptionId: existing.razorpaySubscriptionId,
    };
  }

  // Free plan doesn't need Razorpay subscription
  if (planId === 'free' || planPricePaise <= 0) {
    const subscription = await storage.createSubscription({
      brandId,
      planId,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    });

    await storage.updateBrand(brandId, {
      tier: 'free',
      status: 'active',
    });

    return {
      subscriptionId: subscription.id,
      razorpaySubscriptionId: 'free_plan',
    };
  }

  const client = getRazorpayClient();

  // Ensure Razorpay plan exists
  const razorpayPlanId = await ensureRazorpayPlan(planId);

  // Create Razorpay subscription
  const notifyInfo: Record<string, string> = {};
  const email = (customerEmail || "").trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    notifyInfo.notify_email = email;
  }
  const phoneDigits = (customerPhone || "").replace(/\D/g, "");
  if (phoneDigits.length >= 10 && phoneDigits.length <= 15) {
    notifyInfo.notify_phone = phoneDigits;
  }

  const razorpaySubscription = await client.subscriptions.create({
    plan_id: razorpayPlanId,
    customer_notify: 1,
    quantity: 1,
    total_count: 12, // 12 months
    ...(startTrial
      ? { start_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) } // Start after 7 days trial
      : {}),
    notes: {
      brand_id: brandId,
      user_id: userId,
      plan_id: planId,
    },
    ...(Object.keys(notifyInfo).length > 0 ? { notify_info: notifyInfo } : {}),
  });

  // Create internal subscription record
  const subscription = await storage.createSubscription({
    brandId,
    planId,
    status: startTrial ? 'trialing' : 'pending',
    razorpaySubscriptionId: razorpaySubscription.id,
    currentPeriodStart: new Date(razorpaySubscription.start_at * 1000),
    currentPeriodEnd: new Date(razorpaySubscription.end_at * 1000),
    trialEnd: startTrial ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : undefined,
  });

  console.log(`[Subscription] Created for brand ${brandId}: ${subscription.id}`);

  return {
    subscriptionId: subscription.id,
    razorpaySubscriptionId: razorpaySubscription.id,
  };
}

/**
 * Calculate prorated amount for plan changes
 */
function calculateProratedAmount(
  currentPlan: string,
  newPlan: string,
  daysRemaining: number,
  totalDays: number
): number {
  const currentAmount = DEFAULT_PLAN_PRICING_PAISE[currentPlan] ?? 0;
  const newAmount = DEFAULT_PLAN_PRICING_PAISE[newPlan] ?? 0;

  // Calculate unused amount from current plan
  const unusedAmount = (currentAmount * daysRemaining) / totalDays;

  // Calculate prorated amount for new plan
  const proratedNewAmount = (newAmount * daysRemaining) / totalDays;

  // Return the difference (can be negative for downgrades)
  return proratedNewAmount - unusedAmount;
}

/**
 * Upgrade or downgrade a subscription
 */
export async function changeSubscriptionPlan(params: {
  brandId: string;
  newPlanId: string;
  immediate?: boolean;
}): Promise<{ subscription: Subscription; proratedAmount?: number }> {
  const { brandId, newPlanId, immediate = true } = params;

  // Get current subscription
  const currentSubscription = await storage.getSubscriptionByBrandId(brandId);
  if (!currentSubscription) {
    throw new Error('No active subscription found');
  }

  const currentPlanId = currentSubscription.planId;

  // If downgrading to free, cancel Razorpay subscription
  if (newPlanId === 'free') {
    if (currentSubscription.razorpaySubscriptionId && currentSubscription.razorpaySubscriptionId !== 'free_plan') {
      const client = getRazorpayClient();
      await (client.subscriptions as any).cancel(currentSubscription.razorpaySubscriptionId, {
        cancel_at_cycle_end: !immediate ? 1 : 0,
      });
    }

    await storage.updateSubscription(currentSubscription.id, {
      planId: 'free',
      status: immediate ? 'cancelled' : 'active',
      cancelAt: !immediate ? currentSubscription.currentPeriodEnd : undefined,
      canceledAt: immediate ? new Date() : undefined,
    });

    if (immediate) {
      await storage.updateBrand(brandId, {
        tier: 'free',
      });
    }

    return { subscription: currentSubscription };
  }

  // Calculate prorated amount
  const now = new Date();
  const periodEnd = currentSubscription.currentPeriodEnd;
  const periodStart = currentSubscription.currentPeriodStart;
  const daysRemaining = Math.ceil((periodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000));

  const proratedAmount = calculateProratedAmount(currentPlanId, newPlanId, daysRemaining, totalDays);

  if (immediate) {
    // Cancel old Razorpay subscription
    if (currentSubscription.razorpaySubscriptionId && currentSubscription.razorpaySubscriptionId !== 'free_plan') {
      const client = getRazorpayClient();
      await (client.subscriptions as any).cancel(currentSubscription.razorpaySubscriptionId, {
        cancel_at_cycle_end: 0,
      });
    }

    // Create new subscription
    const brand = await storage.getBrand(brandId);
    if (!brand) throw new Error('Brand not found');

    const { subscriptionId, razorpaySubscriptionId } = await createSubscription({
      brandId,
      planId: newPlanId,
      userId: brand.userId,
      customerEmail: brand.domain, // You should have actual email
      customerPhone: '+919999999999', // You should have actual phone
    });

    const newSubscription = await storage.getSubscription(subscriptionId);
    if (!newSubscription) throw new Error('Failed to create subscription');

    return {
      subscription: newSubscription,
      proratedAmount: proratedAmount / 100, // Convert paise to rupees
    };
  } else {
    // Schedule change at period end
    await storage.updateSubscription(currentSubscription.id, {
      cancelAt: currentSubscription.currentPeriodEnd,
    });

    return { subscription: currentSubscription };
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(params: {
  brandId: string;
  immediate?: boolean;
  reason?: string;
}): Promise<Subscription> {
  const { brandId, immediate = false, reason } = params;

  const subscription = await storage.getSubscriptionByBrandId(brandId);
  if (!subscription) {
    throw new Error('No active subscription found');
  }

  // Cancel in Razorpay
  if (subscription.razorpaySubscriptionId && subscription.razorpaySubscriptionId !== 'free_plan') {
    const client = getRazorpayClient();
    await (client.subscriptions as any).cancel(subscription.razorpaySubscriptionId, {
      cancel_at_cycle_end: immediate ? 0 : 1,
    });
  }

  // Update internal subscription
  await storage.updateSubscription(subscription.id, {
    status: immediate ? 'cancelled' : 'active',
    cancelAt: !immediate ? subscription.currentPeriodEnd : undefined,
    canceledAt: immediate ? new Date() : undefined,
  });

  // If immediate, downgrade to free
  if (immediate) {
    await storage.updateBrand(brandId, {
      tier: 'free',
    });
  }

  // Log cancellation reason
  await storage.createUsageLog({
    brandId,
    type: 'subscription_cancelled',
    amount: 0,
    metadata: {
      reason,
      immediate,
    },
    timestamp: new Date(),
  });

  console.log(`[Subscription] Cancelled for brand ${brandId}`);

  return subscription;
}

/**
 * Pause a subscription
 */
export async function pauseSubscription(brandId: string): Promise<Subscription> {
  const subscription = await storage.getSubscriptionByBrandId(brandId);
  if (!subscription) {
    throw new Error('No active subscription found');
  }

  if (subscription.razorpaySubscriptionId && subscription.razorpaySubscriptionId !== 'free_plan') {
    const client = getRazorpayClient();
    await client.subscriptions.pause(subscription.razorpaySubscriptionId, {
      pause_at: 'now',
    });
  }

  await storage.updateSubscription(subscription.id, {
    status: 'paused',
  });

  return subscription;
}

/**
 * Resume a paused subscription
 */
export async function resumeSubscription(brandId: string): Promise<Subscription> {
  const subscription = await storage.getSubscriptionByBrandId(brandId);
  if (!subscription) {
    throw new Error('No active subscription found');
  }

  if (subscription.razorpaySubscriptionId && subscription.razorpaySubscriptionId !== 'free_plan') {
    const client = getRazorpayClient();
    await client.subscriptions.resume(subscription.razorpaySubscriptionId, {
      resume_at: 'now',
    });
  }

  await storage.updateSubscription(subscription.id, {
    status: 'active',
  });

  return subscription;
}

/**
 * Get subscription details with Razorpay sync
 */
export async function getSubscriptionDetails(brandId: string): Promise<{
  internal: Subscription | null;
  razorpay: any | null;
  inSync: boolean;
}> {
      const internal = (await storage.getSubscriptionByBrandId(brandId)) ?? null;
  
  if (!internal || !internal.razorpaySubscriptionId || internal.razorpaySubscriptionId === 'free_plan') {
    return {
      internal,
      razorpay: null,
      inSync: true,
    };
  }

  try {
    const client = getRazorpayClient();
    const razorpay = await client.subscriptions.fetch(internal.razorpaySubscriptionId);

    // Check if in sync
    const inSync = internal.status === razorpay.status;

    return {
      internal,
      razorpay,
      inSync,
    };
  } catch (error) {
    console.error('[Subscription] Error fetching Razorpay subscription:', error);
    return {
      internal,
      razorpay: null,
      inSync: false,
    };
  }
}

/**
 * Sync subscription status from Razorpay
 */
export async function syncSubscriptionStatus(brandId: string): Promise<void> {
  const { internal, razorpay, inSync } = await getSubscriptionDetails(brandId);

  if (!internal || !razorpay) {
    return;
  }

  if (!inSync) {
    const updatePayload: any = { status: razorpay.status };
    if (Number(razorpay.current_start) > 0) {
      updatePayload.currentPeriodStart = new Date(razorpay.current_start * 1000);
    }
    if (Number(razorpay.current_end) > 0) {
      updatePayload.currentPeriodEnd = new Date(razorpay.current_end * 1000);
    }

    await storage.updateSubscription(internal.id, updatePayload);
  }

  // Prevent unpaid subscriptions from granting paid access.
  if (razorpay.status === 'active') {
    await storage.updateBrand(brandId, { tier: internal.planId as any, status: 'active' });

    // Webhook fallback: backfill invoice/payment from Razorpay if callbacks were missed.
    try {
      const client = getRazorpayClient();
      const existingPayments = await storage.getPaymentsByBrand(brandId, 100);
      const existingPaymentIds = new Set(
        existingPayments.map((p: any) => p.razorpayPaymentId).filter(Boolean)
      );

      const invoiceCollection: any = await (client as any).invoices.all({
        subscription_id: internal.razorpaySubscriptionId,
        count: 10,
      });
      const invoices = Array.isArray(invoiceCollection?.items) ? invoiceCollection.items : [];

      for (const inv of invoices) {
        let localInvoice = inv.id ? await storage.getInvoiceByRazorpayId(inv.id) : undefined;
        if (!localInvoice) {
          localInvoice = await storage.createInvoice({
            subscriptionId: internal.id,
            brandId,
            amount: Number(inv.amount || 0),
            status: inv.status === 'paid' ? 'paid' : 'pending',
            razorpayInvoiceId: inv.id,
            razorpayPaymentId: inv.payment_id || null,
            paidAt: inv.paid_at ? new Date(inv.paid_at * 1000) : undefined,
          } as any);
        } else if (inv.status === 'paid' && localInvoice.status !== 'paid') {
          await storage.updateInvoice(localInvoice.id, {
            status: 'paid',
            razorpayPaymentId: inv.payment_id || localInvoice.razorpayPaymentId,
            paidAt: inv.paid_at ? new Date(inv.paid_at * 1000) : localInvoice.paidAt,
          } as any);
        }

        if (inv.payment_id && !existingPaymentIds.has(inv.payment_id)) {
          await storage.createPayment({
            brandId,
            invoiceId: localInvoice?.id,
            amount: Number(inv.amount || 0),
            currency: inv.currency || 'INR',
            status: inv.status === 'paid' ? 'succeeded' : 'pending',
            razorpayPaymentId: inv.payment_id,
            razorpayOrderId: inv.order_id || null,
            metadata: {
              subscription_id: inv.subscription_id,
              invoice_id: inv.id,
            },
          } as any);
          existingPaymentIds.add(inv.payment_id);
        }
      }
    } catch (err) {
      console.error('[Subscription] Failed to reconcile Razorpay invoices/payments during sync:', err);
    }
  } else {
    await storage.updateBrand(brandId, { tier: 'free', status: 'active' });
  }

  console.log(`[Subscription] Synced status for brand ${brandId}: ${razorpay.status}`);
}
