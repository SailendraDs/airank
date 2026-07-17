// Citation Gap Analyzer - Identify sources citing competitors but not the brand
// FOMO driver: "Competitor X is cited but you're not"

import { storage } from '../storage';

export interface CitationGap {
  source: string;
  sourceUrl: string;
  sourceAuthority: number; // 1-100
  citesCompetitor: boolean;
  citesBrand: boolean;
  competitorMentioned: string;
  brandMentioned?: string;
  gapReason: string;
  outreachDifficulty: 'easy' | 'medium' | 'hard';
  actionType: 'request_coverage' | 'create_content' | 'build_relationships';
}

export interface CitationAnalysis {
  brandId: string;
  totalGaps: number;
  highPriorityGaps: CitationGap[];
  mediumPriorityGaps: CitationGap[];
  alreadyCited: string[];
  generatedAt: Date;
}

export class CitationGapAnalyzer {
  /**
   * Analyze citation gaps for a brand
   */
  async analyzeCitationGaps(brandId: string): Promise<CitationAnalysis> {
    const [brand, competitors, mentions, sources] = await Promise.all([
      storage.getBrand(brandId),
      storage.getCompetitors(brandId),
      storage.getAnswerMentionsByBrand(brandId, 1000),
      storage.getSourcesByBrand(brandId),
    ]);

    const highPriorityGaps: CitationGap[] = [];
    const mediumPriorityGaps: CitationGap[] = [];
    const alreadyCited: string[] = [];

    // Get sources that mention competitors
    const competitorSources = new Map<string, Set<string>>();

    for (const competitor of competitors) {
      const compMentions = mentions.filter((m: any) => m.competitorId === competitor.id);
      for (const mention of compMentions) {
        const sourceName = (mention as any).source || 'Unknown Source';
        if (!competitorSources.has(competitor.name)) {
          competitorSources.set(competitor.name, new Set());
        }
        competitorSources.get(competitor.name)!.add(sourceName);
      }
    }

    // Check which sources mention the brand
    const brandSources = new Set<string>();
    for (const mention of mentions) {
      if (!(mention as any).competitorId) {
        const sourceName = (mention as any).source || 'Unknown Source';
        brandSources.add(sourceName);
        alreadyCited.push(sourceName);
      }
    }

    // Identify gaps
    for (const [competitorName, sourceSet] of competitorSources) {
      for (const source of sourceSet) {
        if (!brandSources.has(source)) {
          const gap = this.createGap(source, competitorName, brand?.name || '');

          if (gap.sourceAuthority > 70) {
            highPriorityGaps.push(gap);
          } else {
            mediumPriorityGaps.push(gap);
          }
        }
      }
    }

    // Sort by authority
    highPriorityGaps.sort((a, b) => b.sourceAuthority - a.sourceAuthority);
    mediumPriorityGaps.sort((a, b) => b.sourceAuthority - a.sourceAuthority);

    return {
      brandId,
      totalGaps: highPriorityGaps.length + mediumPriorityGaps.length,
      highPriorityGaps,
      mediumPriorityGaps,
      alreadyCited: [...new Set(alreadyCited)],
      generatedAt: new Date(),
    };
  }

  /**
   * Create a citation gap entry
   */
  private createGap(source: string, competitorName: string, brandName: string): CitationGap {
    // Estimate authority based on source name patterns
    const authorityHighPatterns = ['forbes', 'techcrunch', 'gartner', 'mckinsey', 'bloomberg', 'reuters'];
    const authorityMedPatterns = ['medium', 'linkedin', 'hackernews', 'reddit', 'news'];

    let sourceAuthority = 50; // Default medium
    if (authorityHighPatterns.some(p => source.toLowerCase().includes(p))) {
      sourceAuthority = 85;
    } else if (authorityMedPatterns.some(p => source.toLowerCase().includes(p))) {
      sourceAuthority = 60;
    }

    // Determine gap reason
    const gapReasons = [
      `Brand not recognized by ${source}'s AI training data`,
      `${source} may not have recent coverage of ${brandName}`,
      `Consider reaching out with newsworthy updates`,
      `${competitorName} has established presence with this source`,
    ];
    const gapReason = gapReasons[Math.floor(Math.random() * gapReasons.length)];

    // Determine outreach difficulty
    let outreachDifficulty: 'easy' | 'medium' | 'hard' = 'medium';
    if (sourceAuthority > 80) {
      outreachDifficulty = 'hard';
    } else if (sourceAuthority < 60) {
      outreachDifficulty = 'easy';
    }

    return {
      source,
      sourceUrl: `https://${source.toLowerCase().replace(/\s+/g, '')}.com`,
      sourceAuthority,
      citesCompetitor: true,
      citesBrand: false,
      competitorMentioned: competitorName,
      gapReason,
      outreachDifficulty,
      actionType: this.getActionType(outreachDifficulty),
    };
  }

  /**
   * Get recommended action type based on difficulty
   */
  private getActionType(difficulty: 'easy' | 'medium' | 'hard'): CitationGap['actionType'] {
    switch (difficulty) {
      case 'easy':
        return 'create_content';
      case 'medium':
        return 'build_relationships';
      case 'hard':
        return 'request_coverage';
    }
  }

  /**
   * Get summary for dashboard display
   */
  async getCitationSummary(brandId: string): Promise<{
    totalGaps: number;
    highPriorityCount: number;
    topGaps: CitationGap[];
  }> {
    const analysis = await this.analyzeCitationGaps(brandId);
    return {
      totalGaps: analysis.totalGaps,
      highPriorityCount: analysis.highPriorityGaps.length,
      topGaps: analysis.highPriorityGaps.slice(0, 5),
    };
  }
}

// Singleton instance
let analyzerInstance: CitationGapAnalyzer | null = null;

export function getCitationGapAnalyzer(): CitationGapAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new CitationGapAnalyzer();
  }
  return analyzerInstance;
}