# GeoScore: AI Visibility Excellence Strategy
**Date:** 2026-05-19 (Updated)
**Status:** Strategic Recommendations - Agentic Architecture

---

## 1. Executive Summary

GeoScore is a well-built AI visibility analytics platform with a solid technical foundation. However, the market is crowded with analytics tools, and users are demanding **executors** not just **analysts**.

### The Problem We're Solving
Brands paying $200-2000/year expect **real value**, not just dashboards showing arbitrary scores. Current GEO tools have fundamental flaws:
- Fake prompts that don't reflect real user behavior
- Expensive APIs that eat into margins
- Analytics without actionable execution
- Score manipulation perception issues

### Our Solution: Agentic GEO Stack
```
FROM: LLM API → Analytics → "Your score is 45"

TO:   Intelligent Agents → Real Data → "Here's exactly how to reach 75"
```

---

## 2. New Architecture: The GEO Agent Stack

### Core Principle
**"Agents do the work humans would do - web search, browsing, analysis, optimization"**

### Architecture Overview
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GEO AGENT ORCHESTRATOR                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    BRAND INTELLIGENCE AGENT                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ Google KG   │  │  Wikidata   │  │  Firecrawl  │  │  Apify      │  │   │
│  │  │ (FREE)      │  │  (FREE)     │  │ ($50/mo)    │  │  ($100/mo)  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  │         │               │                │                │             │   │
│  │         └───────────────┴────────────────┴────────────────┘             │   │
│  │                              │                                          │   │
│  │                    ┌─────────▼─────────┐                               │   │
│  │                    │  LLM Enhancement │ (Qwen via OpenRouter)         │   │
│  │                    │  (Only if needed) │                                │   │
│  │                    └───────────────────┘                                │   │
│  │  Output: Real-time brand intelligence (no Context.dev required)        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    PROMPT INTELLIGENCE AGENT                          │   │
│  │                                                                          │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │   │
│  │  │ Reddit Mining   │  │ Search Patterns │  │ Forum Analysis  │       │   │
│  │  │ (Real queries) │  │ (Autocomplete)  │  │ (Real debates)  │       │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │   │
│  │                                                                          │   │
│  │  Output: Real user query patterns (NOT fake analytical prompts)        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ANALYSIS HUB (Intelligent Routing)                  │   │
│  │                                                                          │   │
│  │         ┌───────────────────────┐     ┌───────────────────────┐       │   │
│  │         │   COMPLEX TASKS       │     │   SIMPLE TASKS        │       │   │
│  │         │   (Qwen 3.6 via       │     │   (Qwen 2.5 via       │       │   │
│  │         │    OpenRouter)        │     │    OpenRouter)        │       │   │
│  │         │                       │     │                       │       │   │
│  │         │ • Gap Analysis        │     │ • Sentiment tagging    │       │   │
│  │         │ • Content Generation  │     │ • Topic classification │       │   │
│  │         │ • Strategic Reasoning │     │ • URL normalization    │       │   │
│  │         │ • Citation Extraction │     │ • Deduplication       │       │   │
│  │         └───────────────────────┘     └───────────────────────┘       │   │
│  │                                                                          │   │
│  │  Decision Engine: "Is this complex?" → Route to appropriate model       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ACTION CENTER AGENT                               │   │
│  │                                                                          │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │   │
│  │  │ Content Gen     │  │ Schema Builder  │  │ Citation Builder│       │   │
│  │  │ Agent           │  │ Agent           │  │ Agent           │       │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │   │
│  │                                                                          │   │
│  │  Output: One-click optimizations ready to apply                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Current State Assessment

