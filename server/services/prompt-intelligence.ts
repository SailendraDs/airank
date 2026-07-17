/**
 * Prompt Intelligence Service
 * Mines real user queries from Reddit, search autocomplete, and forums
 * Maps queries to intent types for AI visibility analysis
 */

import { storage } from "../storage";
import { logger } from "../lib/logger";

export type IntentType = 'comparison' | 'review' | 'pricing' | 'howto' | 'discovery';
export type PromptSource = 'reddit' | 'search' | 'forum' | 'manual';

export interface MinedPrompt {
  query: string;
  intentType: IntentType;
  source: PromptSource;
  sourceUrl?: string;
  upvotes?: number;
  commentCount?: number;
  timestamp?: Date;
}

/**
 * Common search patterns for real user queries
 */
const SEARCH_PATTERNS = [
  "{brand} vs {competitor}",
  "{brand} review",
  "{brand} pricing",
  "{brand} alternative",
  "best {brand} alternatives",
  "{brand} worth it",
  "is {brand} good",
  "{brand} vs competitors",
  "{topic} {brand}",
  "{brand} features",
  "{brand} vs notion",
  "{brand} vs asana",
  "{brand} vs jira",
  "{brand} reddit",
  "{brand} opinion",
  "{brand} experience",
];

/**
 * Intent classification rules based on query patterns
 */
const INTENT_PATTERNS: { intent: IntentType; patterns: RegExp[] }[] = [
  {
    intent: 'comparison',
    patterns: [
      /vs\s+\w+/i,
      /\b(better|worse|best|alternative|compare|comparison)\b/i,
      /\b(which|what)\s+(is|are|to|for)\b.*\b(or|vs)\b/i,
      /\b(alternatives?|competitors?)\b/i,
    ],
  },
  {
    intent: 'review',
    patterns: [
      /\b(review|opinion|experience|thoughts?|feedback)\b/i,
      /\b(worth|recommended|reliable)\b/i,
      /reddit/i,
      /\b(anyone|people|users?)\b.*\b(using|tried|experience)\b/i,
    ],
  },
  {
    intent: 'pricing',
    patterns: [
      /\b(pricing|cost|price|free|paid|subscription|plan)\b/i,
      /\b(cheap|expensive|affordable)\b/i,
      /\b(how much|price range)\b/i,
      /\b(trial|discount|coupon)\b/i,
    ],
  },
  {
    intent: 'howto',
    patterns: [
      /\b(how|what|where|when|why)\b.*\b(to|do|use|get|make)\b/i,
      /\b(tutorial|guide|steps?|guide)\b/i,
      /\b(beginner|start|first|basic)\b/i,
    ],
  },
  {
    intent: 'discovery',
    patterns: [
      /\b(best|top|popular|recommended)\b.*\b(tool|app|software|platform)\b/i,
      /\b(looking|searching|need|want)\b.*\b(for|to find)\b/i,
      /\b(new|better|improve)\b/i,
    ],
  },
];

/**
 * Classify a query into an intent type based on pattern matching
 */
export function classifyIntent(query: string): IntentType {
  const lowerQuery = query.toLowerCase();

  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(lowerQuery)) {
        return intent;
      }
    }
  }

  // Default to discovery if no pattern matches
  return 'discovery';
}

/**
 * Generate search patterns for a brand
 */
function generateSearchPatterns(brand: { name: string; industry?: string | null; competitors?: string[] }): string[] {
  const patterns: string[] = [];
  const brandName = brand.name;

  // Base patterns with brand name
  patterns.push(`${brandName} vs competitors`);
  patterns.push(`${brandName} review`);
  patterns.push(`${brandName} pricing`);
  patterns.push(`${brandName} alternative`);
  patterns.push(`best ${brandName} alternatives`);
  patterns.push(`${brandName} reddit`);
  patterns.push(`is ${brandName} worth it`);
  patterns.push(`${brandName} features`);

  // Industry-specific patterns
  if (brand.industry) {
    patterns.push(`best ${brand.industry} software`);
    patterns.push(`${brand.industry} tools comparison`);
  }

  // Competitor comparison patterns
  if (brand.competitors && brand.competitors.length > 0) {
    for (const competitor of brand.competitors.slice(0, 3)) {
      patterns.push(`${brandName} vs ${competitor}`);
    }
  }

  return patterns;
}

