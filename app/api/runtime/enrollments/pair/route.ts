import { NextResponse } from 'next/server';

import { authorizeAgentEventRequest } from '@/lib/agent-event-auth';
import {
  AGENT_ENROLLMENT_SCHEMA_VERSION,
  parseRuntimeEnrollmentPairing,
} from '@/lib/agent-enrollment-contract';
import {
  AgentEnrollmentError,
  agentEnrollmentErrorStatus,
  pairRuntimeAgent,
} from '@/lib/agent-enrollments';

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
    return NextResponse.json(
      { ok: false, error: '请求体必须是 JSON' },
      { status: 400 },
    );
  }
  const parsed = parseRuntimeEnrollmentPairing(input);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  try {
    const pairing = await pairRuntimeAgent(parsed.pairing);
    return NextResponse.json({
      ok: true,
      schemaVersion: AGENT_ENROLLMENT_SCHEMA_VERSION,
      pairing,
    });
  } catch (error) {
    if (error instanceof AgentEnrollmentError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: agentEnrollmentErrorStatus(error) },
      );
    }
    throw error;
  }
}
