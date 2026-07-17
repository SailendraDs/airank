import {
  brands, type Brand, type InsertBrand,
  competitors, type Competitor, type InsertCompetitor,
  topics, type Topic, type InsertTopic,
  prompts, type Prompt, type InsertPrompt,
  promptResults, type PromptResult, type InsertPromptResult,
  sources, type Source, type InsertSource,
  integrations, type Integration, type InsertIntegration,
  users, type User, type InsertUser,
  planCapabilities, type PlanCapability, type InsertPlanCapability,
  promptTemplates, type PromptTemplate, type InsertPromptTemplate,
  teamMembers, type TeamMember, type InsertTeamMember,
  auditLogs, type AuditLog, type InsertAuditLog,
  jobs, type Job, type InsertJob,
  analysisSchedules, type AnalysisSchedule, type InsertAnalysisSchedule,
  axpContent, type AxpContent, type InsertAxpContent,
  // New tables
  llmAnswers, type LlmAnswer, type InsertLlmAnswer,
  promptRuns, type PromptRun, type InsertPromptRun,
  answerMentions, type AnswerMention, type InsertAnswerMention,
  answerCitations, type AnswerCitation, type InsertAnswerCitation,
  visibilityScores, type VisibilityScore, type InsertVisibilityScore,
  trendSnapshots, type TrendSnapshot, type InsertTrendSnapshot,
  jobRuns, type JobRun, type InsertJobRun,
  jobErrors, type JobError, type InsertJobError,
  axpPages, type AxpPage, type InsertAxpPage,
  axpVersions, type AxpVersion, type InsertAxpVersion,
  faqEntries, type FaqEntry, type InsertFaqEntry,
  schemaTemplates, type SchemaTemplate, type InsertSchemaTemplate,
  schemaVersions, type SchemaVersion, type InsertSchemaVersion,
  subscriptions, type Subscription, type InsertSubscription,
  invoices, type Invoice, type InsertInvoice,
  payments, type Payment, type InsertPayment,
  webhookEvents, type WebhookEvent, type InsertWebhookEvent,
  brandContext, type BrandContext, type InsertBrandContext,
  apiLogs, type ApiLog, type InsertApiLog,
  systemSettings, type SystemSetting, type InsertSystemSetting,
  userAnalyticsEvents, type UserAnalyticsEvent, type InsertUserAnalyticsEvent,
  optimizationLogs, type OptimizationLog, type InsertOptimizationLog,
  // Security tables
  loginAttempts, type LoginAttempt, type InsertLoginAttempt,
  accountLockouts, type AccountLockout, type InsertAccountLockout,
  userSessions, type UserSession, type InsertUserSession,
  securityEvents, type SecurityEvent, type InsertSecurityEvent,
  passwordHistory, type PasswordHistory, type InsertPasswordHistory,
  // Cost-saving / config tables
  domainRegistry, type DomainRegistry, type InsertDomainRegistry,
  dataTtlConfig, type DataTtlConfig, type InsertDataTtlConfig,
  // Drift-fix tables
  gapAnalysis, type GapAnalysis, type InsertGapAnalysis,
  recommendations, type Recommendation, type InsertRecommendation,
  usageLogs, type UsageLog, type InsertUsageLog,
  // Reporting
  reportSchedules, type ReportSchedule, type InsertReportSchedule,
  alertRules, type AlertRule, type InsertAlertRule,
  // Tier S5 — AI Recommendation Share
  recommendationRanks, type RecommendationRank, type InsertRecommendationRank,
  alertEvents, type AlertEvent, type InsertAlertEvent,
  attributionSnapshots, type AttributionSnapshot, type InsertAttributionSnapshot,
  reportCardLeads, type ReportCardLead, type InsertReportCardLead,
  crawlerLogs, type CrawlerLog, type InsertCrawlerLog,
  minedPrompts, type MinedPrompt, type InsertMinedPrompt,
  socialCitations, type SocialCitation, type InsertSocialCitation,
  brandLocales, type BrandLocale, type InsertBrandLocale,
  agencies, type Agency, type InsertAgency,
  agencyClients, type AgencyClient, type InsertAgencyClient,
  browserSamples, type BrowserSample, type InsertBrowserSample,
  cmsConnections, type CmsConnection, type InsertCmsConnection,
  agentTasks, type AgentTask, type InsertAgentTask,
  factClaims, type FactClaim, type InsertFactClaim,
  aggregateDatasetEntries, type AggregateDatasetEntry, type InsertAggregateDatasetEntry,
  apiKeys, type ApiKey, type InsertApiKey,
  webhookSubscriptions, type WebhookSubscription, type InsertWebhookSubscription,
  // Content recommendations tables
  serpResults, type SerpResult,
  paaQuestions, type PaaQuestion,
  socialPerformance, type SocialPerformance,
  knowledgeGraphStatus, type KnowledgeGraphStatus,
  agentReadinessReports, type AgentReadinessReport, type InsertAgentReadinessReport,
  addonOffers, type AddonOffer, type InsertAddonOffer,
  addonOfferBrands, type AddonOfferBrand, type InsertAddonOfferBrand,
  addonPurchases, type AddonPurchase, type InsertAddonPurchase,
  entityLinks, type EntityLink, type InsertEntityLink,
  entityProfile, type EntityProfile, type InsertEntityProfile,
  people, type Person, type InsertPerson,
  entitySocialPresence, type EntitySocialPresence, type InsertEntitySocialPresence,
  entityCooccurrences, type EntityCooccurrence, type InsertEntityCooccurrence,
  entityDisambiguationTests, type EntityDisambiguationTest, type InsertEntityDisambiguationTest,
  schemaInventory, type SchemaInventory, type InsertSchemaInventory,
  groundTruth, type GroundTruth, type InsertGroundTruth,
  retrievalTests, type RetrievalTest, type InsertRetrievalTest,
  topicEntityAssociations, type TopicEntityAssociation, type InsertTopicEntityAssociation,
  communityValidation, type CommunityValidation, type InsertCommunityValidation,
  entityNewsMentions, type EntityNewsMention, type InsertEntityNewsMention,
  externalQuotations, type ExternalQuotation, type InsertExternalQuotation,
  brandAdvices, type BrandAdvice, type InsertBrandAdvice,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, lt, gt, gte, lte, isNull, isNotNull, or, like, count, inArray, getTableColumns } from "drizzle-orm";

// In-memory activation progress (process-local; suitable for single-instance deploy)
const activationStageMap = new Map<string, string>();
const activationStageCount = new Map<string, number>();

