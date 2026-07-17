// Citation Extraction Worker - Enhanced citation extraction from LLM responses

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { getIntegrations } from '../../integrations';
import { normalizeUrl } from '../../lib/url-normalizer';

export interface CitationExtractionPayload {
  brandId: string;
  llmAnswerId?: string;
}

export async function citationExtractionWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as CitationExtractionPayload;
  const { brandId, llmAnswerId } = payload;

  console.log(`[CitationExtraction] Starting citation extraction for brand ${brandId}`);

  // Get LLM answers to process
  let answers: any[];
  if (llmAnswerId) {
    const allAnswers = await storage.getLlmAnswersByBrand(brandId, 1);
    answers = allAnswers.filter(a => a.id === llmAnswerId);
  } else {
    // Get recent answers without citations
    answers = await storage.getLlmAnswersByBrand(brandId, 50);
  }

  if (answers.length === 0) {
    console.log(`[CitationExtraction] No answers found for brand ${brandId}`);
    return {
      brandId,
      citationsExtracted: 0,
    };
  }

  const integrations = getIntegrations();
  const extractedCitations: any[] = [];

  for (const answer of answers) {
    try {
      const citations = await extractCitations(answer.rawResponse, integrations);

      // Store citations
      for (let i = 0; i < citations.length; i++) {
        const citation = citations[i];
        
        await storage.createAnswerCitationDedup({
          llmAnswerId: answer.id,
          url: citation.url,
          domain: citation.domain,
          position: i + 1,
          citationType: citation.type,
          title: citation.title,
          normalizedUrl: normalizeUrl(citation.url),
        });

        extractedCitations.push({
          answerId: answer.id,
          url: citation.url,
          type: citation.type,
        });
      }

    } catch (error: any) {
      console.error(`[CitationExtraction] Error extracting citations from answer ${answer.id}:`, error.message);
    }
  }

  console.log(`[CitationExtraction] Extracted ${extractedCitations.length} citations for brand ${brandId}`);

  // Aggregate citations into the sources table for dashboard display
  await aggregateCitationsToSources(brandId);

  return {
    brandId,
    citationsExtracted: extractedCitations.length,
    answersProcessed: answers.length,
  };
}

async function aggregateCitationsToSources(brandId: string) {
  try {
    const allAnswers = await storage.getLlmAnswersByBrand(brandId, 200);
    const answerIds = allAnswers.map(a => a.id);
    if (answerIds.length === 0) return;

    const allCitations = await storage.getAnswerCitationsByAnswerIds(answerIds);
    if (allCitations.length === 0) return;

    const domainMap = new Map<string, {
      domain: string;
      urls: Set<string>;
      titles: Set<string>;
      models: Set<string>;
      count: number;
      firstSeen: Date;
      lastSeen: Date;
    }>();

    for (const citation of allCitations) {
      const domain = citation.domain;
      if (!domain) continue;

      const answer = allAnswers.find(a => a.id === citation.llmAnswerId);
      const model = answer?.llmProvider || '';

      if (!domainMap.has(domain)) {
        domainMap.set(domain, {
          domain,
          urls: new Set(),
          titles: new Set(),
          models: new Set(),
          count: 0,
          firstSeen: new Date(),
          lastSeen: new Date(0),
        });
      }
      const entry = domainMap.get(domain)!;
      entry.count++;
      if (citation.url) entry.urls.add(citation.url);
      if (citation.title) entry.titles.add(citation.title);
      if (model) entry.models.add(model);
      const citedAt = citation.createdAt ? new Date(citation.createdAt) : new Date();
      if (citedAt < entry.firstSeen) entry.firstSeen = citedAt;
      if (citedAt > entry.lastSeen) entry.lastSeen = citedAt;
    }

    const existingSources = await storage.getSourcesByBrand(brandId);
    const existingDomains = new Set(existingSources.map(s => s.domain));

    for (const [domain, data] of Array.from(domainMap.entries())) {
      const sourceType = classifyDomain(domain);
      const modelsArray = Array.from(data.models) as string[];
      const firstUrl = (Array.from(data.urls)[0] || null) as string | null;
      const firstTitle = (Array.from(data.titles)[0] || null) as string | null;

      if (existingDomains.has(domain)) {
        const existing = existingSources.find(s => s.domain === domain);
        if (existing) {
          await storage.updateSource(existing.id, {
            mentions: data.count,
            modelsCited: modelsArray,
            lastSeen: data.lastSeen,
            sourceType,
          });
        }
      } else {
        await storage.createSource({
          brandId,
          domain,
          url: firstUrl,
          title: firstTitle,
          mentions: data.count,
          modelsCited: modelsArray,
          sourceType,
          firstSeen: data.firstSeen,
          lastSeen: data.lastSeen,
        });
      }
    }

    console.log(`[CitationExtraction] Aggregated ${domainMap.size} domains into sources table for brand ${brandId}`);
  } catch (error: any) {
    console.error(`[CitationExtraction] Error aggregating sources:`, error.message);
  }
}

