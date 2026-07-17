# GEO AI Visibility Features Research
**Date:** 2026-05-19
**Status:** Comprehensive Technical Analysis

---

## 1. Executive Summary

This document details high-value features for GeoScore to transition from **analytics platform** to **AI Visibility Executor**. Based on market research, user feedback, and competitive analysis, we identify features that will differentiate GeoScore in a crowded market.

---

## 2. Real AI Crawler Tracking

### 2.1 What It Is
Track when AI bots (GPTBot, Google-Other, ClaudeBot, PerplexityBot) visit a brand's website. Display "The AI visited your site today" as a psychological trigger.

### 2.2 How It Works

#### Bot Detection Sources
```
1. Cloudflare Logpush
   - Enable Logpush to S3/GCS
   - Parse Worker logs for bot User-Agents
   
2. Server Access Logs
   - Parse nginx/apache logs
   - Identify bot patterns
   
3. DNS/WAF Analytics
   - Cloudflare Analytics API
   - AWS CloudFront logs
```

#### AI Bot User-Agents to Track
```
GPTBot (OpenAI):
  Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0)

Google-Other:
  Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GoogleOther/2.1)

ClaudeBot (Anthropic):
  ClaudeBot/1.0 (+https://anthropic.com/claude-bot)

PerplexityBot:
  Mozilla/5.0 (compatible; PerplexityBot/1.0)

CCBot (Common Crawl):
  Mozilla/5.0 (compatible; CCBot/3.1)

DuckDuckBot:
  DuckDuckBot/1.0
```

### 2.3 Implementation Approach

```typescript
// Cloudflare Logpush Integration
interface CrawlEvent {
  timestamp: Date;
  botName: string;
  url: string;
  statusCode: number;
  responseTime: number;
  userAgent: string;
}

// Store in database
interface crawl_events {
  id: string;
  brand_id: string;
  bot_name: string;
  url: string;
  status_code: number;
  crawled_at: timestamp;
}

// Aggregate for dashboard
// "AI visited your site 3 times this week"
// "Most visited pages: /pricing, /features"
```

### 2.4 Technical Considerations
- Requires user to configure Cloudflare or install tracking script
- Privacy implications - need clear data handling policy
- Rate limiting on frequent crawlers

### 2.5 Priority: MEDIUM
- Differentiation feature, not core
- Good for agency sales pitch

---

## 3. GEO vs SEO Dual Scoring

### 3.1 What It Is
Give pages two scores:
1. **Traditional SEO Score** - Google ranking visibility
2. **GEO Visibility Score** - AI citation visibility

### 3.2 Why It Matters
```
Insight: A brand might rank #1 on Google but be 
"invisible" to ChatGPT. This creates immediate need 
for GeoScore.
```

### 3.3 SEO Score Calculation

#### Traditional SEO Factors
```
1. Domain Authority (Moz/ Ahrefs)
2. Page Authority
3. Backlink Count
4. Content Length
5. Keyword Optimization
6. Technical SEO Score
7. Page Speed
8. Mobile Friendliness
```

#### GEO Score (Current Implementation)
```
1. Mention Rate (40%)
2. Position Score (30%)
3. Sentiment Score (20%)
4. Citation Quality (10%)
+ Entity Bonuses
```

### 3.4 Dual Score Display
```
┌─────────────────────────────────────────┐
│  SEO Score          │  GEO Score        │
│  ┌─────────┐       │  ┌─────────┐     │
│  │   78    │       │  │   45    │     │
│  │  Good   │       │  │ Emerging│     │
│  └─────────┘       │  └─────────┘     │
│                                         │
│  "You're #1 on    │  "But invisible    │
│   Google"         │   to ChatGPT"       │
└─────────────────────────────────────────┘
```

### 3.5 Implementation
```typescript
interface DualScore {
  seoScore: number;
  seoFactors: {
    domainAuthority: number;
    backlinks: number;
    contentScore: number;
    technicalScore: number;
  };
  geoScore: number;
  geoFactors: {
    mentionRate: number;
    positionScore: number;
    sentimentScore: number;
    citationScore: number;
  };
  gap: number; // SEO - GEO
  recommendation: string;
}
```

### 3.6 Priority: HIGH
- Strong differentiation
- Appeals to SEO-savvy users
- Clear value proposition

---

## 4. Action Center

