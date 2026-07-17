# GeoScore UI/UX Review: Dashboard & Plan Management
**Date:** 2026-05-19
**Scope:** Dashboard, Onboarding, Settings, AIVisibility pages
**Focus:** Value delivery for $20-200/month plans

---

## 1. Executive Summary

After reviewing the complete codebase (Dashboard, Onboarding, Settings, AIVisibility), I found:

| Area | Status | Issues |
|------|--------|--------|
| **Onboarding** | ✅ Good structure | Context.dev cost issue, weak value messaging |
| **Dashboard** | ⚠️ Needs work | No action CTAs, overwhelming, no ROI messaging |
| **Settings** | ✅ Good plan UI | Plan limits should come from DB, not hardcoded |
| **AIVisibility** | ⚠️ Basic | No score transparency, weak action orientation |

### Key Finding
**The platform is technically solid but fails to DELIVER VALUE** - brands paying $20-200/month see dashboards full of data but no clear path to improvement.

---

## 2. Critical Issues

### 2.1 Dashboard - No Action Orientation

**Current State:**
```typescript
// dashboard.tsx line 903 - Quick Actions
<Link href="/app/gap-analysis">
  <div className="p-4 border rounded-lg...">
    <span className="font-medium text-sm">Gap Analysis</span>
    <p className="text-xs text-muted-foreground">
      Analyze competitive gaps in your visibility
    </p>
  </div>
</Link>
```

**Problem:** User sees "Gap Analysis" but doesn't know WHAT to do about it.

**What competitors show:**
```
❌ Current: "Gap Analysis - Analyze competitive gaps"
✅ Better: "You're losing to [Competitor] on [Topic]. Click to fix → +15 points"
```

---

### 2.2 Score Transparency Missing

**Current State (Dashboard.tsx:417):**
```typescript
<span className="text-4xl font-bold font-mono">{visibilityScore}</span>
<span className="text-xs text-muted-foreground">out of 100</span>
```

**Problem:** User sees "45/100" with no explanation of:
- How was this calculated?
- What factors contributed?
- What would increase it?
- Is this accurate?

**User Feedback (from Reddit):**
> "Score jumped from 30 to 80 right after I subscribed. Feels like they're manipulating scores."

**Fix Required:** Score breakdown UI showing calculation.

---

### 2.3 Plan Limits Are Hardcoded

**Current State (data-model.ts):**
```typescript
export const PLAN_LIMITS = {
  free: {
    maxCompetitors: 3,
    maxTopics: 3,
    maxQueries: 6,
    maxTeamMembers: 1,
    refreshFrequency: "monthly",
    allowedLlmProviders: ["openai"],
  },
  // ... other plans
};
```

**Problem:** Should come from `plan_capabilities` database table, not hardcoded.

---

### 2.4 Onboarding - Weak Value Proposition

**Current (Onboarding.tsx:739):**
```typescript
const stepLabels = ["Brand", "Details", "Plan", "Topics", "Prompts", "Confirm", "Activate"];
```

**Problem:** Users don't understand WHAT they're getting:
- Step 3: "Choose Your Plan" - shows limits, not value
- No "What's included" explanation
- No ROI projection ("This plan helps you reach X visibility")

---

### 2.5 Context.dev Firing on Every Lookup

**Current (Onboarding.tsx:292):**
```typescript
const lookupResult = await api.lookupBrand(normalizedDomain);
// Fires Context.dev on every brand lookup
```

**Problem:** This causes the expensive API bills you mentioned.

---

## 3. Dashboard Improvements Needed

### 3.1 Add Action Center Widget (HIGH PRIORITY)

**Replace Current Quick Actions:**
```typescript
// Current: Generic links
<Link href="/app/gap-analysis">
  <div>Gap Analysis</div>
</Link>

// New: Action-Oriented Cards
interface ActionCard {
  title: string;        // "Win the 'CRM Software' keyword"
  subtitle: string;     // "Competitor ranked #1, you're #4"
  impact: number;        // "+12 points if you rank #1"
  cta: string;          // "Optimize Now"
  href: string;         // Link to take action
}
```

**Example Actions:**
```
┌─────────────────────────────────────────────────────────┐
│  🎯 Your Top Opportunity                                │
│                                                         │
│  "Win the 'Best CRM for Small Business' keyword"       │
│  Currently: #4 | Competitor (Salesforce): #1            │
│                                                         │
│  Estimated Impact: +15 visibility points                │
│                                                         │
│  [Generate Optimization]  [View Competitor Analysis]    │
└─────────────────────────────────────────────────────────┘
```

---

### 3.2 Add Score Transparency Panel

