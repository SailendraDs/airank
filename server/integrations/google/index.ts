/**
 * Google Ecosystem Integrations
 * 
 * Centralized exports for all Google services
 */

export * from './search-console';
export * from './business-profile';
export * from './analytics';
export * from './ads';
export * from './ai-overviews';

export { KnowledgeGraphClient } from '../enrichment/knowledge-graph';

import { SearchConsoleClient, type SearchConsoleConfig } from './search-console';
import { BusinessProfileClient, type BusinessProfileConfig } from './business-profile';
import { AnalyticsClient, type AnalyticsConfig } from './analytics';
import { GoogleAdsClient, type GoogleAdsConfig } from './ads';
import { AIOverviewsClient, type AIOverviewConfig } from './ai-overviews';

export interface GoogleEcosystemConfig {
  searchConsole?: SearchConsoleConfig;
  businessProfile?: BusinessProfileConfig;
  analytics?: AnalyticsConfig;
  ads?: GoogleAdsConfig;
  aiOverviews?: AIOverviewConfig;
}

export class GoogleEcosystemManager {
  public searchConsole?: SearchConsoleClient;
  public businessProfile?: BusinessProfileClient;
  public analytics?: AnalyticsClient;
  public ads?: GoogleAdsClient;
  public aiOverviews?: AIOverviewsClient;

  constructor(config: GoogleEcosystemConfig) {
    if (config.searchConsole) {
      this.searchConsole = new SearchConsoleClient(config.searchConsole);
    }

    if (config.businessProfile) {
      this.businessProfile = new BusinessProfileClient(config.businessProfile);
    }

    if (config.analytics) {
      this.analytics = new AnalyticsClient(config.analytics);
    }

    if (config.ads) {
      this.ads = new GoogleAdsClient(config.ads);
    }

    if (config.aiOverviews) {
      this.aiOverviews = new AIOverviewsClient(config.aiOverviews);
    }
  }

  getAvailableServices(): string[] {
    const services: string[] = [];
    
    if (this.searchConsole) services.push('searchConsole');
    if (this.businessProfile) services.push('businessProfile');
    if (this.analytics) services.push('analytics');
    if (this.ads) services.push('ads');
    if (this.aiOverviews) services.push('aiOverviews');

    return services;
  }
}

