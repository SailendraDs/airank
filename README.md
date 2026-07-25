# AIRank - AI Brand Visibility Platform

## 🚀 Overview

AIRank is an open-source AI Brand Visibility Intelligence platform that measures, optimizes, and demonstrates how AI models (ChatGPT, Claude, Gemini, Perplexity, DeepSeek, Grok) represent brands. We're building the definitive open-source AI visibility layer.

## ✨ Features

### Core AI Visibility Intelligence
- **Multi-Model Scanning** — Query 6+ LLM providers (OpenAI, Anthropic, Google, DeepSeek, Grok, Perplexity)
- **AIRank Score™** — Proprietary 0-100 visibility scoring algorithm with confidence intervals
- **Mention Detection** — Real-time brand/competitor mention tracking with sentiment analysis
- **Citation Intelligence** — Track which sources AI cites when discussing your brand space
- **Competitive Intelligence** — Benchmark against 20+ competitors with threat scoring
- **Prompt Engineering** — 50+ pre-built prompt templates with A/B testing capabilities

### Entity & Knowledge Graph
- **Entity Building** — Automated entity profile construction across knowledge graphs
- **Schema Validation** — JSON-LD, Organization, Product, FAQPage validation
- **Wikidata Integration** — Claim extraction and verification
- **Wikipedia Presence** — Notability scoring and presence monitoring
- **Entity Score™** — Proprietary entity completeness metric (0-100)

### Content Optimization (AXP)
- **Schema Generator** — Auto-generate schema.org markup from brand data
- **FAQ Optimizer** — AI snippet extraction optimization
- **AXP Script** — Real-time crawler notification for instant re-indexing
- **Content Gap Analysis** — AI-powered recommendations for missing content
- **Launch Readiness** — Product/entity/schema readiness scoring

### Advanced Analytics
- **Visibility Trends** — Time-series analysis with predictive modeling
- **Sentiment Analysis** — Multi-dimensional sentiment tracking across platforms
- **Citation Networks** — Graph-based source relationship mapping
- **GEO vs SEO** — Comparative analysis of AI visibility vs traditional SEO
- **Market Opportunity** — Prompt gap analysis with prioritization matrix

### Platform & Enterprise
- **Multi-Tenancy** — Agency branding and workspace isolation
- **Role-Based Access** — Granular permissions (Admin, Editor, Viewer, API)
- **Webhook Framework** — Real-time event streaming to external systems
- **Scheduled Reports** — PDF/HTML reports with automated email delivery
- **Audit Logging** — Comprehensive security and compliance tracking
- **Razorpay Integration** — Subscription management and invoicing
- **2FA Support** — TOTP-based two-factor authentication
- **Rate Limiting** — Adaptive rate limiting per tier and endpoint

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        AIRank Platform                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Frontend    │  │  API Server  │  │   Worker Jobs    │  │
│  │  (React 19)   │◄─│  (Express)   │  │  (BullMQ+Redis)  │  │
│  │               │  │              │  │                  │  │
│  │ • Dashboard   │  │ • REST API   │  │ • LLM Scanning   │  │
│  │ • Reports     │  │ • WebSockets │  │ • Citation Track │  │
│  │ • Settings    │  │ • Auth       │  │ • Entity Build   │  │
│  └──────────────┘  └──────┬───────┘  │ • Alert Eval     │  │
│                            │           │ • Report Gen     │  │
│  ┌────────────────────────▼───────────┴──────────────────┐│
│  │                    Service Layer                        ││
│  │  LLM Service │ Entity Service │ Content Service │ ...   ││
│  └──────────────────────────────────────────────────────────┘│
│                            │                                 │
│  ┌────────────────────────▼──────────────────────────────┐│
│  │                   Data Layer                            ││
│  │   PostgreSQL (Neon) │ Redis (Queue/Cache)              ││
│  └──────────────────────────────────────────────────────────┘│
│                            │                                 │
│  ┌────────────────────────▼──────────────────────────────┐│
│  │              AI Providers (Claude, OpenAI, etc.)        ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19, TypeScript, Wouter, Tailwind CSS v4 | Modern SPA with SSR-ready architecture |
| **Backend** | Express.js, TypeScript, Passport.js | RESTful API with session management |
| **Database** | PostgreSQL (Neon Serverless), Drizzle ORM | Type-safe queries with migrations |
| **Queue** | BullMQ + Redis | Background job processing |
| **LLM** | OpenAI, Anthropic, Google, DeepSeek, Perplexity, Grok | Multi-model AI scanning |
| **Auth** | JWT + httpOnly cookies, Google OAuth, Email/Password | Secure authentication |
| **Payments** | Razorpay | Subscription management |
| **Email** | AWS SES / SMTP | Transactional emails |
| **Testing** | Vitest, Playwright | Unit + E2E testing |
| **Deploy** | Docker, PM2, Nginx | Production-ready deployment |

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.x
- **PostgreSQL** >= 14.x (or Neon serverless)
- **Redis** >= 7.x (or Upstash)
- **At least one LLM API key** (OpenAI, Anthropic, or Google)