### 3.1 Strengths (Keep These)
| Area | Status |
|------|--------|
| Database Schema | ✅ Comprehensive, well-organized (35+ tables) |
| Multi-Provider Support | ✅ 7 LLM providers via unified interface |
| Authentication | ✅ Email + OAuth + 2FA + Sessions |
| Payment Integration | ✅ Razorpay with INR support |
| Job Queue System | ✅ Background processing with retry |
| Admin Dashboard | ✅ Full system management |
| Domain Registry | ✅ Cost-saving deduplication |
| AXP Content System | ✅ AI Experience Pages framework |

### 3.2 Critical Gaps (Fix These)

| Gap | Impact | Priority | Solution |
|-----|--------|----------|----------|
| **Context.dev Cost** | Direct operational expense | 🔴 HIGH | Make admin-toggleable (OFF by default) |
| **Prompt Quality** | Analytics accuracy issues | 🔴 HIGH | Real User Prompt Library from Reddit/forums |
| **No Agentic Layer** | Can't do real intelligence gathering | 🔴 HIGH | Crew AI-style orchestration |
| **Google KG Missing** | Free entity data unused | 🟡 MED | Add Knowledge Graph integration |
| **All LLM = Expensive** | High API costs | 🟡 MED | Route to Qwen via OpenRouter for simple tasks |
| **Action Orientation** | No execution features | 🟡 MED | Action Center with LLM-generated content |
| **White-Label** | No agency focus | 🟡 MED | Branded PDF reports |
| **Score Transparency** | Trust issues | 🟡 MED | Show calculation breakdown |

### 3.3 Technical Issues (Fix These)
1. Context.dev API fires on every enrichment (costly) → **Make admin-toggleable**
2. Some workers calling non-existent storage methods → **Audit and fix**
3. Empty states showing mock data → **Proper empty state UI**
4. Citation deduplication needs URL normalization → **Implement URL normalizer**

---

## 4. NEW: Agentic Architecture Details

### 4.1 Brand Intelligence Agent

**Purpose:** Gather brand information without expensive APIs

**Data Sources (In Priority Order):**

```
Priority 1: FREE (Always Use)
├── Google Knowledge Graph API (free tier: 100k/day)
│   └── https://developers.google.com/knowledge-graph
├── Wikidata SPARQL Endpoint (free)
│   └── https://query.wikidata.org/sparql
├── Wikipedia API (free)
│   └── https://en.wikipedia.org/api/rest_v1/
└── LinkedIn Company API (free basic)
    └── Industry, size, description

Priority 2: LOW COST ($50-150/month)
├── Firecrawl ($50/mo)
│   └── Website content extraction, SEO analysis
├── Apify ($100/mo)
│   └── News, reviews, social data
└── NewsAPI (free tier)
    └── Recent press coverage

Priority 3: ADMIN-ONLY (Disabled by Default)
└── Context.dev API
    └── Only enable if explicitly needed
```

**Agent Workflow:**
```
1. Check Domain Registry cache (30-day TTL)
   └── If fresh, return cached data

2. If cache miss or stale:
   a. Query Google KG → Get official entity data
   b. Query Wikidata → Get structured knowledge
   c. Query Wikipedia → Get public description
   d. Firecrawl scrape → Get website content
   e. Apify search → Get news/reviews
   
3. Use Qwen (cheap) to:
   └── Extract and structure data from collected content

4. Cache everything in Domain Registry
```

### 4.2 Prompt Intelligence Agent

**Purpose:** Generate REAL user queries, not fake analytical prompts

**Current Problem:**
```
❌ FAKE PROMPT: "Perform a comprehensive analysis of {Brand} covering 
    nutrition, customer reviews, business performance, marketing strategy..."

✅ REAL PROMPT: "Which is better, Subway or McDonald's?"
✅ REAL PROMPT: "Is Chipotle worth the price?"
✅ REAL PROMPT: "What do users say about Wingstop?"
```

