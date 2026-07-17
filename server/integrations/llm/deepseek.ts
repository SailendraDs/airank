import { BaseLLMProvider, type LLMMessage, type LLMResponse, type LLMOptions, type OpenRouterFallbackConfig } from './base';
import { chatViaOpenRouterFallback } from './openrouter-fallback';

/**
 * DeepSeek AI Provider
 * 
 * DeepSeek uses OpenAI-compatible API
 * Docs: https://platform.deepseek.com/api-docs/
 */
export class DeepSeekProvider extends BaseLLMProvider {
  private openRouterFallback?: OpenRouterFallbackConfig;

  constructor(apiKey: string, baseURL: string = 'https://api.deepseek.com/v1', openRouterFallback?: OpenRouterFallbackConfig) {
    super(apiKey, baseURL);
    this.openRouterFallback = openRouterFallback;
  }

  getAvailableModels(): string[] {
    return [
      'deepseek-chat',
      'deepseek-coder',
    ];
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model || 'deepseek-chat';
    
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
        throw new Error(`DeepSeek API error: ${error.error?.message || response.statusText}`);
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
        provider: 'deepseek',
        usage,
        cost: this.calculateCost(usage, model),
        metadata: {
          finishReason: data.choices[0].finish_reason,
          id: data.id,
        },
      };
    } catch (error: any) {
      if (this.openRouterFallback) {
        try {
          const response = await chatViaOpenRouterFallback(this.openRouterFallback, 'deepseek', messages, options);
          return {
            ...response,
            cost: this.calculateCost(response.usage, response.model),
            metadata: {
              ...response.metadata,
              directError: String(error.message || error),
            },
          };
        } catch (fallbackError: any) {
          throw new Error(`DeepSeek chat failed: ${error.message}; ${fallbackError.message || fallbackError}`);
        }
      }
      throw new Error(`DeepSeek chat failed: ${error.message}`);
    }
  }

  calculateCost(usage: { promptTokens: number; completionTokens: number }, model: string): number {
    // Pricing as of Jan 2026 (per 1M tokens)
    // DeepSeek is known for very competitive pricing
    const pricing: Record<string, { input: number; output: number }> = {
      'deepseek-chat': { input: 0.14, output: 0.28 },
      'deepseek-coder': { input: 0.14, output: 0.28 },
      'deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
      'deepseek/deepseek-chat-v3': { input: 0.14, output: 0.28 },
      'deepseek/deepseek-v3.2': { input: 0.14, output: 0.28 },
    };

    const modelPricing = pricing[model] || pricing['deepseek-chat'];
    const inputCost = (usage.promptTokens / 1_000_000) * modelPricing.input;
    const outputCost = (usage.completionTokens / 1_000_000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
}
