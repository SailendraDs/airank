
export interface Brand {
  id: string;
  name: string;
  domain: string;
  logo: string;
  tier: "free" | "starter" | "growth" | "enterprise";
  visibilityScore: number; // 0-100
  sentimentScore: number; // -100 to 100
}

export interface Competitor {
  id: string;
  name: string;
  domain: string;
  visibilityScore: number;
}

export interface Insight {
  id: string;
  type: "gap" | "opportunity" | "risk";
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
}

// Note: CURRENT_BRAND has been removed. Use useCurrentBrand() hook instead to fetch real brand data.

export const COMPETITORS: Competitor[] = [
  { id: "c1", name: "Globex", domain: "globex.com", visibilityScore: 65 },
  { id: "c2", name: "Soylent", domain: "soylent.corp", visibilityScore: 88 },
  { id: "c3", name: "Initech", domain: "initech.com", visibilityScore: 42 },
];

export const INSIGHTS: Insight[] = [
  {
    id: "i1",
    type: "gap",
    title: "Missing from 'Top Enterprise SaaS' lists in GPT-4",
    description: "Competitors Globex and Soylent appear in 8/10 prompts related to enterprise SaaS. Acme appears in 2/10.",
    impact: "high",
  },
  {
    id: "i2",
    type: "opportunity",
    title: "Citation needed on Wikipedia",
    description: "Your brand is mentioned in a high-traffic Wikipedia article but lacks a citation linking back to your domain.",
    impact: "medium",
  },
  {
    id: "i3",
    type: "risk",
    title: "Hallucination Risk: Pricing",
    description: "Claude 3 is consistently quoting your old pricing model ($50/mo) instead of the new tier structure.",
    impact: "high",
  },
];

export const VISIBILITY_TRENDS = [
  { date: "Jan 1", score: 65 },
  { date: "Jan 8", score: 68 },
  { date: "Jan 15", score: 66 },
  { date: "Jan 22", score: 70 },
  { date: "Jan 29", score: 72 },
  { date: "Feb 5", score: 74 },
  { date: "Feb 12", score: 72 },
];

export const PLATFORM_PERFORMANCE = [
  { platform: "GPT-4", score: 85, fill: "var(--color-chart-1)" },
  { platform: "Claude 3", score: 62, fill: "var(--color-chart-2)" },
  { platform: "Gemini", score: 78, fill: "var(--color-chart-3)" },
  { platform: "Perplexity", score: 92, fill: "var(--color-chart-4)" },
  { platform: "Google SGE", score: 45, fill: "var(--color-chart-5)" },
];