### 4.1 What It Is
Not just showing gaps - providing a button that says **"Optimize Now"** that uses an LLM to generate specific content edits.

### 4.2 Research: What Improves AI Citations?

#### Content Factors That Increase AI Citations
```
1. Expert Quotes & Attribution
   - "According to Dr. Smith..."
   - "Expert analysis shows..."

2. Statistics & Data Points
   - "Studies show 73% of..."
   - "Industry data indicates..."

3. Structured Data (Schema)
   - FAQ schema
   - HowTo schema
   - Article schema

4. Entity Clarity
   - Clear brand mentions
   - Consistent entity descriptions
   - Wikipedia-style summaries

5. Source Citations
   - Links to authoritative sources
   - Reference lists
   - Bibliography

6. Comprehensive Coverage
   - Answer complete questions
   - Cover all angles
   - Provide context
```

### 4.3 Action Center Features

#### 4.3.1 One-Click Optimization
```
Before:
┌─────────────────────────────────────────┐
│  Gap: Missing expert quotes              │
│  Impact: -15 to your score              │
└─────────────────────────────────────────┘

After:
┌─────────────────────────────────────────┐
│  Gap: Missing expert quotes              │
│  Impact: -15 to your score              │
│                                         │
│  [Generate Expert Quotes]               │
└─────────────────────────────────────────┘
```

#### 4.3.2 LLM-Powered Content Generation
```typescript
interface OptimizationRequest {
  gapType: 'expert_quotes' | 'statistics' | 'schema' | 'structure';
  pageUrl: string;
  topic: string;
}

interface OptimizationOutput {
  suggestedEdits: {
    type: 'add' | 'replace' | 'enhance';
    location: string;
    currentText: string;
    suggestedText: string;
    rationale: string;
  }[];
  estimatedImpact: number;
  priority: 'high' | 'medium' | 'low';
}
```

#### 4.3.3 Prompt for Content Optimization
```
You are a GEO (Generative Engine Optimization) expert. 
Generate specific content improvements for this page to 
increase AI citation likelihood.

Page: {{page_url}}
Topic: {{topic}}
Current Issue: {{gap_type}}

Generate 3 specific, actionable edits that:
1. Add credibility signals (expert quotes, statistics)
2. Improve structure (headers, lists, schema)
3. Enhance completeness (missing aspects of the topic)

Format output as:
- Location in page
- Current text (if replacing)
- Suggested text
- Why this helps AI visibility
```

### 4.4 Implementation Architecture
```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Gap Analysis │───▶│ User Clicks  │───▶│ LLM Generates│
│   Worker     │    │ Optimize Now │    │ Content Edits│
└──────────────┘    └──────────────┘    └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │ User Reviews │
                                        │ & Applies    │
                                        └──────────────┘
```

### 4.5 Priority: HIGH
- Core differentiator
- Addresses "action gap" in market
- Drives user engagement

---

## 5. Citations Gap Analysis

### 5.1 What It Is
Show a list of websites that AI engines currently use as sources for the brand's industry. If competitors are cited and the brand isn't, it creates FOMO.

### 5.2 How It Works

#### Identify AI Citation Sources
```typescript
interface CitationGap {
  topic: string;
  aiSources: {
    url: string;
    domain: string;
    citationFrequency: number;
    lastSeen: Date;
    contentType: string; // 'blog', 'news', 'academic', 'review'
  }[];
  brandMissing: boolean;
  competitorSources: {
    name: string;
    cited: boolean;
    frequency: number;
  }[];
}
```

#### FOMO Display
```
┌─────────────────────────────────────────────────┐
│  Citation Sources for "Project Management"    │
├─────────────────────────────────────────────────┤
│                                                 │
│  🏆 Top AI Sources (most cited)                │
│  1. Harvard Business Review (cited 847 times)    │
│  2. Forbes (cited 623 times)                    │
│  3. PMI.org (cited 412 times)                   │
│                                                 │
│  ⚠️ Your Competitors' Sources                   │
│  • Asana → Cited 234 times in AI responses     │
│  • Monday.com → Cited 189 times                │
│  • ClickUp → Cited 156 times                   │
│                                                 │
│  ❌ You Are NOT Cited                          │
│                                                 │
│  💡 Opportunity: Create content similar to      │
│     Harvard Business Review's structure         │
└─────────────────────────────────────────────────┘
```

