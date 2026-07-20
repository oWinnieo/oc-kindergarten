import {
  AGENT_TASK_STATES,
  type AgentTaskState,
} from './classroom-runtime';

export type ActivityWaitQueues = Map<AgentTaskState, string[]>;

export function removeAgentFromActivityWaitQueues(
  waitQueues: ActivityWaitQueues,
  agentId: string,
): void {
  for (const state of AGENT_TASK_STATES) {
    const queue = waitQueues.get(state);
    if (!queue) continue;
    const nextQueue = queue.filter((candidate) => candidate !== agentId);
    if (nextQueue.length > 0) waitQueues.set(state, nextQueue);
    else waitQueues.delete(state);
  }
}

export function enqueueActivityWaiter(
  waitQueues: ActivityWaitQueues,
  state: AgentTaskState,
  agentId: string,
): boolean {
  const currentQueue = waitQueues.get(state);
  if (currentQueue?.includes(agentId)) return false;

  removeAgentFromActivityWaitQueues(waitQueues, agentId);
  const queue = waitQueues.get(state) ?? [];
  queue.push(agentId);
  waitQueues.set(state, queue);
  return true;
}

export function shiftActivityWaiter(
  waitQueues: ActivityWaitQueues,
  state: AgentTaskState,
): string | null {
  const queue = waitQueues.get(state);
  const agentId = queue?.shift() ?? null;
  if (queue && queue.length === 0) waitQueues.delete(state);
  return agentId;
}