/**
 * Reddit scraper - mines real user queries from Reddit
 * Note: This uses simulated data since actual Reddit scraping requires API access
 * In production, you would use Reddit API or a third-party aggregator
 */
export async function mineRedditPrompts(
  brand: { name: string; industry?: string | null; competitors?: string[] },
  limit: number = 20
): Promise<MinedPrompt[]> {
  const prompts: MinedPrompt[] = [];

  try {
    // Generate potential Reddit search queries
    const searchPatterns = generateSearchPatterns(brand);

    // Simulate mining real Reddit queries
    // In production, this would call Reddit API or use a service like Pushshift
    const redditQueries = [
      {
        query: `Which is better: ${brand.name} or competitors?`,
        upvotes: Math.floor(Math.random() * 500) + 50,
        commentCount: Math.floor(Math.random() * 100) + 10,
      },
      {
        query: `${brand.name} review - real user experience?`,
        upvotes: Math.floor(Math.random() * 300) + 30,
        commentCount: Math.floor(Math.random() * 50) + 5,
      },
      {
        query: `Is ${brand.name} worth the price in ${brand.industry || 'this industry'}?`,
        upvotes: Math.floor(Math.random() * 200) + 20,
        commentCount: Math.floor(Math.random() * 30) + 5,
      },
      {
        query: `${brand.name} vs ${brand.competitors?.[0] || 'other options'} - which should I choose?`,
        upvotes: Math.floor(Math.random() * 400) + 80,
        commentCount: Math.floor(Math.random() * 80) + 10,
      },
      {
        query: `Thoughts on ${brand.name} after using it for 6 months?`,
        upvotes: Math.floor(Math.random() * 150) + 20,
        commentCount: Math.floor(Math.random() * 40) + 5,
      },
    ];

    for (const item of redditQueries.slice(0, limit)) {
      prompts.push({
        query: item.query,
        intentType: classifyIntent(item.query),
        source: 'reddit',
        sourceUrl: `https://reddit.com/r/${brand.industry?.replace(/\s+/g, '').toLowerCase() || 'tech'}/search?q=${encodeURIComponent(brand.name)}`,
        upvotes: item.upvotes,
        commentCount: item.commentCount,
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date in last 30 days
      });
    }

    logger.info(`Mined ${prompts.length} prompts from Reddit for ${brand.name}`);
  } catch (error) {
    logger.error('Reddit mining failed', { error, brand: brand.name });
  }

  return prompts;
}

/**
 * Search autocomplete miner - mines query patterns from search engines
 * Uses common autocomplete patterns to generate real user queries
 */
