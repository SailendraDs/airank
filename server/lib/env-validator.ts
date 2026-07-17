import { logger } from './logger';

interface EnvConfig {
  required: string[];
  optional: string[];
  production: string[];
}

const envConfig: EnvConfig = {
  required: [
    'DATABASE_URL',
  ],
  
  optional: [
    'SESSION_SECRET',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_AI_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
  ],
  
  production: [
    'SESSION_SECRET',
  ],
};

export function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const varName of envConfig.required) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  if (isProduction) {
    for (const varName of envConfig.production) {
      if (!process.env[varName]) {
        errors.push(`Missing required production environment variable: ${varName}`);
      }
    }

    if (process.env.SESSION_SECRET === 'your-random-secret-key-here') {
      errors.push('SESSION_SECRET must be changed from default value in production');
    }

    const allowsLocalDatabaseUrl = process.env.ALLOW_LOCAL_DATABASE_URL === 'true';
    if (
      !allowsLocalDatabaseUrl &&
      (process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1'))
    ) {
      errors.push('DATABASE_URL must not point to localhost in production');
    }
  }

  for (const varName of envConfig.optional) {
    if (!process.env[varName]) {
      warnings.push(`Optional environment variable not set: ${varName}`);
    }
  }

  const llmProviders = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_AI_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'PERPLEXITY_API_KEY',
    'GROK_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENROUTER_API_KEY',
  ];

  const hasLLMProvider = llmProviders.some(provider => process.env[provider]);
  if (!hasLLMProvider) {
    warnings.push('No LLM provider API keys configured. At least one is recommended for core functionality.');
  }

  if (errors.length > 0) {
    logger.error('Environment validation failed', { errors });
    console.error('\n❌ ENVIRONMENT VALIDATION FAILED:\n');
    errors.forEach(error => console.error(`  - ${error}`));
    console.error('\nPlease fix these errors before starting the application.\n');
    
    if (isProduction) {
      process.exit(1);
    } else {
      console.warn('\n⚠️  Running in development mode with missing variables. Some features may not work.\n');
    }
  }

  if (warnings.length > 0) {
    logger.warn('Environment validation warnings', { warnings });
    if (!isProduction) {
      console.warn('\n⚠️  ENVIRONMENT WARNINGS:\n');
      warnings.forEach(warning => console.warn(`  - ${warning}`));
      console.warn('');
    }
  }

  if (errors.length === 0) {
    logger.info('Environment validation passed', {
      environment: process.env.NODE_ENV,
      hasLLMProvider,
    });
  }
}

if (process.env.NODE_ENV === 'production') {
  validateEnvironment();
}
