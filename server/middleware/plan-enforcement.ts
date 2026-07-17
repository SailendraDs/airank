/**
 * Plan Enforcement Middleware
 * 
 * Enforces plan limits and feature access based on subscription tier
 * Checks usage against plan limits before allowing operations
 */

import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { brandFeatureOverrides, competitors as competitorsTable, featureEntitlements, promptRuns, teamMembers, type Brand } from '@shared/schema';
import { and, eq, isNull, or, gt, inArray, sql } from 'drizzle-orm';

export const FEATURE_KEYS = [
  'agent_readiness_full',
  'schema_fix_pack',
  'product_readiness',
  'product_catalog_import',
  'product_sampling',
  'query_fanout',
  'axp_drafts',
  'axp_publish',
  'verification_workflow',
  'competitive_parity',
  'production_audit',
  'launch_blocker_pack',
  'agent_analytics',
  'manual_attribution',
  'ga4_oauth',
  'gsc_oauth',
  'social_x',
  'social_instagram',
  'social_youtube',
  'scheduled_reports',
  'alerts',
  'api_access',
  'white_label_reports',
  'admin_assisted_execution',
] as const;

export type FeatureKey = typeof FEATURE_KEYS[number];

const TIER_FEATURES: Record<string, Partial<Record<FeatureKey, boolean>>> = {
  free: {
    agent_readiness_full: false,
    schema_fix_pack: false,
    product_readiness: false,
    product_catalog_import: false,
    product_sampling: false,
    query_fanout: false,
    axp_drafts: false,
    axp_publish: false,
    verification_workflow: false,
    competitive_parity: false,
    production_audit: false,
    launch_blocker_pack: false,
    agent_analytics: false,
    manual_attribution: false,
    ga4_oauth: false,
    gsc_oauth: false,
    social_x: false,
    social_instagram: false,
    social_youtube: false,
    scheduled_reports: false,
    alerts: false,
    api_access: false,
    white_label_reports: false,
    admin_assisted_execution: false,
  },
  starter: {
    agent_readiness_full: true,
    schema_fix_pack: true,
    product_readiness: true,
    product_catalog_import: true,
    product_sampling: false,
    query_fanout: true,
    axp_drafts: true,
    axp_publish: false,
    verification_workflow: true,
    competitive_parity: false,
    production_audit: false,
    launch_blocker_pack: false,
    agent_analytics: true,
    manual_attribution: true,
    ga4_oauth: true,
    gsc_oauth: true,
    social_x: true,
    social_instagram: true,
    social_youtube: true,
    scheduled_reports: false,
    alerts: true,
    api_access: false,
    white_label_reports: false,
    admin_assisted_execution: false,
  },
  growth: {
    agent_readiness_full: true,
    schema_fix_pack: true,
    product_readiness: true,
    product_catalog_import: true,
    product_sampling: true,
    query_fanout: true,
    axp_drafts: true,
    axp_publish: true,
    verification_workflow: true,
    competitive_parity: true,
    production_audit: true,
    launch_blocker_pack: true,
    agent_analytics: true,
    manual_attribution: true,
    ga4_oauth: true,
    gsc_oauth: true,
    social_x: true,
    social_instagram: true,
    social_youtube: true,
    scheduled_reports: true,
    alerts: true,
    api_access: false,
    white_label_reports: false,
    admin_assisted_execution: false,
  },
  premium: {},
  enterprise: {
    agent_readiness_full: true,
    schema_fix_pack: true,
    product_readiness: true,
    product_catalog_import: true,
    product_sampling: true,
    query_fanout: true,
    axp_drafts: true,
    axp_publish: true,
    verification_workflow: true,
    competitive_parity: true,
    production_audit: true,
    launch_blocker_pack: true,
    agent_analytics: true,
    manual_attribution: true,
    ga4_oauth: true,
    gsc_oauth: true,
    social_x: true,
    social_instagram: true,
    social_youtube: true,
    scheduled_reports: true,
    alerts: true,
    api_access: true,
    white_label_reports: true,
    admin_assisted_execution: true,
  },
};

TIER_FEATURES.premium = TIER_FEATURES.growth;

