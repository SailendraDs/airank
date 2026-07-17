import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Shield, Bell, Save, Loader2, CreditCard, Key, Mail, Globe, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Eye, EyeOff, FileText, Image as ImageIcon, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/layout/AdminLayout";

interface SettingsMap {
  [key: string]: string;
}

const ENV_CATEGORIES: Record<string, string> = {
  core: "Core",
  llm: "LLM Providers",
  payments: "Payments",
  integrations: "Integrations",
  oauth: "OAuth",
  email: "Email / SMTP",
};

interface EnvVar {
  key: string;
  category: string;
  required: boolean;
  configured: boolean;
  status?: "connected" | "failed";
  statusLabel?: string;
  statusMessage?: string;
  maskedValue: string | null;
  value: string | null;
  source?: string;
}

const KNOWN_KEY_SETTINGS = [
  { key: "openai_api_key", label: "OpenAI API Key", category: "LLM Providers" },
  { key: "anthropic_api_key", label: "Anthropic API Key", category: "LLM Providers" },
  { key: "google_api_key", label: "Google API Key", category: "LLM Providers" },
  { key: "google_ai_api_key", label: "Google AI API Key", category: "LLM Providers" },
  { key: "perplexity_api_key", label: "Perplexity API Key", category: "LLM Providers" },
  { key: "grok_api_key", label: "Grok / xAI API Key", category: "LLM Providers" },
  { key: "deepseek_api_key", label: "DeepSeek API Key", category: "LLM Providers" },
  { key: "openrouter_api_key", label: "OpenRouter API Key", category: "LLM Providers" },
  { key: "firecrawl_api_key", label: "Firecrawl API Key", category: "Integrations" },
  { key: "google_kg_api_key", label: "Google Knowledge Graph API Key", category: "Integrations" },
  { key: "serpapi_api_key", label: "SerpAPI Key", category: "Integrations" },
  { key: "dataforseo_key", label: "DataForSEO Key", category: "Integrations" },
  { key: "social_api_key", label: "Social API Key", category: "Integrations" },
  { key: "twitter_bearer_token", label: "Twitter/X Bearer Token", category: "Social" },
  { key: "linkedin_access_token", label: "LinkedIn Access Token", category: "Social" },
  { key: "youtube_api_key", label: "YouTube API Key", category: "Social" },
  { key: "meta_page_token", label: "Meta/Facebook Page Token", category: "Social" },
  { key: "google_client_id", label: "Google OAuth Client ID", category: "OAuth" },
  { key: "google_client_secret", label: "Google OAuth Client Secret", category: "OAuth" },
  { key: "google_oauth_client_id", label: "Google OAuth Client ID Alias", category: "OAuth" },
  { key: "google_oauth_client_secret", label: "Google OAuth Client Secret Alias", category: "OAuth" },
  { key: "smtp_pass", label: "SMTP Password", category: "Email / SMTP" },
  { key: "ses_smtp_pass", label: "SES SMTP Password", category: "Email / SMTP" },
  { key: "aws_access_key_id", label: "AWS Access Key ID", category: "Publishing" },
  { key: "aws_secret_access_key", label: "AWS Secret Access Key", category: "Publishing" },
];

