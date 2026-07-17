import { BaseLLMProvider, type LLMMessage, type LLMResponse, type LLMOptions } from './base';

/**
 * Grok (xAI) Provider
 * 
 * Grok uses OpenAI-compatible API
 * Docs: https://docs.x.ai/
 */
export class GrokProvider extends BaseLLMProvider {
  constructor(apiKey: string, baseURL: string = 'https://api.x.ai/v1') {
    super(apiKey, baseURL);
  }

  getAvailableModels(): string[] {
    return [
      'grok-3',
      'grok-3-mini',
      'grok-4',
      'grok-vision-beta',
    ];
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model || 'grok-3';
    
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
        throw new Error(`Grok API error: ${error.error?.message || response.statusText}`);
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
        provider: 'grok',
        usage,
        cost: this.calculateCost(usage, model),
        metadata: {
          finishReason: data.choices[0].finish_reason,
          id: data.id,
        },
      };
    } catch (error: any) {
      throw new Error(`Grok chat failed: ${error.message}`);
    }
  }

  calculateCost(usage: { promptTokens: number; completionTokens: number }, model: string): number {
    // Pricing as of Jan 2026 (per 1M tokens)
      const pricing: Record<string, { input: number; output: number }> = {
      'grok-3': { input: 5.00, output: 15.00 },
      'grok-3-mini': { input: 1.00, output: 5.00 },
      'grok-4': { input: 5.00, output: 15.00 },
      'grok-vision-beta': { input: 5.00, output: 15.00 },
    };

    const modelPricing = pricing[model] || pricing['grok-3'];
    const inputCost = (usage.promptTokens / 1_000_000) * modelPricing.input;
    const outputCost = (usage.completionTokens / 1_000_000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
}
