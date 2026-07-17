/**
 * Social Media Integrations
 * 
 * Centralized exports for all social media platforms
 */

export * from './twitter';
export * from './linkedin';
export * from './youtube';
export * from './meta';

import { TwitterClient, type TwitterConfig } from './twitter';
import { LinkedInClient, type LinkedInConfig } from './linkedin';
import { YouTubeClient, type YouTubeConfig } from './youtube';
import { MetaClient, type MetaConfig } from './meta';

export interface SocialMediaConfig {
  twitter?: TwitterConfig;
  linkedin?: LinkedInConfig;
  youtube?: YouTubeConfig;
  meta?: MetaConfig;
}

export class SocialMediaManager {
  public twitter?: TwitterClient;
  public linkedin?: LinkedInClient;
  public youtube?: YouTubeClient;
  public meta?: MetaClient;

  constructor(config: SocialMediaConfig) {
    if (config.twitter) {
      this.twitter = new TwitterClient(config.twitter);
    }

    if (config.linkedin) {
      this.linkedin = new LinkedInClient(config.linkedin);
    }

    if (config.youtube) {
      this.youtube = new YouTubeClient(config.youtube);
    }

    if (config.meta) {
      this.meta = new MetaClient(config.meta);
    }
  }

  getAvailablePlatforms(): string[] {
    const platforms: string[] = [];
    
    if (this.twitter) platforms.push('twitter');
    if (this.linkedin) platforms.push('linkedin');
    if (this.youtube) platforms.push('youtube');
    if (this.meta) platforms.push('meta');

    return platforms;
  }

  /**
   * Analyze brand mentions across all platforms
   */
  async analyzeBrandMentions(brandName: string): Promise<{
    twitter?: any;
    youtube?: any;
    totalMentions: number;
    totalEngagement: number;
  }> {
    const results: any = {
      totalMentions: 0,
      totalEngagement: 0,
    };

    if (this.twitter) {
      try {
        results.twitter = await this.twitter.analyzeBrandMentions(brandName, 7);
        results.totalMentions += results.twitter.totalMentions;
        results.totalEngagement += results.twitter.totalEngagement;
      } catch (error: any) {
        console.error('Twitter analysis failed:', error.message);
      }
    }

    if (this.youtube) {
      try {
        results.youtube = await this.youtube.analyzeBrandMentions(brandName);
        results.totalMentions += results.youtube.totalVideos;
        results.totalEngagement += results.youtube.totalEngagement;
      } catch (error: any) {
        console.error('YouTube analysis failed:', error.message);
      }
    }

    return results;
  }
}

