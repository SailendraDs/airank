// Base interface for all LLM providers
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: number;
  metadata?: Record<string, any>;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  model?: string;
}

export interface OpenRouterFallbackConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  appName?: string;
  appUrl?: string;
}

export abstract class BaseLLMProvider {
  protected apiKey: string;
  protected baseURL: string;

  constructor(apiKey: string, baseURL?: string) {
    this.apiKey = apiKey;
    this.baseURL = baseURL || '';
  }

  abstract chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
  abstract getAvailableModels(): string[];
  abstract calculateCost(usage: { promptTokens: number; completionTokens: number }, model: string): number;
}

export interface LLMProviderConfig {
  openai?: { apiKey: string; baseURL?: string };
  anthropic?: { apiKey: string; baseURL?: string; model?: string };
  google?: { apiKey: string; apiKeys?: string[]; baseURL?: string; openRouterFallback?: OpenRouterFallbackConfig };
  perplexity?: { apiKey: string; baseURL?: string; openRouterFallback?: OpenRouterFallbackConfig };
  grok?: { apiKey: string; baseURL?: string };
  deepseek?: { apiKey: string; baseURL?: string; openRouterFallback?: OpenRouterFallbackConfig };
  openrouter?: { apiKey: string; baseURL?: string; appName?: string; appUrl?: string };
}
