export type TimeWindow = "7d" | "28d" | "90d" | "custom";
export type PlanTier = "free" | "starter" | "growth" | "enterprise";

export interface PlanCapabilities {
  maxCompetitors: number;
  maxTopics: number;
  maxQueries: number;
  maxTeamMembers: number;
  integrationsAllowed: string[];
  exportsAllowed: boolean;
  promptLimits: number;
  canTrackUntrackedCompetitors: boolean;
  canConnectGSC: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanCapabilities> = {
  free: {
    maxCompetitors: 3,
    maxTopics: 3,
    maxQueries: 6,
    maxTeamMembers: 1,
    integrationsAllowed: [],
    exportsAllowed: false,
    promptLimits: 6,
    canTrackUntrackedCompetitors: false,
    canConnectGSC: false,
  },
  starter: {
    maxCompetitors: 5,
    maxTopics: 10,
    maxQueries: 100,
    maxTeamMembers: 3,
    integrationsAllowed: ["gsc", "twitter"],
    exportsAllowed: false,
    promptLimits: 200,
    canTrackUntrackedCompetitors: true,
    canConnectGSC: true,
  },
  growth: {
    maxCompetitors: 15,
    maxTopics: 50,
    maxQueries: 500,
    maxTeamMembers: 10,
    integrationsAllowed: ["gsc", "twitter", "linkedin", "reddit"],
    exportsAllowed: true,
    promptLimits: 1000,
    canTrackUntrackedCompetitors: true,
    canConnectGSC: true,
  },
  enterprise: {
    maxCompetitors: 100,
    maxTopics: 9999,
    maxQueries: 9999,
    maxTeamMembers: 9999,
    integrationsAllowed: ["all"],
    exportsAllowed: true,
    promptLimits: 9999,
    canTrackUntrackedCompetitors: true,
    canConnectGSC: true,
  },
};

export interface Brand {
  id: string;
  name: string;
  domain: string;
  logo: string;
  tier: PlanTier;
  entityType: string; // e.g., "Platform", "SaaS"
  coreTopics: string[];
}

export interface Competitor {
  id: string;
  name: string;
  domain: string;
  logo: string;
  visibilityScore: number;
  trend7d: number; // delta
  avgRank: number;
  mentions: number;
  trafficEst: number;
  threatScore: number;
  promptOverlapPct: number;
  topDominatedDomains: string[];
  isTracked: boolean;
  riskLevel?: "High" | "Medium" | "Low";
  riskReason?: string;
}

export interface Model {
  id: string;
  name: string; // ChatGPT, Gemini, Perplexity, etc.
  icon: string;
}

export interface Prompt {
  id: string;
  text: string;
  category: string;
  modelsCovered: string[]; // Model IDs
  avgRank: number;
  visibilityPct: number;
  topCompetitorId: string;
  isBrandPresent: boolean;
  trend: "up" | "down" | "flat";
  priorityScore: number; // Impact * Difficulty
  trafficImpact: number; // Estimated visits
  actionState: "open" | "assigned" | "fixed";
}

export interface SourceDomain {
  domain: string;
  authority: number; // DA
  totalCitations: number;
  uniquePages: number;
  dominantBrandId: string; // Brand or Competitor ID
  models: string[]; // Model IDs where it appears
  trend: "up" | "down" | "flat";
  actionability: "acquire_backlink" | "publish_content" | "partner" | "ignore";
  isBrandAbsent: boolean;
}

export interface IntegrationStatus {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  lastSync?: string;
  hasIssues?: boolean;
}

// --- MOCK DATA ---
// Note: CURRENT_BRAND has been removed. Use useCurrentBrand() hook instead to fetch real brand data.

export const MODELS: Model[] = [
  { id: "gpt4", name: "GPT-4", icon: "openai" },
  { id: "claude3", name: "Claude 3", icon: "anthropic" },
  { id: "gemini", name: "Gemini", icon: "google" },
  { id: "perplexity", name: "Perplexity", icon: "perplexity" },
];

export const COMPETITORS: Competitor[] = [
  { 
    id: "c1", name: "Globex", domain: "globex.com", logo: "https://ui-avatars.com/api/?name=Globex", 
    visibilityScore: 65, trend7d: 2.4, avgRank: 3.2, mentions: 1240, trafficEst: 5400,
    threatScore: 85, promptOverlapPct: 78, topDominatedDomains: ["techcrunch.com", "g2.com"], isTracked: true 
  },
  { 
    id: "c2", name: "Soylent", domain: "soylent.corp", logo: "https://ui-avatars.com/api/?name=Soylent", 
    visibilityScore: 88, trend7d: -1.2, avgRank: 1.8, mentions: 3100, trafficEst: 12500,
    threatScore: 92, promptOverlapPct: 45, topDominatedDomains: ["wikipedia.org", "forbes.com"], isTracked: true
  },
  { 
    id: "c3", name: "Initech", domain: "initech.com", logo: "https://ui-avatars.com/api/?name=Initech", 
    visibilityScore: 42, trend7d: 5.1, avgRank: 6.5, mentions: 450, trafficEst: 1200,
    threatScore: 40, promptOverlapPct: 20, topDominatedDomains: ["reddit.com"], isTracked: true
  },
  {
      id: "c4", name: "Umbrella Corp", domain: "umbrella.com", logo: "https://ui-avatars.com/api/?name=Umbrella",
      visibilityScore: 75, trend7d: 0, avgRank: 2.5, mentions: 1500, trafficEst: 6000,
      threatScore: 70, promptOverlapPct: 60, topDominatedDomains: [], isTracked: false,
      riskLevel: "High", riskReason: "Appears in top-3 for 25% of your target prompts"
  }
];

export const PROMPTS: Prompt[] = [
  { id: "p1", text: "Best enterprise AI platforms 2024", category: "Evaluation", modelsCovered: ["gpt4", "claude3"], avgRank: 4.2, visibilityPct: 20, topCompetitorId: "c2", isBrandPresent: true, trend: "up", priorityScore: 85, trafficImpact: 1200, actionState: "open" },
  { id: "p2", text: "Acme Corp pricing vs Globex", category: "Comparison", modelsCovered: ["gpt4", "gemini"], avgRank: 2.1, visibilityPct: 60, topCompetitorId: "c1", isBrandPresent: true, trend: "flat", priorityScore: 45, trafficImpact: 450, actionState: "open" },
  { id: "p3", text: "Top logistics software for supply chain", category: "Discovery", modelsCovered: ["perplexity"], avgRank: 9.0, visibilityPct: 0, topCompetitorId: "c2", isBrandPresent: false, trend: "down", priorityScore: 92, trafficImpact: 2500, actionState: "assigned" },
  { id: "p4", text: "How to optimize widget workflows", category: "Informational", modelsCovered: ["gpt4", "claude3", "gemini"], avgRank: 1.5, visibilityPct: 90, topCompetitorId: "b1", isBrandPresent: true, trend: "up", priorityScore: 20, trafficImpact: 800, actionState: "fixed" },
];

export const SOURCES: SourceDomain[] = [
  { domain: "wikipedia.org", authority: 98, totalCitations: 1540, uniquePages: 45, dominantBrandId: "c2", models: ["gpt4", "gemini", "claude3"], trend: "flat", actionability: "ignore", isBrandAbsent: false },
  { domain: "g2.com", authority: 89, totalCitations: 850, uniquePages: 120, dominantBrandId: "c1", models: ["gpt4", "perplexity"], trend: "up", actionability: "acquire_backlink", isBrandAbsent: true },
  { domain: "techcrunch.com", authority: 92, totalCitations: 420, uniquePages: 15, dominantBrandId: "c1", models: ["perplexity"], trend: "down", actionability: "partner", isBrandAbsent: true },
  { domain: "reddit.com", authority: 90, totalCitations: 3200, uniquePages: 540, dominantBrandId: "c3", models: ["gpt4", "claude3", "gemini", "perplexity"], trend: "up", actionability: "publish_content", isBrandAbsent: false },
];

export const INTEGRATIONS: IntegrationStatus[] = [
    { id: "gsc", name: "Google Search Console", icon: "google", connected: true, lastSync: "2 hours ago" },
    { id: "twitter", name: "X (Twitter)", icon: "twitter", connected: true, lastSync: "10 mins ago" },
    { id: "linkedin", name: "LinkedIn", icon: "linkedin", connected: false },
    { id: "reddit", name: "Reddit", icon: "reddit", connected: false },
];
