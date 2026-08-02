import type {
  AgentMessageEvent,
  AgentPresenceEvent,
  AgentRuntimeEvent,
  AgentStateEvent,
} from './agent-event-contract';
import { AGENT_EVENT_SCHEMA_VERSION } from './agent-event-contract';
import type { AgentSequenceClock } from './openclaw-agent-adapter';
import type { AgentTaskState } from './classroom-runtime';
import { CLASSROOM_ENTRANCE_ID } from './classroom-runtime';
import type { HermesBridgeEvent } from './hermes-bridge-v1';
import { parseHermesBridgeV1 } from './hermes-bridge-v1';
import { sanitizeHermesDisplayText } from './hermes-message-display';
import type { ProviderRuntimeAdapterResult } from './provider-runtime-adapter';

const RESEARCH_TOOL_MARKERS = [
  'web',
  'search',
  'fetch',
  'browser',
  'read',
  'find',
  'query',
  'lookup',
  'list',
  'grep',
];
const WRITING_TOOL_MARKERS = [
  'write',
  'edit',
  'patch',
  'create',
  'document',
  'spreadsheet',
  'presentation',
  'image',
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

export function classifyHermesTool(toolName: string): AgentTaskState {
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

interface HermesAgentAdapterOptions {
  clock: AgentSequenceClock;
  maxSeenBridgeEvents?: number;
}

export class HermesAgentAdapter {
  private readonly clock: AgentSequenceClock;
  private readonly maxSeenBridgeEvents: number;
  private readonly seenBridgeEventIds = new Set<string>();
  private readonly seenBridgeEventOrder: string[] = [];

  constructor(options: HermesAgentAdapterOptions) {
    this.clock = options.clock;
    this.maxSeenBridgeEvents = options.maxSeenBridgeEvents ?? 5000;
  }

  adapt(
    input: unknown,
    classroomAgentId: string,
  ): ProviderRuntimeAdapterResult {
    const parsed = parseHermesBridgeV1(input);
    if (!parsed.ok) return parsed;
    if (this.seenBridgeEventIds.has(parsed.event.bridgeEventId)) {
      return { ok: true, events: [], ignored: 'duplicate_bridge_event' };
    }
    this.remember(parsed.event.bridgeEventId);
    const events = this.mapHook(parsed.event, classroomAgentId);
    return {
      ok: true,
      events,
      ...(events.length === 0 ? { ignored: 'no_mapping' } : {}),
    };
  }

  createBindingPresence(
    input: unknown,
    classroomAgentId: string,
  ): ProviderRuntimeAdapterResult {
    const parsed = parseHermesBridgeV1(input);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      events: [
        this.presenceEvent(
          parsed.event,
          classroomAgentId,
          `${parsed.event.bridgeEventId}:binding-enter`,
        ),
      ],
    };
  }

  private remember(eventId: string) {
    this.seenBridgeEventIds.add(eventId);
    this.seenBridgeEventOrder.push(eventId);
    while (this.seenBridgeEventOrder.length > this.maxSeenBridgeEvents) {
      const oldest = this.seenBridgeEventOrder.shift();
      if (oldest) this.seenBridgeEventIds.delete(oldest);
    }
  }

  private base(
    event: HermesBridgeEvent,
    classroomAgentId: string,
    bridgeEventId = event.bridgeEventId,
  ) {
    return {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      eventId: bridgeEventId.startsWith('hermes:')
        ? bridgeEventId
        : `hermes:${bridgeEventId}`,
      agentId: classroomAgentId,
      source: 'hermes' as const,
      observedAt: event.observedAt,
      sequence: this.clock.next(classroomAgentId),
      metadata: {
        adapter: 'hermes-general-hooks-v1',
        adapterVersion: event.adapterVersion,
        hook: event.hook,
        runtimeInstanceId: event.runtimeInstanceId,
        nativeAgentId: event.nativeAgentId,
        ...(event.data.toolName ? { toolName: event.data.toolName } : {}),
        ...(event.data.failureCode
          ? { failureCode: event.data.failureCode }
          : {}),
      },
    };
  }

  private stateEvent(
    event: HermesBridgeEvent,
    classroomAgentId: string,
    state: AgentTaskState,
    taskSummary: string,
  ): AgentStateEvent {
    return {
      ...this.base(event, classroomAgentId),
      type: 'agent.state',
      state,
      taskSummary,
    };
  }

  private presenceEvent(
    event: HermesBridgeEvent,
    classroomAgentId: string,
    bridgeEventId?: string,
  ): AgentPresenceEvent {
    return {
      ...this.base(event, classroomAgentId, bridgeEventId),
      type: 'agent.presence',
      action: 'enter',
      scenePointId: CLASSROOM_ENTRANCE_ID,
    };
  }

  private messageEvent(
    event: HermesBridgeEvent,
    classroomAgentId: string,
    content: string,
  ): AgentMessageEvent {
    const base = this.base(event, classroomAgentId);
    return {
      ...base,
      eventId: `${base.eventId}:message`,
      type: 'agent.message',
      direction: 'outgoing',
      content,
    };
  }

  private mapHook(
    event: HermesBridgeEvent,
    classroomAgentId: string,
  ): AgentRuntimeEvent[] {
    switch (event.hook) {
      case 'pre_llm_call':
        return [
          this.stateEvent(event, classroomAgentId, 'writing', '正在组织回复'),
        ];
      case 'pre_tool_call': {
        const toolName = event.data.toolName ?? 'unknown-tool';
        return [
          this.stateEvent(
            event,
            classroomAgentId,
            classifyHermesTool(toolName),
            `调用 ${toolName}`,
          ),
        ];
      }
      case 'post_tool_call': {
        if (event.data.interrupted) {
          return [
            this.stateEvent(
              event,
              classroomAgentId,
              'writing',
              '工具已中断，正在整理当前结果',
            ),
          ];
        }
        return [
          event.data.success
            ? this.stateEvent(
                event,
                classroomAgentId,
                'writing',
                '工具已完成，正在整理结果',
              )
            : this.stateEvent(
                event,
                classroomAgentId,
                'error',
                '工具执行失败',
              ),
        ];
      }
      case 'post_llm_call': {
        const message = event.data.messageContent
          ? sanitizeHermesDisplayText(event.data.messageContent)
          : '';
        return [
          this.stateEvent(event, classroomAgentId, 'syncing', '回复已生成'),
          ...(message
            ? [this.messageEvent(event, classroomAgentId, message)]
            : []),
        ];
      }
      case 'on_session_end': {
        if (event.data.completed || event.data.interrupted) {
          return [
            this.stateEvent(event, classroomAgentId, 'idle', '本轮任务已结束'),
          ];
        }
        return [
          this.stateEvent(event, classroomAgentId, 'error', '本轮任务异常结束'),
        ];
      }
      case 'on_session_start':
      case 'on_session_finalize':
      case 'on_session_reset':
        return [];
    }
  }
}
