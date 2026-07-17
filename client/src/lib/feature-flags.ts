/**
 * Feature Flags and Plan Limits
 * 
 * Client-side feature flag system that checks plan limits
 * and controls feature access based on subscription tier.
 */

export type PlanTier = 'free' | 'starter' | 'growth' | 'enterprise';

export type FeatureKey = 
  | 'gscIntegration'
  | 'dataExport'
  | 'customReports'
  | 'apiAccess'
  | 'prioritySupport'
  | 'whiteLabel'
  | 'sso'
  | 'agent_readiness_full'
  | 'schema_fix_pack'
  | 'product_readiness'
  | 'product_catalog_import'
  | 'product_sampling'
  | 'query_fanout'
  | 'axp_drafts'
  | 'axp_publish'
  | 'verification_workflow'
  | 'competitive_parity'
  | 'production_audit'
  | 'launch_blocker_pack'
  | 'agent_analytics'
  | 'manual_attribution'
  | 'ga4_oauth'
  | 'gsc_oauth'
  | 'social_x'
  | 'social_instagram'
  | 'social_youtube'
  | 'scheduled_reports'
  | 'alerts'
  | 'api_access'
  | 'white_label_reports'
  | 'admin_assisted_execution';

export type LimitKey = 
  | 'competitors'
  | 'queriesPerDay'
  | 'promptsPerMonth'
  | 'teamMembers'
  | 'dataRetentionDays';

interface PlanFeatures {
  gscIntegration: boolean;
  dataExport: boolean;
  customReports: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
  whiteLabel: boolean;
  sso: boolean;
  [key: string]: boolean;
}

interface PlanLimitConfig {
  competitors: number;
  queriesPerDay: number;
  promptsPerMonth: number;
  teamMembers: number;
  dataRetentionDays: number;
  features: PlanFeatures;
}

