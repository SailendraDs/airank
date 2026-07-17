import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Plus, Save, Crown, Zap, Rocket, Building2, Check, X, Trash2 } from "lucide-react";
import type { PlanCapability } from "@shared/schema";

const LLM_PROVIDERS = ["chatgpt", "claude", "gemini", "perplexity", "google_ai_overview"];
const INTEGRATIONS = ["gsc", "twitter", "linkedin", "reddit", "youtube", "ga4"];

type PlanPayload = {
  id: string;
  name: string;
  displayName: string;
  monthlyPrice: number;
  maxCompetitors: number;
  maxTopics: number;
  maxPrompts: number;
  maxTeamMembers: number;
  dailyQueryLimit: number;
  refreshFrequency: string;
  allowedLlmProviders: string[];
  allowedIntegrations: string[];
  exportEnabled: boolean;
  apiAccessEnabled: boolean;
  whitelabelEnabled: boolean;
  prioritySupport: boolean;
  customBranding: boolean;
  ssoEnabled: boolean;
  auditLogsEnabled: boolean;
  isActive: boolean;
};

function normalizePlanPayload(data: Partial<PlanCapability>): Partial<PlanPayload> {
  const cleanName = (data.name || data.displayName || data.id || "").trim();
  return {
    id: (data.id || "").trim(),
    name: cleanName,
    displayName: (data.displayName || cleanName || "").trim(),
    monthlyPrice: Number(data.monthlyPrice ?? 0),
    maxCompetitors: Number(data.maxCompetitors ?? 0),
    maxTopics: Number(data.maxTopics ?? 0),
    maxPrompts: Number(data.maxPrompts ?? 0),
    maxTeamMembers: Number(data.maxTeamMembers ?? 0),
    dailyQueryLimit: Number(data.dailyQueryLimit ?? 0),
    refreshFrequency: data.refreshFrequency || "weekly",
    allowedLlmProviders: (data.allowedLlmProviders || []) as string[],
    allowedIntegrations: (data.allowedIntegrations || []) as string[],
    exportEnabled: Boolean(data.exportEnabled),
    apiAccessEnabled: Boolean(data.apiAccessEnabled),
    whitelabelEnabled: Boolean(data.whitelabelEnabled),
    prioritySupport: Boolean(data.prioritySupport),
    customBranding: Boolean(data.customBranding),
    ssoEnabled: Boolean(data.ssoEnabled),
    auditLogsEnabled: Boolean(data.auditLogsEnabled),
    isActive: data.isActive ?? true,
  };
}

async function fetchErrorMessage(res: Response, fallback: string) {
  try {
    const data = await res.json();
    return data?.message || fallback;
  } catch {
    return fallback;
  }
}

