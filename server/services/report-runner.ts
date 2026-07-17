// DB-backed scheduled report runner (Epic I).
// Replaces the in-memory ReportScheduler with persistence via the report_schedules
// table. Invoked on the main scheduler tick; generates a branded PDF and emails it
// to each recipient, then advances nextRunAt.

import { storage } from '../storage';
import { getPDFReportGenerator } from './pdf-generator';
import { sendEmail } from './email';
import { buildScheduledReportArtifactHtml } from './scheduled-report-artifact';
import type { ReportSchedule } from '@shared/schema';

type ScheduledReportType =
  | 'executive'
  | 'full'
  | 'action'
  | 'ai_search_opportunity'
  | 'launch_readiness'
  | 'competitive_parity'
  | 'market_opportunity'
  | 'verification_evidence'
  | 'scan_operations'
  | 'product_visibility';

const LEGACY_PDF_REPORT_TYPES = new Set<ScheduledReportType>(['executive', 'full', 'action']);

function reportTypeLabel(reportType: string) {
  const labels: Record<string, string> = {
    executive: 'Executive Report',
    full: 'Full Analysis Report',
    action: 'Action Plan Report',
    ai_search_opportunity: 'AI Search Opportunity Brief',
    launch_readiness: 'Launch Readiness Report',
    competitive_parity: 'Competitive Parity Report',
    market_opportunity: 'Market Opportunity Report',
    verification_evidence: 'Verification Evidence Report',
    scan_operations: 'Scan Operations Report',
    product_visibility: 'Product Visibility Report',
  };
  return labels[reportType] || 'AI Visibility Report';
}

function reportTypeDescription(reportType: string) {
  const descriptions: Record<string, string> = {
    launch_readiness: 'Launch gates, blockers, product/agent readiness, verification debt, and monitoring status.',
    ai_search_opportunity: 'Prompt demand, competitor pressure, citation signals, and action workflow priorities for AI-search growth.',
    competitive_parity: 'AthenaHQ, Peec.ai, Profound, and Semrush-style capability parity against the current workspace.',
    market_opportunity: 'Prioritized prompt, citation, source, launch, and product opportunities for weekly execution.',
    verification_evidence: 'Proof tasks showing which applied fixes are verified, still failing, or waiting for fresh evidence.',
    scan_operations: 'Provider freshness, prompt freshness, schedule health, failed jobs, and monitoring next actions.',
    product_visibility: 'Seller/product readiness, SKU visibility, pilot gates, benchmark pressure, and product launch next actions.',
  };
  return descriptions[reportType] || 'Visibility score, competitors, gaps, and recommended actions.';
}

function buildHtmlArtifact(brandName: string, reportType: string) {
  const label = reportTypeLabel(reportType);
  const description = reportTypeDescription(reportType);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${brandName} ${label}</title><style>body{font-family:Inter,Arial,sans-serif;max-width:860px;margin:40px auto;padding:0 24px;line-height:1.55;color:#111827}h1{font-size:30px}.meta{color:#6b7280}.box{border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:20px}</style></head><body><h1>${brandName} - ${label}</h1><p class="meta">Generated: ${new Date().toISOString()}</p><div class="box"><p>${description}</p><p>Open AIRank Reports Center to export the freshest live artifact and supporting evidence.</p></div></body></html>`;
}

/** Compute the next run time for a schedule from its frequency/day/time config. */
export function computeNextRun(schedule: Pick<ReportSchedule, 'frequency' | 'dayOfWeek' | 'dayOfMonth' | 'time'>, from: Date = new Date()): Date {
  const [hours, minutes] = (schedule.time || '09:00').split(':').map((n) => parseInt(n, 10));
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);

  if (schedule.frequency === 'weekly') {
    const targetDay = schedule.dayOfWeek ?? 1; // default Monday
    let daysUntil = (targetDay - next.getDay() + 7) % 7;
    if (daysUntil === 0 && next <= from) daysUntil = 7;
    next.setDate(next.getDate() + daysUntil);
  } else {
    // monthly
    const targetDay = schedule.dayOfMonth ?? 1;
    next.setDate(targetDay);
    if (next <= from) next.setMonth(next.getMonth() + 1);
  }
  return next;
}

async function runSchedule(schedule: ReportSchedule): Promise<void> {
  const brand = await storage.getBrand(schedule.brandId);
  const brandName = brand?.name || 'Brand';
  const reportType = (schedule.reportType || 'executive') as ScheduledReportType;
  const reportLabel = reportTypeLabel(reportType);
  const attachments = [];

  if (LEGACY_PDF_REPORT_TYPES.has(reportType)) {
    const generator = getPDFReportGenerator();
    const pdfBuffer = await generator.generateBrandReport({
      type: reportType as 'executive' | 'full' | 'action',
      brandId: schedule.brandId,
      timeframe: schedule.frequency === 'weekly' ? 'weekly' : 'monthly',
      includeScores: true,
      includeCompetitors: true,
      includeGaps: true,
      includeActions: true,
    });
    attachments.push({ filename: `${brandName}-report-${Date.now()}.pdf`, content: pdfBuffer, contentType: 'application/pdf' });
  } else {
    attachments.push({
      filename: `${brandName}-${reportType.replace(/_/g, '-')}-${Date.now()}.html`,
      content: await buildScheduledReportArtifactHtml({
        brandId: schedule.brandId,
        brandName,
        domain: brand?.domain,
        reportType,
      }),
      contentType: 'text/html; charset=utf-8',
    });
  }

  const subject = `${brandName} — AI Visibility Report (${schedule.frequency})`;
  const html = `<p>Hi,</p><p>Your ${schedule.frequency} <strong>${brandName}</strong> AI visibility report is attached.</p><p>Open your AIRank dashboard for live analytics.</p>`;
  const emailSubject = `${brandName} - ${reportLabel} (${schedule.frequency})`;
  const emailHtml = `<p>Hi,</p><p>Your ${schedule.frequency} <strong>${brandName}</strong> ${reportLabel} is attached.</p><p>${reportTypeDescription(reportType)}</p><p>Open your AIRank dashboard for live analytics and fresh exports.</p>`;

  for (const recipient of (schedule.recipients ?? [])) {
    await sendEmail(recipient, emailSubject || subject, emailHtml || html, attachments);
  }

  await storage.updateReportSchedule(schedule.id, {
    lastRunAt: new Date(),
    nextRunAt: computeNextRun(schedule),
  });
}

/** Process every report schedule that is due. Safe to call frequently. */
export async function runDueReports(now: Date = new Date()): Promise<number> {
  let ran = 0;
  try {
    const due = await storage.getDueReportSchedules(now);
    for (const schedule of due) {
      try {
        await runSchedule(schedule);
        ran++;
      } catch (err: any) {
        console.error(`[ReportRunner] Failed schedule ${schedule.id}:`, err?.message || err);
      }
    }
  } catch (err: any) {
    console.error('[ReportRunner] Error querying due schedules:', err?.message || err);
  }
  if (ran > 0) console.log(`[ReportRunner] Sent ${ran} scheduled report(s).`);
  return ran;
}
