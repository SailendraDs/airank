import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { PerplexityProvider } from './perplexity';
import { GrokProvider } from './grok';
import { DeepSeekProvider } from './deepseek';
import { OpenRouterProvider } from './openrouter';
import type { BaseLLMProvider, LLMMessage, LLMResponse, LLMOptions, LLMProviderConfig } from './base';

export type LLMProviderName = 'openai' | 'anthropic' | 'google' | 'perplexity' | 'grok' | 'deepseek' | 'openrouter';

export class UnifiedLLMClient {
  private providers: Map<string, BaseLLMProvider> = new Map();

  constructor(config: LLMProviderConfig) {
    if (config.openai?.apiKey) {
      this.providers.set('openai', new OpenAIProvider(config.openai.apiKey, config.openai.baseURL));
    }
    if (config.anthropic?.apiKey) {
      this.providers.set('anthropic', new AnthropicProvider(config.anthropic.apiKey, config.anthropic.baseURL, config.anthropic.model));
    }
    if (config.google?.apiKey) {
      this.providers.set('google', new GoogleProvider(config.google.apiKeys || config.google.apiKey, config.google.baseURL, config.google.openRouterFallback));
    }
    if (config.perplexity?.apiKey) {
      this.providers.set('perplexity', new PerplexityProvider(config.perplexity.apiKey, config.perplexity.baseURL, config.perplexity.openRouterFallback));
    }
    if (config.grok?.apiKey) {
      this.providers.set('grok', new GrokProvider(config.grok.apiKey, config.grok.baseURL));
    }
    if (config.deepseek?.apiKey) {
      this.providers.set('deepseek', new DeepSeekProvider(config.deepseek.apiKey, config.deepseek.baseURL, config.deepseek.openRouterFallback));
    }
    if (config.openrouter?.apiKey) {
      this.providers.set('openrouter', new OpenRouterProvider(
        config.openrouter.apiKey,
        config.openrouter.baseURL,
        config.openrouter.appName,
        config.openrouter.appUrl
      ));
    }
  }

  async chat(
    provider: LLMProviderName,
    messages: LLMMessage[],
    options?: LLMOptions
  ): Promise<LLMResponse> {
    const llmProvider = this.providers.get(provider);

    if (!llmProvider) {
      throw new Error(`Provider ${provider} not configured. Please add API key to configuration.`);
    }

    return await llmProvider.chat(messages, options);
  }

  async chatMultiple(
    providers: LLMProviderName[],
    messages: LLMMessage[],
    options?: LLMOptions
  ): Promise<Record<string, LLMResponse>> {
    const results: Record<string, LLMResponse> = {};

    await Promise.all(
      providers.map(async (provider) => {
        try {
          results[provider] = await this.chat(provider, messages, options);
        } catch (error: any) {
          console.error(`Failed to get response from ${provider}:`, error.message);
          // Continue with other providers even if one fails
        }
      })
    );

    return results;
  }

  getAvailableProviders(): LLMProviderName[] {
    return Array.from(this.providers.keys()) as LLMProviderName[];
  }

  getAvailableModels(provider: LLMProviderName): string[] {
    const llmProvider = this.providers.get(provider);
    return llmProvider ? llmProvider.getAvailableModels() : [];
  }

  getAllAvailableModels(): Record<LLMProviderName, string[]> {
    const models: Record<string, string[]> = {};
    this.providers.forEach((llmProvider, provider) => {
      models[provider] = llmProvider.getAvailableModels();
    });
    return models as Record<LLMProviderName, string[]>;
  }
}

// Export types and classes
export * from './base';
export { OpenAIProvider } from './openai';
export { AnthropicProvider } from './anthropic';
export { GoogleProvider } from './google';
export { PerplexityProvider } from './perplexity';
export { GrokProvider } from './grok';
export { DeepSeekProvider } from './deepseek';
export { OpenRouterProvider } from './openrouter';
