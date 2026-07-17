// Agent Execution Worker (Epic D)
// Runs an approved execution-agent task (generate + optional CMS publish).

import type { QueuedJob } from '../queue';
import { executeAgentTask } from '../../services/execution-agents';

export interface AgentExecutionPayload {
  taskId: string;
}

export async function agentExecutionWorker(job: QueuedJob): Promise<{ taskId: string; status: string }> {
  const { taskId } = job.payload as unknown as AgentExecutionPayload;
  const task = await executeAgentTask(taskId);
  return { taskId, status: task.status };
}
