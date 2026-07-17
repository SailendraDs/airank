// Wikipedia Notability Advisor + Wikidata Claim Drafter Worker
//
// For brands without a Wikipedia article:
//   1. Check if they meet Wikipedia notability guidelines:
//      - News coverage (3+ distinct sources)
//      - Significant coverage in the field
//      - Size/impact (funding, revenue, employees)
//      - Longevity (founded > 5 years)
//   2. If notable, draft a skeleton article and claim suggestions for Wikidata
//   3. If borderline, advise on what to add
//   4. If not notable, recommend different approaches

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { logger } from '../../lib/logger';

export interface WikipediaNotabilityPayload {
  brandId: string;
}

export interface NotabilityAssessment {
  notable: boolean;
  reasons: string[];
  missing: string[];
  recommendations: string[];
  draftArticle?: string;
  suggestedClaims?: Record<string, string>;
}

const NEWS_THRESHOLD = 3;
const FIVE_YEARS_AGO = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);

export async function wikipediaNotabilityAdvisorWorker(job: QueuedJob): Promise<{ brandId: string; assessment: NotabilityAssessment }> {
  const { brandId } = job.payload;
  const log = logger.child({ worker: 'wikipedia_notability_advisor', brandId, jobId: job.id });

  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const kgStatus = await storage.getKnowledgeGraphStatus(brandId);
  const assessment: NotabilityAssessment = {
    notable: false,
    reasons: [],
    missing: [],
    recommendations: [],
  };

  // 1. Check criteria
  const news = await storage.getNewsMentionsByBrand(brandId);
  const newsSources = new Set(news.map(n => (n.sourceDomain as string | null) ?? '').filter(Boolean));

  // News coverage
  if (newsSources.size >= NEWS_THRESHOLD) {
    assessment.reasons.push(`Significant news coverage (${newsSources.size} sources)`);
  } else {
    assessment.missing.push(`Need at least 3+ distinct news mentions from reputable sources`);
  }

  // Size/impact (via entity_profile)
  const profile = await storage.getEntityProfileByBrand(brandId);
  const profileMeta = (profile?.socialProfiles as any) ?? {};
  const hasFunding = Number(profileMeta.totalFunding ?? 0) > 1e6; // $1M+
  const hasEmployees = Number(profileMeta.employeeCount ?? 0) > 20;
  const hasProduct = Number(profileMeta.productLaunchCount ?? 0) > 2;

  if (hasFunding || hasEmployees || hasProduct) {
    const reasons: string[] = [];
    if (hasFunding) reasons.push(`Funding of ${Number(profileMeta.totalFunding || 0).toLocaleString()}`);
    if (hasEmployees) reasons.push(`${Number(profileMeta.employeeCount || 0)} employees`);
    if (hasProduct) reasons.push(`${Number(profileMeta.productLaunchCount || 0)} products`);
    assessment.reasons.push(`Significant business impact: ${reasons.join(', ')}`);
  } else {
    assessment.missing.push(`Need to establish clear business size or impact (funding, employees, products)`);
  }

  // Longevity
  const founded = profile?.yearFounded ? `${profile.yearFounded}-01-01` : null;
  if (founded) {
    const d = new Date(founded);
    if (d < FIVE_YEARS_AGO) {
      assessment.reasons.push(`Founded in ${d.getFullYear()} (${Math.floor((Date.now() - d.getTime()) / (365 * 24 * 60 * 60 * 1000))} years)`);
    } else {
      assessment.missing.push(`Need to be founded more than 5 years ago (currently ${Math.floor((Date.now() - d.getTime()) / (365 * 24 * 60 * 60 * 1000))} years)`);
    }
  } else {
    assessment.missing.push(`Funding date not recorded`);
  }

  // 2. Assessment
  assessment.notable = assessment.reasons.length >= 2 && assessment.missing.length <= 1;

  // 3. Recommendations
  if (assessment.notable) {
    assessment.recommendations.push('You meet Wikipedia notability guidelines. Begin drafting your article starting with the suggested skeleton below.');
    assessment.draftArticle = generateSkeletonArticle(brand, profile);

    // Draft Wikidata claims
    assessment.suggestedClaims = {
      P31: 'organization', // instance of
      P17: String(profileMeta.country ?? ''), // country
      P18: String(profileMeta.logoUrl ?? ''), // logo
      P154: String(profileMeta.logoUrl ?? ''), // logo image
      P856: brand.url || '', // official website
      P131: String(profileMeta.headquarters ?? ''), // located in
      P571: founded || '', // inception
      P1088: String(profileMeta.employeeCount ?? ''), // number of employees
      P166: Array.isArray(profileMeta.awards) ? profileMeta.awards.join(', ') : String(profileMeta.awards ?? ''), // award received
      P6634: String(profileMeta.followers ?? ''), // social media followers
    };
  } else {
    assessment.recommendations.push('You do not currently meet Wikipedia notability guidelines. Focus on:');
    assessment.recommendations.push('1. Get featured in 3+ reputable publications');
    assessment.recommendations.push('2. Document your company growth and impact');
    assessment.recommendations.push('3. Maintain operations for at least 5 years');
    assessment.recommendations.push('4. Consider alternative platforms for establishing authority');
  }

  // 4. Persist advice
  await storage.upsertBrandAdvice({
    brandId,
    adviceType: 'wikipedia_notability',
    content: JSON.stringify(assessment),
    followsUp: assessment.notable,
  } as any);

  log.info('Wikipedia notability assessment complete', { notable: assessment.notable });
  return { brandId, assessment };
}

function generateSkeletonArticle(brand: any, profile: any): string {
  const meta = (profile?.socialProfiles as any) ?? {};
  return `'''${brand.name}''' is a company founded in ${profile?.yearFounded ?? 'an unknown year'} ${meta.headquarters ? `in ${meta.headquarters}` : ''}. The company operates in the ${brand.industry || 'technology'} sector.

== History ==
${brand.description || ''}

== Products and services ==
${Number(meta.productLaunchCount || 0)} products and services.

== External links ==
*[https://www.wikidata.org/wiki/${profile?.wikidataId || ''}] Wikidata page
*[${brand.url}] Official website`;
}
