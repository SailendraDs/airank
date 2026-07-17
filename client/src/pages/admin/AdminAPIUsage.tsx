/**
 * Admin API Usage & Cost Tracking Dashboard
 * 
 * Displays API usage statistics, costs per provider, and trends
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { DollarSign, TrendingUp, Activity, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface APIUsageStats {
  provider: string;
  calls: number;
  cost: number;
  tokens: number;
}

interface DailyUsage {
  date: string;
  openai: number;
  anthropic: number;
  google: number;
  total: number;
}

export default function AdminAPIUsage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  // Fetch API usage data
  const { data: usageStats, isLoading } = useQuery({
    queryKey: ['api-usage', period],
    queryFn: async () => {
      // TODO: Implement API endpoint
      // Mock data for now
      const stats: APIUsageStats[] = [
        { provider: 'OpenAI', calls: 1250, cost: 45.30, tokens: 125000 },
        { provider: 'Anthropic', calls: 850, cost: 32.15, tokens: 95000 },
        { provider: 'Google', calls: 620, cost: 18.90, tokens: 75000 },
        { provider: 'Firecrawl', calls: 340, cost: 4.20, tokens: 0 },
        { provider: 'DataForSEO', calls: 180, cost: 8.75, tokens: 0 },
      ];
      return stats;
    },
  });

  // Fetch daily usage trends
  const { data: dailyUsage } = useQuery({
    queryKey: ['daily-usage', period],
    queryFn: async () => {
      // TODO: Implement API endpoint
      // Mock data
      const data: DailyUsage[] = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        data.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          openai: Math.random() * 50 + 20,
          anthropic: Math.random() * 40 + 15,
          google: Math.random() * 30 + 10,
          total: 0,
        });
      }
      data.forEach(d => d.total = d.openai + d.anthropic + d.google);
      return data;
    },
  });

  const totalCost = usageStats?.reduce((sum: number, stat: APIUsageStats) => sum + stat.cost, 0) || 0;
  const totalCalls = usageStats?.reduce((sum: number, stat: APIUsageStats) => sum + stat.calls, 0) || 0;
  const avgCostPerCall = totalCalls > 0 ? totalCost / totalCalls : 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">API Usage & Cost Tracking</h1>
        <p className="text-muted-foreground mt-2">
          Monitor API usage, costs, and trends across all providers
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total API Calls</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Across all providers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Cost/Call</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${avgCostPerCall.toFixed(4)}</div>
            <p className="text-xs text-muted-foreground">Per API call</p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Trend</CardTitle>
          <CardDescription>Daily API costs over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyUsage}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="openai" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" name="OpenAI" />
              <Area type="monotone" dataKey="anthropic" stackId="1" stroke="#3b82f6" fill="#3b82f6" name="Anthropic" />
              <Area type="monotone" dataKey="google" stackId="1" stroke="#10b981" fill="#10b981" name="Google" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Provider Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Cost by Provider</CardTitle>
          <CardDescription>Breakdown of costs per API provider</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={usageStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="provider" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="cost" fill="#8b5cf6" name="Cost ($)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detailed Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle>Provider Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Provider</th>
                  <th className="text-right p-2">API Calls</th>
                  <th className="text-right p-2">Tokens</th>
                  <th className="text-right p-2">Cost</th>
                  <th className="text-right p-2">Cost/Call</th>
                </tr>
              </thead>
              <tbody>
                {usageStats?.map((stat: APIUsageStats) => (
                  <tr key={stat.provider} className="border-b">
                    <td className="p-2 font-medium">{stat.provider}</td>
                    <td className="text-right p-2">{stat.calls.toLocaleString()}</td>
                    <td className="text-right p-2">{stat.tokens > 0 ? stat.tokens.toLocaleString() : '-'}</td>
                    <td className="text-right p-2">${stat.cost.toFixed(2)}</td>
                    <td className="text-right p-2">${(stat.cost / stat.calls).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Cost Alerts */}
      <Card className="border-yellow-200 bg-yellow-50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <CardTitle className="text-yellow-900">Cost Optimization Tips</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-yellow-800 space-y-2">
          <ul className="list-disc list-inside space-y-1">
            <li>Entity resolution is saving ~40-60% on API costs</li>
            <li>TTL enforcement prevents unnecessary re-fetching</li>
            <li>Consider adjusting TTL settings to balance freshness vs cost</li>
            <li>Monitor high-cost providers and optimize usage</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
