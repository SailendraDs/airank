# Prompt Review Pack

This folder captures the LLM/API prompts currently used in the project and the fixes I recommend for each one.

Files:

- `llm-sampling.md`: Primary measurement prompt used for brand visibility sampling.
- `topic-generation-route.md`: OpenRouter topic-cluster prompt in `server/routes.ts`.
- `query-generation-route.md`: OpenRouter query-generation prompt in `server/routes.ts`.
- `topic-generation-worker.md`: Worker prompt that generates topics via the integrations layer.
- `query-generation-worker.md`: Worker prompt that generates prompts/queries from topics.
- `gap-analysis.md`: Structured AI gap-analysis prompt.
- `quick-visibility-analysis.md`: Fast brand-recognition / AI-visibility prompt.
- `prompt-topic-matcher.md`: Prompt-to-topic semantic matching prompt.
- `claims-extraction.md`: Structured claims extraction prompt.

Each file includes:

1. Current source and prompt text
2. What is wrong with the prompt
3. Suggested fixes
4. A replacement prompt you can evaluate