// Plan limits configuration
export const PLAN_LIMITS = {
  free: {
    competitors: 3,
    queriesPerDay: 6,
    promptsPerMonth: 6,
    teamMembers: 1,
    dataRetentionDays: 30,
    features: {
      gscIntegration: false,
      dataExport: false,
      customReports: false,
      apiAccess: false,
      prioritySupport: false,
      whiteLabel: false,
      sso: false,
    },
  },
  starter: {
    competitors: 5,
    queriesPerDay: 50,
    promptsPerMonth: 200,
    teamMembers: 3,
    dataRetentionDays: 90,
    features: {
      gscIntegration: true,
      dataExport: false,
      customReports: false,
      apiAccess: false,
      prioritySupport: true,
      whiteLabel: false,
      sso: false,
    },
  },
  growth: {
    competitors: 15,
    queriesPerDay: 200,
    promptsPerMonth: 1000,
    teamMembers: 10,
    dataRetentionDays: 365,
    features: {
      gscIntegration: true,
      dataExport: true,
      customReports: true,
      apiAccess: false,
      prioritySupport: true,
      whiteLabel: false,
      sso: false,
    },
  },
  enterprise: {
    competitors: -1, // Unlimited
    queriesPerDay: -1, // Unlimited
    promptsPerMonth: -1, // Unlimited
    teamMembers: -1, // Unlimited
    dataRetentionDays: -1, // Unlimited
    features: {
      gscIntegration: true,
      dataExport: true,
      customReports: true,
      apiAccess: true,
      prioritySupport: true,
      whiteLabel: true,
      sso: true,
    },
  },
};

/**
 * Get plan limits for a brand
 */