### Installation

```bash
# Clone the repository
git clone https://github.com/SailendraDs/airank.git
cd airank

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database URL, API keys, etc.

# Run database migrations
npm run db:push

# Seed demo data (optional)
npm run db:seed

# Start development server
npm run dev
```

Visit `http://localhost:5000` in your browser.

### Docker Deployment

```bash
# Build and run with Docker Compose
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Environment Variables

See `.env.example` for the complete list. Minimum required:

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/airank

# Session
SESSION_SECRET=your-32+-char-secret-here

# LLM Provider (at least one)
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_GENERATIVE_AI_API_KEY=...

# Optional
REDIS_URL=redis://localhost:6379
RAZORPAY_KEY_ID=...
AWS_SES_SMTP_HOST=...
```

## 📁 Project Structure

```
airank/
├── client/                          # React 19 frontend
│   ├── src/
│   │   ├── components/              # Reusable UI components
│   │   │   ├── layout/              # App shell, navigation
│   │   │   ├── dashboard/           # Dashboard widgets
│   │   │   ├── landing/             # Public landing page
│   │   │   └── ui/                  # ShadCN/ui primitives
│   │   ├── pages/                   # Route-level pages
│   │   │   ├── admin/               # Admin panel
│   │   │   ├── auth/                # Login, signup, OTP
│   │   │   ├── Dashboard.tsx        # Main dashboard
│   │   │   ├── Prompts.tsx          # Prompt management
│   │   │   ├── EntityIntelligence.tsx
│   │   │   ├── Competitors.tsx
│   │   │   ├── GapAnalysis.tsx
│   │   │   └── ...
│   │   ├── hooks/                   # Custom React hooks
│   │   ├── lib/                     # API client, utilities
│   │   └── test/                    # Test setup
│   │   └── index.html               # Vite entry
│   │
├── server/                          # Express.js backend
│   ├── index.ts                     # App bootstrap
│   ├── routes.ts                    # Main API routes
│   ├── storage.ts                   # Database CRUD operations
│   ├── lib/                         # Logger, env validation
│   ├── services/                    # Business logic
│   │   ├── llm/                     # LLM provider integrations
│   │   │   ├── openai.ts
│   │   │   ├── anthropic.ts
│   │   │   ├── google.ts
│   │   │   ├── deepseek.ts
│   │   │   ├── .ts
│   │   │   └── -fallback.ts
│   │   ├── entity-service.ts        # Entity building & tracking
│   │   ├── content-optimizer.ts     # Content & AXP engine
│   │   ├── agent-readiness.ts       # Schema validation
│   │   ├── product-readiness.ts     # Product schema analysis
│   │   ├── prompt-topic-matcher.ts  # Prompt clustering
│   │   ├── email.ts                 # Transactional emails
│   │   ├── scheduler.ts             # Report scheduling
│   │   ├── pdf-generator.ts         # PDF report generation
│   │   ├── report-runner.ts         # Scheduled report execution
│   │   ├── webhook-dispatch.ts      # Webhook delivery
│   │   └── seed-data.ts             # Demo data seeder
│   ├── integrations/                # Third-party integrations
│   │   ├── llm/                     # LLM API wrappers
│   │   ├── enrichment/              # Firecrawl brand enrichment
│   │   └── notify/                  # Slack/Teams notifications
│   ├── jobs/                        # Background job workers
│   │   └── workers/
│   │       ├── llm-scan-worker.ts   # LLM scanning jobs
│   │       ├── alert-evaluation.ts  # Alert checking
│   │       ├── entity-builder.ts    # Entity construction
│   │       └── ...
│   ├── routes/                      # Modular route files
│   └── middleware/                   # Express middleware
│
├── shared/                          # Shared types (client + server)
│   ├── schema.ts                    # Drizzle ORM schema (50+ tables)
│   └── types.ts                     # TypeScript type definitions
│
├── script/                          # Utility scripts
├── deploy/                          # Deployment configurations
├── docs/                            # Documentation & research
├── .github/                         # GitHub Actions & templates
├── LICENSE                          # MIT License
├── CONTRIBUTING.md                  # Contribution guidelines
├── CODE_OF_CONDUCT.md               # Contributor Covenant
├── CHANGELOG.md                     # Version history
├── SECURITY.md                      # Security policy
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript config
├── vite.config.ts                   # Vite bundler
├── drizzle.config.ts                # Drizzle ORM config
├── tailwind.config.ts               # Tailwind CSS config
├── docker-compose.yml               # Docker orchestration
├── Dockerfile                       # Production image
└── .env.example                     # Environment template
```

