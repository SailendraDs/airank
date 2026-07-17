/**
 * Google Search Console Integration
 * 
 * Provides access to search performance data, indexing status, and more
 * Docs: https://developers.google.com/webmaster-tools/v1/api_reference_index
 */

export interface SearchConsoleConfig {
  clientEmail: string;
  privateKey: string;
  siteUrl: string;
}

export interface SearchAnalyticsQuery {
  startDate: string; // YYYY-MM-DD
  endDate: string;
  dimensions?: ('query' | 'page' | 'country' | 'device' | 'searchAppearance')[];
  rowLimit?: number;
  startRow?: number;
}

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export class SearchConsoleClient {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private config: SearchConsoleConfig;

  constructor(config: SearchConsoleConfig) {
    this.config = config;
  }

  /**
   * Get OAuth2 access token using service account
   */
  private async getAccessToken(): Promise<string> {
    // Check if token is still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Create JWT for service account authentication
    const jwt = await this.createJWT();
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min early
    
    return this.accessToken!;
  }

  /**
   * Create a signed service-account JWT (RS256) using Node's built-in crypto.
   */
  private async createJWT(): Promise<string> {
    const { clientEmail, privateKey } = this.config;
    if (!clientEmail || !privateKey) {
      throw new Error('GSC service-account credentials missing (clientEmail/privateKey).');
    }

    const { createSign } = await import('crypto');
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const b64 = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsigned = `${b64(header)}.${b64(payload)}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const signature = signer.sign(privateKey.replace(/\\n/g, '\n')).toString('base64url');
    return `${unsigned}.${signature}`;
  }

  /**
   * Query search analytics data
   */
  async querySearchAnalytics(query: SearchAnalyticsQuery): Promise<SearchAnalyticsRow[]> {
    const token = await this.getAccessToken();
    
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.config.siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: query.startDate,
          endDate: query.endDate,
          dimensions: query.dimensions || ['query'],
          rowLimit: query.rowLimit || 1000,
          startRow: query.startRow || 0,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Search Console API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.rows || [];
  }

  /**
   * Get site indexing status
   */
  async getSiteIndexingStatus(): Promise<any> {
    const token = await this.getAccessToken();
    
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(this.config.siteUrl)}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get site status: ${response.statusText}`);
    }

    return await response.json();
  }
}

