import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  Building2, Users, CreditCard, Clock, Settings as SettingsIcon,
  Mail, Shield, UserPlus, Trash2, Crown, Check, AlertCircle,
  Calendar, RefreshCw, Zap, Key, Smartphone, Monitor, Globe,
  Pencil, X, Lock, Eye, EyeOff, ChevronRight, Loader2, Play,
  Target, MessageSquare, Bot, Package
} from "lucide-react";
import { PLAN_LIMITS } from "@/lib/data-model";
import { cn } from "@/lib/utils";
import { useBrandJobs } from "@/hooks/use-jobs";
import { useTriggerEnrichment } from "@/hooks/use-brand-context";
import { useCurrentBrand } from "@/hooks/use-brand";
import { useAuth } from "@/lib/auth-context";

type BillingPlan = {
  id: string;
  name: string;
  displayName: string;
  monthlyPrice: number;
  maxCompetitors: number;
  maxTopics: number;
  maxPrompts: number;
  promptLimits?: number; // Alias for maxPrompts
  maxTeamMembers: number;
  refreshFrequency: string;
  allowedIntegrations: string[];
  allowedLlmProviders: string[];
  exportEnabled: boolean;
  apiAccessEnabled: boolean;
  prioritySupport: boolean;
  ssoEnabled: boolean;
  isActive: boolean;
};

const DEFAULT_PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "free",
    displayName: "Free",
    monthlyPrice: 0,
    maxCompetitors: 3,
    maxTopics: 3,
    maxPrompts: 6,
    maxTeamMembers: 1,
    refreshFrequency: "monthly",
    allowedIntegrations: [],
    allowedLlmProviders: [],
    exportEnabled: false,
    apiAccessEnabled: false,
    prioritySupport: false,
    ssoEnabled: false,
    isActive: true,
  },
];

