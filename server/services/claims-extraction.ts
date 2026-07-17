/**
 * Claims Extraction Service
 * 
 * Extracts claims from LLM responses and links them to evidence sources
 * to build a knowledge graph of brand-related claims.
 */

import { getIntegrations } from '../integrations';
import type { LLMMessage } from '../integrations/llm/base';
import { resolvePromptTemplateByName } from './prompt-template-runtime';

export interface Claim {
  text: string;
  type: 'factual' | 'opinion' | 'comparison' | 'recommendation';
  subject: string; // What the claim is about
  predicate: string; // What is being claimed
  confidence: number; // 0-1
  sentiment: 'positive' | 'neutral' | 'negative';
  evidence: Evidence[];
}

export interface Evidence {
  type: 'citation' | 'mention' | 'context';
  source: string; // URL or source identifier
  snippet: string; // Relevant text
  relevance: number; // 0-1
}

export interface ClaimGraph {
  claims: Claim[];
  relationships: ClaimRelationship[];
  entities: Entity[];
}

export interface ClaimRelationship {
  from: string; // Claim text
  to: string; // Related claim text
  type: 'supports' | 'contradicts' | 'elaborates' | 'compares';
  strength: number; // 0-1
}

export interface Entity {
  name: string;
  type: 'brand' | 'product' | 'feature' | 'competitor' | 'person' | 'organization';
  mentions: number;
  sentiment: 'positive' | 'neutral' | 'negative';
}

/**
 * Extract claims from LLM response using AI
 */
export async function extractClaims(
  responseText: string,
  brandName: string,
  citations: any[] = []
): Promise<Claim[]> {
  const integrations = getIntegrations();
  if (!integrations.llm) {
    throw new Error('LLM integration not configured');
  }

  const fallbackUserPrompt = `Analyze the following text and extract all factual claims, opinions, comparisons, and recommendations related to "{{brand_name}}".

For each claim, identify:
1. The claim text (exact quote if possible)
2. Type: factual, opinion, comparison, or recommendation
3. Subject: what the claim is about
4. Predicate: what is being claimed
5. Sentiment: positive, neutral, or negative

Text to analyze:
"""
{{response_text}}
"""

Return ONLY a JSON array of claims with this structure:
[{
  "text": "exact claim text",
  "type": "factual|opinion|comparison|recommendation",
  "subject": "what it's about",
  "predicate": "what is claimed",
  "sentiment": "positive|neutral|negative",
  "confidence": 0.0-1.0
}]`;

  const prompt = await resolvePromptTemplateByName(
    'Claims Extraction (User)',
    fallbackUserPrompt,
    {
      brand_name: brandName,
      response_text: responseText,
    },
  );

  try {
    const response = await integrations.llm.chat('openai', [
      { role: 'system', content: await resolvePromptTemplateByName(
        'Claims Extraction (System)',
        'You are an expert at extracting structured claims from text. Return only valid JSON.',
      ) },
      { role: 'user', content: prompt },
    ], {
      temperature: 0.3,
      maxTokens: 2000,
    });

    // Parse claims
    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[ClaimsExtraction] Failed to parse claims from LLM response');
      return [];
    }

    const claims: Claim[] = JSON.parse(jsonMatch[0]);

    // Link evidence to claims
    for (const claim of claims) {
      claim.evidence = linkEvidence(claim, responseText, citations);
    }

    return claims;

  } catch (error: any) {
    console.error('[ClaimsExtraction] Error extracting claims:', error.message);
    return [];
  }
}

/**
 * Link evidence to a claim
 */
