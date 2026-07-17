// Google Knowledge Graph API integration

export interface KnowledgeGraphEntity {
  id: string;
  name: string;
  description?: string;
  detailedDescription?: {
    articleBody: string;
    url: string;
    license: string;
  };
  image?: {
    contentUrl: string;
    url: string;
  };
  types?: string[];
  url?: string;
  // Extended fields from richer response
  foundingDate?: string;
  foundingLocation?: string;
  headquarters?: string;
  numberOfEmployees?: string;
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
    youtube?: string;
  };
  subOrganizations?: string[];
  parentOrganization?: string;
  sameAs?: string[];
}

export class KnowledgeGraphClient {
  private apiKey: string | null;
  private baseURL: string = 'https://kgsearch.googleapis.com/v1/entities:search';

  constructor(apiKey: string | null) {
    this.apiKey = apiKey;
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async getBrandEntity(brandName: string): Promise<KnowledgeGraphEntity | null> {
    if (!this.isConfigured) {
      console.warn('[KnowledgeGraph] GOOGLE_KG_API_KEY not set — skipping');
      return null;
    }
    return this.searchEntities(brandName, ['Organization', 'Corporation', 'Brand'], 1)
      .then(r => r[0] ?? null)
      .catch(err => {
        console.error('[KnowledgeGraph] getBrandEntity failed:', err);
        return null;
      });
  }

  async getBrandEntityById(kgId: string): Promise<KnowledgeGraphEntity | null> {
    if (!this.isConfigured) {
      console.warn('[KnowledgeGraph] GOOGLE_KG_API_KEY not set — skipping');
      return null;
    }
    return this.getEntityById(kgId).catch(err => {
      console.error('[KnowledgeGraph] getBrandEntityById failed:', err);
      return null;
    });
  }

  async getEntityById(kgId: string): Promise<KnowledgeGraphEntity | null> {
    if (!this.apiKey) return null;
    try {
      const params = new URLSearchParams({
        ids: kgId,
        key: this.apiKey,
      });

      const response = await fetch(`${this.baseURL}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Knowledge Graph API error: ${response.statusText}`);
      }

      const data = await response.json();
      const item = (data.itemListElement || [])[0];

      if (!item?.result) return null;

      return this.mapEntity(item.result, item.result);
    } catch (error: any) {
      console.error(`Knowledge Graph getEntityById failed for "${kgId}":`, error.message);
      throw error;
    }
  }

  async searchEntities(query: string, types?: string[], limit: number = 10): Promise<KnowledgeGraphEntity[]> {
    if (!this.apiKey) return [];
    try {
      const params = new URLSearchParams({
        query,
        key: this.apiKey,
        limit: limit.toString(),
      });

      if (types && types.length > 0) {
        params.append('types', types.join(','));
      }

      const response = await fetch(`${this.baseURL}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Knowledge Graph API error: ${response.statusText}`);
      }

      const data = await response.json();

      return (data.itemListElement || []).map((item: any) =>
        this.mapEntity(item.result, item.result)
      );
    } catch (error: any) {
      console.error(`Knowledge Graph search failed for "${query}":`, error.message);
      throw error;
    }
  }

  /**
   * Map raw KG API result to KnowledgeGraphEntity with extended fields
   */
  private mapEntity(result: any, detailResult: any): KnowledgeGraphEntity {
    const properties = result.properties || {};

    // Extract social links from sameAs and properties
    const sameAs: string[] = result.sameAs || [];
    const socialLinks: KnowledgeGraphEntity['socialLinks'] = {};

    sameAs.forEach((url: string) => {
      if (url.includes('linkedin.com')) socialLinks.linkedin = url;
      else if (url.includes('twitter.com') || url.includes('x.com')) socialLinks.twitter = url;
      else if (url.includes('facebook.com')) socialLinks.facebook = url;
      else if (url.includes('instagram.com')) socialLinks.instagram = url;
      else if (url.includes('youtube.com')) socialLinks.youtube = url;
    });

    // Extract structured properties from KG
    const extractProperty = (key: string): string | undefined => {
      if (properties[key]?.values?.[0]?.snippet) {
        return properties[key].values[0].snippet;
      }
      if (properties[key]?.values?.[0]?.description) {
        return properties[key].values[0].description;
      }
      return undefined;
    };

    // Handle numberOfEmployees (can be a TextValue or NumberValue)
    let numberOfEmployees: string | undefined;
    if (properties.numberOfEmployees?.values?.[0]?.number) {
      numberOfEmployees = properties.numberOfEmployees.values[0].number.toString();
    } else if (properties.numberOfEmployees?.values?.[0]?.extensions?.numberOfEmployees) {
      numberOfEmployees = properties.numberOfEmployees.values[0].extensions.numberOfEmployees.toString();
    } else {
      numberOfEmployees = extractProperty('numberOfEmployees');
    }

    return {
      id: result['@id'],
      name: result.name,
      description: result.description,
      detailedDescription: result.detailedDescription,
      image: result.image,
      types: Array.isArray(result['@type']) ? result['@type'] : [result['@type']].filter(Boolean),
      url: result.url,
      foundingDate: extractProperty('foundingDate') || extractProperty('foundingDate'),
      foundingLocation: extractProperty('foundingLocation') || extractProperty('locationFounded'),
      headquarters: extractProperty('headquarters') || extractProperty('address') || extractProperty('location'),
      numberOfEmployees,
      socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
      subOrganizations: properties.subOrganization?.values?.map((v: any) => v.name).filter(Boolean),
      parentOrganization: extractProperty('parentOrganization') || extractProperty('parent'),
      sameAs,
    };
  }

  /**
   * Get structured KG data for storage in brand record
   */
  toKgData(entity: KnowledgeGraphEntity): Record<string, any> {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      detailedDescription: entity.detailedDescription?.articleBody,
      imageUrl: entity.image?.contentUrl || entity.image?.url,
      types: entity.types,
      url: entity.url,
      foundingDate: entity.foundingDate,
      foundingLocation: entity.foundingLocation,
      headquarters: entity.headquarters,
      numberOfEmployees: entity.numberOfEmployees,
      socialLinks: entity.socialLinks,
      subOrganizations: entity.subOrganizations,
      parentOrganization: entity.parentOrganization,
      sameAs: entity.sameAs,
      enrichedAt: new Date().toISOString(),
    };
  }
}

export function createKnowledgeGraphClient(): KnowledgeGraphClient {
  return new KnowledgeGraphClient(process.env.GOOGLE_KG_API_KEY ?? null);
}