**Agent Workflow:**
```
1. Reddit Mining
   ├── Search r/random, r/brands for "{brand} vs"
   ├── Extract real user comparison queries
   └── Categorize by intent (comparison, review, pricing)

2. Search Autocomplete
   ├── Query Google for "{brand} vs", "{brand} review"
   ├── Extract autocomplete suggestions
   └── Build query templates from real patterns

3. Forum Analysis
   ├── Scrape product forums, Quora, Reddit
   ├── Find real questions people ask
   └── Mine for topic clusters

4. Output: Real User Prompt Library
   └── Hundreds of authentic query patterns
```

### 4.3 Intelligent Model Routing

**Purpose:** Use expensive models only when necessary

**Model Selection Matrix:**

| Task Complexity | Model | Provider | Cost | Use Case |
|-----------------|-------|----------|------|----------|
| **Complex** | GPT-4o | OpenAI | $0.01/1K | Gap analysis, content gen, strategic reasoning |
| **Complex** | Claude 3.5 | Anthropic | $0.01/1K | Citation extraction, nuanced sentiment |
| **Medium** | Qwen 3.6 72B | OpenRouter | $0.001/1K | Content optimization, schema generation |
| **Simple** | Qwen 2.5 32B | OpenRouter/AWS Bedrock | $0.0002/1K | Tagging, classification, dedup, summaries |
| **Batch** | DeepSeek V3 | OpenRouter | $0.0001/1K | High-volume simple tasks |

**Routing Logic:**
```typescript
interface ModelRouter {
  // Determine task complexity
  classifyTask(task: string): 'simple' | 'medium' | 'complex';
  
  // Route to appropriate model
  async route(task: string, context: any): Promise<ModelResponse> {
    const complexity = this.classifyTask(task);
    
    if (complexity === 'simple') {
      return this.callQwen32B(task);  // $0.0002/1K tokens
    } else if (complexity === 'medium') {
      return this.callQwen72B(task);  // $0.001/1K tokens
    } else {
      return this.callGPT4o(task);    // $0.01/1K tokens
    }
  }
}
```

**Cost Savings Example:**
```
Current (all GPT-4o):    1M tokens = $10.00
With intelligent routing: 
  - 70% simple tasks → Qwen 32B = $0.14
  - 20% medium tasks → Qwen 72B = $2.00  
  - 10% complex tasks → GPT-4o = $1.00
  TOTAL: $3.14 (vs $10.00) = 68% savings
```

---

## 5. API Cost Analysis: Before vs After

### 5.1 Brand Enrichment

| Provider | Monthly Cost | Status |
|----------|-------------|--------|
| Context.dev | $200-500 | 🔴 **DISABLED by default (admin toggle)** |
| Google KG | $0 (free tier) | ✅ **ADD - currently missing** |
| Wikidata | $0 | ✅ Already exists |
| Firecrawl | $50/mo | ✅ ADD for content |
| Apify | $100/mo | ✅ ADD for social/news |
| **TOTAL** | **$150/mo** | **vs $350-650/mo** |

### 5.2 LLM Costs

| Model | Tasks | Cost/1M tokens | Monthly Estimate |
|-------|-------|----------------|------------------|
| **BEFORE (All GPT-4o)** | All | $10.00 | $800-2000 |
| GPT-4o | Complex only | $10.00 | $100-200 |
| Qwen 3.6 72B | Medium | $1.00 | $100-300 |
| Qwen 2.5 32B | Simple | $0.20 | $50-100 |
| **TOTAL** | | | **$250-600** |

### 5.3 Grand Total Savings

| Category | Before | After | Savings |
|----------|--------|-------|---------|
| Brand Enrichment | $350-650 | $150 | ~75% |
| LLM APIs | $800-2000 | $250-600 | ~65% |
| **TOTAL/Month** | **$1150-2650** | **$400-750** | **~65%** |

---

## 6. Feature Preservation (Keep from Previous Plan)

### 6.1 Core Features (Existing + Enhanced)

