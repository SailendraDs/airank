// Single source of truth for plan → provider mapping.
// Import this wherever provider access needs to be checked.

export const PLAN_PROVIDERS: Record<string, string[]> = {
  free:       ['openai'],
  starter:    ['openai', 'google'],
  growth:     ['openai', 'anthropic', 'google', 'perplexity', 'deepseek'],
  enterprise: ['openai', 'anthropic', 'google', 'perplexity', 'deepseek', 'grok', 'openrouter'],
};

// Display names for UI
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai:      'GPT-4o',
  anthropic:   'Claude 3.5 Sonnet',
  google:      'Gemini 1.5 Pro',
  perplexity:  'Perplexity',
  deepseek:    'DeepSeek V3',
  grok:        'Grok 3',
  openrouter:  'Claude 3.5 (via OpenRouter)',
};

// Model strings passed to each provider
export const PROVIDER_MODELS: Record<string, string> = {
  openai:      'gpt-4o',
  anthropic:   'claude-3-5-sonnet-20241022',
  google:      'gemini-1.5-pro',
  perplexity:  'llama-3.1-sonar-large-128k-online',
  deepseek:    'deepseek-chat',
  grok:        'grok-3',
  openrouter:  'openai/gpt-4o-mini',
};

export const CORE_SCAN_PROVIDERS = ['openai', 'anthropic', 'google', 'perplexity', 'deepseek', 'grok'] as const;

export const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  google: ['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  grok: ['GROK_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
};

export function getProviderEnvHint(provider: string): string | null {
  const keys = PROVIDER_ENV_KEYS[provider] || [];
  return keys.length ? keys.join(' or ') : null;
}

export function isProviderConfigured(provider: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return (PROVIDER_ENV_KEYS[provider] || []).some((key) => Boolean(env[key]));
}

export function configuredProviderMap(env: NodeJS.ProcessEnv = process.env): Record<string, boolean> {
  return Object.fromEntries(
    Object.keys(PROVIDER_MODELS).map((provider) => [provider, isProviderConfigured(provider, env)]),
  );
}

export function syncProviderEnvAliases(env: NodeJS.ProcessEnv = process.env): void {
  const googleValue = PROVIDER_ENV_KEYS.google.map((key) => env[key]).find(Boolean);
  if (googleValue) {
    for (const key of PROVIDER_ENV_KEYS.google) {
      if (!env[key]) env[key] = googleValue;
    }
  }
}
