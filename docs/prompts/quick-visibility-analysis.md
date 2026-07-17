# Quick Visibility Analysis Prompt

## Source

- `server/routes.ts:4536-4546`

## Current Prompt

```text
Analyze the brand "{{brandName}}"{{domainCtx}} and provide insights on its AI visibility.

Assess:
1. Definition & Identity: Who is this brand?
2. Authority & Legitimacy: Is this a recognized entity?
3. Products/Services: What does it offer?

Assess Hallucination Risk: If obscure or you are guessing, mark High.

Provide:
- Recognition score (0-100)
- Recognition level (high/medium/low/partial/unknown)
- Key brand associations (comma-separated list)
- Brief brand context description
- Confidence score (0-1)
- Hallucination Risk (Low/Medium/High)
- 3 numbered improvement suggestions
```

## What Is Wrong

1. The output is freeform prose, but the code parses it with regex.
   That is brittle and easy to break.

2. The model is being asked to self-report a score.
   That score is not calibrated and can vary heavily by phrasing.

3. Recognition level is effectively derived from the score in code anyway.

4. Confidence is not directly returned and is partly inferred from response length and keywords in downstream code.

5. The prompt does not define how to handle ambiguity or conflicting evidence in a structured way.

## Suggested Fixes

1. Force JSON output.
2. Replace freeform numbered suggestions with a structured array.
3. Require explicit evidence basis and uncertainty notes.
4. Treat this as a heuristic summary, not a canonical score source.

## Recommended Replacement Prompt

```text
Analyze the brand below and provide a structured AI-visibility recognition assessment.

Brand:
- Name: {{brandName}}
- Domain: {{domain}}

Rules:
- If the brand is obscure or uncertain, say so clearly.
- Do not invent products, services, or authority signals.
- If recognition is weak, return lower confidence.

Return a JSON object:
{
  "recognitionScore": 0,
  "recognitionLevel": "high|medium|low|partial|unknown",
  "confidenceScore": 0.0,
  "hallucinationRisk": "low|medium|high",
  "brandContext": "string",
  "keyAssociations": ["string"],
  "uncertaintyNotes": ["string"],
  "improvementSuggestions": ["string"]
}
```

## Required Code Fix

This route should stop regex-parsing prose and parse a structured object directly.
