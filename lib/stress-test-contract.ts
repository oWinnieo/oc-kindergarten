import {
  AGENT_TASK_STATES,
  type AgentTaskState,
} from './classroom-runtime';

export const STRESS_TEST_AGENT_COUNTS = [3, 20] as const;
export const STRESS_TEST_OPERATIONS = ['enter', 'target', 'release'] as const;

export type StressTestAgentCount = (typeof STRESS_TEST_AGENT_COUNTS)[number];
export type StressTestOperation = (typeof STRESS_TEST_OPERATIONS)[number];

export interface StressTestCreateInput {
  runId: string;
  agentCount: StressTestAgentCount;
}

export interface StressTestOperationInput {
  runId: string;
  operation: StressTestOperation;
  state?: AgentTaskState;
  count?: number;
}

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseStressRunId(value: unknown): ParseResult<string> {
  if (
    typeof value !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{7,47}$/.test(value)
  ) {
    return {
      ok: false,
      error: 'runId 必须是 8-48 位小写字母、数字或连字符',
    };
  }
  return { ok: true, value };
}

export function stressAgentPrefix(runId: string): string {
  return `test-${runId}-`;
}

export function parseStressTestCreate(
  input: unknown,
): ParseResult<StressTestCreateInput> {
  if (!isRecord(input)) return { ok: false, error: '请求体必须是对象' };
  const runId = parseStressRunId(input.runId);
  if (!runId.ok) return runId;
  if (
    typeof input.agentCount !== 'number' ||
    !STRESS_TEST_AGENT_COUNTS.includes(
      input.agentCount as StressTestAgentCount,
    )
  ) {
    return { ok: false, error: 'agentCount 只能是 3 或 20' };
  }
  return {
    ok: true,
    value: {
      runId: runId.value,
      agentCount: input.agentCount as StressTestAgentCount,
    },
  };
}

export function parseStressTestOperation(
  input: unknown,
): ParseResult<StressTestOperationInput> {
  if (!isRecord(input)) return { ok: false, error: '请求体必须是对象' };
  const runId = parseStressRunId(input.runId);
  if (!runId.ok) return runId;
  if (
    typeof input.operation !== 'string' ||
    !STRESS_TEST_OPERATIONS.includes(input.operation as StressTestOperation)
  ) {
    return { ok: false, error: 'operation 不受支持' };
  }

  if (input.operation === 'target') {
    if (
      typeof input.state !== 'string' ||
      !AGENT_TASK_STATES.includes(input.state as AgentTaskState)
    ) {
      return { ok: false, error: 'target operation 需要有效 state' };
    }
    return {
      ok: true,
      value: {
        runId: runId.value,
        operation: 'target',
        state: input.state as AgentTaskState,
      },
    };
  }

  if (input.operation === 'release') {
    if (
      typeof input.count !== 'number' ||
      !Number.isSafeInteger(input.count) ||
      input.count < 1 ||
      input.count > 20
    ) {
      return { ok: false, error: 'release count 必须是 1-20 的整数' };
    }
    return {
      ok: true,
      value: {
        runId: runId.value,
        operation: 'release',
        count: input.count,
      },
    };
  }

  return {
    ok: true,
    value: { runId: runId.value, operation: 'enter' },
  };
}
