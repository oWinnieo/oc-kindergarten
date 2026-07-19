import { NextResponse } from 'next/server';

import { authorizeAgentEventRequest } from '@/lib/agent-event-auth';
import { discoverProviderAgent } from '@/lib/provider-agent-bindings';
import {
  PROVIDER_BINDING_SCHEMA_VERSION,
  parseProviderAgentDiscovery,
} from '@/lib/provider-binding-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  const parsed = parseProviderAgentDiscovery(input);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const binding = await discoverProviderAgent(parsed.discovery);
  return NextResponse.json(
    {
      ok: true,
      schemaVersion: PROVIDER_BINDING_SCHEMA_VERSION,
      binding,
    },
    { status: binding.resolution === 'active' ? 200 : 202 },
  );
}