export default function AdminPlans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<PlanCapability | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: plans, isLoading } = useQuery<PlanCapability[]>({
    queryKey: ["/api/admin/plans"],
  });

  const createPlan = useMutation({
    mutationFn: async (data: Partial<PlanPayload>) => {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await fetchErrorMessage(res, "Failed to create plan"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      toast({ title: "Plan created successfully" });
      setIsCreateOpen(false);
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to create plan", variant: "destructive" });
    },
  });

  const updatePlan = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<PlanPayload> }) => {
      const res = await fetch(`/api/admin/plans/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data.updates),
      });
      if (!res.ok) throw new Error(await fetchErrorMessage(res, "Failed to update plan"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      toast({ title: "Plan updated successfully" });
      setIsDialogOpen(false);
      setEditingPlan(null);
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to update plan", variant: "destructive" });
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/plans/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await fetchErrorMessage(res, "Failed to delete plan"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/plans"] });
      toast({ title: "Plan deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete plan", variant: "destructive" });
    },
  });

  const getPlanIcon = (id: string) => {
    switch (id) {
      case "free": return <Zap className="h-5 w-5 text-slate-500" />;
      case "starter": return <Rocket className="h-5 w-5 text-blue-500" />;
      case "growth": return <Crown className="h-5 w-5 text-purple-500" />;
      case "enterprise": return <Building2 className="h-5 w-5 text-amber-500" />;
      default: return <Zap className="h-5 w-5" />;
    }
  };

  const formatLimit = (val: number) => val === -1 ? "Unlimited" : val.toString();

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="text-muted-foreground">Loading plans...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="page-title">Plans & Capabilities</h1>
          <p className="text-muted-foreground">Configure subscription tiers and feature limits without code deployment.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-plan-button">
              <Plus className="h-4 w-4 mr-2" />
              New Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Plan</DialogTitle>
            </DialogHeader>
            <PlanEditForm
              plan={{
                id: "",
                name: "",
                displayName: "",
                monthlyPrice: 0,
                maxCompetitors: 3,
                maxTopics: 3,
                maxPrompts: 6,
                maxTeamMembers: 1,
                dailyQueryLimit: 10,
                refreshFrequency: "weekly",
                allowedLlmProviders: ["chatgpt"],
                allowedIntegrations: [],
                exportEnabled: false,
                apiAccessEnabled: false,
                whitelabelEnabled: false,
                prioritySupport: false,
                customBranding: false,
                ssoEnabled: false,
                auditLogsEnabled: false,
                isActive: true,
              } as any}
              onSave={(data) => createPlan.mutate(normalizePlanPayload(data) as Partial<PlanPayload>)}
              isCreate
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {plans?.map(plan => (
          <Card key={plan.id} className={`relative ${plan.id === "enterprise" ? "border-amber-500/50 bg-amber-500/5" : ""}`} data-testid={`plan-card-${plan.id}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getPlanIcon(plan.id)}
                  <CardTitle className="text-lg">{plan.displayName}</CardTitle>
                </div>
                <div className="flex gap-1">
                  <Dialog open={isDialogOpen && editingPlan?.id === plan.id} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) setEditingPlan(null);
                  }}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => setEditingPlan(plan)} data-testid={`edit-plan-${plan.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Edit {editingPlan?.displayName} Plan</DialogTitle>
                      </DialogHeader>
                      {editingPlan && (
                        <PlanEditForm
                          plan={editingPlan}
                          onSave={(updates) => updatePlan.mutate({ id: editingPlan.id, updates: normalizePlanPayload(updates) as Partial<PlanPayload> })}
                        />
                      )}
                    </DialogContent>
                  </Dialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive" data-testid={`delete-plan-${plan.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {plan.displayName} Plan?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove this plan and its capabilities. Users on this plan may lose access to features.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deletePlan.mutate(plan.id)} data-testid={`confirm-delete-plan-${plan.id}`}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <div className="text-2xl font-bold font-mono">
                ${plan.monthlyPrice}<span className="text-sm font-normal text-muted-foreground">/mo</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Competitors</span>
                <span className="font-mono">{formatLimit(plan.maxCompetitors)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Topics</span>
                <span className="font-mono">{formatLimit(plan.maxTopics)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prompts</span>
                <span className="font-mono">{formatLimit(plan.maxPrompts)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Team Members</span>
                <span className="font-mono">{formatLimit(plan.maxTeamMembers)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Daily Queries</span>
                <span className="font-mono">{formatLimit(plan.dailyQueryLimit || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Refresh</span>
                <span className="capitalize">{plan.refreshFrequency}</span>
              </div>
              <div className="pt-2 border-t flex flex-wrap gap-1">
                {plan.exportEnabled && <Badge variant="secondary" className="text-xs">Export</Badge>}
                {plan.apiAccessEnabled && <Badge variant="secondary" className="text-xs">API</Badge>}
                {plan.ssoEnabled && <Badge variant="secondary" className="text-xs">SSO</Badge>}
                {plan.auditLogsEnabled && <Badge variant="secondary" className="text-xs">Audit</Badge>}
                {plan.whitelabelEnabled && <Badge variant="secondary" className="text-xs">Whitelabel</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Capability Comparison</CardTitle>
          <CardDescription>Full feature matrix across all plans.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Feature</TableHead>
                {plans?.map(p => <TableHead key={p.id} className="text-center">{p.displayName}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Max Competitors</TableCell>
                {plans?.map(p => <TableCell key={p.id} className="text-center font-mono">{formatLimit(p.maxCompetitors)}</TableCell>)}
              </TableRow>
              <TableRow>
                <TableCell>Max Topics</TableCell>
                {plans?.map(p => <TableCell key={p.id} className="text-center font-mono">{formatLimit(p.maxTopics)}</TableCell>)}
              </TableRow>
              <TableRow>
                <TableCell>Max Prompts</TableCell>
                {plans?.map(p => <TableCell key={p.id} className="text-center font-mono">{formatLimit(p.maxPrompts)}</TableCell>)}
              </TableRow>
              <TableRow>
                <TableCell>Team Members</TableCell>
                {plans?.map(p => <TableCell key={p.id} className="text-center font-mono">{formatLimit(p.maxTeamMembers)}</TableCell>)}
              </TableRow>
              <TableRow>
                <TableCell>LLM Providers</TableCell>
                {plans?.map(p => <TableCell key={p.id} className="text-center">{p.allowedLlmProviders?.length || 0}</TableCell>)}
              </TableRow>
              <TableRow>
                <TableCell>Integrations</TableCell>
                {plans?.map(p => <TableCell key={p.id} className="text-center">{p.allowedIntegrations?.length || 0}</TableCell>)}
              </TableRow>
              <TableRow>
                <TableCell>Export</TableCell>
                {plans?.map(p => <TableCell key={p.id} className="text-center">{p.exportEnabled ? <Check className="inline h-4 w-4 text-green-500" /> : <X className="inline h-4 w-4 text-muted-foreground" />}</TableCell>)}
              </TableRow>
              <TableRow>
                <TableCell>API Access</TableCell>
                {plans?.map(p => <TableCell key={p.id} className="text-center">{p.apiAccessEnabled ? <Check className="inline h-4 w-4 text-green-500" /> : <X className="inline h-4 w-4 text-muted-foreground" />}</TableCell>)}
              </TableRow>
              <TableRow>
                <TableCell>SSO</TableCell>
                {plans?.map(p => <TableCell key={p.id} className="text-center">{p.ssoEnabled ? <Check className="inline h-4 w-4 text-green-500" /> : <X className="inline h-4 w-4 text-muted-foreground" />}</TableCell>)}
              </TableRow>
              <TableRow>
                <TableCell>Audit Logs</TableCell>
                {plans?.map(p => <TableCell key={p.id} className="text-center">{p.auditLogsEnabled ? <Check className="inline h-4 w-4 text-green-500" /> : <X className="inline h-4 w-4 text-muted-foreground" />}</TableCell>)}
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}

function PlanEditForm({ plan, onSave, isCreate }: { plan: PlanCapability; onSave: (updates: Partial<PlanCapability>) => void; isCreate?: boolean }) {
  const [formData, setFormData] = useState({ ...plan });

  const handleArrayToggle = (field: "allowedLlmProviders" | "allowedIntegrations", value: string) => {
    const current = formData[field] || [];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    setFormData({ ...formData, [field]: updated });
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="limits">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="limits">Limits</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
        </TabsList>

        <TabsContent value="limits" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Plan ID (unique slug)</Label>
              <Input
                value={formData.id}
                disabled={!isCreate}
                onChange={(e) => setFormData({ ...formData, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                placeholder="custom_plan"
                data-testid="input-plan-id"
              />
            </div>
            <div>
              <Label>Display Name</Label>
              <Input
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="Custom Plan"
                data-testid="input-display-name"
              />
            </div>
            <div className="col-span-2">
              <Label>Plan Name (internal)</Label>
              <Input
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="custom_plan_name"
                data-testid="input-plan-name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Monthly Price ($)</Label>
              <Input
                type="number"
                value={formData.monthlyPrice}
                onChange={(e) => setFormData({ ...formData, monthlyPrice: parseInt(e.target.value) || 0 })}
                data-testid="input-monthly-price"
              />
            </div>
            <div>
              <Label>Daily Query Limit (-1 = unlimited)</Label>
              <Input
                type="number"
                value={formData.dailyQueryLimit || 0}
                onChange={(e) => setFormData({ ...formData, dailyQueryLimit: parseInt(e.target.value) || 0 })}
                data-testid="input-daily-query-limit"
              />
            </div>
            <div>
              <Label>Max Competitors (-1 = unlimited)</Label>
              <Input
                type="number"
                value={formData.maxCompetitors}
                onChange={(e) => setFormData({ ...formData, maxCompetitors: parseInt(e.target.value) || 0 })}
                data-testid="input-max-competitors"
              />
            </div>
            <div>
              <Label>Max Topics (-1 = unlimited)</Label>
              <Input
                type="number"
                value={formData.maxTopics}
                onChange={(e) => setFormData({ ...formData, maxTopics: parseInt(e.target.value) || 0 })}
                data-testid="input-max-topics"
              />
            </div>
            <div>
              <Label>Max Prompts (-1 = unlimited)</Label>
              <Input
                type="number"
                value={formData.maxPrompts}
                onChange={(e) => setFormData({ ...formData, maxPrompts: parseInt(e.target.value) || 0 })}
                data-testid="input-max-prompts"
              />
            </div>
            <div>
              <Label>Max Team Members (-1 = unlimited)</Label>
              <Input
                type="number"
                value={formData.maxTeamMembers}
                onChange={(e) => setFormData({ ...formData, maxTeamMembers: parseInt(e.target.value) || 0 })}
                data-testid="input-max-team"
              />
            </div>
          </div>
          <div>
            <Label>Refresh Frequency</Label>
            <Select
              value={formData.refreshFrequency}
              onValueChange={(value) => setFormData({ ...formData, refreshFrequency: value })}
            >
              <SelectTrigger data-testid="select-refresh-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TabsContent>

        <TabsContent value="providers" className="space-y-4 pt-4">
          <div>
            <Label className="mb-3 block">Allowed LLM Providers</Label>
            <div className="grid grid-cols-2 gap-2">
              {LLM_PROVIDERS.map(provider => (
                <div key={provider} className="flex items-center space-x-2">
                  <Switch
                    checked={formData.allowedLlmProviders?.includes(provider) || false}
                    onCheckedChange={() => handleArrayToggle("allowedLlmProviders", provider)}
                    data-testid={`toggle-provider-${provider}`}
                  />
                  <Label className="capitalize">{provider.replace("_", " ")}</Label>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-3 block">Allowed Integrations</Label>
            <div className="grid grid-cols-2 gap-2">
              {INTEGRATIONS.map(integration => (
                <div key={integration} className="flex items-center space-x-2">
                  <Switch
                    checked={formData.allowedIntegrations?.includes(integration) || false}
                    onCheckedChange={() => handleArrayToggle("allowedIntegrations", integration)}
                    data-testid={`toggle-integration-${integration}`}
                  />
                  <Label className="uppercase text-xs">{integration}</Label>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="features" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "exportEnabled", label: "Export Enabled" },
              { key: "apiAccessEnabled", label: "API Access" },
              { key: "whitelabelEnabled", label: "White Label" },
              { key: "prioritySupport", label: "Priority Support" },
              { key: "customBranding", label: "Custom Branding" },
              { key: "ssoEnabled", label: "SSO Enabled" },
              { key: "auditLogsEnabled", label: "Audit Logs" },
              { key: "agentReadinessPartialEnabled", label: "Agent Readiness (partial)" },
              { key: "agentReadinessFullEnabled", label: "Agent Readiness (full report)" },
              { key: "isActive", label: "Plan Active" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center space-x-2">
                <Switch
                  checked={(formData as any)[key] || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, [key]: checked })}
                  data-testid={`toggle-${key}`}
                />
                <Label>{label}</Label>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button onClick={() => onSave(formData)} data-testid="save-plan-button">
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
