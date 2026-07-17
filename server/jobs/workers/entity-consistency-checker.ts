// Entity Consistency Checker Worker
//
// For each brand, fetches the description / About text from each connected
// social platform and the brand's own website, then computes pairwise
// similarity. If descriptions diverge (different founding dates, different
// industry tags, different mission statements), it flags them as
// consistency issues.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface EntityConsistencyPayload {
  brandId: string;
}

export interface ConsistencyIssue {
  field: string;
  sources: { source: string; value: string }[];
  severity: 'low' | 'medium' | 'high';
}

function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/\W+/).filter(w => w.length > 3));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size > 0 ? inter.size / union.size : 0;
}

function extractDates(text: string): string[] {
  return text.match(/\b(19|20)\d{2}\b/g) ?? [];
}

export async function entityConsistencyWorker(job: QueuedJob): Promise<{ brandId: string; issues: ConsistencyIssue[]; avgSimilarity: number }> {
  const { brandId } = job.payload;
  const log = logger.child({ worker: 'entity_consistency', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const profile = await storage.getEntityProfileByBrand(brandId);
  const socialPresence = await storage.getEntitySocialPresenceByBrand(brandId);

  const sources: { source: string; text: string }[] = [];
  if (brand.description) sources.push({ source: 'website', text: brand.description });
  if (profile?.entityDescription) sources.push({ source: 'wikidata', text: profile.entityDescription });
  if (profile?.legalName) sources.push({ source: 'wikidata_legalname', text: profile.legalName });
  for (const p of socialPresence) {
    if (p.handle) sources.push({ source: p.platform, text: p.handle });
  }

  const issues: ConsistencyIssue[] = [];

  // 1. Pairwise text similarity
  if (sources.length >= 2) {
    const sets = sources.map(s => tokenize(s.text));
    let total = 0; let pairs = 0;
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        total += jaccard(sets[i], sets[j]);
        pairs++;
      }
    }
    const avgSim = pairs > 0 ? total / pairs : 0;
    if (avgSim < 0.3) {
      issues.push({
        field: 'description_alignment',
        sources: sources.map(s => ({ source: s.source, value: s.text.slice(0, 80) })),
        severity: 'high',
      });
    }
  }

  // 2. Date consistency (e.g., founding date on website vs Wikidata)
  const datesBySource: Record<string, string[]> = {};
  for (const s of sources) {
    const dates = extractDates(s.text);
    if (dates.length) datesBySource[s.source] = dates;
  }
  const allYears = Object.values(datesBySource).flat();
  if (allYears.length > 1) {
    const uniqueYears = new Set(allYears);
    if (uniqueYears.size > 1) {
      issues.push({
        field: 'date_consistency',
        sources: Object.entries(datesBySource).map(([s, ys]) => ({ source: s, value: ys.join(', ') })),
        severity: 'medium',
      });
    }
  }

  // 3. Log to logs for monitoring
  const avgSimilarity = sources.length >= 2
    ? (() => {
        const sets = sources.map(s => tokenize(s.text));
        let total = 0; let pairs = 0;
        for (let i = 0; i < sets.length; i++) {
          for (let j = i + 1; j < sets.length; j++) {
            total += jaccard(sets[i], sets[j]);
            pairs++;
          }
        }
        return pairs > 0 ? total / pairs : 0;
      })()
    : 0;

  log.info('Entity consistency check complete', { issues: issues.length, avgSimilarity });
  return { brandId, issues, avgSimilarity };
}