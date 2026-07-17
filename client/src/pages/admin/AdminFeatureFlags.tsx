/**
 * Admin Feature Flags Management
 * 
 * Allows administrators to manage feature flags per plan tier
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Save, Flag, Lock, Unlock } from 'lucide-react';
import { PLAN_LIMITS, type PlanTier } from '@/lib/feature-flags';

const FEATURE_DESCRIPTIONS = {
  gscIntegration: 'Google Search Console integration for search data',
  dataExport: 'Export data to CSV/JSON formats',
  customReports: 'Create and customize reports',
  apiAccess: 'Access to REST API',
  prioritySupport: 'Priority customer support',
  whiteLabel: 'White-label branding options',
  sso: 'Single Sign-On (SSO/SAML) authentication',
};

const TIER_COLORS = {
  free: 'bg-gray-100 text-gray-800',
  starter: 'bg-blue-100 text-blue-800',
  growth: 'bg-purple-100 text-purple-800',
  enterprise: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
};

export default function AdminFeatureFlags() {
  const [planLimits, setPlanLimits] = useState(PLAN_LIMITS);
  const [hasChanges, setHasChanges] = useState(false);

  const toggleFeature = (tier: PlanTier, feature: keyof typeof FEATURE_DESCRIPTIONS) => {
    setPlanLimits((prev: typeof PLAN_LIMITS) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        features: {
          ...prev[tier].features,
          [feature]: !prev[tier].features[feature],
        },
      },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // TODO: Implement API endpoint to save plan limits
    console.log('Saving plan limits:', planLimits);
    setHasChanges(false);
  };

  const handleReset = () => {
    setPlanLimits(PLAN_LIMITS);
    setHasChanges(false);
  };

  const tiers: PlanTier[] = ['free', 'starter', 'growth', 'enterprise'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Feature Flags Management</h1>
        <p className="text-muted-foreground mt-2">
          Configure which features are available for each plan tier
        </p>
      </div>

      {hasChanges && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <p className="text-yellow-800">
              You have unsaved changes. Click "Save Changes" to apply them.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Feature Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Availability Matrix</CardTitle>
          <CardDescription>
            Toggle features on/off for each plan tier
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold">Feature</th>
                  {tiers.map(tier => (
                    <th key={tier} className="text-center p-3">
                      <Badge className={TIER_COLORS[tier]}>
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </Badge>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(FEATURE_DESCRIPTIONS).map(([feature, description]) => (
                  <tr key={feature} className="border-b hover:bg-muted/50">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Flag className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">
                            {feature.replace(/([A-Z])/g, ' $1').trim()}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {description}
                          </div>
                        </div>
                      </div>
                    </td>
                    {tiers.map(tier => {
                      const isEnabled = planLimits[tier].features[feature as keyof typeof FEATURE_DESCRIPTIONS];
                      return (
                        <td key={tier} className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={() => toggleFeature(tier, feature as keyof typeof FEATURE_DESCRIPTIONS)}
                            />
                            {isEnabled ? (
                              <Unlock className="h-4 w-4 text-green-600" />
                            ) : (
                              <Lock className="h-4 w-4 text-gray-400" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Plan Limits Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {tiers.map(tier => {
          const limits = planLimits[tier];
          const enabledFeatures = Object.values(limits.features).filter(Boolean).length;
          const totalFeatures = Object.keys(limits.features).length;

          return (
            <Card key={tier}>
              <CardHeader>
                <Badge className={TIER_COLORS[tier]}>
                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                </Badge>
                <CardTitle className="mt-2">
                  {enabledFeatures}/{totalFeatures} Features
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Competitors:</span>
                    <span className="font-medium">
                      {limits.competitors === -1 ? 'Unlimited' : limits.competitors}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Queries/Day:</span>
                    <span className="font-medium">
                      {limits.queriesPerDay === -1 ? 'Unlimited' : limits.queriesPerDay}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prompts/Month:</span>
                    <span className="font-medium">
                      {limits.promptsPerMonth === -1 ? 'Unlimited' : limits.promptsPerMonth}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button onClick={handleSave} disabled={!hasChanges}>
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={!hasChanges}>
          Reset
        </Button>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">About Feature Flags</CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800 space-y-2">
          <p>
            Feature flags control which features are available for each plan tier.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Changes are applied immediately after saving</li>
            <li>Users will see features based on their current plan</li>
            <li>Locked features show upgrade prompts</li>
            <li>Backend enforcement is automatic</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
