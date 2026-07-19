import { AGENT_TASK_STATES, type AgentTaskState } from './classroom-runtime';

export const AGENT_ACTION_SCHEMA_VERSION = 1 as const;

export interface AgentActionInput {
  schemaVersion: typeof AGENT_ACTION_SCHEMA_VERSION;
  action: AgentTaskState;
  requestId: string;
}

export type AgentActionParseResult =
  | { ok: true; command: AgentActionInput }
  | { ok: false; error: string };

function isAgentTaskState(value: unknown): value is AgentTaskState {
  return (
    typeof value === 'string' &&
    AGENT_TASK_STATES.includes(value as AgentTaskState)
  );
}

export function isValidActionRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

export function parseAgentAction(input: unknown): AgentActionParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: '行为指令必须是对象' };
  }
  const candidate = input as Record<string, unknown>;
  const allowedKeys = new Set(['schemaVersion', 'action', 'requestId']);
  const unknownKey = Object.keys(candidate).find(
    (key) => !allowedKeys.has(key),
  );
  if (unknownKey) {
    return { ok: false, error: `行为指令不允许字段：${unknownKey}` };
  }
  if (candidate.schemaVersion !== AGENT_ACTION_SCHEMA_VERSION) {
    return { ok: false, error: '不支持的行为指令版本' };
  }
  if (!isAgentTaskState(candidate.action)) {
    return { ok: false, error: 'action 不受支持' };
  }
  if (!isValidActionRequestId(candidate.requestId)) {
    return { ok: false, error: 'requestId 格式无效' };
  }
  return {
    ok: true,
    command: {
      schemaVersion: AGENT_ACTION_SCHEMA_VERSION,
      action: candidate.action,
      requestId: candidate.requestId,
    },
  };
}