### 5.3 Implementation
```typescript
// From LLM answer analysis
async function analyzeCitationPatterns(brandId: string) {
  const answers = await storage.getLlmAnswersForBrand(brandId);
  
  // Extract all citation domains
  const citations = answers.flatMap(a => a.citations);
  
  // Aggregate by domain
  const domainFrequency = citations.reduce((acc, c) => {
    acc[c.domain] = (acc[c.domain] || 0) + 1;
    return acc;
  }, {});
  
  // Compare with competitor citations
  const competitorCitations = await getCompetitorCitations(brandId);
  
  return {
    topSources: Object.entries(domainFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
    gaps: identifyGaps(domainFrequency, competitorCitations),
  };
}
```

### 5.4 Priority: HIGH
- Strong sales driver (FOMO)
- Clear action items
- Good for agencies

---

## 6. White-Label Pitch Workspaces

### 6.1 What It Is
Build a feature that lets local agencies generate a **GEO Audit PDF** for their own prospects in one click. White-labeled with agency branding.

### 6.2 Features

#### 6.2.1 Branded Report Generator
```
┌─────────────────────────────────────────────────┐
│  Generate GEO Audit Report                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  Client Name: [________________]                │
│                                                 │
│  Include:                                       │
│  ☑ Executive Summary                            │
│  ☑ Current Visibility Score                     │
│  ☑ Competitor Comparison                       │
│  ☑ Top Citation Sources                        │
│  ☑ Gap Analysis                                │
│  ☑ Recommended Actions                         │
│  ☐ Include Pricing Section                     │
│                                                 │
│  [Preview]  [Generate PDF]                      │
└─────────────────────────────────────────────────┘
```

#### 6.2.2 White-Label Configuration
```typescript
interface WhiteLabelConfig {
  agencyName: string;
  agencyLogo: string;
  agencyColors: {
    primary: string;
    secondary: string;
  };
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  customFooter: string;
}
```

#### 6.2.3 Report Sections
```
1. Executive Summary (1 page)
   - Score overview
   - Key findings
   - Quick wins

2. Current GEO Visibility (2-3 pages)
   - Overall score
   - Trend chart
   - Model breakdown

3. Competitive Landscape (2-3 pages)
   - Competitor comparison
   - Market share

4. Citation Analysis (1-2 pages)
   - Top sources
   - Gaps

5. Action Plan (1-2 pages)
   - Prioritized recommendations
   - Impact estimates

6. About [Agency Name]
   - Contact info
   - Services
```

### 6.3 Implementation Approach
```typescript
// Using PDF generation library
import { Puppeteer } from 'puppeteer';
// or
import { ReactPDF } from '@react-pdf/renderer';

async function generateAuditPDF(brandId: string, config: WhiteLabelConfig) {
  const data = await gatherReportData(brandId);
  
  const html = renderReportTemplate({
    ...data,
    ...config,
    sections: config.enabledSections,
  });
  
  const pdf = await Puppeteer.render(html, {
    format: 'A4',
    printBackground: true,
  });
  
  return pdf;
}
```

### 6.4 Priority: HIGH
- Agency sales enablement
- Recurring revenue opportunity
- Competitive moat

---

## 7. Ecommerce Attribution

### 7.1 What It Is
Connect to a client's Shopify (or other ecommerce) store to track which AI-driven mentions actually contribute to sales.

### 7.2 Why It Matters
```
"Move your tool from a 'marketing cost' to 
a 'revenue generator'"

If you can show: "AI visibility generated ₹X in sales",
the tool pays for itself.
```

### 7.3 Implementation

#### 7.3.1 Shopify Integration
```typescript
interface ShopifyConnection {
  shopifyDomain: string;
  accessToken: string; // OAuth
  webhookSecret: string;
}

interface EcommerceAttribution {
  source: 'chatgpt' | 'claude' | 'gemini' | 'perplexity';
  sessionId: string;
  productsViewed: string[];
  cartValue: number;
  converted: boolean;
  revenue: number;
}
```

#### 7.3.2 Attribution Flow
```
1. User visits via AI referral
   - UTM parameters from AI responses
   - or fingerprinting (less reliable)

2. Track session
   - Products viewed
   - Cart additions
   - Checkout started

3. Attribute conversion
   - 7-day attribution window
   - Last-touch attribution
```

