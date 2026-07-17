import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Check, Building2, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import type { PlanCapability } from "@shared/schema";

type LandingPlan = {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: "USD" | "INR";
  popular?: boolean;
  features: string[];
};

type PublicPlan = PlanCapability & {
  currency?: "USD" | "INR";
  baseCurrency?: "USD" | "INR";
};

const FALLBACK_PLANS: LandingPlan[] = [
  {
    id: "free",
    name: "Free",
    description: "Get started with basic AI visibility",
    monthlyPrice: 0,
    annualPrice: 0,
    currency: "USD",
    features: ["1 brand", "2 AI platforms", "Monthly reports", "Basic analytics"],
  },
  {
    id: "starter",
    name: "Starter",
    description: "For teams ready to grow visibility",
    monthlyPrice: 35,
    annualPrice: 28,
    currency: "USD",
    features: ["3 competitor tracking", "Weekly reports", "Advanced analytics"],
  },
  {
    id: "growth",
    name: "Growth",
    description: "Full power for serious brands",
    monthlyPrice: 150,
    annualPrice: 120,
    currency: "USD",
    popular: true,
    features: ["Unlimited competitors", "Daily reports", "Priority support"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Enterprise-grade AI visibility",
    monthlyPrice: 250,
    annualPrice: 200,
    currency: "USD",
    features: ["Unlimited usage", "API access", "Custom integrations"],
  },
];

function formatLimit(value: number) {
  return value === -1 ? "Unlimited" : String(value);
}

function planDescription(planId: string) {
  switch (planId) {
    case "free":
      return "Get started with basic AI visibility";
    case "starter":
      return "For teams ready to grow visibility";
    case "growth":
      return "Full power for serious brands";
    case "enterprise":
      return "Enterprise-grade AI visibility";
    default:
      return "Scale your AI visibility with configurable limits";
  }
}

function planToFeatures(plan: PlanCapability) {
  const features = [
    `${formatLimit(plan.maxCompetitors)} competitors`,
    `${formatLimit(plan.maxTopics)} topics`,
    `${formatLimit(plan.maxPrompts)} prompts`,
    `${formatLimit(plan.maxTeamMembers)} team members`,
    `${formatLimit(plan.dailyQueryLimit ?? 0)} daily queries`,
    `${plan.refreshFrequency} refresh`,
  ];

  if (plan.allowedLlmProviders?.length) {
    features.push(`${plan.allowedLlmProviders.length} AI providers`);
  }
  if (plan.allowedIntegrations?.length) {
    features.push(`${plan.allowedIntegrations.length} integrations`);
  }
  if (plan.exportEnabled) features.push("Export enabled");
  if (plan.apiAccessEnabled) features.push("API access");
  if (plan.prioritySupport) features.push("Priority support");
  if (plan.ssoEnabled) features.push("SSO");
  if (plan.auditLogsEnabled) features.push("Audit logs");

  return features;
}

function mapPlansForLanding(plans: PublicPlan[]): LandingPlan[] {
  return plans
    .filter((plan) => plan.isActive !== false)
    .sort((a, b) => a.monthlyPrice - b.monthlyPrice)
    .map((plan) => {
      const annualPrice = plan.monthlyPrice > 0 ? Math.round(plan.monthlyPrice * 0.8) : 0;
      return {
        id: plan.id,
        name: plan.displayName,
        description: planDescription(plan.id),
        monthlyPrice: plan.monthlyPrice,
        annualPrice,
        currency: String(plan.currency ?? "").trim().toUpperCase() === "INR" ? "INR" : "USD",
        popular: plan.id === "growth",
        features: planToFeatures(plan),
      };
    });
}

function currencySymbol(currency: string) {
  const normalized = String(currency ?? "").trim().toUpperCase();
  return normalized === "INR" || normalized === "₹" ? "₹" : "$";
}

const Pricing = () => {
  const [isAnnual, setIsAnnual] = useState(true);
  const [, setLocation] = useLocation();

  const { data } = useQuery<PublicPlan[]>({
    queryKey: ["/api/plans"],
    queryFn: async () => {
      const res = await fetch("/api/plans");
      if (!res.ok) {
        throw new Error("Failed to load plans");
      }
      return res.json();
    },
  });

  const plans = data && data.length > 0 ? mapPlansForLanding(data) : FALLBACK_PLANS;

  return (
    <section id="pricing" className="py-16 sm:py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-foreground mb-4 animate-fade-up">
            Simple, transparent pricing
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            Start free, then scale as you grow. No hidden fees, cancel anytime.
          </p>

          <div className="flex items-center justify-center gap-3 sm:gap-4 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <span className={`text-sm font-medium transition-colors ${!isAnnual ? "text-foreground" : "text-muted-foreground"}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative w-14 h-7 rounded-full transition-colors ${isAnnual ? "bg-primary" : "bg-muted"}`}
            >
              <div
                className={`absolute top-1 w-5 h-5 rounded-full bg-primary-foreground transition-transform duration-300 ${
                  isAnnual ? "translate-x-8" : "translate-x-1"
                }`}
              />
            </button>
            <span className={`text-sm font-medium transition-colors ${isAnnual ? "text-foreground" : "text-muted-foreground"}`}>
              Annual
              <span className="ml-1 sm:ml-2 px-2 py-0.5 rounded-full bg-secondary/20 text-secondary text-xs">
                Save 20%+
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={plan.id}
              className={`group relative p-5 sm:p-6 rounded-2xl border transition-all duration-500 hover:-translate-y-2 hover:shadow-glow animate-fade-up ${
                plan.popular
                  ? "bg-card border-primary shadow-card lg:scale-105"
                  : "bg-card border-border hover:border-primary/50 hover:shadow-card"
              }`}
              style={{ animationDelay: `${0.1 * index}s` }}
            >
              {plan.popular && (
                <div className="absolute -top-3 sm:-top-4 left-1/2 -translate-x-1/2 px-3 sm:px-4 py-1 rounded-full gradient-primary text-primary-foreground text-xs sm:text-sm font-medium whitespace-nowrap">
                  Most Popular
                </div>
              )}

              <div className="mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-display font-bold text-foreground mb-1 sm:mb-2">
                  {plan.name}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground">{plan.description}</p>
              </div>

              <div className="mb-4 sm:mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-display font-bold text-foreground">
                    {currencySymbol(plan.currency)}{isAnnual ? plan.annualPrice : plan.monthlyPrice}
                  </span>
                  <span className="text-muted-foreground text-sm">/month</span>
                </div>
                {plan.annualPrice > 0 && isAnnual && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Billed {currencySymbol(plan.currency)}{plan.annualPrice * 12}/year
                  </p>
                )}
                {plan.monthlyPrice > 0 && !isAnnual && (
                  <p className="text-xs text-muted-foreground mt-1">Billed monthly</p>
                )}
              </div>

              <Button
                className={`w-full mb-4 sm:mb-6 transition-all duration-300 group-hover:scale-105 ${
                  plan.popular ? "gradient-primary text-primary-foreground shadow-soft hover:shadow-glow" : ""
                }`}
                variant={plan.popular ? "default" : "outline"}
                onClick={() => setLocation("/auth/sign-up")}
              >
                Get Started
              </Button>

              <ul className="space-y-2 sm:space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 sm:gap-3">
                    <div className="w-4 sm:w-5 h-4 sm:h-5 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-2.5 sm:w-3 h-2.5 sm:h-3 text-secondary" />
                    </div>
                    <span className="text-xs sm:text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="max-w-2xl mx-auto mt-8 sm:mt-12 animate-fade-up" style={{ animationDelay: "0.5s" }}>
          <div className="group p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-[hsl(var(--gradient-from)/0.1)] via-[hsl(var(--gradient-via)/0.1)] to-[hsl(var(--gradient-to)/0.1)] border border-primary/20 hover:border-primary/40 hover:shadow-glow transition-all duration-500">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <div className="w-14 h-14 rounded-xl gradient-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Building2 className="w-7 h-7 text-primary-foreground" />
              </div>
              <div className="text-center sm:text-left flex-1">
                <h3 className="text-xl font-display font-bold text-foreground mb-1">
                  Enterprise & Agencies
                </h3>
                <p className="text-muted-foreground text-sm">
                  Custom plans tailored to your needs. Contact us to learn more about volume discounts, dedicated support, and custom integrations.
                </p>
              </div>
              <Button
                className="gradient-primary text-primary-foreground shadow-soft hover:shadow-glow transition-all group-hover:scale-105"
                onClick={() => setLocation("/auth/sign-up")}
              >
                Contact Us
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
