// SEO Scorer - Calculate traditional SEO scores alongside GEO scores
// Enables comparison between AI visibility and traditional search visibility

import { storage } from '../storage';

export interface SEOScoreInput {
  titleTags: string[];
  metaDescriptions: string[];
  headings: { level: string; text: string }[];
  contentLength: number;
  keywordDensity: Map<string, number>;
  internalLinks: number;
  externalLinks: number;
  pageSpeed?: number;
  mobileFriendly?: boolean;
  coreWebVitals?: {
    lcp: number;
    fid: number;
    cls: number;
  };
}

export interface SEOScoreResult {
  score: number; // 0-100
  breakdown: {
    titleTag: number;
    metaDescription: number;
    headings: number;
    contentQuality: number;
    keywordOptimization: number;
    internalLinks: number;
    externalLinks: number;
    technical: number;
  };
  recommendations: string[];
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface GEOvsSEOScore {
  geoScore: number;
  seoScore: number;
  gap: number;
  recommendation: string;
  strongerSide: 'geo' | 'seo' | 'balanced';
}

export class SEOScorer {
  private readonly WEIGHTS = {
    titleTag: 15,
    metaDescription: 15,
    headings: 15,
    contentQuality: 20,
    keywordOptimization: 15,
    internalLinks: 10,
    externalLinks: 5,
    technical: 5,
  };

  /**
   * Calculate SEO score from page data
   */
  calculateSEOScore(input: SEOScoreInput): SEOScoreResult {
    const breakdown = {
      titleTag: this.scoreTitleTag(input.titleTags),
      metaDescription: this.scoreMetaDescription(input.metaDescriptions),
      headings: this.scoreHeadings(input.headings),
      contentQuality: this.scoreContentQuality(input.contentLength),
      keywordOptimization: this.scoreKeywordOptimization(input.keywordDensity),
      internalLinks: this.scoreInternalLinks(input.internalLinks),
      externalLinks: this.scoreExternalLinks(input.externalLinks),
      technical: this.scoreTechnical(input.pageSpeed, input.mobileFriendly, input.coreWebVitals),
    };

    const score = Object.entries(breakdown).reduce((total, [key, value]) => {
      return total + (value * (this.WEIGHTS[key as keyof typeof this.WEIGHTS] / 100));
    }, 0);

    const recommendations = this.generateRecommendations(breakdown, input);
    const grade = this.getGrade(score);

    return {
      score: Math.round(score),
      breakdown,
      recommendations,
      grade,
    };
  }

  private scoreTitleTag(tags: string[]): number {
    if (tags.length === 0) return 0;
    if (tags.length > 1) return 50; // Multiple title tags penalized

    const tag = tags[0];
    const length = tag.length;

    // Ideal length: 50-60 characters
    if (length < 30) return 40;
    if (length < 50) return 80;
    if (length <= 60) return 100;
    if (length <= 70) return 80;
    return 40;
  }

  private scoreMetaDescription(tags: string[]): number {
    if (tags.length === 0) return 20;
    if (tags.length > 1) return 50;

    const tag = tags[0];
    const length = tag.length;

    // Ideal length: 150-160 characters
    if (length < 100) return 50;
    if (length < 150) return 80;
    if (length <= 160) return 100;
    if (length <= 200) return 80;
    return 40;
  }

  private scoreHeadings(headings: { level: string; text: string }[]): number {
    if (headings.length === 0) return 0;

    const h1s = headings.filter(h => h.level === 'h1');
    const hasH2 = headings.some(h => h.level === 'h2');

    // Should have exactly one H1
    if (h1s.length === 0) return 30;
    if (h1s.length > 1) return 50;

    // Should have H2s
    if (!hasH2) return 70;

    // Proper heading hierarchy
    return 100;
  }

  private scoreContentQuality(contentLength: number): number {
    // Ideal: 300-2000 words
    if (contentLength < 100) return 20;
    if (contentLength < 300) return 50;
    if (contentLength < 1000) return 80;
    if (contentLength <= 2000) return 100;
    if (contentLength <= 3000) return 90;
    return 70;
  }

  private scoreKeywordOptimization(density: Map<string, number>): number {
    if (density.size === 0) return 30;

    let totalScore = 0;
    let count = 0;

    for (const [, pct] of density) {
      // Ideal density: 0.5-2.5%
      if (pct < 0.3) totalScore += 50;
      else if (pct <= 2.5) totalScore += 100;
      else if (pct <= 3.5) totalScore += 80;
      else totalScore += 40; // Over-optimization
      count++;
    }

    return count > 0 ? totalScore / count : 30;
  }

  private scoreInternalLinks(count: number): number {
    if (count === 0) return 30;
    if (count < 3) return 50;
    if (count <= 10) return 100;
    if (count <= 20) return 80;
    return 60;
  }