#### 7.3.3 Dashboard Widget
```
┌─────────────────────────────────────────────────┐
│  AI-Driven Revenue                              │
├─────────────────────────────────────────────────┤
│                                                 │
│  ₹45,230 this month 📈 (+23%)                   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Revenue by AI Source                    │   │
│  │ ████████████████ ChatGPT    ₹28,500    │   │
│  │ ████████ Perplexity        ₹12,400      │   │
│  │ ████ Claude               ₹4,330       │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Conversion Rate: 3.2%                          │
│  Avg Order Value: ₹2,150                        │
└─────────────────────────────────────────────────┘
```

### 7.4 Priority: MEDIUM
- Strong for ecommerce clients
- Requires Shopify OAuth integration
- Revenue-focused selling point

---

## 8. AI Persona Simulations

### 8.1 What It Is
Instead of one-off prompts, run "synthetic persona" tests - multi-turn conversations that simulate how a real customer would talk to an AI about their brand.

### 8.2 Why It Matters
```
Real customer journeys are multi-turn:
1. "What's the best project management tool?"
2. "How does Asana compare to Monday?"
3. "Does Asana have time tracking?"
4. "Show me Asana's pricing"

Current tools test single prompts only.
```

### 8.3 Implementation

#### 8.3.1 Persona Templates
```typescript
interface PersonaTemplate {
  id: string;
  name: string;
  type: 'comparer' | 'researcher' | 'buyer' | 'support';
  demographics: {
    age: string;
    income: string;
    techSavvy: 'low' | 'medium' | 'high';
  };
  goals: string[];
  constraints: string[];
  conversationStyle: 'formal' | 'casual' | 'technical';
  turns: number; // How many turns in conversation
}

const personas: PersonaTemplate[] = [
  {
    id: 'sMBowner',
    name: 'Small Business Owner',
    type: 'comparer',
    goals: ['Save time', 'Reduce costs'],
    constraints: ['Budget conscious', 'Limited tech skills'],
    conversationStyle: 'casual',
    turns: 5,
  },
  {
    id: 'enterprise-buyer',
    name: 'Enterprise Decision Maker',
    type: 'buyer',
    goals: ['Prove ROI', 'Get team buy-in'],
    constraints: ['Needs approval', 'Security focused'],
    conversationStyle: 'formal',
    turns: 7,
  },
];
```

#### 8.3.2 Conversation Simulation
```typescript
async function runPersonaSimulation(
  brandId: string,
  persona: PersonaTemplate,
  competitorIds: string[]
) {
  const conversation = [];
  const brand = await storage.getBrand(brandId);
  
  // Generate initial prompt based on persona
  let currentPrompt = generateInitialPrompt(persona, brand);
  
  for (let i = 0; i < persona.turns; i++) {
    // Get LLM response
    const response = await llmProvider.generate(currentPrompt, {
      brand,
      competitors: competitorIds,
    });
    
    conversation.push({
      turn: i + 1,
      prompt: currentPrompt,
      response: response.text,
      brandMentioned: response.brandMentioned,
      brandPosition: response.brandPosition,
      citations: response.citations,
    });
    
    // Generate follow-up based on persona and response
    currentPrompt = generateFollowUp(
      persona,
      conversation,
      brand,
      competitorIds
    );
  }
  
  return analyzeConversationJourney(conversation);
}
```

#### 8.3.3 Results Display
```
┌─────────────────────────────────────────────────┐
│  Persona Simulation: "Small Business Owner"     │
├─────────────────────────────────────────────────┤
│                                                 │
│  Turn 1: "Best PM tools for small business?"   │
│  → Asana mentioned at position 2 ✓              │
│                                                 │
│  Turn 2: "How about Asana vs Monday?"          │
│  → Monday recommended over Asana ⚠️             │
│                                                 │
│  Turn 3: "Does Asana have free plan?"          │
│  → Yes, but limited features ⚠️                 │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Journey Score: 65/100                    │   │
│  │ Brand Visibility: Faded in Turn 2        │   │
│  │ Key Issue: Competitive positioning weak   │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 8.4 Priority: MEDIUM
- Deep testing capability
- Realistic scenarios
- Good for enterprise clients

---

## 9. Firecrawl & Apify Integration (UPDATED)

### 9.1 Firecrawl (Recommended for Content Discovery)
**Use Case:** Crawl and extract content from competitor websites to understand what they're doing right. Cost: ~$50/month.

```typescript
// Firecrawl API
interface FirecrawlConfig {
  apiKey: string; // FIRECRAWL_API_KEY
};

