/**
 * Upgrade Prompt Component
 * 
 * Shows upgrade prompts when users try to access locked features
 * or reach plan limits
 */

import { AlertCircle, Lock, TrendingUp, Zap } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Badge } from './badge';
import type { PlanTier, FeatureKey } from '@/lib/feature-flags';

interface UpgradePromptProps {
  feature?: FeatureKey;
  message: string;
  currentTier: PlanTier;
  recommendedTier?: PlanTier;
  variant?: 'inline' | 'card' | 'modal';
  showIcon?: boolean;
}

const TIER_COLORS = {
  free: 'bg-gray-100 text-gray-800',
  starter: 'bg-blue-100 text-blue-800',
  growth: 'bg-purple-100 text-purple-800',
  enterprise: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
};

const TIER_NAMES = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  enterprise: 'Enterprise',
};

export function UpgradePrompt({
  feature,
  message,
  currentTier,
  recommendedTier = 'growth',
  variant = 'inline',
  showIcon = true,
}: UpgradePromptProps) {
  const handleUpgrade = () => {
    // Navigate to pricing/upgrade page
    window.location.href = '/pricing';
  };

  if (variant === 'inline') {
    return (
      <Alert className="border-yellow-200 bg-yellow-50">
        <div className="flex items-start gap-3">
          {showIcon && <Lock className="h-5 w-5 text-yellow-600 mt-0.5" />}
          <div className="flex-1">
            <AlertTitle className="text-yellow-900">Upgrade Required</AlertTitle>
            <AlertDescription className="text-yellow-800 mt-1">
              {message}
            </AlertDescription>
            <Button 
              size="sm" 
              className="mt-3"
              onClick={handleUpgrade}
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Upgrade to {TIER_NAMES[recommendedTier]}
            </Button>
          </div>
        </div>
      </Alert>
    );
  }

  if (variant === 'card') {
    return (
      <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-purple-600" />
              <CardTitle>Unlock Premium Features</CardTitle>
            </div>
            <Badge className={TIER_COLORS[currentTier]}>
              Current: {TIER_NAMES[currentTier]}
            </Badge>
          </div>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>Upgrade to unlock this feature and more</span>
            </div>
            <Button 
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              onClick={handleUpgrade}
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Upgrade to {TIER_NAMES[recommendedTier]}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Modal variant
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
              <Lock className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <CardTitle>Feature Locked</CardTitle>
              <CardDescription>Upgrade to access this feature</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => window.history.back()}
            >
              Go Back
            </Button>
            <Button 
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600"
              onClick={handleUpgrade}
            >
              Upgrade Now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Limit Warning Component
 * Shows when approaching or at limit
 */
interface LimitWarningProps {
  current: number;
  limit: number;
  limitType: string;
  percentage: number;
}

export function LimitWarning({ current, limit, limitType, percentage }: LimitWarningProps) {
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  if (!isNearLimit) return null;

  return (
    <Alert className={isAtLimit ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}>
      <AlertCircle className={`h-4 w-4 ${isAtLimit ? 'text-red-600' : 'text-yellow-600'}`} />
      <AlertTitle className={isAtLimit ? 'text-red-900' : 'text-yellow-900'}>
        {isAtLimit ? 'Limit Reached' : 'Approaching Limit'}
      </AlertTitle>
      <AlertDescription className={isAtLimit ? 'text-red-800' : 'text-yellow-800'}>
        You've used {current} of {limit} {limitType}. 
        {isAtLimit ? ' Upgrade to continue.' : ' Consider upgrading for more capacity.'}
      </AlertDescription>
      {isAtLimit && (
        <Button size="sm" className="mt-2" onClick={() => window.location.href = '/pricing'}>
          Upgrade Plan
        </Button>
      )}
    </Alert>
  );
}

/**
 * Feature Lock Overlay
 * Overlays on locked features
 */
interface FeatureLockProps {
  message: string;
  onUpgrade?: () => void;
}

export function FeatureLock({ message, onUpgrade }: FeatureLockProps) {
  return (
    <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
      <div className="text-center p-6 max-w-sm">
        <Lock className="h-12 w-12 text-purple-600 mx-auto mb-3" />
        <h3 className="font-semibold text-lg mb-2">Premium Feature</h3>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        <Button 
          onClick={onUpgrade || (() => window.location.href = '/pricing')}
          className="bg-gradient-to-r from-purple-600 to-pink-600"
        >
          Upgrade to Unlock
        </Button>
      </div>
    </div>
  );
}
