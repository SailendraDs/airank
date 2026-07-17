// Execution agents (Epic D).
// Generates content / JSON-LD schema / outreach drafts with the LLM and, once
// a task is approved, optionally publishes content artifacts to a connected CMS.

import { storage } from '../storage';
import { getIntegrations } from '../integrations';
import { publishToCms, type CmsPlatform } from '../integrations/cms';
import { logger } from '../lib/logger';
import type { AgentTask } from '@shared/schema';

type LLMProviderName = 'openai' | 'anthropic' | 'google' | 'perplexity' | 'grok' | 'deepseek' | 'openrouter';

function pickProvider(): LLMProviderName {
  const llm = getIntegrations().llm;
  const available = (llm?.getAvailableProviders?.() || []) as LLMProviderName[];
  const preferred: LLMProviderName[] = ['openai', 'anthropic', 'google', 'openrouter', 'perplexity', 'grok', 'deepseek'];
  for (const p of preferred) if (available.includes(p)) return p;
  if (available.length) return available[0];
  throw new Error('No LLM provider configured for execution agents');
}

async function llmText(system: string, user: string): Promise<string> {
  const llm = getIntegrations().llm;
  if (!llm) throw new Error('No LLM provider configured');
  const provider = pickProvider();
  const res = await llm.chat(provider, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { temperature: 0.4, maxTokens: 1800 } as any);
  return (res as any)?.content || (res as any)?.text || '';
}

async function runContentAgent(brand: any, input: any): Promise<{ title: string; html: string }> {
  const topic = input?.topic || input?.targetKeyword || `${brand.name} overview`;
  const system = 'You are an expert SEO/GEO content writer. Produce clean, factual, well-structured HTML (h2/h3/p/ul) optimized to be cited by AI answer engines. No markdown, no <html>/<body> wrapper.';
  const user = `Write a comprehensive, citation-worthy article for the brand "${brand.name}"${brand.industry ? ` (industry: ${brand.industry})` : ''} on the topic: "${topic}". Be specific and accurate. End with a concise FAQ section.`;
  const html = await llmText(system, user);
  return { title: typeof topic === 'string' ? topic : `${brand.name} content`, html };
}

async function runSchemaAgent(brand: any, input: any): Promise<{ jsonLd: any; html: string }> {
  const url = input?.url || brand.domain;
  const system = 'You generate valid schema.org JSON-LD. Return ONLY raw JSON (no code fences, no prose).';
  const user = `Generate JSON-LD markup for ${input?.schemaType || 'Organization'} for brand "${brand.name}" (website: ${url}${brand.description ? `, description: ${brand.description}` : ''}). Include sameAs where reasonable.`;
  const raw = await llmText(system, user);
  let jsonLd: any;
  try {
    const cleaned = raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    jsonLd = JSON.parse(cleaned);
  } catch {
    jsonLd = { raw };
  }
  const html = `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
  return { jsonLd, html };
}

async function runOutreachAgent(brand: any, input: any): Promise<{ subject: string; body: string }> {
  const target = input?.targetSite || input?.url || 'a relevant publication';
  const system = 'You write concise, personalized B2B outreach emails for digital PR / citation building. Friendly, specific, non-spammy. Return JSON {"subject":"...","body":"..."} only.';
  const user = `Write an outreach email from the "${brand.name}" team to ${target} proposing ${input?.angle || 'a data-backed contribution / mention'} relevant to ${brand.industry || 'the industry'}.`;
  const raw = await llmText(system, user);
  try {
    const cleaned = raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return { subject: parsed.subject || `Collaboration with ${brand.name}`, body: parsed.body || raw };
  } catch {
    return { subject: `Collaboration with ${brand.name}`, body: raw };
  }
}

/** Generate the draft artifact for a task (does not publish). */
export async function generateAgentOutput(task: AgentTask): Promise<any> {
  const brand = await storage.getBrand(task.brandId);
  if (!brand) throw new Error(`Brand ${task.brandId} not found`);

  switch (task.agentType) {
    case 'content': return await runContentAgent(brand, task.input);
    case 'schema': return await runSchemaAgent(brand, task.input);
    case 'outreach': return await runOutreachAgent(brand, task.input);
    default: throw new Error(`Unknown agent type: ${task.agentType}`);
  }
}

/**
 * Execute an approved task: ensure output exists, then publish content artifacts
 * to the connected CMS when a target connection is set.
 */
export async function executeAgentTask(taskId: string): Promise<AgentTask> {
  const task = await storage.getAgentTask(taskId);
  if (!task) throw new Error(`Agent task ${taskId} not found`);

  await storage.updateAgentTask(taskId, { status: 'executing' } as any);

  try {
    let output: any = task.output;
    if (!output) {
      output = await generateAgentOutput(task);
      await storage.updateAgentTask(taskId, { output } as any);
    }

    let publishResult: any = null;
    if (task.targetConnectionId && (task.agentType === 'content' || task.agentType === 'schema')) {
      const conn = await storage.getCmsConnection(task.targetConnectionId);
      if (!conn) throw new Error('Target CMS connection not found');
      publishResult = await publishToCms(conn.platform as CmsPlatform, conn.config, {
        title: output.title || task.title || 'Untitled',
        html: output.html,
        status: 'draft',
      });
      if (!publishResult.ok) {
        await storage.updateCmsConnection(conn.id, { status: 'error', lastError: publishResult.error } as any);
      }
    }

    const updated = await storage.updateAgentTask(taskId, {
      status: publishResult && !publishResult.ok ? 'failed' : 'completed',
      publishResult,
      error: publishResult && !publishResult.ok ? publishResult.error : null,
    } as any);
    logger.info(`[ExecutionAgent] task=${taskId} type=${task.agentType} published=${publishResult ? publishResult.ok : 'n/a'}`);
    return updated;
  } catch (err: any) {
    const updated = await storage.updateAgentTask(taskId, { status: 'failed', error: err?.message || String(err) } as any);
    logger.error(`[ExecutionAgent] task=${taskId} failed: ${err?.message || err}`);
    return updated;
  }
}
