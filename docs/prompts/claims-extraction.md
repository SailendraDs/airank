# Claims Extraction Prompt

## Source

- `server/services/claims-extraction.ts:62-89`

## Current Prompt

```text
Analyze the following text and extract all factual claims, opinions, comparisons, and recommendations related to "{{brandName}}".

For each claim, identify:
1. The claim text (exact quote if possible)
2. Type: factual, opinion, comparison, or recommendation
3. Subject: what the claim is about
4. Predicate: what is being claimed
5. Sentiment: positive, neutral, or negative

Text to analyze:
"""
{{responseText}}
"""

Return ONLY a JSON array of claims with this structure:
[{
  "text": "exact claim text",
  "type": "factual|opinion|comparison|recommendation",
  "subject": "what it's about",
  "predicate": "what is claimed",
  "sentiment": "positive|neutral|negative",
  "confidence": 0.0-1.0
}]
```

## What Is Good

1. The task is specific.
2. The output shape is already semi-structured.
3. The temperature is low, which is appropriate.

## What Is Wrong

1. It does not require explicit evidence spans.
   That makes claims harder to verify and link back to the original answer.

2. It does not capture entity normalization.

3. It does not distinguish unsupported claims from uncertain claims.

4. It returns only claim records, but downstream graph-building also needs entities and evidence linkage.

5. It still uses regex extraction of JSON instead of a strict schema.

## Suggested Fixes

1. Require exact evidence spans from the text.
2. Add entity extraction at the same time.
3. Add an `evidenceType` or `supportLevel` field.
4. Return a richer object, not just a flat claim array.

## Recommended Replacement Prompt

```text
Analyze the text below and extract claims related to "{{brandName}}".

Rules:
- Extract only claims supported by the text.
- For each claim, include an exact evidence span copied from the text.
- If a statement is uncertain or speculative, mark it clearly.
- Keep entity names canonical when possible.

Text:
"""
{{responseText}}
"""

Return a JSON object:
{
  "claims": [
    {
      "text": "string",
      "type": "factual|opinion|comparison|recommendation",
      "subject": "string",
      "predicate": "string",
      "sentiment": "positive|neutral|negative",
      "confidence": 0.0,
      "supportLevel": "explicit|implied|uncertain",
      "evidenceSpan": "string",
      "entities": ["string"]
    }
  ],
  "entities": [
    {
      "name": "string",
      "type": "brand|competitor|product|feature|person|organization|other"
    }
  ]
}
```

## Required Code Fix

This service should parse a structured object directly and use evidence spans to improve citation and claim linkage.
