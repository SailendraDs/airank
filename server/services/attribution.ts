// Attribution Service (Epic E)
// Replaces simulated attribution numbers with real GA4 data. When a Google
// Analytics integration is connected for a brand, we query AI-assistant referral
// sessions/conversions/revenue and persist an attribution snapshot. When GA4 is
// not connected, we return honest zeros (no fabricated conversions) alongside any
// real crawler-log referral counts.

import { storage } from '../storage';
import { AnalyticsClient, type AnalyticsConfig } from '../integrations/google/analytics';
import { SearchConsoleClient } from '../integrations/google/search-console';

export interface AttributionResult {
  brandId: string;
  period: string;
  source: 'ga4' | 'crawler' | 'combined' | 'manual_evidence';
  dataComplete: boolean;
  aiReferralSessions: number;
  aiReferralConversions: number;
  aiAttributedRevenue: number;
  brandedImpressions: number;
  brandedClicks: number;
  byEngine: Record<string, { sessions: number; conversions: number; revenue: number }>;
  topLandingPages: Array<{ page: string; sessions: number; conversions: number }>;
  generatedAt: Date;
  message?: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build a GA4 client from a brand's connected integration, if configured. */
async function getGA4Client(brandId: string): Promise<AnalyticsClient | null> {
  const integrations = await storage.getIntegrationsByBrand(brandId);
  const ga = integrations.find(
    (i) => (i.platform === 'google_analytics' || i.platform === 'ga4') && i.status === 'connected',
  );
  if (!ga) return null;

  const creds = (ga.credentials || {}) as any;
  const propertyId = creds.propertyId || ga.accountId;
  const clientEmail = creds.clientEmail;
  const privateKey = creds.privateKey;
  if (!propertyId || !clientEmail || !privateKey) return null;

  const config: AnalyticsConfig = {
    propertyId: String(propertyId),
    credentials: { clientEmail: String(clientEmail), privateKey: String(privateKey) },
  };
  return new AnalyticsClient(config);
}

async function getGSCClient(brandId: string): Promise<SearchConsoleClient | null> {
  const integrations = await storage.getIntegrationsByBrand(brandId);
  const gsc = integrations.find(
    (i) => (i.platform === 'google_search_console' || i.platform === 'gsc') && i.status === 'connected',
  );
  if (!gsc) return null;
  const creds = (gsc.credentials || {}) as any;
  if (!creds.siteUrl || !creds.clientEmail || !creds.privateKey) return null;
  try {
    return new SearchConsoleClient({
      siteUrl: String(creds.siteUrl),
      clientEmail: String(creds.clientEmail),
      privateKey: String(creds.privateKey),
    });
  } catch {
    return null;
  }
}

/** Compute real attribution for a brand over the given period (days). */
export async function computeAttribution(brandId: string, periodDays = 30, persist = true): Promise<AttributionResult> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - periodDays);

  const base: AttributionResult = {
    brandId,
    period: `last ${periodDays} days`,
    source: 'crawler',
    dataComplete: false,
    aiReferralSessions: 0,
    aiReferralConversions: 0,
    aiAttributedRevenue: 0,
    brandedImpressions: 0,
    brandedClicks: 0,
    byEngine: {},
    topLandingPages: [],
    generatedAt: new Date(),
  };

  const ga4 = await getGA4Client(brandId);

  if (!ga4) {
    const manual = (await storage.getAttributionSnapshotsByBrand(brandId, 20))
      .find((snapshot: any) => snapshot.source === 'manual_evidence' && snapshot.dataComplete);
    if (manual) {
      return {
        brandId,
        period: `manual evidence through ${ymd(new Date(manual.periodEnd))}`,
        source: 'manual_evidence',
        dataComplete: true,
        aiReferralSessions: Number(manual.aiReferralSessions || 0),
        aiReferralConversions: Number(manual.aiReferralConversions || 0),
        aiAttributedRevenue: Number(manual.aiAttributedRevenue || 0),
        brandedImpressions: Number(manual.brandedImpressions || 0),
        brandedClicks: Number(manual.brandedClicks || 0),
        byEngine: (manual.byEngine || {}) as any,
        topLandingPages: Array.isArray(manual.topLandingPages) ? manual.topLandingPages as any : [],
        generatedAt: new Date(),
        message: 'Using manually recorded attribution evidence. Connect GA4 service credentials to automate this proof.',
      };
    }
    base.message = 'Connect Google Analytics 4 to see real AI-referral conversions and revenue.';
    if (persist) await persistSnapshot(brandId, start, end, base);
    return base;
  }

  try {
    const attr = await ga4.getAIReferralAttribution(ymd(start), ymd(end));
    base.source = 'ga4';
    base.dataComplete = true;
    base.aiReferralSessions = Math.round(attr.totalSessions);
    base.aiReferralConversions = Math.round(attr.totalConversions);
    base.aiAttributedRevenue = Math.round(attr.totalRevenue * 100) / 100;
    base.byEngine = attr.byEngine;
    base.topLandingPages = attr.topLandingPages;
  } catch (err: any) {
    base.message = `GA4 query failed: ${err?.message || err}`;
    base.dataComplete = false;
  }

  // Optional GSC enrichment for branded search visibility.
  const gsc = await getGSCClient(brandId);
  if (gsc) {
    try {
      const brand = await storage.getBrand(brandId);
      const rows = await gsc.querySearchAnalytics({
        startDate: ymd(start),
        endDate: ymd(end),
        dimensions: ['query'],
        rowLimit: 1000,
      });
      if (Array.isArray(rows) && brand?.name) {
        const brandLc = brand.name.toLowerCase();
        for (const r of rows) {
          const q = (r.keys?.[0] || '').toLowerCase();
          if (q.includes(brandLc)) {
            base.brandedImpressions += Math.round(r.impressions || 0);
            base.brandedClicks += Math.round(r.clicks || 0);
          }
        }
        if (base.source === 'ga4') base.source = 'combined';
      }
    } catch {
      // GSC is best-effort enrichment; ignore failures.
    }
  }

  if (persist) await persistSnapshot(brandId, start, end, base);
  return base;
}

async function persistSnapshot(brandId: string, start: Date, end: Date, r: AttributionResult): Promise<void> {
  try {
    await storage.createAttributionSnapshot({
      brandId,
      periodStart: start,
      periodEnd: end,
      source: r.source,
      aiReferralSessions: r.aiReferralSessions,
      aiReferralConversions: r.aiReferralConversions,
      aiAttributedRevenue: r.aiAttributedRevenue,
      brandedImpressions: r.brandedImpressions,
      brandedClicks: r.brandedClicks,
      byEngine: r.byEngine as any,
      topLandingPages: r.topLandingPages as any,
      dataComplete: r.dataComplete,
    } as any);
  } catch (err: any) {
    console.error('[Attribution] Failed to persist snapshot:', err?.message || err);
  }
}