function linkEvidence(claim: Claim, fullText: string, citations: any[]): Evidence[] {
  const evidence: Evidence[] = [];

  // Find claim in text to get context
  const claimIndex = fullText.toLowerCase().indexOf(claim.text.toLowerCase());
  if (claimIndex !== -1) {
    const contextStart = Math.max(0, claimIndex - 200);
    const contextEnd = Math.min(fullText.length, claimIndex + claim.text.length + 200);
    const context = fullText.substring(contextStart, contextEnd);

    evidence.push({
      type: 'context',
      source: 'llm_response',
      snippet: context,
      relevance: 1.0,
    });
  }

  // Link citations that appear near the claim
  for (const citation of citations) {
    const citationIndex = fullText.indexOf(citation.url);
    if (citationIndex !== -1 && claimIndex !== -1) {
      const distance = Math.abs(citationIndex - claimIndex);
      if (distance < 500) { // Within 500 characters
        const relevance = Math.max(0, 1 - (distance / 500));
        evidence.push({
          type: 'citation',
          source: citation.url,
          snippet: citation.snippet || '',
          relevance,
        });
      }
    }
  }

  return evidence;
}

/**
 * Build claim graph from multiple responses
 */
export async function buildClaimGraph(
  responses: Array<{ text: string; citations: any[] }>,
  brandName: string
): Promise<ClaimGraph> {
  const allClaims: Claim[] = [];
  const entities: Map<string, Entity> = new Map();

  // Extract claims from all responses
  for (const response of responses) {
    const claims = await extractClaims(response.text, brandName, response.citations);
    allClaims.push(...claims);
  }

  // Extract entities
  for (const claim of allClaims) {
    // Extract brand mentions
    if (claim.subject.toLowerCase().includes(brandName.toLowerCase())) {
      updateEntity(entities, brandName, 'brand', claim.sentiment);
    }

    // Extract other entities (simplified - should use NER in production)
    const words = claim.subject.split(' ');
    for (const word of words) {
      if (word.length > 3 && /^[A-Z]/.test(word)) {
        updateEntity(entities, word, 'organization', claim.sentiment);
      }
    }
  }

  // Find relationships between claims
  const relationships = findClaimRelationships(allClaims);

  return {
    claims: allClaims,
    relationships,
    entities: Array.from(entities.values()),
  };
}

/**
 * Update entity in map
 */
function updateEntity(
  entities: Map<string, Entity>,
  name: string,
  type: Entity['type'],
  sentiment: Entity['sentiment']
) {
  const existing = entities.get(name);
  if (existing) {
    existing.mentions++;
    // Update sentiment (simplified averaging)
    if (sentiment !== existing.sentiment && sentiment !== 'neutral') {
      existing.sentiment = sentiment;
    }
  } else {
    entities.set(name, {
      name,
      type,
      mentions: 1,
      sentiment,
    });
  }
}

/**
 * Find relationships between claims
 */
function findClaimRelationships(claims: Claim[]): ClaimRelationship[] {
  const relationships: ClaimRelationship[] = [];

  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const claim1 = claims[i];
      const claim2 = claims[j];

      // Check if claims are about the same subject
      if (claim1.subject.toLowerCase() === claim2.subject.toLowerCase()) {
        // Determine relationship type
        let type: ClaimRelationship['type'] = 'elaborates';
        let strength = 0.5;

        if (claim1.sentiment !== claim2.sentiment) {
          type = 'contradicts';
          strength = 0.8;
        } else if (claim1.type === 'comparison' || claim2.type === 'comparison') {
          type = 'compares';
          strength = 0.7;
        } else if (claim1.predicate.toLowerCase().includes(claim2.predicate.toLowerCase())) {
          type = 'supports';
          strength = 0.9;
        }

        relationships.push({
          from: claim1.text,
          to: claim2.text,
          type,
          strength,
        });
      }
    }
  }

  return relationships;
}

/**
 * Get claim statistics
 */
export function getClaimStats(graph: ClaimGraph) {
  const stats = {
    totalClaims: graph.claims.length,
    byType: {
      factual: 0,
      opinion: 0,
      comparison: 0,
      recommendation: 0,
    },
    bySentiment: {
      positive: 0,
      neutral: 0,
      negative: 0,
    },
    totalEntities: graph.entities.length,
    totalRelationships: graph.relationships.length,
    avgConfidence: 0,
  };

  for (const claim of graph.claims) {
    stats.byType[claim.type]++;
    stats.bySentiment[claim.sentiment]++;
    stats.avgConfidence += claim.confidence;
  }

  stats.avgConfidence = stats.avgConfidence / graph.claims.length || 0;

  return stats;
}