**New Component:**
```typescript
interface ScoreBreakdown {
  mentionRate: { value: number; weight: number; contribution: number };
  positionScore: { value: number; weight: number; contribution: number };
  sentimentScore: { value: number; weight: number; contribution: number };
  citationScore: { value: number; weight: number; contribution: number };
  entityBonuses: { wikidata: boolean; knowledgeGraph: boolean };
  finalScore: number;
}
```

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│  How Your Score is Calculated                      [?] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Mention Rate: 40% × 0.40 = 16.0                       │
│  Position Score: 50% × 0.30 = 15.0                      │
│  Sentiment: 70% × 0.20 = 14.0                          │
│  Citations: 30% × 0.10 = 3.0                            │
│  ─────────────────────────────────                     │
│  Weighted Base: 48.0 × 0.85 = 40.8                      │
│  Wikidata: +8  Knowledge Graph: +7                       │
│  ─────────────────────────────────                     │
│  Final Score: 55.8 → 56                               │
│                                                         │
│  [Download Full Methodology PDF]                         │
└─────────────────────────────────────────────────────────┘
```

---

### 3.3 Add Competitive Position Widget

**Current:** Shows competitors in chart, but no clear "position"

**New:**
```
┌─────────────────────────────────────────────────────────┐
│  You vs Competitors                                     │
│                                                         │
│  You:            ██████████ 45 points                   │
│  Salesforce:      █████████████████████ 78 points       │
│  HubSpot:        █████████████████ 68 points           │
│  Zoho:           ████████████ 52 points                │
│                                                         │
│  Gap to #1: 33 points                                   │
│  What to do: [View Action Plan]                        │
└─────────────────────────────────────────────────────────┘
```

---

### 3.4 Add ROI Indicator

**Current:** No value messaging

**New:**
```
┌─────────────────────────────────────────────────────────┐
│  Your GEO Investment                                    │
│                                                         │
│  Monthly Investment: ₹500                               │
│  Visibility Improvement: +8 points (month)              │
│  Estimated AI Traffic: +120 visits/month                │
│                                                         │
│  ROI: ₹4.2x (for every ₹1, you get ₹4.2 value)        │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Plan Management Improvements

### 4.1 Replace Hardcoded Limits with DB

**Current:**
```typescript
const planCaps = PLAN_LIMITS[planTierKey];
```

**Should Be:**
```typescript
// Fetch from plan_capabilities table
const planCaps = await storage.getPlanCapabilities(brand.tier);
```

**Why:** Changes to plans don't require code deployment.

---

### 4.2 Add "What's Included" on Plan Selection

**Current (Onboarding.tsx:956):**
```typescript
features: [
  `${plan.maxCompetitors} Competitors`,
  `${plan.maxTopics} Topics`,
  // ...
]
```

**Better:**
```
┌─────────────────────────────────────────────────────────┐
│  GROWTH PLAN - ₹1,000/month                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  What's Included:                                        │
│  ✅ Monitor 10 competitors                               │
│  ✅ Track 20 topics across AI models                   │
│  ✅ Run 50 prompts weekly                              │
│  ✅ Real-time analysis (daily refresh)                 │
│  ✅ Competitor comparison reports                       │
│  ✅ Email notifications                                │
│                                                         │
│  Your ROI:                                              │
│  Based on similar brands, you can expect +15 visibility │
│  points in first month. That's estimated 200+ more     │
│  AI referrals/month.                                    │
│                                                         │
│  [Select This Plan]                                     │
└─────────────────────────────────────────────────────────┘
```

---

### 4.3 Add Usage-Based Upsell

**Current (Settings.tsx:1339):**
```typescript
{themesUsed > 0 && themesLimit > 0 && (topicsUsed / topicsLimit) > 0.7 && (
  <div className="p-3 bg-amber-50...">
    <span>You're at {Math.round((topicsUsed / topicsLimit) * 100)}% of your topic limit.</span>
  </div>
)}
```

**Better:**
```
┌─────────────────────────────────────────────────────────┐
│  ⚠️ You've used 85% of your Topic Limit (17/20)         │
│                                                         │
│  You're tracking 3 competitors across 17 topics.        │
│  With Growth plan, you can track 10 competitors         │
│  across unlimited topics.                               │
│                                                         │
│  [Upgrade to Growth - Save 20%]                        │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Onboarding Improvements

### 5.1 Add Value Messaging Per Step

**Current:** Generic descriptions
```typescript
<CardDescription>
  {step === 1 && "Start by entering your brand domain..."}
