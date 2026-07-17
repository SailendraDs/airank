/**
 * Twitter/X API Integration
 * 
 * Track brand mentions, engagement, and sentiment on Twitter/X
 * Docs: https://developer.twitter.com/en/docs/twitter-api
 */

export interface TwitterConfig {
  bearerToken: string;
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessSecret?: string;
}

export interface Tweet {
  id: string;
  text: string;
  authorId: string;
  createdAt: string;
  publicMetrics: {
    retweetCount: number;
    replyCount: number;
    likeCount: number;
    quoteCount: number;
    impressionCount?: number;
  };
  entities?: {
    mentions?: { username: string }[];
    hashtags?: { tag: string }[];
    urls?: { url: string; expandedUrl: string }[];
  };
}

export interface TwitterUser {
  id: string;
  username: string;
  name: string;
  description: string;
  publicMetrics: {
    followersCount: number;
    followingCount: number;
    tweetCount: number;
  };
  verified: boolean;
}

export class TwitterClient {
  private config: TwitterConfig;
  private baseURL = 'https://api.twitter.com/2';

  constructor(config: TwitterConfig) {
    this.config = config;
  }

  /**
   * Search for tweets mentioning a brand
   */
  async searchTweets(query: string, maxResults: number = 100): Promise<Tweet[]> {
    const params = new URLSearchParams({
      query,
      max_results: maxResults.toString(),
      'tweet.fields': 'created_at,public_metrics,entities,author_id',
    });

    const response = await fetch(
      `${this.baseURL}/tweets/search/recent?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.bearerToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Twitter API error: ${error.detail || response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Get user information
   */
  async getUser(username: string): Promise<TwitterUser> {
    const response = await fetch(
      `${this.baseURL}/users/by/username/${username}?user.fields=description,public_metrics,verified`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.bearerToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get user: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Get user's tweets
   */
  async getUserTweets(userId: string, maxResults: number = 100): Promise<Tweet[]> {
    const params = new URLSearchParams({
      max_results: maxResults.toString(),
      'tweet.fields': 'created_at,public_metrics,entities',
    });

    const response = await fetch(
      `${this.baseURL}/users/${userId}/tweets?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.bearerToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get tweets: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Analyze brand mentions
   */
  async analyzeBrandMentions(brandName: string, days: number = 7): Promise<{
    totalMentions: number;
    totalEngagement: number;
    averageEngagement: number;
    topTweets: Tweet[];
    sentiment: { positive: number; neutral: number; negative: number };
  }> {
    const query = `"${brandName}" -is:retweet lang:en`;
    const tweets = await this.searchTweets(query, 100);

    const totalMentions = tweets.length;
    const totalEngagement = tweets.reduce((sum, tweet) => 
      sum + tweet.publicMetrics.likeCount + tweet.publicMetrics.retweetCount + tweet.publicMetrics.replyCount,
      0
    );
    const averageEngagement = totalMentions > 0 ? totalEngagement / totalMentions : 0;

    const topTweets = tweets
      .sort((a, b) => {
        const engagementA = a.publicMetrics.likeCount + a.publicMetrics.retweetCount;
        const engagementB = b.publicMetrics.likeCount + b.publicMetrics.retweetCount;
        return engagementB - engagementA;
      })
      .slice(0, 10);

    // Simple sentiment analysis (would use LLM in production)
    const sentiment = { positive: 0, neutral: 0, negative: 0 };
    // Placeholder - implement with LLM

    return {
      totalMentions,
      totalEngagement,
      averageEngagement,
      topTweets,
      sentiment,
    };
  }
}