## 🔧 Development

### Scripts

```bash
# Development (full stack)
npm run dev

# Frontend only (port 5000)
npm run dev:client

# Backend only
npm run dev

# Database
npm run db:push         # Push schema changes
npm run db:migrate      # Run migrations
npm run db:seed         # Seed demo data
npm run db:studio       # Open Drizzle Studio

# Code Quality
npm run check           # TypeScript type checking
npm run test            # Run test suite
npm run test:coverage   # Run with coverage

# Production
npm run build           # Compile TypeScript
npm start               # Start production server
```

### Database Schema

The project uses **Drizzle ORM** with PostgreSQL. Key tables:

| Table | Purpose |
|-------|---------|
| `users` | User accounts with roles |
| `brands` | Brand profiles being analyzed |
| `competitors` | Competitor tracking per brand |
| `prompts` | AI prompts for visibility testing |
| `llm_answers` | Raw LLM responses |
| `answer_mentions` | Brand/competitor mentions |
| `answer_citations` | Source citations |
| `visibility_scores` | Time-series visibility metrics |
| `entity_checks` | Entity verification results |
| `schema_templates` | Schema.org markup templates |
| `action_plans` | Gap analysis action items |
| `subscriptions` | Razorpay subscription records |
| `webhooks` | Outgoing webhook configurations |

### Adding a New LLM Provider

1. Create provider class in `server/integrations/llm/`
2. Register in `server/services/llm/` index
3. Add UI toggle in `client/src/pages/Settings.tsx`
4. Update `.env.example` with new key

### Adding a Background Worker

1. Create worker in `server/jobs/workers/`
2. Register job type in queue config
3. Add API endpoint for job triggering
4. Add admin monitoring in `client/src/pages/admin/`

## 🚢 Deployment

### Vercel (Frontend)

```bash
vercel --prod
```

### Render / Railway (Backend)

```yaml
# render.yaml
services:
  - type: web
    name: airank-api
    runtime: node
    plan: starter
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: airank-db
          property: connectionString
```

### Docker

```bash
# Production
docker compose -f docker-compose.prod.yml up -d

# Development
docker compose up -d
```

## 🗺️ Roadmap

### Current: v1.0.0 — Foundation

**Status:** Production Ready

- Multi-model LLM scanning (6+ providers)
- AIRank Score™ visibility algorithm
- Competitor benchmarking
- Citation tracking
- Entity intelligence
- Gap analysis & recommendations
- Content optimization (AXP)
- Scheduled reports
- Multi-tenant SaaS
- Razorpay payments

---

### v1.1.0 — Agentic AI Layer (Q3 2026)

**Theme:** Autonomous AI agents that act on your behalf