</CardDescription>
```

**Better:**
```
Step 3 (Plan Selection):
┌─────────────────────────────────────────────────────────┐
│  Choose the plan that fits your goals                    │
│                                                         │
│  Free Plan ($0/mo):                                    │
│  Perfect for: Exploring AI visibility basics           │
│  Get: 3 topics, 6 prompts, weekly analysis             │
│                                                         │
│  Growth Plan (₹1,000/mo):                              │
│  Perfect for: Active monitoring and optimization         │
│  Get: 10 competitors, 20 topics, 50 prompts,          │
│       daily analysis, competitor alerts                 │
│                                                         │
│  [See full comparison] [Select Plan]                     │
└─────────────────────────────────────────────────────────┘
```

---

### 5.2 Add "What You'll Get" Summary

**After Step 5 (Prompts):**
```
┌─────────────────────────────────────────────────────────┐
│  You're All Set! Here's what you get:                    │
│                                                         │
│  📊 Dashboard showing:                                  │
│     • Your visibility score across ChatGPT, Claude,    │
│       Gemini, Perplexity                                │
│     • How you compare to [Competitor1], [Competitor2]  │
│     • Where you're cited and where you should be        │
│                                                         │
│  📧 Weekly email report with:                          │
│     • Score changes                                     │
│     • New opportunities                                │
│     • Competitor moves                                 │
│                                                         │
│  🎯 Action plan with specific steps to improve          │
└─────────────────────────────────────────────────────────┘
```

---

## 6. AIVisibility Page Improvements

### 6.1 Add Score Breakdown

**Current:** Just shows score number
**Better:** Click score to see breakdown

```
┌─────────────────────────────────────────────────────────┐
│  Overall Visibility Score: 56                    [?]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Click [?] to see how this score was calculated.        │
│                                                         │
│  Model Breakdown:                                        │
│  ChatGPT:    ██████████ 62%                            │
│  Claude:     ████████ 48%                               │
│  Gemini:     ██████ 35%                                 │
│  Perplexity: ████ 28%                                  │
│                                                         │
│  [View Detailed Analysis]                               │
└─────────────────────────────────────────────────────────┘
```

---

### 6.2 Add "Why This Matters"

**Current:** No context
**Better:**
```
┌─────────────────────────────────────────────────────────┐
│  Why This Score Matters                                  │
│                                                         │
│  Brands with 60+ visibility get:                        │
│  • 3x more mentions in AI responses                    │
│  • Higher brand recall in comparisons                   │
│  • More organic traffic from AI referrals              │
│                                                         │
│  Your Path to 60+:                                      │
│  1. Add more prompts (you're at 6, recommend 15)       │
│  2. Optimize your 'features' topic content             │
│  3. Build citations from [Source]                      │
│                                                         │
│  [Start Optimization Journey]                           │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Technical Changes Required

### 7.1 Database - Plan Capabilities (Already Exists!)

The `plan_capabilities` table already exists in schema.ts. Just need to use it:

```typescript
// server/storage.ts - Add this method
async getPlanCapabilities(planId: string) {
  return this.db.query.planCapabilities.findFirst({
    where: eq(planCapabilities.id, planId)
  });
}
```

### 7.2 New API Endpoints

```typescript
// Dashboard enhancements
GET /api/dashboard/action-cards        // Get prioritized actions
GET /api/dashboard/score-breakdown     // How score was calculated
GET /api/dashboard/roi-metrics         // Value delivered

// Plan management
GET /api/plans/compare                 // Side-by-side comparison
GET /api/plans/recommended             // Based on usage patterns

// Score transparency
GET /api/visibility/:id/explain        // Full calculation breakdown
```

### 7.3 New Components Needed

```typescript
// client/src/components/dashboard/
ActionCenterCard.tsx     // Action-oriented quick actions
ScoreBreakdown.tsx       // How score is calculated
ROIMetricsWidget.tsx     // Value delivered
CompetitivePosition.tsx  // Visual competitor comparison
PlanComparisonModal.tsx  // Plan comparison with ROI
UsageAlert.tsx          // Upgrade prompts based on usage
```

---

## 8. Priority Implementation Order

### Phase 1: Quick Wins (Week 1)
1. **Add Score Breakdown UI** - Builds trust
2. **Add Action Cards to Dashboard** - Shows value
3. **Add Usage-Based Upsells in Settings** - Revenue

### Phase 2: Core Value (Week 2-3)
4. **Add ROI Metrics Widget** - Justifies pricing
5. **Improve Plan Selection UX** - Better conversion
6. **Add "What You'll Get" to Onboarding** - Sets expectations

### Phase 3: Differentiation (Week 4-6)
7. **Build Action Center** - Real execution
8. **Add Competitor Position Widget** - Clear positioning
9. **Add Score Transparency** - Trust building

---

## 9. Summary: What's Missing for Value Delivery

| Missing Element | Impact | Fix Priority |
|----------------|--------|-------------|
| **Action Center** | Users see problems but can't fix them | 🔴 HIGH |
| **Score Transparency** | Trust issues, manipulation perception | 🔴 HIGH |
| **ROI Metrics** | Can't justify $20-200/month cost | 🔴 HIGH |
| **Plan Limits from DB** | Hardcoded, inflexible | 🟡 MED |
| **Value Messaging** | Users don't understand what they get | 🟡 MED |
| **Competitive Positioning** | Unclear where they stand | 🟡 MED |

---

## 10. Files to Modify

| File | Changes |
|------|---------|
| `client/src/pages/Dashboard.tsx` | Add ActionCenter, ScoreBreakdown, ROI Metrics |
| `client/src/pages/Onboarding.tsx` | Add value messaging, what-you-get summary |
| `client/src/pages/Settings.tsx` | Use DB plan limits, better upsells |
| `client/src/pages/AIVisibility.tsx` | Add score breakdown, why it matters |
| `client/src/lib/data-model.ts` | Deprecate PLAN_LIMITS, use DB |
| `server/storage.ts` | Add getPlanCapabilities() |
| `server/routes.ts` | Add /dashboard/action-cards, /visibility/explain |

---

*Review completed: 2026-05-19*
*Next: Create implementation plan for Phase 1*