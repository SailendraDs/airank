import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";

const ONBOARDING_RATE_LIMIT_BYPASS_PATHS = [
  /^\/api\/brands\/[^/]+\/generate-topics$/,
  /^\/api\/brands\/[^/]+\/generate-queries$/,
  /^\/api\/brands\/[^/]+\/topics$/,
  /^\/api\/brands\/[^/]+\/prompts\/bulk$/,
  /^\/api\/brands\/[^/]+\/activate$/,
  /^\/api\/brands\/[^/]+\/entity\/(?:profile|people|links)$/,
  /^\/api\/brands\/[^/]+$/,
];

const ACTIVATION_PROGRESS_PATH = /^\/api\/brands\/[^/]+\/activation-progress$/;
const ONBOARDING_READ_BYPASS_PATHS = [
  /^\/api\/brands\/current$/,
  /^\/api\/brands\/[^/]+\/(?:competitors|topics|prompts|subscription|agent-readiness)$/,
];

function isOnboardingBypassRequest(req: Request): boolean {
  if (ACTIVATION_PROGRESS_PATH.test(req.path)) return true;

  const flowHeader = req.headers["x-onboarding-flow"];
  const flowEnabled = Array.isArray(flowHeader) ? flowHeader.includes("1") : flowHeader === "1";
  if (!flowEnabled) return false;
  if (req.method === "GET" && ONBOARDING_READ_BYPASS_PATHS.some((re) => re.test(req.path))) return true;
  if (!["POST", "PUT", "PATCH"].includes(req.method)) return false;
  return ONBOARDING_RATE_LIMIT_BYPASS_PATHS.some((re) => re.test(req.path));
}

export const RATE_LIMITS = {
  free: { windowMs: 60 * 60 * 1000, max: 100 },
  starter: { windowMs: 60 * 60 * 1000, max: 500 },
  growth: { windowMs: 60 * 60 * 1000, max: 2000 },
  enterprise: { windowMs: 60 * 60 * 1000, max: 10000 },
};

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => isOnboardingBypassRequest(req),
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: "Check the Retry-After header for when you can retry.",
  },
  handler: (req: Request, res: Response) => {
    logger.warn("Rate limit exceeded", { ip: req.ip, path: req.path, method: req.method });
    res.status(429).json({
      error: "Too many requests",
      message: "You have exceeded the rate limit. Please try again later.",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: "Too many authentication attempts, please try again later." },
  handler: (req: Request, res: Response) => {
    logger.warn("Auth rate limit exceeded", { ip: req.ip, path: req.path });
    res.status(429).json({
      error: "Too many authentication attempts",
      message: "Please wait before trying again.",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: "Webhook rate limit exceeded" },
  handler: (req: Request, res: Response) => {
    logger.warn("Webhook rate limit exceeded", { ip: req.ip, path: req.path });
    res.status(429).json({ error: "Too many webhook requests" });
  },
});

export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Admin rate limit exceeded" },
  handler: (req: Request, res: Response) => {
    logger.warn("Admin rate limit exceeded", { ip: req.ip, path: req.path, userId: (req as any).userId });
    res.status(429).json({ error: "Too many admin requests", message: "Please slow down your requests." });
  },
});

export const jobLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Job trigger rate limit exceeded" },
  handler: (req: Request, res: Response) => {
    logger.warn("Job trigger rate limit exceeded", { ip: req.ip, userId: (req as any).userId, brandId: req.params.brandId });
    res.status(429).json({ error: "Too many job triggers", message: "Please wait before triggering more jobs." });
  },
});

export const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Export rate limit exceeded" },
  handler: (req: Request, res: Response) => {
    logger.warn("Export rate limit exceeded", { ip: req.ip, userId: (req as any).userId });
    res.status(429).json({ error: "Too many export requests", message: "You can only export 10 times per hour." });
  },
});
