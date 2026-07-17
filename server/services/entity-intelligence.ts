// Entity Intelligence Service
//
// Composes the 9 sub-scores from Part 5.1 of the report.md into a single
// 0-100 Entity Score. The 9 components:
//
//   Identity Accuracy      15%
//   Knowledge Graph Cover  12%
//   Social Graph Strength  12%
//   Topic Authority        12%
//   Community Validation   10%
//   Citation Trust         10%
//   Entity Consistency     10%
//   Retrieval Success      10%
//   Disambiguation Acc.     9%
//
// Each sub-score is independent 0-100. The total is weighted, capped at 100.

import type { IStorage } from "../storage";

export type EntityComponentBreakdown = {
  key: string;
  label: string;
  weight: number;
  earned: number;
  max: number;
  reason: string;
  sources: { platform: string; presence: boolean; weight: number }[];
};

export type EntityScoreReport = {
  brandId: string;
  entityScore: number;
  components: EntityComponentBreakdown[];
  subScores: {
    identityAccuracy: number;
    kgCoverage: number;
    socialGraphStrength: number;
    topicAuthority: number;
    communityValidation: number;
    citationTrust: number;
    entityConsistency: number;
    retrievalSuccess: number;
    disambiguationAccuracy: number;
  };
  dataQuality: { hasData: string[]; missing: string[] };
  generatedAt: string;
};

// ============= Sub-score calculators (each 0-100) =============

export async function computeIdentityAccuracy(storage: IStorage, brandId: string): Promise<{ score: number; reason: string; sources: any[] }> {
  // Pull all entityDisambiguationTests for the brand, compute pass rate
  const tests = await storage.getEntityDisambiguationTestsByBrand(brandId);
  if (tests.length === 0) {
    return {
      score: 0,
      reason: 'No identity tests run yet. Add ground truth and run identity-accuracy worker.',
      sources: [],
    };
  }
  const correct = tests.filter(t => t.isCorrect).length;
  const score = Math.round((correct / tests.length) * 100);
  return {
    score,
    reason: `${correct}/${tests.length} ground-truth questions answered correctly by LLMs.`,
    sources: [],
  };
}

export async function computeKgCoverage(storage: IStorage, brandId: string): Promise<{ score: number; reason: string; sources: any[] }> {
  const profile = await storage.getEntityProfileByBrand(brandId);
  const links = await storage.getEntityLinksByBrand(brandId);
  const kgStatus = await storage.getKnowledgeGraphStatus(brandId);

  let score = 0;
  const sources: any[] = [];

  // Wikidata completeness: 0-60
  const completeness = (kgStatus?.completenessScore as number) ?? 0;
  score += (completeness / 100) * 60;
  if (kgStatus?.wikidataId) {
    sources.push({ platform: 'wikidata', presence: true, weight: 60 });
  }

  // Google KG: 0-20
  const googleKgLink = links.find(l => l.platform === 'google_kg' && l.verified);
  if (googleKgLink) {
    score += 20;
    sources.push({ platform: 'google_kg', presence: true, weight: 20 });
  }

  // Crunchbase: 0-20
  const cbLink = links.find(l => l.platform === 'crunchbase' && l.verified);
  if (cbLink) {
    score += 20;
    sources.push({ platform: 'crunchbase', presence: true, weight: 20 });
  }

  score = Math.round(score);
  const reason = score >= 80
    ? `Strong KG coverage — Wikidata ${completeness}% complete${googleKgLink ? ', Google KG linked' : ''}${cbLink ? ', Crunchbase linked' : ''}.`
    : `Knowledge graph coverage thin. Wikidata ${completeness}%${googleKgLink ? '' : ' (no Google KG)'}${cbLink ? '' : ' (no Crunchbase)'}.`;

  return { score, reason, sources };
}

