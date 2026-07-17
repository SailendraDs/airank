# GeoScore Project Inventory
**Date:** 2026-05-19
**Status:** Comprehensive Analysis Complete

---

## 1. Project Overview

**GeoScore** is a B2B SaaS platform for tracking and improving **Generative Engine Optimization (GEO)** - how brands appear in AI-generated responses from ChatGPT, Claude, Gemini, Perplexity, and other LLMs.

### Core Value Proposition
- Track AI visibility scores across multiple LLM providers
- Competitive intelligence on how brands vs competitors appear in AI responses
- Content optimization recommendations to improve AI citations
- Multi-tenant SaaS with tiered pricing (Free → Enterprise)

### Technology Stack (UPDATED)

| Layer | Technology | Notes |
|-------|------------|-------|
| **Frontend** | React 18 + TypeScript + Vite | Unchanged |
| **Backend** | Node.js + Express | Unchanged |
| **Database** | PostgreSQL + Drizzle ORM | Unchanged |
| **Authentication** | Email/Password + Google OAuth | Unchanged |
| **Payments** | Razorpay (INR) | Unchanged |
| **Hosting** | EC2 Ubuntu + PM2 + Nginx + SSL | Unchanged |
| **UI Framework** | shadcn/ui + Tailwind CSS | Unchanged |
| **NEW: Model Routing** | OpenRouter + Qwen | Cost reduction |
| **NEW: Content Scraping** | Firecrawl + Apify | Brand intelligence |
| **NEW: Knowledge Graph** | Google KG API (free) | Missing, needs integration |

### Architecture Evolution (NEW)

```
BEFORE (Analytics-Only):          AFTER (Agentic Executor):
─────────────────────────────     ──────────────────────────────────────────
User Query → LLM API → Score   →   Intelligent Agents → Real Data → Score
                                    ↓
                                 Action Center → One-click Optimization
```

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                                │
│  React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        SERVER                                │
│  Node.js + Express + TypeScript                              │
├─────────────────────────────────────────────────────────────┤
│  ROUTES                 │  WORKERS (Background Jobs)         │
│  ├─ Auth Routes         │  ├─ Brand Enrichment              │
│  ├─ Brand Routes        │  ├─ LLM Sampling                 │
│  ├─ Prompt Routes      │  ├─ Citation Extraction          │
│  ├─ Competitor Routes  │  ├─ Visibility Scoring           │
│  ├─ Admin Routes       │  ├─ Gap Analysis                 │
│  └─ Webhook Routes     │  ├─ Recommendations             │
├─────────────────────────────────────────────────────────────┤
│  INTEGRATIONS           │  SERVICES                         │
│  ├─ LLM Providers      │  ├─ Entity Resolution           │
│  │   ├─ OpenAI        │  ├─ Drift Detection             │
│  │   ├─ Anthropic     │  ├─ Prompt Template Runtime      │
│  │   ├─ Google Gemini │  ├─ Claims Extraction          │
│  │   ├─ Perplexity    │  └─ Subscription Management     │
│  │   ├─ DeepSeek      │                                  │
│  │   ├─ Grok          │                                  │
│  │   └─ OpenRouter    │                                  │
│  ├─ Brand Enrichment   │                                  │
│  │   ├─ context.dev   │                                  │
│  │   └─ Wikidata      │                                  │
│  ├─ Knowledge Graph    │                                  │
│  │   └─ Google KG     │                                  │
│  └─ SERP              │                                  │
│      └─ DataForSEO     │                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     DATABASE                                 │
│  PostgreSQL + Drizzle ORM                                    │
│  ├─ 35+ tables covering all business entities               │
│  ├─ Domain Registry for cost-saving deduplication          │
│  └─ Job queue with retry logic                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema (35+ Tables)

### Core Entities

| Table | Purpose |
|-------|---------|
| `users` | User accounts with OAuth, 2FA, security fields |
| `brands` | Brand tracking with activation status |
| `competitors` | Competitor tracking per brand |
| `topics` | Brand topics for prompt organization |
| `prompts` | Brand-specific prompts for LLM testing |
| `prompt_templates` | Admin-managed prompt templates |
| `llm_answers` | LLM response storage |
| `answer_mentions` | Brand/competitor mentions in responses |
| `answer_citations` | Citation URLs from LLM responses |
| `visibility_scores` | Aggregated scores per period |
| `trend_snapshots` | Historical tracking |
| `sources` | Citation source management |

