import { BaseLLMProvider, type LLMMessage, type LLMResponse, type LLMOptions, type OpenRouterFallbackConfig } from './base';
import { chatViaOpenRouterFallback } from './openrouter-fallback';

/**
 * Perplexity AI Provider
 * 
 * Perplexity uses OpenAI-compatible API
 * Docs: https://docs.perplexity.ai/
 */
export class PerplexityProvider extends BaseLLMProvider {
  private openRouterFallback?: OpenRouterFallbackConfig;

  constructor(apiKey: string, baseURL: string = 'https://api.perplexity.ai', openRouterFallback?: OpenRouterFallbackConfig) {
    super(apiKey, baseURL);
    this.openRouterFallback = openRouterFallback;
  }

  getAvailableModels(): string[] {
    return [
      'llama-3.1-sonar-small-128k-online',
      'llama-3.1-sonar-large-128k-online',
      'llama-3.1-sonar-huge-128k-online',
      'llama-3.1-sonar-small-128k-chat',
      'llama-3.1-sonar-large-128k-chat',
    ];
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model || 'llama-3.1-sonar-small-128k-online';
    
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 2000,
          top_p: options?.topP ?? 1,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Perplexity API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const usage = {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      };

      return {
        content: data.choices[0].message.content,
        model: data.model,
        provider: 'perplexity',
        usage,
        cost: this.calculateCost(usage, model),
        metadata: {
          finishReason: data.choices[0].finish_reason,
          id: data.id,
          citations: data.citations || [], // Perplexity provides citations
        },
      };
    } catch (error: any) {
      if (this.openRouterFallback) {
        try {
          const response = await chatViaOpenRouterFallback(this.openRouterFallback, 'perplexity', messages, options);
          return {
            ...response,
            cost: this.calculateCost(response.usage, response.model),
            metadata: {
              ...response.metadata,
              directError: String(error.message || error),
            },
          };
        } catch (fallbackError: any) {
          throw new Error(`Perplexity chat failed: ${error.message}; ${fallbackError.message || fallbackError}`);
        }
      }
      throw new Error(`Perplexity chat failed: ${error.message}`);
    }
  }

  calculateCost(usage: { promptTokens: number; completionTokens: number }, model: string): number {
    // Pricing as of Jan 2026 (per 1M tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'llama-3.1-sonar-small-128k-online': { input: 0.20, output: 0.20 },
      'llama-3.1-sonar-large-128k-online': { input: 1.00, output: 1.00 },
      'llama-3.1-sonar-huge-128k-online': { input: 5.00, output: 5.00 },
      'llama-3.1-sonar-small-128k-chat': { input: 0.20, output: 0.20 },
      'llama-3.1-sonar-large-128k-chat': { input: 1.00, output: 1.00 },
      'perplexity/sonar-pro': { input: 3.00, output: 15.00 },
      'perplexity/sonar': { input: 1.00, output: 1.00 },
    };

    const modelPricing = pricing[model] || pricing['llama-3.1-sonar-small-128k-online'];
    const inputCost = (usage.promptTokens / 1_000_000) * modelPricing.input;
    const outputCost = (usage.completionTokens / 1_000_000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
}
