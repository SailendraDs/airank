import { storage } from '../storage';
import { resolvePromptTemplateByName } from './prompt-template-runtime';

export async function matchPromptsToTopics(brandId: string): Promise<{
  matched: number;
  total: number;
  matches: Array<{ promptId: string; promptText: string; topicId: string; topicName: string }>;
}> {
  const [prompts, topics] = await Promise.all([
    storage.getPromptsByBrand(brandId),
    storage.getTopicsByBrand(brandId),
  ]);

  const unmatchedPrompts = prompts.filter(p => !p.topicId);

  if (unmatchedPrompts.length === 0 || topics.length === 0) {
    return { matched: 0, total: unmatchedPrompts.length, matches: [] };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required for prompt-topic matching');
  }

  const topicList = topics.map(t => ({ id: t.id, name: t.name, category: t.category }));
  const promptList = unmatchedPrompts.map(p => ({ id: p.id, text: p.text }));

  const batchSize = 20;
  const allMatches: Array<{ promptId: string; promptText: string; topicId: string; topicName: string }> = [];

  for (let i = 0; i < promptList.length; i += batchSize) {
    const batch = promptList.slice(i, i + batchSize);

    const topicsBlock = topicList
      .map(t => `- ID: "${t.id}" | Name: "${t.name}" | Category: "${t.category || 'general'}"`)
      .join('\n');

    const promptsBlock = batch
      .map(p => `- ID: "${p.id}" | Text: "${p.text}"`)
      .join('\n');

    const fallbackSystemPrompt = `You are a semantic matching engine. Given a list of topics and prompts, match each prompt to the most relevant topic based on meaning and intent.

Topics:
{{topics_block}}

For each prompt, return a JSON array of objects with format:
[{"promptId": "...", "topicId": "..."}]

If a prompt doesn't clearly match any topic, assign it to the most closely related one. Every prompt must be matched to exactly one topic.
Return ONLY the JSON array, no explanation.`;

    const systemPrompt = await resolvePromptTemplateByName(
      'Prompt Topic Matcher (System)',
      fallbackSystemPrompt,
      { topics_block: topicsBlock },
    );

    const fallbackUserPrompt = `Match these prompts to the topics above:\n{{prompts_block}}`;
    const userPrompt = await resolvePromptTemplateByName(
      'Prompt Topic Matcher (User)',
      fallbackUserPrompt,
      { prompts_block: promptsBlock },
    );

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://airank.com',
          'X-Title': 'AIRank',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[PromptTopicMatcher] OpenRouter error:', error);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('[PromptTopicMatcher] Failed to parse response:', content);
        continue;
      }

      const mappings: Array<{ promptId: string; topicId: string }> = JSON.parse(jsonMatch[0]);

      const topicMap = new Map(topics.map(t => [t.id, t.name]));
      const promptMap = new Map(unmatchedPrompts.map(p => [p.id, p.text]));

      for (const mapping of mappings) {
        if (topicMap.has(mapping.topicId) && promptMap.has(mapping.promptId)) {
          await storage.updatePrompt(mapping.promptId, { topicId: mapping.topicId });
          allMatches.push({
            promptId: mapping.promptId,
            promptText: promptMap.get(mapping.promptId) || '',
            topicId: mapping.topicId,
            topicName: topicMap.get(mapping.topicId) || '',
          });
        }
      }
    } catch (error: any) {
      console.error('[PromptTopicMatcher] Error processing batch:', error.message);
    }
  }

  for (const topic of topics) {
    const matchedCount = allMatches.filter(m => m.topicId === topic.id).length;
    if (matchedCount > 0) {
      const currentPrompts = prompts.filter(p => p.topicId === topic.id).length;
      await storage.updateTopic(topic.id, { promptCount: currentPrompts + matchedCount });
    }
  }

  return {
    matched: allMatches.length,
    total: unmatchedPrompts.length,
    matches: allMatches,
  };
}