export async function computeSocialGraphStrength(storage: IStorage, brandId: string): Promise<{ score: number; reason: string; sources: any[] }> {
  const presence = await storage.getEntitySocialPresenceByBrand(brandId);
  const platforms = new Set(presence.map(p => p.platform));

  // 14 platforms tracked: linkedin, x, youtube, instagram, medium, github, reddit, producthunt,
  // g2, capterra, trustpilot, stackoverflow, hackernews, substack
  const allPlatforms = ['linkedin', 'x', 'youtube', 'instagram', 'medium', 'github', 'reddit', 'producthunt', 'g2', 'capterra', 'trustpilot', 'stackoverflow', 'hackernews', 'substack'];
  const present = allPlatforms.filter(p => platforms.has(p));

  let score = Math.round((present.length / allPlatforms.length) * 100);
  const sources = presence.map(p => ({
    platform: p.platform,
    presence: true,
    weight: Math.round((p.authorityScore ?? 0)),
  }));

  // Bonus for verified handles
  const verifiedCount = presence.filter(p => p.verified).length;
  if (verifiedCount > 0) {
    score = Math.min(100, score + 5);
  }

  // Penalty for dormant accounts (no posts in 30d)
  const dormant = presence.filter(p => p.postsLast30d === 0 && (p.followers ?? 0) > 0).length;
  if (dormant > 0) {
    score = Math.max(0, score - dormant * 3);
  }

  const reason = present.length === 0
    ? 'No social platforms connected. Add LinkedIn, X, GitHub, G2, etc. via Entity Hub.'
    : `Tracked on ${present.length}/14 social platforms (${present.slice(0, 4).join(', ')}${present.length > 4 ? '…' : ''}). ${verifiedCount} verified.`;

  return { score, reason, sources };
}

export async function computeTopicAuthority(storage: IStorage, brandId: string): Promise<{ score: number; reason: string; sources: any[] }> {
  const assocs = await storage.getTopicEntityAssociationsByBrand(brandId);
  if (assocs.length === 0) {
    return {
      score: 0,
      reason: 'No topic-entity associations computed yet. Run topic-association-runner.',
      sources: [],
    };
  }
  const avg = assocs.reduce((s, a) => s + (a.associationScore ?? 0), 0) / assocs.length;
  const score = Math.round(avg);
  const top = assocs.slice(0, 3).map(a => `${a.topicName ?? 'topic'} (${Math.round(a.associationScore ?? 0)}%)`).join(', ');
  const reason = `Average topic association ${score}% across ${assocs.length} topics. Top: ${top}.`;
  return { score, reason, sources: assocs.map(a => ({ platform: a.topicName ?? 'topic', presence: true, weight: a.associationScore ?? 0 })) };
}

export async function computeCommunityValidation(storage: IStorage, brandId: string): Promise<{ score: number; reason: string; sources: any[] }> {
  const validations = await storage.getCommunityValidationByBrand(brandId);
  if (validations.length === 0) {
    return {
      score: 0,
      reason: 'No community validation data yet. Run community-validation-worker.',
      sources: [],
    };
  }
  const avgShare = validations.reduce((s, v) => s + (v.sharePct ?? 0), 0) / validations.length;
  const totalRecs = validations.reduce((s, v) => s + (v.recommendationCount ?? 0), 0);
  // Score: weighted by share (50%) + recommendation volume (50%)
  const shareScore = Math.min(100, avgShare * 5);  // share 20% = score 100
  const volScore = Math.min(100, totalRecs * 2);   // 50 recs = score 100
  const score = Math.round(shareScore * 0.6 + volScore * 0.4);
  const reason = `${Math.round(avgShare)}% share across ${validations.length} platforms (${totalRecs} total recommendations).`;
  return { score, reason, sources: validations.map(v => ({ platform: v.platform, presence: true, weight: v.sharePct ?? 0 })) };
}