function isKeyLikeSetting(key: string) {
  return /(api_key|key$|token|secret|password|pass$|client_id|access_key)/i.test(key);
}

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<SettingsMap>({
    queryKey: ["/api/admin/settings"],
  });

  const { data: envVars, isLoading: envLoading, refetch: refetchEnv } = useQuery<EnvVar[]>({
    queryKey: ["/api/admin/env-status"],
  });

  const [formData, setFormData] = useState<SettingsMap>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [showEnvValues, setShowEnvValues] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [modelConfig, setModelConfig] = useState<{ simple: string; medium: string; complex: string }>({
    simple: '',
    medium: '',
    complex: '',
  });

  useEffect(() => {
    if (settings) {
      setFormData(settings);
      setHasChanges(false);
    }
  }, [settings]);

  // Fetch available models from OpenRouter
  const { refetch: refetchModels, isLoading: modelsLoading } = useQuery({
    queryKey: ["/api/admin/openrouter/models"],
    enabled: false,
    queryFn: async () => {
      const res = await fetch("/api/admin/openrouter/models", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch models");
      const data = await res.json();
      setAvailableModels(data.data || data.models || []);
      return data;
    },
  });

  // Fetch current model config
  useQuery({
    queryKey: ["/api/admin/openrouter/model-config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/openrouter/model-config", {
        credentials: "include",
      });
      if (res.ok) {
        const config = await res.json();
        setModelConfig({
          simple: config.simple || '',
          medium: config.medium || '',
          complex: config.complex || '',
        });
      }
      return res.json();
    },
  });

  // Save model config mutation
  const saveModelConfigMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/openrouter/model-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(modelConfig),
      });
      if (!res.ok) throw new Error("Failed to save model config");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Model configuration saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/openrouter/model-config"] });
    },
    onError: () => {
      toast({ title: "Failed to save model configuration", variant: "destructive" });
    },
  });

  const saveModelConfig = () => {
    saveModelConfigMutation.mutate();
  };

  const updateSettings = useMutation({
    mutationFn: async (data: SettingsMap) => {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/env-status"] });
      toast({ title: "Settings saved successfully" });
      setHasChanges(false);
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const uploadBrandingAssets = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {};
      if (logoFile) {
        payload.logoDataUrl = await fileToDataUrl(logoFile);
      }
      if (faviconFile) {
        payload.faviconDataUrl = await fileToDataUrl(faviconFile);
      }
      if (!payload.logoDataUrl && !payload.faviconDataUrl) {
        throw new Error("Please choose a logo and/or favicon PNG file first");
      }

      const res = await fetch("/api/admin/settings/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to upload branding assets");
      }

      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/site-branding"] });
      setLogoFile(null);
      setFaviconFile(null);
      setFormData((prev) => ({
        ...prev,
        site_logo_url: result.logoUrl || prev.site_logo_url || "/logo.png",
        site_favicon_url: result.faviconUrl || prev.site_favicon_url || "/favicon.png",
        site_asset_version: String(result.assetVersion || prev.site_asset_version || Date.now()),
      }));
      toast({ title: "Branding assets updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to upload branding assets",
        description: error?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const updateField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const toggleField = (key: string) => {
    const current = formData[key] === "true";
    updateField(key, (!current).toString());
  };

  const handleSave = () => {
    updateSettings.mutate(formData);
  };

  const siteAssetVersion = formData["site_asset_version"] || "20260322";
  const siteLogoPreview = `${formData["site_logo_url"] || "/logo.png"}?v=${encodeURIComponent(siteAssetVersion)}`;
  const siteFaviconPreview = `${formData["site_favicon_url"] || "/favicon.png"}?v=${encodeURIComponent(siteAssetVersion)}`;

  const missingRequired = envVars?.filter(v => v.required && !v.configured) ?? [];
  const envStatusBySettingKey = new Map((envVars || []).map((v) => [v.key.toLowerCase(), v]));
  const knownKeys = new Set(KNOWN_KEY_SETTINGS.map((item) => item.key));
  const dynamicKeySettings = Object.keys(formData)
    .filter((key) => isKeyLikeSetting(key) && !knownKeys.has(key))
    .sort()
    .map((key) => ({ key, label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), category: "Other Keys" }));
  const keySettings = [...KNOWN_KEY_SETTINGS, ...dynamicKeySettings];

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-settings-title">Admin Settings</h1>
            <p className="text-muted-foreground">Manage security and system configurations.</p>
          </div>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateSettings.isPending}
            data-testid="button-save-settings"
          >
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Settings
          </Button>
        </div>

        <div className="grid gap-6">
          {/* ===== ENVIRONMENT VARIABLES CARD ===== */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" />Environment Variables</CardTitle>
                <CardDescription>Live status of all environment variables. Values are masked by default and can be revealed for admins.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowEnvValues((prev) => !prev)}>
                  {showEnvValues ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                  {showEnvValues ? "Hide Values" : "Show Values"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => refetchEnv()} disabled={envLoading}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${envLoading ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {missingRequired.length > 0 && (
                <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-600">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Missing required: {missingRequired.map(v => v.key).join(", ")}
                </div>
              )}
              {envLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!envLoading && Object.entries(ENV_CATEGORIES).map(([cat, label]) => {
                const vars = envVars?.filter(v => v.category === cat) ?? [];
                if (vars.length === 0) return null;
                return (
                  <div key={cat} className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
                    <div className="space-y-1">
                      {vars.map(v => (
                        <div key={v.key} className="flex items-center justify-between py-1.5 border-b last:border-0">
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{v.key}</code>
                            {v.required && <Badge variant="outline" className="text-xs">required</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            {(showEnvValues ? v.value : v.maskedValue) && (
                              <span className="text-xs text-muted-foreground max-w-[560px] break-all font-mono" title={showEnvValues ? (v.value ?? "") : (v.maskedValue ?? "")}>
                                {showEnvValues ? v.value : v.maskedValue}
                              </span>
                            )}
                            {v.configured
                              ? <Badge className="bg-emerald-500 text-white text-xs" title={v.statusMessage || ""}><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>
                              : <Badge variant="destructive" className="text-xs" title={v.statusMessage || ""}><XCircle className="h-3 w-3 mr-1" />Failed</Badge>}
                            {v.source && v.source !== "none" && <Badge variant="outline" className="text-xs">{v.source}</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* ===== EDITABLE KEY MANAGER ===== */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Editable Keys
              </CardTitle>
              <CardDescription>
                Admin-only full-value editor for production keys. Environment variables take precedence at runtime; database values here are used as fallbacks and are updated immediately after save.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {Object.entries(
                keySettings.reduce<Record<string, typeof keySettings>>((groups, item) => {
                  groups[item.category] = groups[item.category] || [];
                  groups[item.category].push(item);
                  return groups;
                }, {})
              ).map(([category, items]) => (
                <div key={category} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{category}</p>
                  <div className="space-y-2">
                    {items.map((item) => {
                      const envStatus = envStatusBySettingKey.get(item.key);
                      const hasDbValue = Boolean(formData[item.key]);
                      const connected = Boolean(envStatus?.configured || hasDbValue);
                      const source = envStatus?.source && envStatus.source !== "none"
                        ? envStatus.source
                        : hasDbValue ? "db" : "none";

                      return (
                        <div key={item.key} className="grid gap-2 rounded-md border p-3 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-center">
                          <div className="min-w-0">
                            <Label className="text-sm">{item.label}</Label>
                            <code className="mt-1 block text-[11px] text-muted-foreground">{item.key}</code>
                          </div>
                          <Input
                            type="text"
                            value={formData[item.key] || ""}
                            onChange={(e) => updateField(item.key, e.target.value)}
                            placeholder="Paste full key or leave blank"
                            className="font-mono text-xs"
                            data-testid={`input-key-manager-${item.key}`}
                          />
                          <div className="flex items-center gap-2 md:justify-end">
                            {connected
                              ? <Badge className="bg-emerald-500 text-white text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>
                              : <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>}
                            <Badge variant="outline" className="text-xs">{source}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ===== SECURITY CARD ===== */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security
              </CardTitle>
              <CardDescription>Configure authentication and security policies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="space-y-0.5">
                  <Label htmlFor="maintenance-mode" className="text-base">Maintenance Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Blocks home, signup, login and all non-admin access with a maintenance page
                  </p>
                </div>
                <Switch
                  id="maintenance-mode"
                  checked={formData["maintenance_mode"] === "true"}
                  onCheckedChange={() => toggleField("maintenance_mode")}
                  data-testid="switch-maintenance-mode"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="space-y-0.5">
                  <Label htmlFor="require-2fa" className="text-base">Require 2FA for Admins</Label>
                  <p className="text-sm text-muted-foreground">
                    Admin login will require email OTP verification
                  </p>
                </div>
                <Switch
                  id="require-2fa"
                  checked={formData["require_admin_2fa"] === "true"}
                  onCheckedChange={() => toggleField("require_admin_2fa")}
                  data-testid="switch-require-2fa"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="space-y-0.5">
                  <Label className="text-base">Session Timeout (minutes)</Label>
                  <p className="text-sm text-muted-foreground">
                    Auto-logout after inactivity
                  </p>
                </div>
                <Input
                  type="number"
                  className="w-24"
                  value={formData["session_timeout_minutes"] || "30"}
                  onChange={(e) => updateField("session_timeout_minutes", e.target.value)}
                  data-testid="input-session-timeout"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="space-y-0.5">
                  <Label className="text-base">Max Login Attempts</Label>
                  <p className="text-sm text-muted-foreground">
                    Lock account after this many failed attempts
                  </p>
                </div>
                <Input
                  type="number"
                  className="w-24"
                  value={formData["max_login_attempts"] || "5"}
                  onChange={(e) => updateField("max_login_attempts", e.target.value)}
                  data-testid="input-max-login-attempts"
                />
              </div>
            </CardContent>
          </Card>

          {/* ===== RAZORPAY CARD ===== */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Razorpay Configuration
              </CardTitle>
              <CardDescription>Payment gateway credentials (stored securely)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Razorpay Key ID</Label>
                <Input
                  value={formData["razorpay_key_id"] || ""}
                  onChange={(e) => updateField("razorpay_key_id", e.target.value)}
                  placeholder="rzp_live_..."
                  data-testid="input-razorpay-key-id"
                />
              </div>
              <div className="space-y-2">
                <Label>Razorpay Key Secret</Label>
                <Input
                  type="password"
                  value={formData["razorpay_key_secret"] || ""}
                  onChange={(e) => updateField("razorpay_key_secret", e.target.value)}
                  placeholder="Enter secret..."
                  data-testid="input-razorpay-key-secret"
                />
              </div>
              <div className="space-y-2">
                <Label>Webhook Secret</Label>
                <Input
                  type="password"
                  value={formData["razorpay_webhook_secret"] || ""}
                  onChange={(e) => updateField("razorpay_webhook_secret", e.target.value)}
                  placeholder="Enter webhook secret..."
                  data-testid="input-razorpay-webhook-secret"
                />
              </div>
            </CardContent>
          </Card>

          {/* ===== SITE BRANDING CARD ===== */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Site Branding Assets
              </CardTitle>
              <CardDescription>
                Upload PNG logo and favicon used across landing/auth/invoice pages. Changes are applied immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Current Site Logo</Label>
                  <div className="h-16 border rounded-md bg-muted/20 flex items-center justify-center overflow-hidden">
                    <img src={siteLogoPreview} alt="Site logo" className="h-12 w-auto object-contain" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Current Favicon</Label>
                  <div className="h-16 border rounded-md bg-muted/20 flex items-center justify-center overflow-hidden">
                    <img src={siteFaviconPreview} alt="Site favicon" className="h-10 w-10 object-contain" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="site-logo-file">Upload Logo (PNG)</Label>
                  <Input
                    id="site-logo-file"
                    type="file"
                    accept="image/png"
                    onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                    data-testid="input-site-logo-file"
                  />
                  {logoFile && <p className="text-xs text-muted-foreground">Selected: {logoFile.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="site-favicon-file">Upload Favicon (PNG)</Label>
                  <Input
                    id="site-favicon-file"
                    type="file"
                    accept="image/png"
                    onChange={(e) => setFaviconFile(e.target.files?.[0] || null)}
                    data-testid="input-site-favicon-file"
                  />
                  {faviconFile && <p className="text-xs text-muted-foreground">Selected: {faviconFile.name}</p>}
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => uploadBrandingAssets.mutate()}
                disabled={uploadBrandingAssets.isPending || (!logoFile && !faviconFile)}
                data-testid="button-upload-branding-assets"
              >
                {uploadBrandingAssets.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload Branding Assets
              </Button>
            </CardContent>
          </Card>

          {/* ===== INVOICE BRANDING CARD ===== */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice Branding
              </CardTitle>
              <CardDescription>Configure invoice company details and GST visibility</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between pt-1 border-b pb-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Enable GST Line Item</Label>
                  <p className="text-sm text-muted-foreground">Show GST row and add GST to total</p>
                </div>
                <Switch
                  checked={formData["invoice_gst_enabled"] === "true"}
                  onCheckedChange={() => toggleField("invoice_gst_enabled")}
                  data-testid="switch-invoice-gst-enabled"
                />
              </div>

              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input value={formData["invoice_company_name"] || ""} onChange={(e) => updateField("invoice_company_name", e.target.value)} placeholder="AIRank" />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={formData["invoice_company_address"] || ""} onChange={(e) => updateField("invoice_company_address", e.target.value)} placeholder="123 Tech Park, Electronic City" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={formData["invoice_company_city"] || ""} onChange={(e) => updateField("invoice_company_city", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input value={formData["invoice_company_state"] || ""} onChange={(e) => updateField("invoice_company_state", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Pincode</Label>
                  <Input value={formData["invoice_company_zip"] || ""} onChange={(e) => updateField("invoice_company_zip", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input value={formData["invoice_company_country"] || ""} onChange={(e) => updateField("invoice_company_country", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Billing Email</Label>
                  <Input value={formData["invoice_company_email"] || ""} onChange={(e) => updateField("invoice_company_email", e.target.value)} placeholder="billing@airank.io" />
                </div>
                <div className="space-y-2">
                  <Label>Billing Phone</Label>
                  <Input value={formData["invoice_company_phone"] || ""} onChange={(e) => updateField("invoice_company_phone", e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>GST Number</Label>
                <Input value={formData["invoice_company_gst"] || ""} onChange={(e) => updateField("invoice_company_gst", e.target.value)} placeholder="Optional" />
              </div>
            </CardContent>
          </Card>

          {/* ===== INTEGRATIONS CARD ===== */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Integrations Configuration
              </CardTitle>
              <CardDescription>API keys for enrichment and SERP integrations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Firecrawl API Key</Label>
                <Input
                  type="password"
                  value={formData["firecrawl_api_key"] || ""}
                  onChange={(e) => updateField("firecrawl_api_key", e.target.value)}
                  placeholder="fc-..."
                  data-testid="input-firecrawl-api-key"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="firecrawl-enabled" className="text-base">Enable Firecrawl Brand Enrichment</Label>
                  <p className="text-sm text-muted-foreground">
                    Used for onboarding brand lookup and competitor discovery (scrape + search).
                  </p>
                </div>
                <Switch
                  id="firecrawl-enabled"
                  checked={formData["firecrawl_enabled"] !== "false"}
                  onCheckedChange={(checked) => updateField("firecrawl_enabled", checked ? "true" : "false")}
                  data-testid="switch-firecrawl-enabled"
                />
              </div>
              <div className="space-y-2">
                <Label>Brand Enrichment LLM Model (OpenRouter)</Label>
                <Input
                  value={formData["brand_enrichment_llm_model"] || "google/gemini-2.5-flash-lite"}
                  onChange={(e) => updateField("brand_enrichment_llm_model", e.target.value)}
                  placeholder="google/gemini-2.5-flash-lite"
                  data-testid="input-brand-enrichment-llm-model"
                />
                <p className="text-xs text-muted-foreground">
                  Structures Firecrawl markdown into brand fields. Requires OpenRouter API key.
                </p>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Google Knowledge Graph API Key</Label>
                <Input
                  type="password"
                  value={formData["google_kg_api_key"] || ""}
                  onChange={(e) => updateField("google_kg_api_key", e.target.value)}
                  placeholder="AIza..."
                  data-testid="input-google-kg-api-key"
                />
              </div>
              <div className="space-y-2">
                <Label>SerpAPI Key</Label>
                <Input
                  type="password"
                  value={formData["serpapi_api_key"] || ""}
                  onChange={(e) => updateField("serpapi_api_key", e.target.value)}
                  placeholder="serpapi_..."
                  data-testid="input-serpapi-api-key"
                />
              </div>
              <div className="space-y-2">
                <Label>DataForSEO Key</Label>
                <Input
                  type="password"
                  value={formData["dataforseo_key"] || ""}
                  onChange={(e) => updateField("dataforseo_key", e.target.value)}
                  placeholder="login:password"
                  data-testid="input-dataforseo-key"
                />
              </div>
              <div className="space-y-2">
                <Label>Social API Key (Legacy)</Label>
                <Input
                  type="password"
                  value={formData["social_api_key"] || ""}
                  onChange={(e) => updateField("social_api_key", e.target.value)}
                  placeholder="optional..."
                  data-testid="input-social-api-key"
                />
              </div>
              <Separator />
              <div className="space-y-1 pt-2">
                <p className="text-sm font-medium">Social Platform Keys</p>
                <p className="text-xs text-muted-foreground">Configure individual social platform API keys for brand monitoring.</p>
              </div>
              <div className="space-y-2">
                <Label>Twitter/X Bearer Token</Label>
                <Input
                  type="password"
                  value={formData["twitter_bearer_token"] || ""}
                  onChange={(e) => updateField("twitter_bearer_token", e.target.value)}
                  placeholder="Twitter API v2 Bearer Token"
                />
              </div>
              <div className="space-y-2">
                <Label>LinkedIn Access Token</Label>
                <Input
                  type="password"
                  value={formData["linkedin_access_token"] || ""}
                  onChange={(e) => updateField("linkedin_access_token", e.target.value)}
                  placeholder="LinkedIn API Access Token"
                />
              </div>
              <div className="space-y-2">
                <Label>YouTube API Key</Label>
                <Input
                  type="password"
                  value={formData["youtube_api_key"] || ""}
                  onChange={(e) => updateField("youtube_api_key", e.target.value)}
                  placeholder="YouTube Data API v3 Key"
                />
              </div>
              <div className="space-y-2">
                <Label>Meta/Facebook Page Token</Label>
                <Input
                  type="password"
                  value={formData["meta_page_token"] || ""}
                  onChange={(e) => updateField("meta_page_token", e.target.value)}
                  placeholder="Meta Graph API Page Access Token"
                />
              </div>
              <Separator />
              <div className="space-y-1 pt-2">
                <p className="text-sm font-medium">AXP Publishing (S3 / CDN)</p>
                <p className="text-xs text-muted-foreground">Optional — if configured, AXP pages will be published to S3 instead of local filesystem.</p>
              </div>
              <div className="space-y-2">
                <Label>AWS S3 Bucket</Label>
                <Input
                  value={formData["aws_s3_bucket"] || ""}
                  onChange={(e) => updateField("aws_s3_bucket", e.target.value)}
                  placeholder="my-axp-bucket"
                  data-testid="input-aws-s3-bucket"
                />
              </div>
              <div className="space-y-2">
                <Label>AWS Access Key ID</Label>
                <Input
                  type="password"
                  value={formData["aws_access_key_id"] || ""}
                  onChange={(e) => updateField("aws_access_key_id", e.target.value)}
                  placeholder="AKIA..."
                  data-testid="input-aws-access-key-id"
                />
              </div>
              <div className="space-y-2">
                <Label>AWS Secret Access Key</Label>
                <Input
                  type="password"
                  value={formData["aws_secret_access_key"] || ""}
                  onChange={(e) => updateField("aws_secret_access_key", e.target.value)}
                  placeholder="secret..."
                  data-testid="input-aws-secret-access-key"
                />
              </div>
              <div className="space-y-2">
                <Label>AWS Region</Label>
                <Input
                  value={formData["aws_region"] || ""}
                  onChange={(e) => updateField("aws_region", e.target.value)}
                  placeholder="us-east-1"
                  data-testid="input-aws-region"
                />
              </div>
              <div className="space-y-2">
                <Label>AXP CDN Domain</Label>
                <Input
                  value={formData["axp_cdn_domain"] || ""}
                  onChange={(e) => updateField("axp_cdn_domain", e.target.value)}
                  placeholder="axp.example.com"
                  data-testid="input-axp-cdn-domain"
                />
              </div>
            </CardContent>
          </Card>

          {/* ===== LLM API KEYS CARD ===== */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                LLM API Keys
              </CardTitle>
              <CardDescription>
                These values are stored in the database as system settings. The server reads API keys from environment variables first, then falls back to these settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>OpenAI Key</Label>
                <Input
                  type="password"
                  value={formData["openai_api_key"] || ""}
                  onChange={(e) => updateField("openai_api_key", e.target.value)}
                  placeholder="sk-..."
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Anthropic Key</Label>
                <Input
                  type="password"
                  value={formData["anthropic_api_key"] || ""}
                  onChange={(e) => updateField("anthropic_api_key", e.target.value)}
                  placeholder="sk-ant-..."
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Google API Key</Label>
                <Input
                  type="password"
                  value={formData["google_api_key"] || ""}
                  onChange={(e) => updateField("google_api_key", e.target.value)}
                  placeholder="AIza..."
                  data-testid="input-google-api-key"
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Google AI Key</Label>
                <Input
                  type="password"
                  value={formData["google_ai_api_key"] || ""}
                  onChange={(e) => updateField("google_ai_api_key", e.target.value)}
                  placeholder="AIza..."
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Perplexity Key</Label>
                <Input
                  type="password"
                  value={formData["perplexity_api_key"] || ""}
                  onChange={(e) => updateField("perplexity_api_key", e.target.value)}
                  placeholder="pplx-..."
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Grok Key</Label>
                <Input
                  type="password"
                  value={formData["grok_api_key"] || ""}
                  onChange={(e) => updateField("grok_api_key", e.target.value)}
                  placeholder="xai-..."
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>DeepSeek Key</Label>
                <Input
                  type="password"
                  value={formData["deepseek_api_key"] || ""}
                  onChange={(e) => updateField("deepseek_api_key", e.target.value)}
                  placeholder="sk-..."
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>OpenRouter Key</Label>
                <Input
                  type="password"
                  value={formData["openrouter_api_key"] || ""}
                  onChange={(e) => updateField("openrouter_api_key", e.target.value)}
                  placeholder="sk-or-..."
                />
              </div>
            </CardContent>
          </Card>

          {/* ===== OPENROUTER MODEL CONFIGURATION CARD ===== */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                OpenRouter Model Selection
              </CardTitle>
              <CardDescription>
                Configure which models to use for different task complexities. Fetch available models from OpenRouter first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div className="space-y-0.5">
                  <p className="text-sm text-muted-foreground">
                    Click to load latest models from OpenRouter
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchModels()}
                  disabled={modelsLoading}
                >
                  {modelsLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Fetch Models
                </Button>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="model-simple">Simple Tasks</Label>
                  <select
                    id="model-simple"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={modelConfig.simple}
                    onChange={(e) => setModelConfig(prev => ({ ...prev, simple: e.target.value }))}
                    disabled={availableModels.length === 0}
                  >
                    <option value="">Select model...</option>
                    {availableModels
                      .filter(m => m.id.includes('qwen') || m.id.includes('llama') || m.id.includes('mistral'))
                      .sort((a, b) => a.id.localeCompare(b.id))
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id} {m.pricing?.prompt ? `($${(m.pricing.prompt * 1e6).toFixed(4)}/1M)` : ''}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Tagging, classification, sentiment, keyword extraction
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model-medium">Medium Tasks</Label>
                  <select
                    id="model-medium"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={modelConfig.medium}
                    onChange={(e) => setModelConfig(prev => ({ ...prev, medium: e.target.value }))}
                    disabled={availableModels.length === 0}
                  >
                    <option value="">Select model...</option>
                    {availableModels
                      .filter(m => m.id.includes('qwen-2.5-32') || m.id.includes('claude-3-haiku') || m.id.includes('llama-3.1-70'))
                      .sort((a, b) => a.id.localeCompare(b.id))
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id} {m.pricing?.prompt ? `($${(m.pricing.prompt * 1e6).toFixed(4)}/1M)` : ''}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Summarization, translation, content rewriting
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model-complex">Complex Tasks</Label>
                  <select
                    id="model-complex"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={modelConfig.complex}
                    onChange={(e) => setModelConfig(prev => ({ ...prev, complex: e.target.value }))}
                    disabled={availableModels.length === 0}
                  >
                    <option value="">Select model...</option>
                    {availableModels
                      .filter(m => m.id.includes('gpt-4') || m.id.includes('claude-3') || m.id.includes('llama-3.1-405'))
                      .sort((a, b) => a.id.localeCompare(b.id))
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id} {m.pricing?.prompt ? `($${(m.pricing.prompt * 1e6).toFixed(4)}/1M)` : ''}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Deep analysis, strategy, creative generation
                  </p>
                </div>
              </div>

              {(modelConfig.simple || modelConfig.medium || modelConfig.complex) && (
                <Button
                  onClick={() => saveModelConfig()}
                  disabled={saveModelConfigMutation.isPending}
                  className="mt-4"
                >
                  {saveModelConfigMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Model Configuration
                </Button>
              )}

              {availableModels.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Click "Fetch Models" to load available OpenRouter models
                </p>
              )}
            </CardContent>
          </Card>

          {/* ===== EMAIL / SMTP CARD ===== */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Configuration
              </CardTitle>
              <CardDescription>Configure email provider and credentials for transactional emails</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email Provider</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData["email_provider"] || "smtp"}
                  onChange={(e) => updateField("email_provider", e.target.value)}
                >
                  <option value="smtp">SMTP (Generic / Gmail)</option>
                  <option value="ses">AWS SES (via SES SMTP)</option>
                </select>
              </div>

              {(formData["email_provider"] || "smtp") === "ses" ? (
                <>
                  <div className="rounded-md bg-sky-50 border border-sky-200 p-3 text-xs text-sky-800">
                    <strong>AWS SES SMTP Setup:</strong> Use your SES SMTP credentials (not your AWS IAM access key). Go to AWS SES → SMTP Settings → Create SMTP Credentials.
                  </div>
                  <div className="space-y-2">
                    <Label>SES SMTP Host</Label>
                    <Input
                      value={formData["ses_smtp_host"] || ""}
                      onChange={(e) => updateField("ses_smtp_host", e.target.value)}
                      placeholder="email-smtp.ap-south-1.amazonaws.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SES SMTP Port</Label>
                    <Input
                      type="number"
                      value={formData["ses_smtp_port"] || "587"}
                      onChange={(e) => updateField("ses_smtp_port", e.target.value)}
                      placeholder="587"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SES SMTP Username</Label>
                    <Input
                      value={formData["ses_smtp_user"] || ""}
                      onChange={(e) => updateField("ses_smtp_user", e.target.value)}
                      placeholder="AKIAIOSFODNN7EXAMPLE"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SES SMTP Password</Label>
                    <Input
                      type="password"
                      value={formData["ses_smtp_pass"] || ""}
                      onChange={(e) => updateField("ses_smtp_pass", e.target.value)}
                      placeholder="Enter SES SMTP password..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>From Address (verified SES identity)</Label>
                    <Input
                      value={formData["ses_from_email"] || ""}
                      onChange={(e) => updateField("ses_from_email", e.target.value)}
                      placeholder="noreply@airank.io"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>SMTP Host</Label>
                    <Input
                      value={formData["smtp_host"] || ""}
                      onChange={(e) => updateField("smtp_host", e.target.value)}
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SMTP Port</Label>
                    <Input
                      type="number"
                      value={formData["smtp_port"] || "587"}
                      onChange={(e) => updateField("smtp_port", e.target.value)}
                      placeholder="587"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SMTP User</Label>
                    <Input
                      value={formData["smtp_user"] || ""}
                      onChange={(e) => updateField("smtp_user", e.target.value)}
                      placeholder="user@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SMTP Password</Label>
                    <Input
                      type="password"
                      value={formData["smtp_pass"] || ""}
                      onChange={(e) => updateField("smtp_pass", e.target.value)}
                      placeholder="Enter password..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>From Address</Label>
                    <Input
                      value={formData["smtp_from"] || ""}
                      onChange={(e) => updateField("smtp_from", e.target.value)}
                      placeholder="noreply@airank.io"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ===== OAUTH / GOOGLE CARD ===== */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                OAuth / Google
              </CardTitle>
              <CardDescription>Google OAuth credentials for social login</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between pt-1 border-b pb-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Enable Google Login</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow users to sign in/sign up with Google OAuth
                  </p>
                </div>
                <Switch
                  checked={formData["google_login_enabled"] !== "false"}
                  onCheckedChange={() => toggleField("google_login_enabled")}
                  data-testid="switch-google-login-enabled"
                />
              </div>

              <div className="space-y-2">
                <Label>Google Client ID</Label>
                <Input
                  value={formData["google_client_id"] || ""}
                  onChange={(e) => updateField("google_client_id", e.target.value)}
                  placeholder="123456789-abc.apps.googleusercontent.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Google Client Secret</Label>
                <Input
                  type="password"
                  value={formData["google_client_secret"] || ""}
                  onChange={(e) => updateField("google_client_secret", e.target.value)}
                  placeholder="GOCSPX-..."
                />
              </div>
              <div className="space-y-2">
                <Label>Callback URL</Label>
                <Input
                  value={formData["google_callback_url"] || ""}
                  onChange={(e) => updateField("google_callback_url", e.target.value)}
                  placeholder="https://yourdomain.com/api/auth/google/callback"
                />
              </div>
            </CardContent>
          </Card>

          {/* ===== NOTIFICATIONS CARD ===== */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
              <CardDescription>Configure system alerts and notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Security Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified of suspicious activities
                  </p>
                </div>
                <Switch
                  checked={formData["notify_security_alerts"] !== "false"}
                  onCheckedChange={() => toggleField("notify_security_alerts")}
                  data-testid="switch-security-alerts"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="space-y-0.5">
                  <Label className="text-base">System Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications about system maintenance
                  </p>
                </div>
                <Switch
                  checked={formData["notify_system_updates"] !== "false"}
                  onCheckedChange={() => toggleField("notify_system_updates")}
                  data-testid="switch-system-updates"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="space-y-0.5">
                  <Label className="text-base">New User Signups</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when new users register
                  </p>
                </div>
                <Switch
                  checked={formData["notify_new_signups"] === "true"}
                  onCheckedChange={() => toggleField("notify_new_signups")}
                  data-testid="switch-new-signups"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
