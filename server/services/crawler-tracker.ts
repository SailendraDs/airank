// Crawler Tracker - Track AI crawler visits and attribute them to conversions
// Measures AI → business impact

import { storage } from '../storage';

export type CrawlerType = 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'deepseek' | 'other';

export interface CrawlerVisit {
  id?: string;
  brandId: string;
  crawlerType: CrawlerType;
  timestamp: Date;
  pagesCrawled: string[];
  dataShared: string[];
  sourceUrl?: string;
}

export interface CrawlerStats {
  totalVisits: number;
  byCrawler: Record<CrawlerType, number>;
  lastVisit: Date | null;
  topPages: Array<{ url: string; count: number }>;
}

export interface AttributionLink {
  aiMention: string;
  source: string;
  conversionEvent: string;
  conversionValue: number;
  daysToConvert: number;
}

export interface AttributionReport {
  brandId: string;
  period: string;
  totalReferrals: number;
  totalConversions: number;
  attributedRevenue: number;
  topSources: Array<{ source: string; referrals: number; conversions: number }>;
  crawlerBreakdown: Record<CrawlerType, { referrals: number; conversions: number }>;
  generatedAt: Date;
}

export class CrawlerTracker {
  /**
   * Track a crawler visit
   */
  async trackVisit(visit: CrawlerVisit): Promise<void> {
    // Persist to the real crawler_logs table (Epic B). One row per crawled page,
    // or a single row when no specific pages are supplied.
    const engineForType: Record<CrawlerType, string> = {
      chatgpt: 'chatgpt', claude: 'claude', gemini: 'gemini', perplexity: 'perplexity', deepseek: 'deepseek', other: 'other',
    };
    const pages = visit.pagesCrawled?.length ? visit.pagesCrawled : [visit.sourceUrl || '/'];
    const rows = pages.map((path) => ({
      brandId: visit.brandId,
      botName: visit.crawlerType,
      botCategory: 'other' as const,
      engine: engineForType[visit.crawlerType] || 'other',
      verified: false,
      path,
      visitedAt: visit.timestamp || new Date(),
    }));
    await storage.createCrawlerLogs(rows as any);
  }

  /**
   * Get crawler statistics for a brand from the crawler_logs table.
   */
  async getCrawlerStats(brandId: string, sinceDays = 30): Promise<CrawlerStats & { verifiedVisits: number; byBot: Record<string, number> }> {
    const summary = await storage.getCrawlerStatsSummary(brandId, sinceDays);
    const byCrawler: Record<CrawlerType, number> = {
      chatgpt: 0, claude: 0, gemini: 0, perplexity: 0, deepseek: 0, other: 0,
    };
    for (const [engine, count] of Object.entries(summary.byEngine)) {
      const key = (engine as CrawlerType) in byCrawler ? (engine as CrawlerType) : 'other';
      byCrawler[key] += count;
    }

    return {
      totalVisits: summary.totalVisits,
      byCrawler,
      lastVisit: summary.lastVisit,
      topPages: summary.topPages,
      verifiedVisits: summary.verifiedVisits,
      byBot: summary.byBot,
    };
  }

  /**
   * Analyze attribution using REAL data. Conversions/revenue come from a connected
   * GA4 integration (Epic E); crawler logs provide real referral/visit counts. No
   * values are simulated — when GA4 is not connected, conversions/revenue are 0 and
   * the report carries a `message` prompting the user to connect analytics.
   */
  async analyzeAttribution(brandId: string, periodDays = 30): Promise<AttributionReport & { message?: string; dataComplete: boolean }> {
    const crawlerSummary = await storage.getCrawlerAttributionSummary(brandId, periodDays, 5);

    // Real referral counts from crawler logs.
    const topSources = new Map<string, { referrals: number; conversions: number }>();
    const crawlerBreakdown: Record<CrawlerType, { referrals: number; conversions: number }> = {
      chatgpt: { referrals: 0, conversions: 0 },
      claude: { referrals: 0, conversions: 0 },
      gemini: { referrals: 0, conversions: 0 },
      perplexity: { referrals: 0, conversions: 0 },
      deepseek: { referrals: 0, conversions: 0 },
      other: { referrals: 0, conversions: 0 },
    };

    for (const [engine, referrals] of Object.entries(crawlerSummary.byEngine)) {
      const key = (engine as CrawlerType) in crawlerBreakdown ? (engine as CrawlerType) : 'other';
      crawlerBreakdown[key].referrals += referrals;
    }
    for (const source of crawlerSummary.topSources) {
      topSources.set(source.source, { referrals: source.referrals, conversions: 0 });
    }

    // Real conversions/revenue from GA4 (Epic E).
    const { computeAttribution } = await import('./attribution');
    const ga = await computeAttribution(brandId, periodDays, true);

    // Distribute GA4 conversions across crawler engines by referral share for display.
    if (ga.dataComplete) {
      for (const [engine, data] of Object.entries(ga.byEngine)) {
        const key = (engine as CrawlerType) in crawlerBreakdown ? (engine as CrawlerType) : 'other';
        crawlerBreakdown[key].conversions += Math.round(data.conversions);
      }
      for (const page of ga.topLandingPages || []) {
        const source = String((page as any).page || (page as any).url || '/');
        const existing = topSources.get(source) || { referrals: 0, conversions: 0 };
        existing.referrals += Math.round(Number((page as any).sessions || 0));
        existing.conversions += Math.round(Number((page as any).conversions || 0));
        topSources.set(source, existing);
      }
    }

    return {
      brandId,
      period: `last ${periodDays} days`,
      totalReferrals: Math.max(crawlerSummary.totalReferrals, ga.aiReferralSessions),
      totalConversions: ga.aiReferralConversions,
      attributedRevenue: ga.aiAttributedRevenue,
      topSources: Array.from(topSources.entries())
        .map(([source, data]) => ({ source, ...data }))
        .sort((a, b) => b.referrals - a.referrals)
        .slice(0, 5),
      crawlerBreakdown,
      generatedAt: new Date(),
      dataComplete: ga.dataComplete,
      message: ga.message,
    };
  }

  /**
   * Detect crawler from user agent string
   */
  detectCrawler(userAgent: string): CrawlerType {
    const ua = userAgent.toLowerCase();

    if (ua.includes('chatgpt') || ua.includes('gpt')) return 'chatgpt';
    if (ua.includes('claude')) return 'claude';
    if (ua.includes('gemini') || ua.includes('google')) return 'gemini';
    if (ua.includes('perplexity')) return 'perplexity';
    if (ua.includes('deepseek')) return 'deepseek';

    return 'other';
  }

  /**
   * Get attribution summary for dashboard
   */
  async getAttributionSummary(brandId: string): Promise<{
    totalReferrals: number;
    conversions: number;
    revenue: number;
    topCrawler: CrawlerType;
  }> {
    const report = await this.analyzeAttribution(brandId, 30);

    let topCrawler: CrawlerType = 'other';
    let maxReferrals = 0;

    for (const [crawler, data] of Object.entries(report.crawlerBreakdown)) {
      if (data.referrals > maxReferrals) {
        maxReferrals = data.referrals;
        topCrawler = crawler as CrawlerType;
      }
    }

    return {
      totalReferrals: report.totalReferrals,
      conversions: report.totalConversions,
      revenue: report.attributedRevenue,
      topCrawler,
    };
  }
}

// Singleton instance
let trackerInstance: CrawlerTracker | null = null;

export function getCrawlerTracker(): CrawlerTracker {
  if (!trackerInstance) {
    trackerInstance = new CrawlerTracker();
  }
  return trackerInstance;
}
