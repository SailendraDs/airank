// Outbound webhook dispatch (Epic L).
// Delivers events to subscribed Zapier/Make/custom endpoints (REST Hook pattern),
// signing the payload with the subscription secret when present.

import crypto from 'crypto';
import { storage } from '../storage';
import { logger } from '../lib/logger';

export type WebhookEvent = 'alert.triggered' | 'visibility.updated' | 'citation.discovered';

export async function dispatchWebhooks(event: WebhookEvent, payload: any, brandId?: string): Promise<void> {
  let subs: Awaited<ReturnType<typeof storage.getActiveWebhooksForEvent>>;
  try {
    subs = await storage.getActiveWebhooksForEvent(event, brandId);
  } catch (err: any) {
    logger.warn?.(`[Webhook] lookup failed for ${event}: ${err?.message || err}`);
    return;
  }
  if (!subs.length) return;

  const body = JSON.stringify({ event, brandId: brandId || null, data: payload, timestamp: new Date().toISOString() });

  await Promise.all(subs.map(async (sub) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sub.secret) {
        headers['X-AIRank-Signature'] = crypto.createHmac('sha256', sub.secret).update(body).digest('hex');
      }
      const res = await fetch(sub.targetUrl, { method: 'POST', headers, body });
      if (!res.ok) logger.warn?.(`[Webhook] ${sub.targetUrl} responded ${res.status}`);
    } catch (err: any) {
      logger.warn?.(`[Webhook] delivery to ${sub.targetUrl} failed: ${err?.message || err}`);
    }
  }));
}
