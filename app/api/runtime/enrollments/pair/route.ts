import { NextResponse } from 'next/server';

import {
  AGENT_ENROLLMENT_SCHEMA_VERSION,
  parseRuntimeEnrollmentPairing,
} from '@/lib/agent-enrollment-contract';
import {
  AgentEnrollmentError,
  agentEnrollmentErrorStatus,
  pairRuntimeAgent,
} from '@/lib/agent-enrollments';
import {
  checkRuntimePairingRateLimit,
  runtimePairingClientKey,
} from '@/lib/runtime-pairing-rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rateLimit = checkRuntimePairingRateLimit(
    runtimePairingClientKey(request),
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: '配对尝试过于频繁，请稍后再试' },
      {
        status: 429,
        headers: { 'retry-after': String(rateLimit.retryAfterSeconds) },
      },
    );
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
    return NextResponse.json(
      {
        ok: true,
        schemaVersion: AGENT_ENROLLMENT_SCHEMA_VERSION,
        pairing,
      },
      {
        headers: {
          'cache-control': 'no-store',
          pragma: 'no-cache',
        },
      },
    );
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
