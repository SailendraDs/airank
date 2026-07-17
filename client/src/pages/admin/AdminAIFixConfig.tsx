// client/src/pages/admin/AdminAIFixConfig.tsx

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Sparkles } from 'lucide-react';

const JOB_TYPES = [
  'brand_enrichment',
  'competitor_enrichment',
  'topic_generation',
  'query_generation',
  'llm_sampling',
  'serp_sampling',
  'citation_extraction',
  'visibility_scoring',
  'gap_analysis',
  'recommendation_generation',
  'axp_publish',
  'serp_analysis',
  'knowledge_graph_analysis',
  'social_analytics',
  'content_recommendations',
  'kg_enrichment',
  'prompt_mining',
];

export default function AdminAIFixConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['/api/admin/ai-fix/config'],
    queryFn: async () => {
      const res = await fetch('/api/admin/ai-fix/config', { credentials: 'include' });
      return res.json();
    },
  });

  const { data: rules, isLoading: rulesLoading } = useQuery({
    queryKey: ['/api/admin/jobs/rules'],
    queryFn: async () => {
      const res = await fetch('/api/admin/jobs/rules', { credentials: 'include' });
      return res.json();
    },
  });

  const [formData, setFormData] = useState({
    enabled: false,
    fixMethod: 'api',
    cliPath: '/usr/local/bin/claude',
    apiUrl: 'https://api.anthropic.com',
    apiKey: '',
    model: 'claude-opus-4.6',
    timeoutMinutes: 5,
  });

  useEffect(() => {
    if (config) {
      setFormData({
        enabled: config.enabled || false,
        fixMethod: config.fixMethod || 'api',
        cliPath: config.cliPath || '/usr/local/bin/claude',
        apiUrl: config.apiUrl || 'https://api.anthropic.com',
        apiKey: config.apiKey || '',
        model: config.model || 'claude-opus-4.6',
        timeoutMinutes: config.timeoutMinutes || 5,
      });
    }
  }, [config]);

  const updateConfig = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch('/api/admin/ai-fix/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ai-fix/config'] });
      toast({ title: 'Configuration saved' });
    },
    onError: () => {
      toast({ title: 'Failed to save configuration', variant: 'destructive' });
    },
  });

  const updateRule = async (jobType: string, updates: any) => {
    await fetch('/api/admin/jobs/rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ jobType, ...updates }),
    });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/jobs/rules'] });
  };

  if (configLoading || rulesLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">AI Fix Configuration</h1>
          <p className="text-muted-foreground">
            Configure AI-powered auto-fix for failed jobs using Claude Code
          </p>
        </div>

        {/* Main Config */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              <CardTitle>AI Fix Settings</CardTitle>
            </div>
            <CardDescription>
              Configure how failed jobs are automatically fixed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable AI Fix</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically fix failed jobs using Claude
                </p>
              </div>
              <Switch
                checked={formData.enabled}
                onCheckedChange={checked => {
                  const newData = { ...formData, enabled: checked };
                  setFormData(newData);
                  updateConfig.mutate(newData);
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label>Fix Method</Label>
                <Select
                  value={formData.fixMethod}
                  onValueChange={value => {
                    const newData = { ...formData, fixMethod: value };
                    setFormData(newData);
                    updateConfig.mutate(newData);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="api">API (Recommended)</SelectItem>
                    <SelectItem value="cli">CLI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Model</Label>
                <Input
                  value={formData.model}
                  onChange={e => setFormData({ ...formData, model: e.target.value })}
                  onBlur={() => updateConfig.mutate(formData)}
                  placeholder="claude-opus-4.6"
                />
              </div>

              <div>
                <Label>API URL</Label>
                <Input
                  value={formData.apiUrl}
                  onChange={e => setFormData({ ...formData, apiUrl: e.target.value })}
                  onBlur={() => updateConfig.mutate(formData)}
                  placeholder="https://api.anthropic.com"
                />
              </div>

              <div>
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={formData.apiKey}
                  onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
                  onBlur={() => updateConfig.mutate(formData)}
                  placeholder="sk-ant-..."
                />
              </div>

              <div>
                <Label>CLI Path</Label>
                <Input
                  value={formData.cliPath}
                  onChange={e => setFormData({ ...formData, cliPath: e.target.value })}
                  onBlur={() => updateConfig.mutate(formData)}
                  placeholder="/usr/local/bin/claude"
                />
              </div>

              <div>
                <Label>Timeout (minutes)</Label>
                <Input
                  type="number"
                  value={formData.timeoutMinutes}
                  onChange={e => setFormData({ ...formData, timeoutMinutes: parseInt(e.target.value) || 5 })}
                  onBlur={() => updateConfig.mutate(formData)}
                  min={1}
                  max={30}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fix Rules */}
        <Card>
          <CardHeader>
            <CardTitle>Fix Rules by Job Type</CardTitle>
            <CardDescription>
              Configure auto-fix behavior per job type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Job Type</th>
                    <th className="text-center p-3 font-medium">Auto-Fix</th>
                    <th className="text-center p-3 font-medium">Method</th>
                    <th className="text-center p-3 font-medium">Notify Email</th>
                    <th className="text-center p-3 font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {JOB_TYPES.map(jobType => {
                    const rule = rules?.find((r: any) => r.jobType === jobType);
                    return (
                      <tr key={jobType} className="border-b last:border-0">
                        <td className="p-3 font-mono text-sm">{jobType}</td>
                        <td className="p-3 text-center">
                          <Switch
                            checked={rule?.autoFix || false}
                            onCheckedChange={checked => updateRule(jobType, { autoFix: checked })}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <Select
                            value={rule?.fixMethod || 'api'}
                            onValueChange={value => updateRule(jobType, { fixMethod: value })}
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="api">API</SelectItem>
                              <SelectItem value="cli">CLI</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3 text-center">
                          <Switch
                            checked={rule?.notifyEmail ?? true}
                            onCheckedChange={checked => updateRule(jobType, { notifyEmail: checked })}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <Input
                            type="number"
                            className="w-16 mx-auto"
                            value={rule?.priority || 5}
                            onChange={e => updateRule(jobType, { priority: parseInt(e.target.value) || 5 })}
                            min={1}
                            max={10}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
