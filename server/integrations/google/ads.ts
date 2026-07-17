/**
 * Google Ads Integration
 * 
 * Access campaign performance, keywords, and ad data
 * Docs: https://developers.google.com/google-ads/api/docs/start
 */

export interface GoogleAdsConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
}

export interface CampaignPerformance {
  campaignId: string;
  campaignName: string;
  status: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  averageCpc: number;
}

export interface KeywordPerformance {
  keywordId: string;
  keywordText: string;
  matchType: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  qualityScore: number;
}

export class GoogleAdsClient {
  private config: GoogleAdsConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private baseURL = 'https://googleads.googleapis.com/v15';

  constructor(config: GoogleAdsConfig) {
    this.config = config;
  }

  /**
   * Get OAuth2 access token
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    
    return this.accessToken!;
  }

  /**
   * Execute a Google Ads Query Language (GAQL) query
   */
  async query(gaql: string): Promise<any[]> {
    const token = await this.getAccessToken();
    
    const response = await fetch(
      `${this.baseURL}/customers/${this.config.customerId}/googleAds:search`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'developer-token': this.config.developerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: gaql }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Ads API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.results || [];
  }

  /**
   * Get campaign performance
   */
  async getCampaignPerformance(startDate: string, endDate: string): Promise<CampaignPerformance[]> {
    const gaql = `
      SELECT 
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      ORDER BY metrics.impressions DESC
    `;

    const results = await this.query(gaql);
    
    return results.map((row: any) => ({
      campaignId: row.campaign.id,
      campaignName: row.campaign.name,
      status: row.campaign.status,
      impressions: row.metrics.impressions || 0,
      clicks: row.metrics.clicks || 0,
      cost: (row.metrics.costMicros || 0) / 1_000_000,
      conversions: row.metrics.conversions || 0,
      ctr: row.metrics.ctr || 0,
      averageCpc: (row.metrics.averageCpc || 0) / 1_000_000,
    }));
  }

  /**
   * Get keyword performance
   */
  async getKeywordPerformance(startDate: string, endDate: string): Promise<KeywordPerformance[]> {
    const gaql = `
      SELECT 
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.quality_info.quality_score,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM keyword_view
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
        AND ad_group_criterion.type = 'KEYWORD'
      ORDER BY metrics.impressions DESC
      LIMIT 100
    `;

    const results = await this.query(gaql);
    
    return results.map((row: any) => ({
      keywordId: row.adGroupCriterion?.criterionId || '',
      keywordText: row.adGroupCriterion?.keyword?.text || '',
      matchType: row.adGroupCriterion?.keyword?.matchType || '',
      impressions: row.metrics?.impressions || 0,
      clicks: row.metrics?.clicks || 0,
      cost: (row.metrics?.costMicros || 0) / 1_000_000,
      conversions: row.metrics?.conversions || 0,
      qualityScore: row.adGroupCriterion?.qualityInfo?.qualityScore || 0,
    }));
  }
}

