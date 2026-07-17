// PDF Report Generator - Generate branded PDF reports for agencies
// Supports executive summary, full analysis, and action items formats

import PDFDocument from 'pdfkit';
import { storage } from '../storage';
import { buildProductVisibilityClientReport } from './product-readiness';
import type { Brand } from '@shared/schema';

export interface ReportOptions {
  type: 'executive' | 'full' | 'action';
  brandId: string;
  timeframe: 'weekly' | 'monthly' | 'quarterly';
  includeScores: boolean;
  includeCompetitors: boolean;
  includeGaps: boolean;
  includeActions: boolean;
  agencyConfig?: AgencyConfig;
}

export interface AgencyConfig {
  agencyName: string;
  agencyLogoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  websiteUrl?: string;
  contactEmail?: string;
}

export interface BrandReportData {
  brandName: string;
  domain: string;
  overallScore: number;
  previousScore: number;
  scoreDelta: number;
  competitorCount: number;
  topicCount: number;
  totalMentions: number;
  topTopics: Array<{
    name: string;
    score: number;
    position: number;
    mentionRate: number;
  }>;
  competitors: Array<{
    name: string;
    score: number;
    mentions: number;
  }>;
  gaps: Array<{
    topic: string;
    competitor: string;
    gap: number;
  }>;
  actions: Array<{
    title: string;
    description: string;
    estimatedImpact: number;
    priority: string;
  }>;
}

export class PDFReportGenerator {
  private defaultConfig: AgencyConfig = {
    agencyName: 'AIRank',
    primaryColor: '#2563EB',
    secondaryColor: '#1E40AF',
  };

  /**
   * Generate a brand report PDF
   */
  async generateBrandReport(options: ReportOptions): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        // Fetch brand data
        const brandData = await this.fetchBrandData(options.brandId, options);

        // Create PDF document
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Apply agency branding
        const config = options.agencyConfig || this.defaultConfig;

        // Generate pages based on report type
        this.generateCoverPage(doc, brandData, config);
        this.generateExecutiveSummary(doc, brandData, config);

        if (options.type === 'full') {
          this.generateDetailedAnalysis(doc, brandData, config);
        }

        if (options.includeCompetitors) {
          this.generateCompetitorAnalysis(doc, brandData, config);
        }

        if (options.includeGaps) {
          this.generateGapAnalysis(doc, brandData, config);
        }

        if (options.includeActions) {
          this.generateActionItems(doc, brandData, config);
        }