| Feature | Description | Impact |
|---------|-------------|--------|
| **Autonomous Brand Monitor** | AI agent that continuously monitors brand mentions and alerts on anomalies | High |
| **Auto-Content Generator** | LLM-powered content creation based on gap analysis | High |
| **Competitive Response Engine** | Automated competitive counter-strategy suggestions | Medium |
| **Schema Auto-Fix** | AI agent that automatically fixes broken schema.org markup | High |
| **Citation Outreach** | Automated outreach to high-authority citation sources | Medium |

**Planned Improvements:**
- Real-time WebSocket updates for live scanning
- Advanced caching layer with Redis Cluster
- GraphQL API alongside REST
- Mobile-responsive admin panel
- Multi-language support (i18n)

---

### v1.2.0 — Predictive Intelligence (Q4 2026)

**Theme:** Predict the future of your AI visibility

| Feature | Description | Impact |
|---------|-------------|--------|
| **Visibility Forecasting** | Time-series prediction of AIRank Score trends | High |
| **Competitive Threat Detection** | ML-based early warning system for competitive moves | High |
| **Prompt Opportunity Mining** | AI discovers untapped prompt opportunities | High |
| **Citation Velocity Tracking** | Track how fast citations grow/shrink over time | Medium |
| **Entity Health Dashboard** | Real-time entity completeness monitoring | Medium |

**Planned Improvements:**
- Vector database integration for semantic search
- Custom model fine-tuning for brand-specific analysis
- Plugin system for custom LLM providers
- Advanced export formats (Notion, Airtable, Slack)

---

### v2.0.0 — Platform Ecosystem (Q1 2027)

**Theme:** AIRank as an AI Visibility Platform

| Feature | Description | Impact |
|---------|-------------|--------|
| **Marketplace** | Community prompt templates and strategies | High |
| **API Access** | Public API for programmatic queries | High |
| **White-Label** | Full white-label deployment for agencies | Medium |
| **Enterprise SSO** | SAML/OIDC support for enterprises | Medium |
| **Advanced Analytics** | Cohort analysis, funnel visualization, attribution | High |
| **AI Visibility API** | Embeddable widget for external sites | Medium |

**Planned Improvements:**
- Microservices architecture
- Kubernetes deployment configs
- Multi-region support
- Advanced RBAC with custom roles
- Audit compliance exports (SOC2, GDPR)

---

### v3.0.0 — AGI Integration Layer (2027+)

**Theme:** Direct integration with AGI workflows

| Feature | Description | Impact |
|---------|-------------|--------|
| **Claude Code Integration** | Native MCP server for Claude Desktop | High |
| **OpenAI Assistants API** | Custom GPT with AIRank knowledge | High |
| **Autonomous Optimization** | AI that optimizes your AI visibility automatically | High |
| **Cross-Platform Sync** | Unified visibility across all AI platforms | High |
| **Real-Time Learning** | System learns from every scan to improve accuracy | High |

---

## 🤝 Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Code style guidelines
- Pull request process
- Issue reporting standards
- Development setup checklist

### Good First Issues

Look for issues labeled `good-first-issue` or `help-wanted` on GitHub.

---

## 🌐 Community

- **Discussions:** [GitHub Discussions](https://github.com/SailendraDs/airank/discussions)
- **Issues:** [GitHub Issues](https://github.com/SailendraDs/airank/issues)
- **Discord:** [Join our Discord](https://discord.gg/airank) (coming soon)
- **Email:** opensource@airank.io

---

## 📄 License

AIRank is released under the [MIT License](LICENSE).

---

## 🙏 Acknowledgments

AIRank is built with the support of:

- **[Vercel](https://vercel.com)** — Frontend hosting and deployment
- **[Neon](https://neon.tech)** — Serverless PostgreSQL
- **[Drizzle ORM](https://orm.drizzle.team)** — Type-safe database access
- **[ShadCN/ui](https://ui.shadcn.com)** — Beautiful UI components
- **[Tailwind CSS](https://tailwindcss.com)** — Utility-first CSS framework

---

<p align="center">
  <img src="https://img.shields.io/badge/Built%20with%20%E2%AD%90%EF%B8%8F%20by%20AIRank%20Community-8A2BE2" alt="Made with Love">
</p>

<p align="center">
  <strong>Democratizing AI Brand Visibility Intelligence for Everyone.</strong>
</p>