| Feature | Status | Enhancement |
|---------|--------|-------------|
| Multi-LLM Support | ✅ Keep | Add intelligent routing |
| Visibility Scoring | ✅ Keep | Add score transparency UI |
| Competitor Tracking | ✅ Keep | Add real user prompt comparisons |
| Citation Analysis | ✅ Keep | Improve with agentic extraction |
| Trend Tracking | ✅ Keep | Maintain |
| Gap Analysis | ✅ Keep | Add Action Center integration |

### 6.2 New Differentiating Features

| Feature | Priority | Description |
|---------|----------|-------------|
| **Action Center** | 🔴 HIGH | One-click optimization with LLM-generated content |
| **Real User Prompts** | 🔴 HIGH | Prompt Intelligence Agent for authentic queries |
| **Citations Gap Analysis** | 🟡 MED | FOMO driver - show competitor citations |
| **White-Label PDFs** | 🟡 MED | Branded agency reports |
| **GEO vs SEO Dual Scoring** | 🟡 MED | Comparison for SEO-savvy clients |
| **AI Crawler Tracking** | 🟢 LOW | Cloudflare integration |

---

## 7. Implementation Roadmap

### Phase 1: Agentic Foundation (Week 1-2)

```
Day 1-3: Google KG Integration
├── Add Google Knowledge Graph API integration
├── Create KG enrichment worker
├── Map to existing brand entity fields
└── Test on 10 brands

Day 4-7: Context.dev Toggle
├── Make Context.dev admin-toggleable (OFF by default)
├── Add system setting: enable_context_dev
├── Update brand enrichment to check setting
└── Document in admin settings UI

Day 8-10: OpenRouter for Qwen
├── Set up OpenRouter account
├── Add Qwen 3.6 and Qwen 2.5 models
├── Create model router service
└── Update workers to use router

Day 11-14: Real User Prompt Library
├── Create Prompt Intelligence Agent
├── Scrape Reddit/forums for real queries
├── Build prompt template categories
└── Deprecate fake analytical prompts
```

### Phase 2: Action Center (Week 3-4)

```
Day 15-18: Content Optimization Agent
├── Build content analysis agent
├── Generate optimization suggestions
├── Create before/after preview
└── Add "Optimize Now" button

Day 19-22: Gap-to-Action Mapping
├── Connect gap analysis to actions
├── Generate specific recommendations
├── Add estimated impact scores
└── Track optimization history

Day 23-28: Citation Gap Analysis
├── Build source landscape visualization
├── Identify competitor citation sources
├── Show FOMO indicators
└── Add "why you're not cited" explanations
```

### Phase 3: White-Label & Advanced (Week 5-8)

```
Day 29-35: Agency PDF Reports
├── Build PDF template system
├── Add white-label configuration
├── Create branded report generator
└── Add email delivery

Day 36-42: GEO vs SEO Dual Scoring
├── Add SEO score calculation
├── Create comparison visualization
├── Build "close the gap" recommendations
└── Test with SEO-savvy clients

Day 43-56: Crawler Tracking + Attribution
├── Cloudflare integration for crawler tracking
├── Shopify integration for attribution
├── Build revenue dashboard
└── Track AI → conversion journey
```

---

## 8. Database Changes Required

### 8.1 New Tables

