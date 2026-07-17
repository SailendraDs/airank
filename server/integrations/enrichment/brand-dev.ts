// context.dev API integration for brand data enrichment

export interface BrandDevColor {
  hex: string;
  name: string;
}

export interface BrandDevLogo {
  url: string;
  mode: string;
  colors: BrandDevColor[];
  resolution: {
    width: number;
    height: number;
    aspect_ratio: number;
  };
  type: string;
}

export interface BrandDevAddress {
  city: string;
  country: string;
  country_code: string;
  state_province: string;
  state_code: string;
}

export interface BrandDevSocial {
  type: string;
  url: string;
}

export interface BrandDevIndustry {
  industry: string;
  subindustry: string;
}

export interface BrandDevResponse {
  status: string;
  brand: {
    domain: string;
    title: string;
    description: string;
    slogan?: string;
    colors: BrandDevColor[];
    logos: BrandDevLogo[];
    backdrops?: any[];
    address: BrandDevAddress;
    socials: BrandDevSocial[];
    email?: string;
    is_nsfw: boolean;
    industries: {
      eic: BrandDevIndustry[];
    };
    links: {
      contact?: string | null;
      careers?: string | null;
      terms?: string | null;
      privacy?: string | null;
      blog?: string | null;
      login?: string | null;
      signup?: string | null;
      pricing?: string | null;
    };
  };
  code: number;
}

export class BrandDevClient {
  private apiKey: string;
  private baseURL: string = 'https://api.context.dev/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getBrandInfo(domain: string): Promise<BrandDevResponse | null> {
    try {
      const response = await fetch(`${this.baseURL}/brand/retrieve?domain=${encodeURIComponent(domain)}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 404) {
        return null; // Brand not found
      }

      if (!response.ok) {
        let detail = '';
        try {
          const errBody = await response.json();
          const message = typeof errBody?.message === 'string' ? errBody.message : '';
          const code = typeof errBody?.error_code === 'string' ? errBody.error_code : '';
          detail = [message, code].filter(Boolean).join(' | ');
        } catch {
          // Fall back to status text when body isn't valid JSON.
        }

        throw new Error(
          `context.dev API error (${response.status}${response.statusText ? ` ${response.statusText}` : ''})${detail ? `: ${detail}` : ''}`
        );
      }

      const data: BrandDevResponse = await response.json();
      return data;
    } catch (error: any) {
      console.error(`context.dev fetch failed for ${domain}:`, error.message);
      throw error;
    }
  }

  async searchBrands(query: string, limit: number = 10): Promise<BrandDevResponse[]> {
    try {
      const response = await fetch(
        `${this.baseURL}/brands/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        let detail = '';
        try {
          const errBody = await response.json();
          const message = typeof errBody?.message === 'string' ? errBody.message : '';
          const code = typeof errBody?.error_code === 'string' ? errBody.error_code : '';
          detail = [message, code].filter(Boolean).join(' | ');
        } catch {
          // Fall back to status text when body isn't valid JSON.
        }

        throw new Error(
          `context.dev search error (${response.status}${response.statusText ? ` ${response.statusText}` : ''})${detail ? `: ${detail}` : ''}`
        );
      }

      const data = await response.json();
      return data.results || [];
    } catch (error: any) {
      console.error(`context.dev search failed for "${query}":`, error.message);
      throw error;
    }
  }
}

// Backwards-compatible alias while we migrate naming.
export class ContextDevClient extends BrandDevClient {}