export function reportActivationStage(brandId: string, stage: string, stageNum: number) {
  activationStageMap.set(brandId, stage);
  activationStageCount.set(brandId, stageNum);
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User>;
  getAllUsers(limit?: number, offset?: number): Promise<User[]>;

  // Plan Capabilities
  getPlanCapability(id: string): Promise<PlanCapability | undefined>;
  getAllPlanCapabilities(): Promise<PlanCapability[]>;
  createPlanCapability(data: InsertPlanCapability): Promise<PlanCapability>;
  updatePlanCapability(id: string, data: Partial<InsertPlanCapability>): Promise<PlanCapability>;
  deletePlanCapability(id: string): Promise<void>;

  // Brands
  getBrand(id: string): Promise<Brand | undefined>;
  getBrandsByUserId(userId: string): Promise<Brand[]>;
  getBrandByUserId(userId: string): Promise<Brand | null>;
  getBrandByDomain(domain: string): Promise<Brand | undefined>;
  createBrand(brand: InsertBrand): Promise<Brand>;
  updateBrand(id: string, data: Partial<InsertBrand>): Promise<Brand>;
  deleteBrand(id: string): Promise<void>;
  getAllBrands(limit?: number, offset?: number): Promise<Brand[]>;
  countBrands(): Promise<number>;
  setActivationStatus(brandId: string, status: string): Promise<void>;
  getActivationStatus(brandId: string): Promise<{ status: string; stage: string; stagesCompleted: number; totalStages: number }>;

  // Team Members
  getTeamMember(id: string): Promise<TeamMember | undefined>;
  getTeamMembersByBrand(brandId: string): Promise<TeamMember[]>;
  createTeamMember(data: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: string, data: Partial<InsertTeamMember>): Promise<TeamMember>;
  deleteTeamMember(id: string): Promise<void>;

  // Competitors
  getCompetitor(id: string): Promise<Competitor | undefined>;
  getCompetitorsByBrand(brandId: string): Promise<Competitor[]>;
  getCompetitors(brandId: string): Promise<Competitor[]>;
  createCompetitor(competitor: InsertCompetitor): Promise<Competitor>;
  updateCompetitor(id: string, data: Partial<InsertCompetitor>): Promise<Competitor>;
  deleteCompetitor(id: string): Promise<void>;

  // Topics
  getTopic(id: string): Promise<Topic | undefined>;
  getTopicsByBrand(brandId: string): Promise<Topic[]>;
  createTopic(topic: InsertTopic): Promise<Topic>;
  updateTopic(id: string, data: Partial<InsertTopic>): Promise<Topic>;
  deleteTopic(id: string): Promise<void>;

  // Prompt Templates (Admin)
  getPromptTemplates(filters?: { category?: string; llmProvider?: string; isActive?: boolean }): Promise<PromptTemplate[]>;
  getPromptTemplate(id: string): Promise<PromptTemplate | undefined>;
  createPromptTemplate(data: InsertPromptTemplate): Promise<PromptTemplate>;
  updatePromptTemplate(id: string, data: Partial<InsertPromptTemplate>): Promise<PromptTemplate>;
  deletePromptTemplate(id: string): Promise<void>;

  // Prompts
  getPrompt(id: string): Promise<Prompt | undefined>;
  getPromptsByBrand(brandId: string): Promise<Prompt[]>;
  createPrompt(prompt: InsertPrompt): Promise<Prompt>;
  updatePrompt(id: string, data: Partial<InsertPrompt>): Promise<Prompt>;
  deletePrompt(id: string): Promise<void>;

  // Prompt Results
  getPromptResults(promptId: string, limit?: number): Promise<PromptResult[]>;
  createPromptResult(data: InsertPromptResult): Promise<PromptResult>;

  // SERP Samples
  createSerpSample(data: any): Promise<any>;

  // Sources
  getSourcesByBrand(brandId: string): Promise<Source[]>;
  createSource(source: InsertSource): Promise<Source>;
  updateSource(id: string, data: Partial<InsertSource>): Promise<Source>;

  // Integrations
  getIntegrationsByBrand(brandId: string): Promise<Integration[]>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: string, data: Partial<InsertIntegration>): Promise<Integration>;

  // Jobs
  getJob(id: string): Promise<Job | undefined>;
  getJobsByBrand(brandId: string, limit?: number): Promise<Job[]>;
  getPendingJobs(limit?: number): Promise<Job[]>;
  createJob(data: InsertJob): Promise<Job>;
  updateJob(id: string, data: Partial<InsertJob>): Promise<Job>;

  // Analysis Schedules
  getAnalysisSchedule(brandId: string): Promise<AnalysisSchedule | undefined>;
  createAnalysisSchedule(data: InsertAnalysisSchedule): Promise<AnalysisSchedule>;
  updateAnalysisSchedule(id: string, data: Partial<InsertAnalysisSchedule>): Promise<AnalysisSchedule>;

  // Audit Logs
  getAuditLogs(filters: { brandId?: string; userId?: string; limit?: number; offset?: number }): Promise<AuditLog[]>;
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;

  // AXP Content (Legacy - keeping for backward compatibility)
  getAxpContentByBrand(brandId: string): Promise<AxpContent[]>;
  getAxpContent(id: string): Promise<AxpContent | undefined>;
  createAxpContent(data: InsertAxpContent): Promise<AxpContent>;
  updateAxpContent(id: string, data: Partial<InsertAxpContent>): Promise<AxpContent>;
  deleteAxpContent(id: string): Promise<void>;

  // ============= NEW ANALYTICS & INTELLIGENCE =============

  // LLM Answers
  getLlmAnswersByPrompt(promptId: string, limit?: number): Promise<LlmAnswer[]>;
  getLlmAnswersByBrand(brandId: string, limit?: number): Promise<LlmAnswer[]>;
  createLlmAnswer(data: InsertLlmAnswer): Promise<LlmAnswer>;

  // Prompt Runs
  getPromptRunsByPrompt(promptId: string, limit?: number): Promise<PromptRun[]>;
  getPromptRunsByBrand(brandId: string, limit?: number): Promise<PromptRun[]>;
  createPromptRun(data: InsertPromptRun): Promise<PromptRun>;
  updatePromptRun(id: string, data: Partial<InsertPromptRun>): Promise<PromptRun>;

  // Answer Mentions
  getAnswerMentionsByAnswer(llmAnswerId: string): Promise<AnswerMention[]>;
  getAnswerMentionsByAnswerIds(answerIds: string[]): Promise<AnswerMention[]>;
  getAnswerMentionsByBrand(brandId: string, limit?: number): Promise<AnswerMention[]>;
  createAnswerMention(data: InsertAnswerMention): Promise<AnswerMention>;

  // Answer Citations
  getAnswerCitationsByAnswer(llmAnswerId: string): Promise<AnswerCitation[]>;
  getAnswerCitationsByAnswerIds(answerIds: string[]): Promise<AnswerCitation[]>;
  createAnswerCitation(data: InsertAnswerCitation): Promise<AnswerCitation>;
  createAnswerCitationDedup(data: InsertAnswerCitation): Promise<AnswerCitation | null>;
  getDedupedCitationCount(brandId: string, from: Date, to: Date): Promise<number>;
  getBrandMentionsForPeriod(brandId: string, from: Date, to: Date): Promise<AnswerMention[]>;

  // Visibility Scores
  getVisibilityScoresByBrand(brandId: string, period?: string, limit?: number): Promise<VisibilityScore[]>;
  getLatestVisibilityScore(brandId: string): Promise<VisibilityScore | undefined>;
  createVisibilityScore(data: InsertVisibilityScore): Promise<VisibilityScore>;

  // Trend Snapshots
  getTrendSnapshotsByBrand(brandId: string, limit?: number): Promise<TrendSnapshot[]>;
  createTrendSnapshot(data: InsertTrendSnapshot): Promise<TrendSnapshot>;

  // ============= JOB MANAGEMENT =============

  // Job Runs
  getJobRunsByJob(jobId: string, limit?: number): Promise<JobRun[]>;
  getLatestJobRun(jobId: string): Promise<JobRun | undefined>;
  createJobRun(data: InsertJobRun): Promise<JobRun>;
  updateJobRun(id: string, data: Partial<InsertJobRun>): Promise<JobRun>;

  // Job Errors
  getJobErrorsByJob(jobId: string, limit?: number): Promise<JobError[]>;
  getUnresolvedJobErrors(limit?: number): Promise<JobError[]>;
  createJobError(data: InsertJobError): Promise<JobError>;
  updateJobError(id: string, data: Partial<InsertJobError>): Promise<JobError>;

  // ============= CONTENT MANAGEMENT =============

  // AXP Pages
  getAxpPagesByBrand(brandId: string): Promise<AxpPage[]>;
  getAxpPage(id: string): Promise<AxpPage | undefined>;
  getAxpPageBySlug(brandId: string, slug: string): Promise<AxpPage | undefined>;
  createAxpPage(data: InsertAxpPage): Promise<AxpPage>;
  updateAxpPage(id: string, data: Partial<InsertAxpPage>): Promise<AxpPage>;
  deleteAxpPage(id: string): Promise<void>;

  // AXP Versions
  getAxpVersionsByPage(pageId: string): Promise<AxpVersion[]>;
  getAxpVersion(id: string): Promise<AxpVersion | undefined>;
  createAxpVersion(data: InsertAxpVersion): Promise<AxpVersion>;

  // FAQ Entries
  getFaqEntriesByBrand(brandId: string): Promise<FaqEntry[]>;
  getFaqEntriesByPage(axpPageId: string): Promise<FaqEntry[]>;
  getFaqEntry(id: string): Promise<FaqEntry | undefined>;
  createFaqEntry(data: InsertFaqEntry): Promise<FaqEntry>;
  updateFaqEntry(id: string, data: Partial<InsertFaqEntry>): Promise<FaqEntry>;
  deleteFaqEntry(id: string): Promise<void>;

  // Schema Templates
  getSchemaTemplatesByBrand(brandId: string): Promise<SchemaTemplate[]>;
  getGlobalSchemaTemplates(): Promise<SchemaTemplate[]>;
  getSchemaTemplate(id: string): Promise<SchemaTemplate | undefined>;
  createSchemaTemplate(data: InsertSchemaTemplate): Promise<SchemaTemplate>;
  updateSchemaTemplate(id: string, data: Partial<InsertSchemaTemplate>): Promise<SchemaTemplate>;
  deleteSchemaTemplate(id: string): Promise<void>;

  // Schema Versions
  getSchemaVersionsByTemplate(templateId: string): Promise<SchemaVersion[]>;
  getSchemaVersion(id: string): Promise<SchemaVersion | undefined>;
  createSchemaVersion(data: InsertSchemaVersion): Promise<SchemaVersion>;

  // ============= BILLING =============

  // Subscriptions
  getSubscriptionByBrand(brandId: string): Promise<Subscription | undefined>;
  createSubscription(data: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription>;

  // Invoices
  getInvoicesByBrand(brandId: string, limit?: number): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice>;

  // Payments
  getPaymentsByBrand(brandId: string, limit?: number): Promise<Payment[]>;
  getPaymentsByInvoice(invoiceId: string): Promise<Payment[]>;
  createPayment(data: InsertPayment): Promise<Payment>;
  updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment>;
  updatePaymentStatus(razorpayPaymentId: string, status: string): Promise<void>;
  refundPayment(razorpayPaymentId: string, refundId: string): Promise<void>;
  setScoreOverride(brandId: string, scoreOverride: number | null, competitorOverrides: Record<string, number> | null): Promise<void>;
  setBrandPaymentVerified(brandId: string): Promise<void>;
  updateBrandProviderIndex(brandId: string, index: number): Promise<void>;

  // Webhook Events
  getWebhookEvents(filters: { source?: string; processed?: boolean; limit?: number }): Promise<WebhookEvent[]>;
  createWebhookEvent(data: InsertWebhookEvent): Promise<WebhookEvent>;
  updateWebhookEvent(id: string, data: Partial<InsertWebhookEvent>): Promise<WebhookEvent>;

  // ============= BRAND CONTEXT =============

  // Brand Context (Comprehensive Intelligence)
  getBrandContext(brandId: string): Promise<BrandContext | undefined>;
  createBrandContext(data: InsertBrandContext): Promise<BrandContext>;
  updateBrandContext(id: string, data: Partial<InsertBrandContext>): Promise<BrandContext>;
  upsertBrandContext(data: Record<string, any>): Promise<BrandContext>;
  deleteBrandContext(id: string): Promise<void>;

  // ============= SECURITY & SESSION MANAGEMENT =============

  // Login Attempts
  createLoginAttempt(data: InsertLoginAttempt): Promise<LoginAttempt>;
  getRecentLoginAttempts(email: string, minutes: number): Promise<LoginAttempt[]>;

  // Account Lockouts
  createAccountLockout(data: InsertAccountLockout): Promise<AccountLockout>;
  getActiveLockout(userId: string): Promise<AccountLockout | undefined>;
  clearAccountLockout(userId: string): Promise<void>;

  // User Sessions
  createSession(data: InsertUserSession): Promise<UserSession>;
  getSession(sessionToken: string): Promise<UserSession | undefined>;
  updateSessionActivity(sessionToken: string): Promise<void>;
  revokeSession(sessionToken: string, reason: string): Promise<void>;
  getUserSessions(userId: string): Promise<UserSession[]>;
  revokeAllUserSessions(userId: string, reason: string): Promise<void>;

  // Security Events
  createSecurityEvent(data: InsertSecurityEvent): Promise<SecurityEvent>;
  getSecurityEvents(filters: { userId?: string; eventType?: string; severity?: string; limit?: number }): Promise<SecurityEvent[]>;

  // Password History
  addPasswordToHistory(userId: string, passwordHash: string): Promise<PasswordHistory>;
  checkPasswordHistory(userId: string, passwordHash: string, limit: number): Promise<boolean>;

  // API Logs
  createApiLog(data: InsertApiLog): Promise<ApiLog>;
  getApiLogs(filters: { level?: string; limit?: number; offset?: number }): Promise<ApiLog[]>;
  getApiLogsCount(filters?: { level?: string }): Promise<number>;

  // System Settings
  getSystemSetting(key: string): Promise<string | null>;
  getAllSystemSettings(): Promise<SystemSetting[]>;
  setSystemSetting(key: string, value: string, updatedBy?: string): Promise<SystemSetting>;

  // All Invoices (Admin)
  getAllInvoices(limit?: number, offset?: number): Promise<Invoice[]>;

  // User Analytics Events
  createUserAnalyticsEvent(data: InsertUserAnalyticsEvent): Promise<UserAnalyticsEvent>;
  getUserAnalyticsEvents(filters: { userId?: string; brandId?: string; eventType?: string; sessionId?: string; pageContains?: string; since?: Date; until?: Date; limit?: number; offset?: number }): Promise<UserAnalyticsEvent[]>;

  // ============= WORKER STUBS (not yet wired) =============
  createSerpResult(data: any): Promise<any>;
  createPaaQuestion(data: any): Promise<any>;
  createSocialPerformance(data: any): Promise<any>;
  upsertKnowledgeGraphStatus(data: any): Promise<any>;
  getKnowledgeGraphStatus(brandId: string): Promise<KnowledgeGraphStatus | null>;

  // Agent Readiness
  getLatestAgentReadinessReport(brandId: string, scanType?: string): Promise<AgentReadinessReport | undefined>;
  createAgentReadinessReport(data: InsertAgentReadinessReport): Promise<AgentReadinessReport>;
  updateAgentReadinessReport(id: string, data: Partial<InsertAgentReadinessReport>): Promise<AgentReadinessReport>;

  // Add-on Offers
  getAllAddonOffers(): Promise<AddonOffer[]>;
  getAddonOffer(id: string): Promise<AddonOffer | undefined>;
  createAddonOffer(data: InsertAddonOffer): Promise<AddonOffer>;
  updateAddonOffer(id: string, data: Partial<InsertAddonOffer>): Promise<AddonOffer>;
  deleteAddonOffer(id: string): Promise<void>;
  getAddonOfferBrands(offerId: string): Promise<AddonOfferBrand[]>;
  getAddonOfferBrandsByBrand(brandId: string): Promise<AddonOfferBrand[]>;
  upsertAddonOfferBrand(data: InsertAddonOfferBrand): Promise<AddonOfferBrand>;
  deleteAddonOfferBrand(id: string): Promise<void>;
  getAddonOffersForBrand(brandId: string): Promise<(AddonOffer & { effectivePriceInr: number })[]>;
  createAddonPurchase(data: InsertAddonPurchase): Promise<AddonPurchase>;
  getAddonPurchase(id: string): Promise<AddonPurchase | undefined>;
  updateAddonPurchase(id: string, data: Partial<InsertAddonPurchase>): Promise<AddonPurchase>;
  getAddonPurchasesByBrand(brandId: string): Promise<AddonPurchase[]>;

  // ============= TIER B/C/D — ENTITY STACK =============

  // Entity Links
  getEntityLinksByBrand(brandId: string): Promise<EntityLink[]>;
  createEntityLink(data: InsertEntityLink): Promise<EntityLink>;
  updateEntityLink(id: string, data: Partial<InsertEntityLink>): Promise<EntityLink>;
  deleteEntityLink(id: string): Promise<void>;

  // Entity Profile
  getEntityProfileByBrand(brandId: string): Promise<EntityProfile | null>;
  upsertEntityProfile(data: InsertEntityProfile): Promise<EntityProfile>;

  // People
  getPeopleByBrand(brandId: string): Promise<Person[]>;
  createPerson(data: InsertPerson): Promise<Person>;
  updatePerson(id: string, data: Partial<InsertPerson>): Promise<Person>;
  deletePerson(id: string): Promise<void>;

  // Entity Social Presence
  getEntitySocialPresenceByBrand(brandId: string): Promise<EntitySocialPresence[]>;
  getEntitySocialPresenceByPlatform(brandId: string, platform: string): Promise<EntitySocialPresence | null>;
  upsertEntitySocialPresence(data: InsertEntitySocialPresence): Promise<EntitySocialPresence>;

  // Entity Co-occurrences
  getEntityCooccurrencesByBrand(brandId: string): Promise<EntityCooccurrence[]>;
  createEntityCooccurrence(data: InsertEntityCooccurrence): Promise<EntityCooccurrence>;

  // Entity Disambiguation Tests
  getEntityDisambiguationTestsByBrand(brandId: string): Promise<EntityDisambiguationTest[]>;
  createEntityDisambiguationTest(data: InsertEntityDisambiguationTest): Promise<EntityDisambiguationTest>;
  getDisambiguationStats(brandId: string): Promise<{ provider: string | null; correct: number; total: number; rate: number }[]>;

  // Schema Inventory
  getSchemaInventoryByBrand(brandId: string): Promise<SchemaInventory[]>;
  getSchemaInventoryByUrl(pageUrl: string): Promise<SchemaInventory | null>;
  createSchemaInventory(data: InsertSchemaInventory): Promise<SchemaInventory>;

  // Ground Truth
  getGroundTruthByBrand(brandId: string): Promise<GroundTruth[]>;
  getGroundTruthByKey(brandId: string, key: string): Promise<GroundTruth | null>;
  upsertGroundTruth(data: InsertGroundTruth): Promise<GroundTruth>;

  // Retrieval Tests
  getRetrievalTestsByBrand(brandId: string): Promise<RetrievalTest[]>;
  createRetrievalTest(data: InsertRetrievalTest): Promise<RetrievalTest>;
  getRetrievalStats(brandId: string): Promise<{ provider: string | null; retrieved: number; total: number; rate: number }[]>;

  // Topic-Entity Associations
  getTopicEntityAssociationsByBrand(brandId: string): Promise<TopicEntityAssociation[]>;
  upsertTopicEntityAssociation(data: InsertTopicEntityAssociation): Promise<TopicEntityAssociation>;

  // Community Validation
  getCommunityValidationByBrand(brandId: string): Promise<CommunityValidation[]>;
  getCommunityValidationByPlatform(brandId: string, platform: string): Promise<CommunityValidation | null>;
  upsertCommunityValidation(data: InsertCommunityValidation): Promise<CommunityValidation>;

  // Entity news/quotations/advice
  getNewsMentionsByBrand(brandId: string): Promise<EntityNewsMention[]>;
  createNewsMention(data: InsertEntityNewsMention): Promise<EntityNewsMention>;
  upsertExternalQuotation(data: InsertExternalQuotation): Promise<ExternalQuotation>;
  getExternalQuotationByBrand(brandId: string): Promise<ExternalQuotation | null>;
  upsertBrandAdvice(data: InsertBrandAdvice): Promise<BrandAdvice>;
  getBrandAdvicesByBrand(brandId: string): Promise<BrandAdvice[]>;
}

export class DatabaseStorage implements IStorage {
  // Raw db for direct SQL (job_history, job_fix_rules, ai_fix_config, etc.)
  readonly db = db;

  // ============= USERS =============
  
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User> {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async getAllUsers(limit = 100, offset = 0): Promise<User[]> {
    return await db.select().from(users).limit(limit).offset(offset).orderBy(desc(users.createdAt));
  }

  // ============= PLAN CAPABILITIES =============

  async getPlanCapability(id: string): Promise<PlanCapability | undefined> {
    const [plan] = await db.select().from(planCapabilities).where(eq(planCapabilities.id, id));
    return plan;
  }

  async getAllPlanCapabilities(): Promise<PlanCapability[]> {
    return await db.select().from(planCapabilities).orderBy(planCapabilities.monthlyPrice);
  }

  async createPlanCapability(data: InsertPlanCapability): Promise<PlanCapability> {
    const [plan] = await db.insert(planCapabilities).values(data).returning();
    return plan;
  }

  async updatePlanCapability(id: string, data: Partial<InsertPlanCapability>): Promise<PlanCapability> {
    const [updated] = await db
      .update(planCapabilities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(planCapabilities.id, id))
      .returning();
    return updated;
  }

  async deletePlanCapability(id: string): Promise<void> {
    await db.delete(planCapabilities).where(eq(planCapabilities.id, id));
  }

  // ============= BRANDS =============
  
  async getBrand(id: string): Promise<Brand | undefined> {
    const [brand] = await db.select().from(brands).where(eq(brands.id, id));
    return brand;
  }

  async getBrandsByUserId(userId: string): Promise<Brand[]> {
    return await db.select().from(brands).where(eq(brands.userId, userId));
  }

  async getBrandByUserId(userId: string): Promise<Brand | null> {
    const [brand] = await db.select().from(brands).where(eq(brands.userId, userId)).limit(1);
    return brand ?? null;
  }

  async setActivationStatus(brandId: string, status: string): Promise<void> {
    await db.update(brands).set({ activationStatus: status, updatedAt: new Date() }).where(eq(brands.id, brandId));
  }

  async getActivationStatus(brandId: string): Promise<{ status: string; stage: string; stagesCompleted: number; totalStages: number }> {
    const [brand] = await db.select({ activationStatus: brands.activationStatus }).from(brands).where(eq(brands.id, brandId));
    return {
      status: brand?.activationStatus ?? 'pending',
      stage: activationStageMap.get(brandId) ?? 'queued',
      stagesCompleted: activationStageCount.get(brandId) ?? 0,
      totalStages: 8,
    };
  }

  async getBrandByDomain(domain: string): Promise<Brand | undefined> {
    const [brand] = await db.select().from(brands).where(eq(brands.domain, domain));
    return brand;
  }

  async createBrand(brandData: InsertBrand): Promise<Brand> {
    const [brand] = await db.insert(brands).values(brandData).returning();
    return brand;
  }

  async updateBrand(id: string, data: Partial<InsertBrand>): Promise<Brand> {
    const [updated] = await db
      .update(brands)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(brands.id, id))
      .returning();
    return updated;
  }

