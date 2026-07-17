import { storage } from "../storage";
import type { PromptTemplate } from "@shared/schema";

const TEMPLATE_CACHE_TTL_MS = 60_000;
let templateCache: PromptTemplate[] = [];
let templateCacheLoadedAt = 0;

async function getActiveTemplates(): Promise<PromptTemplate[]> {
  const now = Date.now();
  if (now - templateCacheLoadedAt < TEMPLATE_CACHE_TTL_MS && templateCache.length > 0) {
    return templateCache;
  }

  const templates = await storage.getPromptTemplates({ isActive: true });
  templateCache = templates;
  templateCacheLoadedAt = now;
  return templates;
}

export function clearPromptTemplateCache() {
  templateCache = [];
  templateCacheLoadedAt = 0;
}

export function applyTemplateVariables(
  template: string,
  variables: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

export async function resolvePromptTemplateByName(
  name: string,
  fallback: string,
  variables: Record<string, string | number | null | undefined> = {},
): Promise<string> {
  try {
    const templates = await getActiveTemplates();
    const match = templates.find((t) => t.name === name);
    const base = match?.template?.trim() ? match.template : fallback;
    return applyTemplateVariables(base, variables);
  } catch {
    return applyTemplateVariables(fallback, variables);
  }
}
