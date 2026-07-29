import type { AgentTaskState } from './classroom-runtime';

const ACTIVE_WORK_STATES = new Set<AgentTaskState>([
  'writing',
  'researching',
  'executing',
]);

export function isComplexTaskStateSet(
  states: ReadonlySet<AgentTaskState>,
): boolean {
  return states.has('syncing') &&
    Array.from(ACTIVE_WORK_STATES).some((state) => states.has(state));
}

export function agentRuntimeStateNotice(
  displayName: string,
  state: AgentTaskState,
  taskStates: ReadonlySet<AgentTaskState>,
): string {
  if (state === 'idle') {
    return `${displayName} 已完成任务，正在自由活动。`;
  }
  if (state === 'error') {
    return `${displayName} 遇到问题，正在等待检查。`;
  }
  if (isComplexTaskStateSet(taskStates)) {
    return `${displayName} 正在处理复杂任务，期间可能在不同活动区之间移动。`;
  }
  if (state === 'syncing') {
    return `${displayName} 正在接收并处理任务。`;
  }
  if (state === 'researching') {
    return `${displayName} 正在查找和整理资料。`;
  }
  if (state === 'writing') {
    return `${displayName} 正在编写内容。`;
  }
  return `${displayName} 正在执行任务。`;
}
