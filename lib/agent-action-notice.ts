import type { AgentTaskState } from './classroom-runtime';

export const AGENT_ACTION_LOCATIONS: Record<AgentTaskState, string> = {
  idle: '休息区',
  writing: '写画区',
  researching: '阅读区',
  executing: '积木区',
  syncing: '邮件站',
  error: '修理区',
};

export function agentActionNotice(
  displayName: string,
  action: AgentTaskState,
): string {
  return `${displayName} 正在前往${AGENT_ACTION_LOCATIONS[action]}。`;
}