  async deleteBrand(id: string): Promise<void> {
    await db.delete(brands).where(eq(brands.id, id));
  }

  async getAllBrands(limit = 100, offset = 0): Promise<Brand[]> {
    return await db.select().from(brands).limit(limit).offset(offset).orderBy(desc(brands.createdAt));
  }

  async countBrands(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(brands);
    return result?.count || 0;
  }

  // ============= TEAM MEMBERS =============

  async getTeamMember(id: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }

  async getTeamMembersByBrand(brandId: string): Promise<TeamMember[]> {
    return await db.select().from(teamMembers).where(eq(teamMembers.brandId, brandId));
  }

  async createTeamMember(data: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(data).returning();
    return member;
  }

  async updateTeamMember(id: string, data: Partial<InsertTeamMember>): Promise<TeamMember> {
    const [updated] = await db
      .update(teamMembers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(teamMembers.id, id))
      .returning();
    return updated;
  }

  async deleteTeamMember(id: string): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  // ============= COMPETITORS =============
  
  async getCompetitor(id: string): Promise<Competitor | undefined> {
    const [competitor] = await db.select().from(competitors).where(eq(competitors.id, id));
    return competitor;
  }

  async getCompetitorsByBrand(brandId: string): Promise<Competitor[]> {
    return await db.select().from(competitors).where(eq(competitors.brandId, brandId));
  }

  // Alias used across services/routes.
  async getCompetitors(brandId: string): Promise<Competitor[]> {
    return this.getCompetitorsByBrand(brandId);
  }

  async createCompetitor(competitorData: InsertCompetitor): Promise<Competitor> {
    const [competitor] = await db.insert(competitors).values(competitorData).returning();
    return competitor;
  }

