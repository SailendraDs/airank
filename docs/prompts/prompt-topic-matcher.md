# Prompt Topic Matcher Prompt

## Source

- `server/services/prompt-topic-matcher.ts:33-58`

## Current Prompt

```text
You are a semantic matching engine. Given a list of topics and prompts, match each prompt to the most relevant topic based on meaning and intent.

Topics:
- ID: "..." | Name: "..." | Category: "..."

For each prompt, return a JSON array of objects with format:
[{"promptId": "...", "topicId": "..."}]

If a prompt doesn't clearly match any topic, assign it to the most closely related one. Every prompt must be matched to exactly one topic.
Return ONLY the JSON array, no explanation.
```

## What Is Good

1. The role is clear.
2. The task is narrowly scoped.
3. Temperature is already low, which is correct.

## What Is Wrong

1. It forces a match even when there is no good match.
   That creates false confidence and pollutes topic analytics.

2. It does not return confidence.

3. It does not return reasoning, so bad matches are hard to audit.

4. It still relies on regex parsing instead of a validated schema.

## Suggested Fixes

1. Allow `null` when no topic is a good fit.
2. Add confidence and short rationale.
3. Only auto-assign above a threshold.

## Recommended Replacement Prompt

```text
You are a semantic topic-matching engine.

Given a list of topics and prompts, match each prompt to the best topic only if the fit is strong enough.

Topics:
{{topic_list}}

Rules:
- Match based on semantic intent, not just keyword overlap.
- If no topic is a strong fit, return null for topicId.
- Keep rationale short and specific.

Return a JSON array:
[
  {
    "promptId": "string",
    "topicId": "string|null",
    "confidence": 0.0,
    "reason": "string"
  }
]
```

## Required Code Fix

Do not auto-write matches with low confidence. Store or review uncertain mappings separately.
