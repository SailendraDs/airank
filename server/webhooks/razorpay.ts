/**
 * Razorpay Webhook Handler
 * 
 * Handles all Razorpay webhook events including:
 * - Payment success/failure
 * - Subscription creation/activation/cancellation
 * - Invoice generation
 * - Payment refunds
 */

import crypto from 'crypto';
import type { Request, Response } from 'express';
import { storage } from '../storage';
import { getRazorpayClient } from '../services/subscription';
import { sendPaymentConfirmation, sendPaymentFailed } from '../services/email';

// Razorpay webhook event types
type RazorpayEvent = 
  | 'payment.captured'
  | 'payment.failed'
  | 'subscription.activated'
  | 'subscription.charged'
  | 'subscription.cancelled'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'subscription.pending'
  | 'subscription.halted'
  | 'invoice.paid'
  | 'refund.created';

interface RazorpayWebhookPayload {
  entity: string;
  account_id: string;
  event: RazorpayEvent;
  contains: string[];
  payload: {
    payment?: {
      entity: any;
    };
    subscription?: {
      entity: any;
    };
    invoice?: {
      entity: any;
    };
    refund?: {
      entity: any;
    };
  };
  created_at: number;
}

/**
 * Verify Razorpay webhook signature
 */
export function verifyRazorpaySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expectedSignature, 'hex');

  // timingSafeEqual throws on length mismatch — guard explicitly
  if (sigBuf.byteLength !== expBuf.byteLength) return false;

  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Handle payment captured event
 */
async function handlePaymentCaptured(payment: any) {
  console.log('[Razorpay] Payment captured:', payment.id);

  // Extract metadata
  let { brand_id, user_id, subscription_id } = payment.notes || {};

  // Some Razorpay payloads omit notes on payment objects.
  // Recover brand/subscription from invoice -> subscription notes when possible.
  if (!brand_id && payment.invoice_id) {
    try {
      const razorpay = getRazorpayClient();
      const invoice: any = await (razorpay as any).invoices.fetch(payment.invoice_id);
      if (invoice?.subscription_id) {
        const rpSub: any = await razorpay.subscriptions.fetch(invoice.subscription_id);
        brand_id = rpSub?.notes?.brand_id || brand_id;
        user_id = rpSub?.notes?.user_id || user_id;
        subscription_id = rpSub?.notes?.subscription_id || subscription_id;
      }
    } catch (err) {
      console.error('[Razorpay] Failed metadata recovery from invoice/subscription:', err);
    }
  }

  if (!brand_id) {
    console.error('[Razorpay] No brand_id in payment notes or recovered metadata');
    return;
  }

  // Update subscription payment status
  if (subscription_id) {
    const subscription = await storage.getSubscription(subscription_id);
    if (subscription) {
      await storage.updateSubscription(subscription_id, {
        status: 'active',
        currentPeriodEnd: new Date(payment.created_at * 1000 + 30 * 24 * 60 * 60 * 1000), // +30 days
      });
    }
  }

  // Log usage for billing
  await storage.createUsageLog({
    brandId: brand_id,
    type: 'payment',
    amount: payment.amount / 100, // Convert paise to rupees
    metadata: {
      razorpay_payment_id: payment.id,
      razorpay_order_id: payment.order_id,
      method: payment.method,
      email: payment.email,
      contact: payment.contact,
    },
    timestamp: new Date(payment.created_at * 1000),
  });

  // Ensure we always have an invoice record for successful onboarding/billing payments.
  const existingPayments = await storage.getPaymentsByBrand(brand_id, 200);
  const existingPayment = existingPayments.find((p: any) => p.razorpayPaymentId === payment.id);

  let invoice: any = null;
  if (payment.invoice_id) {
    invoice = await storage.getInvoiceByRazorpayId(payment.invoice_id);
  }

  if (!invoice) {
    const subscription = subscription_id ? await storage.getSubscription(subscription_id) : null;
    invoice = await storage.createInvoice({
      brandId: brand_id,
      subscriptionId: subscription?.id,
      amount: payment.amount,
      currency: payment.currency || 'INR',
      status: 'paid',
      invoiceNumber: 'RZP-' + (payment.invoice_id || payment.id),
      razorpayInvoiceId: payment.invoice_id || null,
      razorpayPaymentId: payment.id,
      paidAt: new Date(payment.created_at * 1000),
      metadata: { order_id: payment.order_id, notes: payment.notes },
    } as any);
  } else if (invoice.status !== 'paid') {
    await storage.updateInvoice(invoice.id, {
      status: 'paid',
      razorpayPaymentId: payment.id,
      paidAt: new Date(payment.created_at * 1000),
    } as any);
  }

  // Record payment with correct currency (idempotent on webhook retries).
  if (!existingPayment) {
    await storage.createPayment({
      brandId: brand_id,
      invoiceId: invoice?.id,
      amount: payment.amount,
      currency: payment.currency || 'INR',
      status: 'succeeded',
      paymentMethod: payment.method,
      razorpayPaymentId: payment.id,
      metadata: { order_id: payment.order_id, notes: payment.notes },
    } as any);
  }

  // Free plan: ₹1 verification — refund asynchronously, don't block onboarding
  if (payment.amount === 100 && payment.notes?.plan === 'free') {
    setImmediate(async () => {
      try {
        const razorpay = getRazorpayClient();
        await razorpay.payments.refund(payment.id, { amount: 100, notes: { reason: 'card_verification' } });
        await storage.updatePaymentStatus(payment.id, 'refunded');
      } catch (err) {
        console.error('[Razorpay] ₹1 refund failed (non-blocking):', err);
      }
    });
  }

  // Mark onboarding payment step complete so activation can proceed
  await storage.setBrandPaymentVerified(brand_id);

  // Send payment confirmation email
  try {
    const brand = await storage.getBrand(brand_id);
    if (brand?.userId) {
      const user = await storage.getUser(brand.userId);
      if (user?.email) {
        const planName = payment.notes?.plan || 'AIRank';
        await sendPaymentConfirmation(
          user.email,
          user.firstName || '',
          payment.amount,
          'INR',
          planName,
          payment.id,
        );
      }
    }
  } catch (err) {
    console.error('[Razorpay] Failed to send payment confirmation email:', err);
  }

  console.log('[Razorpay] Payment processed successfully');
}

