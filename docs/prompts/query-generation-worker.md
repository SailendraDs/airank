# Query Generation Worker Prompt

## Source

- `server/jobs/workers/query-generation.ts:48-61`

## Current Prompt

```text
Generate {{queriesPerTopic}} specific search queries related to: "{{topic.topic}}"

These queries should:
1. Be natural questions people would ask
2. Be relevant for tracking "{{brandName}}" visibility
3. Vary in specificity and angle
4. Include different query types (questions, comparisons, how-to, etc.)

Return ONLY a JSON array of query strings.
Example: ["how does X compare to Y?", "best X for Z", "X vs Y review"]
```

## What Is Wrong

1. The input field is wrong.
   The schema uses `topic.name`, but the worker prompt references `topic.topic`.

2. The prompt is too generic and under-constrained.
   It does not force uniqueness, non-branded coverage, or realistic buyer intent.

3. It ties the query set too directly to brand visibility without clarifying market visibility versus navigational queries.

4. It returns only raw strings, which loses intent metadata.

## Suggested Fixes

1. Use the actual topic name from the schema.
2. Require uniqueness and intent diversity.
3. Prefer mostly non-branded queries unless the topic is explicitly branded.
4. Return structured query objects if possible.

## Minimal Replacement Prompt

```text
Generate exactly {{queriesPerTopic}} natural-language AI-assistant queries related to the topic "{{topic.name}}".

Brand context:
- Brand: {{brandName}}

Requirements:
- Each query must represent a distinct intent.
- Prefer non-branded wording unless a branded query is clearly necessary.
- Include a mix of discovery, comparison, evaluation, and implementation/how-to queries where relevant.
- Avoid duplicates, trivial rephrases, and keyword-stuffed phrasing.
- Keep queries realistic and conversational.

Return only a JSON array of strings.
```

## Stronger Replacement Prompt

```text
Generate exactly {{queriesPerTopic}} natural-language AI-assistant queries for the topic "{{topic.name}}".

Brand context:
- Brand: {{brandName}}

Requirements:
- Each query must be distinct in user intent.
- Prefer non-branded wording unless the topic itself is branded.
- Include a balanced mix of query intents where relevant.

Return a JSON array of objects:
[
  {
    "text": "string",
    "intent": "discovery|comparison|evaluation|implementation",
    "brandBias": "non_branded|mixed|branded",
    "priority": "high|medium|low"
  }
]
```

## Required Code Fix

The worker currently references `topic.topic`. That should be corrected before judging prompt quality, because the model may be receiving bad or empty input.
