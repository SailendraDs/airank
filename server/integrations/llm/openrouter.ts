import { BaseLLMProvider, type LLMMessage, type LLMResponse, type LLMOptions } from './base';

/**
 * OpenRouter Provider
 * 
 * OpenRouter provides access to multiple LLM providers through a unified API
 * Docs: https://openrouter.ai/docs
 */
export class OpenRouterProvider extends BaseLLMProvider {
  private appName: string;
  private appUrl: string;

  constructor(
    apiKey: string, 
    baseURL: string = 'https://openrouter.ai/api/v1',
    appName: string = 'AIRank',
    appUrl: string = 'https://airank.com'
  ) {
    super(apiKey, baseURL);
    this.appName = appName;
    this.appUrl = appUrl;
  }

  getAvailableModels(): string[] {
    return [
      // Qwen models (cost-effective for simple tasks)
      'qwen/qwen-2.5-72b-instruct',
      'qwen/qwen-2.5-32b-instruct',
      'qwen/qwen-2.5-14b-instruct',
      'qwen/qwen-2.5-7b-instruct',
      'qwen/qwen-2.5-3.2b-instruct',
      // OpenAI models via OpenRouter
      'openai/gpt-4-turbo',
      'openai/gpt-4o',
      'openai/gpt-3.5-turbo',
      // Anthropic models
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-opus',
      'anthropic/claude-3-haiku',
      // Google models
      'google/gemini-2.5-flash-lite',
      'google/gemini-2.0-flash-lite',
      'google/gemini-pro-1.5',
      'google/gemini-flash-1.5',
      // Meta models
      'meta-llama/llama-3.1-405b-instruct',
      'meta-llama/llama-3.1-70b-instruct',
      // Mistral models
      'mistralai/mistral-large',
      'mistralai/mixtral-8x7b-instruct',
      // Other popular models
      'perplexity/llama-3.1-sonar-large-128k-online',
      'deepseek/deepseek-chat',
      'x-ai/grok-beta',
    ];
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model || 'openai/gpt-4o-mini';
    
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.appUrl,
          'X-Title': this.appName,
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
        throw new Error(`OpenRouter API error: ${error.error?.message || response.statusText}`);
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
        provider: 'openrouter',
        usage,
        cost: this.calculateCost(usage, model),
        metadata: {
          finishReason: data.choices[0].finish_reason,
          id: data.id,
          // OpenRouter provides additional metadata
          nativeTokensPrompt: data.usage?.native_tokens_prompt,
          nativeTokensCompletion: data.usage?.native_tokens_completion,
        },
      };
    } catch (error: any) {
      throw new Error(`OpenRouter chat failed: ${error.message}`);
    }
  }

  calculateCost(usage: { promptTokens: number; completionTokens: number }, model: string): number {
    // OpenRouter uses dynamic pricing based on the underlying model
    // These are approximate costs - actual costs are returned in the API response
    const pricing: Record<string, { input: number; output: number }> = {
      // Qwen models (very cost-effective)
      'qwen/qwen-2.5-72b-instruct': { input: 0.40, output: 0.80 },
      'qwen/qwen-2.5-32b-instruct': { input: 0.10, output: 0.20 },
      'qwen/qwen-2.5-14b-instruct': { input: 0.05, output: 0.10 },
      'qwen/qwen-2.5-7b-instruct': { input: 0.05, output: 0.10 },
      'qwen/qwen-2.5-3.2b-instruct': { input: 0.05, output: 0.10 },
      // OpenAI models via OpenRouter
      'openai/gpt-4-turbo': { input: 10.00, output: 30.00 },
      'openai/gpt-4o': { input: 5.00, output: 15.00 },
      'openai/gpt-3.5-turbo': { input: 0.50, output: 1.50 },
      // Anthropic models
      'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
      'anthropic/claude-3-opus': { input: 15.00, output: 75.00 },
      'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
      // Google models
      'google/gemini-pro-1.5': { input: 1.25, output: 5.00 },
      'google/gemini-flash-1.5': { input: 0.075, output: 0.30 },
      // Meta models
      'meta-llama/llama-3.1-405b-instruct': { input: 3.00, output: 3.00 },
      'meta-llama/llama-3.1-70b-instruct': { input: 0.52, output: 0.75 },
      // Mistral models
      'mistralai/mistral-large': { input: 3.00, output: 9.00 },
      'mistralai/mixtral-8x7b-instruct': { input: 0.24, output: 0.24 },
      // Other popular models
      'perplexity/llama-3.1-sonar-large-128k-online': { input: 1.00, output: 1.00 },
      'deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
      'x-ai/grok-beta': { input: 5.00, output: 15.00 },
    };

    const modelPricing = pricing[model] || { input: 1.00, output: 1.00 };
    const inputCost = (usage.promptTokens / 1_000_000) * modelPricing.input;
    const outputCost = (usage.completionTokens / 1_000_000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
}

