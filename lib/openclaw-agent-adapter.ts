import {
  AGENT_MESSAGE_CHANNELS,
  AGENT_MESSAGE_CONVERSATION_TYPES,
  AGENT_MESSAGE_SENDER_ROLES,
  AGENT_EVENT_SCHEMA_VERSION,
  AgentMessageEvent,
  AgentMessageOrigin,
  AgentPresenceEvent,
  AgentRuntimeEvent,
  AgentStateEvent,
} from './agent-event-contract';
import {
  AgentTaskState,
  CLASSROOM_ENTRANCE_ID,
} from './classroom-runtime';
import { sanitizeOpenClawDisplayText } from './openclaw-message-display';

export const OPENCLAW_BRIDGE_VERSION = 1 as const;

export const OPENCLAW_BRIDGE_HOOKS = [
  'gateway_start',
  'gateway_stop',
  'message_received',
  'before_agent_run',
  'before_tool_call',
  'after_tool_call',
  'agent_end',
  'message_sending',
  'message_sent',
] as const;

export type OpenClawBridgeHook = (typeof OPENCLAW_BRIDGE_HOOKS)[number];

export interface OpenClawBridgeEvent {
  bridgeVersion: typeof OPENCLAW_BRIDGE_VERSION;
  kind: 'openclaw.hook';
  bridgeEventId: string;
  hook: OpenClawBridgeHook;
  classroomAgentId: string;
  observedAt: string;
  nativeAgentId?: string;
  runtimeInstanceId?: string;
  adapterVersion?: string;
  runId?: string;
  sessionKey?: string;
  sessionId?: string;
  data?: Record<string, unknown>;
}

export type OpenClawBridgeParseResult =
  | { ok: true; event: OpenClawBridgeEvent }
  | { ok: false; error: string };

export type OpenClawAdapterResult =
  | { ok: true; events: AgentRuntimeEvent[]; ignored?: string }
  | { ok: false; error: string };

export interface AgentSequenceClock {
  next(agentId: string): number;
}

interface MonotonicAgentSequenceClockOptions {
  now?: () => Date;
}

export class MonotonicAgentSequenceClock implements AgentSequenceClock {
  private readonly lastByAgent = new Map<string, number>();
  private readonly now: () => Date;

  constructor(options: MonotonicAgentSequenceClockOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  next(agentId: string): number {
    // Millisecond epoch * 1000 leaves room for 1000 events in the same ms and
    // remains below Number.MAX_SAFE_INTEGER for centuries.
    const wallClockCandidate = this.now().getTime() * 1000;
    const last = this.lastByAgent.get(agentId) ?? 0;
    const sequence = Math.max(wallClockCandidate, last + 1, 1);
    this.lastByAgent.set(agentId, sequence);
    return sequence;
  }
}

interface OpenClawAgentAdapterOptions {
  clock?: AgentSequenceClock;
  now?: () => Date;
  maxSeenBridgeEvents?: number;
  semanticDuplicateWindowMs?: number;
}

const RESEARCH_TOOL_MARKERS = [
  'search',
  'fetch',
  'browser',
  'read',
  'find',
  'query',
  'lookup',
  'list',
  'grep',
  'view_image',
];

const WRITING_TOOL_MARKERS = [
  'write',
  'edit',
  'apply_patch',
  'create',
  'document',
  'spreadsheet',
  'presentation',
  'imagegen',
  'image_gen',
];

const SYNC_TOOL_MARKERS = [
  'send',
  'upload',
  'push',
  'publish',
  'deploy',
  'message',
  'email',
  'slack',
  'notify',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOpenClawBridgeHook(value: unknown): value is OpenClawBridgeHook {
  return (
    typeof value === 'string' &&
    OPENCLAW_BRIDGE_HOOKS.includes(value as OpenClawBridgeHook)
  );
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalMessageOrigin(
  data: Record<string, unknown>,
): AgentMessageOrigin | undefined {
  const value = data.messageOrigin;
  if (!isRecord(value)) return undefined;
  if (
    !AGENT_MESSAGE_CHANNELS.includes(
      value.channel as AgentMessageOrigin['channel'],
    ) ||
    !AGENT_MESSAGE_CONVERSATION_TYPES.includes(
      value.conversationType as AgentMessageOrigin['conversationType'],
    ) ||
    !AGENT_MESSAGE_SENDER_ROLES.includes(
      value.senderRole as AgentMessageOrigin['senderRole'],
    )
  ) {
    return undefined;
  }
  const senderName =
    typeof value.senderName === 'string' && value.senderName.trim()
      ? Array.from(value.senderName.trim()).slice(0, 80).join('')
      : undefined;
  return {
    channel: value.channel as AgentMessageOrigin['channel'],
    conversationType:
      value.conversationType as AgentMessageOrigin['conversationType'],
    senderRole: value.senderRole as AgentMessageOrigin['senderRole'],
    ...(senderName ? { senderName } : {}),
  };
}

function truncate(value: string, limit = 120): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= limit ? compact : `${compact.slice(0, limit - 1)}…`;
}

export function classifyOpenClawTool(toolName: string): AgentTaskState {
  const normalized = toolName.trim().toLowerCase();
  if (SYNC_TOOL_MARKERS.some((marker) => normalized.includes(marker))) {
    return 'syncing';
  }
  if (WRITING_TOOL_MARKERS.some((marker) => normalized.includes(marker))) {
    return 'writing';
  }
  if (RESEARCH_TOOL_MARKERS.some((marker) => normalized.includes(marker))) {
    return 'researching';
  }
  return 'executing';
}

export function parseOpenClawBridgeEvent(
  input: unknown,
): OpenClawBridgeParseResult {
  if (!isRecord(input)) return { ok: false, error: 'OpenClaw 事件必须是对象' };
  if (input.bridgeVersion !== OPENCLAW_BRIDGE_VERSION) {
    return { ok: false, error: '不支持的 OpenClaw bridgeVersion' };
  }
  if (input.kind !== 'openclaw.hook') {
    return { ok: false, error: 'OpenClaw 事件 kind 不受支持' };
  }
  if (!isNonEmptyString(input.bridgeEventId)) {
    return { ok: false, error: 'bridgeEventId 不能为空' };
  }
  if (!isOpenClawBridgeHook(input.hook)) {
    return { ok: false, error: 'OpenClaw hook 不受支持' };
  }
  if (!isNonEmptyString(input.classroomAgentId)) {
    return { ok: false, error: 'classroomAgentId 不能为空' };
  }
  if (
    !isNonEmptyString(input.observedAt) ||
    Number.isNaN(Date.parse(input.observedAt))
  ) {
    return { ok: false, error: 'observedAt 必须是有效时间' };
  }
  for (const field of [
    'nativeAgentId',
    'runtimeInstanceId',
    'adapterVersion',
    'runId',
    'sessionKey',
    'sessionId',
  ]) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      return { ok: false, error: `${field} 必须是字符串` };
    }
  }
  if (input.data !== undefined && !isRecord(input.data)) {
    return { ok: false, error: 'data 必须是对象' };
  }
  const data = isRecord(input.data) ? input.data : {};
  if (
    (input.hook === 'before_tool_call' || input.hook === 'after_tool_call') &&
    !isNonEmptyString(data.toolName)
  ) {
    return { ok: false, error: `${input.hook} 必须包含 toolName` };
  }
  if (
    (input.hook === 'agent_end' || input.hook === 'message_sent') &&
    typeof data.success !== 'boolean'
  ) {
    return { ok: false, error: `${input.hook} 必须包含布尔值 success` };
  }
  if (
    input.hook === 'message_received' &&
    !isNonEmptyString(data.messageContent)
  ) {
    return { ok: false, error: 'message_received 必须包含 messageContent' };
  }
  if (
    input.hook === 'message_received' &&
    optionalMessageOrigin(data) === undefined
  ) {
    return { ok: false, error: 'message_received 必须包含有效的 messageOrigin' };
  }
  return { ok: true, event: input as unknown as OpenClawBridgeEvent };
}

