# GeoScore Research Summary
**Date:** 2026-05-19 (Updated with Agentic Architecture)
**Location:** `docs/research/`

---

## Research Documents Overview

This directory contains comprehensive research and strategic planning for GeoScore's evolution from an **AI analytics platform** to an **AI Visibility Executor** using an **Agentic Architecture**.

### Documents Created

| Document | Purpose | Key Takeaways |
|----------|---------|---------------|
| `PROJECT_INVENTORY.md` | Complete codebase analysis | 35+ tables, 7 LLM providers, full feature inventory |
| `COMPETITOR_RESEARCH.md` | Market & competitive analysis | Market wants executors, not analysts; prompt quality issues |
| `FEATURES_RESEARCH.md` | Feature technical deep-dives | Implementation details for all recommended features |
| `AI_VISIBILITY_EXCELLENCE_STRATEGY.md` | **Strategic roadmap** | Agentic architecture, cost reduction, differentiation |

---

## 🚀 NEW: Agentic Architecture Summary

### The Problem
- **Context.dev expensive**: $200-500/month, fires on every enrichment
- **All LLM = expensive**: Using GPT-4o for simple tasks is wasteful
- **Fake prompts**: Analytics don't reflect real user behavior
- **No execution**: Users see problems but can't fix them

### The Solution: GEO Agent Stack

```
┌────────────────────────────────────────────────────────────────────┐
│                     GEO AGENT ORCHESTRATOR                          │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  BRAND INTELLIGENCE AGENT                                           │
│  ├── Google Knowledge Graph (FREE) ← ADD                          │
│  ├── Wikidata (FREE) ← Already exists                              │
│  ├── Firecrawl ($50/mo) ← ADD                                     │
│  ├── Apify ($100/mo) ← ADD                                        │
│  └── Context.dev (ADMIN-TOGGLE ONLY, OFF by default) ← FIX       │
│                                                                     │
│  PROMPT INTELLIGENCE AGENT                                          │
│  ├── Reddit mining (real queries) ← ADD                            │
│  ├── Search autocomplete patterns ← ADD                           │
│  └── Forum analysis ← ADD                                          │
│                                                                     │
│  ANALYSIS HUB (Intelligent Routing)                                │
│  ├── Simple → Qwen 2.5 32B (~$0.00015/1K) ← ADD                   │
│  ├── Medium → Qwen 3 72B (~$0.0004/1K) ← ADD                       │
│  └── Complex → GPT-4o/Claude (only when needed)                    │
│                                                                     │
│  ACTION CENTER AGENT                                                │
│  ├── One-click optimization                                        │
│  ├── LLM-generated content suggestions                             │
│  └── Gap-to-action mapping                                         │
└────────────────────────────────────────────────────────────────────┘
```

---

## 💰 Cost Savings Summary

| Category | Before | After | Savings |
|----------|--------|-------|---------|
| Brand Enrichment | $350-650/mo | $150/mo | **~75%** |
| LLM APIs | $800-2000/mo | $250-600/mo | **~65%** |
| **TOTAL** | **$1150-2650/mo** | **$400-750/mo** | **~65%** |

### Key Changes:
1. **Context.dev**: Admin-toggleable, OFF by default (no more surprise bills)
2. **Google KG**: Added (currently missing, FREE)
3. **Qwen via OpenRouter**: Replace expensive models for simple tasks
4. **Real User Prompts**: Replace fake analytical prompts

---

## 📋 Immediate Priorities

### 🔴 HIGH PRIORITY (Week 1-2)

| Task | Description | Impact |
|------|-------------|--------|
| 1. **Add Google KG** | Integrate Knowledge Graph API (currently missing) | Free data |
| 2. **Context.dev Toggle** | Make admin-control, OFF by default | Stop surprise bills |
| 3. **Set up OpenRouter** | Add Qwen 3.6, Qwen 2.5 models | 68% LLM cost reduction |
| 4. **Build ModelRouter** | Route tasks by complexity | Smart cost management |

### 🟡 MEDIUM PRIORITY (Week 3-4)

| Task | Description | Impact |
|------|-------------|--------|
| 5. **Prompt Intelligence Agent** | Mine Reddit/forums for real queries | Fix analytics accuracy |
| 6. **Action Center MVP** | One-click optimization | Core differentiator |
| 7. **Score Transparency UI** | Show calculation breakdown | Build trust |

