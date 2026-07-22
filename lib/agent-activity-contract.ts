import {
  parseAgentRuntimeEvent,
  type AgentRuntimeEvent,
} from './agent-event-contract';
import {
  STATE_CONFIG,
  type AgentTaskState,
} from './classroom-runtime';

export const AGENT_ACTIVITY_SCHEMA_VERSION = 1 as const;
export const DEFAULT_AGENT_ACTIVITY_PAGE_SIZE = 20;
export const MAX_AGENT_ACTIVITY_PAGE_SIZE = 50;

export type AgentActivityKind =
  | 'presence'
  | 'command'
  | 'task'
  | 'completion'
  | 'error'
  | 'message'
  | 'activity';

export type AgentActivityTone =
  | 'neutral'
  | 'positive'
  | 'attention'
  | 'danger';

export interface AgentActivityItem {
  cursor: string;
  kind: AgentActivityKind;
  tone: AgentActivityTone;
  title: string;
  detail: string;
  observedAt: string;
}

export interface AgentActivityPage {
  items: AgentActivityItem[];
  nextCursor: string | null;
}

export interface AgentActivityRecord {
  id: number;
  eventType: string;
  payload: unknown;
  observedAt: Date | string;
}

export type AgentActivityPageQuery =
  | { ok: true; cursor?: number; limit: number }
  | { ok: false; error: string };

const COMMAND_LABELS: Record<AgentTaskState, string> = {
  idle: '休息',
  writing: '写画',
  researching: '阅读',
  executing: '手工',
  syncing: '交流',
  error: '检查',
};

const TASK_TITLES: Record<AgentTaskState, string> = {
  idle: '回到日常活动',
  writing: '开始写画活动',
  researching: '开始阅读活动',
  executing: '开始手工活动',
  syncing: '开始交流活动',
  error: '活动出现异常',
};

function parsePositiveInteger(
  raw: string | null,
  label: string,
  maximum: number,
): { ok: true; value?: number } | { ok: false; error: string } {
  if (raw === null) return { ok: true };
  if (!/^[1-9]\d*$/.test(raw)) {
    return { ok: false, error: `${label} 必须是正整数` };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    return { ok: false, error: `${label} 超出允许范围` };
  }
  return { ok: true, value };
}

export function parseAgentActivityPageQuery(
  searchParams: URLSearchParams,
): AgentActivityPageQuery {
  const cursor = parsePositiveInteger(
    searchParams.get('cursor'),
    'cursor',
    Number.MAX_SAFE_INTEGER,
  );
  if (!cursor.ok) return cursor;
  const limit = parsePositiveInteger(
    searchParams.get('limit'),
    'limit',
    MAX_AGENT_ACTIVITY_PAGE_SIZE,
  );
  if (!limit.ok) return limit;
  return {
    ok: true,
    ...(cursor.value === undefined ? {} : { cursor: cursor.value }),
    limit: limit.value ?? DEFAULT_AGENT_ACTIVITY_PAGE_SIZE,
  };
}

function eventMetadataHook(event: AgentRuntimeEvent): string | undefined {
  const hook = event.metadata?.hook;
  return typeof hook === 'string' ? hook : undefined;
}

function normalizedObservedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function stateActivity(
  cursor: string,
  event: Extract<AgentRuntimeEvent, { type: 'agent.state' }>,
  observedAt: string,
): AgentActivityItem {
  const location = STATE_CONFIG[event.state].location;
  if (event.source === 'command') {
    return {
      cursor,
      kind: 'command',
      tone: 'attention',
      title: `已收到“${COMMAND_LABELS[event.state]}”指令`,
      detail: `准备前往${location}`,
      observedAt,
    };
  }

  if (event.state === 'error') {
    return {
      cursor,
      kind: 'error',
      tone: 'danger',
      title: TASK_TITLES.error,
      detail: `已前往${location}等待检查`,
      observedAt,
    };
  }

  if (event.state === 'idle') {
    const hook = eventMetadataHook(event);
    const title =
      hook === 'agent_end'
        ? '任务已经完成'
        : hook === 'message_sent'
          ? '结果已经发送'
          : TASK_TITLES.idle;
    return {
      cursor,
      kind: 'completion',
      tone: 'positive',
      title,
      detail: `回到${location}`,
      observedAt,
    };
  }

  return {
    cursor,
    kind: 'task',
    tone: 'neutral',
    title: TASK_TITLES[event.state],
    detail: `前往${location}`,
    observedAt,
  };
}

export function mapAgentActivityRecord(
  record: AgentActivityRecord,
): AgentActivityItem {
  const cursor = String(record.id);
  const observedAt = normalizedObservedAt(record.observedAt);
  const parsed = parseAgentRuntimeEvent(record.payload);
  if (!parsed.ok || parsed.event.type !== record.eventType) {
    return {
      cursor,
      kind: 'activity',
      tone: 'neutral',
      title: '活动记录已更新',
      detail: '这条记录不包含可展示的详细信息',
      observedAt,
    };
  }

  if (parsed.event.type === 'agent.state') {
    return stateActivity(cursor, parsed.event, observedAt);
  }

  if (parsed.event.type === 'agent.message') {
    return parsed.event.direction === 'incoming'
      ? {
          cursor,
          kind: 'message',
          tone: 'attention',
          title: '收到主人消息',
          detail: '已开始处理并准备回复',
          observedAt,
        }
      : {
          cursor,
          kind: 'message',
          tone: 'positive',
          title: '已经回复主人',
          detail: '回复已送往消息渠道',
          observedAt,
        };
  }

  return parsed.event.action === 'enter'
    ? {
        cursor,
        kind: 'presence',
        tone: 'positive',
        title: '进入教室',
        detail: '已从教室入口进入',
        observedAt,
      }
    : {
        cursor,
        kind: 'presence',
        tone: 'neutral',
        title: '离开教室',
        detail: '已从教室入口离开',
        observedAt,
      };
}