export class OpenClawAgentAdapter {
  private readonly clock: AgentSequenceClock;
  private readonly now: () => Date;
  private readonly maxSeenBridgeEvents: number;
  private readonly semanticDuplicateWindowMs: number;
  private readonly seenBridgeEventIds = new Set<string>();
  private readonly seenBridgeEventOrder: string[] = [];
  private readonly recentRunStarts = new Map<string, number>();

  constructor(options: OpenClawAgentAdapterOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.clock = options.clock ?? new MonotonicAgentSequenceClock({ now: this.now });
    this.maxSeenBridgeEvents = options.maxSeenBridgeEvents ?? 5000;
    this.semanticDuplicateWindowMs = options.semanticDuplicateWindowMs ?? 1500;
  }

  adapt(input: unknown): OpenClawAdapterResult {
    const parsed = parseOpenClawBridgeEvent(input);
    if (parsed.ok === false) {
      return { ok: false, error: parsed.error };
    }
    const bridgeEvent = parsed.event;

    if (this.seenBridgeEventIds.has(bridgeEvent.bridgeEventId)) {
      return { ok: true, events: [], ignored: 'duplicate_bridge_event' };
    }
    this.rememberBridgeEvent(bridgeEvent.bridgeEventId);

    if (this.isDuplicateRunStart(bridgeEvent)) {
      return { ok: true, events: [], ignored: 'semantic_duplicate_run_start' };
    }

    const mapped = this.mapHook(bridgeEvent);
    return {
      ok: true,
      events: mapped,
      ignored: mapped.length > 0 ? undefined : 'no_mapping',
    };
  }

  private rememberBridgeEvent(eventId: string) {
    this.seenBridgeEventIds.add(eventId);
    this.seenBridgeEventOrder.push(eventId);
    while (this.seenBridgeEventOrder.length > this.maxSeenBridgeEvents) {
      const oldest = this.seenBridgeEventOrder.shift();
      if (oldest) this.seenBridgeEventIds.delete(oldest);
    }
  }

  private isDuplicateRunStart(event: OpenClawBridgeEvent): boolean {
    if (event.hook !== 'before_agent_run') return false;
    const sessionIdentity = event.sessionId ?? event.sessionKey;
    if (!sessionIdentity) return false;
    const key = [
      event.classroomAgentId,
      event.nativeAgentId ?? '',
      sessionIdentity,
    ].join(':');
    const observedAt = Date.parse(event.observedAt);
    const previous = this.recentRunStarts.get(key);
    this.recentRunStarts.set(
      key,
      previous === undefined ? observedAt : Math.max(previous, observedAt),
    );
    return (
      previous !== undefined &&
      Math.abs(observedAt - previous) <= this.semanticDuplicateWindowMs
    );
  }

  private base(event: OpenClawBridgeEvent) {
    const data = event.data ?? {};
    return {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      eventId: event.bridgeEventId.startsWith('openclaw:')
        ? event.bridgeEventId
        : `openclaw:${event.bridgeEventId}`,
      agentId: event.classroomAgentId,
      source: 'openclaw' as const,
      observedAt: event.observedAt || this.now().toISOString(),
      sequence: this.clock.next(event.classroomAgentId),
      metadata: {
        adapter: 'openclaw-native-hooks-v1',
        hook: event.hook,
        ...(event.nativeAgentId ? { nativeAgentId: event.nativeAgentId } : {}),
        ...(event.runtimeInstanceId
          ? { runtimeInstanceId: event.runtimeInstanceId }
          : {}),
        ...(event.adapterVersion
          ? { adapterVersion: event.adapterVersion }
          : {}),
        ...(event.runId ? { runId: event.runId } : {}),
        ...(event.sessionKey ? { sessionKey: event.sessionKey } : {}),
        ...(event.sessionId ? { sessionId: event.sessionId } : {}),
        ...(optionalString(data, 'toolName')
          ? { toolName: optionalString(data, 'toolName') }
          : {}),
        ...(optionalString(data, 'toolCallId')
          ? { toolCallId: optionalString(data, 'toolCallId') }
          : {}),
      },
    };
  }