### Supporting Entities

| Table | Purpose |
|-------|---------|
| `subscriptions` | Billing subscriptions |
| `invoices` | Invoice records |
| `payments` | Payment tracking |
| `plan_capabilities` | Plan feature matrix |
| `team_members` | Multi-user access |
| `audit_logs` | Activity tracking |
| `jobs` | Background job queue |
| `job_runs` | Job execution history |
| `axp_pages` | AI Experience Pages |
| `axp_content` | AXP content management |
| `faq_entries` | FAQ management |
| `schema_templates` | JSON-LD schema templates |
| `integrations` | External service connections |
| `brand_context` | Comprehensive brand intelligence |
| `domain_registry` | Cost-saving cache deduplication |
| `api_logs` | API usage logging |

---

## 4. Key Features Implemented

### 4.1 Onboarding & Activation
- Multi-step onboarding wizard (Brand → Competitors → Topics → Plan → Payment)
- Activation pipeline with progress polling
- DashboardGuard for access control

### 4.2 AI Visibility Scoring
```
Scoring Formula:
├── Mention Rate (40% weight)
│   └── (mentionedPrompts / totalPrompts) × 100
├── Position Score (30% weight)
│   └── 1st=100, 3rd=70, 5th=40, other=10
├── Sentiment Score (20% weight)
│   └── positive=100, neutral=50, negative=0
└── Citation Quality (10% weight)
    └── min(dedupedCitations/mentions, 10) × 10

Bonuses:
├── Wikidata Entity: +8
└── Knowledge Graph: +7

Final: scaledBase × 0.85 + bonuses, capped at 85
```

### 4.3 LLM Provider Support
| Plan | Providers |
|------|----------|
| Free | OpenAI (GPT-4o) |
| Starter | + Google Gemini |
| Growth | + Perplexity, DeepSeek |
| Enterprise | + Grok, OpenRouter (Claude) |

### 4.4 Content Optimization
- Gap analysis identifying visibility opportunities
- Content recommendations from LLM analysis
- Citation tracking and optimization

### 4.5 Analytics & Reporting
- Real-time visibility score tracking
- Trend analysis with historical data
- Competitor comparison matrix
- Source/citation analysis

### 4.6 Admin Features
- User management
- Brand management
- Invoice management
- API usage tracking
- Audit logs
- Prompt template management
- Feature flags
- TTL configuration

---

## 5. External Integrations

### 5.1 LLM Providers (API Keys Required)
- **OpenAI** - `OPENAI_API_KEY`
- **Anthropic** - `ANTHROPIC_API_KEY`
- **Google** - `GOOGLE_AI_API_KEY`
- **Perplexity** - `PERPLEXITY_API_KEY`
- **DeepSeek** - `DEEPSEEK_API_KEY`
- **Grok** - `XAI_API_KEY`
- **OpenRouter** - `OPENROUTER_API_KEY`

### 5.2 Brand Enrichment
- **context.dev** (Brand.dev) - Brand information API
  - ⚠️ **Note:** User flagged this as too expensive

### 5.3 Knowledge Sources (UPDATED - ADDED GOOGLE KG)
- **Wikidata** - Public SPARQL endpoint, no key required ✅ Exists
- **Google Knowledge Graph** - `GOOGLE_KG_API_KEY` ⚠️ **NEEDS INTEGRATION**
- **Wikipedia API** - Free, no key required

### 5.4 Brand Enrichment (UPDATED)
- **Context.dev (Brand.dev)** - `CONTEXT_DEV_API_KEY` ⚠️ **TOGGLED OFF BY DEFAULT**
- **Firecrawl** - `FIRECRAWL_API_KEY` - Website content extraction (~$50/mo)
- **Apify** - `APIFY_API_KEY` - Social/news data scraping (~$100/mo)

