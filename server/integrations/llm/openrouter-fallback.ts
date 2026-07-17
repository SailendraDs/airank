import type { LLMMessage, LLMOptions, LLMResponse, OpenRouterFallbackConfig } from './base';

export async function chatViaOpenRouterFallback(
  config: OpenRouterFallbackConfig,
  provider: string,
  messages: LLMMessage[],
  options?: LLMOptions,
): Promise<LLMResponse> {
  const baseURL = (config.baseURL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = config.model;
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'HTTP-Referer': config.appUrl || 'https://airank.com',
      'X-Title': config.appName || 'AIRank',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: Math.max(options?.maxTokens ?? 2000, 24),
      top_p: options?.topP ?? 1,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`OpenRouter fallback error: ${error.error?.message || error.message || response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`OpenRouter fallback error: ${data.error.message || data.error.code || 'Provider returned error'}`);
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`OpenRouter fallback error: empty response content`);
  }
  const usage = {
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
    totalTokens: data.usage?.total_tokens || 0,
  };

  return {
    content,
    model: data.model || model,
    provider,
    usage,
    cost: 0,
    metadata: {
      finishReason: data.choices?.[0]?.finish_reason,
      id: data.id,
      routedVia: 'openrouter',
      requestedModel: model,
      upstreamProvider: data.provider,
    },
  };
}