  private stateEvent(
    event: OpenClawBridgeEvent,
    state: AgentTaskState,
    taskSummary?: string,
  ): AgentStateEvent {
    return {
      ...this.base(event),
      type: 'agent.state',
      state,
      ...(taskSummary ? { taskSummary: truncate(taskSummary) } : {}),
    };
  }

  private presenceEvent(
    event: OpenClawBridgeEvent,
    action: 'enter' | 'leave',
  ): AgentPresenceEvent {
    return {
      ...this.base(event),
      type: 'agent.presence',
      action,
      scenePointId: CLASSROOM_ENTRANCE_ID,
    };
  }

  private messageEvent(
    event: OpenClawBridgeEvent,
    direction: AgentMessageEvent['direction'],
    content: string,
    origin?: AgentMessageOrigin,
  ): AgentMessageEvent {
    const base = this.base(event);
    return {
      ...base,
      eventId: `${base.eventId}:message`,
      type: 'agent.message',
      direction,
      content: truncate(content, 280),
      ...(origin ? { origin } : {}),
    };
  }

  private mapHook(event: OpenClawBridgeEvent): AgentRuntimeEvent[] {
    const data = event.data ?? {};
    switch (event.hook) {
      case 'gateway_start':
        return [this.presenceEvent(event, 'enter')];
      case 'gateway_stop':
        return [this.presenceEvent(event, 'leave')];
      case 'message_received': {
        const messageContent = optionalString(data, 'messageContent');
        if (!messageContent) return [];
        return [
          this.stateEvent(event, 'syncing', '正在接收并处理消息'),
          this.messageEvent(
            event,
            'incoming',
            messageContent,
            optionalMessageOrigin(data),
          ),
        ];
      }
      case 'before_agent_run': {
        return [
          this.stateEvent(event, 'syncing', '开始处理任务'),
        ];
      }
      case 'before_tool_call': {
        const toolName = optionalString(data, 'toolName') ?? 'unknown-tool';
        return [
          this.stateEvent(
            event,
            classifyOpenClawTool(toolName),
            `调用 ${toolName}`,
          ),
        ];
      }
      case 'after_tool_call': {
        const toolName = optionalString(data, 'toolName') ?? 'unknown-tool';
        const error = optionalString(data, 'error');
        return [
          error
            ? this.stateEvent(event, 'error', `${toolName} 失败：${error}`)
            : this.stateEvent(event, 'syncing', `${toolName} 已完成，准备回复`),
        ];
      }
      case 'agent_end': {
        const success = data.success !== false;
        const error = optionalString(data, 'error');
        const rawMessageContent = success
          ? optionalString(data, 'messageContent')
          : undefined;
        const messageContent = rawMessageContent
          ? sanitizeOpenClawDisplayText(rawMessageContent)
          : undefined;
        return [
          success
            ? this.stateEvent(event, 'idle', '任务处理完成')
            : this.stateEvent(event, 'error', error ?? 'Agent 运行失败'),
          ...(messageContent
            ? [this.messageEvent(event, 'outgoing', messageContent)]
            : []),
        ];
      }
      case 'message_sending': {
        const rawMessageContent = optionalString(data, 'messageContent');
        const messageContent = rawMessageContent
          ? sanitizeOpenClawDisplayText(rawMessageContent)
          : undefined;
        return [
          this.stateEvent(event, 'syncing', '正在发送结果'),
          ...(messageContent
            ? [this.messageEvent(event, 'outgoing', messageContent)]
            : []),
        ];
      }
      case 'message_sent': {
        const success = data.success !== false;
        const error = optionalString(data, 'error');
        return [
          success
            ? this.stateEvent(event, 'idle', '结果发送完成')
            : this.stateEvent(event, 'error', error ?? '结果发送失败'),
        ];
      }
      default:
        return [];
    }
  }
}
