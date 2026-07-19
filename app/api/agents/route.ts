import { NextResponse } from 'next/server';

import { authorizeAgentEventRequest } from '@/lib/agent-event-auth';
import { AGENT_REGISTRY_SCHEMA_VERSION, parseAgentProfileInput } from '@/lib/agent-registry-contract';
import {
  archiveAgentProfile,
  dispatchPendingOutbox,
  snapshotAgentProfiles,
  upsertAgentProfile,
} from '@/lib/durable-agent-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    ok: true,
    schemaVersion: AGENT_REGISTRY_SCHEMA_VERSION,
    profiles: await snapshotAgentProfiles(),
  });
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

  const candidate =
    typeof input === 'object' && input !== null && 'profile' in input
      ? (input as { profile: unknown }).profile
      : input;
  const parsed = parseAgentProfileInput(candidate);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const profile = await upsertAgentProfile(parsed.profile);
  await dispatchPendingOutbox();
  return NextResponse.json({ ok: true, profile });
}

export async function DELETE(request: Request) {
  if (!authorizeAgentEventRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const agentId = new URL(request.url).searchParams.get('agentId')?.trim();
  if (!agentId) {
    return NextResponse.json({ ok: false, error: 'agentId 不能为空' }, { status: 400 });
  }
  if (!(await archiveAgentProfile(agentId))) {
    return NextResponse.json({ ok: false, error: 'Agent 不存在' }, { status: 404 });
  }
  await dispatchPendingOutbox();
  return NextResponse.json({ ok: true, agentId });
}