export async function computeCitationTrust(storage: IStorage, brandId: string): Promise<{ score: number; reason: string; sources: any[] }> {
  const sources = await storage.getSourcesByBrand(brandId);
  if (sources.length === 0) {
    return { score: 0, reason: 'No citation sources recorded.', sources: [] };
  }
  // Trust-weighted: each source contributes its trustWeight (2-25) up to 25 each
  const totalTrust = sources.reduce((s, src: any) => s + (src.trustWeight ?? 2), 0);
  // Score: 10 sources at trust 10 = 100
  const score = Math.min(100, Math.round(totalTrust / 10));
  const wiki = sources.filter((s: any) => s.sourceType === 'wiki' || (s.domain ?? '').toLowerCase().includes('wikipedia')).length;
  const news = sources.filter((s: any) => s.sourceType === 'news').length;
  const reason = wiki > 0
    ? `${wiki} Wikipedia citation${wiki > 1 ? 's' : ''} (trust 10×), ${news} news, ${sources.length} total. Weighted trust ${totalTrust}.`
    : `${sources.length} citation sources, total trust weight ${totalTrust}. Add Wikipedia / G2 / Crunchbase for higher trust.`;
  return { score, reason, sources: sources.slice(0, 20).map((s: any) => ({ platform: s.domain ?? s.url ?? '', presence: true, weight: s.trustWeight ?? 2 })) };
}

export async function computeEntityConsistency(storage: IStorage, brandId: string): Promise<{ score: number; reason: string; sources: any[] }> {
  // Pairwise comparison of brand descriptions across linked platforms
  const profile = await storage.getEntityProfileByBrand(brandId);
  const brand = await storage.getBrand(brandId);
  if (!brand) return { score: 0, reason: 'Brand not found.', sources: [] };

  const presence = await storage.getEntitySocialPresenceByBrand(brandId);
  const descriptions: { source: string; text: string }[] = [];
  if (brand.description) descriptions.push({ source: 'website', text: brand.description });
  if (profile?.legalName) descriptions.push({ source: 'wikidata', text: profile.legalName });
  presence.forEach(p => {
    if (p.handle) descriptions.push({ source: p.platform, text: p.handle });
  });

  if (descriptions.length < 2) {
    return { score: 0, reason: 'Need 2+ descriptions to compare consistency. Add more sources.', sources: [] };
  }

  // Cheap similarity: share of common tokens / total unique tokens (Jaccard)
  const tokenize = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const sets = descriptions.map(d => tokenize(d.text));
  let totalSim = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const intersect = new Set([...sets[i]].filter(x => sets[j].has(x)));
      const union = new Set([...sets[i], ...sets[j]]);
      const sim = union.size > 0 ? intersect.size / union.size : 0;
      totalSim += sim;
      pairs++;
    }
  }
  const avgSim = pairs > 0 ? totalSim / pairs : 0;
  // 0.6 Jaccard = 100, 0.3 = 50
  const score = Math.round(Math.min(100, (avgSim / 0.6) * 100));
  const reason = score >= 80
    ? `Descriptions align across ${descriptions.length} sources (avg similarity ${Math.round(avgSim * 100)}%).`
    : `Description drift across ${descriptions.length} sources (avg similarity ${Math.round(avgSim * 100)}%). Align social bios + About page.`;
  return { score, reason, sources: descriptions.map(d => ({ platform: d.source, presence: true, weight: 100 })) };
}

export async function computeRetrievalSuccess(storage: IStorage, brandId: string): Promise<{ score: number; reason: string; sources: any[] }> {
  const tests = await storage.getRetrievalTestsByBrand(brandId);
  if (tests.length === 0) {
    return { score: 0, reason: 'No retrieval tests run yet. Run retrieval-tester.', sources: [] };
  }
  const retrieved = tests.filter(t => t.retrieved).length;
  const score = Math.round((retrieved / tests.length) * 100);
  const reason = `Retrieval success ${score}% — ${retrieved}/${tests.length} prompts retrieved the brand when a source was provided.`;
  return { score, reason, sources: [] };
}