// Extract content from competitor
async function analyzeCompetitorContent(domain: string) {
  const response = await fetch('https://api.firecrawl.dev/v0/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: `https://${domain}`,
      pageOptions: {
        onlyMainContent: true,
      },
    }),
  });
  
  const data = await response.json();
  
  return {
    content: data.content,
    metadata: data.metadata,
    links: data.links,
  };
}
```

### 9.2 Apify (Recommended for Data Collection)
**Use Case:** Scrape SERPs, reviews, social media, and other data sources. Cost: ~$100/month.

```typescript
// Apify Actors for various data sources
const apifyActors = {
  googleSerp: 'apify/google-serp-scraper',
  g2Reviews: 'apify/g2-reviews-scraper',
  trustpilotReviews: 'apify/trustpilot-reviews-scraper',
  twitterScraper: 'apify/twitter-scraper',
  linkedinScraper: 'apify/linkedin-company-scraper',
};

async function runApifyActor(actor: string, input: object) {
  const response = await fetch(
    `https://api.apify.com/v2/acts/${actor}/runs`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    }
  );
  
  // Poll for completion
  // Return dataset when ready
}
```

### 9.3 Google Knowledge Graph (ADD - Currently Missing!)
**Use Case:** Free entity data for brand enrichment. No cost, free tier: 100k/day.

```typescript
// Google Knowledge Graph Search API
async function queryKnowledgeGraph(brandName: string) {
  const response = await fetch(
    `https://kgsearch.googleapis.com/v1/entities:search?query=${encodeURIComponent(brandName)}&key=${process.env.GOOGLE_KG_API_KEY}&limit=5`
  );
  
  const data = await response.json();
  
  return data.itemListElement?.map((item: any) => ({
    name: item.result?.name,
    description: item.result?.description,
    detailedDescription: item.result?.detailedDescription?.articleBody,
    url: item.result?.url,
    types: item.result?.@type,
    image: item.result?.image?.contentUrl,
  })) || [];
}
```

### 9.4 OpenRouter Qwen Models (RECOMMENDED - Replace Expensive APIs)
**Use Case:** Cheap, high-quality inference for simple and medium tasks. Cost: ~$0.00015-0.0004/1K tokens.

```typescript
// OpenRouter configuration for Qwen
const OPENROUTER_CONFIG = {
  baseUrl: 'https://openrouter.ai/api/v1',
  models: {
    // Simple tasks: classification, tagging, normalization
    qwen_2_5_32b: {
      id: 'qwen/qwen-2.5-32b-instruct',
      costPerMillion: 0.15, // $0.00015/1K
      maxTokens: 32000,
      useFor: ['classification', 'tagging', 'summarization', 'dedup']
    },
    // Medium tasks: content gen, schema creation
    qwen_3_72b: {
      id: 'qwen/qwen-3-72b-instruct',
      costPerMillion: 0.40, // $0.0004/1K
      maxTokens: 32000,
      useFor: ['content_optimization', 'schema_generation', 'citation_extraction']
    },
    // Complex tasks: strategic reasoning, gap analysis
    gpt_4o: {
      id: 'openai/gpt-4o',
      costPerMillion: 2.50,
      maxTokens: 128000,
      useFor: ['strategic_reasoning', 'gap_analysis', 'complex_comparison']
    }
  }
};

// Model Router Service
class ModelRouter {
  classifyComplexity(task: string): 'simple' | 'medium' | 'complex' {
    const simpleKeywords = ['tag', 'classify', 'normalize', 'dedupe', 'extract', 'count', 'sum'];
    const complexKeywords = ['analyze', 'strategy', 'compare', 'evaluate', 'recommend', 'why', 'deep'];
    
    const simpleScore = simpleKeywords.filter(k => task.toLowerCase().includes(k)).length;
    const complexScore = complexKeywords.filter(k => task.toLowerCase().includes(k)).length;
    
    if (complexScore > simpleScore) return 'complex';
    if (simpleScore > 0) return 'simple';
    return 'medium';
  }
  
