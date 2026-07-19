import {
  AGENT_TASK_STATES,
  AgentTaskState,
  CLASSROOM_ENTRANCE_ID,
} from './classroom-runtime';

export const AGENT_EVENT_SCHEMA_VERSION = 1 as const;

export const AGENT_EVENT_SOURCES = [
  'openclaw',
  'hermes',
  'mock',
  'replay',
] as const;

export const AGENT_PRESENCE_ACTIONS = ['enter', 'leave'] as const;
export const CLASSROOM_SCENE_POINT_IDS = [CLASSROOM_ENTRANCE_ID] as const;

export type AgentEventSource = (typeof AGENT_EVENT_SOURCES)[number];
export type AgentPresenceAction = (typeof AGENT_PRESENCE_ACTIONS)[number];
export type ClassroomScenePointId = (typeof CLASSROOM_SCENE_POINT_IDS)[number];

interface AgentEventBase {
  schemaVersion: typeof AGENT_EVENT_SCHEMA_VERSION;
  eventId: string;
  agentId: string;
  source: AgentEventSource;
  observedAt: string;
  sequence: number;
  metadata?: Record<string, unknown>;
}

export interface AgentStateEvent extends AgentEventBase {
  type: 'agent.state';
  state: AgentTaskState;
  taskSummary?: string;
}

export interface AgentPresenceEvent extends AgentEventBase {
  type: 'agent.presence';
  action: AgentPresenceAction;
  scenePointId: ClassroomScenePointId;
}

export type AgentRuntimeEvent = AgentStateEvent | AgentPresenceEvent;

export type AgentEventParseResult =
  | { ok: true; event: AgentRuntimeEvent }
  | { ok: false; error: string };

export interface AgentEventAdapter {
  readonly source: AgentEventSource;
  createStateEvent(
    agentId: string,
    state: AgentTaskState,
    taskSummary?: string,
  ): AgentStateEvent;
  createPresenceEvent(
    agentId: string,
    action: AgentPresenceAction,
    scenePointId?: ClassroomScenePointId,
  ): AgentPresenceEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function includesValue<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

export function parseAgentRuntimeEvent(input: unknown): AgentEventParseResult {
  if (!isRecord(input)) return { ok: false, error: '事件必须是对象' };
  if (input.schemaVersion !== AGENT_EVENT_SCHEMA_VERSION) {
    return { ok: false, error: '不支持的事件契约版本' };
  }
  if (!isNonEmptyString(input.eventId)) {
    return { ok: false, error: 'eventId 不能为空' };
  }
  if (!isNonEmptyString(input.agentId)) {
    return { ok: false, error: 'agentId 不能为空' };
  }
  if (!includesValue(AGENT_EVENT_SOURCES, input.source)) {
    return { ok: false, error: 'source 不受支持' };
  }
  if (
    !isNonEmptyString(input.observedAt) ||
    Number.isNaN(Date.parse(input.observedAt))
  ) {
    return { ok: false, error: 'observedAt 必须是有效的 ISO 时间' };
  }
  if (!Number.isSafeInteger(input.sequence) || Number(input.sequence) < 1) {
    return { ok: false, error: 'sequence 必须是大于 0 的安全整数' };
  }
  if (input.metadata !== undefined && !isRecord(input.metadata)) {
    return { ok: false, error: 'metadata 必须是对象' };
  }

  if (input.type === 'agent.state') {
    if (!includesValue(AGENT_TASK_STATES, input.state)) {
      return { ok: false, error: 'state 不受支持' };
    }
    if (input.taskSummary !== undefined && typeof input.taskSummary !== 'string') {
      return { ok: false, error: 'taskSummary 必须是字符串' };
    }
    return { ok: true, event: input as unknown as AgentStateEvent };
  }

  if (input.type === 'agent.presence') {
    if (!includesValue(AGENT_PRESENCE_ACTIONS, input.action)) {
      return { ok: false, error: 'presence action 不受支持' };
    }
    if (!includesValue(CLASSROOM_SCENE_POINT_IDS, input.scenePointId)) {
      return { ok: false, error: 'scenePointId 不受支持' };
    }
    return { ok: true, event: input as unknown as AgentPresenceEvent };
  }

  return { ok: false, error: '事件 type 不受支持' };
}

interface MockAdapterOptions {
  now?: () => Date;
}

export function createMockAgentEventAdapter(
  options: MockAdapterOptions = {},
): AgentEventAdapter {
  let sequence = 0;
  const now = options.now ?? (() => new Date());

  const createBase = (agentId: string) => {
    sequence += 1;
    return {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      eventId: `mock:${sequence}:${agentId}`,
      agentId,
      source: 'mock' as const,
      observedAt: now().toISOString(),
      sequence,
    };
  };

  return {
    source: 'mock',
    createStateEvent(agentId, state, taskSummary) {
      return {
        ...createBase(agentId),
        type: 'agent.state',
        state,
        ...(taskSummary === undefined ? {} : { taskSummary }),
      };
    },
    createPresenceEvent(
      agentId,
      action,
      scenePointId = CLASSROOM_ENTRANCE_ID,
    ) {
      return {
        ...createBase(agentId),
        type: 'agent.presence',
        action,
        scenePointId,
      };
    },
  };
}