function classifyDomain(domain: string): string {
  if (domain.includes('wikipedia') || domain.includes('wiki')) return 'wiki';
  if (domain.includes('.edu')) return 'educational';
  if (domain.includes('.gov')) return 'government';
  if (domain.match(/reuters|bbc|cnn|forbes|bloomberg|techcrunch|nytimes|guardian|hindu|ndtv|economictimes/)) return 'news';
  if (domain.match(/glassdoor|ambition|indeed|linkedin/)) return 'review';
  return 'corporate';
}

/**
 * Extract citations from text using multiple methods
 */
async function extractCitations(text: string, _integrations: any): Promise<any[]> {
  const citations: any[] = [];

  // Method 1: Extract explicit URLs
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  const urls = text.match(urlRegex) || [];

  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');

      // Get context around URL
      const urlIndex = text.indexOf(url);
      const contextStart = Math.max(0, urlIndex - 100);
      const contextEnd = Math.min(text.length, urlIndex + url.length + 100);
      const snippet = text.substring(contextStart, contextEnd).trim();

      citations.push({
        url,
        domain,
        type: 'inline',
        snippet,
        confidence: 1.0,
      });
    } catch (error) {
      // Invalid URL, skip
    }
  }

  // Method 2: Extract markdown-style links [text](url)
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = markdownLinkRegex.exec(text)) !== null) {
    const [, title, url] = match;
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');

      citations.push({
        url,
        domain,
        type: 'reference',
        title,
        snippet: match[0],
        confidence: 1.0,
      });
    } catch (error) {
      // Invalid URL, skip
    }
  }

  // Method 3: Extract domain mentions that might be citations
  const domainRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})(?:\/[^\s]*)?/g;
  const domainMatches = text.match(domainRegex) || [];

  for (const domainMatch of domainMatches) {
    // Skip if already captured
    if (citations.some(c => c.url.includes(domainMatch))) {
      continue;
    }

    try {
      const url = domainMatch.startsWith('http') ? domainMatch : `https://${domainMatch}`;
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');

      const domainIndex = text.indexOf(domainMatch);
      const contextStart = Math.max(0, domainIndex - 50);
      const contextEnd = Math.min(text.length, domainIndex + domainMatch.length + 50);
      const snippet = text.substring(contextStart, contextEnd).trim();

      citations.push({
        url,
        domain,
        type: 'mention',
        snippet,
        confidence: 0.7,
      });
    } catch (error) {
      // Invalid URL, skip
    }
  }

  // Deduplicate by URL
  const uniqueCitations = citations.reduce((acc: any[], citation) => {
    if (!acc.some(c => c.url === citation.url)) {
      acc.push(citation);
    }
    return acc;
  }, []);

  return uniqueCitations;
}
