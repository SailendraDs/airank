// server/services/ai-fix-agent.ts
// AI fix execution using CLI or API method

import { exec } from 'child_process';
import { promisify } from 'util';
import { jobMonitor } from './job-monitor';
import type { JobHistoryEntry, AIFixConfig } from './job-monitor';

const execAsync = promisify(exec);

export interface FixResult {
  success: boolean;
  fixed: boolean;
  message: string;
  changes?: string[];
}

export async function runAIFix(
  job: JobHistoryEntry,
  config: AIFixConfig
): Promise<FixResult> {
  console.log(`[AIFix] Starting fix for job ${job.id} (${job.type}) using ${config.fixMethod}`);

  try {
    if (config.fixMethod === 'cli') {
      return await runCLIFix(job, config);
    } else {
      return await runAPIFix(job, config);
    }
  } catch (err: any) {
    return {
      success: false,
      fixed: false,
      message: err.message,
    };
  }
}

async function runAPIFix(job: JobHistoryEntry, config: AIFixConfig): Promise<FixResult> {
  if (!config.apiKey) {
    return {
      success: false,
      fixed: false,
      message: 'API key not configured',
    };
  }

  const prompt = buildFixPrompt(job);

  const response = await fetch(`${config.apiUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return {
      success: false,
      fixed: false,
      message: `API error: ${response.status} - ${err}`,
    };
  }

  const data = await response.json();
  const analysis = data.content?.[0]?.text || '';

  // Record the fix
  await jobMonitor.recordAIFix(job.id, `api:${config.model}`);

  return {
    success: true,
    fixed: true,
    message: 'Fix applied via API',
    changes: [analysis],
  };
}

async function runCLIFix(job: JobHistoryEntry, config: AIFixConfig): Promise<FixResult> {
  const scriptPath = `/tmp/fix-${job.id}.sh`;
  const prompt = buildFixPrompt(job);

  // Create fix script
  const script = `#!/bin/bash
echo '${JSON.stringify({ job, prompt })}' > ${scriptPath}.json
claude fix --input ${scriptPath}.json
rm ${scriptPath}.json
`;

  try {
    const { stdout, stderr } = await execAsync(script, {
      timeout: config.timeoutMinutes * 60 * 1000,
    });

    await jobMonitor.recordAIFix(job.id, 'cli:claude');

    return {
      success: true,
      fixed: true,
      message: 'Fix applied via CLI',
      changes: [stdout, stderr].filter(Boolean),
    };
  } catch (err: any) {
    return {
      success: false,
      fixed: false,
      message: err.message,
    };
  }
}

function buildFixPrompt(job: JobHistoryEntry): string {
  return `You are an AIRank system debugger. Analyze this job failure and provide a fix.

Job Details:
- Job ID: ${job.id}
- Type: ${job.type}
- Brand ID: ${job.brandId || 'N/A'}
- Error: ${job.errorMessage || 'Unknown error'}
- Error Trace: ${job.errorTrace || 'No trace available'}

Payload:
${JSON.stringify(job.payload, null, 2)}

Your task:
1. Analyze the error to identify the root cause
2. Determine what fix is needed (if any)
3. Describe the fix that will be applied
4. If no fix is needed, explain why

Be specific and actionable.`;
}

export async function triggerManualFix(jobId: string): Promise<FixResult> {
  const job = await jobMonitor.getJob(jobId);
  if (!job) {
    return {
      success: false,
      fixed: false,
      message: 'Job not found',
    };
  }

  const config = await jobMonitor.getAIFixConfig();
  return runAIFix(job, config);
}
