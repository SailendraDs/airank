# Gap Analysis Prompt

## Source

- `server/routes.ts:4150-4272`

## Current Prompt

This prompt is large, but its core structure is:

```text
You are an AI Visibility Strategist and Competitive Intelligence Analyst.

Your task is to generate a structured AI Visibility Gap Analysis and Action Plan for a brand.

INPUTS:
- brand_name: ...
- competitor_brand_name_1: ...
- competitor_brand_name_2: ...
- competitor_brand_name_3: ...
- focus_area: ...

- brand_analysis:
Brand: ...
Industry: ...
Description: ...
Tier: ...
Total Prompts: ...
Total Mentions: ...
Competitors: ...

IMPORTANT:
1. Only use the information provided in brand_analysis and competitor names.
2. Do not invent metrics or factual claims.
3. Base your suggestions on visibility gaps, authority gaps, citation gaps, topic gaps, entity clarity gaps, conversion gaps, and technical gaps.
4. Align all recommendations with AI search visibility ...

Your output must be STRICT JSON.
```

## What Is Good

1. It clearly defines role, task, and output shape.
2. It tries to constrain hallucination with "do not invent" rules.
3. It already uses JSON mode in the API call.

## What Is Wrong

1. The prompt asks for more than the inputs can support.
   It requests authority, citation, entity, conversion, and technical gaps, but the supplied evidence is mostly summary metadata.

2. It does not ground recommendations in prompt-level evidence.
   Without missed-prompt examples, competitor outrank examples, or citation-domain examples, the output will drift toward generic advice.

3. The JSON contract is descriptive, but not evidence-linked.
   Actions should point back to concrete evidence.

4. "Do not invent" is not enough by itself.
   If the inputs are thin, the model will still generalize.

## Suggested Fixes

1. Feed the model actual evidence arrays.
   Include:
   - top missing prompts
   - top competitor wins
   - top cited domains
   - entity/brand clarity issues
   - weak pages or missing schema signals

2. Require every action to cite an evidence reference.

3. Add a confidence field to every recommendation.

4. If evidence is insufficient, require the model to say so explicitly.

## Recommended Replacement Prompt

```text
You are an AI visibility strategist and competitive analyst.

Your task is to produce a structured gap analysis using only the supplied evidence.

Brand:
- Name: {{brand.name}}
- Domain: {{brand.domain}}
- Industry: {{brand.industry}}
- Description: {{brand.description}}
- Focus Area: {{focusArea}}

Competitors:
{{competitor_list}}

Evidence:
- Missing prompt opportunities: {{missing_prompt_examples}}
- Competitor outrank examples: {{competitor_advantage_examples}}
- Citation/domain gaps: {{citation_gap_examples}}
- Entity clarity issues: {{entity_gap_examples}}
- Technical issues: {{technical_gap_examples}}

Rules:
- Use only the supplied evidence.
- Do not invent metrics, rankings, citations, or technical facts.
- If evidence is insufficient for a section, say so explicitly.
- Every recommendation must reference at least one evidence item.
- Prefer AI-visibility-specific actions over generic SEO advice.

Return a JSON object with this schema:
{
  "brand": "string",
  "focusArea": "string",
  "executiveSummary": "string",
  "evidenceCoverage": "high|medium|low",
  "gapOverview": {
    "visibility": [],
    "authority": [],
    "content": [],
    "technical": [],
    "entity": []
  },
  "actions": [
    {
      "title": "string",
      "category": "content_strategy|competitive_response|technical_optimization",
      "impact": "high|medium|low",
      "effort": "high|medium|low",
      "whyItMatters": "string",
      "expectedOutcome": "string",
      "evidenceRefs": ["string"],
      "confidence": 0.0
    }
  ]
}
```

## Practical Note

The current prompt can still produce decent narrative output, but it is not reliable enough for a system that wants evidence-backed recommendations.
