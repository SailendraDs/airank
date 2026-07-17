// Job Workers Index - Register all job handlers

import { getJobQueue } from '../queue';
import { brandEnrichmentWorker } from './brand-enrichment';
import { llmSamplingWorker } from './llm-sampling';
import { gapAnalysisWorker } from './gap-analysis';
import { visibilityScoringWorker } from './visibility-scoring';
import { recommendationWorker } from './recommendation';
import { recommendationSimulatorWorker } from './recommendation-simulator';
import { topicGenerationWorker } from './topic-generation';
import { queryGenerationWorker } from './query-generation';
import { competitorEnrichmentWorker } from './competitor-enrichment';
import { serpSamplingWorker } from './serp-sampling';
import { citationExtractionWorker } from './citation-extraction';
import { axpPublishWorker } from './axp-publish';
import { serpAnalysisWorker } from './serp-analysis';
import { knowledgeGraphAnalysisWorker } from './knowledge-graph-analysis';
import { socialAnalyticsWorker } from './social-analytics';
import { contentRecommendationsWorker } from './content-recommendations';
import { kgEnrichmentWorker } from './kg-enrichment';
import { alertEvaluationWorker } from './alert-evaluation';
import { attributionRollupWorker } from './attribution-rollup';
import { crawlerLogIngestWorker } from './crawler-log-ingest';
import { socialCitationEnrichWorker } from './social-citation-enrich';
import { browserSamplingWorker } from './browser-sampling';
import { agentExecutionWorker } from './agent-execution';
import { promptVolumeScoringWorker } from './prompt-volume-scoring';
import { executePromptMiningJob, type PromptMinerJob } from './prompt-miner';

// Tier C: Entity workers
import { wikipediaPresenceWorker } from './wikipedia-presence-checker';
import { wikidataClaimExtractorWorker } from './wikidata-claim-extractor';
import { identityAccuracyWorker } from './identity-accuracy-worker';
import { socialPresenceScannerWorker } from './social-presence-scanner';
import { entityConsistencyWorker } from './entity-consistency-checker';
import { topicEntityAssociationRunner } from './topic-entity-association-runner';
import { mentionDetectorWorker } from './mention-detector';
import { coOccurrenceExtractorWorker } from './co-occurrence-extractor';
import { disambiguationTestRunnerWorker } from './disambiguation-test-runner';
import { retrievalTesterWorker } from './retrieval-tester';
import { communityValidationWorker } from './community-validation-worker';
import { promptRewriterWorker } from './prompt-rewriter';
import { peopleEnricherWorker } from './people-enricher';
import { wikipediaNotabilityAdvisorWorker } from './wikipedia-notability-advisor';
import { brandQuotabilityWorker } from './brand-quotability-worker';
import { schemaOrgCrawlerWorker } from './schema-org-crawler';