### 5.5 Model Routing (NEW - Cost Optimization)
- **OpenRouter** - `OPENROUTER_API_KEY` - Qwen models for cheap inference
  - Qwen 3 72B: ~$0.0004/1K tokens (medium tasks)
  - Qwen 2.5 32B: ~$0.00015/1K tokens (simple tasks)
  - DeepSeek V3: ~$0.0001/1K tokens (batch tasks)
- **Premium models only for complex tasks:** GPT-4o, Claude 3.5

### 5.5 Payments
- **Razorpay** - INR payments with webhook handling

### 5.6 Available but Not Fully Integrated
- Google Search Console
- Google Analytics
- Social media APIs (LinkedIn, Twitter, Meta, YouTube)
- Shopify (planned for ecommerce attribution)

---

## 6. API Endpoints (Key Routes)

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/verify-email` - Email verification
- `POST /api/auth/forgot-password` - Password reset
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/google` - Google OAuth

### Brands
- `GET /api/brands` - List user's brands
- `POST /api/brands` - Create brand
- `GET /api/brands/current` - Get current brand
- `POST /api/brands/:id/activate` - Trigger activation pipeline
- `GET /api/brands/:id/activation-progress` - Poll activation status
- `GET /api/brands/:id/pipeline-status` - Check pipeline state

### Analytics
- `GET /api/analytics/visibility-scores` - Get visibility history
- `GET /api/analytics/mentions` - Get brand mentions
- `GET /api/analytics/sources` - Get citation sources
- `GET /api/analytics/prompt-runs` - Get prompt execution history

### Competitors
- `GET /api/competitors` - List competitors
- `POST /api/competitors` - Add competitor
- `GET /api/competitors/matrix` - Get comparison matrix

### Admin
- `GET /api/admin/users` - User management
- `GET /api/admin/brands` - All brands
- `GET /api/admin/invoices` - Invoice management
- `GET /api/admin/audit-logs` - Audit logs
- `GET /api/admin/analytics` - System analytics

---

## 7. Frontend Pages

### User Pages
| Page | Purpose |
|------|---------|
| Landing | Marketing page with pricing |
| SignIn / SignUp | Authentication |
| Onboarding | Multi-step setup wizard |
| Activate | Brand activation flow |
| Dashboard | Main analytics overview |
| AIVisibility | Deep dive into AI scores |
| Competitors | Competitor comparison |
| Prompts | Prompt management |
| Topics | Topic organization |
| Sources | Citation tracking |
| GapAnalysis | Visibility gaps |
| ActionPlan | Recommended actions |
| ContentAXP | AI Experience Pages |
| Integrations | External service connections |
| Settings | Account settings |
| Profile | User profile |

### Admin Pages
| Page | Purpose |
|------|---------|
| AdminDashboard | System overview |
| AdminUsers | User management |
| AdminBrands | Brand management |
| AdminPlans | Plan configuration |
| AdminInvoices | Invoice management |
| AdminAuditLogs | Activity tracking |
| AdminAPIUsage | API usage monitoring |
| AdminPromptTemplates | Prompt template CRUD |
| AdminSettings | System settings |
| AdminFeatureFlags | Feature toggles |
| AdminTTLConfig | Data TTL configuration |

---

## 8. Background Workers (UPDATED - Agentic Architecture)

### Core Analysis Workers (Existing + Enhanced)

| Worker | Purpose | Enhancement |
|--------|---------|-------------|
| `brand-enrichment` | Enrich brand data | **Now checks Context.dev toggle, uses KG/Wikidata first** |
| `competitor-enrichment` | Enrich competitor data | Uses free sources by default |
| `llm-sampling` | Run prompts against LLMs | **Uses ModelRouter for cost optimization** |
| `citation-extraction` | Extract citations from LLM responses | Uses Qwen for simple extraction |
| `visibility-scoring` | Calculate visibility scores | No change |
| `gap-analysis` | Identify visibility gaps | **Routes to GPT-4o only for complex analysis** |
| `recommendation` | Generate content recommendations | **Action Center integration** |

### NEW: Agentic Workers

