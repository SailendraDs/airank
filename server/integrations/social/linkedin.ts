/**
 * LinkedIn API Integration
 * 
 * Track company page performance, posts, and engagement
 * Docs: https://learn.microsoft.com/en-us/linkedin/
 */

export interface LinkedInConfig {
  accessToken: string;
  organizationId?: string;
}

export interface LinkedInPost {
  id: string;
  author: string;
  text: string;
  createdAt: number;
  visibility: string;
  commentary?: string;
  totalShareStatistics: {
    shareCount: number;
    likeCount: number;
    commentCount: number;
    impressionCount: number;
    clickCount: number;
  };
}

export interface LinkedInOrganization {
  id: string;
  name: string;
  description: string;
  websiteUrl: string;
  industry: string;
  followerCount: number;
  staffCount: number;
}

export class LinkedInClient {
  private config: LinkedInConfig;
  private baseURL = 'https://api.linkedin.com/v2';

  constructor(config: LinkedInConfig) {
    this.config = config;
  }

  /**
   * Get organization information
   */
  async getOrganization(organizationId?: string): Promise<LinkedInOrganization> {
    const orgId = organizationId || this.config.organizationId;
    if (!orgId) {
      throw new Error('Organization ID is required');
    }

    const response = await fetch(
      `${this.baseURL}/organizations/${orgId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`LinkedIn API error: ${error.message || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get organization posts (shares)
   */
  async getOrganizationPosts(organizationId?: string, count: number = 50): Promise<LinkedInPost[]> {
    const orgId = organizationId || this.config.organizationId;
    if (!orgId) {
      throw new Error('Organization ID is required');
    }

    const params = new URLSearchParams({
      q: 'author',
      author: `urn:li:organization:${orgId}`,
      count: count.toString(),
    });

    const response = await fetch(
      `${this.baseURL}/shares?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get posts: ${response.statusText}`);
    }

    const data = await response.json();
    return data.elements || [];
  }

  /**
   * Get post statistics
   */
  async getPostStatistics(postId: string): Promise<any> {
    const response = await fetch(
      `${this.baseURL}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${postId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get statistics: ${response.statusText}`);
    }

    const data = await response.json();
    return data.elements?.[0] || {};
  }

  /**
   * Get follower statistics
   */
  async getFollowerStatistics(organizationId?: string): Promise<{
    totalFollowers: number;
    organicFollowerGain: number;
    paidFollowerGain: number;
  }> {
    const orgId = organizationId || this.config.organizationId;
    if (!orgId) {
      throw new Error('Organization ID is required');
    }

    const response = await fetch(
      `${this.baseURL}/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${orgId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get follower stats: ${response.statusText}`);
    }

    const data = await response.json();
    const stats = data.elements?.[0] || {};
    
    return {
      totalFollowers: stats.followerCounts?.organic || 0,
      organicFollowerGain: stats.followerGains?.organicFollowerGain || 0,
      paidFollowerGain: stats.followerGains?.paidFollowerGain || 0,
    };
  }

  /**
   * Analyze page performance
   */
  async analyzePagePerformance(days: number = 30): Promise<{
    totalPosts: number;
    totalEngagement: number;
    averageEngagement: number;
    topPosts: LinkedInPost[];
    followerGrowth: number;
  }> {
    const posts = await this.getOrganizationPosts(undefined, 100);
    const followerStats = await this.getFollowerStatistics();

    const totalPosts = posts.length;
    const totalEngagement = posts.reduce((sum, post) => 
      sum + (post.totalShareStatistics?.likeCount || 0) + 
      (post.totalShareStatistics?.commentCount || 0) + 
      (post.totalShareStatistics?.shareCount || 0),
      0
    );
    const averageEngagement = totalPosts > 0 ? totalEngagement / totalPosts : 0;

    const topPosts = posts
      .sort((a, b) => {
        const engagementA = (a.totalShareStatistics?.likeCount || 0) + (a.totalShareStatistics?.commentCount || 0);
        const engagementB = (b.totalShareStatistics?.likeCount || 0) + (b.totalShareStatistics?.commentCount || 0);
        return engagementB - engagementA;
      })
      .slice(0, 10);

    return {
      totalPosts,
      totalEngagement,
      averageEngagement,
      topPosts,
      followerGrowth: followerStats.organicFollowerGain,
    };
  }
}