  getModel(complexity: string) {
    switch (complexity) {
      case 'simple': return OPENROUTER_CONFIG.models.qwen_2_5_32b;
      case 'medium': return OPENROUTER_CONFIG.models.qwen_3_72b;
      case 'complex': return OPENROUTER_CONFIG.models.gpt_4o;
    }
  }
}
```

### 9.3 Combined Workflow
```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Firecrawl    │───▶│ Content      │───▶│ Gap Analysis │
│ Crawl        │    │ Analysis     │    │              │
│ Competitors  │    │ (LLM)        │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │ GeoScore      │
                                        │ Recommendations│
                                        └──────────────┘
```

---

## 10. Real User Prompt Collection

### 10.1 The Problem
Current GEO tools use prompts like:
```
"Perform a comprehensive analysis of [Brand] covering 
nutrition, customer reviews, business performance..."
```

Real users ask:
```
"What's better Subway or McDonalds?"
```

### 10.2 Solution: Real User Prompt Library

**Problem:** Current prompts are analytical, not realistic user queries.

**Current (Bad):**
```
"Perform a comprehensive analysis of {Brand} covering..."
```

**Real User Queries (Good):**
```
"Which is better {Brand} or {Competitor}?"
"What's the best {Category} for {Use Case}?"
"Is {Brand} worth it compared to {Competitor}?"
"What do users say about {Brand}?"
"How much does {Brand} cost?"
"Does {Brand} have [feature]?"
```

#### Implementation: Prompt Intelligence Agent
```typescript
interface PromptCategory {
  id: string;
  name: string;
  description: string;
  templates: string[]; // Real user query templates
}

// Real user query patterns by category
const promptLibrary: PromptCategory[] = [
  {
    id: 'comparison',
    name: 'Brand Comparisons',
    templates: [
      "Which is better {Brand} or {Competitor}?",
      "{Brand} vs {Competitor} - which should I choose?",
      "Is {Brand} worth it compared to {Competitor}?",
      "Difference between {Brand} and {Competitor}?",
    ],
  },
  {
    id: 'reviews',
    name: 'Reviews & Opinions',
    templates: [
      "What do users say about {Brand}?",
      "Is {Brand} actually good?",
      "{Brand} reviews - worth it?",
      "Real feedback on {Brand}?",
    ],
  },
  {
    id: 'pricing',
    name: 'Pricing & Value',
    templates: [
      "How much does {Brand} cost?",
      "Is {Brand} expensive?",
      "{Brand} pricing - what's included?",
      "Cheaper alternative to {Brand}?",
    ],
  },
  {
    id: 'features',
    name: 'Features & Use Cases',
    templates: [
      "What can I do with {Brand}?",
      "Does {Brand} have [feature]?",
      "Best use cases for {Brand}?",
      "How does {Brand} work?",
    ],
  },
];

// Mining real queries from Reddit
async function mineRedditQueries(brandName: string) {
  // Use Apify Reddit scraper or Reddit API
  const response = await fetch(
    `https://www.reddit.com/search.json?q=${encodeURIComponent(brandName)}+vs&sort=top&limit=100`
  );
  
  const data = await response.json();
  
  return data.data.children
    .map((post: any) => post.data.title)
    .filter((title: string) => title.includes(' vs ') || title.includes(' or '))
    .map((title: string) => cleanAndNormalize(title));
}
```

#### Prompt Quality Scoring
```typescript
interface PromptQuality {
  realismScore: number; // 0-100, how close to real queries
  intentClarity: 'transactional' | 'informational' | 'navigational';
  competitiveMention: boolean; // Does it mention competitors
  brandMention: boolean; // Does it mention a brand
}

function scorePromptQuality(prompt: string): PromptQuality {
  // Analyze prompt against real user query patterns
  // Score based on: length, complexity, question type, specificity
}
```

### 10.3 Context.dev Toggle (ADMIN ONLY)

**Problem:** Context.dev fires on every enrichment, causing high costs.

**Solution:** Admin-toggleable, OFF by default.

```typescript
// System setting for Context.dev control
interface SystemSettings {
  context_dev_enabled: boolean; // Default: false
}