```sql
-- Real user prompt categories (from Prompt Intelligence Agent)
CREATE TABLE prompt_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  intent_type TEXT NOT NULL, -- 'comparison', 'review', 'pricing', 'features', 'support'
  source TEXT NOT NULL, -- 'reddit', 'search_autocomplete', 'forum', 'manual'
  prompt_templates JSONB NOT NULL, -- Array of real query templates
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- White-label agency configs
CREATE TABLE agency_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id),
  agency_name TEXT NOT NULL,
  agency_logo_url TEXT,
  primary_color TEXT DEFAULT '#2563EB',
  secondary_color TEXT DEFAULT '#1E40AF',
  website_url TEXT,
  contact_email TEXT,
  custom_domain TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Model routing logs (for cost tracking)
CREATE TABLE model_routing_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL, -- 'simple', 'medium', 'complex'
  model_used TEXT NOT NULL,
  tokens_used INTEGER,
  cost_usd DECIMAL(10, 6),
  task_description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 8.2 Schema Modifications

```sql
-- Add to system_settings for Context.dev toggle
-- (already exists, just ensure it's used)

-- Add prompt quality fields
ALTER TABLE prompts ADD COLUMN realism_score INTEGER;
ALTER TABLE prompts ADD COLUMN user_intent TEXT;
ALTER TABLE prompts ADD COLUMN prompt_category_id TEXT REFERENCES prompt_categories(id);

-- Add model routing config
ALTER TABLE brands ADD COLUMN model_routing_enabled BOOLEAN DEFAULT true;
```

### 8.3 New System Settings

```typescript
// Add to system_settings table
const systemSettings = {
  // Context.dev Control
  'context_dev_enabled': {
    value: 'false',  // OFF by default
    description: 'Enable Context.dev API for brand enrichment (admin only)'
  },
  
  // Model Routing
  'model_routing_enabled': {
    value: 'true',
    description: 'Use intelligent model routing (Qwen for simple, GPT-4o for complex)'
  },
  'complex_task_threshold': {
    value: '0.7',
    description: 'Complexity score threshold for routing to expensive models'
  },
  
  // Agent Configuration
  'prompt_agent_source': {
    value: 'reddit,search,forums',
    description: 'Sources for Real User Prompt Library'
  },
  'knowledge_graph_api_key': {
    value: '',
    description: 'Google Knowledge Graph API key (free tier)'
  }
};
```

---

## 9. API Endpoints Required

### 9.1 Brand Intelligence
```
GET  /api/agents/brand-intelligence?domain={domain}
     └── Returns enriched brand data from KG + Wikidata + scraping

POST /api/agents/enrich-from-sources
     └── Manually trigger enrichment from all sources

GET  /api/settings/llm-routing
PUT  /api/settings/llm-routing
     └── Configure model routing preferences
```

### 9.2 Prompt Intelligence
```
GET  /api/prompts/categories
POST /api/prompts/categories
     └── Manage prompt categories

GET  /api/prompts/generate-from-category?category={id}&brand={brandId}
     └── Generate real user queries for a brand

POST /api/agents/mine-reddit
     └── Trigger Reddit mining for new prompt patterns
```

### 9.3 Action Center
```
POST /api/action-center/optimize
     └── Body: { brandId, gapType, targetUrl }
     └── Returns: LLM-generated optimization suggestions

GET  /api/action-center/suggestions?brandId={id}
     └── Get all pending optimizations for a brand

POST /api/action-center/apply/{suggestionId}
     └── Mark optimization as applied
```

### 9.4 Admin Settings
```
GET  /api/admin/settings/llm-providers
PUT  /api/admin/settings/llm-providers
     └── Enable/disable LLM providers

GET  /api/admin/settings/enrichment
PUT  /api/admin/settings/enrichment
     └── Control Context.dev, KG, Wikidata settings

GET  /api/admin/analytics/model-usage
     └── View model routing costs and usage
```

---

## 10. New Workers Required

```typescript
// Agent workers to add
const agentWorkers = {
  // Brand Intelligence
  'brand-intelligence-agent': {
    description: 'Gather brand data from KG, Wikidata, scraping',
    sources: ['google_kg', 'wikidata', 'firecrawl', 'apify'],
    fallback: 'llm_enhancement'
  },
  
  // Prompt Intelligence  
  'prompt-intelligence-agent': {
    description: 'Mine Reddit/forums for real user queries',
    sources: ['reddit', 'search_autocomplete', 'quora', 'forums'],
    output: 'prompt_categories'
  },
  
  // Content Optimization
  'content-optimization-agent': {
    description: 'Generate specific content improvements',
    inputs: ['gap_analysis', 'brand_content'],
    output: 'optimization_suggestions'
  },
  
  // Model Router (middleware)
  'model-router': {
    description: 'Route tasks to appropriate model based on complexity',
    models: ['qwen_32b', 'qwen_72b', 'gpt_4o', 'claude'],
    strategy: 'complexity_threshold'
  },
  
  // Citation Gap Analysis
  'citation-gap-agent': {
    description: 'Identify citation gaps vs competitors',
    inputs: ['llm_answers', 'competitor_citations'],
    output: 'citation_gaps'
  },
  
  // Crawler Tracking
  'crawler-tracking-agent': {
    description: 'Process Cloudflare logs for AI bot visits',
    sources: ['cloudflare_logs', 'server_logs'],
    output: 'crawl_events'
  }
};
```

---

## 11. Configuration for OpenRouter (Qwen)

```typescript
// server/integrations/llm/openrouter.ts

export const OPENROUTER_MODELS = {
  // Qwen Series (Cheap, Good Quality)
  qwen_qwen_3_72b_instruct: {
    name: 'Qwen 3 72B Instruct',
    provider: 'openrouter',
    costPerMillion: 0.40, // $0.0004/1K tokens
    contextWindow: 32000,
    useCase: 'complex'
  },
  qwen_qwen_2_5_32b_instruct: {
    name: 'Qwen 2.5 32B Instruct',
    provider: 'openrouter', 
    costPerMillion: 0.15, // $0.00015/1K tokens
    contextWindow: 32000,
    useCase: 'simple'
  },
  deepseek_deepseek_v3: {
    name: 'DeepSeek V3',
    provider: 'openrouter',
    costPerMillion: 0.10, // $0.0001/1K tokens
    contextWindow: 64000,
    useCase: 'batch_simple'
  },
  
  // Premium (Only for Complex)
  openai_gpt_4o: {
    name: 'GPT-4o',
    provider: 'openai',
    costPerMillion: 2.50,
    contextWindow: 128000,
    useCase: 'complex_premium'
  },
  anthropic_claude_3_5_sonnet: {
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    costPerMillion: 3.00,
    contextWindow: 200000,
    useCase: 'complex_premium'
  }
};

// Model Router
export class ModelRouter {
  private planProviders: Record<string, string[]>;
  
  classifyComplexity(task: string, context: any): 'simple' | 'medium' | 'complex' {
    // Simple: classification, tagging, dedup, normalization
    // Medium: summarization, content gen, schema creation
    // Complex: strategic reasoning, gap analysis, multi-step
    
    const simpleKeywords = ['tag', 'classify', 'normalize', 'dedupe', 'extract', 'count'];
    const complexKeywords = ['analyze', 'strategy', 'compare', 'evaluate', 'recommend', 'why'];
    
    const simpleScore = simpleKeywords.filter(k => task.toLowerCase().includes(k)).length;
    const complexScore = complexKeywords.filter(k => task.toLowerCase().includes(k)).length;
    
    if (complexScore > simpleScore) return 'complex';
    if (simpleScore > 0) return 'simple';
    return 'medium';
  }
  
  async route(task: string, context: any): Promise<ModelResponse> {
    const complexity = this.classifyComplexity(task, context);
    
    switch (complexity) {
      case 'simple':
        return this.callModel('qwen_qwen_2_5_32b_instruct', task);
      case 'medium':
        return this.callModel('qwen_qwen_3_72b_instruct', task);
      case 'complex':
        return this.callModel('openai_gpt_4o', task);
    }
  }
}
```

---

## 12. Environment Variables (Add These)

```env
# ============================================
# AGENTIC LAYER CONFIGURATION
# ============================================

# OpenRouter (Qwen models - CHEAP)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxx
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Google Knowledge Graph (FREE - add this!)
GOOGLE_KG_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxx

# Content Scraping (cost-effective)
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxx
FIRECRAWL_BASE_URL=https://api.firecrawl.dev/v0

# Data Scraping
APIFY_API_KEY=xxxxxxxxxxxxx

# ============================================
# CONTEXT.DEV (ADMIN TOGGLE ONLY - OFF by default)
# ============================================
# CONTEXT_DEV_API_KEY=cd_xxxxxxxxxxxxx  # DO NOT SET unless admin enables
# CONTEXT_DEV_ENABLED=false              # Admin controlled via DB setting
```

---

## 13. Cost-Benefit for Brands Paying $200-2000/year

### Value Proposition Changes

| Before | After |
|--------|-------|
| "Your score is 45" | "Your score is 45, and here's exactly how to reach 65" |
| "You're mentioned in 20 prompts" | "Your competitors are cited 200 times, you're cited 15. Here's why." |
| "Gap analysis shows issues" | "Click 'Optimize Now' to generate content that fixes these gaps" |
| Generic fake prompts | Real user queries from Reddit, forums, search patterns |

### ROI for Enterprise ($2000/year = $167/month)

| Feature | Value |
|---------|-------|
| Action Center | Saves 5+ hours/month of manual optimization work |
| Real User Prompts | Accuracy improvement = actionable insights |
| White-Label Reports | Agency can charge clients $500-2000 for GEO audits |
| Citation Gap Analysis | Identifies $10K+ in missed opportunities |
| **Total Value** | **$500-2000/month equivalent** |

---

## 14. Competitive Differentiation

| Feature | AthenaHQ | Semrush | Ubersuggest | **GeoScore (New)** |
|---------|----------|---------|-------------|---------------------|
| Real User Prompts | ❌ | ❌ | ❌ | **✅ FIRST** |
| Agentic Intelligence | ❌ | ❌ | ❌ | **✅ FIRST** |
| Intelligent Model Routing | ❌ | ❌ | ❌ | **✅ FIRST** |
| Qwen via OpenRouter | ❌ | ❌ | ❌ | **✅ FIRST** |
| Action Center | ❌ | ❌ | ❌ | **✅ FIRST** |
| White-Label | ❌ | ❌ | ❌ | **✅ FIRST** |
| Score Transparency | ❌ | ❌ | ❌ | **✅ FIRST** |

**First-mover advantage on: Agentic GEO, Real User Prompts, Intelligent Routing, Action Center**

---

## 15. Next Steps

### Immediate (This Week)
- [ ] Add Google Knowledge Graph integration (currently missing)
- [ ] Make Context.dev admin-toggleable (OFF by default)
- [ ] Set up OpenRouter for Qwen models
- [ ] Create ModelRouter service

### Week 2-3
- [ ] Build Prompt Intelligence Agent
- [ ] Replace fake prompts with real user patterns
- [ ] Add score transparency UI
- [ ] Test cost savings vs current

### Week 4-6
- [ ] Build Action Center MVP
- [ ] Add Citations Gap Analysis
- [ ] Create white-label PDF reports
- [ ] Launch to beta users

---

## 16. Appendix: Model Cost Reference

| Model | Provider | Input Cost | Output Cost | Context |
|-------|----------|-----------|-------------|---------|
| GPT-4o | OpenAI | $2.50/1M | $10/1M | 128K |
| GPT-4o-mini | OpenAI | $0.15/1M | $0.60/1M | 128K |
| Claude 3.5 Sonnet | Anthropic | $3/1M | $15/1M | 200K |
| **Qwen 3 72B** | OpenRouter | $0.40/1M | $0.40/1M | 32K |
| **Qwen 2.5 32B** | OpenRouter | $0.15/1M | $0.15/1M | 32K |
| **DeepSeek V3** | OpenRouter | $0.10/1M | $0.10/1M | 64K |

**Recommended Mix:** 70% Qwen (simple) + 20% Qwen 72B (medium) + 10% GPT-4o/Claude (complex)

---

*Document updated: 2026-05-19*
*Next review: 2026-05-26*