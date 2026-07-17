# Topic Generation Worker Prompt

## Source

- `server/jobs/workers/topic-generation.ts:35-52`

## Current Prompt

```text
Generate {{count}} relevant search topics/queries that people might use when looking for information related to "{{brandName}}".

Brand Description: {{description}}
Industry: {{industry}}

Generate topics that:
1. Are natural search queries people would actually use
2. Cover different aspects of the brand (products, services, comparisons, reviews, etc.)
3. Include both broad and specific queries
4. Are relevant for AI visibility tracking

Return ONLY a JSON array of topics, each with: topic, category, and searchIntent.
Example: [{"topic": "best CRM software for small business", "category": "product_comparison", "searchIntent": "commercial"}]
```

## What Is Wrong

1. It mixes "topics" and "queries" in the same prompt.
   A topic taxonomy and a query list are not the same asset.

2. The output fields do not match the schema used by `topics`.
   The schema uses `name`, `category`, `importance`, not `topic` and `searchIntent`.

3. The example output is actually a query, not a topic.
   That will push the model toward generating prompt text rather than topic buckets.

4. The prompt does not establish a clean topic taxonomy.

## Suggested Fixes

1. Generate topic clusters, not search queries.
2. Align the output fields with the database contract.
3. Add importance to support prioritization.
4. Keep topic names short and reusable.

## Recommended Replacement Prompt

```text
You are designing a topic taxonomy for AI visibility tracking.

Generate exactly {{count}} topic clusters for the brand below.

Brand:
- Name: {{brandName}}
- Description: {{description}}
- Industry: {{industry}}

Requirements:
- Each topic should be a reusable topic cluster, not a full search query.
- Keep each topic name between 2 and 5 words.
- Cover product/service discovery, comparison, evaluation, implementation, and trust/credibility where relevant.
- Avoid duplicates and near-duplicates.
- Prefer market-level themes over purely navigational branded phrases.

Return a JSON array of objects:
[
  {
    "name": "string",
    "category": "discovery|comparison|evaluation|implementation|trust|general",
    "importance": "high|medium|low"
  }
]
```

## Required Code Fix

If you adopt this prompt, the worker should store:

- `name` instead of `topic`
- `importance` instead of `searchIntent`

Right now the prompt and schema are out of sync.
