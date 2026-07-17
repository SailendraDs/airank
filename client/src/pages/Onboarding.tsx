import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ChevronRight, Loader2, Plus, Trash2, Sparkles, CreditCard, BarChart3, TrendingUp, Bot, Store, ShoppingBag, Globe, Database, User } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PLAN_LIMITS, type PlanTier } from "@/lib/data-model";
import * as api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ActivationProgress } from "./Activate";

type ApiPlan = {
  id: string;
  displayName: string;
  monthlyPrice: number;
  maxCompetitors: number;
  maxTopics: number;
  maxPrompts: number;
  refreshFrequency?: string;
  isActive?: boolean;
};

type BusinessChannel = "website" | "shopify" | "amazon_seller" | "amazon_and_shopify";

const CHANNEL_OPTIONS: { id: BusinessChannel; label: string; hint: string; icon: typeof Globe }[] = [
  { id: "website", label: "Website / D2C", hint: "Own domain brand", icon: Globe },
  { id: "shopify", label: "Shopify store", hint: "myshopify.com or custom domain", icon: Store },
  { id: "amazon_seller", label: "Amazon seller", hint: "Listings + optional storefront", icon: ShoppingBag },
  { id: "amazon_and_shopify", label: "Amazon + Shopify", hint: "Marketplace + owned store", icon: Store },
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [entitySubStep, setEntitySubStep] = useState<"description" | "people" | "links">("description");
  const [entityShortDesc, setEntityShortDesc] = useState("");
  const [entityFullDesc, setEntityFullDesc] = useState("");
  const [entityAliases, setEntityAliases] = useState("");
  const [entityPeople, setEntityPeople] = useState<{ name: string; role: string; wikipedia: string }[]>([{ name: "", role: "", wikipedia: "" }]);
  const [entityLinks, setEntityLinks] = useState<{ label: string; url: string; category: string }[]>([{ label: "", url: "", category: "authority" }]);
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, setUser, refreshUser } = useAuth();

  // Load current onboarding step from user on mount
  useEffect(() => {
    const userStep = Number(user?.onboardingStep || 0);
    if (userStep > 0) {
      setStep((prev) => Math.max(prev, userStep));
    }
  }, [user?.onboardingStep]);

  const [brandDomain, setBrandDomain] = useState("");
  const [businessChannel, setBusinessChannel] = useState<BusinessChannel>("website");
  const [agentReadinessTeaser, setAgentReadinessTeaser] = useState<{
    score: number;
    grade: string;
    issueCount: number;
    topIssues: { label: string; message: string }[];
    loading?: boolean;
  } | null>(null);
  const [brandName, setBrandName] = useState("");
  const [brandIndustry, setBrandIndustry] = useState("");
  const [brandSubindustry, setBrandSubindustry] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [brandSlogan, setBrandSlogan] = useState("");
  const [brandCity, setBrandCity] = useState("");
  const [brandState, setBrandState] = useState("");
  const [brandCountry, setBrandCountry] = useState("");
  const [brandLinkedinUrl, setBrandLinkedinUrl] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [brandDevData, setBrandDevData] = useState<any>(null);

  const [competitors, setCompetitors] = useState<{ name: string; domain: string }[]>([{ name: "", domain: "" }]);
  const [suggestedCompetitors, setSuggestedCompetitors] = useState<{ name: string; domain: string }[]>([]);

  const [selectedPlan, setSelectedPlan] = useState<string>("free");
  const [availablePlans, setAvailablePlans] = useState<ApiPlan[]>([]);

  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [topicsGenerated, setTopicsGenerated] = useState(false);

  const [querySuggestions, setQuerySuggestions] = useState<string[]>([]);
  const [selectedQueries, setSelectedQueries] = useState<string[]>([]);
  const [queriesGenerated, setQueriesGenerated] = useState(false);

  const [isActivating, setIsActivating] = useState(false);
  const [activationStatus, setActivationStatus] = useState<string>('pending');
  const [activationError, setActivationError] = useState<string | null>(null);

  const fallbackPlanTier = ((Object.keys(PLAN_LIMITS) as PlanTier[]).includes(selectedPlan as PlanTier)
    ? (selectedPlan as PlanTier)
    : "free");
  const fallbackPlanLimits = PLAN_LIMITS[fallbackPlanTier];
  const selectedApiPlan = availablePlans.find((p) => p.id === selectedPlan);
  const maxTopics = selectedApiPlan?.maxTopics ?? fallbackPlanLimits.maxTopics;
  const maxPrompts = selectedApiPlan?.maxPrompts ?? fallbackPlanLimits.maxQueries;
  const topicLimit = maxTopics < 0 ? Number.POSITIVE_INFINITY : maxTopics;
  const promptLimit = maxPrompts < 0 ? Number.POSITIVE_INFINITY : maxPrompts;
  const topicLimitLabel = Number.isFinite(topicLimit) ? String(topicLimit) : "Unlimited";
  const promptLimitLabel = Number.isFinite(promptLimit) ? String(promptLimit) : "Unlimited";
  const normalizeDomain = (input: string) => {
    let value = (input || "").trim().toLowerCase();
    value = value.replace(/^https?:\/\//, "");
    value = value.replace(/^www\./, "");
    value = value.split("/")[0];
    value = value.split("?")[0];
    value = value.split("#")[0];
    return value;
  };

  const fetchCurrentBrand = async () => {
    const response = await fetch("/api/brands/current", { credentials: "include" });
    if (!response.ok) return null;
    return response.json();
  };

  useEffect(() => {
    let cancelled = false;

    const fetchPlans = async () => {
      try {
        const response = await fetch("/api/plans", { credentials: "include" });
        if (!response.ok) return;
        const plans = await response.json();
        if (!Array.isArray(plans) || cancelled) return;
        const normalized: ApiPlan[] = plans
          .filter((p: any) => p?.id)
          .map((p: any) => ({
            id: String(p.id),
            displayName: String(p.displayName || p.name || p.id),
            monthlyPrice: Number(p.monthlyPrice ?? 0),
            maxCompetitors: Number(p.maxCompetitors ?? 3),
            maxTopics: Number(p.maxTopics ?? 3),
            maxPrompts: Number(p.maxPrompts ?? 6),
            refreshFrequency: p.refreshFrequency || "weekly",
            isActive: p.isActive ?? true,
          }))
          .filter((p) => p.isActive !== false)
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

  useEffect(() => {
    if (availablePlans.length === 0) return;
    if (availablePlans.some((p) => p.id === selectedPlan)) return;
    setSelectedPlan(availablePlans[0].id);
  }, [availablePlans, selectedPlan]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ch = params.get("channel");
    if (ch === "shopify" || ch === "amazon" || ch === "amazon_seller" || ch === "website" || ch === "amazon_and_shopify") {
      setBusinessChannel(ch === "amazon" ? "amazon_seller" : (ch as BusinessChannel));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateOnboardingState = async () => {
      if (!user) return;
      try {
        const currentBrand = await fetchCurrentBrand();
        if (!currentBrand || cancelled) {
          setBrandId(null);
          setStep(1);
          return;
        }

        setBrandId(currentBrand.id);
        setBrandDomain(currentBrand.domain || "");
        setBrandName(currentBrand.name || "");
        setBrandIndustry(currentBrand.industry || "");
        setBrandSubindustry(currentBrand.subindustry || "");
        setBrandDescription(currentBrand.description || "");
        setBrandSlogan(currentBrand.slogan || "");
        setBrandCity(currentBrand.city || "");
        setBrandState(currentBrand.state || "");
        setBrandCountry(currentBrand.country || "");
        setBrandLinkedinUrl(currentBrand.linkedinUrl || "");
        setBrandLogo(currentBrand.logo || "");
        setLogoLoadFailed(false);
        setSelectedPlan(currentBrand.tier || "free");
        if (currentBrand.brandDevData) setBrandDevData(currentBrand.brandDevData);
        const ch = currentBrand.businessChannel;
        if (ch === "website" || ch === "shopify" || ch === "amazon_seller" || ch === "amazon_and_shopify") {
          setBusinessChannel(ch);
        }

        const [existingCompetitors, existingTopics, existingPrompts, subscriptionData, arReport] = await Promise.all([
          api.getCompetitors(currentBrand.id).catch(() => []),
          api.getTopics(currentBrand.id).catch(() => []),
          api.getPrompts(currentBrand.id).catch(() => []),
          fetch("/api/brands/" + currentBrand.id + "/subscription", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          api.getAgentReadiness(currentBrand.id).catch(() => null),
        ]);

        if (cancelled) return;

        if (arReport?.hasReport) {
          setAgentReadinessTeaser({
            score: arReport.score ?? 0,
            grade: arReport.grade ?? "poor",
            issueCount: arReport.issueCount ?? arReport.topIssues?.length ?? 0,
            topIssues: arReport.topIssues || [],
            loading: false,
          });
        }

        if (Array.isArray(existingCompetitors) && existingCompetitors.length > 0) {
          setCompetitors(existingCompetitors.slice(0, 3).map((c: any) => ({
            name: c.name || "",
            domain: c.domain || "",
          })));
        }

        if (Array.isArray(existingTopics) && existingTopics.length > 0) {
          const topicNames = existingTopics.map((t: any) => t.name).filter(Boolean);
          setTopicSuggestions(topicNames);
          setSelectedTopics(topicNames);
          setTopicsGenerated(true);
        }

        if (Array.isArray(existingPrompts) && existingPrompts.length > 0) {
          const promptTexts = existingPrompts.map((p: any) => p.text).filter(Boolean);
          setQuerySuggestions(promptTexts);
          setSelectedQueries(promptTexts);
          setQueriesGenerated(true);
        }

        let inferredStep = 2;
        if (Array.isArray(existingTopics) && existingTopics.length > 0) inferredStep = Math.max(inferredStep, 5);
        if (Array.isArray(existingPrompts) && existingPrompts.length > 0) inferredStep = Math.max(inferredStep, 6);

        const internalSub = (subscriptionData as any)?.internal;
        const hasPaidOrVerifiedSubscription = Boolean(
          internalSub && ["active", "trialing", "authenticated", "created"].includes(String(internalSub.status || "").toLowerCase())
        );

        if (hasPaidOrVerifiedSubscription || currentBrand.activationStatus === "running" || currentBrand.activationStatus === "completed" || currentBrand.onboardingCompleted) {
          inferredStep = 7;
        }

        const userStep = Number(user.onboardingStep || 1);
        setStep(Math.max(userStep, inferredStep));

        if (currentBrand.activationStatus === "running") {
          setActivationStatus("running");
        }
      } catch (error) {
        console.error("Failed to hydrate onboarding state:", error);
      }
    };

    hydrateOnboardingState();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const addCompetitor = () => {
    if (competitors.length < 3) {
      setCompetitors([...competitors, { name: "", domain: "" }]);
    }
  };

  const updateCompetitor = (index: number, field: "name" | "domain", value: string) => {
    const updated = [...competitors];
    updated[index][field] = value;
    setCompetitors(updated);
  };

  const removeCompetitor = (index: number) => {
    setCompetitors(competitors.filter((_, i) => i !== index));
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev => {
      if (prev.includes(topic)) return prev.filter(t => t !== topic);
      if (prev.length >= topicLimit) {
        toast({ title: `Maximum ${topicLimitLabel} topics allowed on ${selectedPlan} plan`, variant: "destructive" });
        return prev;
      }
      return [...prev, topic];
    });
  };

  const toggleQuery = (query: string) => {
    setSelectedQueries(prev => {
      if (prev.includes(query)) return prev.filter(q => q !== query);
      if (prev.length >= promptLimit) {
        toast({ title: `Maximum ${promptLimitLabel} prompts allowed on ${selectedPlan} plan`, variant: "destructive" });
        return prev;
      }
      return [...prev, query];
    });
  };

  // Helper function to update onboarding step in database
  const updateOnboardingStep = async (newStep: number) => {
    try {
      await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ onboardingStep: newStep }),
      });
      // Refresh user data to get updated step
      await refreshUser();
    } catch (error) {
      console.error("Failed to update onboarding step:", error);
    }
  };

  const handleStep1 = async () => {
    const normalizedDomain = normalizeDomain(brandDomain);
    if (!normalizedDomain) {
      toast({ title: "Please enter your brand domain", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const lookupResult = await api.lookupBrand(normalizedDomain);
      if (lookupResult?.enrichmentStatus === "error" && lookupResult?.enrichmentError) {
        toast({
          title: "Brand enrichment warning",
          description: lookupResult.enrichmentError,
          variant: "destructive",
        });
      } else if (lookupResult?.brandDevStatus === "error" && lookupResult?.brandDevError) {
        toast({
          title: "Brand enrichment warning",
          description: lookupResult.brandDevError,
          variant: "destructive",
        });
      }

      if (Array.isArray(lookupResult?.suggestedCompetitors) && lookupResult.suggestedCompetitors.length > 0) {
        setSuggestedCompetitors(lookupResult.suggestedCompetitors);
        setCompetitors(
          lookupResult.suggestedCompetitors.slice(0, 3).map((c: any) => ({
            name: c.name || "",
            domain: c.domain || "",
          })),
        );
      } else {
        try {
          const suggestionResult = await api.suggestCompetitors(
            normalizedDomain,
            lookupResult.name,
            lookupResult.industry,
          );
          if (Array.isArray(suggestionResult?.competitors) && suggestionResult.competitors.length > 0) {
            setSuggestedCompetitors(suggestionResult.competitors);
            setCompetitors(
              suggestionResult.competitors.slice(0, 3).map((c: any) => ({
                name: c.name || "",
                domain: c.domain || "",
              })),
            );
          }
        } catch (err) {
          console.warn("Failed to load competitor suggestions:", err);
        }
      }

      // Store website metadata enrichment for display and reuse.
      setBrandDevData(lookupResult.brandDevData);

      const existingBrand = await fetchCurrentBrand();
      const brandPayload = {
        name: lookupResult.name || normalizedDomain.replace(/\..+$/, "").charAt(0).toUpperCase() + normalizedDomain.replace(/\..+$/, "").slice(1),
        domain: normalizedDomain,
        businessChannel,
        description: lookupResult.description || "",
        industry: lookupResult.industry || "",
        subindustry: lookupResult.subindustry || "",
        slogan: lookupResult.slogan || "",
        city: lookupResult.city || "",
        state: lookupResult.state || "",
        country: lookupResult.country || "",
        linkedinUrl: lookupResult.linkedinUrl || "",
        logo: lookupResult.logo || "",
        brandDevData: lookupResult.brandDevData,
        tier: "free",
      };

      const brand = existingBrand?.id
        ? await api.updateBrand(existingBrand.id, brandPayload)
        : await api.createBrand(brandPayload);

      setBrandId(brand.id);
      setBrandDomain(brand.domain || normalizedDomain);
      setAgentReadinessTeaser({ score: 0, grade: "poor", issueCount: 0, topIssues: [], loading: true });
      api.runAgentReadinessTeaser(brand.id)
        .then((teaser) => {
          setAgentReadinessTeaser({
            score: teaser.score ?? 0,
            grade: teaser.grade ?? "poor",
            issueCount: teaser.issueCount ?? teaser.topIssues?.length ?? 0,
            topIssues: teaser.topIssues || [],
            loading: false,
          });
        })
        .catch(() => setAgentReadinessTeaser(null));
      setBrandName(brand.name || lookupResult.name || "");
      setBrandIndustry(brand.industry || lookupResult.industry || "");
      setBrandSubindustry(brand.subindustry || lookupResult.subindustry || "");
      setBrandDescription(brand.description || lookupResult.description || "");
      setBrandSlogan(brand.slogan || lookupResult.slogan || "");
      setBrandCity(brand.city || lookupResult.city || "");
      setBrandState(brand.state || lookupResult.state || "");
      setBrandCountry(brand.country || lookupResult.country || "");
      setBrandLinkedinUrl(brand.linkedinUrl || lookupResult.linkedinUrl || "");
      setBrandLogo(brand.logo || lookupResult.logo || "");
      setLogoLoadFailed(false);
      setStep(2);
      await updateOnboardingStep(2);
    } catch (error: any) {
      toast({ title: "Error creating brand", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep2 = async () => {
    if (!brandId) {
      toast({ title: "Brand not found", description: "Reload the page and try again.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      if (brandName || brandIndustry || brandDescription || brandCity || brandState || brandCountry || brandLinkedinUrl) {
        await api.updateBrand(brandId, {
          name: brandName,
          industry: brandIndustry,
          subindustry: brandSubindustry,
          description: brandDescription,
          slogan: brandSlogan,
          city: brandCity,
          state: brandState,
          country: brandCountry,
          linkedinUrl: brandLinkedinUrl,
        });
      }

      const validCompetitors = competitors.filter(c => c.domain.trim());
      for (const comp of validCompetitors) {
        // Enrich competitor with website metadata.
        let competitorData: any = {
          name: comp.name || comp.domain.replace(/\..+$/, ""),
          domain: comp.domain.trim(),
          isTracked: true,
        };

        // Fetch metadata enrichment for competitor.
        try {
          const compLookup = await api.lookupBrand(comp.domain.trim());
          if (compLookup.brandDevData) {
            competitorData = {
              ...competitorData,
              description: compLookup.description || "",
              industry: compLookup.industry || "",
              subindustry: compLookup.subindustry || "",
              city: compLookup.city || "",
              state: compLookup.state || "",
              country: compLookup.country || "",
              linkedinUrl: compLookup.linkedinUrl || "",
              logo: compLookup.logo || "",
              brandDevData: compLookup.brandDevData,
            };
          }
        } catch (err) {
          console.warn("Failed to enrich competitor:", err);
        }

        await api.createCompetitor(brandId, competitorData);
      }
      setStep(3);
      await updateOnboardingStep(3);
    } catch (error: any) {
      toast({ title: "Error saving details", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep3 = async () => {
    if (!brandId) {
      toast({ title: "Brand not found", description: "Reload the page and try again.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      await api.updateBrand(brandId, { tier: selectedPlan });

      toast({ title: "Generating AI-powered topic suggestions...", description: "This may take a few seconds" });
      const validCompetitors = competitors.filter(c => c.domain.trim());
      const result = await api.generateTopics(brandId, validCompetitors);
      setTopicSuggestions(result.topics || []);
      setTopicsGenerated(true);
      setStep(4);
      await updateOnboardingStep(4);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep4 = async () => {
    if (!brandId) {
      toast({ title: "Brand not found", description: "Reload the page and try again.", variant: "destructive" });
      return;
    }
    if (selectedTopics.length === 0) {
      toast({ title: "Please select at least one topic", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Save entity profile (description + aliases) - non-blocking, best effort
      try {
        const aliases = entityAliases.split(",").map(s => s.trim()).filter(Boolean);
        const profileResponse = await fetch(`/api/brands/${brandId}/entity/profile`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-onboarding-flow": "1" },
          credentials: "include",
          body: JSON.stringify({
            shortDescription: entityShortDesc || undefined,
            description: entityFullDesc || undefined,
            aliases: aliases.length > 0 ? aliases : undefined,
          }),
        });
        if (!profileResponse.ok) throw new Error(`Entity profile save failed (${profileResponse.status})`);
      } catch (e) {
        console.warn("Failed to save entity profile (non-blocking):", e);
      }

      // 2. Save people - non-blocking, best effort
      try {
        const validPeople = entityPeople.filter(p => p.name.trim());
        for (const person of validPeople) {
          const peopleResponse = await fetch(`/api/brands/${brandId}/entity/people`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-onboarding-flow": "1" },
            credentials: "include",
            body: JSON.stringify({
              name: person.name,
              role: person.role || undefined,
              wikipedia: person.wikipedia || undefined,
            }),
          });
          if (!peopleResponse.ok) throw new Error(`Entity person save failed (${peopleResponse.status})`);
        }
      } catch (e) {
        console.warn("Failed to save entity people (non-blocking):", e);
      }

      // 3. Save authority links - non-blocking, best effort
      try {
        const validLinks = entityLinks.filter(l => l.url.trim());
        for (const link of validLinks) {
          const linkResponse = await fetch(`/api/brands/${brandId}/entity/links`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-onboarding-flow": "1" },
            credentials: "include",
            body: JSON.stringify({
              label: link.label || link.url,
              url: link.url,
              category: link.category,
            }),
          });
          if (!linkResponse.ok) throw new Error(`Entity link save failed (${linkResponse.status})`);
        }
      } catch (e) {
        console.warn("Failed to save entity links (non-blocking):", e);
      }

      // 4. Save topics
      for (const topic of selectedTopics) {
        await api.createTopic(brandId, { name: topic });
      }

      toast({ title: "Generating AI-powered prompt suggestions...", description: "This may take a few seconds" });
      const validCompetitors = competitors.filter(c => c.domain.trim());
      const result = await api.generateQueries(brandId, validCompetitors, selectedTopics);
      setQuerySuggestions(result.prompts || result.queries || []);
      setQueriesGenerated(true);
      setStep(5);
      await updateOnboardingStep(5);
    } catch (error: any) {
      toast({ title: "Error saving topics", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep5 = async () => {
    if (!brandId) {
      toast({ title: "Brand not found", description: "Reload the page and try again.", variant: "destructive" });
      return;
    }
    if (selectedQueries.length === 0) {
      toast({ title: "Please select at least one prompt", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      try {
        await api.createPromptsBulk(brandId, selectedQueries);
      } catch (bulkErr: any) {
        const bulkMessage = String(bulkErr?.message || "");
        const normalizedBulkMessage = bulkMessage.toLowerCase();
        const shouldFallback = normalizedBulkMessage.includes("unexpected token") || normalizedBulkMessage.includes("<!doctype") || normalizedBulkMessage.includes("html response") || normalizedBulkMessage.includes("failed to fetch");
        if (!shouldFallback) throw bulkErr;

        for (const promptText of selectedQueries) {
          await api.createPrompt(brandId, {
            text: promptText,
            category: "general",
            isActive: true,
          });
        }
      }
      try {
        await api.triggerFullPipeline(brandId);
        console.log("[Onboarding] Pipeline triggered early at prompt selection step");
      } catch (pipelineErr: any) {
        console.error("[Onboarding] Early pipeline trigger error:", pipelineErr);
      }

      setStep(6);
      await updateOnboardingStep(6);
    } catch (error: any) {
      toast({ title: "Error saving prompts", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Activate account after successful payment
  const activateAccount = async () => {
    if (!brandId) {
      toast({ title: "Brand not found", description: "Reload the page and try again.", variant: "destructive" });
      return;
    }

    try {
      await api.updateBrand(brandId, { status: "active" });

      await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ onboardingCompleted: true }),
      });

      if (user) {
        setUser({ ...user, onboardingCompleted: true });
      }

      toast({
        title: "Setup complete!",
        description: "Analysis pipeline is already running. Results will appear in your dashboard shortly."
      });

      setLocation("/app/dashboard");
    } catch (error: any) {
      console.error("Error during onboarding completion:", error);
      toast({
        title: "Setup complete with warnings",
        description: "Some background tasks may still be processing. Check your dashboard.",
        variant: "default"
      });
      setLocation("/app/dashboard");
    }
  };
  const ensureRazorpayLoaded = async () => {
    const win = window as any;
    if (typeof win.Razorpay === "function") return;

    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]') as HTMLScriptElement | null;

    await new Promise<void>((resolve, reject) => {
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load payment gateway")), { once: true });
        if (typeof (window as any).Razorpay === "function") resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load payment gateway"));
      document.head.appendChild(script);
    });

    if (typeof (window as any).Razorpay !== "function") {
      throw new Error("Payment gateway did not initialize");
    }
  };

  const getCheckoutContact = async () => {
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
  const handleFinish = async () => {
    if (!brandId || !user) {
      toast({ title: "Brand not found", description: "Reload the page and try again.", variant: "destructive" });
      return;
    }
    setIsLoading(true);

    try {
      toast({ title: "Creating subscription...", description: "Please wait" });

      const subscriptionResponse = await fetch(`/api/brands/${brandId}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          planId: selectedPlan,
          email: user.email,
          phone: "",
          startTrial: false,
        }),
      });

      const subscriptionData = await subscriptionResponse.json();
      if (!subscriptionResponse.ok) {
        throw new Error(subscriptionData?.message || "Failed to create subscription");
      }

      if (!subscriptionData.razorpaySubscriptionId) {
        throw new Error("Failed to create subscription");
      }

      if (subscriptionData.razorpaySubscriptionId === "free_plan") {
        setIsLoading(false);
        setStep(7);
        await updateOnboardingStep(7);
        return;
      }

      await ensureRazorpayLoaded();
      const RazorpayCtor = (window as any).Razorpay;
      if (typeof RazorpayCtor !== "function") {
        throw new Error("Payment gateway is unavailable. Please refresh and try again.");
      }

      const keyId = subscriptionData.razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!keyId) {
        throw new Error("Razorpay key is missing in server configuration");
      }

      const options = {
        key: keyId,
        subscription_id: subscriptionData.razorpaySubscriptionId,
        name: "AIRank",
        description: `${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} plan subscription`,
        handler: async function(response: any) {
          console.log("Payment successful:", response);
          setIsLoading(false);
          setStep(7);
          await updateOnboardingStep(7);
        },
        prefill: {
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || brandName || "",
          email: user.email,
          contact: (await getCheckoutContact()) || undefined,
        },
        readonly: {
          name: false,
          email: false,
          contact: false,
        },
        theme: {
          color: "#6366f1"
        },
        modal: {
          ondismiss: function() {
            setIsLoading(false);
            toast({
              title: "Payment cancelled",
              description: "Please complete payment to activate your account.",
              variant: "destructive"
            });
          }
        }
      };

      const rzp = new RazorpayCtor(options);
      rzp.open();
    } catch (error: any) {
      console.error("Payment error:", error);
      toast({
        title: "Payment error",
        description: error.message || "Failed to process payment. Please try again.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  const handleActivate = async () => {
    if (!brandId) {
      toast({ title: "Brand not found", description: "Reload the page and try again.", variant: "destructive" });
      return;
    }
    setIsActivating(true);
    setActivationError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/activate`, {
        method: 'POST',
        headers: { 'x-onboarding-flow': '1' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Activation failed');
      const data = await res.json().catch(() => ({}));
      const status = String(data?.status || "");
      if (status === "already_completed") {
        toast({
          title: "Brand already activated",
          description: "Opening your dashboard.",
        });
        setLocation("/app/dashboard");
        return;
      }
      if (status === "already_running" || status === "started") {
        setActivationStatus('running');
        return;
      }
      setActivationStatus('running');
    } catch (err: any) {
      setActivationError('Could not start activation. Please try again.');
      setIsActivating(false);
    }
  };

  const handleNext = async () => {
    switch (step) {
      case 1: return handleStep1();
      case 2: return handleStep2();
      case 3: return handleStep3();
      case 4: return handleStep4();
      case 5: return handleStep5();
      case 6: return handleFinish();
      case 7: return; // Activation step — handleActivate is called separately
    }
  };

  const selectedPlanName = selectedApiPlan?.displayName || `${selectedPlan.charAt(0).toUpperCase()}${selectedPlan.slice(1)}`;
  const selectedPlanPrice = selectedApiPlan?.monthlyPrice ?? (
    selectedPlan === "starter" ? 30 : selectedPlan === "growth" ? 100 : selectedPlan === "enterprise" ? 1000 : 0
  );

  const totalSteps = 7;
  const stepLabels = ["Brand", "Details", "Plan", "Topics", "Prompts", "Confirm", "Activate"];

  return (
    <div className="max-w-5xl mx-auto py-12 animate-in fade-in duration-700">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-display font-bold mb-2">Setup Your Brand</h1>
        <p className="text-muted-foreground">Complete these steps to activate your AI visibility intelligence.</p>
      </div>

      <div className="flex items-center justify-center mb-12">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((i) => (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border-2 transition-all
                ${step >= i
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-background border-muted text-muted-foreground"}
              `}>
                {step > i ? <Check className="h-4 w-4" /> : i}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1">{stepLabels[i - 1]}</span>
            </div>
            {i < totalSteps && (
              <div className={`w-12 h-0.5 mx-1 ${step > i ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>

      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>
            {step === 1 && "Brand Identity"}
            {step === 2 && "Brand Details & Competitors"}
            {step === 3 && "Choose Your Plan"}
            {step === 4 && "Topic Clusters"}
            {step === 5 && "Target Prompts"}
            {step === 6 && "Confirm & Pay"}
            {step === 7 && "Activate Your Brand"}
          </CardTitle>
          <CardDescription>
            {step === 1 && (businessChannel === "shopify"
              ? "Enter your Shopify store URL (custom domain or .myshopify.com)."
              : businessChannel === "amazon_seller"
                ? "Enter your brand storefront or primary domain for agent readiness."
                : "Start by entering your brand domain to auto-detect your brand info.")}
            {step === 2 && "Review your brand details and add up to 3 competitors."}
            {step === 3 && "Select a subscription to unlock features."}
            {step === 4 && `AI-generated topics for your brand. Select up to ${topicLimitLabel} (${selectedPlan} plan).`}
            {step === 5 && `AI-generated prompts to monitor. Select up to ${promptLimitLabel} (${selectedPlan} plan).`}
            {step === 6 && "Complete payment to activate your account. Free plan uses a ₹1 card verification."}
            {step === 7 && "Run your first AI visibility analysis."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>How do you sell?</Label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {CHANNEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setBusinessChannel(opt.id)}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                        businessChannel === opt.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <opt.icon className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
                      <div>
                        <p className="font-medium text-sm">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.hint}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">
                  {businessChannel === "shopify" ? "Store URL" : businessChannel === "amazon_seller" ? "Storefront / brand domain" : "Brand Domain"}
                </Label>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    id="domain"
                    placeholder={businessChannel === "shopify" ? "e.g. mystore.com or brand.myshopify.com" : "e.g. acme.com"}
                    className="font-mono flex-1"
                    value={brandDomain}
                    onChange={(e) => setBrandDomain(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleStep1()}
                    data-testid="input-brand-domain"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  We'll auto-detect your brand info and create your profile.
                </p>
              </div>

            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {brandLogo && (
                <div className="flex items-center gap-3 mb-2">
                  {!logoLoadFailed ? (
                    <img
                      src={brandLogo}
                      alt={brandName}
                      className="w-10 h-10 rounded-md object-contain border"
                      onError={() => setLogoLoadFailed(true)}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-md border flex items-center justify-center text-xs font-semibold bg-muted">
                      {brandName?.charAt(0)?.toUpperCase() || "B"}
                    </div>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {logoLoadFailed ? "Brand logo detected (preview unavailable)" : "Brand logo detected"}
                  </span>
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Brand Name (Title)</Label>
                  <Input
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    data-testid="input-brand-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slogan</Label>
                  <Input
                    value={brandSlogan}
                    onChange={(e) => setBrandSlogan(e.target.value)}
                    placeholder="Brand slogan or tagline"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Input
                    value={brandIndustry}
                    onChange={(e) => setBrandIndustry(e.target.value)}
                    placeholder="e.g. Enterprise Software"
                    data-testid="input-brand-industry"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sub-Industry</Label>
                  <Input
                    value={brandSubindustry}
                    onChange={(e) => setBrandSubindustry(e.target.value)}
                    placeholder="e.g. CRM Software"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Description (About Brand)</Label>
                  <Textarea
                    value={brandDescription}
                    onChange={(e) => setBrandDescription(e.target.value)}
                    placeholder="Brief description of your brand..."
                    data-testid="input-brand-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={brandCity}
                    onChange={(e) => setBrandCity(e.target.value)}
                    placeholder="e.g. San Francisco"
                  />
                </div>
                <div className="space-y-2">
                  <Label>State/Province</Label>
                  <Input
                    value={brandState}
                    onChange={(e) => setBrandState(e.target.value)}
                    placeholder="e.g. California"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input
                    value={brandCountry}
                    onChange={(e) => setBrandCountry(e.target.value)}
                    placeholder="e.g. United States"
                  />
                </div>
                <div className="space-y-2">
                  <Label>LinkedIn URL</Label>
                  <Input
                    value={brandLinkedinUrl}
                    onChange={(e) => setBrandLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/company/..."
                  />
                </div>
              </div>

              {(agentReadinessTeaser?.loading || (agentReadinessTeaser && !agentReadinessTeaser.loading)) && (
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bot className="h-5 w-5 text-primary" />
                      Agent Readiness
                      {agentReadinessTeaser.loading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />
                      ) : (
                        <Badge variant="outline" className="ml-auto">{agentReadinessTeaser.score}/100</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {agentReadinessTeaser.loading
                        ? "Scanning your site for AI agent readiness…"
                        : `${agentReadinessTeaser.issueCount} issue${agentReadinessTeaser.issueCount === 1 ? "" : "s"} found · Full report on Growth plan`}
                    </CardDescription>
                  </CardHeader>
                  {!agentReadinessTeaser.loading && agentReadinessTeaser.topIssues.length > 0 && (
                    <CardContent className="pt-0 space-y-2">
                      {agentReadinessTeaser.topIssues.slice(0, 3).map((issue) => (
                        <p key={issue.label} className="text-sm text-muted-foreground">• {issue.label}: {issue.message}</p>
                      ))}
                      <p className="text-xs text-primary pt-1">Unlock fix steps and monthly re-scans on Growth.</p>
                    </CardContent>
                  )}
                </Card>
              )}

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label>
                    {businessChannel === "amazon_seller" ? "Competing brands (domains)" : "Competitors (Max 3)"}
                  </Label>
                  {competitors.length < 3 && (
                    <Button variant="ghost" size="sm" onClick={addCompetitor} className="h-6 text-xs" data-testid="button-add-competitor">
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  )}
                </div>
                {suggestedCompetitors.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Suggested from web research — edit or replace as needed.
                  </p>
                )}
                {competitors.map((comp, idx) => (
                  <div key={idx} className="flex gap-2 flex-wrap">
                    <Input
                      placeholder="Name"
                      value={comp.name}
                      onChange={(e) => updateCompetitor(idx, "name", e.target.value)}
                      className="flex-1 min-w-[120px]"
                      data-testid={`input-competitor-name-${idx}`}
                    />
                    <Input
                      placeholder="domain.com"
                      value={comp.domain}
                      onChange={(e) => updateCompetitor(idx, "domain", e.target.value)}
                      className="flex-1 min-w-[120px] font-mono"
                      data-testid={`input-competitor-domain-${idx}`}
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeCompetitor(idx)} disabled={competitors.length === 1} data-testid={`button-remove-competitor-${idx}`}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              {/* Value Messaging Header */}
              <div className="p-4 bg-gradient-to-r from-primary/5 to-emerald-500/5 rounded-lg border">
                <h3 className="font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Choose the plan that fits your goals
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Each plan monitors your brand across ChatGPT, Claude, Gemini, Perplexity and more.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {(availablePlans.length > 0
                  ? availablePlans.map((plan) => ({
                      key: plan.id,
                      label: plan.displayName,
                      price: plan.monthlyPrice <= 0 ? "Free" : `₹${plan.monthlyPrice}/mo`,
                      tagline: plan.monthlyPrice <= 0 ? "Exploring AI visibility basics" :
                               plan.id === 'starter' ? "Active monitoring and optimization" :
                               plan.id === 'growth' ? "Full competitive intelligence" : "Enterprise-grade AI visibility",
                      features: [
                        `${plan.maxCompetitors === -1 ? "Unlimited" : plan.maxCompetitors} Competitors`,
                        `${plan.maxTopics === -1 ? "Unlimited" : plan.maxTopics} Topics`,
                        `${plan.maxPrompts === -1 ? "Unlimited" : plan.maxPrompts} Prompts`,
                        `${(plan.refreshFrequency || "weekly").charAt(0).toUpperCase()}${(plan.refreshFrequency || "weekly").slice(1)} Updates`,
                        ...(plan.monthlyPrice > 0 ? ["Email alerts", "Weekly reports"] : []),
                      ],
                      roi: plan.monthlyPrice > 0 ? `+${Math.round(10 + plan.monthlyPrice / 50)} visibility pts/mo` : null,
                    }))
                  : [
                      {
                        key: "free", label: "Free", price: "Free",
                        tagline: "Exploring AI visibility basics",
                        features: [`${PLAN_LIMITS.free.maxCompetitors} Competitors`, `${PLAN_LIMITS.free.maxTopics} Topics`, `${PLAN_LIMITS.free.maxQueries} Prompts`, "Weekly Updates"],
                        roi: null
                      },
                      {
                        key: "starter", label: "Starter", price: "₹499/mo",
                        tagline: "Active monitoring and optimization",
                        features: [`${PLAN_LIMITS.starter?.maxCompetitors || 5} Competitors`, `${PLAN_LIMITS.starter?.maxTopics || 10} Topics`, `${PLAN_LIMITS.starter?.maxQueries || 20} Prompts`, "Daily Updates", "Email alerts"],
                        roi: "+10 visibility pts/mo"
                      },
                      {
                        key: "growth", label: "Growth", price: "₹1,000/mo",
                        tagline: "Full competitive intelligence",
                        features: [`${PLAN_LIMITS.growth?.maxCompetitors || 10} Competitors`, `${PLAN_LIMITS.growth?.maxTopics || 20} Topics`, `${PLAN_LIMITS.growth?.maxQueries || 50} Prompts`, "Daily Updates", "Email alerts", "Weekly reports"],
                        roi: "+20 visibility pts/mo"
                      },
                    ]).map((plan) => (
                  <div
                    key={plan.key}
                    className={`p-5 border rounded-lg cursor-pointer transition-all space-y-3 ${
                      selectedPlan === plan.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-muted-foreground/30"
                    }`}
                    onClick={() => setSelectedPlan(plan.key)}
                    data-testid={`plan-${plan.key}`}
                  >
                    {/* Plan Header */}
                    <div className="text-center">
                      <h3 className="font-bold text-lg">{plan.label}</h3>
                      <div className="text-2xl font-bold font-mono mt-1">{plan.price}</div>
                      {plan.tagline && (
                        <p className="text-xs text-muted-foreground mt-1">{plan.tagline}</p>
                      )}
                    </div>

                    {/* ROI Projection */}
                    {plan.roi && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 text-center">
                        <span className="text-xs font-medium text-emerald-700">
                          Est. {plan.roi}
                        </span>
                      </div>
                    )}

                    {/* Features */}
                    <ul className="text-xs text-muted-foreground space-y-1.5">
                      {(plan as any).features.map((f: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    {selectedPlan === plan.key && (
                      <Badge variant="default" className="w-full justify-center text-xs">Selected</Badge>
                    )}
                  </div>
                ))}
              </div>

              {/* Upgrade Recommendation for free users */}
              {selectedPlan === 'free' && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm text-amber-800">Want better results?</p>
                      <p className="text-xs text-amber-700 mt-1">
                        Brands on Growth plan see +20 visibility points in first month. That's estimated 200+ more AI referrals/month.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 bg-muted/30 space-y-4">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <Label className="text-base font-semibold">Establish Entity Presence</Label>
                  <Badge variant="secondary" className="text-xs">GEO foundation</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  GEO is about entity building. Help AI systems understand who you are before we monitor how they talk about you.
                </p>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={entitySubStep === "description" ? "default" : "outline"}
                    onClick={() => setEntitySubStep("description")}
                  >
                    1. Description
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={entitySubStep === "people" ? "default" : "outline"}
                    onClick={() => setEntitySubStep("people")}
                  >
                    2. People
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={entitySubStep === "links" ? "default" : "outline"}
                    onClick={() => setEntitySubStep("links")}
                  >
                    3. Authority links
                  </Button>
                </div>

                {entitySubStep === "description" && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">One-line description</Label>
                      <Input
                        className="mt-1"
                        placeholder="Acme is the leading B2B platform for..."
                        value={entityShortDesc}
                        onChange={(e) => setEntityShortDesc(e.target.value)}
                        data-testid="entity-short-desc"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Full description</Label>
                      <Textarea
                        className="mt-1"
                        rows={3}
                        placeholder="Acme was founded in 2020 by..."
                        value={entityFullDesc}
                        onChange={(e) => setEntityFullDesc(e.target.value)}
                        data-testid="entity-full-desc"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Aliases (comma-separated)</Label>
                      <Input
                        className="mt-1"
                        placeholder="Acme, ACME Inc"
                        value={entityAliases}
                        onChange={(e) => setEntityAliases(e.target.value)}
                        data-testid="entity-aliases"
                      />
                    </div>
                  </div>
                )}

                {entitySubStep === "people" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Add founders, key team members, or authors. We'll enrich each with public profile data.
                    </p>
                    {entityPeople.map((p, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          placeholder="Name"
                          value={p.name}
                          onChange={(e) => {
                            const next = [...entityPeople];
                            next[i] = { ...next[i], name: e.target.value };
                            setEntityPeople(next);
                          }}
                        />
                        <Input
                          placeholder="Role"
                          value={p.role}
                          onChange={(e) => {
                            const next = [...entityPeople];
                            next[i] = { ...next[i], role: e.target.value };
                            setEntityPeople(next);
                          }}
                        />
                        <Input
                          placeholder="Wikipedia (optional)"
                          value={p.wikipedia}
                          onChange={(e) => {
                            const next = [...entityPeople];
                            next[i] = { ...next[i], wikipedia: e.target.value };
                            setEntityPeople(next);
                          }}
                        />
                        {entityPeople.length > 1 && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => setEntityPeople(entityPeople.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEntityPeople([...entityPeople, { name: "", role: "", wikipedia: "" }])}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add person
                    </Button>
                  </div>
                )}

                {entitySubStep === "links" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Authority links (Crunchbase, Wikipedia, official profiles) that reinforce your identity.
                    </p>
                    {entityLinks.map((l, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          placeholder="Label"
                          value={l.label}
                          onChange={(e) => {
                            const next = [...entityLinks];
                            next[i] = { ...next[i], label: e.target.value };
                            setEntityLinks(next);
                          }}
                        />
                        <Input
                          placeholder="https://..."
                          value={l.url}
                          onChange={(e) => {
                            const next = [...entityLinks];
                            next[i] = { ...next[i], url: e.target.value };
                            setEntityLinks(next);
                          }}
                        />
                        {entityLinks.length > 1 && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => setEntityLinks(entityLinks.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEntityLinks([...entityLinks, { label: "", url: "", category: "authority" }])}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add link
                    </Button>
                  </div>
                )}

                <p className="text-xs text-muted-foreground italic">
                  You can edit and expand this any time on the Entity Profile page.
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <Label className="text-base">AI-Generated Topics</Label>
                </div>
                <Badge variant="outline">
                  {selectedTopics.length} / {topicLimitLabel} selected
                </Badge>
              </div>
              {!topicsGenerated || topicSuggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mb-2" />
                  <p className="text-sm">Generating topics with AI...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {topicSuggestions.map(topic => {
                    const isSelected = selectedTopics.includes(topic);
                    const isDisabled = !isSelected && selectedTopics.length >= topicLimit;
                    return (
                      <div
                        key={topic}
                        className={`flex items-center space-x-2 border p-3 rounded-md cursor-pointer transition-all ${
                          isSelected ? "border-primary bg-primary/5" : isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent"
                        }`}
                        onClick={() => !isDisabled && toggleTopic(topic)}
                        data-testid={`topic-${topic.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label className="text-sm font-medium flex-1 cursor-pointer">{topic}</label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <Label className="text-base">AI-Generated Prompts</Label>
                </div>
                <Badge variant="outline">
                  {selectedQueries.length} / {promptLimitLabel} selected
                </Badge>
              </div>
              {!queriesGenerated || querySuggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mb-2" />
                  <p className="text-sm">Generating prompts with AI...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {querySuggestions.map(query => {
                    const isSelected = selectedQueries.includes(query);
                    const isDisabled = !isSelected && selectedQueries.length >= promptLimit;
                    return (
                      <div
                        key={query}
                        className={`flex items-center gap-2 text-sm p-3 rounded-md cursor-pointer transition-all ${
                          isSelected ? "border border-primary bg-primary/5" : isDisabled ? "border opacity-50 cursor-not-allowed" : "border hover:bg-accent"
                        }`}
                        onClick={() => !isDisabled && toggleQuery(query)}
                        data-testid={`query-${query.replace(/\s+/g, '-').toLowerCase().slice(0, 30)}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span>{query}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6">
              {/* What You'll Get Summary */}
              <div className="p-5 bg-gradient-to-br from-primary/5 to-emerald-500/5 rounded-lg border">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Here's what you get:
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <BarChart3 className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Dashboard showing</p>
                      <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        <li>• Your visibility score across ChatGPT, Claude, Gemini, Perplexity</li>
                        <li>• How you compare to {competitors.filter(c => c.domain.trim()).length || 'your'} competitors</li>
                        <li>• Where you're cited and where you should be</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Weekly email report with</p>
                      <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        <li>• Score changes and trend analysis</li>
                        <li>• New opportunities and competitor moves</li>
                        <li>• Actionable recommendations</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    First visibility analysis typically completes within 2-3 minutes.
                    You'll get notified when your score is ready.
                  </p>
                </div>
              </div>

              <div className="p-4 border rounded-md bg-card/50">
                <h3 className="font-semibold mb-3">Setup Summary</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Brand:</span>
                    <span className="ml-2 font-medium">{brandName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Domain:</span>
                    <span className="ml-2 font-mono text-xs">{brandDomain}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Plan:</span>
                    <Badge variant="outline" className="ml-2">{selectedPlanName}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Industry:</span>
                    <span className="ml-2">{brandIndustry || "Not set"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Topics:</span>
                    <span className="ml-2">{selectedTopics.length} selected</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Prompts:</span>
                    <span className="ml-2">{selectedQueries.length} selected</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Competitors:</span>
                    <span className="ml-2">{competitors.filter(c => c.domain.trim()).length} added</span>
                  </div>
                </div>
              </div>

              {selectedPlanPrice <= 0 ? (
                <div className="p-4 border rounded-md bg-primary/5 text-center space-y-2">
                  <CreditCard className="h-8 w-8 mx-auto text-primary" />
                  <p className="font-medium">Free Plan Selected</p>
                  <p className="text-sm text-muted-foreground">
                    No payment required. Click "Activate Account" to complete setup and start analyzing your brand's AI visibility.
                  </p>
                </div>
              ) : (
                <div className="p-4 border rounded-md bg-primary/5 text-center space-y-3">
                  <CreditCard className="h-8 w-8 mx-auto text-primary" />
                  <div>
                    <p className="font-medium text-lg">{selectedPlanName} Plan</p>
                    <p className="text-2xl font-bold text-primary mt-1">
                      ₹{selectedPlanPrice}<span className="text-sm font-normal text-muted-foreground">/month</span>
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Payment will be processed securely via Razorpay.
                    Click "Activate Account" to complete payment and activate your subscription.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-6">
              {activationStatus === 'running' ? (
                brandId ? (
                  <ActivationProgress brandId={brandId} onComplete={() => setLocation("/app/dashboard")} />
                ) : null
              ) : (
                <div className="flex flex-col items-center gap-6 py-8">
                  <h2 className="text-xl font-semibold">You're all set!</h2>
                  <p className="text-muted-foreground text-center max-w-md">
                    Click Activate to run your first AI visibility analysis.
                    This typically takes 2–3 minutes.
                  </p>
                  <Button size="lg" onClick={handleActivate} disabled={isActivating}>
                    {isActivating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {isActivating ? 'Starting...' : 'Activate Brand'}
                  </Button>
                  {activationError && (
                    <p className="text-destructive text-sm">{activationError}</p>
                  )}
                </div>
              )}
            </div>
          )}

        </CardContent>
        <CardFooter className="flex justify-between border-t pt-6 flex-wrap gap-2">
          <Button variant="ghost" onClick={() => step > 1 && setStep(step - 1)} disabled={step === 1 || isLoading || step === 7} data-testid="button-onboarding-back">
            Back
          </Button>
          {step !== 7 && (
          <Button
            onClick={handleNext}
            disabled={isLoading}
            className="min-w-[140px]"
            data-testid="button-onboarding-next"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <>
                {step === 6 ? "Proceed to Payment" : step === 3 ? "Generate Topics" : step === 4 ? "Generate Prompts" : "Continue"}
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
