// Query Generation Worker - Generates search queries from topics

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { getIntegrations } from '../../integrations';
import { resolvePromptTemplateByName } from '../../services/prompt-template-runtime';

export interface QueryGenerationPayload {
  brandId: string;
  topicId?: string;
  queriesPerTopic?: number;
}

export async function queryGenerationWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as QueryGenerationPayload;
  const { brandId, topicId, queriesPerTopic = 5 } = payload;

  console.log(`[QueryGeneration] Starting query generation for brand ${brandId}`);

  // Get topics
  let topics;
  if (topicId) {
    const topic = await storage.getTopicsByBrand(brandId);
    topics = topic.filter(t => t.id === topicId);
  } else {
    topics = await storage.getTopicsByBrand(brandId);
  }

  if (topics.length === 0) {
    throw new Error('No topics found for query generation');
  }

  // Get brand
  const brand = await storage.getBrand(brandId);

  // Get brand context
  const context = await storage.getBrandContext(brandId);
  const brandName = (context?.brandIdentity as any)?.officialName || brand?.name || '';

  // Get LLM integration
  const integrations = getIntegrations();
  if (!integrations.llm) {
    throw new Error('LLM integration not configured');
  }

  const createdPrompts: any[] = [];
  let totalCost = 0;

  const fallbackSystemPrompt = 'You are an enterprise AI visibility strategist. Generate realistic LLM prompts that measure recommendation, comparison, citation, and entity understanding. Return only valid JSON array of strings.';
  const systemPrompt = await resolvePromptTemplateByName(
    'Query Generation Worker (System)',
    fallbackSystemPrompt,
  );

  // Generate queries for each topic
  for (const topic of topics.slice(0, 10)) { // Limit to 10 topics per job
    try {
      const fallbackUserPrompt = `Generate {{queries_per_topic}} specific LLM prompts related to: "{{topic_name}}"

These queries should:
1. Be natural questions or commands people would ask AI assistants
2. Reveal whether "{{brand_name}}" is recommended, cited, compared, or correctly understood
3. Include unbranded discovery, branded evaluation, alternatives/comparison, use-case, proof/trust, and decision-risk angles across the set
4. Avoid generic SEO keyword phrasing
5. Stay under 180 characters each

Return ONLY a JSON array of query strings.
Example: ["how does X compare to Y?", "best X for Z", "X vs Y review"]`;

      const prompt = await resolvePromptTemplateByName(
        'Query Generation Worker (User)',
        fallbackUserPrompt,
        {
          queries_per_topic: queriesPerTopic,
          topic_name: topic.name,
          brand_name: brandName,
        },
      );

      const response = await integrations.llm.chat('openai', [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ], {
        temperature: 0.9,
        maxTokens: 500,
      });

      // Parse response
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn(`[QueryGeneration] Failed to parse queries for topic ${topic.id}`);
        continue;
      }

      const queries = JSON.parse(jsonMatch[0]);

      // Store prompts
      for (const queryText of queries) {
        const promptRecord = await storage.createPrompt({
          brandId,
          topicId: topic.id,
          text: queryText,
          category: topic.category,
          status: 'active',
        });
        createdPrompts.push(promptRecord);
      }

      totalCost += response.cost;

    } catch (error: any) {
      console.error(`[QueryGeneration] Error for topic ${topic.id}:`, error.message);
      // Continue with other topics
    }
  }

  console.log(`[QueryGeneration] Generated ${createdPrompts.length} queries for brand ${brandId}`);

  return {
    brandId,
    queriesGenerated: createdPrompts.length,
    topicsProcessed: topics.length,
    totalCost,
  };
}