### 🟢 LOWER PRIORITY (Week 5-8)

| Task | Description | Impact |
|------|-------------|--------|
| 8. **Citations Gap Analysis** | Show competitor citation gaps | FOMO driver |
| 9. **White-Label PDFs** | Agency branded reports | Sales enablement |
| 10. **GEO vs SEO Dual Scoring** | SEO + GEO comparison | Appeal to SEO pros |

---

## ❌ What We're NOT Doing

Based on analysis, we recommend **AVOIDING**:

| Don't Do This | Why |
|---------------|-----|
| Browser automation on ChatGPT.com/Claude.ai | Legal/ethical issues, ToS violations |
| Remove LLM APIs entirely | Open-source models can't do complex reasoning yet |
| Scraping competitor AI platforms | Legal risk, unreliable |
| Self-hosting Qwen 72B | No GPU infrastructure needed - use OpenRouter |

---

## ✅ What's Preserved from Previous Plan

All core features from the original research are preserved:

- ✅ Multi-LLM Support (enhanced with smart routing)
- ✅ Visibility Scoring (enhanced with transparency UI)
- ✅ Competitor Tracking (enhanced with real user prompts)
- ✅ Citation Analysis (enhanced with gap analysis)
- ✅ Trend Tracking (maintained)
- ✅ Gap Analysis (enhanced with Action Center)

### New Differentiating Features Added:

| Feature | Priority | Description |
|---------|----------|-------------|
| **Agentic Architecture** | 🔴 HIGH | Crew AI-style orchestration |
| **Real User Prompts** | 🔴 HIGH | Prompt Intelligence Agent |
| **Intelligent Model Routing** | 🔴 HIGH | Qwen for simple, GPT for complex |
| **Action Center** | 🟡 MED | One-click optimization |
| **Context.dev Toggle** | 🔴 HIGH | Admin control, OFF by default |
| **Citations Gap** | 🟡 MED | FOMO driver |

---

## 📁 Files in This Directory

```
docs/research/
├── README.md                                    # This file (summary)
├── PROJECT_INVENTORY.md                        # Complete codebase analysis
├── COMPETITOR_RESEARCH.md                      # Market & competitive landscape
├── FEATURES_RESEARCH.md                        # Feature technical deep-dives
└── AI_VISIBILITY_EXCELLENCE_STRATEGY.md        # Strategic roadmap (UPDATED)
```

---

## 🔑 Key Architectural Decisions

### 1. Model Routing Strategy
```
Simple tasks (70% of workload) → Qwen 2.5 32B (~$0.00015/1K tokens)
Medium tasks (20%) → Qwen 3 72B (~$0.0004/1K tokens)  
Complex tasks (10%) → GPT-4o/Claude (only when needed)
```

### 2. Brand Enrichment Strategy
```
Priority 1: Google KG + Wikidata + Wikipedia (FREE)
Priority 2: Firecrawl + Apify (~$150/mo)
Priority 3: Context.dev (ADMIN ONLY, disabled by default)
```

### 3. Prompt Quality Strategy
```
OLD: "Perform a comprehensive analysis of {Brand}..."
NEW: "Which is better, {Brand} or {Competitor}?"
     "What do users say about {Brand}?"
     "Is {Brand} worth the price?"
```

---

## 📞 Next Steps

1. **Review** `AI_VISIBILITY_EXCELLENCE_STRATEGY.md` for full details
2. **Approve** the agentic architecture approach
3. **Start Phase 1**: Add Google KG + Context.dev toggle + OpenRouter setup
4. **Iterate** on Action Center and Real User Prompts

---

## 💡 Value Proposition for Brands ($200-2000/year)

### Before
```
"Your AI visibility score is 45"
"You're mentioned in 23 prompts"
"Gap analysis shows issues"
```

### After
```
"Your AI visibility score is 45"
"Here's exactly how to reach 65 in 3 steps"
"Click 'Optimize Now' to generate the content"
"Your competitors are cited 200 times, you're cited 15"
"Here's why and here's how to close the gap"
```

---

*Research updated: 2026-05-19*
*Prepared for: GeoScore Agentic Architecture Implementation*