/**
 * Handle payment failed event
 */
async function handlePaymentFailed(payment: any) {
  console.log('[Razorpay] Payment failed:', payment.id);
  
  const { brand_id, subscription_id } = payment.notes || {};
  
  if (!brand_id) {
    console.error('[Razorpay] No brand_id in payment notes');
    return;
  }

  // Update subscription status to past_due
  if (subscription_id) {
    const subscription = await storage.getSubscription(subscription_id);
    if (subscription) {
      await storage.updateSubscription(subscription_id, {
        status: 'past_due',
      });
    }
  }

  // Log failed payment
  await storage.createUsageLog({
    brandId: brand_id,
    type: 'payment_failed',
    amount: payment.amount / 100,
    metadata: {
      razorpay_payment_id: payment.id,
      error_code: payment.error_code,
      error_description: payment.error_description,
    },
    timestamp: new Date(payment.created_at * 1000),
  });

  // Send payment failed email
  try {
    const brand = await storage.getBrand(brand_id);
    if (brand?.userId) {
      const user = await storage.getUser(brand.userId);
      if (user?.email) {
        const planName = payment.notes?.plan || 'AIRank';
        await sendPaymentFailed(
          user.email,
          user.firstName || '',
          payment.amount,
          'INR',
          planName,
          payment.error_description,
        );
      }
    }
  } catch (err) {
    console.error('[Razorpay] Failed to send payment failed email:', err);
  }

  console.log('[Razorpay] Payment failure logged');
}

/**
 * Handle subscription activated event
 */
async function handleSubscriptionActivated(subscription: any) {
  console.log('[Razorpay] Subscription activated:', subscription.id);
  
  const { brand_id, plan_id } = subscription.notes || {};
  
  if (!brand_id || !plan_id) {
    console.error('[Razorpay] Missing brand_id or plan_id in subscription notes');
    return;
  }

  // Create or update subscription in our database
  const existingSubscription = await storage.getSubscriptionByBrandId(brand_id);
  
  if (existingSubscription) {
    await storage.updateSubscription(existingSubscription.id, {
      status: 'active',
      razorpaySubscriptionId: subscription.id,
      currentPeriodStart: new Date(subscription.current_start * 1000),
      currentPeriodEnd: new Date(subscription.current_end * 1000),
      cancelAt: undefined,
    });
  } else {
    await storage.createSubscription({
      brandId: brand_id,
      planId: plan_id,
      status: 'active',
      razorpaySubscriptionId: subscription.id,
      currentPeriodStart: new Date(subscription.current_start * 1000),
      currentPeriodEnd: new Date(subscription.current_end * 1000),
    });
  }

  // Update brand tier
  await storage.updateBrand(brand_id, {
    tier: plan_id,
    status: 'active',
  });

  console.log('[Razorpay] Subscription activated successfully');
}

