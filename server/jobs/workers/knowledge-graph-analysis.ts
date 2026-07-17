// Knowledge Graph Analysis Worker - Wikidata entity health tracking

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { getIntegrations } from '../../integrations';

export interface KnowledgeGraphAnalysisPayload {
  brandId: string;
}

export async function knowledgeGraphAnalysisWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as KnowledgeGraphAnalysisPayload;
  const { brandId } = payload;

  console.log(`[KnowledgeGraphAnalysis] Starting analysis for brand ${brandId}`);

  // Get brand
  const brand = await storage.getBrand(brandId);
  if (!brand) {
    throw new Error(`Brand ${brandId} not found`);
  }

  // Get integrations
  const integrations = getIntegrations();
  if (!integrations.wikidata) {
    throw new Error('Wikidata integration not available');
  }

  try {
    // Search for brand entity in Wikidata
    const searchResults = await integrations.wikidata.searchEntities(brand.name);

    if (!searchResults || searchResults.length === 0) {
      console.log(`[KnowledgeGraphAnalysis] No Wikidata entity found for ${brand.name}`);
      
      // Store status indicating no entity found
      await storage.upsertKnowledgeGraphStatus({
        brandId,
        wikidataId: null,
        entityLabel: null,
        sitelinkCount: 0,
        completenessScore: 0,
        missingClaims: {
          recommended: [
            'official_website',
            'inception_date',
            'industry',
            'headquarters_location',
            'founder',
          ],
        },
        recommendations: {
          actions: [
            {
              priority: 'high',
              action: 'Create Wikidata entity',
              description: 'No Wikidata entity exists for this brand. Creating one will improve AI visibility.',
              effort: 'medium',
            },
          ],
        },
        existingClaims: {},
        updatedAt: new Date(),
        lastCheckedAt: new Date(),
      } as any);

      return {
        brandId,
        entityFound: false,
        completenessScore: 0,
      };
    }

    // Get the first (most relevant) entity
    const entityId = searchResults[0].id;
    console.log(`[KnowledgeGraphAnalysis] Found entity: ${entityId}`);

    // Get detailed entity data
    const entityData = await integrations.wikidata.getEntity(entityId);

    if (!entityData) {
      throw new Error(`Failed to fetch entity data for ${entityId}`);
    }

    // Calculate completeness score
    const claimsCount = Object.keys(entityData.claims || {}).length;
    const sitelinksCount = Object.keys(entityData.sitelinks || {}).length;

    // Essential claims for a brand
    const essentialClaims = [
      'P856', // official website
      'P571', // inception date
      'P452', // industry
      'P159', // headquarters location
      'P112', // founder
      'P1454', // legal form
      'P2541', // operating area
      'P414', // stock exchange
    ];

    const presentClaims = essentialClaims.filter(
      (claim) => entityData.claims && entityData.claims[claim]
    );

    const missingClaims = essentialClaims.filter(
      (claim) => !entityData.claims || !entityData.claims[claim]
    );

    // Calculate completeness score (0-100)
    const claimsScore = (presentClaims.length / essentialClaims.length) * 60;
    const sitelinksScore = Math.min((sitelinksCount / 10) * 40, 40);
    const completenessScore = Math.round(claimsScore + sitelinksScore);

    // Generate recommendations
    const recommendations = {
      actions: [] as any[],
    };

    if (completenessScore < 70) {
      recommendations.actions.push({
        priority: 'high',
        action: 'Improve entity completeness',
        description: `Entity is ${completenessScore}% complete. Adding missing claims will improve AI visibility.`,
        effort: 'medium',
      });
    }

    if (missingClaims.length > 0) {
      recommendations.actions.push({
        priority: 'medium',
        action: 'Add missing claims',
        description: `Add ${missingClaims.length} essential claims to improve entity quality.`,
        effort: 'low',
        claims: missingClaims,
      });
    }

    if (sitelinksCount < 5) {
      recommendations.actions.push({
        priority: 'medium',
        action: 'Add Wikipedia articles',
        description: 'Create or link Wikipedia articles in multiple languages to increase visibility.',
        effort: 'high',
      });
    }

    // Store knowledge graph status
    await storage.upsertKnowledgeGraphStatus({
      brandId,
      wikidataId: entityId,
      entityLabel: entityData.label || brand.name,
      existingClaims: { description: entityData.description || null, claimsCount },
      sitelinkCount: sitelinksCount,
      completenessScore,
      missingClaims: {
        essential: missingClaims,
        recommended: [
          'P2002', // Twitter username
          'P2003', // Instagram username
          'P4264', // LinkedIn company ID
          'P2397', // YouTube channel ID
        ],
      },
      recommendations,
      updatedAt: new Date(),
      lastCheckedAt: new Date(),
    } as any);

    console.log(
      `[KnowledgeGraphAnalysis] Completed analysis for ${brand.name}: ${completenessScore}% complete, ${claimsCount} claims, ${sitelinksCount} sitelinks`
    );

    return {
      brandId,
      entityFound: true,
      entityId,
      completenessScore,
      claimsCount,
      sitelinksCount,
      missingClaimsCount: missingClaims.length,
      recommendations: recommendations.actions.length,
    };
  } catch (error: any) {
    console.error(`[KnowledgeGraphAnalysis] Error analyzing brand ${brandId}:`, error.message);
    throw error;
  }
}