export function registerAllWorkers(): void {
  const queue = getJobQueue();

  // Register all workers
  queue.registerHandler('brand_enrichment', brandEnrichmentWorker);
  queue.registerHandler('llm_sampling', llmSamplingWorker);
  queue.registerHandler('gap_analysis', gapAnalysisWorker);
  queue.registerHandler('visibility_scoring', visibilityScoringWorker);
  queue.registerHandler('recommendation_generation', recommendationWorker);
  queue.registerHandler('recommendation_simulation', recommendationSimulatorWorker);
  queue.registerHandler('topic_generation', topicGenerationWorker);
  queue.registerHandler('query_generation', queryGenerationWorker);
  queue.registerHandler('competitor_enrichment', competitorEnrichmentWorker);
  queue.registerHandler('serp_sampling', serpSamplingWorker);
  queue.registerHandler('citation_extraction', citationExtractionWorker);
  queue.registerHandler('axp_publish', axpPublishWorker);

  // Enhanced insights workers
  queue.registerHandler('serp_analysis', serpAnalysisWorker);
  queue.registerHandler('knowledge_graph_analysis', knowledgeGraphAnalysisWorker);
  queue.registerHandler('social_analytics', socialAnalyticsWorker);
  queue.registerHandler('content_recommendations', contentRecommendationsWorker);

  // Standalone KG enrichment worker (free API-backed entity metadata)
  queue.registerHandler('kg_enrichment', kgEnrichmentWorker);

  // Alert evaluation worker (Epic K)
  queue.registerHandler('alert_evaluation', alertEvaluationWorker);

  // Attribution rollup worker (Epic E)
  queue.registerHandler('attribution_rollup', attributionRollupWorker);

  // Crawler log ingest worker (Epic B)
  queue.registerHandler('crawler_log_ingest', crawlerLogIngestWorker);

  // Social citation enrichment worker (Epic G)
  queue.registerHandler('social_citation_enrich', socialCitationEnrichWorker);

  // Browser sampling worker (Epic A)
  queue.registerHandler('browser_sampling', browserSamplingWorker);

  // Execution agent worker (Epic D)
  queue.registerHandler('agent_execution', agentExecutionWorker);

  // Prompt volume scoring + aggregate dataset worker (Epic C2 + O)
  queue.registerHandler('prompt_volume_scoring', promptVolumeScoringWorker);

  // Tier S3: Prompt mining worker (REAL Reddit/YouTube/SERP scrape, not simulated)
  queue.registerHandler('prompt_mining', async (job) => {
    return await executePromptMiningJob(job.payload as unknown as PromptMinerJob);
  });

  // Tier C: Entity Building & Tracking workers
  queue.registerHandler('wikipedia_presence', wikipediaPresenceWorker);
  queue.registerHandler('wikidata_claim_extractor', wikidataClaimExtractorWorker);
  queue.registerHandler('identity_accuracy', identityAccuracyWorker);
  queue.registerHandler('social_presence_scanner', socialPresenceScannerWorker);
  queue.registerHandler('entity_consistency', entityConsistencyWorker);
  queue.registerHandler('topic_entity_association', topicEntityAssociationRunner);
  queue.registerHandler('mention_detector', mentionDetectorWorker);
  queue.registerHandler('co_occurrence_extractor', coOccurrenceExtractorWorker);
  queue.registerHandler('disambiguation_test', disambiguationTestRunnerWorker);
  queue.registerHandler('retrieval_tester', retrievalTesterWorker);
  queue.registerHandler('community_validation', communityValidationWorker);
  queue.registerHandler('prompt_rewriter', promptRewriterWorker);
  queue.registerHandler('people_enricher', peopleEnricherWorker);
  queue.registerHandler('wikipedia_notability', wikipediaNotabilityAdvisorWorker);
  queue.registerHandler('brand_quotability', brandQuotabilityWorker);
  queue.registerHandler('schema_org_crawler', schemaOrgCrawlerWorker);

  console.log('[Workers] All job handlers registered successfully');
  console.log('[Workers] Registered: brand_enrichment, llm_sampling, gap_analysis, visibility_scoring, recommendation_generation, topic_generation, query_generation, competitor_enrichment, serp_sampling, citation_extraction, axp_publish, serp_analysis, knowledge_graph_analysis, social_analytics, content_recommendations, kg_enrichment, prompt_mining, plus 17 entity workers');
}

export * from './brand-enrichment';
export * from './llm-sampling';
export * from './gap-analysis';
export * from './visibility-scoring';
export * from './recommendation';
export * from './topic-generation';
export * from './query-generation';
export * from './competitor-enrichment';
export * from './serp-sampling';
export * from './citation-extraction';
export * from './axp-publish';
export * from './serp-analysis';
export * from './knowledge-graph-analysis';
export * from './social-analytics';
export * from './content-recommendations';
export * from './kg-enrichment';
export * from './alert-evaluation';
export * from './attribution-rollup';
export * from './crawler-log-ingest';
export * from './social-citation-enrich';
export * from './browser-sampling';
export * from './agent-execution';
export * from './prompt-volume-scoring';
export * from './prompt-miner';
export * from './wikipedia-presence-checker';
export * from './wikidata-claim-extractor';
export * from './identity-accuracy-worker';
export * from './social-presence-scanner';
export * from './entity-consistency-checker';
export * from './topic-entity-association-runner';
export * from './mention-detector';
export * from './co-occurrence-extractor';
export * from './disambiguation-test-runner';
export * from './retrieval-tester';
export * from './community-validation-worker';
export * from './prompt-rewriter';
export * from './people-enricher';
export * from './wikipedia-notability-advisor';
export * from './brand-quotability-worker';
export * from './schema-org-crawler';

export * from './brand-enrichment';
export * from './llm-sampling';
export * from './gap-analysis';
export * from './visibility-scoring';
export * from './recommendation';
export * from './topic-generation';
export * from './query-generation';
export * from './competitor-enrichment';
export * from './serp-sampling';
export * from './citation-extraction';
export * from './axp-publish';
export * from './serp-analysis';
export * from './knowledge-graph-analysis';
export * from './social-analytics';
export * from './content-recommendations';
export * from './kg-enrichment';
export * from './alert-evaluation';
export * from './attribution-rollup';
export * from './crawler-log-ingest';
export * from './social-citation-enrich';
export * from './browser-sampling';
export * from './agent-execution';
export * from './prompt-volume-scoring';
export * from './prompt-miner';
