// Self-managed browser-session sampling (Epic A).
// Drives a real Chromium session (Playwright) against AI answer engines for the
// brand's top-N prompts, captures the rendered answer + citations, and records
// whether/where the brand is mentioned. Degrades gracefully to "not_configured"
// when Playwright browsers are unavailable or sampling is disabled.

import { storage } from '../storage';
import { logger } from '../lib/logger';
import type { BrowserSample } from '@shared/schema';

export type SampleEngine = 'perplexity';

export interface SampleResult {
  engine: SampleEngine;
  promptText: string;
  status: 'success' | 'failed' | 'not_configured';
  responseText?: string;
  brandMentioned?: boolean;
  mentionRank?: number;
  citations?: Array<{ title: string; url: string }>;
  error?: string;
}

export function isSamplingEnabled(): boolean {
  return process.env.BROWSER_SAMPLING_ENABLED === 'true';
}

function getEngines(): SampleEngine[] {
  const raw = (process.env.BROWSER_SAMPLING_ENGINES || 'perplexity').split(',').map((s) => s.trim());
  // Only engines that don't require authenticated sessions are enabled by default.
  return raw.filter((e): e is SampleEngine => e === 'perplexity');
}

/** Lazily load Playwright; returns null when the package/browser isn't usable. */
async function loadChromium(): Promise<any | null> {
  try {
    const pw: any = await import('playwright');
    return pw?.chromium ?? null;
  } catch (err: any) {
    logger.warn?.(`[BrowserSampler] Playwright not available: ${err?.message || err}`);
    return null;
  }
}

function analyzeMention(text: string, brandName: string): { mentioned: boolean; rank?: number } {
  if (!text || !brandName) return { mentioned: false };
  const idx = text.toLowerCase().indexOf(brandName.toLowerCase());
  if (idx < 0) return { mentioned: false };
  // Bucket the position into an approximate "rank" (earlier mention = better rank).
  return { mentioned: true, rank: Math.max(1, Math.ceil((idx + 1) / 400)) };
}

async function samplePerplexity(chromium: any, prompt: string, brandName: string): Promise<SampleResult> {
  let browser: any;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto(`https://www.perplexity.ai/search?q=${encodeURIComponent(prompt)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    // Give the answer time to stream in.
    await page.waitForTimeout(12000);

    const responseText: string = await page.evaluate(() => (document.body?.innerText || '').slice(0, 8000));
    const citations: Array<{ title: string; url: string }> = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href^="http"]')) as HTMLAnchorElement[];
      const seen = new Set<string>();
      const out: Array<{ title: string; url: string }> = [];
      for (const a of anchors) {
        const url = a.href;
        if (!url || url.includes('perplexity.ai') || seen.has(url)) continue;
        seen.add(url);
        out.push({ title: (a.textContent || '').trim().slice(0, 200), url });
        if (out.length >= 20) break;
      }
      return out;
    });

    const mention = analyzeMention(responseText, brandName);
    await browser.close();
    return {
      engine: 'perplexity',
      promptText: prompt,
      status: 'success',
      responseText,
      brandMentioned: mention.mentioned,
      mentionRank: mention.rank,
      citations,
    };
  } catch (err: any) {
    try { if (browser) await browser.close(); } catch {}
    return { engine: 'perplexity', promptText: prompt, status: 'failed', error: err?.message || String(err) };
  }
}

/** Sample the brand's top-N prompts across configured engines and persist results. */
export async function sampleTopPrompts(brandId: string, topN = 5): Promise<{ samples: BrowserSample[]; status: string }> {
  const brand = await storage.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  if (!isSamplingEnabled()) {
    const sample = await storage.createBrowserSample({
      brandId,
      promptText: '(sampling disabled)',
      engine: 'perplexity',
      status: 'not_configured',
      error: 'Set BROWSER_SAMPLING_ENABLED=true to enable self-managed browser sampling.',
    } as any);
    return { samples: [sample], status: 'not_configured' };
  }

  const chromium = await loadChromium();
  if (!chromium) {
    const sample = await storage.createBrowserSample({
      brandId,
      promptText: '(playwright unavailable)',
      engine: 'perplexity',
      status: 'not_configured',
      error: 'Playwright Chromium is not installed. Run `npx playwright install chromium`.',
    } as any);
    return { samples: [sample], status: 'not_configured' };
  }

  const prompts = await storage.getPromptsByBrand(brandId);
  const top = prompts
    .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))
    .slice(0, topN);

  const engines = getEngines();
  const results: BrowserSample[] = [];

  for (const prompt of top) {
    for (const engine of engines) {
      let result: SampleResult;
      if (engine === 'perplexity') {
        result = await samplePerplexity(chromium, prompt.text, brand.name);
      } else {
        result = { engine, promptText: prompt.text, status: 'not_configured', error: `Engine ${engine} not supported` };
      }
      const saved = await storage.createBrowserSample({
        brandId,
        promptId: prompt.id,
        promptText: result.promptText,
        engine: result.engine,
        status: result.status,
        responseText: result.responseText || null,
        brandMentioned: result.brandMentioned ?? false,
        mentionRank: result.mentionRank ?? null,
        citations: result.citations ?? null,
        error: result.error || null,
      } as any);
      results.push(saved);
      // Be polite between requests.
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  logger.info(`[BrowserSampler] brand=${brandId} sampled=${results.length}`);
  return { samples: results, status: 'success' };
}
