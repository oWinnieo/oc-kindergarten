import { NextResponse } from 'next/server';

import { authorizeRuntimeCredentialRequest } from '@/lib/agent-event-auth';
import { discoverProviderAgent } from '@/lib/provider-agent-bindings';
import {
  PROVIDER_BINDING_SCHEMA_VERSION,
  parseProviderAgentDiscovery,
} from '@/lib/provider-binding-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
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
  if (
    !(await authorizeRuntimeCredentialRequest(request, {
      provider: parsed.discovery.provider,
      nativeAgentId: parsed.discovery.nativeAgentId,
      runtimeInstanceId: parsed.discovery.runtimeInstanceId,
    }))
  ) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
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
