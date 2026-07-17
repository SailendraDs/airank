// Hallucination / accuracy-correction workflow (Epic H).
// Fact-checks recent AI-engine answers about a brand against the brand's known
// facts using the LLM, and records inaccurate claims for human review + correction.

import { storage } from '../storage';
import { getIntegrations } from '../integrations';
import { logger } from '../lib/logger';

type LLMProviderName = 'openai' | 'anthropic' | 'google' | 'perplexity' | 'grok' | 'deepseek' | 'openrouter';

function pickProvider(): LLMProviderName {
  const llm = getIntegrations().llm;
  const available = (llm?.getAvailableProviders?.() || []) as LLMProviderName[];
  const preferred: LLMProviderName[] = ['openai', 'anthropic', 'google', 'openrouter', 'perplexity', 'grok', 'deepseek'];
  for (const p of preferred) if (available.includes(p)) return p;
  if (available.length) return available[0];
  throw new Error('No LLM provider configured for hallucination detection');
}

function buildKnownFacts(brand: any): string {
  const facts: string[] = [];
  if (brand.name) facts.push(`Name: ${brand.name}`);
  if (brand.domain) facts.push(`Website: ${brand.domain}`);
  if (brand.industry) facts.push(`Industry: ${brand.industry}`);
  if (brand.description) facts.push(`Description: ${brand.description}`);
  if (brand.city || brand.state || brand.country) facts.push(`Location: ${[brand.city, brand.state, brand.country].filter(Boolean).join(', ')}`);
  if (Array.isArray(brand.coreTopics) && brand.coreTopics.length) facts.push(`Core topics: ${brand.coreTopics.join(', ')}`);
  const dev = brand.brandDevData || {};
  if (dev?.foundedYear) facts.push(`Founded: ${dev.foundedYear}`);
  return facts.join('\n');
}

export interface DetectionSummary {
  brandId: string;
  answersChecked: number;
  inaccurateFound: number;
}

/** Fact-check recent LLM answers and persist any inaccurate claims. */
export async function detectHallucinations(brandId: string, answerLimit = 15): Promise<DetectionSummary> {
  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const llm = getIntegrations().llm;
  if (!llm) throw new Error('No LLM provider configured');
  const provider = pickProvider();

  const knownFacts = buildKnownFacts(brand);
  const answers = await storage.getLlmAnswersByBrand(brandId, answerLimit);

  let inaccurateFound = 0;
  let answersChecked = 0;

  for (const answer of answers) {
    const text = (answer.rawResponse || '').slice(0, 6000);
    if (!text) continue;
    answersChecked++;
    try {
      const system = 'You are a meticulous fact-checker. Given KNOWN FACTS about a brand and an AI-generated ANSWER, identify statements in the ANSWER about the brand that are factually incorrect or unsupported. Return ONLY raw JSON: {"claims":[{"claim":"...","correctValue":"...","explanation":"...","severity":"low|medium|high"}]}. If nothing is wrong, return {"claims":[]}.';
      const user = `KNOWN FACTS:\n${knownFacts}\n\nANSWER (from ${answer.llmProvider}/${answer.llmModel}):\n${text}`;
      const res = await llm.chat(provider, [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ], { temperature: 0, maxTokens: 1200 } as any);
      const raw = ((res as any)?.content || (res as any)?.text || '').replace(/^```(json)?/i, '').replace(/```$/, '').trim();
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { parsed = { claims: [] }; }

      for (const c of (parsed.claims || [])) {
        if (!c?.claim) continue;
        await storage.createFactClaim({
          brandId,
          claim: String(c.claim).slice(0, 1000),
          llmAnswerId: answer.id,
          engine: `${answer.llmProvider}/${answer.llmModel}`,
          accuracy: 'inaccurate',
          severity: ['low', 'medium', 'high'].includes(c.severity) ? c.severity : 'medium',
          correctValue: c.correctValue ? String(c.correctValue).slice(0, 1000) : null,
          explanation: c.explanation ? String(c.explanation).slice(0, 1000) : null,
          status: 'open',
        } as any);
        inaccurateFound++;
      }
    } catch (err: any) {
      logger.warn?.(`[Hallucination] check failed for answer ${answer.id}: ${err?.message || err}`);
    }
  }

  logger.info(`[Hallucination] brand=${brandId} checked=${answersChecked} inaccurate=${inaccurateFound}`);
  return { brandId, answersChecked, inaccurateFound };
}