// In brand-enrichment worker
async function enrichBrand(brandId: string) {
  const settings = await storage.getSystemSetting('context_dev_enabled');
  
  // Always try free sources first
  const kgData = await queryGoogleKnowledgeGraph(brand.domain);
  const wikidata = await queryWikidata(brand.domain);
  const scraped = await scrapeWithFirecrawl(brand.domain);
  
  // Only use Context.dev if explicitly enabled by admin
  if (settings === 'true') {
    const brandDevData = await queryContextDev(brand.domain);
    return mergeBrandData(kgData, wikidata, scraped, brandDevData);
  }
  
  // Use LLM to enhance free data
  const llmEnhanced = await enhanceWithQwen(kgData, wikidata, scraped);
  return llmEnhanced;
}
```

**Admin Settings UI:**
```
┌─────────────────────────────────────────────────────────────┐
│  LLM & Enrichment Settings                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Model Routing:                                             │
│  [✓] Enable intelligent routing (Qwen for simple tasks)    │
│                                                             │
│  Brand Enrichment:                                          │
│  [ ] Enable Context.dev API (expensive, admin only)        │
│                                                             │
│  Note: Context.dev is DISABLED by default to reduce costs.  │
│  Only enable if you need premium brand data enrichment.     │
│                                                             │
│  Free Sources (always enabled):                             │
│  [✓] Google Knowledge Graph (FREE)                         │
│  [✓] Wikidata (FREE)                                       │
│  [✓] Wikipedia (FREE)                                      │
│  [ ] Firecrawl ($50/mo - recommended)                       │
│  [ ] Apify ($100/mo)                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.3 Priority: HIGH
- Fixes the core accuracy problem
- Differentiates from competitors
- Builds trust with users

---

## 12. Implementation Roadmap (UPDATED)

### Phase 1: Agentic Foundation (1-2 weeks)
1. **Add Google Knowledge Graph** - Integrate free KG API (currently missing)
2. **Context.dev Admin Toggle** - Make it OFF by default, admin-controlled
3. **Set up OpenRouter** - Add Qwen 3.6 72B and Qwen 2.5 32B models
4. **Create Model Router** - Route tasks by complexity to appropriate model
5. **Update Environment Variables** - Add GOOGLE_KG_API_KEY, OPENROUTER_API_KEY

### Phase 2: Prompt Intelligence (2-3 weeks)
1. **Build Prompt Mining Agent** - Reddit, search autocomplete, forums
2. **Create Prompt Categories** - Store real user query patterns
3. **Deprecate Fake Prompts** - Replace analytical prompts with real ones
4. **Add Prompt Quality Scoring** - Grade prompts on realism

### Phase 3: Action Center (3-4 weeks)
1. **Content Optimization Agent** - Generate specific improvements
2. **Gap-to-Action Mapping** - Connect gaps to actionable steps
3. **Before/After Preview** - Show transformation
4. **Citation Gap Analysis** - Identify competitor citation differences

### Phase 4: Advanced Features (4-6 weeks)
1. **White-Label PDF Reports** - Branded agency audits
2. **GEO vs SEO Dual Scoring** - Comparison feature
3. **AI Crawler Tracking** - Cloudflare integration
4. **Ecommerce Attribution** - Shopify integration

---

## 12. Technical Requirements Summary

### API Keys Needed
```env
# Existing
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
DATAFORSEO_KEY=

# New (based on features)
FIRECRAWL_API_KEY=          # Content crawling
APIFY_API_KEY=              # Data scraping
SHOPIFY_API_KEY=            # Ecommerce
CLOUDFLARE_API_TOKEN=       # Crawler tracking
```

### Database Additions
```sql
-- Crawler tracking
CREATE TABLE crawl_events (
  id TEXT PRIMARY KEY,
  brand_id TEXT REFERENCES brands(id),
  bot_name TEXT,
  url TEXT,
  status_code INTEGER,
  crawled_at TIMESTAMP
);

-- White-label configs
CREATE TABLE agency_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  agency_name TEXT,
  agency_logo TEXT,
  primary_color TEXT,
  secondary_color TEXT
);

-- Ecommerce attribution
CREATE TABLE ecommerce_attribution (
  id TEXT PRIMARY KEY,
  brand_id TEXT REFERENCES brands(id),
  source TEXT,
  session_id TEXT,
  revenue DECIMAL,
  attributed_at TIMESTAMP
);
```

### New Worker Jobs
```
crawler-tracking    - Process Cloudflare/log data
persona-simulation  - Run multi-turn conversations
ecommerce-sync      - Sync Shopify data
pdf-generation      - Generate white-label reports
content-optimization - Generate content edits
```

---

*Document generated: 2026-05-19*