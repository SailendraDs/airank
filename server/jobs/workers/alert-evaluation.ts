// Alert Evaluation Worker (Epic K)
// Evaluates active alert rules against the latest brand metrics and dispatches
// notifications (email / Slack / Teams) when conditions are met. Honors per-rule
// cooldowns to avoid alert storms.

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import { sendEmail } from '../../services/email';
import { dispatchNotification } from '../../integrations/notify';
import { logger } from '../../lib/logger';
import type { AlertRule } from '@shared/schema';

export interface AlertEvaluationPayload {
  /** Restrict evaluation to a single brand; otherwise evaluate all active rules. */
  brandId?: string;
}

export interface AlertEvaluationResult {
  rulesEvaluated: number;
  triggered: number;
  delivered: number;
}

interface Evaluation {
  triggered: boolean;
  value?: number;
  previousValue?: number;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

function compareValue(value: number, comparator: string, threshold: number): boolean {
  switch (comparator) {
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'lte':
      return value <= threshold;
    case 'any':
      return value > 0;
    case 'lt':
    default:
      return value < threshold;
  }
}

function isInCooldown(rule: AlertRule, now: Date): boolean {
  if (!rule.lastTriggeredAt) return false;
  const elapsedMin = (now.getTime() - new Date(rule.lastTriggeredAt).getTime()) / 60000;
  return elapsedMin < (rule.cooldownMinutes ?? 360);
}

async function evaluateRule(rule: AlertRule): Promise<Evaluation> {
  const none: Evaluation = { triggered: false, title: '', message: '', severity: 'info' };
  const brand = await storage.getBrand(rule.brandId);
  const brandName = brand?.name || 'Brand';
  const latest = await storage.getLatestVisibilityScore(rule.brandId);

  switch (rule.metric) {
    case 'score_drop': {
      if (!latest) return none;
      const current = Number(latest.overallScore ?? 0);
      const previous = Number((latest as any).previousScore ?? current);
      const threshold = rule.threshold ?? 5;
      let triggered = false;
      if (rule.comparator === 'pct_drop') {
        const pctDrop = previous > 0 ? ((previous - current) / previous) * 100 : 0;
        triggered = pctDrop >= threshold;
      } else if (rule.comparator === 'lt') {
        triggered = current < threshold;
      } else {
        triggered = previous - current >= threshold;
      }
      return {
        triggered,
        value: current,
        previousValue: previous,
        severity: current < previous - (threshold * 2) ? 'critical' : 'warning',
        title: `${brandName}: visibility score dropped`,
        message: `Overall score is ${current.toFixed(1)} (was ${previous.toFixed(1)}).`,
      };
    }
    case 'competitor_overtake': {
      if (!latest) return none;
      const breakdown = (latest as any).categoryBreakdown as any;
      const sov = breakdown?.shareOfVoice?.overall;
      if (!sov) return none;
      const brandShare = Number(sov.brandSharePct ?? 0);
      const competitorShares: number[] = Object.values(sov.byCompetitor ?? {}).map((v: any) =>
        sov.total > 0 ? (Number(v) / Number(sov.total)) * 100 : 0,
      );
      const topCompetitor = competitorShares.length ? Math.max(...competitorShares) : 0;
      const triggered = topCompetitor > brandShare;
      return {
        triggered,
        value: brandShare,
        previousValue: topCompetitor,
        severity: 'warning',
        title: `${brandName}: overtaken in share of voice`,
        message: `A competitor now holds ${topCompetitor.toFixed(1)}% share of voice vs your ${brandShare.toFixed(1)}%.`,
      };
    }
    case 'source_depth': {
      const sources = await storage.getSourcesByBrand(rule.brandId).catch(() => []);
      const citedUrls = sources.filter((source: any) => source?.url).length;
      const sourceDomains = new Set(
        sources
          .map((source: any) => source?.domain || (source?.url ? String(source.url).replace(/^https?:\/\//, '').split('/')[0] : ''))
          .filter(Boolean),
      );
      const value = Math.max(citedUrls, sourceDomains.size);
      const threshold = rule.threshold ?? 5;
      const triggered = compareValue(value, rule.comparator || 'lt', threshold);
      return {
        triggered,
        value,
        previousValue: threshold,
        severity: value <= Math.max(1, Math.floor(threshold / 2)) ? 'critical' : 'warning',
        title: `${brandName}: citation source depth below launch floor`,
        message: `AIRank found ${value} cited source${value === 1 ? '' : 's'} against a launch floor of ${threshold}. Add authoritative third-party references, reviews, product pages, and brand-owned explainers so AI answers have enough evidence to cite.`,
      };
    }
    case 'verification_debt': {
      const data = ((brand as any)?.brandDevData && typeof (brand as any).brandDevData === 'object') ? (brand as any).brandDevData : {};
      const verificationTasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
      const pendingVerification = verificationTasks.filter((task: any) => task?.status !== 'verified').length;
      const threshold = rule.threshold ?? 0;
      const triggered = compareValue(pendingVerification, rule.comparator || 'gt', threshold);
      return {
        triggered,
        value: pendingVerification,
        previousValue: threshold,
        severity: pendingVerification >= Math.max(3, threshold + 3) ? 'critical' : 'warning',
        title: `${brandName}: launch verification debt is pending`,
        message: `${pendingVerification} readiness task${pendingVerification === 1 ? ' is' : 's are'} still unverified. Complete the linked fixes, then run verification checks so launch readiness reflects fixes that are actually live.`,
      };
    }
    case 'prompt_coverage': {
      const prompts = await storage.getPromptsByBrand(rule.brandId).catch(() => []);
      const value = prompts.length;
      const threshold = rule.threshold ?? 25;
      const triggered = compareValue(value, rule.comparator || 'lt', threshold);
      return {
        triggered,
        value,
        previousValue: threshold,
        severity: value <= Math.max(5, Math.floor(threshold / 2)) ? 'critical' : 'warning',
        title: `${brandName}: prompt coverage below enterprise floor`,
        message: `Only ${value} tracked prompt${value === 1 ? '' : 's'} are configured against a launch floor of ${threshold}. Add buyer, comparison, category, use-case, objection, and product prompts before pitching enterprise monitoring.`,
      };
    }
    case 'factuality_flag':
    case 'new_citation':
    case 'crawler_anomaly':
    default:
      // These metrics are evaluated by their respective producers which enqueue
      // alert_evaluation with explicit context in metadata; absent that, skip.
      return none;
  }
}

async function deliver(rule: AlertRule, evalResult: Evaluation): Promise<boolean> {
  const channel = rule.channel || 'email';
  const event = await storage.createAlertEvent({
    ruleId: rule.id,
    brandId: rule.brandId,
    metric: rule.metric,
    severity: evalResult.severity,
    title: evalResult.title,
    message: evalResult.message,
    value: evalResult.value ?? null,
    previousValue: evalResult.previousValue ?? null,
    channel,
    deliveryStatus: 'pending',
  } as any);

  try {
    if (channel === 'email') {
      const to = rule.destination;
      if (!to) throw new Error('No email destination configured');
      await sendEmail(
        to,
        `[AIRank Alert] ${evalResult.title}`,
        `<p><strong>${evalResult.title}</strong></p><p>${evalResult.message}</p>`,
      );
    } else {
      const dest = rule.destination;
      if (!dest) throw new Error(`No webhook URL configured for ${channel}`);
      await dispatchNotification(channel, dest, {
        title: evalResult.title,
        message: evalResult.message,
        severity: evalResult.severity,
        metric: rule.metric,
      });
    }
    await storage.updateAlertEvent(event.id, { deliveryStatus: 'sent' } as any);
    // Fan out to subscribed Zapier/Make/custom webhooks (Epic L).
    try {
      const { dispatchWebhooks } = await import('../../services/webhook-dispatch');
      await dispatchWebhooks('alert.triggered', {
        ruleId: rule.id,
        metric: rule.metric,
        severity: evalResult.severity,
        title: evalResult.title,
        message: evalResult.message,
        value: evalResult.value ?? null,
        previousValue: evalResult.previousValue ?? null,
      }, rule.brandId);
    } catch { /* webhook dispatch is best-effort */ }
    return true;
  } catch (err: any) {
    await storage.updateAlertEvent(event.id, {
      deliveryStatus: 'failed',
      deliveryError: err?.message || String(err),
    } as any);
    logger.error(`[AlertEval] Delivery failed for rule ${rule.id}: ${err?.message || err}`);
    return false;
  }
}

export async function alertEvaluationWorker(job: QueuedJob): Promise<AlertEvaluationResult> {
  const payload = (job.payload || {}) as AlertEvaluationPayload;
  const now = new Date();

  let rules = await storage.getActiveAlertRules();
  if (payload.brandId) rules = rules.filter((r) => r.brandId === payload.brandId);

  let triggered = 0;
  let delivered = 0;

  for (const rule of rules) {
    if (isInCooldown(rule, now)) continue;
    let evalResult: Evaluation;
    try {
      evalResult = await evaluateRule(rule);
    } catch (err: any) {
      logger.error(`[AlertEval] Error evaluating rule ${rule.id}: ${err?.message || err}`);
      continue;
    }
    if (!evalResult.triggered) continue;

    triggered++;
    const ok = await deliver(rule, evalResult);
    if (ok) delivered++;
    await storage.updateAlertRule(rule.id, { lastTriggeredAt: now } as any);
  }

  if (triggered > 0) {
    logger.info(`[AlertEval] Evaluated ${rules.length} rule(s), triggered ${triggered}, delivered ${delivered}`);
  }

  return { rulesEvaluated: rules.length, triggered, delivered };
}
