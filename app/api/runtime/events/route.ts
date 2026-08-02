import { NextResponse } from 'next/server';

import { authorizeRuntimeCredentialRequest } from '@/lib/agent-event-auth';
import type { AgentRuntimeEvent } from '@/lib/agent-event-contract';
import {
  dispatchPendingOutbox,
  hasActiveAgentProfile,
  storeAgentEvents,
} from '@/lib/durable-agent-store';
import {
  discoverProviderAgent,
  isAgentPresent,
} from '@/lib/provider-agent-bindings';
import { PROVIDER_BINDING_SCHEMA_VERSION } from '@/lib/provider-binding-contract';
import { runtimeAdapterRuntime } from '@/lib/runtime-adapter-runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: '请求体必须是 JSON' },
      { status: 400 },
    );
  }

  const parsed = runtimeAdapterRuntime.providers.parse(input);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }
  if (
    !(await authorizeRuntimeCredentialRequest(request, parsed.parsed.identity))
  ) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const binding = await discoverProviderAgent({
    schemaVersion: PROVIDER_BINDING_SCHEMA_VERSION,
    ...parsed.parsed.identity,
  });
  if (binding.resolution !== 'active' || !binding.agentId) {
    return NextResponse.json(
      {
        ok: true,
        accepted: 0,
        ignored: binding.resolution,
        binding,
        events: [],
      },
      { status: 202 },
    );
  }

  const events: AgentRuntimeEvent[] = [];
  if (!(await isAgentPresent(binding.agentId))) {
    const presence = parsed.parsed.createBindingPresence(binding.agentId);
    if (!presence.ok) {
      return NextResponse.json(
        { ok: false, error: presence.error },
        { status: 400 },
      );
    }
    events.push(...presence.events);
  }
  const adapted = parsed.parsed.adapt(binding.agentId);
  if (!adapted.ok) {
    return NextResponse.json(
      { ok: false, error: adapted.error },
      { status: 400 },
    );
  }
  events.push(...adapted.events);

  if (!(await hasActiveAgentProfile(binding.agentId))) {
    return NextResponse.json(
      { ok: false, error: 'Agent 尚未注册' },
      { status: 409 },
    );
  }
  const storedResults = await storeAgentEvents(events);
  const accepted = storedResults.filter((stored) => stored.accepted).length;
  if (accepted > 0) await dispatchPendingOutbox();
  if (storedResults.some((stored) => stored.reason === 'inactive_agent')) {
    return NextResponse.json(
      { ok: false, accepted, error: 'Agent 当前未处于 active 状态' },
      { status: 409 },
    );
  }
  const databaseIgnored = storedResults.find(
    (stored) => !stored.accepted,
  )?.reason;
  return NextResponse.json({
    ok: true,
    accepted,
    ignored: adapted.ignored ?? databaseIgnored,
    binding,
    cursors: storedResults.flatMap((stored) =>
      stored.stored === undefined ? [] : [stored.stored.cursor],
    ),
    events,
  });
}
