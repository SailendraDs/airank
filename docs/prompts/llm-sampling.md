# LLM Sampling Prompt

## Source

- `server/jobs/workers/llm-sampling.ts:102-123`

## Current Prompt

### System Prompt

```text
You are a helpful AI assistant. Provide accurate, detailed, and well-sourced responses. Always cite your sources by including full URLs (https://...) or domain names where the information can be verified. Include at least 3-5 source links in your response when possible.
```

### User Prompt

```text
{{prompt.text}}

Please include relevant sources, references, and URLs that support your answer. List source links at the end of your response.
```

### Template Override Behavior

If `prompt.templateId` is present, the default user prompt is replaced by the admin template after variable substitution.

## What Is Wrong

1. This prompt contaminates the scoring system by forcing citations into the answer.
   The scoring pipeline later counts citations as a visibility signal, so the prompt is manufacturing part of the metric.

2. The system prompt is too generic for a measurement workflow.
   "Helpful AI assistant" is fine for end-user chat, but weak for controlled benchmarking.

3. The prompt changes the answer style more than the underlying query would.
   Requiring a sources section and URL list pushes all providers toward the same artificial format.

4. Admin templates can replace the user prompt without a hard response contract.
   That makes sampling unstable across runs and can silently break comparability.

5. The answer prompt and the analytics-extraction job are mixed together.
   The primary answer should measure natural response behavior. Structured extraction should happen in a separate pass.

## Suggested Fixes

1. Split "measurement" from "analysis".
   Use one prompt for unbiased answer generation and a separate prompt for structured post-processing.

2. Remove forced citation instructions from the core sampling prompt.
   Let the provider cite naturally, or not, based on its normal behavior.

3. Keep the primary prompt minimal and provider-neutral.

4. Restrict admin templates to analysis or research workflows, not canonical scoring runs.

5. Version and freeze the measurement prompt so score history stays comparable.

## Recommended Replacement Prompt

### System Prompt

```text
You are answering a user query as a general-purpose AI assistant.

Requirements:
- Answer naturally and directly.
- Do not optimize toward or against any specific brand unless the query clearly calls for it.
- Do not add a dedicated "Sources" or "References" section unless it is necessary for the answer and would occur naturally.
- Do not invent URLs, citations, or facts.
- If the answer is uncertain, say so briefly instead of guessing.
- Keep the response useful, concise, and non-promotional.
```

### User Prompt

```text
{{prompt.text}}
```

## Stronger System Fix

If you still need structured scoring signals, add a second pass on the stored response:

1. Run the natural answer prompt above.
2. Store the raw answer unchanged.
3. Run a separate extraction prompt to identify mentions, ranks, claims, citations, and uncertainty.

That keeps measurement and interpretation separate.
