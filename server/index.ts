import "./load-env";
import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import cookieParser from "cookie-parser";
import passport from "passport";
import { registerRoutes } from "./routes";
import { registerJobRoutes } from "./routes/job-routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import helmet from "helmet";
import cors from "cors";
import { logger, logRequest, logError } from "./lib/logger";
import { validateEnvironment } from "./lib/env-validator";
import { syncProviderEnvAliases } from "./lib/plan-providers";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

function anthropicBaseUrlFromEnv(): string | undefined {
  const provider = String(process.env.LLM_PROVIDER || '').toLowerCase();
  const base = process.env.ANTHROPIC_BASE_URL || (provider === 'opusmax' ? process.env.LLM_BASE_URL : undefined);
  if (!base) return undefined;
  const trimmed = base.replace(/\/+$/, '');
  if (provider === 'opusmax') {
    return trimmed.endsWith('/api/v1') || trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
  }
  return trimmed.endsWith('/api/v1') || trimmed.endsWith('/v1') ? trimmed : `${trimmed}/api/v1`;
}

function uniqueEnvValues(keys: string[]): string[] {
  return Array.from(new Set(keys.map((key) => process.env[key]).filter(Boolean) as string[]));
}

function openRouterFallback(model: string) {
  return process.env.OPENROUTER_API_KEY ? {
    apiKey: process.env.OPENROUTER_API_KEY,
    model,
    appName: 'AIRank',
    appUrl: 'https://airank.com',
  } : undefined;
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production'
    ? {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          fontSrc: ["'self'", "https:", "data:"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", "https://checkout.razorpay.com"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", "https:", "'unsafe-inline'"],
          connectSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
          frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
          upgradeInsecureRequests: [],
        },
      }
    : false,
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration - supports Replit domains dynamically
const getAllowedOrigins = (): string[] | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void) => {
  if (process.env.NODE_ENV === 'production') {
    const defined = process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || [];
    const replitDomain = process.env.REPLIT_DEV_DOMAIN;
    const allOrigins = [...defined, ...(replitDomain ? [`https://${replitDomain}`] : [])];
    if (allOrigins.length === 0) {
      return (origin, cb) => cb(null, true);
    }
    return allOrigins;
  }
  return (origin, cb) => cb(null, true);
};

const corsOptions = {
  origin: getAllowedOrigins(),
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Trust proxy (important for rate limiting and IP detection)
app.set('trust proxy', 1);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
    limit: '10mb', // Prevent large payload attacks
  }),
);

app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());

// Initialize Passport for OAuth
app.use(passport.initialize());

// Legacy log function for compatibility
export function log(message: string, source = "express") {
  logger.info(message, { source });
}

// API logging middleware
import { apiLoggerMiddleware } from './middleware/api-logger';
app.use(apiLoggerMiddleware);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;

    // Log API requests
    if (req.path.startsWith("/api")) {
      logRequest(req.method, req.path, res.statusCode, duration, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    }
  });

  next();
});


const maintenanceBypassPrefixes = [
  "/health",
  "/admin",
  "/api/admin",
  "/auth/sign-in",
  "/api/auth",
];

const maintenanceBypassExact = new Set(["/favicon.png"]);

const maintenancePageHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Maintenance | AIRank</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; }
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { max-width: 560px; width: 100%; background: #111827; border: 1px solid #334155; border-radius: 14px; padding: 28px; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
    h1 { margin: 0 0 10px; font-size: 28px; }
    p { margin: 0; line-height: 1.6; color: #cbd5e1; }
    .badge { display: inline-block; margin-bottom: 14px; font-size: 12px; letter-spacing: .08em; color: #93c5fd; text-transform: uppercase; }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <div class="badge">Maintenance Mode</div>
      <h1>We’ll be back shortly</h1>
      <p>AIRank is temporarily unavailable while we perform maintenance. Please try again in a few minutes.</p>
    </section>
  </main>
</body>
</html>`;

const maintenanceCache = {
  checkedAt: 0,
  enabled: false,
};


const SETTINGS_ENV_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_AI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'PERPLEXITY_API_KEY',
  'GROK_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENROUTER_API_KEY',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'FIRECRAWL_API_KEY',
  'BRAND_ENRICHMENT_LLM_MODEL',
  'GOOGLE_KG_API_KEY',
  'SERPAPI_API_KEY',
  'DATAFORSEO_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
] as const;

async function hydrateEnvFromSystemSettings() {
  try {
    const settings = await storage.getAllSystemSettings();
    const map = new Map(settings.map((s) => [s.key, s.value]));

    for (const envKey of SETTINGS_ENV_KEYS) {
      if (process.env[envKey]) continue;
      const dbVal = map.get(envKey.toLowerCase());
      if (dbVal) process.env[envKey] = dbVal;
    }

    // Keep Google aliases in sync (different code paths use different key names).
    syncProviderEnvAliases();
  } catch (error: any) {
    logger.warn('Could not hydrate env from system settings', { error: error?.message });
  }
}

async function isMaintenanceEnabled(): Promise<boolean> {
  const now = Date.now();
  if (now - maintenanceCache.checkedAt < 5000) {
    return maintenanceCache.enabled;
  }

  try {
    const value = await storage.getSystemSetting("maintenance_mode");
    maintenanceCache.enabled = value === "true";
  } catch (error: any) {
    logger.warn("Could not read maintenance_mode setting", { error: error?.message });
    maintenanceCache.enabled = false;
  }

  maintenanceCache.checkedAt = now;
  return maintenanceCache.enabled;
}

function shouldBypassMaintenance(path: string): boolean {
  if (maintenanceBypassExact.has(path)) return true;
  return maintenanceBypassPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

// Health check endpoint (before rate limiting)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

app.use(async (req, res, next) => {
  if (shouldBypassMaintenance(req.path)) {
    return next();
  }

  const maintenanceEnabled = await isMaintenanceEnabled();
  if (!maintenanceEnabled) {
    return next();
  }

  if (req.path.startsWith('/api')) {
    return res.status(503).json({
      error: 'Service is temporarily unavailable due to maintenance',
      maintenanceMode: true,
    });
  }

  return res.status(503).type('html').send(maintenancePageHtml);
});

// Initialize integrations and job system
const initializeBackgroundServices = async () => {
  logger.info('Initializing external integrations...');

  try {
    const { initializeIntegrations } = await import('./integrations');

    initializeIntegrations({
      llm: {
        openai: process.env.OPENAI_API_KEY ? {
          apiKey: process.env.OPENAI_API_KEY,
        } : undefined,
        anthropic: process.env.ANTHROPIC_API_KEY ? {
          apiKey: process.env.ANTHROPIC_API_KEY,
          baseURL: anthropicBaseUrlFromEnv(),
          model: process.env.ANTHROPIC_MODEL,
        } : undefined,
        google: uniqueEnvValues(['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']).length ? {
          apiKey: uniqueEnvValues(['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'])[0],
          apiKeys: uniqueEnvValues(['GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']),
          openRouterFallback: openRouterFallback('google/gemini-2.5-flash-lite'),
        } : undefined,
        perplexity: process.env.PERPLEXITY_API_KEY ? {
          apiKey: process.env.PERPLEXITY_API_KEY,
          openRouterFallback: openRouterFallback('perplexity/sonar-pro'),
        } : undefined,
        grok: process.env.GROK_API_KEY ? {
          apiKey: process.env.GROK_API_KEY,
        } : undefined,
        deepseek: process.env.DEEPSEEK_API_KEY ? {
          apiKey: process.env.DEEPSEEK_API_KEY,
          openRouterFallback: openRouterFallback('deepseek/deepseek-chat'),
        } : undefined,
        openrouter: process.env.OPENROUTER_API_KEY ? {
          apiKey: process.env.OPENROUTER_API_KEY,
          appName: 'AIRank',
          appUrl: 'https://airank.com',
        } : undefined,
      },
      knowledgeGraph: process.env.GOOGLE_KG_API_KEY ? {
        apiKey: process.env.GOOGLE_KG_API_KEY,
      } : undefined,
      serpApi: process.env.SERPAPI_API_KEY ? {
        apiKey: process.env.SERPAPI_API_KEY,
      } : undefined,
      social: (process.env.TWITTER_BEARER_TOKEN || process.env.LINKEDIN_ACCESS_TOKEN || process.env.YOUTUBE_API_KEY) ? {
        twitter: process.env.TWITTER_BEARER_TOKEN ? {
          bearerToken: process.env.TWITTER_BEARER_TOKEN,
        } : undefined,
        linkedin: process.env.LINKEDIN_ACCESS_TOKEN ? {
          accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
        } : undefined,
        youtube: process.env.YOUTUBE_API_KEY ? {
          apiKey: process.env.YOUTUBE_API_KEY,
        } : undefined,
        meta: process.env.META_PAGE_TOKEN ? {
          accessToken: process.env.META_PAGE_TOKEN,
        } : undefined,
      } : undefined,
    });

    logger.info('External integrations initialized successfully');
  } catch (error: any) {
    logger.warn('Could not initialize integrations', { error: error.message });
  }

  logger.info('Initializing job system...');

  try {
    const { initializeJobSystem } = await import('./jobs');
    initializeJobSystem();
    logger.info('Job system initialized successfully');
  } catch (error: any) {
    logger.warn('Could not initialize job system', { error: error.message });
  }

  logger.info('Initializing Razorpay client...');

  try {
    const { initializeRazorpay } = await import('./services/subscription');
    initializeRazorpay();
    logger.info('Razorpay client initialized successfully');
  } catch (error: any) {
    logger.warn('Could not initialize Razorpay', { error: error.message });
  }
};

async function ensureDevUser() {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { storage } = await import('./storage');
      const bcrypt = await import('bcryptjs');
      const existing = await storage.getUser('dev-user');
      if (!existing) {
        const passwordHash = await bcrypt.hash('devpassword', 12);
        await storage.createUser({
          id: 'dev-user',
          email: 'dev@airank.local',
          firstName: 'Demo',
          lastName: 'User',
          passwordHash,
          emailVerified: true,
        } as any);
        logger.info('Created dev-user for demo mode');
      }
      if (existing && !existing.onboardingCompleted) {
        await storage.updateUser('dev-user', { onboardingCompleted: true } as any);
      }
    } catch (error: any) {
      logger.warn('Could not create dev user', { error: error.message });
    }
  }
}

// Initialize routes and middleware
async function initializeApp() {
  await hydrateEnvFromSystemSettings();
  await ensureDevUser();

  if (process.env.NODE_ENV !== 'production' || process.env.SEED_DEMO_DATA === 'true') {
    try {
      const { seedDemoData } = await import('./services/seed-data');
      await seedDemoData();
    } catch (error: any) {
      logger.warn('Could not seed demo data', { error: error.message });
    }
  }
  try {
    const { syncBuiltinPromptTemplates } = await import('./services/prompt-template-sync');
    const syncResult = await syncBuiltinPromptTemplates();
    logger.info('Prompt template sync completed', syncResult);
  } catch (error: any) {
    logger.warn('Could not sync built-in prompt templates', { error: error.message });
  }

  await registerRoutes(httpServer, app);

  // Register job monitoring routes
  registerJobRoutes(app);

  // Global error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log error with context
    logError(err, {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: (req as any).userId,
      status,
    });

    if (res.headersSent) {
      return next(err);
    }

    // Don't leak error details in production
    const responseMessage = process.env.NODE_ENV === 'production' && status === 500
      ? 'Internal Server Error'
      : message;

    return res.status(status).json({
      error: responseMessage,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  app.use('/axp', express.static(path.join(process.cwd(), 'public', 'axp')));

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  return app;
}

// Check if running in Vercel serverless environment
const isVercel = process.env.VERCEL === '1';

if (!isVercel) {
  // Traditional server startup (for local development or VPS deployment)
  (async () => {
    try {
      // Hydrate process.env from DB-backed admin settings before initializing services.
      await hydrateEnvFromSystemSettings();
      validateEnvironment();

      // Initialize background services first
      await initializeBackgroundServices();
      
      // Initialize app
      await initializeApp();

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.listen(port, "0.0.0.0", () => {
      logger.info(`Server started successfully`, {
        port,
        environment: process.env.NODE_ENV,
        nodeVersion: process.version,
      });
      console.log(`\n✅ Server running on http://localhost:${port}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown`);

      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
      logger.error("Unhandled Promise Rejection", { reason: reason?.message || reason, stack: reason?.stack });
    });

    process.on("uncaughtException", (error: Error) => {
      logger.error("Uncaught Exception", { message: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    } catch (error: any) {
      console.error('\n❌ Server startup failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}

// Export app for Vercel serverless
export { app, httpServer, initializeApp };
