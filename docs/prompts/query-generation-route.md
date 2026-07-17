# Query Generation Route Prompt

## Source

- `server/routes.ts:513-528`

## Current Prompt

```text
You are an AI visibility strategist. Generate exactly 15 search queries that users would type into AI assistants (ChatGPT, Claude, Gemini, Perplexity) when researching this brand's industry.

Brand: {{brand.name}}
Domain: {{brand.domain}}
Industry: {{brand.industry}}
Description: {{brand.description}}
Competitors: {{competitorNames}}
Selected Topics: {{topicList}}

Generate 15 realistic, natural language queries that match how people actually ask AI assistants questions. Include a mix of:
- Comparison queries ("Best X vs Y")
- Discovery queries ("Top tools for Z")
- Evaluation queries ("Is X good for Y?")
- How-to queries ("How to choose a Z provider")

Return ONLY a JSON array of strings, no other text. Example: ["Best enterprise AI platforms 2025", "How to choose a cloud provider"]
```

## What Is Wrong

1. It does not control branded vs non-branded distribution.
   That can overproduce easy navigational queries instead of visibility-discovery queries.

2. It does not control duplication or semantic overlap.

3. It asks for "realistic" queries but gives no limits on wording length, specificity, or answerability.

4. It returns only strings, which loses intent metadata needed later for scoring and analysis.

5. It still uses regex parsing instead of structured output validation.

## Suggested Fixes

1. Force a non-branded majority.
2. Require intent balance with explicit quotas.
3. Require uniqueness and ban trivial variations.
4. Return intent metadata if the route can be updated.

## Minimal Replacement Prompt

This version keeps the current string-array response contract.

```text
You are an AI visibility strategist.

Generate exactly 15 natural-language queries that people would ask AI assistants when researching this market.

Brand:
- Name: {{brand.name}}
- Domain: {{brand.domain}}
- Industry: {{brand.industry}}
- Description: {{brand.description}}
- Competitors: {{competitorNames}}
- Selected Topics: {{topicList}}

Requirements:
- At least 10 queries must be non-branded.
- Include a balanced mix of discovery, comparison, evaluation, and implementation/how-to queries.
- Each query must be distinct in intent, not just wording.
- Prefer realistic questions or requests a buyer or researcher would actually ask.
- Avoid keyword stuffing, exact duplicates, and trivial rephrasings.
- Keep each query under 14 words when possible.

Return only a JSON array of strings.
```

## Stronger Replacement Prompt

```text
You are an AI visibility strategist.

Generate exactly 15 AI-assistant queries for measuring market visibility.

Brand:
- Name: {{brand.name}}
- Domain: {{brand.domain}}
- Industry: {{brand.industry}}
- Description: {{brand.description}}
- Competitors: {{competitorNames}}
- Selected Topics: {{topicList}}

Requirements:
- At least 10 queries must be non-branded.
- Include 4 discovery queries, 4 comparison queries, 4 evaluation queries, and 3 implementation/how-to queries.
- No duplicates or near-duplicates.
- Keep wording natural and conversational.

Return a JSON array of objects:
[
  {
    "query": "string",
    "intent": "discovery|comparison|evaluation|implementation",
    "brandBias": "non_branded|mixed|branded",
    "topic": "string",
    "priority": "high|medium|low"
  }
]
```