| Worker | Purpose | Model Used | Cost |
|--------|---------|------------|------|
| `brand-intelligence-agent` | KG + Wikidata + Firecrawl enrichment | Qwen 2.5 32B | Very Cheap |
| `prompt-intelligence-agent` | Mine Reddit/forums for real queries | Qwen 3 72B | Cheap |
| `model-router` | Route tasks to appropriate model | N/A | Free |
| `content-optimization-agent` | Generate content improvements | Qwen 3 72B | Cheap |
| `citation-gap-agent` | Identify citation gaps vs competitors | GPT-4o | When needed |
| `crawler-tracking-agent` | Process Cloudflare logs | Qwen 2.5 32B | Very Cheap |
| `pdf-report-generator` | Generate white-label PDFs | N/A | Free |

---

## 9. Configuration

### Environment Variables (.env.example)
```env
# Database
DATABASE_URL=postgresql://...

# Authentication
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# LLM Providers
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
PERPLEXITY_API_KEY=
DEEPSEEK_API_KEY=
XAI_API_KEY=
OPENROUTER_API_KEY=

# Enrichment Services
DATAFORSEO_KEY=
GOOGLE_KG_API_KEY=

# Payments
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# Email
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# Domain
PRODUCTION_DOMAIN=geoscore.in
```

---

## 10. Build & Deployment

### Scripts
```json
{
  "dev": "concurrently \"npm run server:dev\" \"npm run client:dev\"",
  "build": "npm run client:build && npm run server:build",
  "start": "node dist/server/index.js",
  "db:push": "drizzle-kit push",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
}
```

### Deployment Stack
- **Server:** Node.js + Express on EC2 Ubuntu
- **Process Manager:** PM2
- **Web Server:** Nginx (reverse proxy + SSL)
- **Database:** PostgreSQL with SSL
- **SSL:** Let's Encrypt

---

## 11. Identified Gaps & Issues (UPDATED)

### Critical Gaps

1. **Context.dev/Brand.dev Cost Issue** ✅ RESOLVED: Admin-toggleable, OFF by default
   - Currently using context.dev for brand enrichment
   - **Solution:** Make it admin-toggleable, OFF by default (no more surprise bills)
   - Free alternatives: Google KG + Wikidata + Firecrawl + Apify

2. **Google Knowledge Graph Missing** ✅ NEEDS TO BE ADDED
   - KG API is free (100k/day) but not currently integrated
   - **Solution:** Add KG integration as primary brand data source
   - Already in .env.example but not wired up

3. **LLM API Costs Too High** ✅ SOLUTION: Intelligent Model Routing
   - Using GPT-4o for all tasks (expensive)
   - **Solution:** Route to Qwen via OpenRouter for simple/medium tasks
   - Add ModelRouter service to classify and route

4. **Prompt Quality Issues (per user feedback)** ✅ NEEDS FIX
   - Current prompts are too generic/analytical
   - Don't reflect real user search behavior
   - Example: "Perform a deep analysis..." vs "What's better Subway or McDonalds"
   - **Solution:** Build Prompt Intelligence Agent with real queries from Reddit/forums

5. **Score Manipulation Perception** ✅ NEEDS FIX
   - Reddit complaints about competitors: scores jump after subscription purchase
   - Perception that scores are artificially capped to force upgrades
   - **Solution:** Add score transparency UI showing calculation breakdown

6. **Analytics-Only Positioning** ✅ NEEDS UPGRADE
   - Current product is primarily analytics
   - Competitors also offer analytics
   - **Solution:** Build Action Center with one-click optimization

### Missing Features (Based on Competitive Analysis)

1. **Real AI Crawler Tracking**
   - No Cloudflare/server log integration
   - Can't show "AI visited your site today"

2. **GEO vs SEO Dual Scoring**
   - Only GEO score implemented
   - No traditional SEO comparison

3. **Action Center**
   - Has gap analysis but no "Optimize Now" functionality
   - No LLM-generated content edits

4. **White-Label PDF Reports**
   - No branded audit PDF generation for agencies

5. **Ecommerce Attribution**
   - Shopify integration mentioned but not implemented
   - Can't track AI mentions → sales

6. **AI Persona Simulations**
   - No multi-turn conversation testing
   - No synthetic persona testing

### Technical Issues

1. **Empty States** - Some pages show mock data instead of proper empty states
2. **Citation Deduplication** - Needs proper URL normalization
3. **Storage Contract** - Some workers call non-existent storage methods
4. **Brand.dev API Response Parsing** - Bug reading nested response structure

