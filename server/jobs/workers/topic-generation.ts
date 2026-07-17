// Topic Generation Worker - Generates relevant topics for brand visibility tracking

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { getIntegrations } from '../../integrations';
import { resolvePromptTemplateByName } from '../../services/prompt-template-runtime';

export interface TopicGenerationPayload {
  brandId: string;
  count?: number;
}

export async function topicGenerationWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as TopicGenerationPayload;
  const { brandId, count = 10 } = payload;

  console.log(`[TopicGeneration] Starting topic generation for brand ${brandId}`);

  // Get brand context
  const context = await storage.getBrandContext(brandId);
  if (!context) {
    throw new Error(`Brand context not found for ${brandId}`);
  }

  const brandName = (context.brandIdentity as any)?.officialName || '';
  const description = (context.brandIdentity as any)?.description || '';
  const industry = (context.industryContext as any)?.types?.join(', ') || '';

  // Get LLM integration
  const integrations = getIntegrations();
  if (!integrations.llm) {
    throw new Error('LLM integration not configured');
  }

  // Generate topics using LLM
  const fallbackUserPrompt = `Generate {{count}} relevant topic clusters for measuring whether AI assistants understand, recommend, compare, and cite "{{brand_name}}".

Brand Description: {{description}}
Industry: {{industry}}

Generate topics that:
1. Represent durable buyer/research intents, not one-off keywords
2. Include unbranded category discovery, competitor alternatives, use-case fit, implementation questions, proof/trust, pricing/value, and decision criteria
3. Are specific to the brand description and industry
4. Help identify citation gaps, entity clarity gaps, and topical authority gaps
5. Are concise phrases suitable for grouping prompts

Return ONLY a JSON array of topics, each with: topic, category, and searchIntent.
Example: [{"topic": "best CRM software for small business", "category": "product_comparison", "searchIntent": "commercial"}]`;

  const prompt = await resolvePromptTemplateByName(
    'Topic Generation Worker (User)',
    fallbackUserPrompt,
    {
      count,
      brand_name: brandName,
      description,
      industry,
    },
  );

  const fallbackSystemPrompt = 'You are an enterprise AI visibility strategist. Generate buyer-intent topic clusters for LLM visibility measurement. Return only valid JSON.';
  const systemPrompt = await resolvePromptTemplateByName(
    'Topic Generation Worker (System)',
    fallbackSystemPrompt,
  );

  try {
    const response = await integrations.llm.chat('openai', [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ], {
      temperature: 0.8,
      maxTokens: 1000,
    });

    // Parse response
    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse topics from LLM response');
    }

    const topics = JSON.parse(jsonMatch[0]);
    const createdTopics: any[] = [];

    // Store topics
    for (const topicData of topics) {
      const topic = await storage.createTopic({
        brandId,
        name: topicData.topic || topicData.name || '',
        category: topicData.category || 'general',
      });
      createdTopics.push(topic);
    }

    console.log(`[TopicGeneration] Generated ${createdTopics.length} topics for brand ${brandId}`);

    return {
      brandId,
      topicsGenerated: createdTopics.length,
      topics: createdTopics,
      cost: response.cost,
    };

  } catch (error: any) {
    console.error(`[TopicGeneration] Error:`, error.message);
    throw error;
  }
}
