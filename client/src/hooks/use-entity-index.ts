/**
 * Central export for all entity-related hooks
 *
 * These hooks power the Entity Building & Tracking module of AIRank,
 * which helps brands establish and maintain a strong presence across
 * AI systems, knowledge graphs, and the web.
 */

// Core 11 entity checks
export {
  useWikipediaPresence,
  useWikidataEntity,
  useIdentityAccuracy,
  useSocialPresence,
  useEntityConsistency,
  useTopicEntityAssociations,
  useMentions,
  useCoOccurrences,
  useDisambiguationTests,
  useRetrievalTests,
  useCommunityValidation,
  useEntityHealthScore,
  useTriggerEntityCheck,
} from './use-entity';

// Entity profile, people, links, and supporting data
export {
  useEntityProfile,
  useUpdateEntityProfile,
  useSchemaOrgData,
  useEntityPeople,
  useAddEntityPerson,
  useUpdateEntityPerson,
  useDeleteEntityPerson,
  useEntityLinks,
  useAddEntityLink,
  useDeleteEntityLink,
  useGroundTruth,
  useUpdateGroundTruth,
  useNotabilityAssessment,
  useQuotabilityScore,
  useRewrittenPrompts,
  useRunEntityChecks,
} from './use-entity-profile';

/**
 * Entity health dimensions tracked:
 *
 * 1. Knowledge Graph Presence (Wikipedia, Wikidata, Schema.org)
 * 2. Identity Accuracy (LLM disambiguation)
 * 3. Social Graph (12+ platforms)
 * 4. Topical Authority (topic-entity association, mentions)
 * 5. Co-mention Network (co-occurrences with peers)
 * 6. Retrieval Performance (RAG testing)
 * 7. Community Validation (Reddit, forums)
 * 8. People (founders, authors - E-E-A-T)
 * 9. Notability (Wikipedia eligibility)
 * 10. Quotability (how often AI cites brand)
 * 11. Consistency (NAP+W across web)
 *
 * GEO is fundamentally about entity building — making the brand
 * a first-class entity that AI systems recognize, attribute, and cite.
 */
