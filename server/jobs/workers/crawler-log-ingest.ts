// Crawler Log Ingest Worker (Epic B)
// Processes a batch of raw access-log hits: classifies AI crawlers by user-agent,
// performs forward-confirmed rDNS verification (slow, kept off the request path),
// and persists verified crawler_logs rows. Non-bot hits are dropped.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { detectBot, verifyBotIp } from '../../services/bot-detection';
import { logger } from '../../lib/logger';
import type { InsertCrawlerLog } from '@shared/schema';

export interface CrawlerHit {
  userAgent?: string;
  ip?: string;
  path?: string;
  statusCode?: number;
  method?: string;
  referrer?: string;
  visitedAt?: string | Date;
}

export interface CrawlerLogIngestPayload {
  brandId: string;
  hits: CrawlerHit[];
}

export async function crawlerLogIngestWorker(job: QueuedJob): Promise<{ brandId: string; received: number; botHits: number; verified: number; stored: number }> {
  const { brandId, hits } = job.payload as unknown as CrawlerLogIngestPayload;
  const safeHits = Array.isArray(hits) ? hits : [];

  const rows: InsertCrawlerLog[] = [];
  let botHits = 0;
  let verified = 0;

  for (const hit of safeHits) {
    const detection = detectBot(hit.userAgent || '');
    if (!detection) continue;
    botHits++;

    let isVerified = false;
    if (hit.ip) {
      isVerified = await verifyBotIp(hit.ip, detection.botName);
      if (isVerified) verified++;
    }

    rows.push({
      brandId,
      botName: detection.botName,
      botCategory: detection.category,
      engine: detection.engine,
      verified: isVerified,
      ipAddress: hit.ip || null,
      userAgent: hit.userAgent || null,
      path: hit.path || null,
      statusCode: hit.statusCode ?? null,
      method: hit.method || null,
      referrer: hit.referrer || null,
      visitedAt: hit.visitedAt ? new Date(hit.visitedAt) : new Date(),
    } as InsertCrawlerLog);
  }

  const stored = await storage.createCrawlerLogs(rows);
  logger.info(`[CrawlerIngest] brand=${brandId} received=${safeHits.length} botHits=${botHits} verified=${verified} stored=${stored}`);
  return { brandId, received: safeHits.length, botHits, verified, stored };
}