        this.generateFooter(doc, config);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate comparison report for multiple brands
   */
  async generateComparisonReport(
    brandIds: string[],
    timeframe: 'weekly' | 'monthly' | 'quarterly'
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Fetch all brand data
        const brandDataList: BrandReportData[] = [];
        for (const brandId of brandIds) {
          const data = await this.fetchBrandData(brandId, {
            type: 'full',
            brandId,
            timeframe,
            includeScores: true,
            includeCompetitors: true,
            includeGaps: true,
            includeActions: true,
          });
          brandDataList.push(data);
        }

        this.generateComparisonPage(doc, brandDataList, this.defaultConfig);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async generateProductVisibilityClientReport(brand: Brand, agencyConfig?: AgencyConfig): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const report = await buildProductVisibilityClientReport(brand);
        const config = agencyConfig || this.defaultConfig;
        const doc = new PDFDocument({
          size: 'A4',
          bufferPages: true,
          margins: { top: 50, bottom: 56, left: 50, right: 50 },
          info: {
            Title: `${report.brandName} Product Visibility Client Report`,
            Author: config.agencyName,
            Subject: 'AI visibility product benchmark and launch readiness',
          },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.generateProductReportCover(doc, report, config);
        this.generateProductReportSummary(doc, report, config);
        this.generateProductReportBenchmark(doc, report, config);
        this.generateProductReportActions(doc, report, config);
        this.generateProductReportFooter(doc, config);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async fetchBrandData(brandId: string, options: ReportOptions): Promise<BrandReportData> {
    const brand = await storage.getBrand(brandId);
    const visibilityScore = await storage.getLatestVisibilityScore(brandId);
    const topics = await storage.getTopicsByBrand(brandId);
    const competitors = await storage.getCompetitors(brandId);

    const topTopics = (topics as any[])
      .slice(0, 5)
      .map((t) => ({
        name: t.name,
        score: t.visibilityScore || 0,
        position: t.position || 10,
        mentionRate: t.mentionRate || 0,
      }));

    const competitorData = (competitors as any[])
      .slice(0, 5)
      .map((c) => ({
        name: c.name,
        score: c.score || 0,
        mentions: c.mentions || 0,
      }));

    return {
      brandName: brand?.name || 'Unknown Brand',
      domain: brand?.domain || '',
      overallScore: visibilityScore?.overallScore || 0,
      previousScore: visibilityScore?.previousScore || 0,
      scoreDelta: (visibilityScore?.overallScore || 0) - (visibilityScore?.previousScore || 0),
      competitorCount: competitors.length,
      topicCount: topics.length,
      totalMentions: visibilityScore?.totalMentions || 0,
      topTopics,
      competitors: competitorData,
      gaps: [],
      actions: [],
    };
  }

  private generateCoverPage(doc: PDFKit.PDFDocument, data: BrandReportData, config: AgencyConfig): void {
    const pageWidth = doc.page.width - 100;

    // Header with agency branding
    doc
      .rect(0, 0, doc.page.width, 120)
      .fill(config.primaryColor);

    doc
      .fillColor('#FFFFFF')
      .fontSize(28)
      .font('Helvetica-Bold')
      .text(data.brandName, 50, 40, { align: 'center' });

    doc
      .fontSize(14)
      .font('Helvetica')
      .text(`AI Visibility Report - ${data.domain}`, 50, 75, { align: 'center' });

    doc
      .fontSize(12)
      .text(new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      }), 50, 95, { align: 'center' });

    // Main score highlight
    doc.moveDown(6);
    doc.moveDown(6);

    doc
      .fontSize(72)
      .font('Helvetica-Bold')
      .fillColor(config.primaryColor)
      .text(data.overallScore.toString(), { align: 'center' });

    doc
      .fontSize(16)
      .fillColor('#666666')
      .text('AI Visibility Score', { align: 'center' });

    // Score delta
    const deltaColor = data.scoreDelta >= 0 ? '#10B981' : '#EF4444';
    const deltaText = data.scoreDelta >= 0 ? `+${data.scoreDelta}` : data.scoreDelta.toString();
    doc
      .fontSize(18)
      .fillColor(deltaColor)
      .text(`${deltaText} vs previous period`, { align: 'center' });

    // Quick stats
    doc.moveDown(3);
    this.generateStatsRow(doc, [
      { label: 'Topics Tracked', value: data.topicCount.toString() },
      { label: 'Competitors', value: data.competitorCount.toString() },
      { label: 'Total Mentions', value: data.totalMentions.toString() },
    ], config);

    doc.addPage();
  }

  private generateStatsRow(doc: PDFKit.PDFDocument, stats: Array<{ label: string; value: string }>, config: AgencyConfig): void {
    const colWidth = (doc.page.width - 100) / stats.length;

    stats.forEach((stat, i) => {
      const x = 50 + (i * colWidth);

      doc
        .fillColor(config.primaryColor)
        .fontSize(24)
        .font('Helvetica-Bold')
        .text(stat.value, x, doc.y, { align: 'center', width: colWidth });

      doc
        .fillColor('#666666')
        .fontSize(10)
        .font('Helvetica')
        .text(stat.label, x, doc.y + 5, { align: 'center', width: colWidth });
    });
  }

  private generateExecutiveSummary(doc: PDFKit.PDFDocument, data: BrandReportData, config: AgencyConfig): void {
    doc
      .fillColor('#000000')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('Executive Summary', 50, 50);

    doc.moveDown(2);

    const summary = [
      `Your brand has an AI Visibility Score of ${data.overallScore}/100.`,
      `You're tracking ${data.topicCount} topics across ${data.competitorCount} competitors.`,
      `Your content has been mentioned ${data.totalMentions} times in AI responses.`,
      data.scoreDelta >= 0
        ? `Your score improved by ${Math.abs(data.scoreDelta)} points this period.`
        : `Your score decreased by ${Math.abs(data.scoreDelta)} points this period.`,
    ];

    summary.forEach((line) => {
      doc
        .fontSize(12)
        .font('Helvetica')
        .fillColor('#333333')
        .text(line, 50, doc.y, { align: 'left', width: doc.page.width - 100 });
      doc.moveDown();
    });

    doc.addPage();
  }

  private generateDetailedAnalysis(doc: PDFKit.PDFDocument, data: BrandReportData, config: AgencyConfig): void {
    doc
      .fillColor('#000000')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('Top Performing Topics', 50, 50);

    doc.moveDown();

    data.topTopics.forEach((topic, i) => {
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(config.primaryColor)
        .text(`${i + 1}. ${topic.name}`);

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text(`   Score: ${topic.score} | Position: #${topic.position} | Mentions: ${topic.mentionRate}%`);

      doc.moveDown();
    });

    doc.addPage();
  }

  private generateCompetitorAnalysis(doc: PDFKit.PDFDocument, data: BrandReportData, config: AgencyConfig): void {
    doc
      .fillColor('#000000')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('Competitor Analysis', 50, 50);

    doc.moveDown();

    data.competitors.forEach((comp, i) => {
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(config.primaryColor)
        .text(`${i + 1}. ${comp.name}`);

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text(`   Score: ${comp.score} | Mentions: ${comp.mentions}`);

      doc.moveDown();
    });

    doc.addPage();
  }

  private generateGapAnalysis(doc: PDFKit.PDFDocument, data: BrandReportData, config: AgencyConfig): void {
    doc
      .fillColor('#000000')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('Visibility Gaps', 50, 50);

    doc.moveDown();

    if (data.gaps.length === 0) {
      doc
        .fontSize(12)
        .fillColor('#666666')
        .text('No significant gaps identified.');
    } else {
      data.gaps.forEach((gap) => {
        doc
          .fontSize(11)
          .fillColor('#333333')
          .text(`${gap.topic}: ${gap.competitor} outranks you by ${gap.gap} positions`);

        doc.moveDown();
      });
    }

    doc.addPage();
  }

  private generateActionItems(doc: PDFKit.PDFDocument, data: BrandReportData, config: AgencyConfig): void {
    doc
      .fillColor('#000000')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('Recommended Actions', 50, 50);

    doc.moveDown();

    data.actions.forEach((action, i) => {
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(config.primaryColor)
        .text(`${i + 1}. ${action.title}`);

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text(`   ${action.description}`);

      doc
        .fontSize(10)
        .fillColor(action.priority === 'high' ? '#EF4444' : '#666666')
        .text(`   Priority: ${action.priority.toUpperCase()} | Est. Impact: +${action.estimatedImpact} pts`);

      doc.moveDown();
    });

    doc.addPage();
  }

  private generateComparisonPage(doc: PDFKit.PDFDocument, brands: BrandReportData[], config: AgencyConfig): void {
    doc
      .fillColor('#000000')
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('Brand Comparison', 50, 50);

    doc.moveDown(2);

    // Table header
    const cols = { brand: 150, score: 80, mentions: 80, topics: 80 };
    let x = 50;

    doc.fontSize(10).font('Helvetica-Bold').fillColor(config.primaryColor);
    doc.text('Brand', x, doc.y);
    x += cols.brand;
    doc.text('Score', x, doc.y);
    x += cols.score;
    doc.text('Mentions', x, doc.y);
    x += cols.mentions;
    doc.text('Topics', x, doc.y);

    doc.moveDown();

    // Table rows
    brands.forEach((brand) => {
      x = 50;
      doc.fontSize(10).font('Helvetica').fillColor('#333333');
      doc.text(brand.brandName, x, doc.y);
      x += cols.brand;
      doc.text(brand.overallScore.toString(), x, doc.y);
      x += cols.score;
      doc.text(brand.totalMentions.toString(), x, doc.y);
      x += cols.mentions;
      doc.text(brand.topicCount.toString(), x, doc.y);
      doc.moveDown();
    });
  }

  private ensureProductReportSpace(doc: PDFKit.PDFDocument, needed = 90): void {
    if (doc.y + needed > doc.page.height - 70) {
      doc.addPage();
    }
  }

  private productReportHeading(doc: PDFKit.PDFDocument, title: string, config: AgencyConfig): void {
    this.ensureProductReportSpace(doc, 70);
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(config.primaryColor)
      .text(title, 50, doc.y);
    doc.moveDown(0.7);
  }

  private productReportParagraph(doc: PDFKit.PDFDocument, text: string): void {
    this.ensureProductReportSpace(doc, 55);
    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor('#334155')
      .text(text, 50, doc.y, { width: doc.page.width - 100, lineGap: 3 });
    doc.moveDown(0.7);
  }

  private productReportBullet(doc: PDFKit.PDFDocument, text: string): void {
    this.ensureProductReportSpace(doc, 36);
    const y = doc.y;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#0F172A')
      .text('•', 56, y);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#334155')
      .text(text, 72, y, { width: doc.page.width - 122, lineGap: 2 });
    doc.moveDown(0.4);
  }

  private generateProductReportCover(doc: PDFKit.PDFDocument, report: Awaited<ReturnType<typeof buildProductVisibilityClientReport>>, config: AgencyConfig): void {
    doc.rect(0, 0, doc.page.width, 150).fill(config.primaryColor);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(26)
      .text(report.brandName, 50, 46, { width: doc.page.width - 100, align: 'center' });
    doc
      .font('Helvetica')
      .fontSize(13)
      .text('Product AI Visibility Client Report', 50, 84, { width: doc.page.width - 100, align: 'center' });
    doc
      .fontSize(10)
      .text(`Generated ${new Date(report.generatedAt).toLocaleString('en-IN')}`, 50, 110, { width: doc.page.width - 100, align: 'center' });

    const verdictColor = report.launchVerdict === 'launch_ready' ? '#059669' : report.launchVerdict === 'needs_review' ? '#D97706' : '#DC2626';
    doc
      .roundedRect(170, 205, doc.page.width - 340, 86, 8)
      .fill('#F8FAFC')
      .stroke('#CBD5E1');
    doc
      .font('Helvetica-Bold')
      .fontSize(34)
      .fillColor(verdictColor)
      .text(report.launchVerdict.replace(/_/g, ' ').toUpperCase(), 190, 226, { width: doc.page.width - 380, align: 'center' });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#64748B')
      .text('Launch verdict', 190, 268, { width: doc.page.width - 380, align: 'center' });

    this.generateStatsRow(doc, [
      { label: 'Products', value: String(report.metrics.products) },
      { label: 'Visible', value: String(report.metrics.visibleProducts) },
      { label: 'Competitor Share', value: `${report.metrics.competitorShare}%` },
      { label: 'Top Threats', value: String(report.metrics.topThreats) },
    ], config);

    doc.moveDown(3);
    this.productReportParagraph(doc, report.summary);
    doc.addPage();
  }

  private generateProductReportSummary(doc: PDFKit.PDFDocument, report: Awaited<ReturnType<typeof buildProductVisibilityClientReport>>, config: AgencyConfig): void {
    this.productReportHeading(doc, 'Executive Summary', config);
    this.productReportParagraph(doc, report.summary);
    report.highlights.slice(0, 5).forEach((highlight) => this.productReportBullet(doc, highlight));

    this.productReportHeading(doc, 'Launch Risks', config);
    report.risks.slice(0, 6).forEach((risk) => this.productReportBullet(doc, risk));
    if (report.risks.length === 0) this.productReportBullet(doc, 'No blocking product visibility risks detected in the current dataset.');
  }

  private generateProductReportBenchmark(doc: PDFKit.PDFDocument, report: Awaited<ReturnType<typeof buildProductVisibilityClientReport>>, config: AgencyConfig): void {
    this.productReportHeading(doc, 'Competitive Benchmark', config);
    const benchmarkLine = report.highlights.find((line) => line.includes('benchmark signals') || line.includes('competitor products')) || `Competitor signal share is ${report.metrics.competitorShare}%.`;
    this.productReportParagraph(doc, benchmarkLine);

    if (report.metrics.topThreats === 0) {
      this.productReportBullet(doc, 'No competitor product threats detected in the current dataset.');
      return;
    }

    const threatLines = report.markdown
      .split(/\r?\n/)
      .filter((line) => line.startsWith('- HIGH:') || line.startsWith('- MEDIUM:') || line.startsWith('- LOW:'))
      .slice(0, 6)
      .map((line) => line.replace(/^- /, ''));
    threatLines.forEach((line) => this.productReportBullet(doc, line));
  }

  private generateProductReportActions(doc: PDFKit.PDFDocument, report: Awaited<ReturnType<typeof buildProductVisibilityClientReport>>, config: AgencyConfig): void {
    doc.addPage();
    this.productReportHeading(doc, 'Next Actions', config);
    report.nextActions.slice(0, 8).forEach((action) => this.productReportBullet(doc, action));

    this.productReportHeading(doc, 'Published And Queued Artifacts', config);
    if (report.artifacts.length === 0) {
      this.productReportBullet(doc, 'No approved draft artifacts have been queued or published yet.');
    } else {
      report.artifacts.slice(0, 8).forEach((artifact) => {
        this.productReportBullet(doc, `${artifact.status.toUpperCase()} ${artifact.channel.replace('_', ' ')}: ${artifact.label || artifact.title}${artifact.assignee ? ` | Assignee: ${artifact.assignee}` : ''}`);
      });
    }
  }

  private generateProductReportFooter(doc: PDFKit.PDFDocument, config: AgencyConfig): void {
    const pageRange = doc.bufferedPageRange();
    for (let i = pageRange.start; i < pageRange.start + pageRange.count; i += 1) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor('#94A3B8')
        .text(
          `Generated by ${config.agencyName} | Product AI Visibility Report | Page ${i + 1}`,
          50,
          doc.page.height - 42,
          { align: 'center', width: doc.page.width - 100 },
        );
    }
  }

  private generateFooter(doc: PDFKit.PDFDocument, config: AgencyConfig): void {
    doc
      .fontSize(8)
      .fillColor('#999999')
      .text(
        `Generated by ${config.agencyName} | ${config.websiteUrl || 'airank.io'}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );
  }
}

// Singleton instance
let generatorInstance: PDFReportGenerator | null = null;

export function getPDFReportGenerator(): PDFReportGenerator {
  if (!generatorInstance) {
    generatorInstance = new PDFReportGenerator();
  }
  return generatorInstance;
}
