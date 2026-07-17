import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, real, index, serial, date } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============= PLAN CAPABILITIES (Admin-configurable) =============

export const planCapabilities = pgTable("plan_capabilities", {
  id: varchar("id").primaryKey(), // free, starter, growth, enterprise
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  monthlyPrice: integer("monthly_price").notNull().default(0),
  maxCompetitors: integer("max_competitors").notNull().default(3),
  maxTopics: integer("max_topics").notNull().default(3),
  maxPrompts: integer("max_prompts").notNull().default(6),
  maxTeamMembers: integer("max_team_members").notNull().default(1),
  allowedLlmProviders: text("allowed_llm_providers").array(), // ["chatgpt", "claude", "gemini", "perplexity"]
  allowedIntegrations: text("allowed_integrations").array(), // ["gsc", "twitter", "linkedin", "reddit"]
  refreshFrequency: text("refresh_frequency").notNull().default("weekly"), // hourly, daily, weekly
  exportEnabled: boolean("export_enabled").notNull().default(false),
  apiAccessEnabled: boolean("api_access_enabled").notNull().default(false),
  whitelabelEnabled: boolean("whitelabel_enabled").notNull().default(false),
  prioritySupport: boolean("priority_support").notNull().default(false),
  customBranding: boolean("custom_branding").notNull().default(false),
  ssoEnabled: boolean("sso_enabled").notNull().default(false),
  auditLogsEnabled: boolean("audit_logs_enabled").notNull().default(false),
  dailyQueryLimit: integer("daily_query_limit").default(6),
  // ===== Feature-parity flags (design doc §16.2) =====
  browserCaptureEnabled: boolean("browser_capture_enabled").notNull().default(false),
  browserCapturePromptsPerDay: integer("browser_capture_prompts_per_day").notNull().default(0),
  crawlerAnalyticsEnabled: boolean("crawler_analytics_enabled").notNull().default(false),
  crawlerRetentionDays: integer("crawler_retention_days").notNull().default(30),
  executionAgentsEnabled: boolean("execution_agents_enabled").notNull().default(false),
  agentRunsPerMonth: integer("agent_runs_per_month").notNull().default(0),
  maxLocales: integer("max_locales").notNull().default(1),
  scheduledReportsEnabled: boolean("scheduled_reports_enabled").notNull().default(false),
  alertChannelsEnabled: boolean("alert_channels_enabled").notNull().default(false),
  agentReadinessFullEnabled: boolean("agent_readiness_full_enabled").notNull().default(false),
  agentReadinessPartialEnabled: boolean("agent_readiness_partial_enabled").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlanCapabilitySchema = createInsertSchema(planCapabilities).omit({ createdAt: true, updatedAt: true });
export type InsertPlanCapability = z.infer<typeof insertPlanCapabilitySchema>;
export type PlanCapability = typeof planCapabilities.$inferSelect;

export const featureEntitlements = pgTable("feature_entitlements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull().references(() => planCapabilities.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  limitValue: integer("limit_value"),
  resetPeriod: text("reset_period"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("feature_entitlements_plan_idx").on(table.planId),
  index("feature_entitlements_key_idx").on(table.featureKey),
]);

export const insertFeatureEntitlementSchema = createInsertSchema(featureEntitlements).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFeatureEntitlement = z.infer<typeof insertFeatureEntitlementSchema>;
export type FeatureEntitlement = typeof featureEntitlements.$inferSelect;

// ============= USERS =============

export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  phone: varchar("phone"),
  passwordHash: varchar("password_hash"),
  emailVerified: boolean("email_verified").default(false),
  verificationCode: varchar("verification_code"),
  verificationExpiry: timestamp("verification_expiry"),
  resetCode: varchar("reset_code"),
  resetExpiry: timestamp("reset_expiry"),
  profileImageUrl: varchar("profile_image_url"),
  isAdmin: boolean("is_admin").default(false),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  onboardingStep: integer("onboarding_step").default(1),
  // OAuth fields
  googleId: varchar("google_id").unique(),
  authProvider: varchar("auth_provider").default("email"), // 'email', 'google'
  profilePicture: varchar("profile_picture"),
  termsAccepted: boolean("terms_accepted").default(false),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  // Security fields
  accountLocked: boolean("account_locked").default(false),
  lockedUntil: timestamp("locked_until"),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lastFailedLogin: timestamp("last_failed_login"),
  lastLoginAt: timestamp("last_login_at"),
  lastLoginIp: varchar("last_login_ip"),
  passwordChangedAt: timestamp("password_changed_at"),
  requirePasswordChange: boolean("require_password_change").default(false),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  twoFactorSecret: varchar("two_factor_secret"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  verificationCode: true,
  verificationExpiry: true,
  resetCode: true,
  resetExpiry: true,
  emailVerified: true,
  isAdmin: true,
  onboardingCompleted: true,
  profileImageUrl: true,
});

export const signupSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number is required").regex(/^\+\d{1,4}\d{6,14}$/, "Phone must include country code (e.g., +1234567890)"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "OTP must be 6 digits"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, "OTP must be 6 digits"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============= LOGIN ATTEMPTS =============

export const loginAttempts = pgTable("login_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull(),
  ipAddress: varchar("ip_address").notNull(),
  userAgent: text("user_agent"),
  success: boolean("success").notNull().default(false),
  failureReason: varchar("failure_reason"), // 'invalid_password', 'account_locked', 'invalid_email', etc.
  attemptedAt: timestamp("attempted_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLoginAttemptSchema = createInsertSchema(loginAttempts).omit({ id: true, createdAt: true });
export type InsertLoginAttempt = z.infer<typeof insertLoginAttemptSchema>;
export type LoginAttempt = typeof loginAttempts.$inferSelect;

// ============= ACCOUNT LOCKOUTS =============

export const accountLockouts = pgTable("account_lockouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: varchar("email").notNull(),
  lockedAt: timestamp("locked_at").notNull().defaultNow(),
  lockedUntil: timestamp("locked_until").notNull(),
  reason: varchar("reason").notNull().default("too_many_failed_attempts"),
  lockCount: integer("lock_count").notNull().default(1),
  ipAddress: varchar("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAccountLockoutSchema = createInsertSchema(accountLockouts).omit({ id: true, createdAt: true });
export type InsertAccountLockout = z.infer<typeof insertAccountLockoutSchema>;
export type AccountLockout = typeof accountLockouts.$inferSelect;

// ============= USER SESSIONS =============

export const userSessions = pgTable("user_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionToken: varchar("session_token").notNull().unique(),
  ipAddress: varchar("ip_address").notNull(),
  userAgent: text("user_agent"),
  deviceInfo: jsonb("device_info"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastActivity: timestamp("last_activity").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  revokedAt: timestamp("revoked_at"),
  revokeReason: varchar("revoke_reason"), // 'logout', 'password_change', 'admin_revoke', 'suspicious_activity'
}, (table) => [
  index("user_sessions_user_active_last_activity_idx").on(table.userId, table.isActive, table.lastActivity),
  index("user_sessions_token_active_expires_idx").on(table.sessionToken, table.isActive, table.expiresAt),
]);

export const insertUserSessionSchema = createInsertSchema(userSessions).omit({ id: true, createdAt: true });
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type UserSession = typeof userSessions.$inferSelect;

// ============= SECURITY EVENTS =============

export const securityEvents = pgTable("security_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  eventType: varchar("event_type").notNull(), // 'login_success', 'failed_login', 'account_locked', 'password_change', 'session_expired', etc.
  severity: varchar("severity").notNull().default("info"), // 'info', 'warning', 'critical'
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"), // Additional context
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSecurityEventSchema = createInsertSchema(securityEvents).omit({ id: true, createdAt: true });
export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;
export type SecurityEvent = typeof securityEvents.$inferSelect;

// ============= PASSWORD HISTORY =============

export const passwordHistory = pgTable("password_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: varchar("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPasswordHistorySchema = createInsertSchema(passwordHistory).omit({ id: true, createdAt: true });
export type InsertPasswordHistory = z.infer<typeof insertPasswordHistorySchema>;
export type PasswordHistory = typeof passwordHistory.$inferSelect;

// ============= TEAM MEMBERS (Enterprise) =============

export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  email: varchar("email").notNull(),
  role: text("role").notNull().default("viewer"), // owner, admin, editor, viewer
  status: text("status").notNull().default("pending"), // pending, active, suspended
  invitedBy: varchar("invited_by").references(() => users.id),
  invitedAt: timestamp("invited_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  permissions: jsonb("permissions"), // granular permissions object
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("team_members_brand_idx").on(table.brandId),
  index("team_members_brand_status_idx").on(table.brandId, table.status),
]);

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;

// ============= BRANDS =============

export const brands = pgTable("brands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  url: text("url"),
  website: text("website"),
  crawlerIngestToken: varchar("crawler_ingest_token"), // Epic B: per-brand rotatable ingest token
  logo: text("logo"),
  industry: text("industry"),
  subindustry: text("subindustry"),
  description: text("description"),
  slogan: text("slogan"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  linkedinUrl: text("linkedin_url"),
  brandDevData: jsonb("brand_dev_data"), // Website metadata enrichment payload (legacy column name)
  tier: text("tier").notNull().default("free"), // free, starter, growth, enterprise
  entityType: text("entity_type"), // Platform, SaaS, etc
  coreTopics: text("core_topics").array(),
  brandVariations: text("brand_variations").array(), // Alternative names for detection
  targetMarket: text("target_market"),
  primaryLanguage: text("primary_language").default("en"),
  visibilityScore: real("visibility_score").default(0),
  aiTrafficEstimate: integer("ai_traffic_estimate").default(0),
  lastAnalysis: timestamp("last_analysis"),
  nextScheduledAnalysis: timestamp("next_scheduled_analysis"),
  analysisEnabled: boolean("analysis_enabled").default(true),
  status: text("status").notNull().default("active"), // active, suspended, trial
  trialEndsAt: timestamp("trial_ends_at"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  configBrandId: varchar("config_brand_id").unique(),
  scriptInstalled: boolean("script_installed").default(false),
  scriptVerifiedAt: timestamp("script_verified_at"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  activationStatus: text("activation_status").notNull().default("pending"),
  lastProviderIndex: integer("last_provider_index").notNull().default(0),
  scoreOverride: real("score_override"), // Admin-set manual override for visibility score
  competitorOverrides: jsonb("competitor_overrides"), // { [competitorId]: overridePercentage }
  contributesToAggregate: boolean("contributes_to_aggregate").notNull().default(false), // Epic O opt-in
  businessChannel: text("business_channel").default("website"), // website | shopify | amazon_seller | amazon_and_shopify
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("brands_user_created_idx").on(table.userId, table.createdAt),
  index("brands_tier_idx").on(table.tier),
  index("brands_created_idx").on(table.createdAt),
]);

export const insertBrandSchema = createInsertSchema(brands).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type Brand = typeof brands.$inferSelect;

export const brandFeatureOverrides = pgTable("brand_feature_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  limitValue: integer("limit_value"),
  expiresAt: timestamp("expires_at"),
  reason: text("reason"),
  grantedBy: varchar("granted_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("brand_feature_overrides_brand_idx").on(table.brandId),
  index("brand_feature_overrides_key_idx").on(table.featureKey),
]);

export const insertBrandFeatureOverrideSchema = createInsertSchema(brandFeatureOverrides).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBrandFeatureOverride = z.infer<typeof insertBrandFeatureOverrideSchema>;
export type BrandFeatureOverride = typeof brandFeatureOverrides.$inferSelect;

export const adminOpsTasks = pgTable("admin_ops_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  type: text("type").notNull(),
  source: text("source").notNull().default("manual"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  ownerUserId: varchar("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  dueAt: timestamp("due_at"),
  clientVisibleStatus: text("client_visible_status"),
  internalNotes: text("internal_notes"),
  clientNotes: text("client_notes"),
  checklistItems: jsonb("checklist_items").$type<string[]>().default(sql`'[]'::jsonb`),
  evidenceRequired: boolean("evidence_required").notNull().default(true),
  evidenceUrl: text("evidence_url"),
  relatedActionId: varchar("related_action_id"),
  relatedVerificationTaskId: varchar("related_verification_task_id"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("admin_ops_tasks_brand_idx").on(table.brandId),
  index("admin_ops_tasks_status_idx").on(table.status),
  index("admin_ops_tasks_type_idx").on(table.type),
  index("admin_ops_tasks_priority_idx").on(table.priority),
  index("admin_ops_tasks_brand_created_idx").on(table.brandId, table.createdAt),
  index("admin_ops_tasks_brand_status_created_idx").on(table.brandId, table.status, table.createdAt),
  index("admin_ops_tasks_desk_dedupe_idx").on(table.brandId, table.type, table.source, table.title, table.status),
]);

export const insertAdminOpsTaskSchema = createInsertSchema(adminOpsTasks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAdminOpsTask = z.infer<typeof insertAdminOpsTaskSchema>;
export type AdminOpsTask = typeof adminOpsTasks.$inferSelect;

export const adminOpsTaskEvents = pgTable("admin_ops_task_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => adminOpsTasks.id, { onDelete: "cascade" }),
  brandId: varchar("brand_id").references(() => brands.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  evidenceUrl: text("evidence_url"),
  message: text("message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("admin_ops_task_events_task_idx").on(table.taskId),
  index("admin_ops_task_events_brand_idx").on(table.brandId),
  index("admin_ops_task_events_type_idx").on(table.eventType),
  index("admin_ops_task_events_task_created_idx").on(table.taskId, table.createdAt),
  index("admin_ops_task_events_brand_created_idx").on(table.brandId, table.createdAt),
]);

export type AdminOpsTaskEvent = typeof adminOpsTaskEvents.$inferSelect;

// ============= COMPETITORS =============

export const competitors = pgTable("competitors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  logo: text("logo"),
  description: text("description"),
  industry: text("industry"),
  subindustry: text("subindustry"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  linkedinUrl: text("linkedin_url"),
  brandDevData: jsonb("brand_dev_data"), // Website metadata enrichment payload (legacy column name)
  isTracked: boolean("is_tracked").notNull().default(true),
  visibilityScore: real("visibility_score").default(0),
  trend7d: real("trend_7d").default(0),
  avgRank: real("avg_rank").default(0),
  mentions: integer("mentions").default(0),
  trafficEst: integer("traffic_est").default(0),
  threatScore: real("threat_score").default(0),
  promptOverlapPct: real("prompt_overlap_pct").default(0),
  topDominatedDomains: text("top_dominated_domains").array(),
  riskLevel: text("risk_level"), // High, Medium, Low
  riskReason: text("risk_reason"),
  lastProviderIndex: integer("last_provider_index").notNull().default(0),
  lastSampledAt: timestamp("last_sampled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("competitors_brand_idx").on(table.brandId),
]);

export const insertCompetitorSchema = createInsertSchema(competitors).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type Competitor = typeof competitors.$inferSelect;

// ============= TOPICS =============

export const topics = pgTable("topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  category: text("category").default("general"),
  importance: text("importance"), // High, Medium, Low
  promptCount: integer("prompt_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTopicSchema = createInsertSchema(topics).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type Topic = typeof topics.$inferSelect;

// ============= PROMPT TEMPLATES (Admin) =============

export const promptTemplates = pgTable("prompt_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // visibility, citation, summarization, competitive
  llmProvider: text("llm_provider").notNull(), // chatgpt, claude, gemini, perplexity, all
  template: text("template").notNull(), // Template with {{variables}}
  variables: text("variables").array(), // ["brand_name", "industry", "topic"]
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  abTestGroup: text("ab_test_group"), // A, B, or null
  abTestWeight: integer("ab_test_weight").default(50), // Weight percentage
  // Real User Prompt Mining fields
  source: text("source").default("manual"), // 'reddit', 'search', 'forum', 'manual'
  intentType: text("intent_type"), // 'comparison', 'review', 'pricing', 'howto', 'discovery'
  promptTemplates: jsonb("prompt_templates").default([]), // Multiple prompt variations
  usageCount: integer("usage_count").default(0),
  lastMinedAt: timestamp("last_mined_at"),
  miningStatus: text("mining_status").default("idle"), // 'idle', 'mining', 'completed', 'failed'
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPromptTemplateSchema = createInsertSchema(promptTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPromptTemplate = z.infer<typeof insertPromptTemplateSchema>;
export type PromptTemplate = typeof promptTemplates.$inferSelect;

// ============= PROMPTS (Brand-specific) =============

export const prompts = pgTable("prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  text: text("text").notNull(),
  category: text("category"),
  topicId: varchar("topic_id").references(() => topics.id, { onDelete: 'set null' }),
  templateId: varchar("template_id").references(() => promptTemplates.id, { onDelete: 'set null' }),
  modelsCovered: text("models_covered").array(),
  avgRank: real("avg_rank").default(0),
  visibilityPct: real("visibility_pct").default(0),
  topCompetitorId: varchar("top_competitor_id").references(() => competitors.id, { onDelete: 'set null' }),
  isBrandPresent: boolean("is_brand_present").default(false),
  priorityScore: integer("priority_score").default(0),
  sentiment: text("sentiment"), // positive, neutral, negative
  runCount: integer("run_count").default(0),
  lastChecked: timestamp("last_checked"),
  status: text("status").default("active"), // active, paused, archived
  // Tier S: intent-aware prompt scoring
  intent: text("intent").default("discovery"), // discovery|comparison|review|pricing|howto|buying|problem|local|negative|migrate
  difficulty: integer("difficulty").default(3), // 1-5
  source: text("source").default("llm_generation"), // onboarding|llm_generation|manual|mined_promoted|retrieval_test|disambiguation_test
  weight: real("weight").default(1.0), // admin-tuned, default 1.0
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("prompts_brand_id_idx").on(table.brandId),
  index("prompts_brand_intent_idx").on(table.brandId, table.intent),
]);

export const insertPromptSchema = createInsertSchema(prompts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPrompt = z.infer<typeof insertPromptSchema>;
export type Prompt = typeof prompts.$inferSelect;

// ============= PROMPT RESULTS (LLM Responses) =============

export const promptResults = pgTable("prompt_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promptId: varchar("prompt_id").notNull().references(() => prompts.id, { onDelete: 'cascade' }),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  llmProvider: text("llm_provider").notNull(), // chatgpt, claude, gemini, perplexity
  llmModel: text("llm_model"), // gpt-4, claude-3, etc
  response: text("response"),
  brandMentioned: boolean("brand_mentioned").default(false),
  brandPosition: integer("brand_position"), // Position in list (1-10)
  competitorsMentioned: text("competitors_mentioned").array(),
  citationUrls: text("citation_urls").array(),
  sentiment: text("sentiment"),
  confidence: real("confidence"),
  tokensUsed: integer("tokens_used"),
  latencyMs: integer("latency_ms"),
  cost: real("cost"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("prompt_results_prompt_id_idx").on(table.promptId),
  index("prompt_results_brand_id_idx").on(table.brandId),
]);

export const insertPromptResultSchema = createInsertSchema(promptResults).omit({ id: true, createdAt: true });
export type InsertPromptResult = z.infer<typeof insertPromptResultSchema>;
export type PromptResult = typeof promptResults.$inferSelect;

// ============= SOURCES/CITATIONS =============

export const sources = pgTable("sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  domain: text("domain").notNull(),
  url: text("url"),
  title: text("title"),
  mentions: integer("mentions").default(0),
  domainAuthority: integer("domain_authority").default(0),
  trafficValue: integer("traffic_value").default(0),
  modelsCited: text("models_cited").array(),
  citationType: text("citation_type"), // owned, earned, competitor
  sourceType: text("source_type"), // corporate, educational, news, wiki, review
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("sources_brand_id_idx").on(table.brandId),
]);

export const insertSourceSchema = createInsertSchema(sources).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type Source = typeof sources.$inferSelect;

// ============= INTEGRATIONS =============

export const integrations = pgTable("integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  type: text("type").notNull().default("integration"),
  name: text("name").notNull().default("Integration"),
  config: jsonb("config"),
  isActive: boolean("is_active").default(true),
  syncStatus: text("sync_status"),
  errorMessage: text("error_message"),
  platform: text("platform").notNull(),
  status: text("status").notNull().default("disconnected"),
  accountId: text("account_id"),
  accountName: text("account_name"),
  credentials: jsonb("credentials"),
  lastSync: timestamp("last_sync"),
  syncError: text("sync_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("integrations_brand_idx").on(table.brandId),
  index("integrations_brand_status_idx").on(table.brandId, table.status),
  index("integrations_brand_platform_idx").on(table.brandId, table.platform),
  index("integrations_brand_updated_idx").on(table.brandId, table.updatedAt),
]);

export const insertIntegrationSchema = createInsertSchema(integrations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type Integration = typeof integrations.$inferSelect;

export const integrationConnectionEvents = pgTable("integration_connection_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  eventType: text("event_type").notNull(),
  status: text("status").notNull().default("pending"),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  scopes: text("scopes").array(),
  message: text("message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("integration_connection_events_brand_idx").on(table.brandId),
  index("integration_connection_events_platform_idx").on(table.platform),
  index("integration_connection_events_brand_created_idx").on(table.brandId, table.createdAt),
]);

export const insertIntegrationConnectionEventSchema = createInsertSchema(integrationConnectionEvents).omit({ id: true, createdAt: true });
export type InsertIntegrationConnectionEvent = z.infer<typeof insertIntegrationConnectionEventSchema>;
export type IntegrationConnectionEvent = typeof integrationConnectionEvents.$inferSelect;

// ============= JOBS (Background Processing) =============

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").references(() => brands.id, { onDelete: 'cascade' }),
  type: text("type").notNull(), // brand_enrichment, competitor_analysis, prompt_execution, etc
  status: text("status").notNull().default("pending"), // pending, running, completed, failed, cancelled
  priority: integer("priority").default(0),
  payload: jsonb("payload"),
  result: jsonb("result"),
  error: text("error"),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  scheduledFor: timestamp("scheduled_for"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("jobs_brand_id_idx").on(table.brandId),
  index("jobs_brand_created_idx").on(table.brandId, table.createdAt),
  index("jobs_status_idx").on(table.status),
  index("jobs_status_priority_created_idx").on(table.status, table.priority, table.createdAt),
]);

export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

// ============= ANALYSIS SCHEDULES =============

export const analysisSchedules = pgTable("analysis_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  frequency: text("frequency").notNull().default("daily"), // hourly, daily, weekly
  isEnabled: boolean("is_enabled").notNull().default(true),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  runCount: integer("run_count").default(0),
  failCount: integer("fail_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAnalysisScheduleSchema = createInsertSchema(analysisSchedules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAnalysisSchedule = z.infer<typeof insertAnalysisScheduleSchema>;
export type AnalysisSchedule = typeof analysisSchedules.$inferSelect;

// ============= AUDIT LOGS (Enterprise) =============

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  brandId: varchar("brand_id").references(() => brands.id, { onDelete: 'set null' }),
  action: text("action").notNull(), // create, update, delete, login, export, etc
  entityType: text("entity_type").notNull(), // brand, competitor, prompt, user, etc
  entityId: varchar("entity_id"),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("audit_logs_user_id_idx").on(table.userId),
  index("audit_logs_brand_id_idx").on(table.brandId),
  index("audit_logs_created_at_idx").on(table.createdAt),
  index("audit_logs_brand_created_idx").on(table.brandId, table.createdAt),
  index("audit_logs_user_created_idx").on(table.userId, table.createdAt),
]);

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ============= AXP CONTENT (AI Experience Pages) =============

export const axpContent = pgTable("axp_content", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  content: text("content"),
  contentHtml: text("content_html"),
  schemaJson: jsonb("schema_json"), // JSON-LD schema
  status: text("status").notNull().default("draft"), // draft, published, archived
  version: integer("version").notNull().default(1),
  publishedAt: timestamp("published_at"),
  publishedBy: varchar("published_by").references(() => users.id),
  gapAnalysisId: varchar("gap_analysis_id"),
  targetPrompts: text("target_prompts").array(),
  performanceScore: real("performance_score"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAxpContentSchema = createInsertSchema(axpContent).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAxpContent = z.infer<typeof insertAxpContentSchema>;
export type AxpContent = typeof axpContent.$inferSelect;

// ============= RELATIONS =============

export const planCapabilitiesRelations = relations(planCapabilities, ({ many }) => ({
  brands: many(brands),
}));

export const usersRelations = relations(users, ({ many }) => ({
  brands: many(brands),
  teamMemberships: many(teamMembers),
  auditLogs: many(auditLogs),
}));

export const brandsRelations = relations(brands, ({ one, many }) => ({
  owner: one(users, {
    fields: [brands.userId],
    references: [users.id],
  }),
  competitors: many(competitors),
  prompts: many(prompts),
  topics: many(topics),
  sources: many(sources),
  integrations: many(integrations),
  teamMembers: many(teamMembers),
  jobs: many(jobs),
  axpContent: many(axpContent),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  brand: one(brands, {
    fields: [teamMembers.brandId],
    references: [brands.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));

export const competitorsRelations = relations(competitors, ({ one }) => ({
  brand: one(brands, {
    fields: [competitors.brandId],
    references: [brands.id],
  }),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  brand: one(brands, {
    fields: [topics.brandId],
    references: [brands.id],
  }),
  prompts: many(prompts),
}));

export const promptsRelations = relations(prompts, ({ one, many }) => ({
  brand: one(brands, {
    fields: [prompts.brandId],
    references: [brands.id],
  }),
  topic: one(topics, {
    fields: [prompts.topicId],
    references: [topics.id],
  }),
  template: one(promptTemplates, {
    fields: [prompts.templateId],
    references: [promptTemplates.id],
  }),
  results: many(promptResults),
}));

export const promptResultsRelations = relations(promptResults, ({ one }) => ({
  prompt: one(prompts, {
    fields: [promptResults.promptId],
    references: [prompts.id],
  }),
  brand: one(brands, {
    fields: [promptResults.brandId],
    references: [brands.id],
  }),
}));

export const sourcesRelations = relations(sources, ({ one }) => ({
  brand: one(brands, {
    fields: [sources.brandId],
    references: [brands.id],
  }),
}));

export const integrationsRelations = relations(integrations, ({ one }) => ({
  brand: one(brands, {
    fields: [integrations.brandId],
    references: [brands.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  brand: one(brands, {
    fields: [jobs.brandId],
    references: [brands.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
  brand: one(brands, {
    fields: [auditLogs.brandId],
    references: [brands.id],
  }),
}));

export const axpContentRelations = relations(axpContent, ({ one }) => ({
  brand: one(brands, {
    fields: [axpContent.brandId],
    references: [brands.id],
  }),
}));

// ============= DOMAIN REGISTRY (Cost-saving de-dup) =============

export const domainRegistry = pgTable("domain_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: text("domain").notNull().unique(),
  entityId: varchar("entity_id"), // Reference to enriched entity data
  enrichmentData: jsonb("enrichment_data"), // Cached enrichment results
  competitorSets: jsonb("competitor_sets"), // Shared competitor discovery
  embeddingsHash: text("embeddings_hash"), // Hash of claims graph embeddings
  claimsGraph: jsonb("claims_graph"), // Knowledge graph data
  brandDevData: jsonb("brand_dev_data"), // Website metadata enrichment cache (legacy column name)
  brandDevExpiresAt: timestamp("brand_dev_expires_at"), // metadata cache TTL
  kgWikidataData: jsonb("kg_wikidata_data"), // Knowledge Graph/Wikidata cache
  kgWikidataExpiresAt: timestamp("kg_wikidata_expires_at"), // 90d TTL
  serpData: jsonb("serp_data"), // SERP results cache
  serpExpiresAt: timestamp("serp_expires_at"), // 3-7d TTL by plan
  llmAnswersData: jsonb("llm_answers_data"), // LLM responses cache
  llmAnswersExpiresAt: timestamp("llm_answers_expires_at"), // 7-30d TTL by plan
  usageCount: integer("usage_count").default(1), // How many brands share this
  brandId: varchar("brand_id"), // First brand that registered this domain
  lastEnriched: timestamp("last_enriched"), // Last enrichment timestamp (freshness)
  lastAccessed: timestamp("last_accessed").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  domainIdx: index("domain_registry_domain_idx").on(table.domain),
}));

export const insertDomainRegistrySchema = createInsertSchema(domainRegistry).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDomainRegistry = z.infer<typeof insertDomainRegistrySchema>;
export type DomainRegistry = typeof domainRegistry.$inferSelect;

// ============= DATA TTL CONFIGURATION =============

export const dataTtlConfig = pgTable("data_ttl_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planTier: text("plan_tier").notNull(), // free, starter, growth, enterprise
  sourceType: text("source_type").notNull(), // website_metadata, kg_wikidata, llm_answers, serp
  ttlDays: integer("ttl_days").notNull(),
  refreshPriority: text("refresh_priority").default("normal"), // high, normal, low
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDataTtlConfigSchema = createInsertSchema(dataTtlConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDataTtlConfig = z.infer<typeof insertDataTtlConfigSchema>;
export type DataTtlConfig = typeof dataTtlConfig.$inferSelect;

// Default TTL rules (seeded in storage):
// website_metadata: 30d (all plans)
// kg_wikidata: 90d (all plans)
// llm_answers: free=7d, starter=14d, growth=21d, enterprise=30d
// serp: free=3d, starter=5d, growth=7d, enterprise=7d

// ============= LLM ANSWERS (Analytics Intelligence) =============

export const llmAnswers = pgTable("llm_answers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promptId: varchar("prompt_id").notNull().references(() => prompts.id, { onDelete: 'cascade' }),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  competitorId: varchar("competitor_id").references(() => competitors.id, { onDelete: 'cascade' }),
  llmProvider: text("llm_provider").notNull(), // chatgpt, claude, gemini, perplexity
  llmModel: text("llm_model").notNull(), // gpt-4, claude-3-opus, gemini-pro, etc
  rawResponse: text("raw_response").notNull(),
  parsedResponse: jsonb("parsed_response"), // Structured extraction
  responseHash: text("response_hash"), // For drift detection
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("llm_answers_prompt_id_idx").on(table.promptId),
  index("llm_answers_brand_id_idx").on(table.brandId),
  index("llm_answers_competitor_id_idx").on(table.competitorId),
  index("llm_answers_created_at_idx").on(table.createdAt),
  index("llm_answers_brand_created_idx").on(table.brandId, table.createdAt),
  index("llm_answers_brand_provider_created_idx").on(table.brandId, table.llmProvider, table.createdAt),
]);

export const insertLlmAnswerSchema = createInsertSchema(llmAnswers).omit({ id: true, createdAt: true });
export type InsertLlmAnswer = z.infer<typeof insertLlmAnswerSchema>;
export type LlmAnswer = typeof llmAnswers.$inferSelect;

// ============= PROMPT RUNS (Execution Tracking) =============

export const promptRuns = pgTable("prompt_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promptId: varchar("prompt_id").notNull().references(() => prompts.id, { onDelete: 'cascade' }),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  jobId: varchar("job_id").references(() => jobs.id, { onDelete: 'set null' }),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
  llmProvider: text("llm_provider").notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  tokensUsed: integer("tokens_used").default(0),
  cost: real("cost").default(0),
  error: text("error"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("prompt_runs_prompt_id_idx").on(table.promptId),
  index("prompt_runs_brand_id_idx").on(table.brandId),
  index("prompt_runs_status_idx").on(table.status),
  index("prompt_runs_brand_created_idx").on(table.brandId, table.createdAt),
  index("prompt_runs_brand_provider_status_created_idx").on(table.brandId, table.llmProvider, table.status, table.createdAt),
  index("prompt_runs_brand_provider_completed_idx").on(table.brandId, table.llmProvider, table.completedAt),
]);

export const insertPromptRunSchema = createInsertSchema(promptRuns).omit({ id: true, createdAt: true });
export type InsertPromptRun = z.infer<typeof insertPromptRunSchema>;
export type PromptRun = typeof promptRuns.$inferSelect;

// ============= ANSWER MENTIONS (Brand/Competitor Detection) =============

export const answerMentions = pgTable("answer_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  llmAnswerId: varchar("llm_answer_id").notNull().references(() => llmAnswers.id, { onDelete: 'cascade' }),
  brandId: varchar("brand_id").references(() => brands.id, { onDelete: 'cascade' }),
  competitorId: varchar("competitor_id").references(() => competitors.id, { onDelete: 'cascade' }),
  entityName: text("entity_name").notNull(), // Actual name mentioned
  position: integer("position"), // Rank in list (1-10)
  context: text("context"), // Surrounding text
  sentiment: text("sentiment"), // positive, neutral, negative
  confidence: real("confidence").default(0),
  isCompetitor: boolean("is_competitor").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("answer_mentions_llm_answer_id_idx").on(table.llmAnswerId),
  index("answer_mentions_brand_id_idx").on(table.brandId),
  index("answer_mentions_brand_created_idx").on(table.brandId, table.createdAt),
  index("answer_mentions_brand_competitor_created_idx").on(table.brandId, table.isCompetitor, table.createdAt),
  index("answer_mentions_competitor_id_idx").on(table.competitorId),
]);

export const insertAnswerMentionSchema = createInsertSchema(answerMentions).omit({ id: true, createdAt: true });
export type InsertAnswerMention = z.infer<typeof insertAnswerMentionSchema>;
export type AnswerMention = typeof answerMentions.$inferSelect;

// ============= ANSWER CITATIONS (Source Tracking) =============

export const answerCitations = pgTable("answer_citations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  llmAnswerId: varchar("llm_answer_id").notNull().references(() => llmAnswers.id, { onDelete: 'cascade' }),
  sourceId: varchar("source_id").references(() => sources.id, { onDelete: 'set null' }),
  url: text("url").notNull(),
  domain: text("domain").notNull(),
  title: text("title"),
  position: integer("position"), // Order in citation list
  citationType: text("citation_type"), // inline, footnote, reference
  normalizedUrl: text("normalized_url"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("answer_citations_llm_answer_id_idx").on(table.llmAnswerId),
  index("answer_citations_source_id_idx").on(table.sourceId),
]);

export const insertAnswerCitationSchema = createInsertSchema(answerCitations).omit({ id: true, createdAt: true });
export type InsertAnswerCitation = z.infer<typeof insertAnswerCitationSchema>;
export type AnswerCitation = typeof answerCitations.$inferSelect;

// ============= VISIBILITY SCORES (Aggregated Metrics) =============

export const visibilityScores = pgTable("visibility_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  competitorId: varchar("competitor_id").references(() => competitors.id, { onDelete: 'cascade' }),
  period: text("period").notNull(), // daily, weekly, monthly
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  overallScore: real("overall_score").default(0),
  mentionCount: integer("mention_count").default(0),
  avgPosition: real("avg_position").default(0),
  topPosition: integer("top_position"),
  promptsCovered: integer("prompts_covered").default(0),
  totalPrompts: integer("total_prompts").default(0),
  mentionedPrompts: integer("mentioned_prompts").default(0), // How many prompts mentioned this brand
  coverageRate: real("coverage_rate").default(0),
  sentimentScore: real("sentiment_score").default(0),
  citationCount: integer("citation_count").default(0),
  modelBreakdown: jsonb("model_breakdown"), // Per-model stats
  categoryBreakdown: jsonb("category_breakdown"), // Per-category stats
  citationScore: real("citation_score").default(0),
  wikidataBonus: integer("wikidata_bonus").default(0), // Entity bonus from Wikidata
  kgBonus: integer("kg_bonus").default(0), // Entity bonus from Knowledge Graph
  confidenceBand: real("confidence_band").default(17),
  previousScore: real("previous_score"), // Prior-period score for delta display
  totalMentions: integer("total_mentions").default(0), // Brand + competitor mentions in period
  topicScores: jsonb("topic_scores"), // Per-topic score breakdown
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("visibility_scores_brand_id_idx").on(table.brandId),
  index("visibility_scores_period_start_idx").on(table.periodStart),
  index("visibility_scores_brand_period_start_idx").on(table.brandId, table.periodStart),
  index("visibility_scores_brand_period_period_start_idx").on(table.brandId, table.period, table.periodStart),
]);

export const insertVisibilityScoreSchema = createInsertSchema(visibilityScores).omit({ id: true, createdAt: true });
export type InsertVisibilityScore = z.infer<typeof insertVisibilityScoreSchema>;
export type VisibilityScore = typeof visibilityScores.$inferSelect;

// ============= TREND SNAPSHOTS (Historical Tracking) =============

export const trendSnapshots = pgTable("trend_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  snapshotDate: timestamp("snapshot_date").notNull(),
  visibilityScore: real("visibility_score").default(0),
  mentionCount: integer("mention_count").default(0),
  avgRank: real("avg_rank").default(0),
  competitorCount: integer("competitor_count").default(0),
  topCompetitorId: varchar("top_competitor_id").references(() => competitors.id),
  marketShare: real("market_share").default(0), // % of total mentions
  trendDirection: text("trend_direction"), // up, down, stable
  changePercent: real("change_percent").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("trend_snapshots_brand_id_idx").on(table.brandId),
  index("trend_snapshots_snapshot_date_idx").on(table.snapshotDate),
]);

export const insertTrendSnapshotSchema = createInsertSchema(trendSnapshots).omit({ id: true, createdAt: true });
export type InsertTrendSnapshot = z.infer<typeof insertTrendSnapshotSchema>;
export type TrendSnapshot = typeof trendSnapshots.$inferSelect;

// ============= JOB RUNS (Execution History) =============

export const jobRuns = pgTable("job_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  runNumber: integer("run_number").notNull(),
  status: text("status").notNull().default("running"), // running, completed, failed
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  duration: integer("duration"), // milliseconds
  result: jsonb("result"),
  error: text("error"),
  logs: text("logs"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("job_runs_job_id_idx").on(table.jobId),
  index("job_runs_job_created_idx").on(table.jobId, table.createdAt),
  index("job_runs_status_idx").on(table.status),
]);

export const insertJobRunSchema = createInsertSchema(jobRuns).omit({ id: true, createdAt: true });
export type InsertJobRun = z.infer<typeof insertJobRunSchema>;
export type JobRun = typeof jobRuns.$inferSelect;

// ============= JOB ERRORS (Error Tracking) =============

export const jobErrors = pgTable("job_errors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  jobRunId: varchar("job_run_id").references(() => jobRuns.id, { onDelete: 'cascade' }),
  errorType: text("error_type").notNull(), // api_error, timeout, validation, etc
  errorMessage: text("error_message").notNull(),
  stackTrace: text("stack_trace"),
  context: jsonb("context"),
  isResolved: boolean("is_resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("job_errors_job_id_idx").on(table.jobId),
  index("job_errors_job_created_idx").on(table.jobId, table.createdAt),
  index("job_errors_is_resolved_idx").on(table.isResolved),
  index("job_errors_resolved_created_idx").on(table.isResolved, table.createdAt),
]);

export const insertJobErrorSchema = createInsertSchema(jobErrors).omit({ id: true, createdAt: true });
export type InsertJobError = z.infer<typeof insertJobErrorSchema>;
export type JobError = typeof jobErrors.$inferSelect;

// ============= AXP PAGES (AI Experience Pages) =============

export const axpPages = pgTable("axp_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  canonicalUrl: text("canonical_url"),
  status: text("status").notNull().default("draft"), // draft, published, archived
  currentVersionId: varchar("current_version_id"),
  publishedVersionId: varchar("published_version_id"),
  targetPrompts: text("target_prompts").array(),
  targetKeywords: text("target_keywords").array(),
  performanceScore: real("performance_score").default(0),
  viewCount: integer("view_count").default(0),
  botViewCount: integer("bot_view_count").default(0),
  lastCrawled: timestamp("last_crawled"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("axp_pages_brand_id_idx").on(table.brandId),
  index("axp_pages_brand_created_idx").on(table.brandId, table.createdAt),
  index("axp_pages_brand_status_created_idx").on(table.brandId, table.status, table.createdAt),
  index("axp_pages_slug_idx").on(table.slug),
]);

export const insertAxpPageSchema = createInsertSchema(axpPages).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAxpPage = z.infer<typeof insertAxpPageSchema>;
export type AxpPage = typeof axpPages.$inferSelect;

// ============= AXP VERSIONS (Version Control) =============

export const axpVersions = pgTable("axp_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pageId: varchar("page_id").notNull().references(() => axpPages.id, { onDelete: 'cascade' }),
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull(),
  contentHtml: text("content_html").notNull(),
  schemaJson: jsonb("schema_json"),
  changeDescription: text("change_description"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("axp_versions_page_id_idx").on(table.pageId),
]);

export const insertAxpVersionSchema = createInsertSchema(axpVersions).omit({ id: true, createdAt: true });
export type InsertAxpVersion = z.infer<typeof insertAxpVersionSchema>;
export type AxpVersion = typeof axpVersions.$inferSelect;

// ============= FAQ ENTRIES (Frequently Asked Questions) =============

export const faqEntries = pgTable("faq_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  axpPageId: varchar("axp_page_id").references(() => axpPages.id, { onDelete: 'set null' }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category"),
  evidenceUrls: text("evidence_urls").array(),
  publishMode: text("publish_mode").notNull().default("hidden"), // hidden, axp, website, both
  displayOrder: integer("display_order").default(0),
  viewCount: integer("view_count").default(0),
  helpfulCount: integer("helpful_count").default(0),
  notHelpfulCount: integer("not_helpful_count").default(0),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("faq_entries_brand_id_idx").on(table.brandId),
  index("faq_entries_brand_order_created_idx").on(table.brandId, table.displayOrder, table.createdAt),
  index("faq_entries_axp_page_id_idx").on(table.axpPageId),
  index("faq_entries_page_order_idx").on(table.axpPageId, table.displayOrder),
]);

export const insertFaqEntrySchema = createInsertSchema(faqEntries).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFaqEntry = z.infer<typeof insertFaqEntrySchema>;
export type FaqEntry = typeof faqEntries.$inferSelect;

// ============= SCHEMA TEMPLATES (JSON-LD Templates) =============

export const schemaTemplates = pgTable("schema_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").references(() => brands.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  schemaType: text("schema_type").notNull(), // Organization, Product, FAQPage, Article, LocalBusiness, BreadcrumbList
  template: jsonb("template").notNull(),
  isGlobal: boolean("is_global").default(false), // Admin-created global templates
  isActive: boolean("is_active").default(true),
  currentVersionId: varchar("current_version_id"),
  usageCount: integer("usage_count").default(0),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("schema_templates_brand_id_idx").on(table.brandId),
  index("schema_templates_brand_created_idx").on(table.brandId, table.createdAt),
  index("schema_templates_schema_type_idx").on(table.schemaType),
  index("schema_templates_global_type_idx").on(table.isGlobal, table.schemaType),
]);

export const insertSchemaTemplateSchema = createInsertSchema(schemaTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSchemaTemplate = z.infer<typeof insertSchemaTemplateSchema>;
export type SchemaTemplate = typeof schemaTemplates.$inferSelect;

// ============= SCHEMA VERSIONS (Template Version Control) =============

export const schemaVersions = pgTable("schema_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => schemaTemplates.id, { onDelete: 'cascade' }),
  versionNumber: integer("version_number").notNull(),
  template: jsonb("template").notNull(),
  changeDescription: text("change_description"),
  validationStatus: text("validation_status").default("valid"), // valid, invalid, warning
  validationErrors: jsonb("validation_errors"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("schema_versions_template_id_idx").on(table.templateId),
]);

export const insertSchemaVersionSchema = createInsertSchema(schemaVersions).omit({ id: true, createdAt: true });
export type InsertSchemaVersion = z.infer<typeof insertSchemaVersionSchema>;
export type SchemaVersion = typeof schemaVersions.$inferSelect;

// ============= SUBSCRIPTIONS (Billing) =============

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  planId: varchar("plan_id").notNull().references(() => planCapabilities.id),
  status: text("status").notNull().default("active"), // active, cancelled, past_due, trialing
  billingCycle: text("billing_cycle").notNull().default("monthly"), // monthly, yearly
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  cancelAt: timestamp("cancel_at"),
  canceledAt: timestamp("canceled_at"),
  trialStart: timestamp("trial_start"),
  trialEnd: timestamp("trial_end"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  razorpaySubscriptionId: varchar("razorpay_subscription_id"),
  currency: varchar("currency").notNull().default("INR"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("subscriptions_brand_id_idx").on(table.brandId),
  index("subscriptions_status_idx").on(table.status),
]);

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// ============= INVOICES (Billing Records) =============

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  subscriptionId: varchar("subscription_id").references(() => subscriptions.id, { onDelete: 'set null' }),
  invoiceNumber: varchar("invoice_number").notNull().unique(),
  status: text("status").notNull().default("draft"), // draft, open, paid, void, uncollectible
  amount: integer("amount").notNull(), // in cents
  currency: varchar("currency").notNull().default("INR"),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  stripeInvoiceId: varchar("stripe_invoice_id"),
  razorpayInvoiceId: varchar("razorpay_invoice_id"),
  razorpayPaymentId: varchar("razorpay_payment_id"),
  pdfUrl: text("pdf_url"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("invoices_brand_id_idx").on(table.brandId),
  index("invoices_created_idx").on(table.createdAt),
  index("invoices_brand_created_idx").on(table.brandId, table.createdAt),
  index("invoices_brand_razorpay_payment_idx").on(table.brandId, table.razorpayPaymentId),
  index("invoices_status_idx").on(table.status),
]);

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// ============= PAYMENTS (Payment Tracking) =============

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  invoiceId: varchar("invoice_id").references(() => invoices.id, { onDelete: 'set null' }),
  amount: integer("amount").notNull(), // in cents
  currency: varchar("currency").notNull().default("INR"),
  status: text("status").notNull().default("pending"), // pending, succeeded, failed, refunded
  paymentMethod: text("payment_method"), // card, upi, netbanking, wallet
  stripePaymentId: varchar("stripe_payment_id"),
  razorpayPaymentId: varchar("razorpay_payment_id"),
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("payments_brand_id_idx").on(table.brandId),
  index("payments_brand_created_idx").on(table.brandId, table.createdAt),
  index("payments_invoice_id_idx").on(table.invoiceId),
  index("payments_invoice_created_idx").on(table.invoiceId, table.createdAt),
  index("payments_razorpay_payment_idx").on(table.razorpayPaymentId),
  index("payments_status_idx").on(table.status),
]);

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// ============= WEBHOOK EVENTS (External Service Events) =============

export const webhookEvents = pgTable("webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: text("source").notNull(), // stripe, razorpay, clerk, etc
  eventType: text("event_type").notNull(),
  eventId: varchar("event_id").notNull(), // External event ID
  payload: jsonb("payload").notNull(),
  processed: boolean("processed").default(false),
  processedAt: timestamp("processed_at"),
  error: text("error"),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("webhook_events_source_idx").on(table.source),
  index("webhook_events_processed_idx").on(table.processed),
  index("webhook_events_event_id_idx").on(table.eventId),
]);

export const insertWebhookEventSchema = createInsertSchema(webhookEvents).omit({ id: true, createdAt: true });
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

// ============= BRAND CONTEXT (Comprehensive Brand Intelligence) =============

export const brandContext = pgTable("brand_context", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }).unique(),
  
  // Core Identity
  brandIdentity: jsonb("brand_identity"), // Name, variations, taglines, mission, values
  productServices: jsonb("product_services"), // Products, features, pricing, USPs
  targetAudience: jsonb("target_audience"), // Demographics, personas, pain points
  
  // Market Intelligence
  industryContext: jsonb("industry_context"), // Industry, trends, regulations
  competitiveLandscape: jsonb("competitive_landscape"), // Competitors, positioning, SWOT
  marketPosition: jsonb("market_position"), // Market share, growth, opportunities
  
  // Content & Messaging
  keyMessages: jsonb("key_messages"), // Core messages, value props, differentiators
  contentThemes: jsonb("content_themes"), // Topics, categories, content pillars
  brandVoice: jsonb("brand_voice"), // Tone, style, language guidelines
  
  // Claims & Evidence
  claimsGraph: jsonb("claims_graph"), // Structured claims with evidence
  evidenceSources: jsonb("evidence_sources"), // Source URLs, citations, credibility
  factChecking: jsonb("fact_checking"), // Verification status, confidence scores
  
  // AI Visibility Data
  llmPerformance: jsonb("llm_performance"), // Per-model visibility metrics
  promptCoverage: jsonb("prompt_coverage"), // Which prompts mention the brand
  citationAnalysis: jsonb("citation_analysis"), // Citation patterns, source authority
  sentimentAnalysis: jsonb("sentiment_analysis"), // Sentiment trends, context
  
  // Optimization Insights
  gapAnalysis: jsonb("gap_analysis"), // Visibility gaps, opportunities
  recommendedActions: jsonb("recommended_actions"), // Prioritized improvements
  contentRecommendations: jsonb("content_recommendations"), // Suggested content
  
  // Integration Data
  gscData: jsonb("gsc_data"), // Google Search Console insights
  socialData: jsonb("social_data"), // Social media metrics
  analyticsData: jsonb("analytics_data"), // Web analytics
  
  // Embeddings & Search
  embeddingsVector: text("embeddings_vector"), // Vector embeddings for semantic search
  searchKeywords: text("search_keywords").array(), // Optimized keywords
  semanticTopics: text("semantic_topics").array(), // Related topics
  
  // Metadata
  lastEnriched: timestamp("last_enriched"),
  enrichmentVersion: integer("enrichment_version").default(1),
  dataQualityScore: real("data_quality_score").default(0), // 0-100
  completenessScore: real("completeness_score").default(0), // 0-100
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("brand_context_brand_id_idx").on(table.brandId),
]);

export const insertBrandContextSchema = createInsertSchema(brandContext).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBrandContext = z.infer<typeof insertBrandContextSchema>;
export type BrandContext = typeof brandContext.$inferSelect;

// ============= API LOGS =============

export const apiLogs = pgTable("api_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  method: text("method").notNull(),
  url: text("url").notNull(),
  statusCode: integer("status_code").notNull(),
  responseTime: integer("response_time").notNull(),
  userId: varchar("user_id"),
  brandId: varchar("brand_id"),
  errorMessage: text("error_message"),
  level: text("level").notNull().default("info"),
  userAgent: text("user_agent"),
  ip: text("ip"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("api_logs_level_idx").on(table.level),
  index("api_logs_created_at_idx").on(table.createdAt),
  index("api_logs_level_created_idx").on(table.level, table.createdAt),
  index("api_logs_status_code_idx").on(table.statusCode),
]);

export const insertApiLogSchema = createInsertSchema(apiLogs).omit({ id: true, createdAt: true });
export type InsertApiLog = z.infer<typeof insertApiLogSchema>;
export type ApiLog = typeof apiLogs.$inferSelect;

// ============= OPTIMIZATION LOGS (Task 2.4) =============

export const optimizationLogs = pgTable("optimization_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  topicId: varchar("topic_id").references(() => topics.id, { onDelete: 'set null' }),
  actionType: text("action_type").notNull(), // 'content', 'citation', 'schema', 'keyword', 'technical'
  actionDescription: text("action_description").notNull(),
  estimatedImpact: integer("estimated_impact").default(0),
  actualImpact: integer("actual_impact"),
  status: text("status").notNull().default("pending"), // 'pending', 'applied', 'verified', 'rejected'
  appliedAt: timestamp("applied_at"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("optimization_logs_brand_idx").on(table.brandId),
  index("optimization_logs_brand_created_idx").on(table.brandId, table.createdAt),
  index("optimization_logs_topic_idx").on(table.topicId),
  index("optimization_logs_status_idx").on(table.status),
]);

export const insertOptimizationLogSchema = createInsertSchema(optimizationLogs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOptimizationLog = z.infer<typeof insertOptimizationLogSchema>;
export type OptimizationLog = typeof optimizationLogs.$inferSelect;

// ============= AGENCY CONFIGS (Phase 3.2) =============

export const agencyConfigs = pgTable("agency_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  agencyName: text("agency_name").notNull(),
  agencyLogoUrl: text("agency_logo_url"),
  primaryColor: text("primary_color").default('#2563EB'),
  secondaryColor: text("secondary_color").default('#1E40AF'),
  websiteUrl: text("website_url"),
  contactEmail: text("contact_email"),
  customDomain: text("custom_domain"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("agency_configs_user_idx").on(table.userId),
  index("agency_configs_domain_idx").on(table.customDomain),
]);

export const insertAgencyConfigSchema = createInsertSchema(agencyConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgencyConfig = z.infer<typeof insertAgencyConfigSchema>;
export type AgencyConfig = typeof agencyConfigs.$inferSelect;

// ============= REPORT SCHEDULES (Phase 3.5) =============

export const reportSchedules = pgTable("report_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  frequency: text("frequency").notNull(), // 'weekly' | 'monthly'
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly
  dayOfMonth: integer("day_of_month"), // 1-28 for monthly
  time: text("time").notNull(), // "09:00"
  reportType: text("report_type").notNull(), // 'executive' | 'full' | 'action'
  recipients: text("recipients").notNull().array(), // email array
  isActive: boolean("is_active").default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("report_schedules_brand_idx").on(table.brandId),
  index("report_schedules_brand_created_idx").on(table.brandId, table.createdAt),
  index("report_schedules_active_next_run_idx").on(table.isActive, table.nextRunAt),
]);

export const insertReportScheduleSchema = createInsertSchema(reportSchedules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReportSchedule = z.infer<typeof insertReportScheduleSchema>;
export type ReportSchedule = typeof reportSchedules.$inferSelect;

// ============= SYSTEM SETTINGS =============

export const systemSettings = pgTable("system_settings", {
  key: varchar("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by"),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ updatedAt: true });
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

// ============= USER ANALYTICS EVENTS =============

export const userAnalyticsEvents = pgTable("user_analytics_events", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  brandId: varchar("brand_id").references(() => brands.id, { onDelete: 'cascade' }),
  sessionId: varchar("session_id"),
  eventType: varchar("event_type").notNull(), // page_view, click, action, form_submit, feature_use
  pagePath: varchar("page_path"),
  pageTitle: varchar("page_title"),
  elementId: varchar("element_id"),
  elementType: varchar("element_type"),
  elementText: varchar("element_text"),
  metadata: jsonb("metadata"),
  duration: integer("duration"), // time on page in seconds
  referrer: varchar("referrer"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_analytics_user").on(table.userId),
  index("idx_analytics_brand").on(table.brandId),
  index("idx_analytics_event_type").on(table.eventType),
  index("idx_analytics_created").on(table.createdAt),
  index("idx_analytics_page").on(table.pagePath),
  index("idx_analytics_user_created").on(table.userId, table.createdAt),
  index("idx_analytics_brand_created").on(table.brandId, table.createdAt),
  index("idx_analytics_event_created").on(table.eventType, table.createdAt),
  index("idx_analytics_brand_event_created").on(table.brandId, table.eventType, table.createdAt),
  index("idx_analytics_brand_page_created").on(table.brandId, table.pagePath, table.createdAt),
  index("idx_analytics_user_event_created").on(table.userId, table.eventType, table.createdAt),
  index("idx_analytics_user_session_created").on(table.userId, table.sessionId, table.createdAt),
  index("idx_analytics_brand_session_created").on(table.brandId, table.sessionId, table.createdAt),
]);

export const insertUserAnalyticsEventSchema = createInsertSchema(userAnalyticsEvents).omit({ id: true, createdAt: true });
export type InsertUserAnalyticsEvent = z.infer<typeof insertUserAnalyticsEventSchema>;
export type UserAnalyticsEvent = typeof userAnalyticsEvents.$inferSelect;

// ============= GAP ANALYSIS (drift fix: referenced by storage/workers) =============

export const gapAnalysis = pgTable("gap_analysis_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  topicId: varchar("topic_id").references(() => topics.id, { onDelete: 'set null' }),
  gapType: text("gap_type").notNull().default("visibility"), // visibility, citation, content, sentiment
  severity: text("severity").default("medium"), // low, medium, high, critical
  title: text("title").notNull(),
  description: text("description"),
  affectedPrompts: text("affected_prompts").array(),
  opportunityScore: real("opportunity_score").default(0),
  status: text("status").notNull().default("open"), // open, addressed, dismissed
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("gap_analysis_results_brand_idx").on(table.brandId),
]);

export const insertGapAnalysisSchema = createInsertSchema(gapAnalysis).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGapAnalysis = z.infer<typeof insertGapAnalysisSchema>;
export type GapAnalysis = typeof gapAnalysis.$inferSelect;

// ============= RECOMMENDATIONS (drift fix: referenced by storage/workers) =============

export const recommendations = pgTable("recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  type: text("type").notNull().default("general"), // serp, ai_overview, paa, kg, social, content, sentiment, general
  priority: text("priority").notNull().default("medium"), // critical, high, medium, low
  title: text("title").notNull(),
  description: text("description"),
  currentValue: real("current_value"),
  potentialValue: real("potential_value"),
  effortScore: integer("effort_score"),
  impactScore: integer("impact_score"),
  impact: text("impact"),
  effort: text("effort"),
  status: text("status").notNull().default("pending"), // pending, in_progress, done, dismissed
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("recommendations_brand_idx").on(table.brandId),
  index("recommendations_status_idx").on(table.status),
]);

export const insertRecommendationSchema = createInsertSchema(recommendations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
export type Recommendation = typeof recommendations.$inferSelect;

// ============= USAGE LOGS (drift fix: referenced by billing webhook) =============

export const usageLogs = pgTable("usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").references(() => brands.id, { onDelete: 'set null' }),
  type: text("type").notNull(), // payment, payment_failed, refund, api_call, analysis, ...
  amount: real("amount"),
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("usage_logs_brand_idx").on(table.brandId),
  index("usage_logs_type_idx").on(table.type),
]);

export const insertUsageLogSchema = createInsertSchema(usageLogs).omit({ id: true, createdAt: true });
export type InsertUsageLog = z.infer<typeof insertUsageLogSchema>;
export type UsageLog = typeof usageLogs.$inferSelect;

// ============= ALERT RULES (Epic K) =============

export const alertRules = pgTable("alert_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  metric: varchar("metric").notNull(), // score_drop | competitor_overtake | new_citation | factuality_flag | crawler_anomaly
  comparator: varchar("comparator").notNull().default("lt"), // lt | gt | pct_drop | pct_gain | any
  threshold: real("threshold"),
  channel: varchar("channel").notNull().default("email"), // email | slack | teams
  destination: text("destination"), // email address or webhook URL
  isActive: boolean("is_active").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  cooldownMinutes: integer("cooldown_minutes").notNull().default(360),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("alert_rules_brand_idx").on(table.brandId),
  index("alert_rules_brand_created_idx").on(table.brandId, table.createdAt),
  index("alert_rules_active_idx").on(table.isActive),
]);

export const insertAlertRuleSchema = createInsertSchema(alertRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAlertRule = z.infer<typeof insertAlertRuleSchema>;
export type AlertRule = typeof alertRules.$inferSelect;

// ============= ALERT EVENTS (Epic K) =============

export const alertEvents = pgTable("alert_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleId: varchar("rule_id").references(() => alertRules.id, { onDelete: 'cascade' }),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  metric: varchar("metric").notNull(),
  severity: varchar("severity").notNull().default("info"), // info | warning | critical
  title: text("title").notNull(),
  message: text("message"),
  value: real("value"),
  previousValue: real("previous_value"),
  channel: varchar("channel"),
  deliveryStatus: varchar("delivery_status").notNull().default("pending"), // pending | sent | failed | skipped
  deliveryError: text("delivery_error"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("alert_events_brand_idx").on(table.brandId),
  index("alert_events_brand_created_idx").on(table.brandId, table.createdAt),
  index("alert_events_rule_idx").on(table.ruleId),
]);

export const insertAlertEventSchema = createInsertSchema(alertEvents).omit({ id: true, createdAt: true });
export type InsertAlertEvent = z.infer<typeof insertAlertEventSchema>;
export type AlertEvent = typeof alertEvents.$inferSelect;

// ============= ATTRIBUTION SNAPSHOTS (Epic E) =============

export const attributionSnapshots = pgTable("attribution_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  source: varchar("source").notNull().default("ga4"), // ga4 | gsc | crawler | combined
  aiReferralSessions: integer("ai_referral_sessions").notNull().default(0),
  aiReferralConversions: integer("ai_referral_conversions").notNull().default(0),
  aiAttributedRevenue: real("ai_attributed_revenue").notNull().default(0),
  brandedImpressions: integer("branded_impressions").notNull().default(0),
  brandedClicks: integer("branded_clicks").notNull().default(0),
  byEngine: jsonb("by_engine"), // { chatgpt: { sessions, conversions, revenue }, ... }
  topLandingPages: jsonb("top_landing_pages"),
  dataComplete: boolean("data_complete").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("attribution_snapshots_brand_idx").on(table.brandId),
]);

export const insertAttributionSnapshotSchema = createInsertSchema(attributionSnapshots).omit({ id: true, createdAt: true });
export type InsertAttributionSnapshot = z.infer<typeof insertAttributionSnapshotSchema>;
export type AttributionSnapshot = typeof attributionSnapshots.$inferSelect;

// ============= REPORT CARD LEADS (Epic N — public lead magnet) =============

export const reportCardLeads = pgTable("report_card_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: text("domain").notNull(),
  email: text("email"),
  brandName: text("brand_name"),
  teaserScore: real("teaser_score"),
  fullReport: jsonb("full_report"),
  unlocked: boolean("unlocked").notNull().default(false),
  ipHash: varchar("ip_hash"),
  userAgent: text("user_agent"),
  convertedUserId: varchar("converted_user_id").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  unlockedAt: timestamp("unlocked_at"),
}, (table) => [
  index("report_card_leads_domain_idx").on(table.domain),
  index("report_card_leads_email_idx").on(table.email),
]);

export const insertReportCardLeadSchema = createInsertSchema(reportCardLeads).omit({ id: true, createdAt: true });
export type InsertReportCardLead = z.infer<typeof insertReportCardLeadSchema>;
export type ReportCardLead = typeof reportCardLeads.$inferSelect;

// ============= CRAWLER LOGS (Epic B — real AI-crawler analytics) =============

export const crawlerLogs = pgTable("crawler_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  botName: varchar("bot_name").notNull(), // GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, ...
  botCategory: varchar("bot_category").notNull().default("other"), // training | search | agent | other
  engine: varchar("engine"), // chatgpt | claude | gemini | perplexity | ...
  verified: boolean("verified").notNull().default(false), // verified via IP/rDNS, not just UA string
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  path: text("path"),
  statusCode: integer("status_code"),
  method: varchar("method"),
  referrer: text("referrer"),
  visitedAt: timestamp("visited_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("crawler_logs_brand_idx").on(table.brandId),
  index("crawler_logs_visited_idx").on(table.visitedAt),
  index("crawler_logs_bot_idx").on(table.botName),
  index("crawler_logs_brand_visited_idx").on(table.brandId, table.visitedAt),
  index("crawler_logs_brand_engine_visited_idx").on(table.brandId, table.engine, table.visitedAt),
  index("crawler_logs_brand_path_visited_idx").on(table.brandId, table.path, table.visitedAt),
]);

export const insertCrawlerLogSchema = createInsertSchema(crawlerLogs).omit({ id: true, createdAt: true });
export type InsertCrawlerLog = z.infer<typeof insertCrawlerLogSchema>;
export type CrawlerLog = typeof crawlerLogs.$inferSelect;

// ============= MINED PROMPTS (Epic C1 — prompt intelligence) =============

export const minedPrompts = pgTable("mined_prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  query: text("query").notNull(),
  normalizedQuery: text("normalized_query").notNull(), // lowercased/trimmed for dedupe
  source: varchar("source").notNull(), // serp_related | serp_paa | reddit | youtube | search | manual
  intentType: varchar("intent_type").notNull().default("discovery"),
  sourceUrl: text("source_url"),
  // Real demand signals (nullable depending on source)
  upvotes: integer("upvotes"),
  commentCount: integer("comment_count"),
  viewCount: integer("view_count"),
  searchVolume: integer("search_volume"),
  demandSignal: real("demand_signal").notNull().default(0), // normalized 0-1
  priorityScore: real("priority_score").notNull().default(0), // 0-100
  status: varchar("status").notNull().default("new"), // new | promoted | dismissed
  promotedPromptId: varchar("promoted_prompt_id"),
  locale: varchar("locale"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("mined_prompts_brand_idx").on(table.brandId),
  index("mined_prompts_priority_idx").on(table.priorityScore),
]);

export const insertMinedPromptSchema = createInsertSchema(minedPrompts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMinedPrompt = z.infer<typeof insertMinedPromptSchema>;
export type MinedPrompt = typeof minedPrompts.$inferSelect;

// ============= RECOMMENDATION RANKS (Tier S5 — AI Recommendation Share) =============
// Records the rank assigned to the brand in a single LLM response (1 = top recommendation).
// Used to compute AI Recommendation Share: how often the brand is recommended (top-3) across providers.

export const recommendationRanks = pgTable("recommendation_ranks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  promptId: varchar("prompt_id").references(() => prompts.id, { onDelete: 'set null' }),
  promptText: text("prompt_text").notNull(),
  llmProvider: varchar("llm_provider").notNull(), // chatgpt | claude | gemini | perplexity
  llmModel: text("llm_model"),
  rank: integer("rank"), // 1-10 when the brand was mentioned in a list; null if not mentioned
  isRecommended: boolean("is_recommended").notNull().default(false), // true if rank <= 3
  totalBrandsInResponse: integer("total_brands_in_response").default(0),
  rawResponse: text("raw_response"),
  // Top brands the LLM mentioned in this response (e.g., "Notion, Airtable, ExampleBrand, ...")
  topBrands: jsonb("top_brands").$type<string[]>().default([]),
  // Intent bucket at the moment the test ran
  intent: varchar("intent"),
  runAt: timestamp("run_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("recommendation_ranks_brand_idx").on(table.brandId),
  index("recommendation_ranks_brand_run_idx").on(table.brandId, table.runAt),
  index("recommendation_ranks_provider_idx").on(table.brandId, table.llmProvider),
]);

export const insertRecommendationRankSchema = createInsertSchema(recommendationRanks).omit({ id: true, createdAt: true });
export type InsertRecommendationRank = z.infer<typeof insertRecommendationRankSchema>;
export type RecommendationRank = typeof recommendationRanks.$inferSelect;

// ============= SOCIAL CITATIONS (Epic G — Reddit/YouTube citation tracking) =============

export const socialCitations = pgTable("social_citations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  platform: varchar("platform").notNull(), // reddit | youtube
  externalId: varchar("external_id").notNull(), // post/video id for dedupe
  title: text("title"),
  url: text("url"),
  author: text("author"),
  subredditOrChannel: text("subreddit_or_channel"),
  snippet: text("snippet"),
  sentiment: varchar("sentiment"), // positive | neutral | negative
  upvotes: integer("upvotes"),
  commentCount: integer("comment_count"),
  viewCount: integer("view_count"),
  publishedAt: timestamp("published_at"),
  discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("social_citations_brand_idx").on(table.brandId),
  index("social_citations_platform_idx").on(table.platform),
]);

export const insertSocialCitationSchema = createInsertSchema(socialCitations).omit({ id: true, createdAt: true });
export type InsertSocialCitation = z.infer<typeof insertSocialCitationSchema>;
export type SocialCitation = typeof socialCitations.$inferSelect;

// ============= BRAND LOCALES (Epic F — multi-language/region) =============

export const brandLocales = pgTable("brand_locales", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  locale: varchar("locale").notNull(), // BCP-47, e.g. en-IN, hi-IN, ta-IN
  language: varchar("language").notNull(), // en, hi, ta, te, bn, ...
  region: varchar("region"), // IN, US, GB, ...
  label: text("label"), // human label e.g. "Hindi (India)"
  isPrimary: boolean("is_primary").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("brand_locales_brand_idx").on(table.brandId),
]);

export const insertBrandLocaleSchema = createInsertSchema(brandLocales).omit({ id: true, createdAt: true });
export type InsertBrandLocale = z.infer<typeof insertBrandLocaleSchema>;
export type BrandLocale = typeof brandLocales.$inferSelect;

// ============= AGENCIES + WHITE-LABEL (Epic J) =============

export const agencies = pgTable("agencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerUserId: varchar("owner_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  slug: varchar("slug").unique(),
  // White-label branding
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  primaryColor: varchar("primary_color"),
  secondaryColor: varchar("secondary_color"),
  customDomain: varchar("custom_domain").unique(),
  supportEmail: varchar("support_email"),
  emailFromName: text("email_from_name"),
  emailTemplate: text("email_template"),
  customCss: text("custom_css"),
  hidePoweredBy: boolean("hide_powered_by").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("agencies_owner_idx").on(table.ownerUserId),
]);

export const insertAgencySchema = createInsertSchema(agencies).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgency = z.infer<typeof insertAgencySchema>;
export type Agency = typeof agencies.$inferSelect;

export const agencyClients = pgTable("agency_clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  clientName: text("client_name"),
  clientContactEmail: varchar("client_contact_email"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("agency_clients_agency_idx").on(table.agencyId),
  index("agency_clients_brand_idx").on(table.brandId),
]);

export const insertAgencyClientSchema = createInsertSchema(agencyClients).omit({ id: true, createdAt: true });
export type InsertAgencyClient = z.infer<typeof insertAgencyClientSchema>;
export type AgencyClient = typeof agencyClients.$inferSelect;

// ============= BROWSER SAMPLES (Epic A — browser-session sampling) =============

export const browserSamples = pgTable("browser_samples", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  promptId: varchar("prompt_id").references(() => prompts.id, { onDelete: 'set null' }),
  promptText: text("prompt_text").notNull(),
  engine: varchar("engine").notNull(), // perplexity | chatgpt | gemini | google_aio
  status: varchar("status").notNull().default("pending"), // pending | success | failed | not_configured
  responseText: text("response_text"),
  brandMentioned: boolean("brand_mentioned").default(false),
  mentionRank: integer("mention_rank"), // approx position of first brand mention (char index bucket) or rank in citations
  citations: jsonb("citations"), // [{ title, url }]
  error: text("error"),
  capturedAt: timestamp("captured_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("browser_samples_brand_idx").on(table.brandId),
  index("browser_samples_engine_idx").on(table.engine),
]);

export const insertBrowserSampleSchema = createInsertSchema(browserSamples).omit({ id: true, createdAt: true });
export type InsertBrowserSample = z.infer<typeof insertBrowserSampleSchema>;
export type BrowserSample = typeof browserSamples.$inferSelect;

// ============= EXECUTION AGENTS + CMS (Epic D) =============

export const cmsConnections = pgTable("cms_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  platform: varchar("platform").notNull(), // wordpress | webflow | shopify
  name: text("name"),
  // Encrypted/opaque credentials + endpoints (e.g. { baseUrl, username, appPassword } | { token, collectionId } | { shop, accessToken })
  config: jsonb("config").notNull(),
  status: varchar("status").notNull().default("active"), // active | error | disabled
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("cms_connections_brand_idx").on(table.brandId),
]);

export const insertCmsConnectionSchema = createInsertSchema(cmsConnections).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCmsConnection = z.infer<typeof insertCmsConnectionSchema>;
export type CmsConnection = typeof cmsConnections.$inferSelect;

export const agentTasks = pgTable("agent_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  agentType: varchar("agent_type").notNull(), // content | schema | outreach
  title: text("title"),
  status: varchar("status").notNull().default("draft"), // draft | approved | executing | completed | failed
  input: jsonb("input"), // { topic, gapId, url, targetKeyword, ... }
  output: jsonb("output"), // generated artifact ({ html } | { jsonLd } | { subject, body })
  targetConnectionId: varchar("target_connection_id").references(() => cmsConnections.id, { onDelete: 'set null' }),
  publishResult: jsonb("publish_result"), // { url, externalId } or { error }
  error: text("error"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("agent_tasks_brand_idx").on(table.brandId),
  index("agent_tasks_status_idx").on(table.status),
]);

export const insertAgentTaskSchema = createInsertSchema(agentTasks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentTask = z.infer<typeof insertAgentTaskSchema>;
export type AgentTask = typeof agentTasks.$inferSelect;

// ============= FACT CLAIMS / HALLUCINATION CORRECTION (Epic H) =============

export const factClaims = pgTable("fact_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  claim: text("claim").notNull(), // statement an AI engine made about the brand
  llmAnswerId: varchar("llm_answer_id").references(() => llmAnswers.id, { onDelete: 'set null' }),
  engine: varchar("engine"), // provider/model that produced it
  accuracy: varchar("accuracy").notNull().default("unverified"), // unverified | accurate | inaccurate
  severity: varchar("severity").notNull().default("medium"), // low | medium | high
  correctValue: text("correct_value"), // the corrected fact
  explanation: text("explanation"), // why it's wrong (LLM or human)
  status: varchar("status").notNull().default("open"), // open | correcting | resolved | dismissed
  correctionTaskId: varchar("correction_task_id").references(() => agentTasks.id, { onDelete: 'set null' }),
  detectedAt: timestamp("detected_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("fact_claims_brand_idx").on(table.brandId),
  index("fact_claims_status_idx").on(table.status),
]);

export const insertFactClaimSchema = createInsertSchema(factClaims).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFactClaim = z.infer<typeof insertFactClaimSchema>;
export type FactClaim = typeof factClaims.$inferSelect;

// ============= SERP RESULTS (for content recommendations engine) =============

export const serpResults = pgTable("serp_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  query: text("query").notNull(),
  position: integer("position"), // brand's organic rank, null if not ranking
  url: text("url"), // brand's URL in SERP
  hasAiOverview: boolean("has_ai_overview").default(false),
  aiOverviewMentionsBrand: boolean("ai_overview_mentions_brand").default(false),
  totalResults: integer("total_results"),
  topCompetitors: jsonb("top_competitors"), // [{name, domain, position}]
  metadata: jsonb("metadata"),
  sampledAt: timestamp("sampled_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("serp_results_brand_idx").on(table.brandId),
  index("serp_results_sampled_at_idx").on(table.sampledAt),
]);

export type SerpResult = typeof serpResults.$inferSelect;

// ============= PAA QUESTIONS (People Also Ask from SERP) =============

export const paaQuestions = pgTable("paa_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  question: text("question").notNull(),
  query: text("query").notNull(), // The SERP query that surfaced this PAA
  sourceUrl: text("source_url"), // URL Google shows as the PAA answer source
  isAnsweredByBrand: boolean("is_answered_by_brand").default(false),
  position: integer("position"), // Position in PAA list
  metadata: jsonb("metadata"),
  sampledAt: timestamp("sampled_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("paa_questions_brand_idx").on(table.brandId),
]);

export type PaaQuestion = typeof paaQuestions.$inferSelect;

// ============= SOCIAL PERFORMANCE (aggregated social metrics per platform) =============

export const socialPerformance = pgTable("social_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  platform: text("platform").notNull(), // twitter, linkedin, reddit, meta, youtube
  totalEngagement: integer("total_engagement").default(0),
  totalMentions: integer("total_mentions").default(0),
  avgSentiment: real("avg_sentiment").default(0), // -1 to +1
  positiveMentions: integer("positive_mentions").default(0),
  negativeMentions: integer("negative_mentions").default(0),
  neutralMentions: integer("neutral_mentions").default(0),
  topContent: jsonb("top_content"), // [{url, text, engagement, sentiment}]
  engagementRate: real("engagement_rate").default(0),
  reachEstimate: integer("reach_estimate").default(0),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("social_performance_brand_idx").on(table.brandId),
  index("social_performance_platform_idx").on(table.platform),
]);

export type SocialPerformance = typeof socialPerformance.$inferSelect;

// ============= KNOWLEDGE GRAPH STATUS (per-brand Wikidata/KG completeness) =============

export const knowledgeGraphStatus = pgTable("knowledge_graph_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }).unique(),
  wikidataId: text("wikidata_id"),
  entityLabel: text("entity_label"),
  completenessScore: real("completeness_score").default(0), // 0-100
  missingClaims: jsonb("missing_claims"), // [{property, label, description}]
  existingClaims: jsonb("existing_claims"), // [{property, label, value}]
  sitelinkCount: integer("sitelink_count").default(0),
  recommendations: jsonb("recommendations"), // [{action, priority, description}]
  lastCheckedAt: timestamp("last_checked_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("knowledge_graph_status_brand_idx").on(table.brandId),
]);

export type KnowledgeGraphStatus = typeof knowledgeGraphStatus.$inferSelect;

// ============= AGGREGATE DATASET (Epic O — opt-in India aggregate, k-anonymized) =============

export const aggregateDatasetEntries = pgTable("aggregate_dataset_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  region: varchar("region").notNull().default("IN"),
  industry: varchar("industry").notNull(),
  intentType: varchar("intent_type").notNull(),
  // Aggregated, non-identifying metrics
  promptCount: integer("prompt_count").notNull().default(0),
  avgDemandSignal: real("avg_demand_signal").notNull().default(0),
  avgPriorityScore: real("avg_priority_score").notNull().default(0),
  contributorCount: integer("contributor_count").notNull().default(0), // distinct brands; gate on k-anonymity
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  rebuiltAt: timestamp("rebuilt_at").defaultNow(),
}, (table) => [
  index("aggregate_dataset_dim_idx").on(table.region, table.industry, table.intentType),
]);

export const insertAggregateDatasetEntrySchema = createInsertSchema(aggregateDatasetEntries).omit({ id: true });
export type InsertAggregateDatasetEntry = z.infer<typeof insertAggregateDatasetEntrySchema>;
export type AggregateDatasetEntry = typeof aggregateDatasetEntries.$inferSelect;

// ============= PUBLIC API + WEBHOOKS (Epic L — public API + Zapier/Make) =============

export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  prefix: varchar("prefix").notNull(), // shown to user, e.g. gsk_AbC123
  keyHash: text("key_hash").notNull(), // sha-256 of the full secret
  scopes: text("scopes").array(), // e.g. ['read:brands','read:visibility']
  lastUsedAt: timestamp("last_used_at"),
  status: varchar("status").notNull().default("active"), // active | revoked
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
}, (table) => [
  index("api_keys_user_idx").on(table.userId),
  index("api_keys_prefix_idx").on(table.prefix),
]);

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, createdAt: true });
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  brandId: varchar("brand_id").references(() => brands.id, { onDelete: 'cascade' }),
  event: varchar("event").notNull(), // alert.triggered | visibility.updated | citation.discovered
  targetUrl: text("target_url").notNull(),
  source: varchar("source").notNull().default("zapier"), // zapier | make | custom
  secret: varchar("secret"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("webhook_subs_user_idx").on(table.userId),
  index("webhook_subs_event_idx").on(table.event),
]);

export const insertWebhookSubscriptionSchema = createInsertSchema(webhookSubscriptions).omit({ id: true, createdAt: true });
export type InsertWebhookSubscription = z.infer<typeof insertWebhookSubscriptionSchema>;
export type WebhookSubscription = typeof webhookSubscriptions.$inferSelect;

// ============= AGENT READINESS REPORTS =============

export const agentReadinessReports = pgTable("agent_readiness_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  domain: text("domain").notNull(),
  scanType: text("scan_type").notNull().default("teaser"), // teaser | full
  score: integer("score").notNull().default(0),
  grade: text("grade"), // poor | fair | good | excellent
  checks: jsonb("checks").notNull().default([]),
  topIssues: jsonb("top_issues").notNull().default([]),
  fullReport: jsonb("full_report"),
  status: text("status").notNull().default("completed"), // pending | completed | failed
  creditsUsed: integer("credits_used").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("agent_readiness_brand_idx").on(table.brandId),
  index("agent_readiness_brand_scan_idx").on(table.brandId, table.scanType),
  index("agent_readiness_brand_created_idx").on(table.brandId, table.createdAt),
  index("agent_readiness_brand_scan_created_idx").on(table.brandId, table.scanType, table.createdAt),
]);

export const insertAgentReadinessReportSchema = createInsertSchema(agentReadinessReports).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentReadinessReport = z.infer<typeof insertAgentReadinessReportSchema>;
export type AgentReadinessReport = typeof agentReadinessReports.$inferSelect;

// ============= ADD-ON OFFERS (Services upsell catalog) =============

export const addonOffers = pgTable("addon_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("implementation"), // implementation | audit | content
  priceInr: integer("price_inr").notNull().default(0), // whole rupees
  visibility: text("visibility").notNull().default("all"), // all | selected
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAddonOfferSchema = createInsertSchema(addonOffers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAddonOffer = z.infer<typeof insertAddonOfferSchema>;
export type AddonOffer = typeof addonOffers.$inferSelect;

export const addonOfferBrands = pgTable("addon_offer_brands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  offerId: varchar("offer_id").notNull().references(() => addonOffers.id, { onDelete: 'cascade' }),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  priceOverrideInr: integer("price_override_inr"), // null = use catalog price
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("addon_offer_brands_offer_idx").on(table.offerId),
  index("addon_offer_brands_brand_idx").on(table.brandId),
]);

export const insertAddonOfferBrandSchema = createInsertSchema(addonOfferBrands).omit({ id: true, createdAt: true });
export type InsertAddonOfferBrand = z.infer<typeof insertAddonOfferBrandSchema>;
export type AddonOfferBrand = typeof addonOfferBrands.$inferSelect;

export const addonPurchases = pgTable("addon_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  offerId: varchar("offer_id").notNull().references(() => addonOffers.id, { onDelete: 'restrict' }),
  amountInr: integer("amount_inr").notNull(),
  status: text("status").notNull().default("pending"), // pending | paid | failed | refunded
  razorpayOrderId: varchar("razorpay_order_id"),
  razorpayPaymentId: varchar("razorpay_payment_id"),
  metadata: jsonb("metadata"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("addon_purchases_brand_idx").on(table.brandId),
  index("addon_purchases_offer_idx").on(table.offerId),
]);

export const insertAddonPurchaseSchema = createInsertSchema(addonPurchases).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAddonPurchase = z.infer<typeof insertAddonPurchaseSchema>;
export type AddonPurchase = typeof addonPurchases.$inferSelect;

// ============= ENTITY LINKS (Tier D — external identifiers) =============

export const entityLinks = pgTable("entity_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  platform: text("platform").notNull(),
  externalId: text("external_id"),
  url: text("url"),
  verified: boolean("verified").default(false),
  lastChecked: timestamp("last_checked"),
  source: text("source").default('manual'),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("entity_links_brand_platform_idx").on(table.brandId, table.platform),
]);

export const insertEntityLinkSchema = createInsertSchema(entityLinks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEntityLink = z.infer<typeof insertEntityLinkSchema>;
export type EntityLink = typeof entityLinks.$inferSelect;

// ============= ENTITY PROFILE (1:1 with brand) =============

export const entityProfile = pgTable("entity_profile", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().unique().references(() => brands.id, { onDelete: 'cascade' }),
  wikidataId: text("wikidata_id"),
  wikipediaSlug: text("wikipedia_slug"),
  googleKgId: text("google_kg_id"),
  crunchbaseHandle: text("crunchbase_handle"),
  legalName: text("legal_name"),
  dbaNames: text("dba_names").array(),
  yearFounded: integer("year_founded"),
  parentCompanyId: varchar("parent_company_id").references(() => brands.id),
  subsidiaries: text("subsidiaries").array(),
  stockSymbol: text("stock_symbol"),
  founders: text("founders").array(),
  keyPeople: text("key_people").array(),
  socialProfiles: jsonb("social_profiles").default(sql`'{}'::jsonb`),
  entityDescription: text("entity_description"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("entity_profile_brand_idx").on(table.brandId),
]);

export const insertEntityProfileSchema = createInsertSchema(entityProfile).omit({ id: true, createdAt: true, lastUpdated: true });
export type InsertEntityProfile = z.infer<typeof insertEntityProfileSchema>;
export type EntityProfile = typeof entityProfile.$inferSelect;

// ============= PEOPLE (founders, execs, authors) =============

export const people = pgTable("people", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  role: text("role"),
  linkedinUrl: text("linkedin_url"),
  twitterUrl: text("twitter_url"),
  wikipediaSlug: text("wikipedia_slug"),
  wikidataId: text("wikidata_id"),
  isFounder: boolean("is_founder").default(false),
  isAuthor: boolean("is_author").default(false),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  website: text("website"),
  links: jsonb("links").default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("people_brand_idx").on(table.brandId),
]);

export const insertPersonSchema = createInsertSchema(people).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof people.$inferSelect;

// ============= ENTITY SOCIAL PRESENCE (per-platform) =============

export const entitySocialPresence = pgTable("entity_social_presence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  platform: text("platform").notNull(),
  handle: text("handle"),
  url: text("url"),
  verified: boolean("verified").default(false),
  followers: integer("followers").default(0),
  following: integer("following").default(0),
  postsLast30d: integer("posts_last_30d").default(0),
  avgEngagementRate: real("avg_engagement_rate").default(0),
  avgPostReach: integer("avg_post_reach").default(0),
  sentiment: real("sentiment").default(0),
  authorityScore: real("authority_score").default(0),
  lastChecked: timestamp("last_checked"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("entity_social_presence_brand_platform_idx").on(table.brandId, table.platform),
]);

export const insertEntitySocialPresenceSchema = createInsertSchema(entitySocialPresence).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEntitySocialPresence = z.infer<typeof insertEntitySocialPresenceSchema>;
export type EntitySocialPresence = typeof entitySocialPresence.$inferSelect;

// ============= ENTITY CO-OCCURRENCES (entity-entity relationships) =============

export const entityCooccurrences = pgTable("entity_cooccurrences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  coEntityName: text("co_entity_name").notNull(),
  coEntityType: text("co_entity_type"),
  context: text("context"),
  llmAnswerId: text("llm_answer_id"),
  frequency: integer("frequency").default(1),
  avgSentiment: real("avg_sentiment").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("entity_cooccurrences_brand_idx").on(table.brandId),
]);

export const insertEntityCooccurrenceSchema = createInsertSchema(entityCooccurrences).omit({ id: true, createdAt: true });
export type InsertEntityCooccurrence = z.infer<typeof insertEntityCooccurrenceSchema>;
export type EntityCooccurrence = typeof entityCooccurrences.$inferSelect;

// ============= ENTITY DISAMBIGUATION TESTS =============

export const entityDisambiguationTests = pgTable("entity_disambiguation_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  question: text("question").notNull(),
  expectedEntity: text("expected_entity"),
  expectedAnswer: text("expected_answer"),
  actualAnswer: text("actual_answer"),
  isCorrect: boolean("is_correct"),
  testedAt: timestamp("tested_at"),
  llmProvider: text("llm_provider"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("entity_disambiguation_tests_brand_idx").on(table.brandId),
]);

export const insertEntityDisambiguationTestSchema = createInsertSchema(entityDisambiguationTests).omit({ id: true, createdAt: true });
export type InsertEntityDisambiguationTest = z.infer<typeof insertEntityDisambiguationTestSchema>;
export type EntityDisambiguationTest = typeof entityDisambiguationTests.$inferSelect;

// ============= SCHEMA INVENTORY (JSON-LD coverage) =============

export const schemaInventory = pgTable("schema_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  pageUrl: text("page_url").notNull(),
  schemaType: text("schema_type"),
  valid: boolean("valid").default(true),
  errors: jsonb("errors").default(sql`'[]'::jsonb`),
  lastChecked: timestamp("last_checked"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("schema_inventory_brand_idx").on(table.brandId),
  index("schema_inventory_url_idx").on(table.pageUrl),
]);

export const insertSchemaInventorySchema = createInsertSchema(schemaInventory).omit({ id: true, createdAt: true });
export type InsertSchemaInventory = z.infer<typeof insertSchemaInventorySchema>;
export type SchemaInventory = typeof schemaInventory.$inferSelect;

// ============= GROUND TRUTH (canonical brand facts) =============

export const groundTruth = pgTable("ground_truth", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  source: text("source"),
  sourceUrl: text("source_url"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ground_truth_brand_idx").on(table.brandId),
  index("ground_truth_brand_key_idx").on(table.brandId, table.key),
]);

export const insertGroundTruthSchema = createInsertSchema(groundTruth).omit({ id: true, createdAt: true });
export type InsertGroundTruth = z.infer<typeof insertGroundTruthSchema>;
export type GroundTruth = typeof groundTruth.$inferSelect;

// ============= RETRIEVAL TESTS =============

export const retrievalTests = pgTable("retrieval_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  prompt: text("prompt").notNull(),
  provider: text("provider"),
  sourceUrl: text("source_url"),
  contextSnippet: text("context_snippet"),
  llmAnswer: text("llm_answer"),
  brandMentionedBefore: boolean("brand_mentioned_before").default(false),
  brandMentionedAfter: boolean("brand_mentioned_after").default(false),
  retrieved: boolean("retrieved"),
  testedAt: timestamp("tested_at"),
  llmProvider: text("llm_provider"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("retrieval_tests_brand_idx").on(table.brandId),
]);

export const insertRetrievalTestSchema = createInsertSchema(retrievalTests).omit({ id: true, createdAt: true });
export type InsertRetrievalTest = z.infer<typeof insertRetrievalTestSchema>;
export type RetrievalTest = typeof retrievalTests.$inferSelect;

// ============= TOPIC-ENTITY ASSOCIATIONS =============

export const topicEntityAssociations = pgTable("topic_entity_associations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  topicId: varchar("topic_id").references(() => topics.id, { onDelete: 'cascade' }),
  topicName: text("topic_name"),
  associationScore: real("association_score").default(0),
  sampleSize: integer("sample_size").default(0),
  lastComputed: timestamp("last_computed"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("topic_entity_associations_brand_topic_idx").on(table.brandId, table.topicId),
]);

export const insertTopicEntityAssociationSchema = createInsertSchema(topicEntityAssociations).omit({ id: true, createdAt: true });
export type InsertTopicEntityAssociation = z.infer<typeof insertTopicEntityAssociationSchema>;
export type TopicEntityAssociation = typeof topicEntityAssociations.$inferSelect;

// ============= COMMUNITY VALIDATION =============

export const communityValidation = pgTable("community_validation", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  platform: text("platform").notNull(),
  mentionCount: integer("mention_count").default(0),
  recommendationCount: integer("recommendation_count").default(0),
  totalDiscussions: integer("total_discussions").default(0),
  sharePct: real("share_pct").default(0),
  avgSentiment: real("avg_sentiment").default(0),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("community_validation_brand_platform_idx").on(table.brandId, table.platform),
]);

