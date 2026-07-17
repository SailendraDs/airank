// DataForSEO API integration for SERP data

export interface SERPResult {
  position: number;
  title: string;
  url: string;
  domain: string;
  description?: string;
  type: 'organic' | 'featured_snippet' | 'people_also_ask' | 'related_searches';
}

export interface SERPResponse {
  query: string;
  totalResults: number;
  results: SERPResult[];
  relatedSearches?: string[];
  peopleAlsoAsk?: Array<{ question: string; answer: string; url?: string }>;
}

export class DataForSEOClient {
  private login: string;
  private password: string;
  private baseURL: string = 'https://api.dataforseo.com/v3';

  constructor(login: string, password: string) {
    this.login = login;
    this.password = password;
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${this.login}:${this.password}`).toString('base64');
  }

  async searchGoogle(query: string, location: string = 'United States', limit: number = 10): Promise<SERPResponse> {
    try {
      const response = await fetch(`${this.baseURL}/serp/google/organic/live/advanced`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          {
            keyword: query,
            location_name: location,
            language_code: 'en',
            device: 'desktop',
            os: 'windows',
            depth: limit,
          },
        ]),
      });

      if (!response.ok) {
        throw new Error(`DataForSEO API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status_code !== 20000) {
        throw new Error(`DataForSEO error: ${data.status_message}`);
      }

      const task = data.tasks[0];
      const result = task.result[0];

      const organicResults: SERPResult[] = (result.items || [])
        .filter((item: any) => item.type === 'organic')
        .map((item: any, index: number) => ({
          position: item.rank_absolute || index + 1,
          title: item.title,
          url: item.url,
          domain: item.domain,
          description: item.description,
          type: 'organic',
        }));

      const relatedSearches = (result.items || [])
        .filter((item: any) => item.type === 'related_searches')
        .flatMap((item: any) => item.items?.map((i: any) => i.title) || []);

      const peopleAlsoAsk = (result.items || [])
        .filter((item: any) => item.type === 'people_also_ask')
        .flatMap((item: any) =>
          (item.items || []).map((i: any) => ({
            question: i.title,
            answer: i.expanded_element?.[0]?.description || '',
            url: i.url,
          }))
        );

      return {
        query,
        totalResults: result.se_results_count || 0,
        results: organicResults,
        relatedSearches,
        peopleAlsoAsk,
      };
    } catch (error: any) {
      console.error(`DataForSEO search failed for "${query}":`, error.message);
      throw error;
    }
  }

  async getDomainAuthority(domain: string): Promise<number> {
    // Simplified - would need actual domain metrics API
    // For now, return a placeholder
    return 50;
  }
}