---

## 12. Dependencies

### Production Dependencies
```json
{
  "express": "^4.18.x",
  "drizzle-orm": "latest",
  "postgres": "latest",
  "zod": "^3.x",
  "bcryptjs": "^2.4.x",
  "jsonwebtoken": "^9.x",
  "stripe": "^14.x",
  "razorpay": "^2.x",
  "@clerk/express": "^1.x",
  "winston": "^3.x",
  "node-cron": "^3.x",
  "axios": "^1.x",
  "recharts": "^2.x",
  "tailwindcss": "^3.x",
  "@radix-ui/*": "various",
  "lucide-react": "^0.x",
  "wouter": "^3.x",
  "@tanstack/react-query": "^5.x"
}
```

---

## 13. File Structure Summary

```
geoscore/
├── client/                    # React frontend
│   ├── src/
│   │   ├── pages/             # 35+ page components
│   │   ├── components/       # UI components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # API client, utilities
│   │   └── App.tsx
│   ├── public/
│   └── index.html
├── server/                    # Express backend
│   ├── src/
│   │   ├── routes.ts         # Main route definitions
│   │   ├── auth-routes.ts     # Auth routes
│   │   ├── auth-middleware.ts # Auth middleware
│   │   ├── storage.ts        # Database storage layer
│   │   ├── jobs/             # Background workers
│   │   ├── integrations/     # External APIs
│   │   ├── services/         # Business logic
│   │   ├── middleware/       # Express middleware
│   │   └── lib/              # Utilities
│   └── db.ts
├── shared/                    # Shared code
│   └── schema.ts             # Database schema (1279 lines)
├── migrations/               # Database migrations
├── dist/                     # Build output
├── docs/                     # Documentation
│   ├── prompts/              # Prompt templates
│   └── superpowers/          # Specs and plans
├── scripts/                  # Deployment scripts
└── node_modules/
```

---

## 14. What's Working Well

1. ✅ **Solid Database Schema** - Comprehensive, well-organized with proper indexes
2. ✅ **Multi-tenant Architecture** - Proper brand isolation
3. ✅ **Authentication System** - Email + OAuth + 2FA + session management
4. ✅ **Payment Integration** - Razorpay with webhook handling
5. ✅ **LLM Provider Abstraction** - Clean interface for multiple providers
6. ✅ **Job Queue System** - Background processing with retry logic
7. ✅ **Admin Dashboard** - Full system management capabilities
8. ✅ **Domain Registry** - Cost-saving deduplication strategy
9. ✅ **Activation Pipeline** - Structured onboarding flow

---

## 15. Priority Fixes Needed (UPDATED)

| Priority | Issue | Impact | Solution |
|----------|-------|--------|----------|
| 🔴 HIGH | Context.dev fires always | Surprise costs | **Admin toggle, OFF by default** |
| 🔴 HIGH | Google KG missing | Free data unused | **Integrate KG API (already in .env)** |
| 🔴 HIGH | All LLM = expensive | High API costs | **Add OpenRouter + Qwen routing** |
| 🔴 HIGH | Prompt quality poor | Analytics inaccurate | **Build Prompt Intelligence Agent** |
| 🟡 MED | Action Center missing | No execution | **One-click optimization** |
| 🟡 MED | White-label missing | No agency focus | **Branded PDF reports** |
| 🟡 MED | Score transparency | Trust issues | **Show calculation breakdown** |
| 🟢 LOW | Crawler tracking | Future feature | Cloudflare integration |

---

## 16. Cost Analysis Summary (NEW)

### Before Agentic Architecture
| Category | Monthly Cost |
|----------|-------------|
| Context.dev | $200-500 |
| GPT-4o (all tasks) | $800-2000 |
| **TOTAL** | **$1000-2500/month** |

### After Agentic Architecture
| Category | Monthly Cost |
|----------|-------------|
| Firecrawl + Apify | $150 |
| Qwen 2.5 (simple) | $50-100 |
| Qwen 3 72B (medium) | $100-300 |
| GPT-4o (complex only) | $100-200 |
| **TOTAL** | **$400-750/month** |

### Savings: ~65%

---

*Document generated: 2026-05-19*
