// Public API key authentication (Epic L).
// Validates `Authorization: Bearer gsk_...` or `x-api-key` against stored hashes,
// enforces the plan's apiAccessEnabled flag, and attaches the resolved user.

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { resolveFeatureAccess } from './plan-enforcement';

export const API_KEY_PREFIX = 'gsk_';

export function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Generate a new API key: returns the raw secret (shown once) and its stored fields. */
export function generateApiKey(): { raw: string; prefix: string; keyHash: string } {
  const random = crypto.randomBytes(24).toString('base64url');
  const raw = `${API_KEY_PREFIX}${random}`;
  return { raw, prefix: raw.slice(0, 12), keyHash: hashApiKey(raw) };
}

export async function getApiAccessibleBrands(userId: string) {
  const brandsForUser = await storage.getBrandsByUserId(userId);
  const rows = await Promise.all(brandsForUser.map(async (brand) => ({
    brand,
    access: await resolveFeatureAccess(brand.id, 'api_access'),
  })));
  return rows.filter((row) => row.access.allowed).map((row) => row.brand);
}

function extractKey(req: Request): string | null {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader) return apiKeyHeader.trim();
  return null;
}

export async function requireApiKey(req: any, res: Response, next: NextFunction) {
  try {
    const raw = extractKey(req);
    if (!raw || !raw.startsWith(API_KEY_PREFIX)) {
      return res.status(401).json({ error: 'Missing or invalid API key' });
    }
    const record = await storage.getApiKeyByHash(hashApiKey(raw));
    if (!record) return res.status(401).json({ error: 'Invalid or revoked API key' });

    const user = await storage.getUser(record.userId);
    if (!user) return res.status(401).json({ error: 'API key owner not found' });

    const apiBrands = await getApiAccessibleBrands(record.userId);
    if (!apiBrands.length) return res.status(403).json({ error: 'API access is not enabled on your plan' });

    req.apiKey = record;
    req.apiUser = user;
    req.apiUserId = record.userId;
    req.apiBrands = apiBrands;
    storage.touchApiKey(record.id).catch(() => {});
    next();
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'API authentication failed' });
  }
}