export function getPlanLimits(tier: string) {
  return PLAN_LIMITS[tier as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
}

type EffectivePlanLimits = ReturnType<typeof getPlanLimits>;
type FeatureResolution = {
  allowed: boolean;
  tier: string;
  featureKey: string;
  source: 'brand_override' | 'plan_entitlement' | 'plan_capability' | 'tier_default';
  limitValue?: number | null;
  expiresAt?: Date | null;
};

export async function getPlanLimitsForTier(tier: string): Promise<EffectivePlanLimits> {
  const fallback = getPlanLimits(tier);
  try {
    const configured = await storage.getPlanCapability(tier);
    if (!configured) return fallback;

    const allowedIntegrations = configured.allowedIntegrations || [];
    return {
      competitors: configured.maxCompetitors ?? fallback.competitors,
      queriesPerDay: configured.dailyQueryLimit ?? fallback.queriesPerDay,
      promptsPerMonth: configured.maxPrompts ?? fallback.promptsPerMonth,
      teamMembers: configured.maxTeamMembers ?? fallback.teamMembers,
      dataRetentionDays: fallback.dataRetentionDays,
      features: {
        gscIntegration: allowedIntegrations.includes('gsc') || allowedIntegrations.includes('google_search_console'),
        dataExport: Boolean(configured.exportEnabled),
        customReports: fallback.features.customReports,
        apiAccess: Boolean(configured.apiAccessEnabled),
        prioritySupport: Boolean(configured.prioritySupport),
        whiteLabel: Boolean((configured as any).whitelabelEnabled || (configured as any).customBranding),
        sso: Boolean(configured.ssoEnabled),
      },
    };
  } catch (error) {
    console.error('[Plan Enforcement] Failed to load configured plan limits:', error);
    return fallback;
  }
}

/**
 * Check if a feature is available for a plan
 */
export function isFeatureAvailable(tier: string, feature: string): boolean {
  const limits = getPlanLimits(tier);
  return limits.features[feature as keyof typeof limits.features] || false;
}

function planFlagFromCapability(plan: any, featureKey: string): boolean | undefined {
  const allowedIntegrations = plan?.allowedIntegrations || [];
  const map: Record<string, boolean | undefined> = {
    agent_readiness_full: plan?.agentReadinessFullEnabled,
    schema_fix_pack: plan?.agentReadinessFullEnabled,
    product_readiness: plan?.id === 'growth' || plan?.id === 'premium' || plan?.id === 'enterprise',
    product_catalog_import: plan?.id === 'growth' || plan?.id === 'premium' || plan?.id === 'enterprise' || plan?.id === 'starter',
    product_sampling: plan?.id === 'growth' || plan?.id === 'premium' || plan?.id === 'enterprise',
    query_fanout: plan?.maxPrompts > 50 || plan?.id === 'growth' || plan?.id === 'premium' || plan?.id === 'enterprise',
    axp_drafts: plan?.maxPrompts > 50 || plan?.id === 'growth' || plan?.id === 'premium' || plan?.id === 'enterprise',
    axp_publish: Boolean(plan?.exportEnabled) || plan?.id === 'growth' || plan?.id === 'premium' || plan?.id === 'enterprise',
    verification_workflow: Boolean(plan?.executionAgentsEnabled) || plan?.id !== 'free',
    competitive_parity: Boolean(plan?.exportEnabled) || plan?.id === 'growth' || plan?.id === 'premium' || plan?.id === 'enterprise',
    production_audit: plan?.id === 'growth' || plan?.id === 'premium' || plan?.id === 'enterprise',
    launch_blocker_pack: plan?.id === 'growth' || plan?.id === 'premium' || plan?.id === 'enterprise',
    agent_analytics: Boolean(plan?.crawlerAnalyticsEnabled),
    manual_attribution: plan?.id !== 'free',
    ga4_oauth: allowedIntegrations.includes('ga4') || allowedIntegrations.includes('google_analytics'),
    gsc_oauth: allowedIntegrations.includes('gsc') || allowedIntegrations.includes('google_search_console'),
    social_x: allowedIntegrations.includes('x') || allowedIntegrations.includes('twitter'),
    social_instagram: allowedIntegrations.includes('instagram'),
    social_youtube: allowedIntegrations.includes('youtube'),
    scheduled_reports: Boolean(plan?.scheduledReportsEnabled),
    alerts: Boolean(plan?.alertChannelsEnabled),
    api_access: Boolean(plan?.apiAccessEnabled),
    white_label_reports: Boolean(plan?.whitelabelEnabled || plan?.customBranding),
    admin_assisted_execution: plan?.id === 'enterprise',
  };
  return map[featureKey];
}

export async function resolveFeatureAccess(brandId: string, featureKey: string): Promise<FeatureResolution> {
  const brand = await storage.getBrand(brandId);
  if (!brand) {
    return { allowed: false, tier: 'unknown', featureKey, source: 'tier_default' };
  }

  const now = new Date();
  try {
    const [override] = await db
      .select()
      .from(brandFeatureOverrides)
      .where(and(
        eq(brandFeatureOverrides.brandId, brandId),
        eq(brandFeatureOverrides.featureKey, featureKey),
        or(isNull(brandFeatureOverrides.expiresAt), gt(brandFeatureOverrides.expiresAt, now)),
      ))
      .limit(1);

    if (override) {
      return {
        allowed: Boolean(override.enabled),
        tier: brand.tier,
        featureKey,
        source: 'brand_override',
        limitValue: override.limitValue,
        expiresAt: override.expiresAt,
      };
    }

    const [entitlement] = await db
      .select()
      .from(featureEntitlements)
      .where(and(eq(featureEntitlements.planId, brand.tier), eq(featureEntitlements.featureKey, featureKey)))
      .limit(1);

    if (entitlement) {
      return {
        allowed: Boolean(entitlement.enabled),
        tier: brand.tier,
        featureKey,
        source: 'plan_entitlement',
        limitValue: entitlement.limitValue,
      };
    }
  } catch (error) {
    console.warn('[Feature Enforcement] Entitlement lookup skipped:', error);
  }

  const plan = await storage.getPlanCapability(brand.tier).catch(() => undefined);
  const configuredFlag = planFlagFromCapability(plan, featureKey);
  if (configuredFlag !== undefined) {
    return { allowed: Boolean(configuredFlag), tier: brand.tier, featureKey, source: 'plan_capability' };
  }

  const tierDefaults = TIER_FEATURES[brand.tier] || TIER_FEATURES.free;
  return {
    allowed: Boolean(tierDefaults[featureKey as FeatureKey]),
    tier: brand.tier,
    featureKey,
    source: 'tier_default',
  };
}

export async function resolveFeatureAccessBatch(brandId: string, featureKeys: readonly string[]): Promise<FeatureResolution[]> {
  const uniqueFeatureKeys = Array.from(new Set(featureKeys));
  if (!uniqueFeatureKeys.length) return [];

  const brand = await storage.getBrand(brandId);
  if (!brand) {
    return uniqueFeatureKeys.map((featureKey) => ({
      allowed: false,
      tier: 'unknown',
      featureKey,
      source: 'tier_default',
    }));
  }

  const now = new Date();
  const resultByKey = new Map<string, FeatureResolution>();

  try {
    const overrides = await db
      .select()
      .from(brandFeatureOverrides)
      .where(and(
        eq(brandFeatureOverrides.brandId, brandId),
        inArray(brandFeatureOverrides.featureKey, uniqueFeatureKeys),
        or(isNull(brandFeatureOverrides.expiresAt), gt(brandFeatureOverrides.expiresAt, now)),
      ));

    for (const override of overrides) {
      resultByKey.set(override.featureKey, {
        allowed: Boolean(override.enabled),
        tier: brand.tier,
        featureKey: override.featureKey,
        source: 'brand_override',
        limitValue: override.limitValue,
        expiresAt: override.expiresAt,
      });
    }

    const unresolvedKeys = uniqueFeatureKeys.filter((featureKey) => !resultByKey.has(featureKey));
    if (unresolvedKeys.length) {
      const entitlements = await db
        .select()
        .from(featureEntitlements)
        .where(and(
          eq(featureEntitlements.planId, brand.tier),
          inArray(featureEntitlements.featureKey, unresolvedKeys),
        ));

      for (const entitlement of entitlements) {
        resultByKey.set(entitlement.featureKey, {
          allowed: Boolean(entitlement.enabled),
          tier: brand.tier,
          featureKey: entitlement.featureKey,
          source: 'plan_entitlement',
          limitValue: entitlement.limitValue,
        });
      }
    }
  } catch (error) {
    console.warn('[Feature Enforcement] Batch entitlement lookup skipped:', error);
  }

  const plan = await storage.getPlanCapability(brand.tier).catch(() => undefined);
  const tierDefaults = TIER_FEATURES[brand.tier] || TIER_FEATURES.free;

  return uniqueFeatureKeys.map((featureKey) => {
    const resolved = resultByKey.get(featureKey);
    if (resolved) return resolved;

    const configuredFlag = planFlagFromCapability(plan, featureKey);
    if (configuredFlag !== undefined) {
      return { allowed: Boolean(configuredFlag), tier: brand.tier, featureKey, source: 'plan_capability' };
    }

    return {
      allowed: Boolean(tierDefaults[featureKey as FeatureKey]),
      tier: brand.tier,
      featureKey,
      source: 'tier_default',
    };
  });
}

/**
 * Get current usage for a brand
 */
async function getCurrentUsage(brandId: string) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [promptUsage] = await db
    .select({
      queriesToday: sql<number>`count(*) filter (where ${promptRuns.createdAt} >= ${todayStart})`,
      promptsThisMonth: sql<number>`count(*) filter (where ${promptRuns.createdAt} >= ${monthStart})`,
    })
    .from(promptRuns)
    .where(eq(promptRuns.brandId, brandId));

  const [competitorUsage] = await db
    .select({ count: sql<number>`count(*)` })
    .from(competitorsTable)
    .where(eq(competitorsTable.brandId, brandId));

  const [teamUsage] = await db
    .select({ count: sql<number>`count(*)` })
    .from(teamMembers)
    .where(and(eq(teamMembers.brandId, brandId), eq(teamMembers.status, 'active')));

  return {
    competitors: Number(competitorUsage?.count || 0),
    queriesToday: Number(promptUsage?.queriesToday || 0),
    promptsThisMonth: Number(promptUsage?.promptsThisMonth || 0),
    teamMembers: Math.max(Number(teamUsage?.count || 0), 1), // At least 1 (the owner)
  };
}

