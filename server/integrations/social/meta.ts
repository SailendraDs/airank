/**
 * Meta (Facebook/Instagram) Graph API Integration
 * 
 * Track page performance, posts, and insights across Facebook and Instagram
 * Docs: https://developers.facebook.com/docs/graph-api
 */

export interface MetaConfig {
  accessToken: string;
  pageId?: string;
  instagramAccountId?: string;
}

export interface FacebookPost {
  id: string;
  message: string;
  createdTime: string;
  permalink_url: string;
  insights?: {
    impressions: number;
    reach: number;
    engagement: number;
  };
}

export interface InstagramPost {
  id: string;
  caption: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  mediaUrl: string;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
}

export interface PageInsights {
  pageViews: number;
  pageEngagement: number;
  pageFans: number;
  pageImpressions: number;
  reach: number;
}

export class MetaClient {
  private config: MetaConfig;
  private baseURL = 'https://graph.facebook.com/v18.0';

  constructor(config: MetaConfig) {
    this.config = config;
  }

  /**
   * Get Facebook page information
   */
  async getPage(pageId?: string): Promise<any> {
    const id = pageId || this.config.pageId;
    if (!id) {
      throw new Error('Page ID is required');
    }

    const params = new URLSearchParams({
      fields: 'id,name,about,category,fan_count,followers_count,website',
      access_token: this.config.accessToken,
    });

    const response = await fetch(`${this.baseURL}/${id}?${params}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Meta API error: ${error.error?.message || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get Facebook page posts
   */
  async getPagePosts(pageId?: string, limit: number = 50): Promise<FacebookPost[]> {
    const id = pageId || this.config.pageId;
    if (!id) {
      throw new Error('Page ID is required');
    }

    const params = new URLSearchParams({
      fields: 'id,message,created_time,permalink_url,insights.metric(post_impressions,post_engaged_users)',
      limit: limit.toString(),
      access_token: this.config.accessToken,
    });

    const response = await fetch(`${this.baseURL}/${id}/posts?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get posts: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Get page insights
   */
  async getPageInsights(pageId?: string, period: 'day' | 'week' | 'days_28' = 'day'): Promise<PageInsights> {
    const id = pageId || this.config.pageId;
    if (!id) {
      throw new Error('Page ID is required');
    }

    const metrics = [
      'page_views_total',
      'page_post_engagements',
      'page_fans',
      'page_impressions',
      'page_impressions_unique',
    ].join(',');

    const params = new URLSearchParams({
      metric: metrics,
      period,
      access_token: this.config.accessToken,
    });

    const response = await fetch(`${this.baseURL}/${id}/insights?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get insights: ${response.statusText}`);
    }

    const data = await response.json();
    const insights = data.data || [];

    return {
      pageViews: insights.find((i: any) => i.name === 'page_views_total')?.values?.[0]?.value || 0,
      pageEngagement: insights.find((i: any) => i.name === 'page_post_engagements')?.values?.[0]?.value || 0,
      pageFans: insights.find((i: any) => i.name === 'page_fans')?.values?.[0]?.value || 0,
      pageImpressions: insights.find((i: any) => i.name === 'page_impressions')?.values?.[0]?.value || 0,
      reach: insights.find((i: any) => i.name === 'page_impressions_unique')?.values?.[0]?.value || 0,
    };
  }

  /**
   * Get Instagram account media
   */
  async getInstagramMedia(accountId?: string, limit: number = 50): Promise<InstagramPost[]> {
    const id = accountId || this.config.instagramAccountId;
    if (!id) {
      throw new Error('Instagram account ID is required');
    }

    const params = new URLSearchParams({
      fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
      limit: limit.toString(),
      access_token: this.config.accessToken,
    });

    const response = await fetch(`${this.baseURL}/${id}/media?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get Instagram media: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Get Instagram insights
   */
  async getInstagramInsights(accountId?: string): Promise<any> {
    const id = accountId || this.config.instagramAccountId;
    if (!id) {
      throw new Error('Instagram account ID is required');
    }

    const metrics = 'follower_count,impressions,reach,profile_views';
    const params = new URLSearchParams({
      metric: metrics,
      period: 'day',
      access_token: this.config.accessToken,
    });

    const response = await fetch(`${this.baseURL}/${id}/insights?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get Instagram insights: ${response.statusText}`);
    }

    return await response.json();
  }
}

