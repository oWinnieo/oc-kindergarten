import { NextResponse } from 'next/server';

import { authorizeAgentEventRequest } from '@/lib/agent-event-auth';
import type { AgentRuntimeEvent } from '@/lib/agent-event-contract';
import {
  dispatchPendingOutbox,
  hasActiveAgentProfile,
  storeAgentEvents,
} from '@/lib/durable-agent-store';
import {
  isOpenClawBridgeV2,
  parseOpenClawBridgeV2,
} from '@/lib/openclaw-bridge-v2';
import { openClawAdapterRuntime } from '@/lib/openclaw-adapter-runtime';
import {
  discoverProviderAgent,
  isAgentPresent,
} from '@/lib/provider-agent-bindings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function adaptBridgeV2(input: unknown): Promise<
  | {
      ok: true;
      events: AgentRuntimeEvent[];
      ignored?: string;
      binding: Awaited<ReturnType<typeof discoverProviderAgent>>;
    }
  | { ok: false; error: string }
> {
  const parsed = parseOpenClawBridgeV2(input);
  if (!parsed.ok) return parsed;
  const binding = await discoverProviderAgent(parsed.bridge.discovery);
  if (binding.resolution !== 'active' || !binding.agentId) {
    return {
      ok: true,
      events: [],
      ignored: binding.resolution,
      binding,
    };
  }

  const boundEvent = parsed.bridge.bind(binding.agentId);
  const events: AgentRuntimeEvent[] = [];
  if (
    boundEvent.hook !== 'gateway_start' &&
    boundEvent.hook !== 'gateway_stop' &&
    !(await isAgentPresent(binding.agentId))
  ) {
    const presence = openClawAdapterRuntime.native.adapt({
      ...boundEvent,
      bridgeEventId: `${boundEvent.bridgeEventId}:binding-enter`,
      hook: 'gateway_start',
      data: { reason: 'active_binding' },
    });
    if (!presence.ok) return presence;
    events.push(...presence.events);
  }

  const adapted = openClawAdapterRuntime.native.adapt(boundEvent);
  if (!adapted.ok) return adapted;
  events.push(...adapted.events);
  return {
    ok: true,
    events,
    ignored: adapted.ignored,
    binding,
  };
}

export async function POST(request: Request) {
  if (!authorizeAgentEventRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const result = isOpenClawBridgeV2(input)
    ? await adaptBridgeV2(input)
    : isRecord(input) && input.kind === 'star.snapshot'
      ? openClawAdapterRuntime.starFallback.adapt(input.snapshot, {
          classroomAgentId:
            typeof input.classroomAgentId === 'string'
              ? input.classroomAgentId
              : '',
          snapshotId:
            typeof input.snapshotId === 'string' ? input.snapshotId : undefined,
        })
      : openClawAdapterRuntime.native.adapt(input);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  if (result.events.length === 0 && result.ignored?.endsWith('_binding')) {
    return NextResponse.json(
      {
        ok: true,
        accepted: 0,
        ignored: result.ignored,
        ...('binding' in result ? { binding: result.binding } : {}),
        events: [],
      },
      { status: 202 },
    );
  }

  let unregisteredAgentId: string | undefined;
  for (const event of result.events) {
    if (!(await hasActiveAgentProfile(event.agentId))) {
      unregisteredAgentId = event.agentId;
      break;
    }
  }
  if (unregisteredAgentId) {
    return NextResponse.json(
      { ok: false, error: `Agent 尚未注册：${unregisteredAgentId}` },
      { status: 409 },
    );
  }
  const storedResults = await storeAgentEvents(result.events);
  const accepted = storedResults.filter((stored) => stored.accepted).length;
  if (accepted > 0) await dispatchPendingOutbox();
  if (storedResults.some((stored) => stored.reason === 'inactive_agent')) {
    return NextResponse.json(
      {
        ok: false,
        accepted,
        error: 'Agent 当前未处于 active 状态',
      },
      { status: 409 },
    );
  }
  const databaseIgnored = storedResults.find((stored) => !stored.accepted)?.reason;
  return NextResponse.json({
    ok: true,
    accepted,
    ignored: result.ignored ?? databaseIgnored,
    ...('binding' in result ? { binding: result.binding } : {}),
    cursors: storedResults.flatMap((stored) =>
      stored.stored === undefined ? [] : [stored.stored.cursor],
    ),
    events: result.events,
  });
}