/**
 * Check if operation is within plan limits
 */
export async function checkPlanLimit(
  brandId: string,
  limitType: 'competitors' | 'queriesPerDay' | 'promptsPerMonth' | 'teamMembers'
): Promise<{ allowed: boolean; current: number; limit: number; message?: string }> {
  const brand = await storage.getBrand(brandId);
  if (!brand) {
    return {
      allowed: false,
      current: 0,
      limit: 0,
      message: 'Brand not found',
    };
  }

  const limits = await getPlanLimitsForTier(brand.tier);
  const limit = limits[limitType];

  // Unlimited (-1) always allowed
  if (limit === -1) {
    return {
      allowed: true,
      current: 0,
      limit: -1,
    };
  }

  const usage = await getCurrentUsage(brandId);

  // Map limitType to usage property
  const usageMap: Record<string, number> = {
    'competitors': usage.competitors,
    'queriesPerDay': usage.queriesToday,
    'promptsPerMonth': usage.promptsThisMonth,
    'teamMembers': usage.teamMembers,
  };

  const current = usageMap[limitType] || 0;
  const allowed = current < limit;

  return {
    allowed,
    current,
    limit,
    message: allowed ? undefined : `Plan limit reached. Current: ${current}, Limit: ${limit}`,
  };
}

/**
 * Middleware to enforce plan limits
 */
