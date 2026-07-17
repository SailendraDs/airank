// AI crawler/agent bot detection & verification (Epic B).
// Classifies a request's user-agent as a known AI crawler and verifies authenticity
// via reverse-DNS (rDNS) forward-confirmation where the operator publishes host
// suffixes, falling back to documented IP/owner hints. UA strings alone are
// spoofable, so `verified` is only true after rDNS forward-confirmation.

import { promises as dns } from 'dns';

export type BotCategory = 'training' | 'search' | 'agent' | 'other';

export interface BotSignature {
  botName: string;
  category: BotCategory;
  engine: string;
  uaMatch: RegExp;
  // Verified if the resolved PTR hostname ends with one of these suffixes
  // AND a forward A/AAAA lookup of that host returns the original IP.
  rdnsSuffixes: string[];
}

// Public, documented AI crawler signatures.
export const BOT_SIGNATURES: BotSignature[] = [
  { botName: 'GPTBot', category: 'training', engine: 'chatgpt', uaMatch: /GPTBot/i, rdnsSuffixes: ['.openai.com'] },
  { botName: 'OAI-SearchBot', category: 'search', engine: 'chatgpt', uaMatch: /OAI-SearchBot/i, rdnsSuffixes: ['.openai.com'] },
  { botName: 'ChatGPT-User', category: 'agent', engine: 'chatgpt', uaMatch: /ChatGPT-User/i, rdnsSuffixes: ['.openai.com'] },
  { botName: 'ClaudeBot', category: 'training', engine: 'claude', uaMatch: /ClaudeBot/i, rdnsSuffixes: ['.anthropic.com'] },
  { botName: 'Claude-Web', category: 'agent', engine: 'claude', uaMatch: /Claude-Web/i, rdnsSuffixes: ['.anthropic.com'] },
  { botName: 'anthropic-ai', category: 'training', engine: 'claude', uaMatch: /anthropic-ai/i, rdnsSuffixes: ['.anthropic.com'] },
  { botName: 'PerplexityBot', category: 'search', engine: 'perplexity', uaMatch: /PerplexityBot/i, rdnsSuffixes: ['.perplexity.ai'] },
  { botName: 'Perplexity-User', category: 'agent', engine: 'perplexity', uaMatch: /Perplexity-User/i, rdnsSuffixes: ['.perplexity.ai'] },
  { botName: 'Google-Extended', category: 'training', engine: 'gemini', uaMatch: /Google-Extended/i, rdnsSuffixes: ['.googlebot.com', '.google.com'] },
  { botName: 'GoogleOther', category: 'search', engine: 'gemini', uaMatch: /GoogleOther/i, rdnsSuffixes: ['.googlebot.com', '.google.com'] },
  { botName: 'Bytespider', category: 'training', engine: 'doubao', uaMatch: /Bytespider/i, rdnsSuffixes: ['.bytedance.com'] },
  { botName: 'CCBot', category: 'training', engine: 'commoncrawl', uaMatch: /CCBot/i, rdnsSuffixes: [] },
  { botName: 'Applebot-Extended', category: 'training', engine: 'apple', uaMatch: /Applebot-Extended/i, rdnsSuffixes: ['.applebot.apple.com'] },
  { botName: 'Amazonbot', category: 'search', engine: 'amazon', uaMatch: /Amazonbot/i, rdnsSuffixes: ['.crawl.amazon.com'] },
  { botName: 'meta-externalagent', category: 'training', engine: 'meta', uaMatch: /meta-externalagent|FacebookBot/i, rdnsSuffixes: ['.facebook.com'] },
  { botName: 'cohere-ai', category: 'training', engine: 'cohere', uaMatch: /cohere-ai/i, rdnsSuffixes: [] },
  { botName: 'YouBot', category: 'search', engine: 'you', uaMatch: /YouBot/i, rdnsSuffixes: [] },
];

export interface DetectionResult {
  botName: string;
  category: BotCategory;
  engine: string;
  matched: boolean;
}

/** Classify a user-agent string against known AI crawler signatures. */
export function detectBot(userAgent: string): DetectionResult | null {
  if (!userAgent) return null;
  for (const sig of BOT_SIGNATURES) {
    if (sig.uaMatch.test(userAgent)) {
      return { botName: sig.botName, category: sig.category, engine: sig.engine, matched: true };
    }
  }
  return null;
}

/**
 * Forward-confirmed reverse DNS verification: PTR(ip) must end with an allowed
 * suffix, and a forward lookup of that hostname must resolve back to `ip`.
 * Returns false on any failure (best-effort, never throws).
 */
export async function verifyBotIp(ip: string, botName: string): Promise<boolean> {
  if (!ip) return false;
  const sig = BOT_SIGNATURES.find((s) => s.botName === botName);
  if (!sig || sig.rdnsSuffixes.length === 0) return false;

  const cleanIp = ip.replace(/^::ffff:/, '').trim();
  try {
    const hosts = await dns.reverse(cleanIp);
    const host = hosts.find((h) => sig.rdnsSuffixes.some((suf) => h.toLowerCase().endsWith(suf)));
    if (!host) return false;

    const resolved = await dns.lookup(host, { all: true });
    return resolved.some((r) => r.address === cleanIp);
  } catch {
    return false;
  }
}
