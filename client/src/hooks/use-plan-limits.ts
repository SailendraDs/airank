/**
 * React Hook for Plan Limits
 * 
 * Provides easy access to plan limits and feature flags in React components
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { 
  isFeatureAvailable, 
  getPlanLimits, 
  getLimit,
  isWithinLimit,
  getUsagePercentage,
  getRemaining,
  getUpgradeMessage,
  getLimitReachedMessage,
  type PlanTier,
  type FeatureKey,
  type LimitKey,
} from '../lib/feature-flags';
import { useBrandContext } from './use-brand-context';

export function usePlanLimits(brandId: string) {
  // Get brand to know the tier
  const { data: brand } = useBrandContext(brandId);
  const tier = (brand?.tier || 'free') as PlanTier;

  // Fetch plan limits from API
  const { data: limits, isLoading: limitsLoading } = useQuery({
    queryKey: ['plan-limits', brandId],
    queryFn: () => api.getPlanLimits(brandId),
    enabled: !!brandId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch current usage
  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['usage', brandId],
    queryFn: () => api.getUsage(brandId),
    enabled: !!brandId,
    staleTime: 1 * 60 * 1000, // 1 minute
  });

  const { data: brandFeatures, isLoading: featuresLoading } = useQuery({
    queryKey: ['brand-features', brandId],
    queryFn: () => api.getBrandFeatures(brandId),
    enabled: !!brandId,
    staleTime: 1 * 60 * 1000,
  });

  /**
   * Check if a feature is available
   */
  const hasFeature = (feature: FeatureKey): boolean => {
    const resolved = brandFeatures?.features?.[feature];
    if (resolved && typeof resolved.allowed === 'boolean') {
      return resolved.allowed;
    }
    return isFeatureAvailable(tier, feature);
  };

  /**
   * Check if a specific limit has been reached
   */
  const checkLimit = (limitKey: LimitKey): {
    allowed: boolean;
    current: number;
    limit: number;
    remaining: number;
    percentage: number;
    message?: string;
  } => {
    const limit = getLimit(tier, limitKey);
    const current = getCurrentUsage(limitKey);
    const allowed = isWithinLimit(tier, limitKey, current);
    const remaining = getRemaining(tier, limitKey, current);
    const percentage = getUsagePercentage(tier, limitKey, current);

    return {
      allowed,
      current,
      limit,
      remaining,
      percentage,
      message: allowed ? undefined : getLimitReachedMessage(limitKey, tier),
    };
  };

  /**
   * Get current usage for a limit type
   */
  const getCurrentUsage = (limitKey: LimitKey): number => {
    if (!usage) return 0;

    switch (limitKey) {
      case 'competitors':
        return usage.competitors || 0;
      case 'queriesPerDay':
        return usage.queriesToday || 0;
      case 'promptsPerMonth':
        return usage.promptsThisMonth || 0;
      case 'teamMembers':
        return usage.teamMembers || 0;
      default:
        return 0;
    }
  };

  /**
   * Get upgrade message for a feature
   */
  const getFeatureUpgradeMessage = (feature: FeatureKey): string => {
    return getUpgradeMessage(feature);
  };

  /**
   * Check if user can perform an action
   */
  const canPerformAction = (limitKey: LimitKey): boolean => {
    const check = checkLimit(limitKey);
    return check.allowed;
  };

  /**
   * Get all plan limits
   */
  const allLimits = getPlanLimits(tier);

  return {
    tier,
    limits: allLimits,
    loading: limitsLoading || usageLoading || featuresLoading,
    
    // Feature checks
    hasFeature,
    getFeatureUpgradeMessage,
    
    // Limit checks
    checkLimit,
    canPerformAction,
    getCurrentUsage,
    
    // Raw data
    usage,
    apiLimits: limits,
    brandFeatures,
  };
}

/**
 * Hook to check a specific feature
 */
export function useFeatureFlag(brandId: string, feature: FeatureKey) {
  const { hasFeature, getFeatureUpgradeMessage, loading, tier, brandFeatures } = usePlanLimits(brandId);
  const resolved = brandFeatures?.features?.[feature];

  return {
    isAvailable: hasFeature(feature),
    upgradeMessage: getFeatureUpgradeMessage(feature),
    loading,
    tier,
    source: resolved?.source,
    limitValue: resolved?.limitValue,
    expiresAt: resolved?.expiresAt,
  };
}

/**
 * Hook to check a specific limit
 */
export function useLimit(brandId: string, limitKey: LimitKey) {
  const { checkLimit, loading, tier } = usePlanLimits(brandId);
  const check = checkLimit(limitKey);

  return {
    ...check,
    loading,
    tier,
    isUnlimited: check.limit === -1,
    isNearLimit: check.percentage >= 80,
    isAtLimit: !check.allowed,
  };
}
