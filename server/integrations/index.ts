// Main integrations export file

export * from './llm';
export * from './enrichment/firecrawl-brand';
export * from './enrichment/knowledge-graph';
export * from './enrichment/wikidata';
export * from './serp/serpapi';
export * from './google';
export * from './social';

import { UnifiedLLMClient, type LLMProviderConfig } from './llm';
import { KnowledgeGraphClient } from './enrichment/knowledge-graph';
import { WikidataClient } from './enrichment/wikidata';
import { SerpAPIClient } from './serp/serpapi';
import { GoogleEcosystemManager, type GoogleEcosystemConfig } from './google';
import { SocialMediaManager, type SocialMediaConfig } from './social';

export interface IntegrationsConfig {
  llm?: LLMProviderConfig;
  knowledgeGraph?: { apiKey: string };
  serpApi?: { apiKey: string };
  google?: GoogleEcosystemConfig;
  social?: SocialMediaConfig;
}

export class IntegrationsManager {
  public llm?: UnifiedLLMClient;
  public knowledgeGraph?: KnowledgeGraphClient;
  public wikidata: WikidataClient;
  public serpApi?: SerpAPIClient;
  public google?: GoogleEcosystemManager;
  public social?: SocialMediaManager;

  constructor(config: IntegrationsConfig) {
    if (config.llm) {
      this.llm = new UnifiedLLMClient(config.llm);
    }

    if (config.knowledgeGraph?.apiKey) {
      this.knowledgeGraph = new KnowledgeGraphClient(config.knowledgeGraph.apiKey);
    }

    // Wikidata is free, always available
    this.wikidata = new WikidataClient();

    if (config.serpApi?.apiKey) {
      this.serpApi = new SerpAPIClient(config.serpApi.apiKey);
    }

    if (config.google) {
      this.google = new GoogleEcosystemManager(config.google);
    }

    if (config.social) {
      this.social = new SocialMediaManager(config.social);
    }
  }

  getAvailableIntegrations(): string[] {
    const available: string[] = [];

    if (this.llm) available.push('llm');
    if (this.knowledgeGraph) available.push('knowledgeGraph');
    available.push('wikidata'); // Always available
    if (this.serpApi) available.push('serpApi');
    if (this.google) available.push('google');
    if (this.social) available.push('social');

    return available;
  }
}

// Create singleton instance (will be initialized in server/index.ts)
let integrationsInstance: IntegrationsManager | null = null;

export function initializeIntegrations(config: IntegrationsConfig): IntegrationsManager {
  integrationsInstance = new IntegrationsManager(config);
  return integrationsInstance;
}

export function getIntegrations(): IntegrationsManager {
  if (!integrationsInstance) {
    throw new Error('Integrations not initialized. Call initializeIntegrations() first.');
  }
  return integrationsInstance;
}