  async updateCompetitor(id: string, data: Partial<InsertCompetitor>): Promise<Competitor> {
    const [updated] = await db
      .update(competitors)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(competitors.id, id))
      .returning();
    return updated;
  }

  async deleteCompetitor(id: string): Promise<void> {
    await db.delete(competitors).where(eq(competitors.id, id));
  }

  // ============= TOPICS =============
  
  async getTopic(id: string): Promise<Topic | undefined> {
    const [topic] = await db.select().from(topics).where(eq(topics.id, id));
    return topic;
  }

  async getTopicsByBrand(brandId: string): Promise<Topic[]> {
    return await db.select().from(topics).where(eq(topics.brandId, brandId));
  }

  async createTopic(topicData: InsertTopic): Promise<Topic> {
    const [topic] = await db.insert(topics).values(topicData).returning();
    return topic;
  }

  async updateTopic(id: string, data: Partial<InsertTopic>): Promise<Topic> {
    const [updated] = await db
      .update(topics)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(topics.id, id))
      .returning();
    return updated;
  }

  async deleteTopic(id: string): Promise<void> {
    await db.delete(topics).where(eq(topics.id, id));
  }

  // ============= PROMPT TEMPLATES =============

  async getPromptTemplates(filters?: { category?: string; llmProvider?: string; isActive?: boolean }): Promise<PromptTemplate[]> {
    let query = db.select().from(promptTemplates);
    
    const conditions = [];
    if (filters?.category) conditions.push(eq(promptTemplates.category, filters.category));
    if (filters?.llmProvider) conditions.push(eq(promptTemplates.llmProvider, filters.llmProvider));
    if (filters?.isActive !== undefined) conditions.push(eq(promptTemplates.isActive, filters.isActive));
    
    if (conditions.length > 0) {
      return await db.select().from(promptTemplates).where(and(...conditions)).orderBy(desc(promptTemplates.createdAt));
    }
    return await db.select().from(promptTemplates).orderBy(desc(promptTemplates.createdAt));
  }

  async getPromptTemplate(id: string): Promise<PromptTemplate | undefined> {
    const [template] = await db.select().from(promptTemplates).where(eq(promptTemplates.id, id));
    return template;
  }

  async createPromptTemplate(data: InsertPromptTemplate): Promise<PromptTemplate> {
    const [template] = await db.insert(promptTemplates).values(data).returning();
    return template;
  }

  async updatePromptTemplate(id: string, data: Partial<InsertPromptTemplate>): Promise<PromptTemplate> {
    const [updated] = await db
      .update(promptTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(promptTemplates.id, id))
      .returning();
    return updated;
  }

  async deletePromptTemplate(id: string): Promise<void> {
    await db.delete(promptTemplates).where(eq(promptTemplates.id, id));
  }

  // ============= PROMPTS =============

  async getPrompt(id: string): Promise<Prompt | undefined> {
    const [prompt] = await db.select().from(prompts).where(eq(prompts.id, id));
    return prompt;
  }

  async getPromptsByBrand(brandId: string): Promise<Prompt[]> {
    return await db.select().from(prompts).where(eq(prompts.brandId, brandId));
  }

  async createPrompt(promptData: InsertPrompt): Promise<Prompt> {
    const [prompt] = await db.insert(prompts).values(promptData).returning();
    return prompt;
  }

  async updatePrompt(id: string, data: Partial<InsertPrompt>): Promise<Prompt> {
    const [updated] = await db
      .update(prompts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(prompts.id, id))
      .returning();
    return updated;
  }

  async deletePrompt(id: string): Promise<void> {
    await db.delete(prompts).where(eq(prompts.id, id));
  }

  // ============= PROMPT RESULTS =============

  async getPromptResults(promptId: string, limit = 10): Promise<PromptResult[]> {
    return await db.select().from(promptResults)
      .where(eq(promptResults.promptId, promptId))
      .orderBy(desc(promptResults.createdAt))
      .limit(limit);
  }

  async createPromptResult(data: InsertPromptResult): Promise<PromptResult> {
    const [result] = await db.insert(promptResults).values(data).returning();
    return result;
  }

  // ============= SERP SAMPLES =============

  async createSerpSample(data: any): Promise<any> {
    throw new Error('NotImplemented: createSerpSample');
  }

  // ============= SOURCES =============
  
  async getSourcesByBrand(brandId: string): Promise<Source[]> {
    return await db.select().from(sources).where(eq(sources.brandId, brandId));
  }

  async createSource(sourceData: InsertSource): Promise<Source> {
    const [source] = await db.insert(sources).values(sourceData).returning();
    return source;
  }

  async updateSource(id: string, data: Partial<InsertSource>): Promise<Source> {
    const [updated] = await db
      .update(sources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sources.id, id))
      .returning();
    return updated;
  }

  // ============= INTEGRATIONS =============
  
  async getIntegrationsByBrand(brandId: string): Promise<Integration[]> {
    return await db.select().from(integrations).where(eq(integrations.brandId, brandId));
  }

  async createIntegration(integrationData: InsertIntegration): Promise<Integration> {
    const [integration] = await db.insert(integrations).values(integrationData).returning();
    return integration;
  }

  async updateIntegration(id: string, data: Partial<InsertIntegration>): Promise<Integration> {
    const [updated] = await db
      .update(integrations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(integrations.id, id))
      .returning();
    return updated;
  }

  // ============= JOBS =============

  async getJob(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job;
  }

  async getJobsByBrand(brandId: string, limit = 50): Promise<Job[]> {
    return await db.select().from(jobs)
      .where(eq(jobs.brandId, brandId))
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
  }

  async getPendingJobs(limit = 100): Promise<Job[]> {
    return await db.select().from(jobs)
      .where(eq(jobs.status, "pending"))
      .orderBy(desc(jobs.priority), jobs.createdAt)
      .limit(limit);
  }

  async createJob(data: InsertJob): Promise<Job> {
    const [job] = await db.insert(jobs).values(data).returning();
    return job;
  }

  async updateJob(id: string, data: Partial<InsertJob>): Promise<Job> {
    const [updated] = await db
      .update(jobs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }

  // ============= ANALYSIS SCHEDULES =============

  async getAnalysisSchedule(brandId: string): Promise<AnalysisSchedule | undefined> {
    const [schedule] = await db.select().from(analysisSchedules)
      .where(eq(analysisSchedules.brandId, brandId));
    return schedule;
  }

  async createAnalysisSchedule(data: InsertAnalysisSchedule): Promise<AnalysisSchedule> {
    const [schedule] = await db.insert(analysisSchedules).values(data).returning();
    return schedule;
  }

  async updateAnalysisSchedule(id: string, data: Partial<InsertAnalysisSchedule>): Promise<AnalysisSchedule> {
    const [updated] = await db
      .update(analysisSchedules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(analysisSchedules.id, id))
      .returning();
    return updated;
  }

  // ============= AUDIT LOGS =============

  async getAuditLogs(filters: { brandId?: string; userId?: string; limit?: number; offset?: number }): Promise<AuditLog[]> {
    const conditions = [];
    if (filters.brandId) conditions.push(eq(auditLogs.brandId, filters.brandId));
    if (filters.userId) conditions.push(eq(auditLogs.userId, filters.userId));

    let query = db.select().from(auditLogs);
    
    if (conditions.length > 0) {
      return await db.select().from(auditLogs)
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt))
        .limit(filters.limit || 100)
        .offset(filters.offset || 0);
    }
    
    return await db.select().from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(filters.limit || 100)
      .offset(filters.offset || 0);
  }

  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(data).returning();
    return log;
  }

  // ============= AXP CONTENT =============

  async getAxpContentByBrand(brandId: string): Promise<AxpContent[]> {
    return await db.select().from(axpContent)
      .where(eq(axpContent.brandId, brandId))
      .orderBy(desc(axpContent.createdAt));
  }

  async getAxpContent(id: string): Promise<AxpContent | undefined> {
    const [content] = await db.select().from(axpContent).where(eq(axpContent.id, id));
    return content;
  }

  async createAxpContent(data: InsertAxpContent): Promise<AxpContent> {
    const [content] = await db.insert(axpContent).values(data).returning();
    return content;
  }

  async updateAxpContent(id: string, data: Partial<InsertAxpContent>): Promise<AxpContent> {
    const [updated] = await db
      .update(axpContent)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(axpContent.id, id))
      .returning();
    return updated;
  }

  async deleteAxpContent(id: string): Promise<void> {
    await db.delete(axpContent).where(eq(axpContent.id, id));
  }

  // ============= LLM ANSWERS =============

  async getLlmAnswersByPrompt(promptId: string, limit = 50): Promise<LlmAnswer[]> {
    return await db.select().from(llmAnswers)
      .where(eq(llmAnswers.promptId, promptId))
      .orderBy(desc(llmAnswers.createdAt))
      .limit(limit);
  }

  async getLlmAnswersByBrand(brandId: string, limit = 100): Promise<LlmAnswer[]> {
    return await db.select().from(llmAnswers)
      .where(eq(llmAnswers.brandId, brandId))
      .orderBy(desc(llmAnswers.createdAt))
      .limit(limit);
  }

  async createLlmAnswer(data: InsertLlmAnswer): Promise<LlmAnswer> {
    const [answer] = await db.insert(llmAnswers).values(data).returning();
    return answer;
  }

  // ============= PROMPT RUNS =============

  async getPromptRunsByPrompt(promptId: string, limit = 50): Promise<PromptRun[]> {
    return await db.select().from(promptRuns)
      .where(eq(promptRuns.promptId, promptId))
      .orderBy(desc(promptRuns.createdAt))
      .limit(limit);
  }

  async getPromptRunsByBrand(brandId: string, limit = 100): Promise<PromptRun[]> {
    return await db.select().from(promptRuns)
      .where(eq(promptRuns.brandId, brandId))
      .orderBy(desc(promptRuns.createdAt))
      .limit(limit);
  }

  async createPromptRun(data: InsertPromptRun): Promise<PromptRun> {
    const [run] = await db.insert(promptRuns).values(data).returning();
    return run;
  }

  async updatePromptRun(id: string, data: Partial<InsertPromptRun>): Promise<PromptRun> {
    const [updated] = await db
      .update(promptRuns)
      .set(data)
      .where(eq(promptRuns.id, id))
      .returning();
    return updated;
  }

  // ============= ANSWER MENTIONS =============

  async getAnswerMentionsByAnswer(llmAnswerId: string): Promise<AnswerMention[]> {
    return await db.select().from(answerMentions)
      .where(eq(answerMentions.llmAnswerId, llmAnswerId))
      .orderBy(answerMentions.position);
  }

  async getAnswerMentionsByAnswerIds(answerIds: string[]): Promise<AnswerMention[]> {
    if (answerIds.length === 0) return [];
    return await db.select().from(answerMentions)
      .where(inArray(answerMentions.llmAnswerId, answerIds))
      .orderBy(answerMentions.position);
  }

  async getAnswerMentionsByBrand(brandId: string, limit = 100): Promise<AnswerMention[]> {
    return await db.select().from(answerMentions)
      .where(eq(answerMentions.brandId, brandId))
      .orderBy(desc(answerMentions.createdAt))
      .limit(limit);
  }

  async getAllMentionsForBrand(brandId: string, limit = 5000): Promise<AnswerMention[]> {
    return await db.select().from(answerMentions)
      .where(eq(answerMentions.brandId, brandId))
      .orderBy(desc(answerMentions.createdAt))
      .limit(limit);
  }

  async getMentionsByCompetitor(competitorId: string, limit = 1000): Promise<AnswerMention[]> {
    return await db.select().from(answerMentions)
      .where(eq(answerMentions.competitorId, competitorId))
      .orderBy(desc(answerMentions.createdAt))
      .limit(limit);
  }

  async createAnswerMention(data: InsertAnswerMention): Promise<AnswerMention> {
    const [mention] = await db.insert(answerMentions).values(data).returning();
    return mention;
  }

  // ============= ANSWER CITATIONS =============

  async getAnswerCitationsByAnswer(llmAnswerId: string): Promise<AnswerCitation[]> {
    return await db.select().from(answerCitations)
      .where(eq(answerCitations.llmAnswerId, llmAnswerId))
      .orderBy(answerCitations.position);
  }

  async getAnswerCitationsByAnswerIds(answerIds: string[]): Promise<AnswerCitation[]> {
    if (answerIds.length === 0) return [];
    return await db.select().from(answerCitations)
      .where(inArray(answerCitations.llmAnswerId, answerIds))
      .orderBy(answerCitations.position);
  }

  async createAnswerCitation(data: InsertAnswerCitation): Promise<AnswerCitation> {
    const [citation] = await db.insert(answerCitations).values(data).returning();
    return citation;
  }

  async createAnswerCitationDedup(data: InsertAnswerCitation): Promise<AnswerCitation | null> {
    const [row] = await db
      .insert(answerCitations)
      .values(data)
      .onConflictDoNothing()  // UNIQUE(llmAnswerId, normalizedUrl)
      .returning();
    return row ?? null; // null means duplicate was silently skipped
  }

  async getDedupedCitationCount(brandId: string, from: Date, to: Date): Promise<number> {
    const result = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${answerCitations.normalizedUrl})` })
      .from(answerCitations)
      .innerJoin(llmAnswers, eq(llmAnswers.id, answerCitations.llmAnswerId))
      .where(and(
        eq(llmAnswers.brandId, brandId),
        gte(llmAnswers.createdAt, from),
        lte(llmAnswers.createdAt, to),
        isNotNull(answerCitations.normalizedUrl),
      ));
    return result[0]?.count ?? 0;
  }

  async getBrandMentionsForPeriod(brandId: string, from: Date, to: Date): Promise<AnswerMention[]> {
    // Use getTableColumns to select only answerMentions columns — innerJoin returns
    // a namespaced object otherwise, breaking the AnswerMention[] return type.
    const rows = await db
      .select(getTableColumns(answerMentions))
      .from(answerMentions)
      .innerJoin(llmAnswers, eq(llmAnswers.id, answerMentions.llmAnswerId))
      .where(and(
        eq(answerMentions.brandId, brandId),
        eq(answerMentions.isCompetitor, false),
        gte(llmAnswers.createdAt, from),
        lte(llmAnswers.createdAt, to),
      ));
    return rows as AnswerMention[];
  }

  // Competitor mentions in a period (isCompetitor = true), for Share-of-Voice (Epic I).
  async getCompetitorMentionsForPeriod(brandId: string, from: Date, to: Date): Promise<AnswerMention[]> {
    const rows = await db
      .select(getTableColumns(answerMentions))
      .from(answerMentions)
      .innerJoin(llmAnswers, eq(llmAnswers.id, answerMentions.llmAnswerId))
      .where(and(
        eq(llmAnswers.brandId, brandId),
        eq(answerMentions.isCompetitor, true),
        gte(llmAnswers.createdAt, from),
        lte(llmAnswers.createdAt, to),
      ));
    return rows as AnswerMention[];
  }

  // Tier S4 — Per-intent breakdown of brand mentions for the Dashboard "Score by Intent"
  // widget. Returns one row per (intent, llmProvider) pair. Intent is derived from the
  // prompt the answer was generated for (prompts.intent).
  async getMentionsByIntent(brandId: string, limit: number = 5000): Promise<{
    intent: string | null;
    provider: string;
    isBrandMention: boolean;
    position: number | null;
    sentiment: string | null;
  }[]> {
    const rows = await db
      .select({
        intent: prompts.intent,
        provider: llmAnswers.llmProvider,
        isBrandMention: answerMentions.isCompetitor,
        position: answerMentions.position,
        sentiment: answerMentions.sentiment,
      })
      .from(answerMentions)
      .innerJoin(llmAnswers, eq(llmAnswers.id, answerMentions.llmAnswerId))
      .leftJoin(prompts, eq(prompts.id, llmAnswers.promptId))
      .where(and(
        eq(llmAnswers.brandId, brandId),
      ))
      .orderBy(desc(llmAnswers.createdAt))
      .limit(limit);
    return rows;
  }

  // ============= RECOMMENDATION RANKS (Tier S5 — AI Recommendation Share) =============

  async insertRecommendationRank(row: typeof recommendationRanks.$inferInsert) {
    const [r] = await db.insert(recommendationRanks).values(row).returning();
    return r;
  }

  async getRecentRecommendationRanks(brandId: string, limit: number = 200) {
    return await db.select().from(recommendationRanks)
      .where(eq(recommendationRanks.brandId, brandId))
      .orderBy(desc(recommendationRanks.runAt))
      .limit(limit);
  }

  async getRecommendationShareStats(brandId: string) {
    // Aggregate AI Recommendation Share over the last 30 days.
    const rows = await db.select({
      id: recommendationRanks.id,
      llmProvider: recommendationRanks.llmProvider,
      rank: recommendationRanks.rank,
      isRecommended: recommendationRanks.isRecommended,
      totalBrandsInResponse: recommendationRanks.totalBrandsInResponse,
      topBrands: recommendationRanks.topBrands,
      runAt: recommendationRanks.runAt,
    })
      .from(recommendationRanks)
      .where(eq(recommendationRanks.brandId, brandId))
      .orderBy(desc(recommendationRanks.runAt))
      .limit(500);
    return rows;
  }

  // ============= REPORT SCHEDULES (Epic I) =============

  async getReportSchedulesByBrand(brandId: string): Promise<ReportSchedule[]> {
    return await db.select().from(reportSchedules)
      .where(eq(reportSchedules.brandId, brandId))
      .orderBy(desc(reportSchedules.createdAt));
  }

  async getReportSchedule(id: string): Promise<ReportSchedule | undefined> {
    const [row] = await db.select().from(reportSchedules).where(eq(reportSchedules.id, id));
    return row;
  }

  async getDueReportSchedules(now: Date = new Date()): Promise<ReportSchedule[]> {
    return await db.select().from(reportSchedules)
      .where(and(
        eq(reportSchedules.isActive, true),
        lte(reportSchedules.nextRunAt, now),
      ));
  }

  async createReportSchedule(data: InsertReportSchedule): Promise<ReportSchedule> {
    const [row] = await db.insert(reportSchedules).values(data).returning();
    return row;
  }

  async updateReportSchedule(id: string, data: Partial<InsertReportSchedule>): Promise<ReportSchedule> {
    const [row] = await db.update(reportSchedules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reportSchedules.id, id))
      .returning();
    return row;
  }

  async deleteReportSchedule(id: string): Promise<void> {
    await db.delete(reportSchedules).where(eq(reportSchedules.id, id));
  }

  // ============= ALERT RULES (Epic K) =============

  async getAlertRulesByBrand(brandId: string): Promise<AlertRule[]> {
    return await db.select().from(alertRules)
      .where(eq(alertRules.brandId, brandId))
      .orderBy(desc(alertRules.createdAt));
  }

  async getActiveAlertRules(): Promise<AlertRule[]> {
    return await db.select().from(alertRules).where(eq(alertRules.isActive, true));
  }

  async getAlertRule(id: string): Promise<AlertRule | undefined> {
    const [row] = await db.select().from(alertRules).where(eq(alertRules.id, id));
    return row;
  }

  async createAlertRule(data: InsertAlertRule): Promise<AlertRule> {
    const [row] = await db.insert(alertRules).values(data).returning();
    return row;
  }

  async updateAlertRule(id: string, data: Partial<InsertAlertRule>): Promise<AlertRule> {
    const [row] = await db.update(alertRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(alertRules.id, id))
      .returning();
    return row;
  }

  async deleteAlertRule(id: string): Promise<void> {
    await db.delete(alertRules).where(eq(alertRules.id, id));
  }

  // ============= ALERT EVENTS (Epic K) =============

  async getAlertEventsByBrand(brandId: string, limit = 50): Promise<AlertEvent[]> {
    return await db.select().from(alertEvents)
      .where(eq(alertEvents.brandId, brandId))
      .orderBy(desc(alertEvents.createdAt))
      .limit(limit);
  }

  async createAlertEvent(data: InsertAlertEvent): Promise<AlertEvent> {
    const [row] = await db.insert(alertEvents).values(data).returning();
    return row;
  }

  async updateAlertEvent(id: string, data: Partial<InsertAlertEvent>): Promise<AlertEvent> {
    const [row] = await db.update(alertEvents)
      .set(data)
      .where(eq(alertEvents.id, id))
      .returning();
    return row;
  }

  // ============= ATTRIBUTION SNAPSHOTS (Epic E) =============

  async getAttributionSnapshotsByBrand(brandId: string, limit = 30): Promise<AttributionSnapshot[]> {
    return await db.select().from(attributionSnapshots)
      .where(eq(attributionSnapshots.brandId, brandId))
      .orderBy(desc(attributionSnapshots.periodEnd))
      .limit(limit);
  }

  async getLatestAttributionSnapshot(brandId: string): Promise<AttributionSnapshot | undefined> {
    const [row] = await db.select().from(attributionSnapshots)
      .where(eq(attributionSnapshots.brandId, brandId))
      .orderBy(desc(attributionSnapshots.periodEnd))
      .limit(1);
    return row;
  }

  async createAttributionSnapshot(data: InsertAttributionSnapshot): Promise<AttributionSnapshot> {
    const [row] = await db.insert(attributionSnapshots).values(data).returning();
    return row;
  }

  // ============= REPORT CARD LEADS (Epic N) =============

  async createReportCardLead(data: InsertReportCardLead): Promise<ReportCardLead> {
    const [row] = await db.insert(reportCardLeads).values(data).returning();
    return row;
  }

  async updateReportCardLead(id: string, data: Partial<InsertReportCardLead>): Promise<ReportCardLead> {
    const [row] = await db.update(reportCardLeads).set(data).where(eq(reportCardLeads.id, id)).returning();
    return row;
  }

  async getRecentReportCardLeadByDomain(domain: string): Promise<ReportCardLead | undefined> {
    const [row] = await db.select().from(reportCardLeads)
      .where(eq(reportCardLeads.domain, domain))
      .orderBy(desc(reportCardLeads.createdAt))
      .limit(1);
    return row;
  }

  async getReportCardLeads(limit = 100): Promise<ReportCardLead[]> {
    return await db.select().from(reportCardLeads)
      .orderBy(desc(reportCardLeads.createdAt))
      .limit(limit);
  }

  // ============= CRAWLER LOGS (Epic B) =============

  async createCrawlerLog(data: InsertCrawlerLog): Promise<CrawlerLog> {
    const [row] = await db.insert(crawlerLogs).values(data).returning();
    return row;
  }

  async createCrawlerLogs(data: InsertCrawlerLog[]): Promise<number> {
    if (data.length === 0) return 0;
    const rows = await db.insert(crawlerLogs).values(data).returning();
    return rows.length;
  }

  async getCrawlerLogsByBrand(brandId: string, sinceDays = 30, limit = 1000): Promise<CrawlerLog[]> {
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    return await db.select().from(crawlerLogs)
      .where(and(eq(crawlerLogs.brandId, brandId), gte(crawlerLogs.visitedAt, cutoff)))
      .orderBy(desc(crawlerLogs.visitedAt))
      .limit(limit);
  }

  async getCrawlerStatsSummary(brandId: string, sinceDays = 30): Promise<{
    totalVisits: number;
    verifiedVisits: number;
    lastVisit: Date | null;
    byEngine: Record<string, number>;
    byBot: Record<string, number>;
    topPages: Array<{ url: string; count: number }>;
  }> {
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const where = and(eq(crawlerLogs.brandId, brandId), gte(crawlerLogs.visitedAt, cutoff));
    const [summary] = await db.select({
      totalVisits: count(),
      verifiedVisits: sql<number>`count(*) filter (where ${crawlerLogs.verified} = true)`,
      lastVisit: sql<Date | null>`max(${crawlerLogs.visitedAt})`,
    }).from(crawlerLogs).where(where);
    const [engineRows, botRows, pageRows] = await Promise.all([
      db.select({
        engine: sql<string>`coalesce(${crawlerLogs.engine}, 'other')`,
        count: count(),
      }).from(crawlerLogs).where(where).groupBy(sql`coalesce(${crawlerLogs.engine}, 'other')`),
      db.select({
        botName: crawlerLogs.botName,
        count: count(),
      }).from(crawlerLogs).where(where).groupBy(crawlerLogs.botName),
      db.select({
        url: sql<string>`coalesce(nullif(${crawlerLogs.path}, ''), '/')`,
        count: count(),
      }).from(crawlerLogs).where(where)
        .groupBy(sql`coalesce(nullif(${crawlerLogs.path}, ''), '/')`)
        .orderBy(desc(count()))
        .limit(10),
    ]);

    return {
      totalVisits: Number(summary?.totalVisits || 0),
      verifiedVisits: Number(summary?.verifiedVisits || 0),
      lastVisit: summary?.lastVisit ? new Date(summary.lastVisit) : null,
      byEngine: Object.fromEntries(engineRows.map((row) => [row.engine || 'other', Number(row.count || 0)])),
      byBot: Object.fromEntries(botRows.map((row) => [row.botName || 'other', Number(row.count || 0)])),
      topPages: pageRows.map((row) => ({ url: row.url || '/', count: Number(row.count || 0) })),
    };
  }

  async getCrawlerAttributionSummary(brandId: string, sinceDays = 30, topLimit = 5): Promise<{
    totalReferrals: number;
    byEngine: Record<string, number>;
    topSources: Array<{ source: string; referrals: number }>;
  }> {
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const where = and(eq(crawlerLogs.brandId, brandId), gte(crawlerLogs.visitedAt, cutoff));
    const [[summary], engineRows, sourceRows] = await Promise.all([
      db.select({ totalReferrals: count() }).from(crawlerLogs).where(where),
      db.select({
        engine: sql<string>`coalesce(${crawlerLogs.engine}, 'other')`,
        count: count(),
      }).from(crawlerLogs).where(where).groupBy(sql`coalesce(${crawlerLogs.engine}, 'other')`),
      db.select({
        source: sql<string>`coalesce(nullif(${crawlerLogs.path}, ''), '/')`,
        referrals: count(),
      }).from(crawlerLogs).where(where)
        .groupBy(sql`coalesce(nullif(${crawlerLogs.path}, ''), '/')`)
        .orderBy(desc(count()))
        .limit(topLimit),
    ]);

    return {
      totalReferrals: Number(summary?.totalReferrals || 0),
      byEngine: Object.fromEntries(engineRows.map((row) => [row.engine || 'other', Number(row.count || 0)])),
      topSources: sourceRows.map((row) => ({ source: row.source || '/', referrals: Number(row.referrals || 0) })),
    };
  }

  async getBrandByCrawlerToken(token: string): Promise<Brand | undefined> {
    const [row] = await db.select().from(brands).where(eq(brands.crawlerIngestToken, token));
    return row;
  }

  // ============= MINED PROMPTS (Epic C1) =============

  async getMinedPromptsByBrand(brandId: string, limit = 200): Promise<MinedPrompt[]> {
    return await db.select().from(minedPrompts)
      .where(eq(minedPrompts.brandId, brandId))
      .orderBy(desc(minedPrompts.priorityScore))
      .limit(limit);
  }

  async getMinedPrompt(id: string): Promise<MinedPrompt | undefined> {
    const [row] = await db.select().from(minedPrompts).where(eq(minedPrompts.id, id));
    return row;
  }

  async upsertMinedPrompt(data: InsertMinedPrompt): Promise<MinedPrompt> {
    // Dedupe by (brandId, normalizedQuery): update demand/score if it already exists.
    const [existing] = await db.select().from(minedPrompts)
      .where(and(eq(minedPrompts.brandId, data.brandId), eq(minedPrompts.normalizedQuery, data.normalizedQuery)))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(minedPrompts)
        .set({
          demandSignal: data.demandSignal ?? existing.demandSignal,
          priorityScore: data.priorityScore ?? existing.priorityScore,
          upvotes: data.upvotes ?? existing.upvotes,
          commentCount: data.commentCount ?? existing.commentCount,
          viewCount: data.viewCount ?? existing.viewCount,
          searchVolume: data.searchVolume ?? existing.searchVolume,
          updatedAt: new Date(),
        })
        .where(eq(minedPrompts.id, existing.id))
        .returning();
      return updated;
    }
    const [row] = await db.insert(minedPrompts).values(data).returning();
    return row;
  }

  async updateMinedPrompt(id: string, data: Partial<InsertMinedPrompt>): Promise<MinedPrompt> {
    const [row] = await db.update(minedPrompts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(minedPrompts.id, id))
      .returning();
    return row;
  }

  // ============= SOCIAL CITATIONS (Epic G) =============

  async getSocialCitationsByBrand(brandId: string, platform?: string, limit = 200): Promise<SocialCitation[]> {
    const conditions = [eq(socialCitations.brandId, brandId)];
    if (platform) conditions.push(eq(socialCitations.platform, platform));
    return await db.select().from(socialCitations)
      .where(and(...conditions))
      .orderBy(desc(socialCitations.publishedAt))
      .limit(limit);
  }

  async upsertSocialCitation(data: InsertSocialCitation): Promise<SocialCitation> {
    const [existing] = await db.select().from(socialCitations)
      .where(and(
        eq(socialCitations.brandId, data.brandId),
        eq(socialCitations.platform, data.platform),
        eq(socialCitations.externalId, data.externalId),
      ))
      .limit(1);
    if (existing) {
      const [updated] = await db.update(socialCitations)
        .set({
          upvotes: data.upvotes ?? existing.upvotes,
          commentCount: data.commentCount ?? existing.commentCount,
          viewCount: data.viewCount ?? existing.viewCount,
          sentiment: data.sentiment ?? existing.sentiment,
        })
        .where(eq(socialCitations.id, existing.id))
        .returning();
      return updated;
    }
    const [row] = await db.insert(socialCitations).values(data).returning();
    return row;
  }

  // ============= BRAND LOCALES (Epic F) =============

  async getBrandLocales(brandId: string): Promise<BrandLocale[]> {
    return await db.select().from(brandLocales)
      .where(eq(brandLocales.brandId, brandId))
      .orderBy(desc(brandLocales.isPrimary));
  }

  async getBrandLocale(id: string): Promise<BrandLocale | undefined> {
    const [row] = await db.select().from(brandLocales).where(eq(brandLocales.id, id));
    return row;
  }

  async createBrandLocale(data: InsertBrandLocale): Promise<BrandLocale> {
    const [row] = await db.insert(brandLocales).values(data).returning();
    return row;
  }

  async deleteBrandLocale(id: string): Promise<void> {
    await db.delete(brandLocales).where(eq(brandLocales.id, id));
  }

  // ============= AGENCIES + WHITE-LABEL (Epic J) =============

  async getAgencyByOwner(ownerUserId: string): Promise<Agency | undefined> {
    const [row] = await db.select().from(agencies).where(eq(agencies.ownerUserId, ownerUserId));
    return row;
  }

  async getAgency(id: string): Promise<Agency | undefined> {
    const [row] = await db.select().from(agencies).where(eq(agencies.id, id));
    return row;
  }

  async getAgencyByDomain(customDomain: string): Promise<Agency | undefined> {
    const [row] = await db.select().from(agencies).where(eq(agencies.customDomain, customDomain));
    return row;
  }

  async createAgency(data: InsertAgency): Promise<Agency> {
    const [row] = await db.insert(agencies).values(data).returning();
    return row;
  }

  async updateAgency(id: string, data: Partial<InsertAgency>): Promise<Agency> {
    const [row] = await db.update(agencies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agencies.id, id))
      .returning();
    return row;
  }

  async getAgencyClients(agencyId: string): Promise<AgencyClient[]> {
    return await db.select().from(agencyClients)
      .where(eq(agencyClients.agencyId, agencyId))
      .orderBy(desc(agencyClients.createdAt));
  }

  async addAgencyClient(data: InsertAgencyClient): Promise<AgencyClient> {
    const [row] = await db.insert(agencyClients).values(data).returning();
    return row;
  }

  async getAgencyClient(id: string): Promise<AgencyClient | undefined> {
    const [row] = await db.select().from(agencyClients).where(eq(agencyClients.id, id));
    return row;
  }

  async removeAgencyClient(id: string): Promise<void> {
    await db.delete(agencyClients).where(eq(agencyClients.id, id));
  }

  // ============= BROWSER SAMPLES (Epic A) =============

  async createBrowserSample(data: InsertBrowserSample): Promise<BrowserSample> {
    const [row] = await db.insert(browserSamples).values(data).returning();
    return row;
  }

  async getBrowserSamplesByBrand(brandId: string, limit = 100): Promise<BrowserSample[]> {
    return await db.select().from(browserSamples)
      .where(eq(browserSamples.brandId, brandId))
      .orderBy(desc(browserSamples.capturedAt))
      .limit(limit);
  }

  // ============= EXECUTION AGENTS + CMS (Epic D) =============

  async getCmsConnectionsByBrand(brandId: string): Promise<CmsConnection[]> {
    return await db.select().from(cmsConnections)
      .where(eq(cmsConnections.brandId, brandId))
      .orderBy(desc(cmsConnections.createdAt));
  }

  async getCmsConnection(id: string): Promise<CmsConnection | undefined> {
    const [row] = await db.select().from(cmsConnections).where(eq(cmsConnections.id, id));
    return row;
  }

  async createCmsConnection(data: InsertCmsConnection): Promise<CmsConnection> {
    const [row] = await db.insert(cmsConnections).values(data).returning();
    return row;
  }

  async updateCmsConnection(id: string, data: Partial<InsertCmsConnection>): Promise<CmsConnection> {
    const [row] = await db.update(cmsConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(cmsConnections.id, id))
      .returning();
    return row;
  }

  async deleteCmsConnection(id: string): Promise<void> {
    await db.delete(cmsConnections).where(eq(cmsConnections.id, id));
  }

  async getAgentTasksByBrand(brandId: string, limit = 100): Promise<AgentTask[]> {
    return await db.select().from(agentTasks)
      .where(eq(agentTasks.brandId, brandId))
      .orderBy(desc(agentTasks.createdAt))
      .limit(limit);
  }

  async getAgentTask(id: string): Promise<AgentTask | undefined> {
    const [row] = await db.select().from(agentTasks).where(eq(agentTasks.id, id));
    return row;
  }

  async createAgentTask(data: InsertAgentTask): Promise<AgentTask> {
    const [row] = await db.insert(agentTasks).values(data).returning();
    return row;
  }

  async updateAgentTask(id: string, data: Partial<InsertAgentTask>): Promise<AgentTask> {
    const [row] = await db.update(agentTasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agentTasks.id, id))
      .returning();
    return row;
  }

  // ============= FACT CLAIMS / HALLUCINATION CORRECTION (Epic H) =============

  async getFactClaimsByBrand(brandId: string, status?: string, limit = 200): Promise<FactClaim[]> {
    const conditions = [eq(factClaims.brandId, brandId)];
    if (status) conditions.push(eq(factClaims.status, status));
    return await db.select().from(factClaims)
      .where(and(...conditions))
      .orderBy(desc(factClaims.detectedAt))
      .limit(limit);
  }

  async getFactClaim(id: string): Promise<FactClaim | undefined> {
    const [row] = await db.select().from(factClaims).where(eq(factClaims.id, id));
    return row;
  }

  async createFactClaim(data: InsertFactClaim): Promise<FactClaim> {
    const [row] = await db.insert(factClaims).values(data).returning();
    return row;
  }

  async updateFactClaim(id: string, data: Partial<InsertFactClaim>): Promise<FactClaim> {
    const [row] = await db.update(factClaims)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(factClaims.id, id))
      .returning();
    return row;
  }

  // ============= AGGREGATE DATASET (Epic O) =============

  async clearAggregateDataset(): Promise<void> {
    await db.delete(aggregateDatasetEntries);
  }

  async createAggregateDatasetEntry(data: InsertAggregateDatasetEntry): Promise<AggregateDatasetEntry> {
    const [row] = await db.insert(aggregateDatasetEntries).values(data).returning();
    return row;
  }

  async getAggregateDataset(minContributors = 5): Promise<AggregateDatasetEntry[]> {
    return await db.select().from(aggregateDatasetEntries)
      .where(gte(aggregateDatasetEntries.contributorCount, minContributors))
      .orderBy(desc(aggregateDatasetEntries.promptCount));
  }

  async getAggregateContributorBrands(): Promise<Brand[]> {
    return await db.select().from(brands).where(eq(brands.contributesToAggregate, true));
  }

  // ============= PUBLIC API KEYS + WEBHOOKS (Epic L) =============

  async createApiKey(data: InsertApiKey): Promise<ApiKey> {
    const [row] = await db.insert(apiKeys).values(data).returning();
    return row;
  }

  async getApiKeysByUser(userId: string): Promise<ApiKey[]> {
    return await db.select().from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [row] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.status, 'active')));
    return row;
  }

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return row;
  }

  async touchApiKey(id: string): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async revokeApiKey(id: string): Promise<void> {
    await db.update(apiKeys).set({ status: 'revoked', revokedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async createWebhookSubscription(data: InsertWebhookSubscription): Promise<WebhookSubscription> {
    const [row] = await db.insert(webhookSubscriptions).values(data).returning();
    return row;
  }

  async getWebhookSubscriptionsByUser(userId: string): Promise<WebhookSubscription[]> {
    return await db.select().from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.userId, userId))
      .orderBy(desc(webhookSubscriptions.createdAt));
  }

  async getActiveWebhooksForEvent(event: string, brandId?: string): Promise<WebhookSubscription[]> {
    const conditions = [eq(webhookSubscriptions.event, event), eq(webhookSubscriptions.isActive, true)];
    const rows = await db.select().from(webhookSubscriptions).where(and(...conditions));
    return brandId ? rows.filter((r) => !r.brandId || r.brandId === brandId) : rows;
  }

  async getWebhookSubscription(id: string): Promise<WebhookSubscription | undefined> {
    const [row] = await db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.id, id));
    return row;
  }

  async deleteWebhookSubscription(id: string): Promise<void> {
    await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, id));
  }

  // ============= VISIBILITY SCORES =============

  async getVisibilityScoresByBrand(brandId: string, period?: string, limit = 30): Promise<VisibilityScore[]> {
    const conditions: any[] = [eq(visibilityScores.brandId, brandId)];
    if (period) {
      const daysMatch = period.match(/^(\d+)d$/);
      if (daysMatch) {
        const days = parseInt(daysMatch[1]);
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        conditions.push(gte(visibilityScores.periodStart, cutoff));
      } else {
        conditions.push(eq(visibilityScores.period, period));
      }
    }

    return await db.select().from(visibilityScores)
      .where(and(...conditions))
      .orderBy(desc(visibilityScores.periodStart))
      .limit(limit);
  }

  async getLatestVisibilityScore(brandId: string): Promise<VisibilityScore | undefined> {
    const [score] = await db.select().from(visibilityScores)
      .where(eq(visibilityScores.brandId, brandId))
      .orderBy(desc(visibilityScores.periodStart))
      .limit(1);
    return score;
  }

  async createVisibilityScore(data: InsertVisibilityScore): Promise<VisibilityScore> {
    const [score] = await db.insert(visibilityScores).values(data).returning();
    return score;
  }

  // ============= TREND SNAPSHOTS =============

  async getTrendSnapshotsByBrand(brandId: string, limit = 90): Promise<TrendSnapshot[]> {
    return await db.select().from(trendSnapshots)
      .where(eq(trendSnapshots.brandId, brandId))
      .orderBy(desc(trendSnapshots.snapshotDate))
      .limit(limit);
  }

  async createTrendSnapshot(data: InsertTrendSnapshot): Promise<TrendSnapshot> {
    const [snapshot] = await db.insert(trendSnapshots).values(data).returning();
    return snapshot;
  }

  // ============= JOB RUNS =============

  async getJobRunsByJob(jobId: string, limit = 50): Promise<JobRun[]> {
    return await db.select().from(jobRuns)
      .where(eq(jobRuns.jobId, jobId))
      .orderBy(desc(jobRuns.createdAt))
      .limit(limit);
  }

  async getLatestJobRun(jobId: string): Promise<JobRun | undefined> {
    const [run] = await db.select().from(jobRuns)
      .where(eq(jobRuns.jobId, jobId))
      .orderBy(desc(jobRuns.createdAt))
      .limit(1);
    return run;
  }

  async createJobRun(data: InsertJobRun): Promise<JobRun> {
    const [run] = await db.insert(jobRuns).values(data).returning();
    return run;
  }

  async updateJobRun(id: string, data: Partial<InsertJobRun>): Promise<JobRun> {
    const [updated] = await db
      .update(jobRuns)
      .set(data)
      .where(eq(jobRuns.id, id))
      .returning();
    return updated;
  }

  // ============= JOB ERRORS =============

  async getJobErrorsByJob(jobId: string, limit = 50): Promise<JobError[]> {
    return await db.select().from(jobErrors)
      .where(eq(jobErrors.jobId, jobId))
      .orderBy(desc(jobErrors.createdAt))
      .limit(limit);
  }

  async getUnresolvedJobErrors(limit = 100): Promise<JobError[]> {
    return await db.select().from(jobErrors)
      .where(eq(jobErrors.isResolved, false))
      .orderBy(desc(jobErrors.createdAt))
      .limit(limit);
  }

  async createJobError(data: InsertJobError): Promise<JobError> {
    const [error] = await db.insert(jobErrors).values(data).returning();
    return error;
  }

  async updateJobError(id: string, data: Partial<InsertJobError>): Promise<JobError> {
    const [updated] = await db
      .update(jobErrors)
      .set(data)
      .where(eq(jobErrors.id, id))
      .returning();
    return updated;
  }

  // ============= AXP PAGES =============

  async getAxpPagesByBrand(brandId: string): Promise<AxpPage[]> {
    return await db.select().from(axpPages)
      .where(eq(axpPages.brandId, brandId))
      .orderBy(desc(axpPages.createdAt));
  }

  async getAxpPage(id: string): Promise<AxpPage | undefined> {
    const [page] = await db.select().from(axpPages).where(eq(axpPages.id, id));
    return page;
  }

  async getAxpPageBySlug(brandId: string, slug: string): Promise<AxpPage | undefined> {
    const [page] = await db.select().from(axpPages)
      .where(and(eq(axpPages.brandId, brandId), eq(axpPages.slug, slug)));
    return page;
  }

  async createAxpPage(data: InsertAxpPage): Promise<AxpPage> {
    const [page] = await db.insert(axpPages).values(data).returning();
    return page;
  }

  async updateAxpPage(id: string, data: Partial<InsertAxpPage>): Promise<AxpPage> {
    const [updated] = await db
      .update(axpPages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(axpPages.id, id))
      .returning();
    return updated;
  }

  async deleteAxpPage(id: string): Promise<void> {
    await db.delete(axpPages).where(eq(axpPages.id, id));
  }

  // ============= AXP VERSIONS =============

  async getAxpVersionsByPage(pageId: string): Promise<AxpVersion[]> {
    return await db.select().from(axpVersions)
      .where(eq(axpVersions.pageId, pageId))
      .orderBy(desc(axpVersions.versionNumber));
  }

  async getAxpVersion(id: string): Promise<AxpVersion | undefined> {
    const [version] = await db.select().from(axpVersions).where(eq(axpVersions.id, id));
    return version;
  }

  async createAxpVersion(data: InsertAxpVersion): Promise<AxpVersion> {
    const [version] = await db.insert(axpVersions).values(data).returning();
    return version;
  }

  // ============= FAQ ENTRIES =============

  async getFaqEntriesByBrand(brandId: string): Promise<FaqEntry[]> {
    return await db.select().from(faqEntries)
      .where(eq(faqEntries.brandId, brandId))
      .orderBy(faqEntries.displayOrder, desc(faqEntries.createdAt));
  }

  async getFaqEntriesByPage(axpPageId: string): Promise<FaqEntry[]> {
    return await db.select().from(faqEntries)
      .where(eq(faqEntries.axpPageId, axpPageId))
      .orderBy(faqEntries.displayOrder);
  }

  async getFaqEntry(id: string): Promise<FaqEntry | undefined> {
    const [entry] = await db.select().from(faqEntries).where(eq(faqEntries.id, id));
    return entry;
  }

  async createFaqEntry(data: InsertFaqEntry): Promise<FaqEntry> {
    const [entry] = await db.insert(faqEntries).values(data).returning();
    return entry;
  }

  async updateFaqEntry(id: string, data: Partial<InsertFaqEntry>): Promise<FaqEntry> {
    const [updated] = await db
      .update(faqEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(faqEntries.id, id))
      .returning();
    return updated;
  }

  async deleteFaqEntry(id: string): Promise<void> {
    await db.delete(faqEntries).where(eq(faqEntries.id, id));
  }

  // ============= SCHEMA TEMPLATES =============

  async getSchemaTemplatesByBrand(brandId: string): Promise<SchemaTemplate[]> {
    return await db.select().from(schemaTemplates)
      .where(eq(schemaTemplates.brandId, brandId))
      .orderBy(desc(schemaTemplates.createdAt));
  }

  async getGlobalSchemaTemplates(): Promise<SchemaTemplate[]> {
    return await db.select().from(schemaTemplates)
      .where(eq(schemaTemplates.isGlobal, true))
      .orderBy(schemaTemplates.schemaType);
  }

  async getSchemaTemplate(id: string): Promise<SchemaTemplate | undefined> {
    const [template] = await db.select().from(schemaTemplates).where(eq(schemaTemplates.id, id));
    return template;
  }

  async createSchemaTemplate(data: InsertSchemaTemplate): Promise<SchemaTemplate> {
    const [template] = await db.insert(schemaTemplates).values(data).returning();
    return template;
  }

  async updateSchemaTemplate(id: string, data: Partial<InsertSchemaTemplate>): Promise<SchemaTemplate> {
    const [updated] = await db
      .update(schemaTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schemaTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteSchemaTemplate(id: string): Promise<void> {
    await db.delete(schemaTemplates).where(eq(schemaTemplates.id, id));
  }

  // ============= SCHEMA VERSIONS =============

  async getSchemaVersionsByTemplate(templateId: string): Promise<SchemaVersion[]> {
    return await db.select().from(schemaVersions)
      .where(eq(schemaVersions.templateId, templateId))
      .orderBy(desc(schemaVersions.versionNumber));
  }

  async getSchemaVersion(id: string): Promise<SchemaVersion | undefined> {
    const [version] = await db.select().from(schemaVersions).where(eq(schemaVersions.id, id));
    return version;
  }

  async createSchemaVersion(data: InsertSchemaVersion): Promise<SchemaVersion> {
    const [version] = await db.insert(schemaVersions).values(data).returning();
    return version;
  }

  // ============= SUBSCRIPTIONS =============

  async getSubscriptionByBrand(brandId: string): Promise<Subscription | undefined> {
    const [subscription] = await db.select().from(subscriptions)
      .where(eq(subscriptions.brandId, brandId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return subscription;
  }

  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const [subscription] = await db.insert(subscriptions).values(data).returning();
    return subscription;
  }

  async updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription> {
    const [updated] = await db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return updated;
  }

  // ============= INVOICES =============

  async getInvoicesByBrand(brandId: string, limit = 50): Promise<Invoice[]> {
    return await db.select().from(invoices)
      .where(eq(invoices.brandId, brandId))
      .orderBy(desc(invoices.createdAt))
      .limit(limit);
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const payload: any = { ...data };
    const today = new Date();
    const datePart = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}${String(today.getUTCDate()).padStart(2, "0")}`;

    // Backfill and webhook paths may not provide an invoice number.
    // Generate one here so invoice creation remains reliable.
    if (!payload.invoiceNumber || !String(payload.invoiceNumber).trim()) {
      payload.invoiceNumber = `INV-${datePart}-${Math.floor(100000 + Math.random() * 900000)}`;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const [invoice] = await db.insert(invoices).values(payload).returning();
        return invoice;
      } catch (error: any) {
        if (error?.code === "23505" && String(error?.constraint || "").includes("invoice_number")) {
          payload.invoiceNumber = `INV-${datePart}-${Math.floor(100000 + Math.random() * 900000)}`;
          continue;
        }
        throw error;
      }
    }

    throw new Error("Failed to generate a unique invoice number");
  }

  async updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice> {
    const [updated] = await db
      .update(invoices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return updated;
  }

  // ============= PAYMENTS =============

  async getPaymentsByBrand(brandId: string, limit = 50): Promise<Payment[]> {
    return await db.select().from(payments)
      .where(eq(payments.brandId, brandId))
      .orderBy(desc(payments.createdAt))
      .limit(limit);
  }

  async getPaymentsByInvoice(invoiceId: string): Promise<Payment[]> {
    return await db.select().from(payments)
      .where(eq(payments.invoiceId, invoiceId))
      .orderBy(desc(payments.createdAt));
  }

  async createPayment(data: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  }

  async updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment> {
    const [updated] = await db
      .update(payments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return updated;
  }

  async updatePaymentStatus(razorpayPaymentId: string, status: string): Promise<void> {
    await db.update(payments)
      .set({ status, updatedAt: new Date() })
      .where(eq(payments.razorpayPaymentId, razorpayPaymentId));
  }

  async refundPayment(razorpayPaymentId: string, refundId: string): Promise<void> {
    await db.update(payments)
      .set({ status: 'refunded', updatedAt: new Date() } as any)
      .where(eq(payments.razorpayPaymentId, razorpayPaymentId));
  }

  async setScoreOverride(brandId: string, scoreOverride: number | null, competitorOverrides: Record<string, number> | null): Promise<void> {
    await db.update(brands)
      .set({ scoreOverride, competitorOverrides, updatedAt: new Date() } as any)
      .where(eq(brands.id, brandId));
  }

  async setBrandPaymentVerified(brandId: string): Promise<void> {
    // Payment verified — brand can now reach the Activate step.
    // activationStatus stays 'pending' until the user clicks Activate.
    // We track payment-verified state via a dedicated flag so DashboardGuard
    // can distinguish "paid but not yet activated" from "not yet paid".
    await db.update(brands)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(brands.id, brandId));
    // NOTE: onboardingCompleted is set to true only after the full pipeline
    // completes in the /activate endpoint — NOT here.
  }

  async updateBrandProviderIndex(brandId: string, index: number): Promise<void> {
    await db.update(brands)
      .set({ lastProviderIndex: index, updatedAt: new Date() } as any)
      .where(eq(brands.id, brandId));
  }

  // ============= WEBHOOK EVENTS =============

  async getWebhookEvents(filters: { source?: string; processed?: boolean; limit?: number }): Promise<WebhookEvent[]> {
    const conditions = [];
    if (filters.source) conditions.push(eq(webhookEvents.source, filters.source));
    if (filters.processed !== undefined) conditions.push(eq(webhookEvents.processed, filters.processed));

    if (conditions.length > 0) {
      return await db.select().from(webhookEvents)
        .where(and(...conditions))
        .orderBy(desc(webhookEvents.createdAt))
        .limit(filters.limit || 100);
    }

    return await db.select().from(webhookEvents)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(filters.limit || 100);
  }

  async createWebhookEvent(data: InsertWebhookEvent): Promise<WebhookEvent> {
    const [event] = await db.insert(webhookEvents).values(data).returning();
    return event;
  }

  async updateWebhookEvent(id: string, data: Partial<InsertWebhookEvent>): Promise<WebhookEvent> {
    const [updated] = await db
      .update(webhookEvents)
      .set(data)
      .where(eq(webhookEvents.id, id))
      .returning();
    return updated;
  }

  // ============= BRAND CONTEXT =============

  async getBrandContext(brandId: string): Promise<BrandContext | undefined> {
    const [context] = await db.select().from(brandContext)
      .where(eq(brandContext.brandId, brandId));
    return context;
  }

  async createBrandContext(data: InsertBrandContext): Promise<BrandContext> {
    const [context] = await db.insert(brandContext).values(data).returning();
    return context;
  }

  async updateBrandContext(id: string, data: Partial<InsertBrandContext>): Promise<BrandContext> {
    const [updated] = await db
      .update(brandContext)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(brandContext.id, id))
      .returning();
    return updated;
  }

  async deleteBrandContext(id: string): Promise<void> {
    await db.delete(brandContext).where(eq(brandContext.id, id));
  }

  async upsertBrandContext(data: Record<string, any>): Promise<BrandContext> {
    const { id, createdAt, updatedAt, ...rest } = data;
    const existing = await this.getBrandContext(rest.brandId);
    if (existing) {
      return this.updateBrandContext(existing.id, rest as Partial<InsertBrandContext>);
    }
    return this.createBrandContext(rest as InsertBrandContext);
  }

  // ============= DOMAIN REGISTRY =============

  async getDomainRegistryEntry(domain: string): Promise<DomainRegistry | undefined> {
    const [entry] = await db.select().from(domainRegistry)
      .where(eq(domainRegistry.domain, domain));
    return entry;
  }

  async getAllDomainRegistryEntries(): Promise<DomainRegistry[]> {
    return await db.select().from(domainRegistry);
  }

  async upsertDomainRegistry(data: InsertDomainRegistry): Promise<DomainRegistry> {
    const existing = await this.getDomainRegistryEntry(data.domain);
    
    if (existing) {
      const [updated] = await db
        .update(domainRegistry)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(domainRegistry.domain, data.domain))
        .returning();
      return updated;
    }

    const [entry] = await db.insert(domainRegistry).values(data).returning();
    return entry;
  }

  // ============= TTL CONFIG =============

  async getTTLConfig(dataType: string): Promise<DataTtlConfig | undefined> {
    const [config] = await db.select().from(dataTtlConfig)
      .where(eq(dataTtlConfig.sourceType, dataType));
    return config;
  }

  async getAllTTLConfigs(): Promise<DataTtlConfig[]> {
    return await db.select().from(dataTtlConfig);
  }

  async upsertTTLConfig(data: InsertDataTtlConfig): Promise<DataTtlConfig> {
    const existing = await this.getTTLConfig(data.sourceType);
    
    if (existing) {
      const [updated] = await db
        .update(dataTtlConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(dataTtlConfig.sourceType, data.sourceType))
        .returning();
      return updated;
    }

    const [config] = await db.insert(dataTtlConfig).values(data).returning();
    return config;
  }

  // ============= ADDITIONAL HELPERS =============

  async getSubscription(id: string): Promise<Subscription | undefined> {
    const [subscription] = await db.select().from(subscriptions)
      .where(eq(subscriptions.id, id));
    return subscription;
  }

  async getSubscriptionByBrandId(brandId: string): Promise<Subscription | undefined> {
    return this.getSubscriptionByBrand(brandId);
  }

  async getInvoiceByRazorpayId(razorpayInvoiceId: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices)
      .where(eq(invoices.razorpayInvoiceId, razorpayInvoiceId));
    return invoice;
  }

  async getGapAnalysisByBrand(brandId: string, limit = 50): Promise<GapAnalysis[]> {
    return await db.select().from(gapAnalysis)
      .where(eq(gapAnalysis.brandId, brandId))
      .orderBy(desc(gapAnalysis.createdAt))
      .limit(limit);
  }

  async createGapAnalysis(data: InsertGapAnalysis): Promise<GapAnalysis> {
    const [analysis] = await db.insert(gapAnalysis).values(data).returning();
    return analysis;
  }

  async getRecommendationsByBrand(brandId: string, limit = 50): Promise<Recommendation[]> {
    return await db.select().from(recommendations)
      .where(eq(recommendations.brandId, brandId))
      .orderBy(desc(recommendations.createdAt))
      .limit(limit);
  }

  async createRecommendation(data: InsertRecommendation): Promise<Recommendation> {
    const [recommendation] = await db.insert(recommendations).values(data).returning();
    return recommendation;
  }

  async createUsageLog(data: InsertUsageLog): Promise<UsageLog> {
    const [log] = await db.insert(usageLogs).values(data).returning();
    return log;
  }

  async getUsageLogsByBrand(brandId: string, limit = 100): Promise<UsageLog[]> {
    return await db.select().from(usageLogs)
      .where(eq(usageLogs.brandId, brandId))
      .orderBy(desc(usageLogs.createdAt))
      .limit(limit);
  }

  // ============= SECURITY & SESSION MANAGEMENT =============

  async createLoginAttempt(data: InsertLoginAttempt): Promise<LoginAttempt> {
    const [attempt] = await db.insert(loginAttempts).values(data).returning();
    return attempt;
  }

  async getRecentLoginAttempts(email: string, minutes: number): Promise<LoginAttempt[]> {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    return await db.select().from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.email, email),
          gt(loginAttempts.attemptedAt, cutoffTime)
        )
      )
      .orderBy(desc(loginAttempts.attemptedAt));
  }

  async createAccountLockout(data: InsertAccountLockout): Promise<AccountLockout> {
    const [lockout] = await db.insert(accountLockouts).values(data).returning();
    return lockout;
  }

  async getActiveLockout(userId: string): Promise<AccountLockout | undefined> {
    const [lockout] = await db.select().from(accountLockouts)
      .where(
        and(
          eq(accountLockouts.userId, userId),
          gt(accountLockouts.lockedUntil, new Date())
        )
      )
      .orderBy(desc(accountLockouts.lockedAt))
      .limit(1);
    return lockout;
  }

  async clearAccountLockout(userId: string): Promise<void> {
    await db.update(accountLockouts)
      .set({ lockedUntil: new Date() })
      .where(eq(accountLockouts.userId, userId));
  }

  async createSession(data: InsertUserSession): Promise<UserSession> {
    const [session] = await db.insert(userSessions).values(data).returning();
    return session;
  }

  async getSession(sessionToken: string): Promise<UserSession | undefined> {
    const [session] = await db.select().from(userSessions)
      .where(
        and(
          eq(userSessions.sessionToken, sessionToken),
          eq(userSessions.isActive, true),
          gt(userSessions.expiresAt, new Date())
        )
      )
      .limit(1);
    return session;
  }

  async updateSessionActivity(sessionToken: string): Promise<void> {
    await db.update(userSessions)
      .set({ lastActivity: new Date() })
      .where(eq(userSessions.sessionToken, sessionToken));
  }

  async revokeSession(sessionToken: string, reason: string): Promise<void> {
    await db.update(userSessions)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revokeReason: reason,
      })
      .where(eq(userSessions.sessionToken, sessionToken));
  }

  async getUserSessions(userId: string): Promise<UserSession[]> {
    return await db.select().from(userSessions)
      .where(
        and(
          eq(userSessions.userId, userId),
          eq(userSessions.isActive, true),
          gt(userSessions.expiresAt, new Date())
        )
      )
      .orderBy(desc(userSessions.lastActivity));
  }

  async revokeAllUserSessions(userId: string, reason: string): Promise<void> {
    await db.update(userSessions)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revokeReason: reason,
      })
      .where(
        and(
          eq(userSessions.userId, userId),
          eq(userSessions.isActive, true)
        )
      );
  }

  async createSecurityEvent(data: InsertSecurityEvent): Promise<SecurityEvent> {
    const [event] = await db.insert(securityEvents).values(data).returning();
    return event;
  }

  async getSecurityEvents(filters: { userId?: string; eventType?: string; severity?: string; limit?: number }): Promise<SecurityEvent[]> {
    const conditions = [];
    if (filters.userId) conditions.push(eq(securityEvents.userId, filters.userId));
    if (filters.eventType) conditions.push(eq(securityEvents.eventType, filters.eventType));
    if (filters.severity) conditions.push(eq(securityEvents.severity, filters.severity));

    return await db.select().from(securityEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(securityEvents.createdAt))
      .limit(filters.limit || 100);
  }

  async addPasswordToHistory(userId: string, passwordHash: string): Promise<PasswordHistory> {
    const [history] = await db.insert(passwordHistory).values({ userId, passwordHash }).returning();
    return history;
  }

  async checkPasswordHistory(userId: string, passwordHash: string, limit: number): Promise<boolean> {
    const bcrypt = await import('bcryptjs');
    const recentPasswords = await db.select().from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(limit);

    for (const record of recentPasswords) {
      const matches = await bcrypt.compare(passwordHash, record.passwordHash);
      if (matches) return true;
    }
    return false;
  }

  // ============= API LOGS =============

  async createApiLog(data: InsertApiLog): Promise<ApiLog> {
    const [log] = await db.insert(apiLogs).values(data).returning();
    return log;
  }

  async getApiLogs(filters: { level?: string; limit?: number; offset?: number }): Promise<ApiLog[]> {
    const conditions = [];
    if (filters.level && filters.level !== 'all') {
      conditions.push(eq(apiLogs.level, filters.level));
    }
    const query = db.select().from(apiLogs);
    if (conditions.length > 0) {
      return await query.where(and(...conditions))
        .orderBy(desc(apiLogs.createdAt))
        .limit(filters.limit || 100)
        .offset(filters.offset || 0);
    }
    return await query
      .orderBy(desc(apiLogs.createdAt))
      .limit(filters.limit || 100)
      .offset(filters.offset || 0);
  }

  async getApiLogsCount(filters?: { level?: string }): Promise<number> {
    const conditions = [];
    if (filters?.level && filters.level !== 'all') {
      conditions.push(eq(apiLogs.level, filters.level));
    }
    const query = db.select({ count: count() }).from(apiLogs);
    if (conditions.length > 0) {
      const [result] = await query.where(and(...conditions));
      return result?.count || 0;
    }
    const [result] = await query;
    return result?.count || 0;
  }

  // ============= SYSTEM SETTINGS =============

  async getSystemSetting(key: string): Promise<string | null> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting?.value ?? null;
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    return await db.select().from(systemSettings);
  }

  async setSystemSetting(key: string, value: string, updatedBy?: string): Promise<SystemSetting> {
    const [existing] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    if (existing) {
      const [updated] = await db.update(systemSettings)
        .set({ value, updatedAt: new Date(), updatedBy: updatedBy || null })
        .where(eq(systemSettings.key, key))
        .returning();
      return updated;
    }
    const [created] = await db.insert(systemSettings)
      .values({ key, value, updatedBy: updatedBy || null })
      .returning();
    return created;
  }

  // ============= ALL INVOICES (Admin) =============

  async getAllInvoices(limit = 100, offset = 0): Promise<Invoice[]> {
    return await db.select().from(invoices)
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async createUserAnalyticsEvent(data: InsertUserAnalyticsEvent): Promise<UserAnalyticsEvent> {
    const [event] = await db.insert(userAnalyticsEvents).values(data).returning();
    return event;
  }

  async getUserAnalyticsEvents(filters: { userId?: string; brandId?: string; eventType?: string; sessionId?: string; pageContains?: string; since?: Date; until?: Date; limit?: number; offset?: number }): Promise<UserAnalyticsEvent[]> {
    const conditions = [];
    if (filters.userId) conditions.push(eq(userAnalyticsEvents.userId, filters.userId));
    if (filters.brandId) conditions.push(eq(userAnalyticsEvents.brandId, filters.brandId));
    if (filters.eventType) conditions.push(eq(userAnalyticsEvents.eventType, filters.eventType));
    if (filters.sessionId) conditions.push(eq(userAnalyticsEvents.sessionId, filters.sessionId));
    if (filters.pageContains) {
      conditions.push(sql`lower(${userAnalyticsEvents.pagePath}) like ${`%${filters.pageContains.toLowerCase()}%`}`);
    }
    if (filters.since) conditions.push(gte(userAnalyticsEvents.createdAt, filters.since));
    if (filters.until) conditions.push(lte(userAnalyticsEvents.createdAt, filters.until));

    return await db.select().from(userAnalyticsEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(userAnalyticsEvents.createdAt))
      .limit(filters.limit || 100)
      .offset(filters.offset || 0);
  }

  // ============= OPTIMIZATION LOGS (Phase 2.4) =============

  async createOptimizationLog(data: InsertOptimizationLog | Record<string, any>): Promise<OptimizationLog> {
    // Normalize loose diagnostic shapes ({ action, details, improvement, metrics })
    // used by error-tracker / job-retry / rate-limiter into the real columns.
    const raw = data as Record<string, any>;
    const normalized: InsertOptimizationLog = {
      brandId: raw.brandId ?? '',
      actionType: raw.actionType ?? raw.action ?? 'log',
      actionDescription: raw.actionDescription ?? raw.details ?? raw.action ?? '',
      ...(raw.topicId !== undefined ? { topicId: raw.topicId } : {}),
      ...(raw.estimatedImpact !== undefined ? { estimatedImpact: raw.estimatedImpact } : {}),
      ...(raw.actualImpact !== undefined ? { actualImpact: raw.actualImpact } : {}),
      ...(raw.status !== undefined ? { status: raw.status } : {}),
    };
    const [log] = await db.insert(optimizationLogs).values(normalized).returning();
    return log;
  }

  async getOptimizationLogsByBrand(brandId: string, limit = 50): Promise<OptimizationLog[]> {
    return await db.select().from(optimizationLogs)
      .where(eq(optimizationLogs.brandId, brandId))
      .orderBy(desc(optimizationLogs.createdAt))
      .limit(limit);
  }

  async updateOptimizationLog(id: string, data: Partial<OptimizationLog>): Promise<OptimizationLog> {
    const [updated] = await db
      .update(optimizationLogs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(optimizationLogs.id, id))
      .returning();
    return updated;
  }

  // ============= CONTENT RECOMMENDATIONS DATA TABLES =============

  async createSerpResult(data: Omit<SerpResult, 'id' | 'createdAt'>): Promise<SerpResult> {
    const [result] = await db.insert(serpResults).values(data as any).returning();
    return result;
  }

  async getSerpResultsByBrand(brandId: string, limit = 100): Promise<SerpResult[]> {
    return await db.select().from(serpResults)
      .where(eq(serpResults.brandId, brandId))
      .orderBy(desc(serpResults.sampledAt))
      .limit(limit);
  }

  async createPaaQuestion(data: Omit<PaaQuestion, 'id' | 'createdAt'>): Promise<PaaQuestion> {
    const [result] = await db.insert(paaQuestions).values(data as any).returning();
    return result;
  }

  async getPaaQuestionsByBrand(brandId: string, limit = 100): Promise<PaaQuestion[]> {
    return await db.select().from(paaQuestions)
      .where(eq(paaQuestions.brandId, brandId))
      .orderBy(desc(paaQuestions.sampledAt))
      .limit(limit);
  }

  async createSocialPerformance(data: Omit<SocialPerformance, 'id' | 'createdAt'>): Promise<SocialPerformance> {
    const [result] = await db.insert(socialPerformance).values(data as any).returning();
    return result;
  }

  async getSocialPerformanceByBrand(brandId: string, days = 30): Promise<SocialPerformance[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return await db.select().from(socialPerformance)
      .where(and(
        eq(socialPerformance.brandId, brandId),
        gte(socialPerformance.periodStart, since)
      ))
      .orderBy(desc(socialPerformance.periodStart));
  }

  async upsertKnowledgeGraphStatus(data: Omit<KnowledgeGraphStatus, 'id' | 'createdAt'>): Promise<KnowledgeGraphStatus> {
    const existing = await db.select().from(knowledgeGraphStatus)
      .where(eq(knowledgeGraphStatus.brandId, data.brandId))
      .limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(knowledgeGraphStatus)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(knowledgeGraphStatus.brandId, data.brandId))
        .returning();
      return updated;
    }
    const [result] = await db.insert(knowledgeGraphStatus).values(data as any).returning();
    return result;
  }

  async getKnowledgeGraphStatus(brandId: string): Promise<KnowledgeGraphStatus | null> {
    const [result] = await db.select().from(knowledgeGraphStatus)
      .where(eq(knowledgeGraphStatus.brandId, brandId))
      .limit(1);
    return result || null;
  }

  // ============= AGENT READINESS =============

  async getLatestAgentReadinessReport(brandId: string, scanType?: string): Promise<AgentReadinessReport | undefined> {
    const conditions = scanType
      ? and(eq(agentReadinessReports.brandId, brandId), eq(agentReadinessReports.scanType, scanType))
      : eq(agentReadinessReports.brandId, brandId);
    const [row] = await db.select().from(agentReadinessReports)
      .where(conditions)
      .orderBy(desc(agentReadinessReports.createdAt))
      .limit(1);
    return row;
  }

  async createAgentReadinessReport(data: InsertAgentReadinessReport): Promise<AgentReadinessReport> {
    const [row] = await db.insert(agentReadinessReports).values(data).returning();
    return row;
  }

  async updateAgentReadinessReport(id: string, data: Partial<InsertAgentReadinessReport>): Promise<AgentReadinessReport> {
    const [row] = await db.update(agentReadinessReports)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agentReadinessReports.id, id))
      .returning();
    return row;
  }

  // ============= ADD-ON OFFERS =============

  async getAllAddonOffers(): Promise<AddonOffer[]> {
    return db.select().from(addonOffers).orderBy(addonOffers.sortOrder, addonOffers.title);
  }

  async getAddonOffer(id: string): Promise<AddonOffer | undefined> {
    const [row] = await db.select().from(addonOffers).where(eq(addonOffers.id, id)).limit(1);
    return row;
  }

  async createAddonOffer(data: InsertAddonOffer): Promise<AddonOffer> {
    const [row] = await db.insert(addonOffers).values(data).returning();
    return row;
  }

  async updateAddonOffer(id: string, data: Partial<InsertAddonOffer>): Promise<AddonOffer> {
    const [row] = await db.update(addonOffers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(addonOffers.id, id))
      .returning();
    return row;
  }

  async deleteAddonOffer(id: string): Promise<void> {
    await db.delete(addonOffers).where(eq(addonOffers.id, id));
  }

  async getAddonOfferBrands(offerId: string): Promise<AddonOfferBrand[]> {
    return db.select().from(addonOfferBrands).where(eq(addonOfferBrands.offerId, offerId));
  }

  async getAddonOfferBrandsByBrand(brandId: string): Promise<AddonOfferBrand[]> {
    return db.select().from(addonOfferBrands).where(eq(addonOfferBrands.brandId, brandId));
  }

  async upsertAddonOfferBrand(data: InsertAddonOfferBrand): Promise<AddonOfferBrand> {
    const existing = await db.select().from(addonOfferBrands)
      .where(and(eq(addonOfferBrands.offerId, data.offerId), eq(addonOfferBrands.brandId, data.brandId)))
      .limit(1);
    if (existing[0]) {
      const [row] = await db.update(addonOfferBrands)
        .set({
          priceOverrideInr: data.priceOverrideInr ?? existing[0].priceOverrideInr,
          isEnabled: data.isEnabled ?? existing[0].isEnabled,
        })
        .where(eq(addonOfferBrands.id, existing[0].id))
        .returning();
      return row;
    }
    const [row] = await db.insert(addonOfferBrands).values(data).returning();
    return row;
  }

  async deleteAddonOfferBrand(id: string): Promise<void> {
    await db.delete(addonOfferBrands).where(eq(addonOfferBrands.id, id));
  }

  async getAddonOffersForBrand(brandId: string): Promise<(AddonOffer & { effectivePriceInr: number })[]> {
    const allOffers = await db.select().from(addonOffers).where(eq(addonOffers.isActive, true));
    const brandLinks = await this.getAddonOfferBrandsByBrand(brandId);
    const linkByOffer = new Map(brandLinks.map((l) => [l.offerId, l]));

    return allOffers
      .filter((offer) => {
        if (!offer.isActive) return false;
        if (offer.visibility === 'all') return true;
        const link = linkByOffer.get(offer.id);
        return Boolean(link?.isEnabled);
      })
      .map((offer) => {
        const link = linkByOffer.get(offer.id);
        return {
          ...offer,
          effectivePriceInr: link?.priceOverrideInr ?? offer.priceInr,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async createAddonPurchase(data: InsertAddonPurchase): Promise<AddonPurchase> {
    const [row] = await db.insert(addonPurchases).values(data).returning();
    return row;
  }

  // ============= RECOMMENDATION RANKS =============

  async getRecommendationRanksByBrand(brandId: string, limit = 100): Promise<RecommendationRank[]> {
    return await db.select().from(recommendationRanks).where(eq(recommendationRanks.brandId, brandId)).limit(limit).orderBy(desc(recommendationRanks.runAt));
  }

  // ============= ENTITY LINKS =============

  async getEntityLinksByBrand(brandId: string): Promise<EntityLink[]> {
    return await db.select().from(entityLinks).where(eq(entityLinks.brandId, brandId));
  }

  async createEntityLink(data: InsertEntityLink): Promise<EntityLink> {
    const [row] = await db.insert(entityLinks).values(data).returning();
    return row;
  }

  async updateEntityLink(id: string, data: Partial<InsertEntityLink>): Promise<EntityLink> {
    const [row] = await db.update(entityLinks).set({ ...data, updatedAt: new Date() }).where(eq(entityLinks.id, id)).returning();
    return row;
  }

  async deleteEntityLink(id: string): Promise<void> {
    await db.delete(entityLinks).where(eq(entityLinks.id, id));
  }

  // ============= ENTITY PROFILE =============

  async getEntityProfileByBrand(brandId: string): Promise<EntityProfile | null> {
    const [row] = await db.select().from(entityProfile).where(eq(entityProfile.brandId, brandId)).limit(1);
    return row || null;
  }

  async upsertEntityProfile(data: InsertEntityProfile): Promise<EntityProfile> {
    const existing = await this.getEntityProfileByBrand(data.brandId);
    if (existing) {
      const [row] = await db.update(entityProfile).set({ ...data, lastUpdated: new Date() }).where(eq(entityProfile.brandId, data.brandId)).returning();
      return row;
    }
    const [row] = await db.insert(entityProfile).values(data).returning();
    return row;
  }

  // ============= PEOPLE =============

  async getPeopleByBrand(brandId: string): Promise<Person[]> {
    return await db.select().from(people).where(eq(people.brandId, brandId));
  }

  async createPerson(data: InsertPerson): Promise<Person> {
    const [row] = await db.insert(people).values(data).returning();
    return row;
  }

  async updatePerson(id: string, data: Partial<InsertPerson>): Promise<Person> {
    const [row] = await db.update(people).set({ ...data, updatedAt: new Date() }).where(eq(people.id, id)).returning();
    return row;
  }

  // (other methods below)

  async deletePerson(id: string): Promise<void> {
    await db.delete(people).where(eq(people.id, id));
  }

  // ============= ENTITY SOCIAL PRESENCE =============

  async getEntitySocialPresenceByBrand(brandId: string): Promise<EntitySocialPresence[]> {
    return await db.select().from(entitySocialPresence).where(eq(entitySocialPresence.brandId, brandId));
  }

  async getEntitySocialPresenceByPlatform(brandId: string, platform: string): Promise<EntitySocialPresence | null> {
    const [row] = await db.select().from(entitySocialPresence).where(and(eq(entitySocialPresence.brandId, brandId), eq(entitySocialPresence.platform, platform))).limit(1);
    return row || null;
  }

  async upsertEntitySocialPresence(data: InsertEntitySocialPresence): Promise<EntitySocialPresence> {
    const existing = await this.getEntitySocialPresenceByPlatform(data.brandId, data.platform);
    if (existing) {
      const [row] = await db.update(entitySocialPresence).set({ ...data, updatedAt: new Date() }).where(eq(entitySocialPresence.id, existing.id)).returning();
      return row;
    }
    const [row] = await db.insert(entitySocialPresence).values(data).returning();
    return row;
  }

  // ============= ENTITY CO-OCCURRENCES =============

  async getEntityCooccurrencesByBrand(brandId: string): Promise<EntityCooccurrence[]> {
    return await db.select().from(entityCooccurrences).where(eq(entityCooccurrences.brandId, brandId)).orderBy(desc(entityCooccurrences.frequency));
  }

  async createEntityCooccurrence(data: InsertEntityCooccurrence): Promise<EntityCooccurrence> {
    const [row] = await db.insert(entityCooccurrences).values(data).returning();
    return row;
  }

  // ============= ENTITY DISAMBIGUATION TESTS =============

  async getEntityDisambiguationTestsByBrand(brandId: string): Promise<EntityDisambiguationTest[]> {
    return await db.select().from(entityDisambiguationTests).where(eq(entityDisambiguationTests.brandId, brandId));
  }

  async createEntityDisambiguationTest(data: InsertEntityDisambiguationTest): Promise<EntityDisambiguationTest> {
    const [row] = await db.insert(entityDisambiguationTests).values(data).returning();
    return row;
  }

  async getDisambiguationStats(brandId: string): Promise<{ provider: string | null; correct: number; total: number; rate: number }[]> {
    const rows = await db.select({
      provider: entityDisambiguationTests.llmProvider,
      correct: sql<number>`count(case when ${entityDisambiguationTests.isCorrect} = true then 1 end)`,
      total: sql<number>`count(*)`,
    }).from(entityDisambiguationTests).where(eq(entityDisambiguationTests.brandId, brandId)).groupBy(entityDisambiguationTests.llmProvider);
    return rows.map(r => ({ ...r, rate: r.total > 0 ? r.correct / r.total : 0 }));
  }

  // ============= SCHEMA INVENTORY =============

  async getSchemaInventoryByBrand(brandId: string): Promise<SchemaInventory[]> {
    return await db.select().from(schemaInventory).where(eq(schemaInventory.brandId, brandId));
  }

  async getSchemaInventoryByUrl(pageUrl: string): Promise<SchemaInventory | null> {
    const [row] = await db.select().from(schemaInventory).where(eq(schemaInventory.pageUrl, pageUrl)).limit(1);
    return row || null;
  }

  async createSchemaInventory(data: InsertSchemaInventory): Promise<SchemaInventory> {
    const [row] = await db.insert(schemaInventory).values(data).returning();
    return row;
  }

  // ============= GROUND TRUTH =============

  async getGroundTruthByBrand(brandId: string): Promise<GroundTruth[]> {
    return await db.select().from(groundTruth).where(eq(groundTruth.brandId, brandId));
  }

  async getGroundTruthByKey(brandId: string, key: string): Promise<GroundTruth | null> {
    const [row] = await db.select().from(groundTruth).where(and(eq(groundTruth.brandId, brandId), eq(groundTruth.key, key))).limit(1);
    return row || null;
  }

  async upsertGroundTruth(data: InsertGroundTruth): Promise<GroundTruth> {
    const existing = await this.getGroundTruthByKey(data.brandId, data.key);
    if (existing) {
      const [row] = await db.update(groundTruth).set({ ...data }).where(eq(groundTruth.id, existing.id)).returning();
      return row;
    }
    const [row] = await db.insert(groundTruth).values(data).returning();
    return row;
  }

  // ============= RETRIEVAL TESTS =============

  async getRetrievalTestsByBrand(brandId: string): Promise<RetrievalTest[]> {
    return await db.select().from(retrievalTests).where(eq(retrievalTests.brandId, brandId)).orderBy(desc(retrievalTests.testedAt));
  }

  async createRetrievalTest(data: InsertRetrievalTest): Promise<RetrievalTest> {
    const [row] = await db.insert(retrievalTests).values(data).returning();
    return row;
  }

  async getRetrievalStats(brandId: string): Promise<{ provider: string | null; retrieved: number; total: number; rate: number }[]> {
    const rows = await db.select({
      provider: retrievalTests.llmProvider,
      retrieved: sql<number>`count(case when ${retrievalTests.retrieved} = true then 1 end)`,
      total: sql<number>`count(*)`,
    }).from(retrievalTests).where(eq(retrievalTests.brandId, brandId)).groupBy(retrievalTests.llmProvider);
    return rows.map(r => ({ ...r, rate: r.total > 0 ? r.retrieved / r.total : 0 }));
  }

  // ============= TOPIC-ENTITY ASSOCIATIONS =============

  async getTopicEntityAssociationsByBrand(brandId: string): Promise<TopicEntityAssociation[]> {
    return await db.select().from(topicEntityAssociations).where(eq(topicEntityAssociations.brandId, brandId)).orderBy(desc(topicEntityAssociations.associationScore));
  }

  async upsertTopicEntityAssociation(data: InsertTopicEntityAssociation): Promise<TopicEntityAssociation> {
    if (data.topicId) {
      const existing = await db.select().from(topicEntityAssociations).where(and(eq(topicEntityAssociations.brandId, data.brandId), eq(topicEntityAssociations.topicId, data.topicId))).limit(1);
      if (existing.length > 0) {
        const [row] = await db.update(topicEntityAssociations).set(data).where(eq(topicEntityAssociations.id, existing[0].id)).returning();
        return row;
      }
    }
    const [row] = await db.insert(topicEntityAssociations).values(data).returning();
    return row;
  }

  // ============= COMMUNITY VALIDATION =============

  async getCommunityValidationByBrand(brandId: string): Promise<CommunityValidation[]> {
    return await db.select().from(communityValidation).where(eq(communityValidation.brandId, brandId));
  }

  async getCommunityValidationByPlatform(brandId: string, platform: string): Promise<CommunityValidation | null> {
    const [row] = await db.select().from(communityValidation).where(and(eq(communityValidation.brandId, brandId), eq(communityValidation.platform, platform))).limit(1);
    return row || null;
  }

  async upsertCommunityValidation(data: InsertCommunityValidation): Promise<CommunityValidation> {
    const existing = await this.getCommunityValidationByPlatform(data.brandId, data.platform);
    if (existing) {
      const [row] = await db.update(communityValidation).set(data).where(eq(communityValidation.id, existing.id)).returning();
      return row;
    }
    const [row] = await db.insert(communityValidation).values(data).returning();
    return row;
  }

  // Entity news mentions
  async getNewsMentionsByBrand(brandId: string): Promise<EntityNewsMention[]> {
    return await db.select().from(entityNewsMentions).where(eq(entityNewsMentions.brandId, brandId)).orderBy(desc(entityNewsMentions.publishedAt));
  }

  async createNewsMention(data: InsertEntityNewsMention): Promise<EntityNewsMention> {
    const [row] = await db.insert(entityNewsMentions).values(data).returning();
    return row;
  }

  // External quotations
  async upsertExternalQuotation(data: InsertExternalQuotation): Promise<ExternalQuotation> {
    const existing = await this.getExternalQuotationByBrand(data.brandId);
    if (existing) {
      const [row] = await db.update(externalQuotations).set(data).where(eq(externalQuotations.id, existing.id)).returning();
      return row;
    }
    const [row] = await db.insert(externalQuotations).values(data).returning();
    return row;
  }

  async getExternalQuotationByBrand(brandId: string): Promise<ExternalQuotation | null> {
    const [row] = await db.select().from(externalQuotations).where(eq(externalQuotations.brandId, brandId)).limit(1);
    return row || null;
  }

  // Brand advices
  async upsertBrandAdvice(data: InsertBrandAdvice): Promise<BrandAdvice> {
    const [row] = await db.insert(brandAdvices).values(data).returning();
    return row;
  }

  async getBrandAdvicesByBrand(brandId: string): Promise<BrandAdvice[]> {
    return await db.select().from(brandAdvices).where(eq(brandAdvices.brandId, brandId));
  }

  async getAddonPurchase(id: string): Promise<AddonPurchase | undefined> {
    const [row] = await db.select().from(addonPurchases).where(eq(addonPurchases.id, id)).limit(1);
    return row;
  }

  async updateAddonPurchase(id: string, data: Partial<InsertAddonPurchase>): Promise<AddonPurchase> {
    const [row] = await db.update(addonPurchases)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(addonPurchases.id, id))
      .returning();
    return row;
  }

  async getAddonPurchasesByBrand(brandId: string): Promise<AddonPurchase[]> {
    return db.select().from(addonPurchases)
      .where(eq(addonPurchases.brandId, brandId))
      .orderBy(desc(addonPurchases.createdAt));
  }
}

export const storage = new DatabaseStorage();
