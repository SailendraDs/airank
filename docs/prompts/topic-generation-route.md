# Topic Generation Route Prompt

## Source

- `server/routes.ts:443-453`

## Current Prompt

```text
You are an AI visibility strategist. Generate exactly 10 topic clusters for tracking brand visibility across AI search engines.

Brand: {{brand.name}}
Domain: {{brand.domain}}
Industry: {{brand.industry}}
Description: {{brand.description}}
Competitors: {{competitorNames}}

Generate 10 specific, actionable topic clusters that are relevant to this brand's industry and competitive landscape. Each topic should be a concise phrase (2-5 words) that represents a category of queries users might ask AI assistants about.

Return ONLY a JSON array of strings, no other text. Example: ["Enterprise AI Solutions", "Cloud Security", "API Management"]
```

## What Is Wrong

1. The prompt is too shallow for building a durable topic map.
   It asks for short labels only, with no intent, importance, or rationale.

2. It can bias toward branded or competitor-led topics.
   The prompt gives brand and competitor names but does not control branded vs non-branded output.

3. It does not require coverage diversity.
   Discovery, evaluation, comparison, implementation, and trust topics may collapse into similar clusters.

4. It relies on "return only JSON" plus regex parsing.
   That is weaker than enforcing a schema.

## Suggested Fixes

1. Require topic diversity across search intent and funnel stage.
2. Limit branded topics so the system does not overfit to navigational visibility.
3. Prefer structured output with topic metadata.
4. If the route must keep string arrays for now, still add hard rules for dedupe and intent balance.

## Minimal Replacement Prompt

This version keeps the current output contract as an array of strings.

```text
You are an AI visibility strategist.

Generate exactly 10 topic clusters for measuring how people discover and evaluate brands in this market through AI assistants.

Brand:
- Name: {{brand.name}}
- Domain: {{brand.domain}}
- Industry: {{brand.industry}}
- Description: {{brand.description}}
- Competitors: {{competitorNames}}

Requirements:
- Return exactly 10 unique topic-cluster names.
- Each topic must be a concise phrase of 2-5 words.
- At least 7 topics must be non-branded.
- Cover a mix of discovery, comparison, evaluation, implementation, and trust/credibility themes.
- Avoid near-duplicates, keyword stuffing, and generic filler.
- Prefer topics that would matter for AI visibility scoring, not just SEO navigation.

Return only a JSON array of strings.
```

## Stronger Replacement Prompt

This requires a parser change, but it is the better long-term contract.

```text
You are an AI visibility strategist.

Generate exactly 10 topic clusters for measuring AI visibility in this market.

Brand:
- Name: {{brand.name}}
- Domain: {{brand.domain}}
- Industry: {{brand.industry}}
- Description: {{brand.description}}
- Competitors: {{competitorNames}}

Requirements:
- At least 7 topics must be non-branded.
- Cover discovery, comparison, evaluation, implementation, and trust/credibility.
- No duplicates or near-duplicates.
- Keep names concise and useful for reporting.

Return a JSON array of objects with this schema:
[
  {
    "name": "string",
    "category": "discovery|comparison|evaluation|implementation|trust",
    "brandBias": "non_branded|mixed|branded",
    "importance": "high|medium|low",
    "whyIncluded": "string"
  }
]
```
