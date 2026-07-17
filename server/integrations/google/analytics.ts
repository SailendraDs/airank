/**
 * Google Analytics 4 Integration
 * 
 * Access website analytics data
 * Docs: https://developers.google.com/analytics/devguides/reporting/data/v1
 */

export interface AnalyticsConfig {
  propertyId: string;
  credentials: {
    clientEmail: string;
    privateKey: string;
  };
}

export interface AnalyticsQuery {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  metrics: string[]; // e.g., ['activeUsers', 'sessions', 'pageviews']
  dimensions?: string[]; // e.g., ['country', 'city', 'deviceCategory']
  limit?: number;
}

export interface AnalyticsRow {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

export class AnalyticsClient {
  private config: AnalyticsConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private baseURL = 'https://analyticsdata.googleapis.com/v1beta';

  constructor(config: AnalyticsConfig) {
    this.config = config;
  }

  /**
   * Get an OAuth2 access token using a service-account JWT (RS256) exchanged at
   * Google's token endpoint. Uses only Node's built-in crypto (no extra deps).
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const { clientEmail, privateKey } = this.config.credentials;
    if (!clientEmail || !privateKey) {
      throw new Error('GA4 service-account credentials missing (clientEmail/privateKey).');
    }

    const { createSign } = await import('crypto');
    const now = Math.floor(Date.now() / 1000);
    const scope = 'https://www.googleapis.com/auth/analytics.readonly';
    const aud = 'https://oauth2.googleapis.com/token';

    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = { iss: clientEmail, scope, aud, iat: now, exp: now + 3600 };
    const b64 = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsigned = `${b64(header)}.${b64(claim)}`;

    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const signature = signer.sign(privateKey.replace(/\\n/g, '\n')).toString('base64url');
    const assertion = `${unsigned}.${signature}`;

    const resp = await fetch(aud, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });

    if (!resp.ok) {
      throw new Error(`GA4 token exchange failed: ${resp.status} ${await resp.text()}`);
    }

    const data = await resp.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + ((data.expires_in ?? 3600) - 60) * 1000;
    return this.accessToken as string;
  }

  /**
   * Run a report query
   */
  async runReport(query: AnalyticsQuery): Promise<AnalyticsRow[]> {
    const token = await this.getAccessToken();
    
    const response = await fetch(
      `${this.baseURL}/properties/${this.config.propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{
            startDate: query.startDate,
            endDate: query.endDate,
          }],
          metrics: query.metrics.map(name => ({ name })),
          dimensions: query.dimensions?.map(name => ({ name })) || [],
          limit: query.limit || 10000,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Analytics API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.rows || [];
  }

  /**
   * Get real-time data
   */
  async getRealtimeReport(metrics: string[], dimensions?: string[]): Promise<AnalyticsRow[]> {
    const token = await this.getAccessToken();
    
    const response = await fetch(
      `${this.baseURL}/properties/${this.config.propertyId}:runRealtimeReport`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metrics: metrics.map(name => ({ name })),
          dimensions: dimensions?.map(name => ({ name })) || [],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get realtime data: ${response.statusText}`);
    }

    const data = await response.json();
    return data.rows || [];
  }

  /**
   * Get top pages
   */
  async getTopPages(startDate: string, endDate: string, limit: number = 10): Promise<any[]> {
    return this.runReport({
      startDate,
      endDate,
      metrics: ['screenPageViews', 'activeUsers'],
      dimensions: ['pagePath', 'pageTitle'],
      limit,
    });
  }

  /**
   * Get traffic sources
   */
  async getTrafficSources(startDate: string, endDate: string): Promise<any[]> {
    return this.runReport({
      startDate,
      endDate,
      metrics: ['sessions', 'activeUsers'],
      dimensions: ['sessionSource', 'sessionMedium'],
      limit: 100,
    });
  }

  /**
   * Get user demographics
   */
  async getUserDemographics(startDate: string, endDate: string): Promise<any[]> {
    return this.runReport({
      startDate,
      endDate,
      metrics: ['activeUsers'],
      dimensions: ['country', 'city', 'deviceCategory'],
      limit: 100,
    });
  }

  /**
   * Real AI-assistant referral attribution. Queries sessions/conversions/revenue
   * by traffic source and landing page, then classifies sources that originate
   * from AI assistants (ChatGPT, Perplexity, Gemini, Claude, etc.).
   */
  async getAIReferralAttribution(startDate: string, endDate: string): Promise<{
    totalSessions: number;
    totalConversions: number;
    totalRevenue: number;
    byEngine: Record<string, { sessions: number; conversions: number; revenue: number }>;
    topLandingPages: Array<{ page: string; sessions: number; conversions: number }>;
  }> {
    const rows = await this.runReport({
      startDate,
      endDate,
      metrics: ['sessions', 'conversions', 'totalRevenue'],
      dimensions: ['sessionSource', 'landingPagePlusQueryString'],
      limit: 10000,
    });

    const byEngine: Record<string, { sessions: number; conversions: number; revenue: number }> = {};
    const pageMap = new Map<string, { sessions: number; conversions: number }>();
    let totalSessions = 0;
    let totalConversions = 0;
    let totalRevenue = 0;

    for (const row of rows) {
      const source = (row.dimensionValues?.[0]?.value || '').toLowerCase();
      const page = row.dimensionValues?.[1]?.value || '/';
      const engine = classifyAIEngine(source);
      if (!engine) continue;

      const sessions = parseFloat(row.metricValues?.[0]?.value || '0') || 0;
      const conversions = parseFloat(row.metricValues?.[1]?.value || '0') || 0;
      const revenue = parseFloat(row.metricValues?.[2]?.value || '0') || 0;

      totalSessions += sessions;
      totalConversions += conversions;
      totalRevenue += revenue;

      const e = byEngine[engine] || { sessions: 0, conversions: 0, revenue: 0 };
      e.sessions += sessions;
      e.conversions += conversions;
      e.revenue += revenue;
      byEngine[engine] = e;

      const p = pageMap.get(page) || { sessions: 0, conversions: 0 };
      p.sessions += sessions;
      p.conversions += conversions;
      pageMap.set(page, p);
    }

    const topLandingPages = Array.from(pageMap.entries())
      .map(([page, v]) => ({ page, ...v }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);

    return { totalSessions, totalConversions, totalRevenue, byEngine, topLandingPages };
  }
}

/** Map a GA4 sessionSource value to a known AI engine, or null if not AI traffic. */
export function classifyAIEngine(source: string): string | null {
  const s = source.toLowerCase();
  if (s.includes('chatgpt') || s.includes('openai')) return 'chatgpt';
  if (s.includes('perplexity')) return 'perplexity';
  if (s.includes('gemini') || s.includes('bard') || s.includes('google.com/search?udm=ai')) return 'gemini';
  if (s.includes('claude') || s.includes('anthropic')) return 'claude';
  if (s.includes('copilot') || s.includes('bing')) return 'copilot';
  if (s.includes('deepseek')) return 'deepseek';
  if (s.includes('grok') || s.includes('x.ai')) return 'grok';
  return null;
}