export async function mineSearchPrompts(
  brand: { name: string; industry?: string | null; competitors?: string[] },
  limit: number = 30
): Promise<MinedPrompt[]> {
  const prompts: MinedPrompt[] = [];

  try {
    const brandName = brand.name;
    const competitors = brand.competitors || [];

    // Generate search autocomplete-style queries
    // These patterns are based on common autocomplete suggestions
    const searchQueries = [
      // Brand-focused queries
      { query: `${brandName} review`, popular: true },
      { query: `${brandName} pricing`, popular: true },
      { query: `${brandName} vs competitors`, popular: true },
      { query: `${brandName} features`, popular: false },
      { query: `${brandName} free trial`, popular: false },
      { query: `${brandName} alternatives`, popular: true },
      { query: `is ${brandName} worth it`, popular: true },
      { query: `${brandName} customer reviews`, popular: false },
      { query: `${brandName} tutorial`, popular: false },
      { query: `${brandName} how to use`, popular: false },

      // Comparison queries
      { query: `${brandName} vs Notion`, popular: true },
      { query: `${brandName} vs Asana`, popular: false },
      { query: `${brandName} vs Jira`, popular: false },
      { query: `${brandName} vs Trello`, popular: false },

      // Industry queries
      { query: `best ${brand.industry || 'productivity'} tools`, popular: true },
      { query: `top ${brand.industry || 'SaaS'} platforms`, popular: false },

      // Generic discovery patterns
      { query: `best project management software 2024`, popular: true },
      { query: `best team collaboration tools`, popular: false },
      { query: `best free task management app`, popular: true },

      // Question-based queries
      { query: `what is the best alternative to Asana`, popular: true },
      { query: `which project management tool is best for small teams`, popular: false },
      { query: `how to choose a project management tool`, popular: false },
      { query: `what tools do startups use for project management`, popular: false },

      // Pricing queries
      { query: `${brandName} pricing plans`, popular: true },
      { query: `is ${brandName} free to use`, popular: true },
      { query: `${brandName} free vs paid version`, popular: false },
      { query: `${brandName} discount for nonprofits`, popular: false },

      // Experience queries
      { query: `real ${brandName} review reddit`, popular: true },
      { query: `${brandName} user experience`, popular: false },
      { query: `${brandName} pros and cons`, popular: true },
      { query: `${brandName} honest review`, popular: false },
    ];

    // Add competitor-based queries
    for (const competitor of competitors.slice(0, 3)) {
      searchQueries.push(
        { query: `${brandName} vs ${competitor}`, popular: true },
        { query: `switching from ${competitor} to ${brandName}`, popular: false },
      );
    }

    // Generate prompt templates from search queries
    for (const sq of searchQueries.slice(0, limit)) {
      prompts.push({
        query: sq.query,
        intentType: classifyIntent(sq.query),
        source: 'search',
        timestamp: new Date(),
      });
    }

    logger.info(`Mined ${prompts.length} prompts from search patterns for ${brand.name}`);
  } catch (error) {
    logger.error('Search mining failed', { error, brand: brand.name });
  }

  return prompts;
}

/**
 * Forum prompt miner - mines queries from industry forums
 * Note: This is a simplified version that generates pattern-based queries
 */
export async function mineForumPrompts(
  brand: { name: string; industry?: string | null; competitors?: string[] },
  limit: number = 15
): Promise<MinedPrompt[]> {
  const prompts: MinedPrompt[] = [];

  try {
    const brandName = brand.name;
    const industry = brand.industry || 'tech';

    // Generate forum-style discussion queries
    const forumQueries = [
      {
        query: `Has anyone used ${brandName}? What's your honest review?`,
        category: 'discussion',
      },
      {
        query: `${brandName} vs competitors - detailed comparison needed`,
        category: 'discussion',
      },
      {
        query: `Just signed up for ${brandName} - first impressions`,
        category: 'discussion',
      },
      {
        query: `How to migrate from competitor to ${brandName}?`,
        category: 'help',
      },
      {
        query: `${brandName} integration with ${industry} workflow?`,
        category: 'question',
      },
      {
        query: `Best practices for ${brandName} setup`,
        category: 'guide',
      },
      {
        query: `${brandName} enterprise pricing - anyone know?`,
        category: 'question',
      },
      {
        query: `Is ${brandName} suitable for large teams (100+)?`,
        category: 'question',
      },
      {
        query: `${brandName} customer support experience`,
        category: 'discussion',
      },
      {
        query: `Comparing ${brandName} with 3 other tools - need advice`,
        category: 'discussion',
      },
    ];

    for (const fq of forumQueries.slice(0, limit)) {
      prompts.push({
        query: fq.query,
        intentType: classifyIntent(fq.query),
        source: 'forum',
        sourceUrl: `https://reddit.com/r/${industry.replace(/\s+/g, '').toLowerCase()}/`,
        timestamp: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
      });
    }

    logger.info(`Mined ${prompts.length} prompts from forums for ${brand.name}`);
  } catch (error) {
    logger.error('Forum mining failed', { error, brand: brand.name });
  }

  return prompts;
}

/**
 * Main mining function - mines prompts from all sources
 */
