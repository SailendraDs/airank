import { BaseLLMProvider, type LLMMessage, type LLMResponse, type LLMOptions } from './base';

export class AnthropicProvider extends BaseLLMProvider {
  private modelOverride?: string;

  constructor(apiKey: string, baseURL: string = 'https://api.anthropic.com/v1', model?: string) {
    super(apiKey, baseURL);
    this.modelOverride = model;
  }

  getAvailableModels(): string[] {
    return [
      ...(this.modelOverride ? [this.modelOverride] : []),
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
    ];
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = this.modelOverride || options?.model || 'claude-sonnet-4-20250514';
    
    // Convert messages format (Anthropic doesn't use system in messages array)
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const conversationMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const response = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          messages: conversationMessages,
          system: systemMessage,
          max_tokens: options?.maxTokens ?? 2000,
          temperature: options?.temperature ?? 0.7,
          top_p: options?.topP ?? 1,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Anthropic API error: ${error.error?.message || error.message || response.statusText}`);
      }

      const data = await response.json();
      const usage = {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      };

      return {
        content: Array.isArray(data.content)
          ? data.content.map((part: any) => part?.text || '').join('').trim()
          : String(data.content || ''),
        model: data.model,
        provider: 'anthropic',
        usage,
        cost: this.calculateCost(usage, model),
        metadata: {
          stopReason: data.stop_reason,
          id: data.id,
        },
      };
    } catch (error: any) {
      throw new Error(`Anthropic chat failed: ${error.message}`);
    }
  }

  calculateCost(usage: { promptTokens: number; completionTokens: number }, model: string): number {
    // Pricing as of Jan 2026 (per 1M tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
      'claude-opus-4-8': { input: 15.00, output: 75.00 },
      'claude-opus-4-7': { input: 15.00, output: 75.00 },
      'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
      'claude-3-5-sonnet-latest': { input: 3.00, output: 15.00 },
      'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
      'claude-3-5-haiku-latest': { input: 0.80, output: 4.00 },
      'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
      'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
    };

    const modelPricing = pricing[model] || pricing['claude-3-5-sonnet-latest'];
    const inputCost = (usage.promptTokens / 1_000_000) * modelPricing.input;
    const outputCost = (usage.completionTokens / 1_000_000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
}
