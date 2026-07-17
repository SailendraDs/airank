// AXP Publish Worker - Publishes Answer Experience Pages

import type { QueuedJob } from '../queue';
import { storage } from '../../storage';
import fs from 'fs';
import path from 'path';

export interface AxpPublishPayload {
  brandId: string;
  axpContentId: string;
  publishTo?: 'staging' | 'production';
}

export async function axpPublishWorker(job: QueuedJob): Promise<any> {
  const payload = job.payload as AxpPublishPayload;
  const { brandId, axpContentId, publishTo = 'production' } = payload;

  console.log(`[AxpPublish] Publishing AXP content ${axpContentId} to ${publishTo}`);

  const axpContent = await storage.getAxpContent(axpContentId);
  if (!axpContent) {
    throw new Error(`AXP content ${axpContentId} not found`);
  }

  if (axpContent.status !== 'ready') {
    throw new Error(`AXP content ${axpContentId} is not ready for publishing (status: ${axpContent.status})`);
  }

  try {
    const html = generateAxpHtml(axpContent);

    const publishMetadata = {
      title: axpContent.title,
      description: axpContent.title,
      author: 'AIRank AI',
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const publishUrl = await publishHtml(html, brandId, axpContent.slug);

    await storage.updateAxpContent(axpContentId, {
      status: 'published',
      publishedAt: new Date(),
    });

    console.log(`[AxpPublish] Successfully published AXP content to ${publishUrl}`);

    return {
      brandId,
      axpContentId,
      publishUrl,
      publishTo,
      success: true,
      metadata: publishMetadata,
    };

  } catch (error: any) {
    console.error(`[AxpPublish] Error publishing AXP content:`, error.message);

    await storage.updateAxpContent(axpContentId, {
      status: 'draft',
    });

    throw error;
  }
}

/**
 * Publish HTML using S3 (if configured) or local filesystem fallback.
 */
async function publishHtml(html: string, brandId: string, slug: string): Promise<string> {
  const s3Bucket = process.env.AWS_S3_BUCKET || await storage.getSystemSetting('aws_s3_bucket');

  if (s3Bucket) {
    return publishToS3(html, brandId, slug, s3Bucket);
  }

  return publishToLocal(html, brandId, slug);
}

async function publishToLocal(html: string, brandId: string, slug: string): Promise<string> {
  const outputDir = path.join(process.cwd(), 'public', 'axp', brandId, slug);
  fs.mkdirSync(outputDir, { recursive: true });

  const filePath = path.join(outputDir, 'index.html');
  fs.writeFileSync(filePath, html, 'utf-8');

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const publishUrl = `${appUrl.replace(/\/$/, '')}/axp/${brandId}/${slug}`;

  console.log(`[AxpPublish] Written to local filesystem: ${filePath}`);
  return publishUrl;
}

async function publishToS3(html: string, brandId: string, slug: string, bucket: string): Promise<string> {
  const region = process.env.AWS_REGION || await storage.getSystemSetting('aws_region') || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || await storage.getSystemSetting('aws_access_key_id') || '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || await storage.getSystemSetting('aws_secret_access_key') || '';
  const cdnDomain = process.env.AXP_CDN_DOMAIN || await storage.getSystemSetting('axp_cdn_domain');

  let S3Client: any;
  let PutObjectCommand: any;
  try {
    const s3Module = await import('@aws-sdk/client-s3');
    S3Client = s3Module.S3Client;
    PutObjectCommand = s3Module.PutObjectCommand;
  } catch {
    console.warn('[AxpPublish] @aws-sdk/client-s3 not installed, falling back to local filesystem');
    return publishToLocal(html, brandId, slug);
  }

  const s3 = new S3Client({
    region,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });

  const key = `${brandId}/${slug}/index.html`;

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: html,
    ContentType: 'text/html; charset=utf-8',
    CacheControl: 'public, max-age=3600',
  }));

  const publishUrl = cdnDomain
    ? `https://${cdnDomain}/${brandId}/${slug}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  console.log(`[AxpPublish] Uploaded to S3: s3://${bucket}/${key}`);
  return publishUrl;
}

/**
 * Generate static HTML for AXP content
 */
function generateAxpHtml(axpContent: any): string {
  const { title, content, contentHtml } = axpContent;
  const summary = title; // Use title as summary fallback
  const keywords: string[] = [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(summary)}">
  <meta name="keywords" content="${keywords.join(', ')}">
  <meta name="author" content="AIRank AI">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(summary)}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(summary)}">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1 {
      font-size: 2.5em;
      margin-bottom: 0.5em;
      color: #1a1a1a;
    }
    .summary {
      font-size: 1.2em;
      color: #666;
      margin-bottom: 2em;
      padding: 1em;
      background: #f5f5f5;
      border-left: 4px solid #4a90e2;
    }
    .content {
      font-size: 1.1em;
    }
    .metadata {
      margin-top: 3em;
      padding-top: 2em;
      border-top: 1px solid #ddd;
      font-size: 0.9em;
      color: #666;
    }
  </style>
</head>
<body>
  <article>
    <h1>${escapeHtml(title)}</h1>
    <div class="content">
      ${contentHtml || content || ''}
    </div>
    <div class="metadata">
      <p>Published by AIRank AI</p>
    </div>
  </article>
</body>
</html>`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
