// Model Router - Routes LLM tasks to appropriate models based on complexity
// Goal: 65% LLM cost reduction by routing simple tasks to cheaper models

import { storage } from '../storage';
import { OpenRouterProvider } from '../integrations/llm/openrouter';

export type TaskComplexity = 'simple' | 'medium' | 'complex';

interface ModelConfig {
  model: string;
  maxTokens: number;
  temperature: number;
}

// Task classification by type
const SIMPLE_TASKS = [
  'sentiment',
  'classification',
  'tagging',
  'deduplication',
  'normalize',
  'count',
  'extract_keywords',
  'simple_match',
];

const MEDIUM_TASKS = [
  'summarize',
  'extract',
  'categorize',
  'compare',
  'translate',
  'paraphrase',
  'rewrite',
  'expand',
];

const COMPLEX_TASKS = [
  'analyze',
  'reason',
  'strategize',
  'generate_content',
  'creative',
  'complex_comparison',
  ' nuanced_understanding',
  'multi_step',
];

// Default model configurations per complexity
const DEFAULT_MODEL_CONFIGS: Record<TaskComplexity, ModelConfig> = {
  simple: {
    model: 'qwen/qwen-2.5-7b-instruct', // ~$0.05/1M tokens input
    maxTokens: 500,
    temperature: 0.3,
  },
  medium: {
    model: 'qwen/qwen-2.5-32b-instruct', // ~$0.10/1M tokens input
    maxTokens: 1500,
    temperature: 0.5,
  },
  complex: {
    model: 'openai/gpt-4o', // Most capable, higher cost
    maxTokens: 4000,
    temperature: 0.7,
  },
};

// Cache for model config from database
let cachedModelConfig: Record<TaskComplexity, ModelConfig> | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 60 * 1000; // 1 minute

async function getModelConfigs(): Promise<Record<TaskComplexity, ModelConfig>> {
  const now = Date.now();

  // Return cached if fresh
  if (cachedModelConfig && (now - configCacheTime) < CONFIG_CACHE_TTL) {
    return cachedModelConfig;
  }

  // Fetch from database or env
  try {
    const [simpleModel, mediumModel, complexModel] = await Promise.all([
      storage.getSystemSetting('openrouter_model_simple'),
      storage.getSystemSetting('openrouter_model_medium'),
      storage.getSystemSetting('openrouter_model_complex'),
    ]);

    cachedModelConfig = {
      simple: {
        model: simpleModel || DEFAULT_MODEL_CONFIGS.simple.model,
        maxTokens: DEFAULT_MODEL_CONFIGS.simple.maxTokens,
        temperature: DEFAULT_MODEL_CONFIGS.simple.temperature,
      },
      medium: {
        model: mediumModel || DEFAULT_MODEL_CONFIGS.medium.model,
        maxTokens: DEFAULT_MODEL_CONFIGS.medium.maxTokens,
        temperature: DEFAULT_MODEL_CONFIGS.medium.temperature,
      },
      complex: {
        model: complexModel || DEFAULT_MODEL_CONFIGS.complex.model,
        maxTokens: DEFAULT_MODEL_CONFIGS.complex.maxTokens,
        temperature: DEFAULT_MODEL_CONFIGS.complex.temperature,
      },
    };
    configCacheTime = now;
  } catch {
    // Fallback to defaults if DB read fails
    cachedModelConfig = DEFAULT_MODEL_CONFIGS;
  }

  return cachedModelConfig!;
}

// Invalidate cache when admin updates config
export function invalidateModelRouterCache(): void {
  cachedModelConfig = null;
  configCacheTime = 0;
}

export class ModelRouter {
  private openRouter: OpenRouterProvider | null = null;
  private useOpenRouter: boolean = false;

  constructor(openRouterApiKey?: string) {
    if (openRouterApiKey) {
      this.openRouter = new OpenRouterProvider(openRouterApiKey);
      this.useOpenRouter = true;
    }
  }

  /**
   * Classify task complexity based on task type string
   */
  classify(taskType: string): TaskComplexity {
    const task = taskType.toLowerCase();

    if (SIMPLE_TASKS.some(t => task.includes(t))) {
      return 'simple';
    }

    if (COMPLEX_TASKS.some(t => task.includes(t))) {
      return 'complex';
    }

    // Default to medium for anything not explicitly simple or complex
    return 'medium';
  }