  private scoreExternalLinks(count: number): number {
    if (count === 0) return 50;
    if (count <= 3) return 80;
    if (count <= 10) return 100;
    return 60;
  }

  private scoreTechnical(
    pageSpeed?: number,
    mobileFriendly?: boolean,
    coreWebVitals?: { lcp: number; fid: number; cls: number }
  ): number {
    let score = 100;

    if (pageSpeed !== undefined) {
      // PageSpeed score: 0-100
      if (pageSpeed < 50) score -= 30;
      else if (pageSpeed < 70) score -= 15;
    }

    if (mobileFriendly === false) score -= 20;

    if (coreWebVitals) {
      // LCP should be < 2.5s, FID < 100ms, CLS < 0.1
      if (coreWebVitals.lcp > 4) score -= 15;
      else if (coreWebVitals.lcp > 2.5) score -= 5;

      if (coreWebVitals.fid > 300) score -= 10;
      else if (coreWebVitals.fid > 100) score -= 5;

      if (coreWebVitals.cls > 0.3) score -= 10;
      else if (coreWebVitals.cls > 0.1) score -= 5;
    }

    return Math.max(0, score);
  }

  private generateRecommendations(breakdown: SEOScoreResult['breakdown'], input: SEOScoreInput): string[] {
    const recommendations: string[] = [];

    if (breakdown.titleTag < 80) {
      recommendations.push('Optimize your title tag to 50-60 characters with primary keyword');
    }
    if (breakdown.metaDescription < 80) {
      recommendations.push('Write meta description of 150-160 characters with call-to-action');
    }
    if (breakdown.headings < 80) {
      recommendations.push('Add clear H1 and use H2-H6 for content structure');
    }
    if (breakdown.contentQuality < 80) {
      recommendations.push('Expand content to 1000-2000 words with valuable information');
    }
    if (breakdown.keywordOptimization < 80) {
      recommendations.push('Target keyword density of 0.5-2.5% for primary terms');
    }
    if (breakdown.internalLinks < 80) {
      recommendations.push('Add 3-10 internal links to related content');
    }
    if (breakdown.externalLinks < 80) {
      recommendations.push('Link to authoritative external sources for credibility');
    }

    return recommendations;
  }

  private getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Compare GEO and SEO scores
   */
  compareGEOSEO(geoScore: number, seoScore: number): GEOvsSEOScore {
    const gap = geoScore - seoScore;
    const absGap = Math.abs(gap);

    let recommendation: string;
    let strongerSide: 'geo' | 'seo' | 'balanced';

    if (absGap < 10) {
      strongerSide = 'balanced';
      recommendation = 'Your GEO and SEO are well balanced. Continue current strategy for both.';
    } else if (gap > 0) {
      strongerSide = 'geo';
      recommendation = `Your AI visibility (${geoScore}) significantly outpaces traditional SEO (${seoScore}). Focus on technical SEO improvements while maintaining GEO strengths.`;
    } else {
      strongerSide = 'seo';
      recommendation = `Your traditional SEO (${seoScore}) is stronger than AI visibility (${geoScore}). Invest in GEO-specific optimizations like FAQ content and citation building.`;
    }

    return {
      geoScore,
      seoScore,
      gap,
      recommendation,
      strongerSide,
    };
  }

  /**
   * Get combined score for a brand
   */
  async getBrandSEOScore(brandId: string): Promise<SEOScoreResult> {
    // For now, estimate from topic data - would need real page analysis for accurate scores
    const topics = await storage.getTopicsByBrand(brandId);

    // Simplified estimation based on content metrics
    const estimatedContentLength = topics.length * 500; // Rough estimate
    const estimatedLinks = Math.min(topics.length * 3, 30);

    return this.calculateSEOScore({
      titleTags: ['Brand Name - AI Visibility Report'],
      metaDescriptions: ['Comprehensive AI visibility analytics and optimization insights'],
      headings: [
        { level: 'h1', text: 'AI Visibility Dashboard' },
        { level: 'h2', text: 'Topic Performance' },
        { level: 'h2', text: 'Competitor Analysis' },
      ],
      contentLength: estimatedContentLength,
      keywordDensity: new Map([['AI visibility', 1.5], ['analytics', 0.8]]),
      internalLinks: estimatedLinks,
      externalLinks: 5,
      pageSpeed: 85,
      mobileFriendly: true,
    });
  }
}

// Singleton instance
let scorerInstance: SEOScorer | null = null;

export function getSEOScorer(): SEOScorer {
  if (!scorerInstance) {
    scorerInstance = new SEOScorer();
  }
  return scorerInstance;
}