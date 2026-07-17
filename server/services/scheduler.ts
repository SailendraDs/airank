// Report Scheduler - Schedule automated report delivery via email (Epic I).
// DB-backed via the report_schedules table so schedules survive restarts and are
// processed by the report-runner on the main scheduler tick. Reports are delivered
// as branded PDF email attachments.

import { storage } from '../storage';
import { getPDFReportGenerator } from './pdf-generator';
import { sendEmail } from './email';
import { computeNextRun } from './report-runner';
import { buildScheduledReportArtifactHtml } from './scheduled-report-artifact';
import type { ReportSchedule } from '@shared/schema';

export type ScheduledReportType =
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

export interface ReportScheduleConfig {
  brandId: string;
  frequency: 'weekly' | 'monthly';
  dayOfWeek?: number; // 0-6 for weekly (Sunday = 0)
  dayOfMonth?: number; // 1-28 for monthly
  time: string; // "09:00" in 24h format
  reportType: ScheduledReportType;
  recipients: string[];
  isActive: boolean;
}

export class ReportScheduler {
  /** Create a new report schedule (persisted to DB). */
  async createSchedule(config: ReportScheduleConfig): Promise<ReportSchedule> {
    const nextRunAt = computeNextRun({
      frequency: config.frequency,
      dayOfWeek: config.dayOfWeek ?? null,
      dayOfMonth: config.dayOfMonth ?? null,
      time: config.time,
    });

    return await storage.createReportSchedule({
      brandId: config.brandId,
      frequency: config.frequency,
      dayOfWeek: config.dayOfWeek ?? null,
      dayOfMonth: config.dayOfMonth ?? null,
      time: config.time,
      reportType: config.reportType,
      recipients: config.recipients,
      isActive: config.isActive,
      nextRunAt,
    } as any);
  }

  /** Get all schedules for a brand. */
  async getSchedules(brandId: string): Promise<ReportSchedule[]> {
    return await storage.getReportSchedulesByBrand(brandId);
  }

  /** Update a schedule; recomputes nextRunAt when timing fields change. */
  async updateSchedule(scheduleId: string, updates: Partial<ReportScheduleConfig>): Promise<ReportSchedule | null> {
    const existing = await storage.getReportSchedule(scheduleId);
    if (!existing) return null;

    const merged = {
      frequency: (updates.frequency ?? existing.frequency) as 'weekly' | 'monthly',
      dayOfWeek: updates.dayOfWeek ?? existing.dayOfWeek,
      dayOfMonth: updates.dayOfMonth ?? existing.dayOfMonth,
      time: updates.time ?? existing.time,
    };

    return await storage.updateReportSchedule(scheduleId, {
      ...updates,
      nextRunAt: computeNextRun(merged),
    } as any);
  }

  /** Delete a schedule. */
  async deleteSchedule(scheduleId: string): Promise<void> {
    await storage.deleteReportSchedule(scheduleId);
  }

  /** Execute all due schedules (delegates to the shared report-runner). */
  async executeDueSchedules(): Promise<void> {
    const { runDueReports } = await import('./report-runner');
    await runDueReports();
  }

  /** Execute a specific schedule immediately (manual trigger). */
  async executeSchedule(scheduleId: string): Promise<void> {
    const schedule = await storage.getReportSchedule(scheduleId);
    if (!schedule) throw new Error('Schedule not found');

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

    for (const recipient of (schedule.recipients ?? [])) {
      await sendEmail(
        recipient,
        `${brandName} - ${reportLabel} (${schedule.frequency})`,
        this.generateEmailBody(brandName, schedule.reportType),
        attachments,
      );
    }

    await storage.updateReportSchedule(scheduleId, {
      lastRunAt: new Date(),
      nextRunAt: computeNextRun(schedule),
    } as any);
  }

  private generateEmailBody(brandName: string, reportType: string): string {
    const label = reportTypeLabel(reportType);
    const description = reportTypeDescription(reportType);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #2563EB 0%, #1E40AF 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
    .section { margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0 0 10px 0;">${brandName}</h1>
      <p style="margin: 0; opacity: 0.9;">Your AI Visibility Report</p>
    </div>
    <div class="content">
      <div class="section">
        <h2 style="color: #1E40AF; margin-bottom: 15px;">Report Overview</h2>
        <p>Your automated ${label} is attached.</p>
        <p>${description}</p>
        <ul>
          <li>Current AI Visibility Score</li>
          <li>Competitor Analysis &amp; Share of Voice</li>
          <li>Gap Analysis</li>
          <li>Recommended Actions</li>
        </ul>
      </div>
      <div class="section">
        <p>Log in to your AIRank dashboard for detailed analytics and real-time updates.</p>
      </div>
    </div>
    <div class="footer">
      <p>Generated by AIRank | airank.io</p>
      <p>You received this email because you subscribed to automated reports.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}

// Singleton instance
let schedulerInstance: ReportScheduler | null = null;

export function getReportScheduler(): ReportScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new ReportScheduler();
  }
  return schedulerInstance;
}
