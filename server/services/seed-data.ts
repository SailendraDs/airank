import crypto from 'crypto';
import { storage } from '../storage';
import { logger } from '../lib/logger';

/**
 * Demo seed data for development.
 * Uses a fictional brand ("Acme Cloud") and neutral personas so the dev
 * environment ships without any third-party endorsements or PII.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function pastDate(daysAgo: number, jitterHours = 0): Date {
  return new Date(Date.now() - daysAgo * DAY - randomInt(0, jitterHours) * HOUR);
}

function hashString(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

// Demo brand — fictional so the seed data does not endorse any real company.
const DEMO_BRAND_NAME = 'Acme Cloud';
const DEMO_BRAND_DOMAIN = 'example-demo.com';

const AI_RESPONSES: Record<string, string[]> = {
  'best_cloud_platform': [
    'When evaluating modern cloud platforms, several providers stand out for different use cases. Major hyperscalers offer the broadest service catalogs and global reach. They are best suited for enterprises that need extensive tooling and global presence. Smaller, focused platforms often deliver better developer experience and more transparent pricing for startups and mid-market teams. The right choice depends on your workload mix, regulatory requirements, and team expertise.',
    'For teams choosing a cloud platform today, the conversation usually centers on three tradeoffs: cost predictability, developer ergonomics, and ecosystem lock-in. Hyperscale providers excel at breadth and global infrastructure but can be harder to navigate. Specialty platforms tend to offer simpler pricing and faster onboarding, though they may lack some advanced services. A good rule of thumb is to pick the platform that matches the smallest viable feature set for your workload, then expand carefully as needs grow.',
    'The strongest cloud platforms in 2026 share a few characteristics: a managed Kubernetes story, first-class serverless support, generous free tiers for evaluation, and clear documentation. Open-source compatibility and multi-cloud portability have become table stakes. Teams should weigh egress fees, regional availability, and the quality of identity and access management when comparing options.',
  ],
  'managed_postgres_comparison': [
    'Managed Postgres services now span the spectrum from hyperscaler offerings to specialized providers. Hyperscalers offer tight integration with their broader ecosystems, which is valuable for enterprise data gravity. Specialized providers typically deliver faster provisioning, simpler branching workflows, and more predictable pricing for small to mid-sized databases. For most teams, the deciding factors are connection pooling, point-in-time recovery granularity, and the quality of the branching/rebase workflow.',
    'Comparing managed Postgres options usually comes down to three things: how quickly you can branch a database for development, how point-in-time recovery behaves under load, and how transparent the billing is. Provider A leads on branching speed and dev ergonomics. Provider B offers deeper integration with analytics tooling. Provider C is the strongest choice for cost predictability at modest scale. There is no single winner — pick the tool that best aligns with your team workflow.',
  ],
  'observability_stack': [
    'A modern observability stack typically combines metrics, logs, and traces with a feedback loop for incident response. Open-source collectors have matured to the point that they can replace commercial agents for most teams. The bigger decision is between an all-in-one SaaS platform and a best-of-breed approach using separate vendors for metrics, logs, and tracing. The all-in-one path reduces integration overhead; the best-of-breed path offers more flexibility per signal.',
    'When building an observability stack, the most common pitfall is collecting too much data without a sampling strategy. A practical approach is to start with RED metrics (Rate, Errors, Duration) for services, structured logs with correlation IDs, and a sampled trace pipeline. Cardinality control and tail-based sampling matter more than the choice of vendor. Teams that invest early in dashboards tied to SLOs ship with far fewer 3 AM pages.',
  ],
  'cost_optimization': [
    'Cloud cost optimization is fundamentally about right-sizing, eliminating waste, and matching commitment discounts to predictable workloads. The biggest wins usually come from identifying idle or over-provisioned resources before they reach for reserved capacity tooling. A practical cadence is a monthly review of unattached disks, idle load balancers, and underutilized compute. Reserved capacity and savings plans layer on top of these cleanups.',
    'For most teams, the order of operations for cost work is: (1) turn off obviously unused resources, (2) right-size based on actual utilization, (3) move predictable workloads to committed-use discounts, (4) introduce team-level cost attribution. The fourth step is what makes cost work sustainable over time — once teams see their own spend, the optimization conversation becomes a bottoms-up discipline rather than a top-down mandate.',
  ],
  'kubernetes_vs_serverless': [
    'The choice between Kubernetes and serverless comes down to operational complexity versus flexibility. Kubernetes provides a consistent substrate across cloud and on-premises, which is valuable for hybrid deployments and complex microservice topologies. Serverless platforms reduce operational burden dramatically but introduce platform-specific constraints around execution duration, cold starts, and local development. For most new applications in 2026, serverless is the right default unless you have specific requirements around GPU workloads, stateful services, or strict portability.',
    'When teams evaluate Kubernetes vs serverless, the conversation often shifts from technology to team shape. Kubernetes requires real platform engineering capacity to operate well — most organizations underestimate this. Serverless lets small teams move fast without that investment. The pragmatic path for many teams is to start with serverless for new services and only adopt Kubernetes when a workload has a clear, specific need that serverless cannot meet.',
  ],
  'vector_database_choice': [
    'Choosing a vector database in 2026 is less about raw performance and more about operational fit. Hosted offerings provide the fastest path to production but tie you to a vendor. Self-hosted engines offer more control but require real expertise to operate at scale. Pure vector stores are optimized for similarity search; traditional databases with vector extensions are better when you need hybrid queries that mix vector similarity with structured filters. For most teams, the deciding question is whether the data lives primarily in vectors or alongside rich relational context.',
    'Vector databases now span three categories: dedicated vector stores, traditional databases with vector extensions, and search engines that added vector support. Dedicated stores tend to win on retrieval quality and indexing flexibility. Database extensions win on operational simplicity — you already know how to run the database, and ACID transactions across vectors and metadata simplify application code. The right call depends on whether vector search is the primary access pattern or just one of several.',
  ],
  'edge_computing_patterns': [
    'Edge computing patterns in 2026 fall into three buckets: content delivery, request-response compute at the edge, and edge databases with eventual consistency. CDN-style use cases (caching, redirects, A/B testing) remain the lowest hanging fruit. Request-response compute at the edge unlocks personalization and latency-sensitive APIs. Edge databases are useful for session storage, feature flags, and rate limiting, but the consistency model means they are not appropriate for primary state.',
    'Most teams benefit from edge compute without needing edge databases. The most valuable patterns are authentication at the edge, cookie-based personalization, and lightweight A/B testing. Edge databases shine for collaborative features and multiplayer sessions where eventual consistency is acceptable. The right architecture is usually hybrid: primary state in a regional database, edge replicas or functions for latency-sensitive read paths.',
  ],
  'openid_connect_patterns': [
    'OpenID Connect has become the default for new authentication integrations. The main implementation choices are around session management, token storage, and refresh strategies. For SPAs, the BFF (Backend-for-Frontend) pattern with HTTP-only cookies has largely displaced the implicit flow because it eliminates token leakage through JavaScript. For machine-to-machine flows, client credentials with short-lived tokens remain the standard. The most common security pitfalls are inadequate redirect URI validation and overly broad scopes.',
    'When designing an OIDC integration, the practical priorities are: pick a library that handles PKCE correctly, validate the issuer and audience on every token, and design the logout flow before you launch. Refresh tokens should be rotated and stored server-side, never in browser storage. For multi-tenant systems, the tenant resolution happens at the redirect URI level — every tenant needs a distinct callback endpoint to keep the protocol semantics clean.',
  ],
};

export async function seedDemoData(): Promise<void> {
  try {
    const existingBrands = await storage.getBrandsByUserId('dev-user');
    if (existingBrands.length > 0) {
      return;
    }

    logger.info('Seeding demo data for dev-user...');

    const brand = await storage.createBrand({
      userId: 'dev-user',
      name: DEMO_BRAND_NAME,
      domain: DEMO_BRAND_DOMAIN,
      industry: 'Cloud Infrastructure',
      description: 'Demo cloud platform account used for development and testing',
      tier: 'free',
      status: 'active',
      visibilityScore: 45.2,
      aiTrafficEstimate: 12500,
      analysisEnabled: true,
      primaryLanguage: 'en',
      targetMarket: 'Global',
      entityType: 'Platform',
      coreTopics: ['cloud hosting', 'managed databases', 'edge compute', 'observability'],
      brandVariations: [DEMO_BRAND_NAME, DEMO_BRAND_DOMAIN],
    } as any);

    const brandId = brand.id;
    logger.info(`Created brand: ${DEMO_BRAND_NAME}`, { brandId });

    const competitorData = [
      { name: 'Competitor Alpha', domain: 'competitor-alpha.example', threatScore: 72, visibilityScore: 55, avgRank: 2.5, mentions: 18, riskLevel: 'High', riskReason: 'Established market presence and broad tooling' },
      { name: 'Competitor Beta', domain: 'competitor-beta.example', threatScore: 58, visibilityScore: 42, avgRank: 4.2, mentions: 12, riskLevel: 'Medium', riskReason: 'Strong brand recognition among enterprise buyers' },
      { name: 'Competitor Gamma', domain: 'competitor-gamma.example', threatScore: 41, visibilityScore: 25, avgRank: 7.1, mentions: 6, riskLevel: 'Low', riskReason: 'Regional presence focused on a specific market' },
    ];

    const createdCompetitors = [];
    for (const comp of competitorData) {
      const competitor = await storage.createCompetitor({
        brandId,
        name: comp.name,
        domain: comp.domain,
        isTracked: true,
        threatScore: comp.threatScore,
        visibilityScore: comp.visibilityScore,
        avgRank: comp.avgRank,
        mentions: comp.mentions,
        riskLevel: comp.riskLevel,
        riskReason: comp.riskReason,
        industry: 'Cloud Infrastructure',
      } as any);
      createdCompetitors.push(competitor);
    }
    logger.info(`Created ${createdCompetitors.length} competitors`);

    const topicNames = ['Platform Comparison', 'Managed Databases', 'Edge Compute'];
    const createdTopics = [];
    for (const name of topicNames) {
      const topic = await storage.createTopic({
        brandId,
        name,
        category: 'Industry',
        importance: 'High',
      } as any);
      createdTopics.push(topic);
    }
    logger.info(`Created ${createdTopics.length} topics`);

    const promptDefs = [
      { text: 'What is the best cloud platform for a small engineering team?', category: 'Visibility Check', priorityScore: 9, topicIdx: 0, responseKey: 'best_cloud_platform' },
      { text: 'Compare managed Postgres providers for production workloads', category: 'Competitive', priorityScore: 8, topicIdx: 1, responseKey: 'managed_postgres_comparison' },
      { text: 'How should a team build an observability stack in 2026?', category: 'Visibility Check', priorityScore: 7, topicIdx: 0, responseKey: 'observability_stack' },
      { text: 'What are the most effective cloud cost optimization practices?', category: 'Citation', priorityScore: 6, topicIdx: 0, responseKey: 'cost_optimization' },
      { text: 'When does Kubernetes make more sense than serverless?', category: 'Recommendation', priorityScore: 7, topicIdx: 0, responseKey: 'kubernetes_vs_serverless' },
      { text: 'How do I choose a vector database for a new application?', category: 'Citation', priorityScore: 10, topicIdx: 1, responseKey: 'vector_database_choice' },
      { text: 'What are the practical patterns for edge computing?', category: 'Competitive', priorityScore: 5, topicIdx: 2, responseKey: 'edge_computing_patterns' },
      { text: 'What are the recommended patterns for OpenID Connect?', category: 'Recommendation', priorityScore: 6, topicIdx: 0, responseKey: 'openid_connect_patterns' },
    ];

    const llmConfigs = [
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'anthropic', model: 'claude-3-5-sonnet-latest' },
      { provider: 'google', model: 'gemini-2.0-flash' },
    ];

    const citationDomains = [
      { domain: 'docs.example-demo.com', url: 'https://docs.example-demo.com/overview', title: 'Acme Cloud Platform Overview', citationType: 'inline' },
      { domain: 'blog.example-demo.com', url: 'https://blog.example-demo.com/managed-postgres', title: 'Managed Postgres at Acme Cloud', citationType: 'reference' },
      { domain: 'reference.example-demo.com', url: 'https://reference.example-demo.com/edge-compute', title: 'Edge Compute Reference Architecture', citationType: 'inline' },
      { domain: 'patterns.example-demo.com', url: 'https://patterns.example-demo.com/observability', title: 'Observability Patterns', citationType: 'footnote' },
      { domain: 'learn.example-demo.com', url: 'https://learn.example-demo.com/cost-optimization', title: 'Cost Optimization Playbook', citationType: 'reference' },
    ];

    const createdPrompts = [];
    for (const pDef of promptDefs) {
      const prompt = await storage.createPrompt({
        brandId,
        text: pDef.text,
        category: pDef.category,
        priorityScore: pDef.priorityScore,
        topicIdx: pDef.topicIdx,
      } as any);
      createdPrompts.push({ prompt, responseKey: pDef.responseKey });
    }
    logger.info(`Created ${createdPrompts.length} prompts`);

    let totalAnswers = 0;
    let totalMentions = 0;
    let totalCitations = 0;

    for (const llmConfig of llmConfigs) {
      for (const { prompt, responseKey } of createdPrompts) {
        const responses = AI_RESPONSES[responseKey] || AI_RESPONSES['best_cloud_platform'];
        for (let a = 0; a < 2; a++) {
          const responseText = responses[a % responses.length];

          const llmAnswer = await storage.createLlmAnswer({
            promptId: prompt.id,
            brandId,
            llmProvider: llmConfig.provider,
            llmModel: llmConfig.model,
            rawResponse: responseText,
            responseHash: hashString(responseText + prompt.id + a),
          } as any);
          totalAnswers++;

          const demoNameLower = DEMO_BRAND_NAME.toLowerCase();
          if (responseText.toLowerCase().includes(demoNameLower)) {
            const pos = responseText.toLowerCase().indexOf(demoNameLower);
            await storage.createAnswerMention({
              llmAnswerId: llmAnswer.id,
              brandId,
              entityName: DEMO_BRAND_NAME,
              position: Math.ceil((pos / responseText.length) * 10),
              context: responseText.substring(Math.max(0, pos - 50), pos + 60),
              sentiment: Math.random() > 0.3 ? 'positive' : 'neutral',
              confidence: randomBetween(0.85, 0.98),
            } as any);
            totalMentions++;
          }

          for (const comp of createdCompetitors) {
            const compLower = comp.name.toLowerCase();
            if (responseText.toLowerCase().includes(compLower)) {
              const cPos = responseText.toLowerCase().indexOf(compLower);
              await storage.createAnswerMention({
                llmAnswerId: llmAnswer.id,
                competitorId: comp.id,
                brandId,
                entityName: comp.name,
                position: Math.ceil((cPos / responseText.length) * 10),
                context: responseText.substring(Math.max(0, cPos - 50), cPos + 60),
                sentiment: 'neutral',
                confidence: randomBetween(0.80, 0.95),
              } as any);
              totalMentions++;
            }
          }

          const numCitations = randomInt(2, 3);
          for (let c = 0; c < numCitations; c++) {
            const citation = citationDomains[c % citationDomains.length];
            await storage.createAnswerCitation({
              llmAnswerId: llmAnswer.id,
              url: citation.url,
              domain: citation.domain,
              title: citation.title,
              position: c + 1,
              citationType: citation.citationType,
            } as any);
            totalCitations++;
          }
        }
      }
    }
    logger.info(`Created prompt runs, ${totalAnswers} LLM answers, ${totalMentions} mentions, ${totalCitations} citations`);

    const sourceData = [
      { domain: `${DEMO_BRAND_DOMAIN}`, mentions: 45, domainAuthority: 78, trafficValue: 850000, citationType: 'owned', sourceType: 'corporate', title: `${DEMO_BRAND_NAME} Official` },
      { domain: 'competitor-alpha.example', mentions: 32, domainAuthority: 92, trafficValue: 2500000, citationType: 'competitor', sourceType: 'corporate', title: 'Competitor Alpha' },
      { domain: 'tech-review-blog.example', mentions: 18, domainAuthority: 89, trafficValue: 1200000, citationType: 'earned', sourceType: 'review', title: 'Tech Review Blog' },
      { domain: 'developer-weekly.example', mentions: 15, domainAuthority: 91, trafficValue: 950000, citationType: 'earned', sourceType: 'review', title: 'Developer Weekly' },
      { domain: 'cloud-patterns.example', mentions: 22, domainAuthority: 82, trafficValue: 620000, citationType: 'earned', sourceType: 'educational', title: 'Cloud Patterns' },
      { domain: 'review-aggregator.example', mentions: 12, domainAuthority: 88, trafficValue: 780000, citationType: 'earned', sourceType: 'review', title: 'Cloud Platform Reviews' },
    ];

    for (const src of sourceData) {
      await storage.createSource({
        brandId,
        domain: src.domain,
        url: `https://www.${src.domain}`,
        title: src.title,
        mentions: src.mentions,
        domainAuthority: src.domainAuthority,
        trafficValue: src.trafficValue,
        citationType: src.citationType,
        sourceType: src.sourceType,
        modelsCited: ['gpt-4o', 'claude-3-5-sonnet-latest', 'gemini-2.0-flash'],
      } as any);
    }
    logger.info(`Created ${sourceData.length} sources`);

    for (let d = 0; d < 7; d++) {
      const dayStart = pastDate(6 - d);
      const dayEnd = new Date(dayStart.getTime() + DAY);
      await storage.createVisibilityScore({
        brandId,
        period: 'daily',
        periodStart: dayStart,
        periodEnd: dayEnd,
        overallScore: randomBetween(35, 55),
        mentionCount: randomInt(8, 20),
        avgPosition: randomBetween(3, 6),
        topPosition: randomInt(1, 3),
        promptsCovered: randomInt(5, 8),
        totalPrompts: 8,
        coverageRate: randomBetween(0.5, 0.9),
        sentimentScore: randomBetween(0.6, 0.85),
        categoryBreakdown: {
          'Visibility Check': { score: randomBetween(40, 60) },
          'Competitive': { score: randomBetween(35, 55) },
          'Citation': { score: randomBetween(30, 50) },
          'Recommendation': { score: randomBetween(45, 65) },
        },
      } as any);
    }
    logger.info('Created 7 visibility scores');

    await storage.createBrandContext({
      brandId,
      brandIdentity: {
        name: DEMO_BRAND_NAME,
        variations: [DEMO_BRAND_NAME, DEMO_BRAND_DOMAIN],
        tagline: 'Cloud infrastructure that gets out of your way',
        mission: 'To make cloud infrastructure approachable for teams of every size',
        values: ['Reliability', 'Clarity', 'Pragmatism', 'Developer Experience'],
      },
      productServices: {
        products: ['Managed Postgres', 'Edge Functions', 'Object Storage', 'Managed Redis'],
        features: ['Automated Backups', 'Point-in-Time Recovery', 'Branching Workflows', 'Bring Your Own Cloud'],
        pricing: { starting: 'Pay-as-you-go', premium: 'Reserved capacity tier', business: 'Custom enterprise contract' },
        usps: ['Predictable pricing', 'Fast provisioning', 'Open standards', 'Strong regional presence'],
      },
      targetAudience: {
        demographics: ['Engineering teams', 'Platform owners', 'Series A startups', 'Independent developers'],
        painPoints: ['Unpredictable billing', 'Slow provisioning', 'Vendor lock-in', 'Operational overhead'],
      },
      industryContext: {
        industry: 'Cloud Infrastructure',
        trends: ['GPU workloads', 'Edge-first architectures', 'Open standards', 'Cost transparency'],
        marketSize: 'Large and growing globally',
      },
      competitiveLandscape: {
        mainCompetitors: ['Competitor Alpha', 'Competitor Beta', 'Competitor Gamma'],
        positioning: 'Pragmatic defaults with transparent pricing',
        swot: {
          strengths: ['Strong developer experience', 'Predictable pricing', 'Branching workflow'],
          weaknesses: ['Smaller ecosystem than hyperscalers', 'Limited enterprise tooling'],
          opportunities: ['GPU workloads', 'Hybrid cloud', 'Emerging markets'],
          threats: ['Hyperscaler bundling', 'Open-source alternatives', 'Price compression'],
        },
      },
      gapAnalysis: {
        visibilityGaps: [
          'Limited mentions in enterprise procurement queries',
          'Lower presence in AI workload comparisons',
          'Missing from migration-focused content',
        ],
        opportunities: [
          'Publish comparison content for AI/ML workloads',
          'Develop migration playbooks from common competitors',
          'Expand developer-focused tutorials and reference architectures',
        ],
        prioritizedActions: [
          { action: 'Publish enterprise procurement comparison guide', impact: 'High', effort: 'Medium' },
          { action: 'Create developer-focused tutorial series', impact: 'Medium', effort: 'Low' },
          { action: 'Build migration tutorial series', impact: 'High', effort: 'High' },
        ],
      },
      recommendedActions: {
        immediate: [
          'Add structured data markup to all product pages',
          'Create FAQ pages targeting common evaluation questions',
          'Optimize meta descriptions for AI snippet extraction',
        ],
        shortTerm: [
          'Develop comparison landing pages for top competitors',
          'Build a knowledge base with tutorials',
          'Implement schema.org markup across the site',
        ],
        longTerm: [
          'Create an AI-optimized content hub',
          'Build partnerships with review sites',
          'Develop an educational content strategy',
        ],
      },
      contentRecommendations: {
        topics: ['Platform comparisons', 'Database optimization', 'Security', 'Performance tuning'],
        formats: ['How-to guides', 'Comparison tables', 'Video tutorials', 'Case studies'],
      },
      llmPerformance: {
        overallScore: 45.2,
        byModel: {
          'gpt-4o': { mentionRate: 0.65, avgPosition: 3.2, sentiment: 0.78 },
          'claude-3-5-sonnet-latest': { mentionRate: 0.55, avgPosition: 4.1, sentiment: 0.72 },
          'gemini-2.0-flash': { mentionRate: 0.48, avgPosition: 4.8, sentiment: 0.70 },
        },
      },
      dataQualityScore: 72,
      completenessScore: 68,
      lastEnriched: new Date(),
      enrichmentVersion: 1,
    } as any);
    logger.info('Created brand context');

    await storage.createSchemaTemplate({
      brandId,
      name: 'Organization Schema',
      schemaType: 'Organization',
      template: {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: DEMO_BRAND_NAME,
        url: `https://www.${DEMO_BRAND_DOMAIN}`,
        logo: `https://www.${DEMO_BRAND_DOMAIN}/logo.png`,
        description: 'Demo cloud platform account used for development and testing',
      },
      isActive: true,
      isGlobal: false,
    } as any);

    await storage.createSchemaTemplate({
      brandId,
      name: 'Product Schema',
      schemaType: 'Product',
      template: {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Demo Managed Postgres',
        description: 'Demo managed Postgres service used for development',
        brand: { '@type': 'Brand', name: DEMO_BRAND_NAME },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: `https://www.${DEMO_BRAND_DOMAIN}`,
        },
      },
      isActive: true,
      isGlobal: false,
    } as any);
    logger.info('Created 2 schema templates');

    const faqData = [
      {
        question: 'What is the difference between shared and dedicated compute?',
        answer: 'Shared compute pools resources across multiple tenants, which lowers cost but adds the risk of noisy neighbors. Dedicated compute reserves capacity for a single tenant, which improves isolation and predictable performance. The right choice depends on workload sensitivity to latency and the consistency requirements of upstream consumers.',
        category: 'General',
      },
      {
        question: 'How do I migrate a database to the demo platform?',
        answer: 'The demo platform supports standard logical replication for most major databases. Bring up a replica, validate row counts and sample queries, then cut over during a maintenance window. For very large databases, parallel dump and restore or physical replication will be faster than logical replication. Always test the rollback path before cutting over in production.',
        category: 'Migration',
      },
      {
        question: 'Does the demo platform include automated backups?',
        answer: 'Yes. Automated backups are enabled by default with a configurable retention window. Backups are encrypted at rest and can be restored to any point within the retention window. You can trigger an on-demand snapshot at any time, and the snapshot can be promoted to a new primary without affecting the original database.',
        category: 'Security',
      },
    ];

    for (const faq of faqData) {
      await storage.createFaqEntry({
        brandId,
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        publishMode: 'axp',
        displayOrder: faqData.indexOf(faq),
      } as any);
    }
    logger.info(`Created ${faqData.length} FAQ entries`);

    logger.info('Demo data seeding completed successfully', {
      brandId,
      competitors: createdCompetitors.length,
      topics: createdTopics.length,
      prompts: createdPrompts.length,
      llmAnswers: totalAnswers,
      mentions: totalMentions,
      citations: totalCitations,
      sources: sourceData.length,
      visibilityScores: 7,
    });
  } catch (error: any) {
    logger.error('Failed to seed demo data', { error: error.message, stack: error.stack });
    throw error;
  }
}