/**
 * Handle subscription charged event
 */
async function handleSubscriptionCharged(subscription: any, payment: any) {
  console.log('[Razorpay] Subscription charged:', subscription.id);

  const { brand_id } = subscription.notes || {};

  if (!brand_id) {
    console.error('[Razorpay] No brand_id in subscription notes');
    return;
  }

  const dbSubscription = await storage.getSubscriptionByBrandId(brand_id);
  if (!dbSubscription) {
    console.error('[Razorpay] No local subscription found for brand:', brand_id);
    return;
  }

  await storage.updateSubscription(dbSubscription.id, {
    status: 'active',
    currentPeriodStart: new Date(subscription.current_start * 1000),
    currentPeriodEnd: new Date(subscription.current_end * 1000),
  });

  const existingInvoice = payment.invoice_id
    ? await storage.getInvoiceByRazorpayId(payment.invoice_id)
    : null;

  let invoice = existingInvoice;

  if (!invoice) {
    invoice = await storage.createInvoice({
      brandId: brand_id,
      subscriptionId: dbSubscription.id,
      amount: payment.amount,
      currency: payment.currency || 'INR',
      status: 'paid',
      invoiceNumber: 'RZP-' + (payment.invoice_id || payment.id),
      razorpayInvoiceId: payment.invoice_id || null,
      razorpayPaymentId: payment.id,
      paidAt: new Date(payment.created_at * 1000),
    } as any);
  } else if (invoice.status !== 'paid') {
    await storage.updateInvoice(invoice.id, {
      status: 'paid',
      razorpayPaymentId: payment.id,
      paidAt: new Date(payment.created_at * 1000),
    } as any);
  }

  const existingPayments = await storage.getPaymentsByBrand(brand_id, 200);
  const existingPayment = existingPayments.find((p: any) => p.razorpayPaymentId === payment.id);
  if (!existingPayment) {
    await storage.createPayment({
      brandId: brand_id,
      invoiceId: invoice?.id,
      amount: payment.amount,
      currency: payment.currency || 'INR',
      status: 'succeeded',
      paymentMethod: payment.method || null,
      razorpayPaymentId: payment.id,
      metadata: {
        subscription_id: subscription.id,
        invoice_id: payment.invoice_id || null,
        order_id: payment.order_id || null,
      },
    } as any);
  }

  console.log('[Razorpay] Subscription charge processed');
}

/**
 * Handle subscription cancelled event
 */
async function handleSubscriptionCancelled(subscription: any) {
  console.log('[Razorpay] Subscription cancelled:', subscription.id);
  
  const { brand_id } = subscription.notes || {};
  
  if (!brand_id) {
    console.error('[Razorpay] No brand_id in subscription notes');
    return;
  }

  // Update subscription status
  const dbSubscription = await storage.getSubscriptionByBrandId(brand_id);
  if (dbSubscription) {
    await storage.updateSubscription(dbSubscription.id, {
      status: 'cancelled',
      canceledAt: new Date(subscription.ended_at * 1000),
    });
  }

  // Downgrade brand to free tier
  await storage.updateBrand(brand_id, {
    tier: 'free',
    status: 'active',
  });

  console.log('[Razorpay] Subscription cancelled successfully');
}

/**
 * Handle subscription paused event
 */
async function handleSubscriptionPaused(subscription: any) {
  console.log('[Razorpay] Subscription paused:', subscription.id);
  
  const { brand_id } = subscription.notes || {};
  
  if (!brand_id) return;

  const dbSubscription = await storage.getSubscriptionByBrandId(brand_id);
  if (dbSubscription) {
    await storage.updateSubscription(dbSubscription.id, {
      status: 'paused',
    });
  }
}

/**
 * Handle subscription resumed event
 */
async function handleSubscriptionResumed(subscription: any) {
  console.log('[Razorpay] Subscription resumed:', subscription.id);
  
  const { brand_id } = subscription.notes || {};
  
  if (!brand_id) return;

  const dbSubscription = await storage.getSubscriptionByBrandId(brand_id);
  if (dbSubscription) {
    await storage.updateSubscription(dbSubscription.id, {
      status: 'active',
    });
    await storage.updateBrand(brand_id, {
      tier: dbSubscription.planId as any,
      status: 'active',
    });
  }
}

async function handleSubscriptionPending(subscription: any) {
  console.log('[Razorpay] Subscription pending:', subscription.id);
  const { brand_id } = subscription.notes || {};
  if (!brand_id) return;

  const dbSubscription = await storage.getSubscriptionByBrandId(brand_id);
  if (dbSubscription) {
    await storage.updateSubscription(dbSubscription.id, {
      status: 'pending',
    });
  }

  await storage.updateBrand(brand_id, {
    tier: 'free',
    status: 'active',
  });
}

