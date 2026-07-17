/**
 * YouTube Data API Integration
 * 
 * Track channel performance, video mentions, and engagement
 * Docs: https://developers.google.com/youtube/v3
 */

export interface YouTubeConfig {
  apiKey: string;
  channelId?: string;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  channelId: string;
  channelTitle: string;
  thumbnails: {
    default: { url: string };
    medium: { url: string };
    high: { url: string };
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
}

export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  customUrl: string;
  publishedAt: string;
  thumbnails: any;
  statistics: {
    viewCount: string;
    subscriberCount: string;
    videoCount: string;
  };
}

export class YouTubeClient {
  private config: YouTubeConfig;
  private baseURL = 'https://www.googleapis.com/youtube/v3';

  constructor(config: YouTubeConfig) {
    this.config = config;
  }

  /**
   * Search for videos mentioning a brand
   */
  async searchVideos(query: string, maxResults: number = 50): Promise<YouTubeVideo[]> {
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: maxResults.toString(),
      key: this.config.apiKey,
    });

    const response = await fetch(`${this.baseURL}/search?${params}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`YouTube API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const videoIds = data.items.map((item: any) => item.id.videoId).join(',');

    // Get detailed statistics
    return this.getVideoDetails(videoIds);
  }

  /**
   * Get video details with statistics
   */
  async getVideoDetails(videoIds: string): Promise<YouTubeVideo[]> {
    const params = new URLSearchParams({
      part: 'snippet,statistics',
      id: videoIds,
      key: this.config.apiKey,
    });

    const response = await fetch(`${this.baseURL}/videos?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get video details: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  /**
   * Get channel information
   */
  async getChannel(channelId?: string): Promise<YouTubeChannel> {
    const id = channelId || this.config.channelId;
    if (!id) {
      throw new Error('Channel ID is required');
    }

    const params = new URLSearchParams({
      part: 'snippet,statistics',
      id,
      key: this.config.apiKey,
    });

    const response = await fetch(`${this.baseURL}/channels?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get channel: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items?.[0];
  }

  /**
   * Get channel videos
   */
  async getChannelVideos(channelId?: string, maxResults: number = 50): Promise<YouTubeVideo[]> {
    const id = channelId || this.config.channelId;
    if (!id) {
      throw new Error('Channel ID is required');
    }

    const params = new URLSearchParams({
      part: 'snippet',
      channelId: id,
      type: 'video',
      order: 'date',
      maxResults: maxResults.toString(),
      key: this.config.apiKey,
    });

    const response = await fetch(`${this.baseURL}/search?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get channel videos: ${response.statusText}`);
    }

    const data = await response.json();
    const videoIds = data.items.map((item: any) => item.id.videoId).join(',');

    return this.getVideoDetails(videoIds);
  }

  /**
   * Analyze brand mentions in videos
   */
  async analyzeBrandMentions(brandName: string): Promise<{
    totalVideos: number;
    totalViews: number;
    totalEngagement: number;
    topVideos: YouTubeVideo[];
    channelDistribution: { channelTitle: string; count: number }[];
  }> {
    const videos = await this.searchVideos(brandName, 100);

    const totalVideos = videos.length;
    const totalViews = videos.reduce((sum, video) => sum + parseInt(video.statistics.viewCount || '0'), 0);
    const totalEngagement = videos.reduce((sum, video) => 
      sum + parseInt(video.statistics.likeCount || '0') + parseInt(video.statistics.commentCount || '0'),
      0
    );

    const topVideos = videos
      .sort((a, b) => parseInt(b.statistics.viewCount) - parseInt(a.statistics.viewCount))
      .slice(0, 10);

    // Count videos per channel
    const channelCounts = new Map<string, number>();
    videos.forEach(video => {
      channelCounts.set(video.channelTitle, (channelCounts.get(video.channelTitle) || 0) + 1);
    });

    const channelDistribution = Array.from(channelCounts.entries())
      .map(([channelTitle, count]) => ({ channelTitle, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalVideos,
      totalViews,
      totalEngagement,
      topVideos,
      channelDistribution,
    };
  }
}