// Client-side plan limits (matching server)
export const PLAN_LIMITS: Record<PlanTier, PlanLimitConfig> = {
  free: {
    competitors: 3,
    queriesPerDay: 6,
    promptsPerMonth: 6,
    teamMembers: 1,
    dataRetentionDays: 7,
    features: {
      gscIntegration: false,
      dataExport: false,
      customReports: false,
      apiAccess: false,
      prioritySupport: false,
      whiteLabel: false,
      sso: false,
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
  },
  starter: {
    competitors: 5,
    queriesPerDay: 50,
    promptsPerMonth: 200,
    teamMembers: 3,
    dataRetentionDays: 30,
    features: {
      gscIntegration: true,
      dataExport: false,
      customReports: false,
      apiAccess: false,
      prioritySupport: true,
      whiteLabel: false,
      sso: false,
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
  },
  growth: {
    competitors: 15,
    queriesPerDay: 200,
    promptsPerMonth: 1000,
    teamMembers: 10,
    dataRetentionDays: 90,
    features: {
      gscIntegration: true,
      dataExport: true,
      customReports: true,
      apiAccess: false,
      prioritySupport: true,
      whiteLabel: false,
      sso: false,
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
  },
  enterprise: {
    competitors: -1, // Unlimited
    queriesPerDay: -1,
    promptsPerMonth: -1,
    teamMembers: -1,
    dataRetentionDays: 365,
    features: {
      gscIntegration: true,
      dataExport: true,
      customReports: true,
      apiAccess: true,
      prioritySupport: true,
      whiteLabel: true,
      sso: true,
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
  },
};

/**
 * Check if a feature is available for a plan tier
 */
export function isFeatureAvailable(tier: PlanTier, feature: FeatureKey): boolean {
  const limits = PLAN_LIMITS[tier];
  if (!limits) return false;
  
  return limits.features[feature] || false;
}

/**
 * Get plan limits for a tier
 */
export function getPlanLimits(tier: PlanTier) {
  return PLAN_LIMITS[tier] || PLAN_LIMITS.free;
}

/**
 * Get specific limit value
 */
export function getLimit(tier: PlanTier, limitKey: LimitKey): number {
  const limits = getPlanLimits(tier);
  return limits[limitKey];
}

/**
 * Check if limit is unlimited (-1)
 */
export function isUnlimited(tier: PlanTier, limitKey: LimitKey): boolean {
  return getLimit(tier, limitKey) === -1;
}

/**
 * Check if usage is within limit
 */
export function isWithinLimit(tier: PlanTier, limitKey: LimitKey, current: number): boolean {
  const limit = getLimit(tier, limitKey);
  if (limit === -1) return true; // Unlimited
  return current < limit;
}

/**
 * Get usage percentage
 */
export function getUsagePercentage(tier: PlanTier, limitKey: LimitKey, current: number): number {
  const limit = getLimit(tier, limitKey);
  if (limit === -1) return 0; // Unlimited
  return Math.min(100, Math.round((current / limit) * 100));
}

/**
 * Get remaining count
 */
export function getRemaining(tier: PlanTier, limitKey: LimitKey, current: number): number {
  const limit = getLimit(tier, limitKey);
  if (limit === -1) return Infinity; // Unlimited
  return Math.max(0, limit - current);
}

/**
 * Get upgrade message for locked feature
 */
export function getUpgradeMessage(feature: FeatureKey): string {
  const messages: Record<FeatureKey, string> = {
    gscIntegration: 'Upgrade to Starter or higher to connect Google Search Console',
    dataExport: 'Upgrade to Growth or higher to export your data',
    customReports: 'Upgrade to Growth or higher to create custom reports',
    apiAccess: 'Upgrade to Enterprise for API access',
    prioritySupport: 'Upgrade to Starter or higher for priority support',
    whiteLabel: 'Upgrade to Enterprise for white-label branding',
    sso: 'Upgrade to Enterprise for SSO/SAML authentication',
    agent_readiness_full: 'Upgrade to Starter or higher to run full Agent Readiness scans',
    schema_fix_pack: 'Upgrade to Starter or higher to generate schema fix packs',
    product_readiness: 'Upgrade to Growth to unlock Product Readiness',
    product_catalog_import: 'Upgrade to Starter or higher to import product catalogs',
    product_sampling: 'Upgrade to Growth to run product visibility sampling',
    query_fanout: 'Upgrade to Starter or higher to unlock query fanout intelligence',
    axp_drafts: 'Upgrade to Starter or higher to create AXP drafts',
    axp_publish: 'Upgrade to Growth to publish AXP artifacts',
    verification_workflow: 'Upgrade to Starter or higher to verify implementation tasks',
    competitive_parity: 'Upgrade to Growth to unlock competitive parity reports',
    production_audit: 'Upgrade to Growth to run the production readiness audit',
    launch_blocker_pack: 'Upgrade to Growth to unlock launch blocker packs',
    agent_analytics: 'Upgrade to Starter or higher to use Agent Analytics',
    manual_attribution: 'Upgrade to Starter or higher to record attribution evidence',
    ga4_oauth: 'Upgrade to Starter or higher to connect GA4',
    gsc_oauth: 'Upgrade to Starter or higher to connect Google Search Console',
    social_x: 'Upgrade to Starter or higher to request X setup',
    social_instagram: 'Upgrade to Starter or higher to request Instagram setup',
    social_youtube: 'Upgrade to Starter or higher to request YouTube setup',
    scheduled_reports: 'Upgrade to Growth to schedule reports',
    alerts: 'Upgrade to Starter or higher to create alert rules',
    api_access: 'Upgrade to Enterprise for API access',
    white_label_reports: 'Upgrade to Enterprise for white-label reports',
    admin_assisted_execution: 'Upgrade to Enterprise for admin-assisted execution',
  };
  
  return messages[feature] || 'Upgrade your plan to access this feature';
}

/**
 * Get limit reached message
 */
export function getLimitReachedMessage(limitKey: LimitKey, tier: PlanTier): string {
  const limit = getLimit(tier, limitKey);
  
  const messages: Record<LimitKey, string> = {
    competitors: `You've reached your limit of ${limit} competitors. Upgrade to track more.`,
    queriesPerDay: `You've reached your daily limit of ${limit} queries. Upgrade for more.`,
    promptsPerMonth: `You've reached your monthly limit of ${limit} prompts. Upgrade for more.`,
    teamMembers: `You've reached your limit of ${limit} team members. Upgrade to add more.`,
    dataRetentionDays: `Your data retention is limited to ${limit} days. Upgrade for longer retention.`,
  };
  
  return messages[limitKey] || `You've reached your plan limit. Upgrade for more.`;
}

/**
 * Get recommended plan for feature
 */
export function getRecommendedPlan(feature: FeatureKey): PlanTier {
  // Check which is the lowest tier that has this feature
  const tiers: PlanTier[] = ['starter', 'growth', 'enterprise'];
  
  for (const tier of tiers) {
    if (isFeatureAvailable(tier, feature)) {
      return tier;
    }
  }
  
  return 'enterprise';
}

/**
 * Get all available features for a tier
 */
export function getAvailableFeatures(tier: PlanTier): FeatureKey[] {
  const limits = getPlanLimits(tier);
  const features: FeatureKey[] = [];
  
  for (const [key, value] of Object.entries(limits.features)) {
    if (value) {
      features.push(key as FeatureKey);
    }
  }
  
  return features;
}

/**
 * Get all locked features for a tier
 */
export function getLockedFeatures(tier: PlanTier): FeatureKey[] {
  const allFeatures: FeatureKey[] = [
    'gscIntegration',
    'dataExport',
    'customReports',
    'apiAccess',
    'prioritySupport',
    'whiteLabel',
    'sso',
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
  ];
  
  return allFeatures.filter(feature => !isFeatureAvailable(tier, feature));
}

/**
 * Format limit display
 */
export function formatLimit(tier: PlanTier, limitKey: LimitKey): string {
  const limit = getLimit(tier, limitKey);
  
  if (limit === -1) {
    return 'Unlimited';
  }
  
  if (limitKey === 'dataRetentionDays') {
    return `${limit} days`;
  }
  
  return limit.toString();
}

/**
 * Get plan comparison data
 */
export function getPlanComparison() {
  const tiers: PlanTier[] = ['free', 'starter', 'growth', 'enterprise'];
  
  return tiers.map(tier => ({
    tier,
    limits: getPlanLimits(tier),
    features: getAvailableFeatures(tier),
    lockedFeatures: getLockedFeatures(tier),
  }));
}