  /**
   * Get the best model for a given task complexity
   */
  getModelForComplexity(complexity: TaskComplexity): string {
    return DEFAULT_MODEL_CONFIGS[complexity].model;
  }

  /**
   * Classify based on prompt length (rough heuristic)
   */
  classifyByPromptLength(prompt: string): TaskComplexity {
    const wordCount = prompt.split(/\s+/).length;

    if (wordCount < 20) return 'simple';
    if (wordCount < 100) return 'medium';
    return 'complex';
  }

  /**
   * Combined classification: uses both task type and prompt analysis
   */
  classifyTask(taskType: string, prompt: string): TaskComplexity {
    const typeComplexity = this.classify(taskType);
    const lengthComplexity = this.classifyByPromptLength(prompt);

    // Return the higher complexity of the two
    const complexityOrder: TaskComplexity[] = ['simple', 'medium', 'complex'];
    const typeIdx = complexityOrder.indexOf(typeComplexity);
    const lengthIdx = complexityOrder.indexOf(lengthComplexity);

    return complexityOrder[Math.max(typeIdx, lengthIdx)];
  }

  /**
   * Route a task and get model configuration
   */
  async route(taskType: string, prompt?: string): Promise<ModelConfig> {
    const complexity = prompt
      ? this.classifyTask(taskType, prompt)
      : this.classify(taskType);

    const configs = await getModelConfigs();
    return configs[complexity];
  }

  /**
   * Execute a simple task with automatic routing
   */
  async executeTask(
    taskType: string,
    prompt: string,
    customOptions?: Partial<ModelConfig>
  ): Promise<string> {
    const config = await this.route(taskType, prompt);

    if (!this.useOpenRouter || !this.openRouter) {
      throw new Error('OpenRouter not configured - set OPENROUTER_API_KEY');
    }

    const result = await this.openRouter.chat(
      [{ role: 'user', content: prompt }],
      {
        model: customOptions?.model || config.model,
        maxTokens: customOptions?.maxTokens || config.maxTokens,
        temperature: customOptions?.temperature || config.temperature,
      }
    );

    return result.content;
  }

  /**
   * Get cost estimate for a task before execution
   */
  async estimateCost(taskType: string, prompt: string, estimatedResponseTokens = 500): Promise<{ complexity: TaskComplexity; estimatedCost: number }> {
    const complexity = this.classifyTask(taskType, prompt);
    const configs = await getModelConfigs();
    const config = configs[complexity];

    // Rough token estimate: ~4 chars per token
    const promptTokens = Math.ceil(prompt.length / 4);
    const totalTokens = promptTokens + estimatedResponseTokens;

    // Cost per million tokens (from OpenRouter pricing)
    const costPerMillion: Record<string, number> = {
      'qwen/qwen-2.5-7b-instruct': 0.10,     // input + output combined
      'qwen/qwen-2.5-32b-instruct': 0.30,
      'openai/gpt-4o': 20.00,
    };

    const costPerToken = (costPerMillion[config.model] || 1.00) / 1_000_000;
    const estimatedCost = totalTokens * costPerToken;

    return { complexity, estimatedCost };
  }

  /**
   * Get summary of available models and their use cases
   */
  async getModelSummary(): Promise<Record<TaskComplexity, { model: string; useCase: string; costEstimate: string }>> {
    const configs = await getModelConfigs();
    return {
      simple: {
        model: configs.simple.model,
        useCase: 'Tagging, classification, sentiment, keyword extraction',
        costEstimate: '~$0.00005/task',
      },
      medium: {
        model: configs.medium.model,
        useCase: 'Summarization, translation, content rewriting',
        costEstimate: '~$0.0003/task',
      },
      complex: {
        model: configs.complex.model,
        useCase: 'Deep analysis, strategy, creative generation',
        costEstimate: '~$0.01/task',
      },
    };
  }
}

// Singleton instance
let routerInstance: ModelRouter | null = null;

export function getModelRouter(): ModelRouter {
  if (!routerInstance) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    routerInstance = new ModelRouter(apiKey);
  }
  return routerInstance;
}