export async function computeDisambiguationAccuracy(storage: IStorage, brandId: string): Promise<{ score: number; reason: string; sources: any[] }> {
  // Reuse disambiguation tests
  const stats = await storage.getDisambiguationStats(brandId);
  if (stats.length === 0) {
    return { score: 0, reason: 'No disambiguation tests run yet.', sources: [] };
  }
  const avgRate = stats.reduce((s, x) => s + x.rate, 0) / stats.length;
  const score = Math.round(avgRate * 100);
  const reason = `Disambiguation accuracy ${score}% — LLMs know which entity you are in labeled tests.`;
  return { score, reason, sources: [] };
}

// ============= Composed Entity Score =============

export async function computeEntityScore(storage: IStorage, brandId: string): Promise<EntityScoreReport> {
  const [
    identity, kg, social, topic, community, citation, consistency, retrieval, disambig,
  ] = await Promise.all([
    computeIdentityAccuracy(storage, brandId),
    computeKgCoverage(storage, brandId),
    computeSocialGraphStrength(storage, brandId),
    computeTopicAuthority(storage, brandId),
    computeCommunityValidation(storage, brandId),
    computeCitationTrust(storage, brandId),
    computeEntityConsistency(storage, brandId),
    computeRetrievalSuccess(storage, brandId),
    computeDisambiguationAccuracy(storage, brandId),
  ]);

  const components: EntityComponentBreakdown[] = [
    { key: 'identity', label: 'Identity Accuracy', weight: 15, earned: Math.round(identity.score * 0.15), max: 15, reason: identity.reason, sources: identity.sources },
    { key: 'kg', label: 'KG Coverage', weight: 12, earned: Math.round(kg.score * 0.12), max: 12, reason: kg.reason, sources: kg.sources },
    { key: 'social', label: 'Social Graph', weight: 12, earned: Math.round(social.score * 0.12), max: 12, reason: social.reason, sources: social.sources },
    { key: 'topic', label: 'Topic Authority', weight: 12, earned: Math.round(topic.score * 0.12), max: 12, reason: topic.reason, sources: topic.sources },
    { key: 'community', label: 'Community Validation', weight: 10, earned: Math.round(community.score * 0.10), max: 10, reason: community.reason, sources: community.sources },
    { key: 'citation', label: 'Citation Trust', weight: 10, earned: Math.round(citation.score * 0.10), max: 10, reason: citation.reason, sources: citation.sources },
    { key: 'consistency', label: 'Entity Consistency', weight: 10, earned: Math.round(consistency.score * 0.10), max: 10, reason: consistency.reason, sources: consistency.sources },
    { key: 'retrieval', label: 'Retrieval Success', weight: 10, earned: Math.round(retrieval.score * 0.10), max: 10, reason: retrieval.reason, sources: retrieval.sources },
    { key: 'disambiguation', label: 'Disambiguation', weight: 9, earned: Math.round(disambig.score * 0.09), max: 9, reason: disambig.reason, sources: disambig.sources },
  ];

  const total = components.reduce((s, c) => s + c.earned, 0);

  return {
    brandId,
    entityScore: Math.max(0, Math.min(100, Math.round(total))),
    components,
    subScores: {
      identityAccuracy: identity.score,
      kgCoverage: kg.score,
      socialGraphStrength: social.score,
      topicAuthority: topic.score,
      communityValidation: community.score,
      citationTrust: citation.score,
      entityConsistency: consistency.score,
      retrievalSuccess: retrieval.score,
      disambiguationAccuracy: disambig.score,
    },
    dataQuality: {
      hasData: components.filter(c => c.sources.length > 0).map(c => c.key),
      missing: components.filter(c => c.sources.length === 0).map(c => c.key),
    },
    generatedAt: new Date().toISOString(),
  };
}
