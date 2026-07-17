/**
 * Admin TTL Configuration Page
 * 
 * Allows administrators to configure TTL (Time To Live) settings
 * for different data types to optimize API costs and freshness.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Clock, Save, RefreshCw, AlertCircle } from 'lucide-react';

interface TTLConfig {
  dataType: string;
  ttlMs: number;
  description: string;
}

const DEFAULT_CONFIGS: TTLConfig[] = [
  {
    dataType: 'brandEnrichment',
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    description: 'Brand enrichment data from external APIs',
  },
  {
    dataType: 'llmSampling',
    ttlMs: 24 * 60 * 60 * 1000,
    description: 'LLM sampling results and responses',
  },
  {
    dataType: 'serpData',
    ttlMs: 12 * 60 * 60 * 1000,
    description: 'Search engine results page data',
  },
  {
    dataType: 'visibilityScore',
    ttlMs: 6 * 60 * 60 * 1000,
    description: 'Visibility score calculations',
  },
];

function formatDuration(ms: number): string {
  const hours = ms / (60 * 60 * 1000);
  if (hours < 24) {
    return `${hours} hours`;
  }
  const days = hours / 24;
  return `${days} days`;
}

function parseDuration(value: string, unit: 'hours' | 'days'): number {
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  
  if (unit === 'hours') {
    return num * 60 * 60 * 1000;
  }
  return num * 24 * 60 * 60 * 1000;
}

export default function AdminTTLConfig() {
  const queryClient = useQueryClient();
  const [configs, setConfigs] = useState<TTLConfig[]>(DEFAULT_CONFIGS);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch current TTL configs (placeholder - implement API endpoint)
  const { data: currentConfigs, isLoading } = useQuery({
    queryKey: ['ttl-configs'],
    queryFn: async () => {
      // TODO: Implement API endpoint
      // return api.getTTLConfigs();
      return DEFAULT_CONFIGS;
    },
  });

  // Save TTL configs mutation
  const saveMutation = useMutation({
    mutationFn: async (configs: TTLConfig[]) => {
      // TODO: Implement API endpoint
      // return api.saveTTLConfigs(configs);
      console.log('Saving TTL configs:', configs);
      return configs;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ttl-configs'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const handleSave = () => {
    saveMutation.mutate(configs);
  };

  const handleReset = () => {
    setConfigs(DEFAULT_CONFIGS);
  };

  const updateConfig = (dataType: string, ttlMs: number) => {
    setConfigs(prev => prev.map(config =>
      config.dataType === dataType ? { ...config, ttlMs } : config
    ));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">TTL Configuration</h1>
        <p className="text-muted-foreground mt-2">
          Configure Time-To-Live settings for different data types to optimize API costs and data freshness.
        </p>
      </div>

      {saveSuccess && (
        <Alert className="bg-green-50 border-green-200">
          <AlertCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            TTL configurations saved successfully!
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        {configs.map((config) => {
          const hours = config.ttlMs / (60 * 60 * 1000);
          const days = hours / 24;
          const isHours = hours < 24;
          const value = isHours ? hours : days;
          const unit = isHours ? 'hours' : 'days';

          return (
            <Card key={config.dataType}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <CardTitle className="capitalize">
                    {config.dataType.replace(/([A-Z])/g, ' $1').trim()}
                  </CardTitle>
                </div>
                <CardDescription>{config.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <Label htmlFor={`${config.dataType}-value`}>Duration</Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        id={`${config.dataType}-value`}
                        type="number"
                        min="0"
                        step="0.5"
                        value={value}
                        onChange={(e) => {
                          const newTtl = parseDuration(e.target.value, unit);
                          updateConfig(config.dataType, newTtl);
                        }}
                        className="w-32"
                      />
                      <select
                        value={unit}
                        onChange={(e) => {
                          const newUnit = e.target.value as 'hours' | 'days';
                          const newTtl = parseDuration(value.toString(), newUnit);
                          updateConfig(config.dataType, newTtl);
                        }}
                        className="px-3 py-2 border rounded-md"
                      >
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    = {formatDuration(config.ttlMs)}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-4">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
        <Button variant="outline" onClick={handleReset}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">About TTL Settings</CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800 space-y-2">
          <p>
            <strong>TTL (Time To Live)</strong> determines how long data is considered "fresh" before re-fetching from external APIs.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Higher TTL = Lower API costs, but potentially stale data</li>
            <li>Lower TTL = More up-to-date data, but higher API costs</li>
            <li>Recommended: Adjust based on data volatility and budget</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