export const insertCommunityValidationSchema = createInsertSchema(communityValidation).omit({ id: true, createdAt: true });
export type InsertCommunityValidation = z.infer<typeof insertCommunityValidationSchema>;
export type CommunityValidation = typeof communityValidation.$inferSelect;

// ============= ENTITY NEWS MENTIONS (PR/news coverage) =============

export const entityNewsMentions = pgTable("entity_news_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  url: text("url"),
  sourceDomain: text("source_domain"),
  publishedAt: timestamp("published_at"),
  snippet: text("snippet"),
  authorId: text("author_id"),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("entity_news_mentions_brand_idx").on(table.brandId),
]);

export const insertEntityNewsMentionSchema = createInsertSchema(entityNewsMentions).omit({ id: true, createdAt: true });
export type InsertEntityNewsMention = z.infer<typeof insertEntityNewsMentionSchema>;
export type EntityNewsMention = typeof entityNewsMentions.$inferSelect;

// ============= EXTERNAL QUOTATIONS (citation trust) =============

export const externalQuotations = pgTable("external_quotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  quotabilityScore: integer("quotability_score").default(0),
  mentionCount: integer("mention_count").default(0),
  authoritativeCitationCount: integer("authoritative_citation_count").default(0),
  lastCheckedAt: timestamp("last_checked_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("external_quotations_brand_idx").on(table.brandId),
]);

export const insertExternalQuotationSchema = createInsertSchema(externalQuotations).omit({ id: true, createdAt: true });
export type InsertExternalQuotation = z.infer<typeof insertExternalQuotationSchema>;
export type ExternalQuotation = typeof externalQuotations.$inferSelect;

// ============= BRAND ADVICES (actionable guidance) =============

export const brandAdvices = pgTable("brand_advices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: 'cascade' }),
  adviceType: text("advice_type").notNull(),
  content: text("content").notNull(),
  followsUp: boolean("follows_up").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("brand_advices_brand_idx").on(table.brandId, table.adviceType),
]);

export const insertBrandAdviceSchema = createInsertSchema(brandAdvices).omit({ id: true, createdAt: true });
export type InsertBrandAdvice = z.infer<typeof insertBrandAdviceSchema>;
export type BrandAdvice = typeof brandAdvices.$inferSelect;