async function handleSubscriptionHalted(subscription: any) {
  console.log('[Razorpay] Subscription halted:', subscription.id);
  const { brand_id } = subscription.notes || {};
  if (!brand_id) return;

  const dbSubscription = await storage.getSubscriptionByBrandId(brand_id);
  if (dbSubscription) {
    await storage.updateSubscription(dbSubscription.id, {
      status: 'halted',
    });
  }

  await storage.updateBrand(brand_id, {
    tier: 'free',
    status: 'active',
  });
}

/**
 * Handle invoice paid event
 */
async function handleInvoicePaid(invoice: any) {
  console.log('[Razorpay] Invoice paid:', invoice.id);
  
  const { brand_id } = invoice.notes || {};
  
  if (!brand_id) return;

  // Update invoice status in database
  const dbInvoice = await storage.getInvoiceByRazorpayId(invoice.id);
  if (dbInvoice) {
    await storage.updateInvoice(dbInvoice.id, {
      status: 'paid',
      paidAt: new Date(invoice.paid_at * 1000),
    });
  }
}

/**
 * Handle refund created event
 */
async function handleRefundCreated(refund: any) {
  console.log('[Razorpay] Refund created:', refund.id);
  
  // Log refund for accounting
  await storage.createUsageLog({
    brandId: refund.notes?.brand_id || 'unknown',
    type: 'refund',
    amount: -(refund.amount / 100),
    metadata: {
      razorpay_refund_id: refund.id,
      razorpay_payment_id: refund.payment_id,
      reason: refund.notes?.reason,
    },
    timestamp: new Date(refund.created_at * 1000),
  });
}

/**
 * Main webhook handler
 */
export async function handleRazorpayWebhook(req: Request, res: Response) {
  try {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Razorpay] RAZORPAY_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    if (!signature) {
      console.error('[Razorpay] Missing webhook signature header');
      return res.status(400).json({ error: 'Missing signature' });
    }

    // Verify signature using raw payload bytes.
    const rawBody = (req as any).rawBody;
    const payload = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : JSON.stringify(req.body);
    const isValid = verifyRazorpaySignature(payload, signature, webhookSecret);

    if (!isValid) {
      console.error('[Razorpay] Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const webhookData = req.body as RazorpayWebhookPayload;
    console.log('[Razorpay] Webhook event:', webhookData.event);

    // Handle different event types
    switch (webhookData.event) {
      case 'payment.captured':
        if (webhookData.payload.payment) {
          await handlePaymentCaptured(webhookData.payload.payment.entity);
        }
        break;

      case 'payment.failed':
        if (webhookData.payload.payment) {
          await handlePaymentFailed(webhookData.payload.payment.entity);
        }
        break;

      case 'subscription.activated':
        if (webhookData.payload.subscription) {
          await handleSubscriptionActivated(webhookData.payload.subscription.entity);
        }
        break;

      case 'subscription.charged':
        if (webhookData.payload.subscription && webhookData.payload.payment) {
          await handleSubscriptionCharged(
            webhookData.payload.subscription.entity,
            webhookData.payload.payment.entity
          );
        }
        break;

      case 'subscription.cancelled':
        if (webhookData.payload.subscription) {
          await handleSubscriptionCancelled(webhookData.payload.subscription.entity);
        }
        break;

      case 'subscription.paused':
        if (webhookData.payload.subscription) {
          await handleSubscriptionPaused(webhookData.payload.subscription.entity);
        }
        break;

      case 'subscription.resumed':
        if (webhookData.payload.subscription) {
          await handleSubscriptionResumed(webhookData.payload.subscription.entity);
        }
        break;

      case 'subscription.pending':
        if (webhookData.payload.subscription) {
          await handleSubscriptionPending(webhookData.payload.subscription.entity);
        }
        break;

      case 'subscription.halted':
        if (webhookData.payload.subscription) {
          await handleSubscriptionHalted(webhookData.payload.subscription.entity);
        }
        break;

      case 'invoice.paid':
        if (webhookData.payload.invoice) {
          await handleInvoicePaid(webhookData.payload.invoice.entity);
        }
        break;

      case 'refund.created':
        if (webhookData.payload.refund) {
          await handleRefundCreated(webhookData.payload.refund.entity);
        }
        break;

      default:
        console.log('[Razorpay] Unhandled event type:', webhookData.event);
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('[Razorpay] Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
