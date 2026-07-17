import { BaseLLMProvider, type LLMMessage, type LLMResponse, type LLMOptions, type OpenRouterFallbackConfig } from './base';
import { chatViaOpenRouterFallback } from './openrouter-fallback';

export class GoogleProvider extends BaseLLMProvider {
  private apiKeys: string[];
  private openRouterFallback?: OpenRouterFallbackConfig;

  constructor(apiKey: string | string[], baseURL: string = 'https://generativelanguage.googleapis.com/v1beta', openRouterFallback?: OpenRouterFallbackConfig) {
    const apiKeys = Array.from(new Set((Array.isArray(apiKey) ? apiKey : [apiKey]).filter(Boolean)));
    super(apiKeys[0] || '', baseURL);
    this.apiKeys = apiKeys;
    this.openRouterFallback = openRouterFallback;
  }

  getAvailableModels(): string[] {
    return ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model || 'gemini-2.0-flash';
    
    // Convert messages to Gemini format
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find(m => m.role === 'system')?.content;

    const errors: string[] = [];
    for (const apiKey of this.apiKeys) {
      try {
        return await this.chatWithKey(apiKey, model, contents, systemInstruction, options);
      } catch (error: any) {
        const message = String(error.message || 'unknown error').replace(/api_key:[A-Za-z0-9_\-]+/g, 'api_key:[redacted]');
        errors.push(message);
      }
    }

    if (this.openRouterFallback) {
      try {
        const response = await chatViaOpenRouterFallback(this.openRouterFallback, 'google', messages, options);
        return {
          ...response,
          cost: this.calculateCost(response.usage, response.model),
          metadata: {
            ...response.metadata,
            directErrors: errors,
          },
        };
      } catch (error: any) {
        errors.push(String(error.message || error));
      }
    }

    throw new Error(`Google chat failed: ${errors.join(' | ') || 'no Google API keys configured'}`);
  }

  private async chatWithKey(
    apiKey: string,
    model: string,
    contents: Array<{ role: string; parts: Array<{ text: string }> }>,
    systemInstruction: string | undefined,
    options?: LLMOptions,
  ): Promise<LLMResponse> {
    try {
      const response = await fetch(
        `${this.baseURL}/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents,
            systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
            generationConfig: {
              temperature: options?.temperature ?? 0.7,
              maxOutputTokens: options?.maxTokens ?? 2000,
              topP: options?.topP ?? 1,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        const message = String(error.error?.message || response.statusText || '').replace(/api_key:[A-Za-z0-9_\-]+/g, 'api_key:[redacted]');
        throw new Error(`Google API error: ${message}`);
      }

      const data = await response.json();
      const candidate = Array.isArray(data.candidates) ? data.candidates[0] : null;
      if (!candidate) {
        const promptFeedback = data.promptFeedback
          ? ` promptFeedback=${JSON.stringify(data.promptFeedback)}`
          : '';
        throw new Error(`Google API returned no candidates.${promptFeedback}`);
      }
      const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
      const content = parts
        .map((part: any) => typeof part?.text === 'string' ? part.text : '')
        .filter(Boolean)
        .join('\n')
        .trim();
      if (!content) {
        throw new Error(`Google API returned no text content. finishReason=${candidate.finishReason || 'unknown'} safetyRatings=${JSON.stringify(candidate.safetyRatings || [])}`);
      }
      const usage = {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      };

      return {
        content,
        model,
        provider: 'google',
        usage,
        cost: this.calculateCost(usage, model),
        metadata: {
          finishReason: candidate.finishReason,
          safetyRatings: candidate.safetyRatings,
        },
      };
    } catch (error: any) {
      const message = String(error.message || 'unknown error').replace(/api_key:[A-Za-z0-9_\-]+/g, 'api_key:[redacted]');
      throw new Error(message);
    }
  }

  calculateCost(usage: { promptTokens: number; completionTokens: number }, model: string): number {
    // Pricing as of Jan 2026 (per 1M tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'gemini-2.0-flash-exp': { input: 0.00, output: 0.00 }, // Free during preview
      'gemini-1.5-pro': { input: 1.25, output: 5.00 },
      'gemini-1.5-flash': { input: 0.075, output: 0.30 },
    };

    const modelPricing = pricing[model] || pricing['gemini-1.5-flash'];
    const inputCost = (usage.promptTokens / 1_000_000) * modelPricing.input;
    const outputCost = (usage.completionTokens / 1_000_000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
}