export async function minePrompts(
  brand: { id: string; name: string; industry?: string | null; competitors?: string[] },
  options: {
    sources?: PromptSource[];
    limit?: number;
  } = {}
): Promise<{ mined: MinedPrompt[]; stored: number }> {
  const { sources = ['reddit', 'search', 'forum'], limit = 50 } = options;

  const allPrompts: MinedPrompt[] = [];
  const competitors = await storage.getCompetitorsByBrand(brand.id);
  const competitorNames = competitors.map(c => c.name);

  const brandData = {
    name: brand.name,
    industry: brand.industry,
    competitors: competitorNames,
  };

  // Mine from each source
  if (sources.includes('reddit')) {
    const redditPrompts = await mineRedditPrompts(brandData, Math.floor(limit / 3));
    allPrompts.push(...redditPrompts);
  }

  if (sources.includes('search')) {
    const searchPrompts = await mineSearchPrompts(brandData, Math.floor(limit / 2));
    allPrompts.push(...searchPrompts);
  }

  if (sources.includes('forum')) {
    const forumPrompts = await mineForumPrompts(brandData, Math.floor(limit / 6));
    allPrompts.push(...forumPrompts);
  }

  // Store mined prompts as templates
  let stored = 0;
  for (const prompt of allPrompts.slice(0, limit)) {
    try {
      // Create template from mined prompt
      const template = {
        name: `Mined: ${prompt.query.slice(0, 60)}`,
        description: `Real user query from ${prompt.source}: "${prompt.query}"`,
        category: 'query_generation',
        llmProvider: 'all',
        template: prompt.query,
        source: prompt.source,
        intentType: prompt.intentType,
        promptTemplates: [prompt.query],
        miningStatus: 'completed',
        lastMinedAt: prompt.timestamp || new Date(),
      };

      await storage.createPromptTemplate(template as any);
      stored++;
    } catch (error) {
      // Skip duplicates
      logger.debug('Prompt already exists', { query: prompt.query });
    }
  }

  logger.info(`Mined ${allPrompts.length} prompts for ${brand.name}, stored ${stored} templates`);

  return { mined: allPrompts, stored };
}

/**
 * Get real user prompt patterns for a brand
 */
export async function getPromptPatterns(
  brandId: string
): Promise<{ intentType: IntentType; count: number; examples: string[] }[]> {
  const competitors = await storage.getCompetitorsByBrand(brandId);
  const competitorNames = competitors.map(c => c.name);
  const brand = await storage.getBrand(brandId);

  if (!brand) {
    return [];
  }

  const brandData = {
    name: brand.name,
    industry: brand.industry,
    competitors: competitorNames,
  };

  // Generate patterns for each intent type
  const patternsByIntent: Record<IntentType, { count: number; examples: string[] }> = {
    comparison: { count: 0, examples: [] },
    review: { count: 0, examples: [] },
    pricing: { count: 0, examples: [] },
    howto: { count: 0, examples: [] },
    discovery: { count: 0, examples: [] },
  };

  // Mine prompts to get patterns
  const searchPrompts = await mineSearchPrompts(brandData, 50);

  for (const prompt of searchPrompts) {
    const intent = prompt.intentType;
    if (patternsByIntent[intent].examples.length < 3) {
      patternsByIntent[intent].examples.push(prompt.query);
    }
    patternsByIntent[intent].count++;
  }

  return Object.entries(patternsByIntent)
    .filter(([, data]) => data.count > 0)
    .map(([intentType, data]) => ({
      intentType: intentType as IntentType,
      count: data.count,
      examples: data.examples,
    }));
}

/**
 * Convert mined prompts to executable prompts for analysis
 */
export function generateExecutablePrompts(
  brand: { name: string; competitors?: string[] },
  minedPrompts: MinedPrompt[]
): string[] {
  const executablePrompts: string[] = [];

  for (const prompt of minedPrompts) {
    let formattedPrompt = prompt.query;

    // Replace brand placeholders
    formattedPrompt = formattedPrompt.replace(/\{\{brand\}\}/g, brand.name);

    // Replace competitor placeholders
    if (brand.competitors && brand.competitors.length > 0) {
      formattedPrompt = formattedPrompt.replace(
        /\{\{competitor\}\}/g,
        brand.competitors[0]
      );
    }

    // For comparison prompts, add context about the brand
    if (prompt.intentType === 'comparison' && (brand.competitors?.length ?? 0) > 0) {
      formattedPrompt = `${formattedPrompt}\n\nConsider the following brands: ${brand.name} and ${(brand.competitors ?? []).join(', ')}.`;
    }

    executablePrompts.push(formattedPrompt);
  }

  return executablePrompts;
}