export default function Settings() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("organization");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ old: "", new: "", confirm: "" });
  const [showPassword, setShowPassword] = useState({ old: false, new: false, confirm: false });
  const [otpCode, setOtpCode] = useState("");
  const [editMode, setEditMode] = useState(false);

  // Fetch current brand from database
  const { brand, brandId, isLoading: brandLoading } = useCurrentBrand();

  const { data: addonOffersData } = useQuery({
    queryKey: ["/api/brands", brandId, "addon-offers"],
    queryFn: () => api.getBrandAddonOffers(brandId!),
    enabled: Boolean(brandId) && activeTab === "billing",
  });

  // Fetch billing data
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [availablePlans, setAvailablePlans] = useState<BillingPlan[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [enrichmentTriggered, setEnrichmentTriggered] = useState(false);

  // Active devices/sessions
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTempPassword, setInviteTempPassword] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");

  useEffect(() => {
    let cancelled = false;
    const fetchPlans = async () => {
      try {
        const response = await fetch("/api/plans", { credentials: "include" });
        if (!response.ok) return;
        const plans = await response.json();
        if (!Array.isArray(plans) || cancelled) return;

        const normalized: BillingPlan[] = plans
          .filter((p: any) => p?.id)
          .map((p: any) => ({
            id: String(p.id),
            name: String(p.name || p.displayName || p.id),
            displayName: String(p.displayName || p.name || p.id),
            monthlyPrice: Number(p.monthlyPrice ?? 0),
            maxCompetitors: Number(p.maxCompetitors ?? 0),
            maxTopics: Number(p.maxTopics ?? 0),
            maxPrompts: Number(p.maxPrompts ?? 0),
            maxTeamMembers: Number(p.maxTeamMembers ?? 1),
            refreshFrequency: String(p.refreshFrequency || "weekly"),
            allowedIntegrations: Array.isArray(p.allowedIntegrations) ? p.allowedIntegrations : [],
            allowedLlmProviders: Array.isArray(p.allowedLlmProviders) ? p.allowedLlmProviders : [],
            exportEnabled: Boolean(p.exportEnabled),
            apiAccessEnabled: Boolean(p.apiAccessEnabled),
            prioritySupport: Boolean(p.prioritySupport),
            ssoEnabled: Boolean(p.ssoEnabled),
            isActive: p.isActive !== false,
          }))
          .filter((p) => p.isActive)
          .sort((a, b) => a.monthlyPrice - b.monthlyPrice);

        setAvailablePlans(normalized);
      } catch (error) {
        console.error("Failed to load plans:", error);
      }
    };

    fetchPlans();
    return () => {
      cancelled = true;
    };
  }, []);

  // Trigger brand enrichment if fields are missing
  useEffect(() => {
    if (brand && brandId && !enrichmentTriggered) {
      const needsEnrichment = !brand.industry || !brand.description || !brand.logo ||
                              !brand.city || !brand.state || !brand.country;

      if (needsEnrichment) {
        setEnrichmentTriggered(true);
        fetch(`/api/brands/${brandId}/enrich`, {
          method: 'POST',
          credentials: 'include',
        })
          .then(r => r.json())
          .then(data => {
            if (data.fieldsUpdated && data.fieldsUpdated.length > 0) {
              console.log('Brand enriched with fields:', data.fieldsUpdated);
              // Refresh the page to show updated data
              window.location.reload();
            }
          })
          .catch(err => console.error('Enrichment failed:', err));
      }
    }
  }, [brand, brandId, enrichmentTriggered]);

  useEffect(() => {
    if (brandId && activeTab === "billing") {
      fetchBillingData();
    }
  }, [brandId, activeTab]);

  useEffect(() => {
    if (activeTab === "organization") {
      fetchActiveSessions();
    }
    if (activeTab === "team" && brandId) {
      fetchTeamMembers();
    }
  }, [activeTab, brandId]);

  const fetchActiveSessions = async () => {
    setSessionsLoading(true);
    try {
      const response = await fetch("/api/sessions", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setActiveSessions(data);
      }
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    } finally {
      setSessionsLoading(false);
    }
  };

  const fetchTeamMembers = async () => {
    if (!brandId) return;
    setTeamLoading(true);
    try {
      const response = await fetch(`/api/brands/${brandId}/team`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setTeamMembers(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Failed to fetch team members:", error);
    } finally {
      setTeamLoading(false);
    }
  };

  const handleInviteTeamMember = async () => {
    if (!brandId || !inviteEmail.trim()) return;
    try {
      const res = await fetch(`/api/brands/${brandId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          tempPassword: inviteTempPassword.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Failed to invite member");
        return;
      }
      setInviteEmail("");
      setInviteTempPassword("");
      setInviteRole("viewer");
      await fetchTeamMembers();
    } catch (err: any) {
      alert(err?.message || "Failed to invite member");
    }
  };

  const handleUpdateTeamMember = async (memberId: string, updates: any) => {
    try {
      const res = await fetch(`/api/team/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Failed to update member");
        return;
      }
      await fetchTeamMembers();
    } catch (err: any) {
      alert(err?.message || "Failed to update member");
    }
  };

  const handleRemoveTeamMember = async (memberId: string) => {
    try {
      const res = await fetch(`/api/team/${memberId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Failed to remove member");
        return;
      }
      await fetchTeamMembers();
    } catch (err: any) {
      alert(err?.message || "Failed to remove member");
    }
  };

  const handleRevokeSession = async (sessionToken: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionToken}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.ok) {
        // Refresh sessions list
        await fetchActiveSessions();
      } else {
        const error = await response.json();
        console.error('Failed to revoke session:', error.message);
      }
    } catch (error) {
      console.error('Failed to revoke session:', error);
    }
  };

  const fetchBillingData = async () => {
    if (!brandId) return;
    setBillingLoading(true);
    try {
      const [subData, usageData, invoicesData] = await Promise.all([
        fetch(`/api/brands/${brandId}/subscription`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/brands/${brandId}/usage`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/brands/${brandId}/invoices?limit=10`, { credentials: 'include' }).then(r => r.json()),
      ]);
      setSubscription(subData);
      setUsage(usageData);
      setInvoices(invoicesData);
    } catch (error) {
      console.error('Failed to fetch billing data:', error);
    } finally {
      setBillingLoading(false);
    }
  };

  const plansForBilling = availablePlans.length > 0 ? availablePlans : DEFAULT_PLANS;
  const currentPlanId =
    subscription?.internal?.status === "active"
      ? (subscription?.internal?.planId || brand?.tier || "free")
      : (brand?.tier || "free");
  const currentPlan = plansForBilling.find((p) => p.id === currentPlanId) || plansForBilling[0];
  const planTierKey = (brand?.tier as keyof typeof PLAN_LIMITS) || "free";
  // Use availablePlans (from API) instead of hardcoded PLAN_LIMITS
  const dbPlan = availablePlans.find(p => p.id === planTierKey);
  const planCaps = dbPlan ?? {
    id: planTierKey,
    name: planTierKey,
    displayName: planTierKey.charAt(0).toUpperCase() + planTierKey.slice(1),
    monthlyPrice: planTierKey === 'free' ? 0 : planTierKey === 'starter' ? 499 : 1000,
    maxCompetitors: PLAN_LIMITS[planTierKey as keyof typeof PLAN_LIMITS]?.maxCompetitors || 3,
    maxTopics: PLAN_LIMITS[planTierKey as keyof typeof PLAN_LIMITS]?.maxTopics || 3,
    maxPrompts: PLAN_LIMITS[planTierKey as keyof typeof PLAN_LIMITS]?.maxQueries || 6,
    promptLimits: PLAN_LIMITS[planTierKey as keyof typeof PLAN_LIMITS]?.maxQueries || 6,
    maxTeamMembers: PLAN_LIMITS[planTierKey as keyof typeof PLAN_LIMITS]?.maxTeamMembers || 1,
    refreshFrequency: (PLAN_LIMITS[planTierKey as keyof typeof PLAN_LIMITS] as any)?.refreshFrequency || 'weekly',
    allowedIntegrations: [] as string[],
    allowedLlmProviders: [] as string[],
    exportEnabled: false,
    apiAccessEnabled: false,
    prioritySupport: false,
    ssoEnabled: false,
    isActive: true,
  } as BillingPlan;

  const formatPlanPrice = (price: number) => {
    if (price <= 0) return "Free";
    return `₹${price.toLocaleString("en-IN")}`;
  };

  const formatPlanLimit = (limit: number) => {
    if (limit === -1 || limit >= 9999) return "Unlimited";
    return `${limit}`;
  };

  const getPlanFeatures = (plan: BillingPlan) => {
    const features = [
      `${formatPlanLimit(plan.maxCompetitors)} competitors`,
      `${formatPlanLimit(plan.maxTopics)} topics`,
      `${formatPlanLimit(plan.maxPrompts)} prompts`,
      `${formatPlanLimit(plan.maxTeamMembers)} team members`,
      `${plan.refreshFrequency} refresh`,
      `${plan.allowedLlmProviders.length} AI providers`,
      `${plan.allowedIntegrations.length} integrations`,
    ];
    if (plan.exportEnabled) features.push("Data exports");
    if (plan.apiAccessEnabled) features.push("API access");
    if (plan.prioritySupport) features.push("Priority support");
    if (plan.ssoEnabled) features.push("SSO");
    return features;
  };

  // Job tracking
  const { data: brandJobs, isLoading: jobsLoading } = useBrandJobs(brandId || "");
  const { mutate: triggerEnrichment, isPending: isTriggering } = useTriggerEnrichment(brandId || "");
  const latestJob = brandJobs?.[0];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const openUpgrade = params.get('upgrade');
    
    if (tab && ['organization', 'team', 'billing', 'schedule'].includes(tab)) {
      setActiveTab(tab);
    }
    if (openUpgrade === 'true' || tab === 'billing') {
      setTimeout(() => setShowUpgradeModal(true), 100);
    }
  }, [location]);

  const handlePasswordChange = () => {
    if (passwordForm.new !== passwordForm.confirm) {
      alert("Passwords do not match");
      return;
    }
    setShowPasswordModal(false);
    setShowOtpModal(true);
  };

  const handleOtpVerify = () => {
    setShowOtpModal(false);
    setOtpCode("");
    setPasswordForm({ old: "", new: "", confirm: "" });
  };

  const [paymentLoading, setPaymentLoading] = useState(false);

  const ensureRazorpayLoaded = async (): Promise<boolean> => {
    const w = window as any;
    if (w.Razorpay) return true;

    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]') as HTMLScriptElement | null;
    if (existing) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return Boolean((window as any).Razorpay);
    }

    return await new Promise<boolean>((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(Boolean((window as any).Razorpay));
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const getCheckoutContact = async (): Promise<string> => {
    let rawPhone = String((user as any)?.phone || "").trim();
    if (!rawPhone) {
      try {
        const res = await fetch("/api/users/me", { credentials: "include" });
        if (res.ok) {
          const profile = await res.json();
          rawPhone = String(profile?.phone || "").trim();
        }
      } catch {}
    }

    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length === 10) return `91${digits}`;
    if (digits.length >= 11 && digits.length <= 15) return digits;
    return "";
  };

  const handleRazorpayPayment = async (plan: BillingPlan) => {
    if (!brandId || !brand) return;

    if (plan.id === "free") {
      if (brand.tier !== "free") {
        try {
          setPaymentLoading(true);
          const res = await fetch(`/api/brands/${brandId}/subscription/cancel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ immediate: false, reason: "Downgraded to free" }),
          });
          if (res.ok) {
            setShowUpgradeModal(false);
            window.location.reload();
          } else {
            const err = await res.json();
            alert(err.message || "Failed to downgrade");
          }
        } catch (e: any) {
          alert(e.message || "Failed to downgrade");
        } finally {
          setPaymentLoading(false);
        }
      }
      return;
    }

    const existingSub = subscription?.internal;
    const hasActiveSub = existingSub && existingSub.status === "active" && existingSub.razorpaySubscriptionId && existingSub.razorpaySubscriptionId !== "free_plan";

    try {
      setPaymentLoading(true);

      if (hasActiveSub) {
        const res = await fetch(`/api/brands/${brandId}/subscription/change-plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ newPlanId: plan.id, immediate: true }),
        });
        if (res.ok) {
          setShowUpgradeModal(false);
          window.location.reload();
        } else {
          const err = await res.json();
          alert(err.message || "Failed to change plan");
        }
        return;
      }

      const res = await fetch(`/api/brands/${brandId}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          planId: plan.id,
          email: user?.email || (brand.domain ? `billing@${brand.domain}` : undefined),
          startTrial: false,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.message || "Failed to create subscription");
        return;
      }

      const data = await res.json();

      if (data.razorpaySubscriptionId) {
        const ready = await ensureRazorpayLoaded();
        const win = window as any;
        if (!ready || !win.Razorpay) {
          alert("Payment gateway failed to load. Please disable ad blocker and try again.");
          return;
        }

        const checkoutContact = await getCheckoutContact();
        setShowUpgradeModal(false);

        const rzp = new win.Razorpay({
          key: data.razorpayKeyId,
          subscription_id: data.razorpaySubscriptionId,
          name: "AIRank",
          description: `${plan.displayName} Plan Subscription`,
          prefill: {
            name: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || brand?.name || "",
            email: user?.email || "",
            contact: checkoutContact || undefined,
          },
          readonly: {
            name: false,
            email: false,
            contact: false,
          },
          handler: async function(response: any) {
            try {
              await fetch(`/api/brands/${brandId}/subscription/sync`, {
                method: "POST",
                credentials: "include",
              });
            } catch {}
            setShowUpgradeModal(false);
            window.location.reload();
          },
          theme: { color: "#6366f1" },
          modal: {
            ondismiss: () => setPaymentLoading(false),
          },
        });
        setTimeout(() => rzp.open(), 50);
        return;
      }

      setShowUpgradeModal(false);
      window.location.reload();
    } catch (e: any) {
      alert(e.message || "Payment failed");
    } finally {
      setPaymentLoading(false);
    }
  };

  const UpgradeModal = () => (
    <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="modal-upgrade">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Crown className="h-6 w-6 text-amber-500" />
            Choose Your Plan
          </DialogTitle>
          <DialogDescription>
            Select the plan that best fits your needs. Upgrade or downgrade anytime.
          </DialogDescription>
        </DialogHeader>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 py-4">
          {plansForBilling.map(plan => (
            <Card 
              key={plan.id} 
              className={cn(
                "relative transition-all hover:shadow-lg",
                plan.id === currentPlanId && "ring-2 ring-primary",
                plan.id === "growth" && "border-primary"
              )}
              data-testid={`plan-card-${plan.id}`}
            >
              {plan.id === "growth" && (
                <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">Most Popular</Badge>
              )}
              {plan.id === currentPlanId && (
                <Badge variant="secondary" className="absolute -top-2 right-2">Current</Badge>
              )}
              <CardHeader className="pb-2 pt-6">
                <CardTitle className="text-lg">{plan.displayName}</CardTitle>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-3xl font-bold">{formatPlanPrice(plan.monthlyPrice)}</span>
                  <span className="text-muted-foreground text-sm">/month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  {getPlanFeatures(plan).map(f => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={plan.id === currentPlanId ? "outline" : plan.id === "growth" ? "default" : "outline"}
                  disabled={plan.id === currentPlanId || paymentLoading}
                  onClick={() => handleRazorpayPayment(plan)}
                  data-testid={`btn-select-${plan.id}`}
                >
                  {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {plan.id === currentPlanId ? "Current Plan" : plan.monthlyPrice === 0 ? "Downgrade" : "Upgrade"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground border-t pt-4">
          <Shield className="h-4 w-4" />
          <span>Secure payment powered by Razorpay. Cancel anytime.</span>
        </div>
      </DialogContent>
    </Dialog>
  );

  const PasswordChangeModal = () => (
    <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
      <DialogContent
        className="max-w-md"
        data-testid="modal-password"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Reset Password
          </DialogTitle>
          <DialogDescription>
            Enter your current password and choose a new one.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); handlePasswordChange(); }} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="old-password">Old Password</Label>
            <div className="relative">
              <Input
                id="old-password"
                type={showPassword.old ? "text" : "password"}
                value={passwordForm.old}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, old: e.target.value }))}
                placeholder="Enter current password"
                data-testid="input-old-password"
                autoComplete="current-password"
                autoFocus={false}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full hover:bg-transparent"
                onClick={(e) => { e.preventDefault(); setShowPassword(prev => ({ ...prev, old: !prev.old })); }}
                tabIndex={-1}
              >
                {showPassword.old ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword.new ? "text" : "password"}
                value={passwordForm.new}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, new: e.target.value }))}
                placeholder="Enter new password"
                data-testid="input-new-password"
                autoComplete="new-password"
                autoFocus={false}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full hover:bg-transparent"
                onClick={(e) => { e.preventDefault(); setShowPassword(prev => ({ ...prev, new: !prev.new })); }}
                tabIndex={-1}
              >
                {showPassword.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showPassword.confirm ? "text" : "password"}
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))}
                placeholder="Confirm new password"
                data-testid="input-confirm-password"
                autoComplete="new-password"
                autoFocus={false}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full hover:bg-transparent"
                onClick={(e) => { e.preventDefault(); setShowPassword(prev => ({ ...prev, confirm: !prev.confirm })); }}
                tabIndex={-1}
              >
                {showPassword.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setShowPasswordModal(false)}>Cancel</Button>
          <Button type="button" onClick={handlePasswordChange} data-testid="btn-submit-password">Save & Verify</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const OtpVerificationModal = () => (
    <Dialog open={showOtpModal} onOpenChange={setShowOtpModal}>
      <DialogContent
        className="max-w-sm"
        data-testid="modal-otp"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Verify OTP
          </DialogTitle>
          <DialogDescription>
            We've sent a verification code to your registered phone number. Please enter it below.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (otpCode.length === 6) handleOtpVerify(); }} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="otp-input">Enter OTP Code</Label>
            <Input
              id="otp-input"
              type="text"
              value={otpCode}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                setOtpCode(value);
              }}
              placeholder="Enter 6-digit code"
              maxLength={6}
              className="text-center text-2xl tracking-[0.5em] font-mono"
              data-testid="input-otp"
              inputMode="numeric"
              pattern="[0-9]*"
              autoFocus={false}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Didn't receive the code? <Button type="button" variant="link" className="p-0 h-auto text-xs">Resend OTP</Button>
          </p>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setShowOtpModal(false)}>Cancel</Button>
          <Button type="button" onClick={handleOtpVerify} disabled={otpCode.length !== 6} data-testid="btn-verify-otp">
            Verify & Update Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <UpgradeModal />
      <PasswordChangeModal />
      <OtpVerificationModal />

      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your organization, team, billing, and analysis preferences.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="organization" className="gap-2" data-testid="tab-organization">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Organization</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2" data-testid="tab-team">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Team</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2" data-testid="tab-billing">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Billing</span>
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-2" data-testid="tab-schedule">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Schedule</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="space-y-6 max-w-3xl">
          <Card className="glass-card" data-testid="card-brand-details">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Brand Information
                  </CardTitle>
                  <CardDescription>View and manage your core brand details.</CardDescription>
                </div>
                <Button 
                  variant={editMode ? "default" : "outline"} 
                  onClick={() => setEditMode(!editMode)}
                  data-testid="btn-edit-details"
                >
                  {editMode ? <Check className="h-4 w-4 mr-2" /> : <Pencil className="h-4 w-4 mr-2" />}
                  {editMode ? "Save Details" : "Edit Details"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {brandLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Loading brand details...</span>
                </div>
              ) : !brand ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  No brand found. Please complete onboarding first.
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Brand Name</Label>
                    <Input defaultValue={brand.name} disabled={!editMode} data-testid="input-brand-name" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Website URL</Label>
                    <Input defaultValue={brand.domain} disabled={!editMode} data-testid="input-website-url" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Product Description</Label>
                    <Textarea
                      defaultValue={brand.description || ""}
                      disabled={!editMode}
                      rows={4}
                      data-testid="input-product-description"
                    />
                  </div>
                  {brand.slogan && (
                    <div className="grid gap-2">
                      <Label>Brand Slogan</Label>
                      <Input defaultValue={brand.slogan} disabled={!editMode} data-testid="input-brand-slogan" />
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Industry</Label>
                      <Select defaultValue={brand.industry || "technology"} disabled={!editMode}>
                        <SelectTrigger data-testid="select-industry">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="technology">Technology</SelectItem>
                          <SelectItem value="saas">SaaS / Software</SelectItem>
                          <SelectItem value="ecommerce">E-commerce</SelectItem>
                          <SelectItem value="finance">Finance</SelectItem>
                          <SelectItem value="healthcare">Healthcare</SelectItem>
                          <SelectItem value="education">Education</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {brand.subindustry && (
                      <div className="grid gap-2">
                        <Label>Sub-Industry</Label>
                        <Input defaultValue={brand.subindustry} disabled={!editMode} data-testid="input-subindustry" />
                      </div>
                    )}
                  </div>
                  {(brand.city || brand.state || brand.country) && (
                    <div className="grid md:grid-cols-3 gap-4">
                      {brand.city && (
                        <div className="grid gap-2">
                          <Label>City</Label>
                          <Input defaultValue={brand.city} disabled={!editMode} data-testid="input-city" />
                        </div>
                      )}
                      {brand.state && (
                        <div className="grid gap-2">
                          <Label>State/Province</Label>
                          <Input defaultValue={brand.state} disabled={!editMode} data-testid="input-state" />
                        </div>
                      )}
                      {brand.country && (
                        <div className="grid gap-2">
                          <Label>Country</Label>
                          <Input defaultValue={brand.country} disabled={!editMode} data-testid="input-country" />
                        </div>
                      )}
                    </div>
                  )}
                  {brand.linkedinUrl && (
                    <div className="grid gap-2">
                      <Label>LinkedIn URL</Label>
                      <Input defaultValue={brand.linkedinUrl} disabled={!editMode} data-testid="input-linkedin-url" />
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Primary Language</Label>
                      <Select defaultValue={brand.primaryLanguage || "en"} disabled={!editMode}>
                        <SelectTrigger data-testid="select-language">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">🇺🇸 English</SelectItem>
                          <SelectItem value="es">🇪🇸 Spanish</SelectItem>
                          <SelectItem value="fr">🇫🇷 French</SelectItem>
                          <SelectItem value="de">🇩🇪 German</SelectItem>
                          <SelectItem value="hi">🇮🇳 Hindi</SelectItem>
                          <SelectItem value="zh">🇨🇳 Chinese</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Target Market/Location</Label>
                      <Select defaultValue={brand.targetMarket || "us"} disabled={!editMode}>
                        <SelectTrigger data-testid="select-location">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="us">🇺🇸 United States</SelectItem>
                          <SelectItem value="uk">🇬🇧 United Kingdom</SelectItem>
                          <SelectItem value="in">🇮🇳 India</SelectItem>
                          <SelectItem value="eu">🇪🇺 Europe</SelectItem>
                          <SelectItem value="global">🌍 Global</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Brand Name Variations</Label>
                    <p className="text-xs text-muted-foreground">Add alternative names that should be recognized as mentions of your brand.</p>
                    <div className="p-4 border rounded-lg bg-muted/30 text-center text-sm text-muted-foreground">
                      {brand.brandVariations && brand.brandVariations.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {brand.brandVariations.map((variation: string, idx: number) => (
                            <Badge key={idx} variant="secondary">{variation}</Badge>
                          ))}
                        </div>
                      ) : (
                        <>
                          <p>No variations added yet. Add variations like "{brand.name.split(' ')[0]}", "{brand.name} Inc", etc. to improve brand detection.</p>
                          <Button variant="link" className="mt-2 p-0 h-auto" disabled={!editMode}>Click "Edit Details" to manage variations</Button>
                        </>
                      )}
                    </div>
                  </div>

                  
                </div>
              )}

              <div className="border-t pt-6">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Developer Tools
                </h4>
                <p className="text-sm text-muted-foreground mb-3">Clear browser storage for debugging purposes</p>
                <Button variant="outline" className="text-destructive hover:text-destructive" data-testid="btn-clear-storage">
                  Clear Report Storage
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className={cn("glass-card", brand?.tier === "free" && "border-2 border-dashed opacity-80")} data-testid="card-notifications">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Notifications
                </CardTitle>
                {brand?.tier === "free" && (
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="h-3 w-3" />
                    Paid Plan
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Weekly Reports</Label>
                  <p className="text-sm text-muted-foreground">Receive a summary of AI visibility every Monday.</p>
                </div>
                <Switch defaultChecked disabled={brand?.tier === "free"} data-testid="switch-weekly-reports" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Critical Alerts</Label>
                  <p className="text-sm text-muted-foreground">Get notified immediately for large visibility drops.</p>
                </div>
                <Switch defaultChecked disabled={brand?.tier === "free"} data-testid="switch-critical-alerts" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Competitor Alerts</Label>
                  <p className="text-sm text-muted-foreground">Alert when a competitor gains significant visibility.</p>
                </div>
                <Switch disabled={brand?.tier === "free"} data-testid="switch-competitor-alerts" />
              </div>
              {brand?.tier === "free" && (
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground mb-2">Upgrade to enable email notifications</p>
                  <Button size="sm" variant="outline" onClick={() => setShowUpgradeModal(true)}>
                    <Crown className="h-3 w-3 mr-1" /> Upgrade Plan
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card" data-testid="card-security">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Reset Password
              </CardTitle>
              <CardDescription>Update your account password for enhanced security.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setShowPasswordModal(true)} className="gap-2" data-testid="btn-reset-password">
                <Key className="h-4 w-4" />
                Change Password
              </Button>
              <p className="text-xs text-muted-foreground mt-2">You'll need to verify with OTP sent to your phone.</p>
            </CardContent>
          </Card>

          <Card className="glass-card" data-testid="card-devices">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Active Devices
              </CardTitle>
              <CardDescription>Manage devices where your account is currently logged in.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sessionsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : activeSessions.length > 0 ? (
                activeSessions.map(device => (
                  <div
                    key={device.id}
                    className={cn(
                      "p-4 border rounded-lg flex items-center justify-between",
                      device.current && "border-primary bg-primary/5"
                    )}
                    data-testid={`device-${device.id}`}
                  >
                    <div className="flex items-center gap-4">
                      {device.deviceType === 'mobile' ? (
                        <Smartphone className="h-8 w-8 text-muted-foreground" />
                      ) : (
                        <Monitor className="h-8 w-8 text-muted-foreground" />
                      )}
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {device.name}
                          {device.current && <Badge variant="secondary" className="text-xs">Current</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {device.browser} • {device.os} • {device.ip}
                        </div>
                        <div className="text-xs text-muted-foreground">{device.lastActive}</div>
                      </div>
                    </div>
                    {!device.current && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRevokeSession(device.sessionToken)}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Revoke
                      </Button>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <Smartphone className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No active sessions found</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          <div className="flex gap-4">
            <Button data-testid="btn-save-org">Save Changes</Button>
            <Button variant="outline" data-testid="btn-cancel-org">Cancel</Button>
          </div>
        </TabsContent>
        <TabsContent value="team" className="space-y-6 max-w-4xl">
            <Card className="glass-card" data-testid="card-team-management">
              <CardHeader>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Team Members
                    </CardTitle>
                    <CardDescription>
                      {teamMembers.length} of {brand?.tier === "enterprise" ? "unlimited" : (planCaps as any)?.maxTeamMembers || 10} seats used
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      className="sm:w-56"
                    />
                    <Input
                      value={inviteTempPassword}
                      onChange={(e) => setInviteTempPassword(e.target.value)}
                      placeholder="Temporary password"
                      className="sm:w-56"
                      type="password"
                    />
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger className="sm:w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      className="gap-2"
                      data-testid="btn-invite-member"
                      onClick={handleInviteTeamMember}
                      disabled={!inviteEmail.trim() || !inviteTempPassword.trim() || teamLoading || (brand?.tier !== "enterprise" && teamMembers.length >= ((planCaps as any)?.maxTeamMembers || 10))}
                    >
                      <UserPlus className="h-4 w-4" />
                      Join
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {teamLoading ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
                    Loading team members...
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamMembers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No team members yet. Invite your first teammate.
                          </TableCell>
                        </TableRow>
                      ) : (
                        teamMembers.map((member: any) => (
                          <TableRow key={member.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={member.avatar || undefined} alt={member.name || member.email || "Team member"} />
                                  <AvatarFallback>{String(member.email || member.name || "TM").slice(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-medium">{member.name || member.email?.split("@")[0] || "Team Member"}</div>
                                  <div className="text-xs text-muted-foreground">{member.email}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select value={member.role} onValueChange={(role) => handleUpdateTeamMember(member.id, { role })}>
                                <SelectTrigger className="w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">
                                    <div className="flex items-center gap-1">
                                      <Crown className="h-3 w-3" /> Admin
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="editor">Editor</SelectItem>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={member.status === "active" ? "outline" : "secondary"}
                                className={cn(member.status === "active" && "text-green-600 border-green-300 bg-green-50")}
                              >
                                {member.status === "active" ? <Check className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                                {member.status || "pending"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {member.acceptedAt ? new Date(member.acceptedAt).toLocaleDateString() : (member.status === "pending" ? "Invited" : "-")}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleRemoveTeamMember(member.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-6 max-w-4xl">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="glass-card" data-testid="card-current-plan">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-amber-500" />
                  Current Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-bold">{formatPlanPrice(currentPlan.monthlyPrice)}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <Badge className="mb-4">{currentPlan.displayName}</Badge>
                <ul className="space-y-2">
                  {getPlanFeatures(currentPlan).slice(0, 4).map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full mt-6" 
                  onClick={() => setShowUpgradeModal(true)}
                  data-testid="btn-upgrade-plan"
                >
                  <Crown className="h-4 w-4 mr-2" />
                  Upgrade Plan
                </Button>
              </CardContent>
            </Card>

            <Card className="glass-card" data-testid="card-usage">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Usage This Month
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {billingLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  (() => {
                    const topicsUsed = usage?.topicsUsed || 0;
                    const competitorsUsed = usage?.competitorsUsed || 0;
                    const promptsUsed = usage?.promptsUsed || 0;
                    const teamMembersUsed = usage?.teamMembersUsed || 1;
                    const topicsLimit = planCaps.maxTopics;
                    const competitorsLimit = planCaps.maxCompetitors;
                    const promptsLimit = planCaps.promptLimits ?? planCaps.maxPrompts;
                    const teamMembersLimit = brand?.tier === "enterprise" ? -1 : (brand?.tier === "growth" ? 10 : brand?.tier === "starter" ? 3 : 1);
                    const topicsPct = topicsLimit === -1 || topicsLimit >= 9999 ? 0 : (topicsUsed / (topicsLimit || 1)) * 100;
                    const competitorsPct = competitorsLimit === -1 || competitorsLimit >= 9999 ? 0 : (competitorsUsed / (competitorsLimit || 1)) * 100;
                    const promptsPct = promptsLimit === -1 || promptsLimit >= 9999 ? 0 : (promptsUsed / (promptsLimit || 1)) * 100;
                    const teamPct = teamMembersLimit === -1 ? 0 : (teamMembersUsed / (teamMembersLimit || 1)) * 100;
                    return (
                      <>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Topics</span>
                            <span className="font-mono">{topicsUsed} / {topicsLimit >= 9999 ? '\u221E' : topicsLimit}</span>
                          </div>
                          <Progress value={topicsPct} className="h-2" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Competitors</span>
                            <span className="font-mono">{competitorsUsed} / {competitorsLimit >= 9999 ? '\u221E' : competitorsLimit}</span>
                          </div>
                          <Progress value={competitorsPct} className="h-2" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Prompts</span>
                            <span className="font-mono">{promptsUsed} / {promptsLimit >= 9999 ? '\u221E' : promptsLimit}</span>
                          </div>
                          <Progress value={promptsPct} className="h-2" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Team Members</span>
                            <span className="font-mono">{teamMembersUsed} / {teamMembersLimit === -1 ? '\u221E' : teamMembersLimit}</span>
                          </div>
                          <Progress value={teamPct} className="h-2" />
                        </div>
                        {topicsUsed > 0 && topicsLimit > 0 && topicsLimit < 9999 && (topicsUsed / topicsLimit) > 0.7 && (
                          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                            <div className="flex items-start gap-3">
                              <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-600" />
                              <div className="flex-1">
                                <p className="font-medium">You've used {Math.round((topicsUsed / topicsLimit) * 100)}% of your topic limit ({topicsUsed}/{topicsLimit})</p>
                                <p className="text-xs text-amber-700 mt-1">
                                  You're tracking {competitorsUsed} competitors across {topicsUsed} topics.
                                  {brand?.tier === "starter" ? " Growth plan lets you track 10 competitors across unlimited topics." : " Upgrade to unlock more capacity."}
                                </p>
                                {brand?.tier !== "enterprise" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-3 border-amber-400 text-amber-800 hover:bg-amber-100"
                                    onClick={() => setShowUpgradeModal(true)}
                                  >
                                    <Zap className="h-3 w-3 mr-1" />
                                    Upgrade for {brand?.tier === "free" ? "₹499/mo" : "₹1,000/mo"}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        {competitorsUsed >= competitorsLimit && competitorsLimit > 0 && competitorsLimit < 9999 && (
                          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                            <div className="flex items-start gap-3">
                              <Target className="h-5 w-5 mt-0.5 flex-shrink-0 text-red-600" />
                              <div className="flex-1">
                                <p className="font-medium">You've reached your competitor limit ({competitorsUsed}/{competitorsLimit})</p>
                                <p className="text-xs text-red-700 mt-1">
                                  To fully analyze your competitive landscape, you need to add more competitors.
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-3 border-red-400 text-red-800 hover:bg-red-100"
                                  onClick={() => setShowUpgradeModal(true)}
                                >
                                  <Zap className="h-3 w-3 mr-1" />
                                  Add Competitor Capacity
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                        {promptsUsed >= promptsLimit && promptsLimit > 0 && promptsLimit < 9999 && (
                          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                            <div className="flex items-start gap-3">
                              <MessageSquare className="h-5 w-5 mt-0.5 flex-shrink-0 text-blue-600" />
                              <div className="flex-1">
                                <p className="font-medium">You've used all {promptsUsed} prompts this period</p>
                                <p className="text-xs text-blue-700 mt-1">
                                  More prompts = better visibility insights. Upgrade to run up to 50 prompts weekly.
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-3 border-blue-400 text-blue-800 hover:bg-blue-100"
                                  onClick={() => setShowUpgradeModal(true)}
                                >
                                  <Zap className="h-3 w-3 mr-1" />
                                  Unlock More Prompts
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card" data-testid="card-invoices">
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
            </CardHeader>
            <CardContent>
              {billingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : invoices && invoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map(inv => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono">{inv.razorpayInvoiceId || inv.id}</TableCell>
                        <TableCell>{new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</TableCell>
                        <TableCell className="font-medium">₹{(inv.amount / 100).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              inv.status === "paid" && "text-green-600 border-green-300 bg-green-50",
                              inv.status === "pending" && "text-amber-600 border-amber-300 bg-amber-50",
                              inv.status === "failed" && "text-red-600 border-red-300 bg-red-50"
                            )}
                          >
                            {inv.status === "paid" && <Check className="h-3 w-3 mr-1" />}
                            {inv.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, '_blank')}
                            disabled={inv.status !== "paid"}
                          >
                            Download
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No invoices yet</p>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card" data-testid="card-addon-offers">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Add-on Services
              </CardTitle>
              <CardDescription>
                One-time implementation packages for agent readiness and schema fixes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(addonOffersData?.offers || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No add-ons available for your brand. Contact support for custom packages.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3 mb-4">
                  {(addonOffersData?.offers || []).map((offer: any) => (
                    <div key={offer.id} className="border rounded-lg p-3 text-sm">
                      <p className="font-medium">{offer.title}</p>
                      <p className="text-muted-foreground text-xs mt-1 line-clamp-2">{offer.description}</p>
                      <p className="font-semibold mt-2">₹{offer.effectivePriceInr?.toLocaleString("en-IN")}</p>
                      {offer.purchased && <Badge variant="outline" className="mt-2">Purchased</Badge>}
                    </div>
                  ))}
                </div>
              )}
              <Button variant="outline" className="w-full" asChild>
                <Link href="/app/agent-readiness">
                  <Bot className="h-4 w-4 mr-2" />
                  View Agent Readiness & purchase add-ons
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-6 max-w-2xl">
          <div className="relative">
            {brand?.tier === "free" && (
              <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] rounded-lg flex flex-col items-center justify-center" data-testid="schedule-lock-overlay">
                <Lock className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-lg font-semibold text-foreground mb-1">Upgrade to unlock scheduling</p>
                <p className="text-sm text-muted-foreground mb-4">Schedule configuration is available on paid plans</p>
                <Button asChild data-testid="btn-upgrade-schedule">
                  <a href="/app/settings?tab=billing">Upgrade Plan</a>
                </Button>
              </div>
            )}
            <div className={cn("space-y-6", brand?.tier === "free" && "pointer-events-none select-none")}>
              <Card className="glass-card" data-testid="card-analysis-schedule">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Analysis Schedule
                      </CardTitle>
                      <CardDescription>
                        {brand?.tier === "free"
                          ? "Free plan includes monthly automated analysis. Upgrade for more frequent scheduling."
                          : "Configure when Geoscore runs automated visibility analysis. Frequency options depend on your plan."}
                      </CardDescription>
                    </div>
                    {brand?.tier === "free" && (
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" />
                        Monthly
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Enable Scheduled Analysis</Label>
                        <p className="text-sm text-muted-foreground">Automatically run visibility checks on a schedule</p>
                      </div>
                      <Switch defaultChecked disabled={brand?.tier === "free"} data-testid="switch-enable-schedule" />
                    </div>

                    <div className="grid gap-2">
                      <Label>Frequency</Label>
                      <Select defaultValue={brand?.tier === "free" ? "monthly" : "daily"} disabled={brand?.tier === "free"}>
                        <SelectTrigger data-testid="select-frequency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hourly" disabled={brand?.tier === "free" || brand?.tier === "starter"}>
                            Hourly {brand?.tier !== "enterprise" && brand?.tier !== "growth" && "(Growth+)"}
                          </SelectItem>
                          <SelectItem value="daily" disabled={brand?.tier === "free"}>
                            Daily {brand?.tier === "free" && "(Starter+)"}
                          </SelectItem>
                          <SelectItem value="weekly" disabled={brand?.tier === "free"}>
                            Weekly {brand?.tier === "free" && "(Starter+)"}
                          </SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label>Preferred Time</Label>
                      <Select defaultValue="06:00">
                        <SelectTrigger data-testid="select-time">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="00:00">12:00 AM</SelectItem>
                          <SelectItem value="06:00">6:00 AM</SelectItem>
                          <SelectItem value="12:00">12:00 PM</SelectItem>
                          <SelectItem value="18:00">6:00 PM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label>Timezone</Label>
                      <Select defaultValue="utc">
                        <SelectTrigger data-testid="select-timezone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="utc">UTC</SelectItem>
                          <SelectItem value="est">Eastern Time (EST)</SelectItem>
                          <SelectItem value="pst">Pacific Time (PST)</SelectItem>
                          <SelectItem value="cet">Central European (CET)</SelectItem>
                          <SelectItem value="ist">India Standard Time (IST)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card" data-testid="card-models-config">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    Models Configuration
                  </CardTitle>
                  <CardDescription>
                    Select which AI models to include in scheduled analysis
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {["ChatGPT (GPT-4)", "Claude 3", "Gemini Pro", "Perplexity"].map((model, i) => (
                    <div key={model} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{model}</span>
                        {i === 3 && brand?.tier === "free" && (
                          <Badge variant="secondary" className="text-[10px]">Upgrade Required</Badge>
                        )}
                      </div>
                      <Switch defaultChecked={i < 3} disabled={i === 3 && brand?.tier === "free"} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="glass-card" data-testid="card-last-run">
            <CardHeader>
              <CardTitle>Last Analysis Run</CardTitle>
              <CardDescription>View recent analysis status and trigger manual runs</CardDescription>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : latestJob ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">
                        {new Date(latestJob.createdAt).toLocaleString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {latestJob.type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </div>
                      {latestJob.completedAt && latestJob.createdAt && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Completed in {Math.round((new Date(latestJob.completedAt).getTime() - new Date(latestJob.createdAt).getTime()) / 1000)} seconds
                        </div>
                      )}
                    </div>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        latestJob.status === 'completed' && "text-green-600 border-green-300 bg-green-50",
                        latestJob.status === 'failed' && "text-red-600 border-red-300 bg-red-50",
                        latestJob.status === 'running' && "text-blue-600 border-blue-300 bg-blue-50",
                        latestJob.status === 'pending' && "text-yellow-600 border-yellow-300 bg-yellow-50"
                      )}
                    >
                      {latestJob.status === 'completed' && <Check className="h-3 w-3 mr-1" />}
                      {latestJob.status === 'running' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {latestJob.status === 'failed' && <AlertCircle className="h-3 w-3 mr-1" />}
                      {latestJob.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                      {latestJob.status.charAt(0).toUpperCase() + latestJob.status.slice(1)}
                    </Badge>
                  </div>
                  
                  {latestJob.status === 'running' && latestJob.progress !== undefined && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-mono">{latestJob.progress}%</span>
                      </div>
                      <Progress value={latestJob.progress} className="h-2" />
                    </div>
                  )}
                  
                  {latestJob.error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                      <div className="font-medium mb-1">Error</div>
                      <div>{latestJob.error}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No analysis runs yet</p>
                  <p className="text-sm mt-1">Analysis runs automatically based on your plan schedule</p>
                </div>
              )}
              
              {false ? (
                <div className="w-full mt-4 text-center">
                  <Button 
                    className="w-full" 
                    variant="outline" 
                    disabled
                    data-testid="btn-run-now"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Upgrade to run manual analysis
                  </Button>
                </div>
              ) : (
                <Button 
                  className="w-full mt-4" 
                  variant="outline" 
                  onClick={() => triggerEnrichment()}
                  disabled={isTriggering || latestJob?.status === 'running'}
                  data-testid="btn-run-now"
                >
                  {isTriggering || latestJob?.status === 'running' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Run Analysis Now
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
          
          <div className="flex gap-4">
            <Button disabled={brand?.tier === "free"} data-testid="btn-save-schedule">Save Schedule</Button>
            <Button variant="outline" disabled={brand?.tier === "free"} data-testid="btn-cancel-schedule">Cancel</Button>
          </div>

          <Card className="glass-card" data-testid="card-active-devices">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Active Devices
              </CardTitle>
              <CardDescription>Your current session information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 p-4 border rounded-lg">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted">
                  {(() => {
                    const ua = navigator.userAgent;
                    if (/Mac/i.test(ua)) return <Monitor className="h-5 w-5" />;
                    if (/Linux/i.test(ua)) return <Globe className="h-5 w-5" />;
                    return <Monitor className="h-5 w-5" />;
                  })()}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="font-medium text-sm">
                    {(() => {
                      const ua = navigator.userAgent;
                      let browser = "Unknown Browser";
                      if (/Firefox/i.test(ua)) browser = "Firefox";
                      else if (/Edg/i.test(ua)) browser = "Edge";
                      else if (/Chrome/i.test(ua)) browser = "Chrome";
                      else if (/Safari/i.test(ua)) browser = "Safari";
                      let os = "Unknown OS";
                      if (/Windows/i.test(ua)) os = "Windows";
                      else if (/Mac/i.test(ua)) os = "macOS";
                      else if (/Linux/i.test(ua)) os = "Linux";
                      return `${browser} on ${os}`;
                    })()}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                      Last active: Just now
                    </span>
                    <span>1 active session</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-green-600 border-green-300">Current</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