export function enforcePlanLimit(
  limitType: 'competitors' | 'queriesPerDay' | 'promptsPerMonth' | 'teamMembers'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const brandId = req.params.brandId || (req as any).user?.brandId;

      if (!brandId) {
        return res.status(400).json({ error: 'Brand ID required' });
      }

      const check = await checkPlanLimit(brandId, limitType);

      if (!check.allowed) {
        return res.status(403).json({
          error: 'Plan limit exceeded',
          message: check.message,
          current: check.current,
          limit: check.limit,
          upgradeRequired: true,
        });
      }

      next();
    } catch (error) {
      console.error('[Plan Enforcement] Error:', error);
      res.status(500).json({ error: 'Failed to check plan limits' });
    }
  };
}

/**
 * Middleware to enforce feature access
 */
export function enforceFeatureAccess(feature: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const brandId = req.params.brandId || (req as any).user?.brandId;

      if (!brandId) {
        return res.status(400).json({ error: 'Brand ID required' });
      }

      const access = await resolveFeatureAccess(brandId, feature);
      const hasAccess = access.allowed;

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Feature not available',
          message: `This feature is not available on your current plan (${access.tier})`,
          feature,
          tier: access.tier,
          upgradeRequired: true,
        });
      }

      next();
    } catch (error) {
      console.error('[Feature Enforcement] Error:', error);
      res.status(500).json({ error: 'Failed to check feature access' });
    }
  };
}

/**
 * Middleware to check subscription status
 */
export async function enforceActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const brandId = req.params.brandId || (req as any).user?.brandId;

    if (!brandId) {
      return res.status(400).json({ error: 'Brand ID required' });
    }

    const brand = await storage.getBrand(brandId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    // Free tier is always active
    if (brand.tier === 'free') {
      return next();
    }

    const subscription = await storage.getSubscriptionByBrandId(brandId);

    if (!subscription) {
      return res.status(403).json({
        error: 'No active subscription',
        message: 'Please subscribe to a plan to access this feature',
        upgradeRequired: true,
      });
    }

    // Check if subscription is active
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return res.status(403).json({
        error: 'Subscription not active',
        message: `Your subscription is ${subscription.status}. Please update your payment method.`,
        status: subscription.status,
      });
    }

    // Check if subscription has expired
    if (subscription.currentPeriodEnd < new Date()) {
      return res.status(403).json({
        error: 'Subscription expired',
        message: 'Your subscription has expired. Please renew to continue.',
        expiredAt: subscription.currentPeriodEnd,
      });
    }

    next();
  } catch (error) {
    console.error('[Subscription Enforcement] Error:', error);
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
}

/**
 * Log usage for billing purposes
 * Note: Usage is tracked via promptRuns table, no separate logging needed
 */
export async function logUsage(
  brandId: string,
  type: string,
  amount: number = 1,
  metadata?: any
) {
  // Usage is automatically tracked via promptRuns table
  // No additional logging needed
}

/**
 * Middleware to log API usage
 * Note: Usage is tracked via promptRuns table, no separate logging needed
 */
export function logApiUsage(type: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Usage is automatically tracked via promptRuns table
    // No additional logging needed
    next();
  };
}
