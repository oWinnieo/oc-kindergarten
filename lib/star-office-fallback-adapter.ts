import {
  AGENT_EVENT_SCHEMA_VERSION,
  AgentStateEvent,
} from './agent-event-contract';
import { AGENT_TASK_STATES, AgentTaskState } from './classroom-runtime';
import {
  AgentSequenceClock,
  MonotonicAgentSequenceClock,
} from './openclaw-agent-adapter';

export interface StarOfficeSnapshotContext {
  classroomAgentId: string;
  snapshotId?: string;
}

export type StarOfficeFallbackResult =
  | { ok: true; events: AgentStateEvent[]; ignored?: string }
  | { ok: false; error: string };

interface StarOfficeFallbackAdapterOptions {
  clock?: AgentSequenceClock;
  now?: () => Date;
  staleAfterMs?: number;
}

const STATE_ALIASES: Readonly<Record<string, AgentTaskState>> = {
  working: 'writing',
  busy: 'writing',
  write: 'writing',
  receiving: 'syncing',
  replying: 'syncing',
  run: 'executing',
  running: 'executing',
  execute: 'executing',
  exec: 'executing',
  research: 'researching',
  search: 'researching',
  sync: 'syncing',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(value: string, limit = 120): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= limit ? compact : `${compact.slice(0, limit - 1)}…`;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function normalizeStarOfficeState(value: unknown): AgentTaskState | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (AGENT_TASK_STATES.includes(normalized as AgentTaskState)) {
    return normalized as AgentTaskState;
  }
  return STATE_ALIASES[normalized] ?? null;
}

export class StarOfficeFallbackAdapter {
  private readonly clock: AgentSequenceClock;
  private readonly now: () => Date;
  private readonly staleAfterMs: number;
  private readonly lastSnapshotKeyByAgent = new Map<string, string>();

  constructor(options: StarOfficeFallbackAdapterOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.clock = options.clock ?? new MonotonicAgentSequenceClock({ now: this.now });
    this.staleAfterMs = options.staleAfterMs ?? 10 * 60 * 1000;
  }

  adapt(snapshot: unknown, context: StarOfficeSnapshotContext): StarOfficeFallbackResult {
    if (!context.classroomAgentId.trim()) {
      return { ok: false, error: 'classroomAgentId 不能为空' };
    }
    if (!isRecord(snapshot)) {
      return { ok: false, error: 'Star Office snapshot 必须是对象' };
    }

    const normalizedState = normalizeStarOfficeState(snapshot.state);
    if (!normalizedState) {
      return { ok: false, error: `不支持的 Star Office 状态：${String(snapshot.state)}` };
    }
    const detail = typeof snapshot.detail === 'string' ? truncate(snapshot.detail) : '';
    const rawUpdatedAt = snapshot.updated_at;
    const parsedUpdatedAt =
      typeof rawUpdatedAt === 'string' ? Date.parse(rawUpdatedAt) : Number.NaN;
    const hasValidUpdatedAt = !Number.isNaN(parsedUpdatedAt);
    const stale =
      hasValidUpdatedAt && this.now().getTime() - parsedUpdatedAt > this.staleAfterMs;
    const state = stale ? 'idle' : normalizedState;
    const observedAt = hasValidUpdatedAt
      ? new Date(parsedUpdatedAt).toISOString()
      : this.now().toISOString();
    const taskSummary = stale
      ? `状态超过 ${Math.round(this.staleAfterMs / 1000)} 秒未更新，自动待命`
      : detail || undefined;
    const snapshotKey = JSON.stringify({ state, detail, observedAt, stale });

    if (this.lastSnapshotKeyByAgent.get(context.classroomAgentId) === snapshotKey) {
      return { ok: true, events: [], ignored: 'unchanged_snapshot' };
    }
    this.lastSnapshotKeyByAgent.set(context.classroomAgentId, snapshotKey);

    const snapshotId = context.snapshotId?.trim() || hashString(snapshotKey);
    const event: AgentStateEvent = {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      eventId: `openclaw:star:${context.classroomAgentId}:${snapshotId}`,
      type: 'agent.state',
      agentId: context.classroomAgentId,
      source: 'openclaw',
      observedAt,
      sequence: this.clock.next(context.classroomAgentId),
      state,
      ...(taskSummary ? { taskSummary } : {}),
      metadata: {
        adapter: 'star-office-state-fallback-v1',
        originalState: normalizedState,
        stale,
        ...(typeof snapshot.progress === 'number'
          ? { progress: snapshot.progress }
          : {}),
      },
    };
    return { ok: true, events: [event] };
  }
}
