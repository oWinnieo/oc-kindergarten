import { NextResponse } from 'next/server';

import { authorizeAdminRequest } from '@/lib/admin-session';
import {
  cleanupStressRun,
  runStressOperation,
  seedStressRun,
  stressRunStatus,
} from '@/lib/agent-stress-runs';
import {
  parseStressRunId,
  parseStressTestCreate,
  parseStressTestOperation,
} from '@/lib/stress-test-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function stressEnabled(): boolean {
  return process.env.OC_KINDERGARTEN_ENABLE_STRESS_TEST === '1';
}

function guard(request: Request): NextResponse | null {
  if (!stressEnabled()) {
    return NextResponse.json(
      { ok: false, error: 'Stress test is disabled' },
      { status: 404 },
    );
  }
  if (!authorizeAdminRequest(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }
  return null;
}

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const parsed = parseStressRunId(
    new URL(request.url).searchParams.get('runId'),
  );
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, status: await stressRunStatus(parsed.value) });
}

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const parsed = parseStressTestCreate(await jsonBody(request));
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }
  try {
    const status = await seedStressRun(
      parsed.value.runId,
      parsed.value.agentCount,
    );
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    if (error instanceof Error && error.message === 'stress_run_exists') {
      return NextResponse.json(
        { ok: false, error: 'Stress run already exists' },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const parsed = parseStressTestOperation(await jsonBody(request));
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }
  try {
    const result = await runStressOperation(
      parsed.value.runId,
      parsed.value.operation,
      { state: parsed.value.state, count: parsed.value.count },
    );
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof Error && error.message === 'stress_run_not_found') {
      return NextResponse.json(
        { ok: false, error: 'Stress run not found' },
        { status: 404 },
      );
    }
    throw error;
  }
}

export async function DELETE(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const parsed = parseStressRunId(
    new URL(request.url).searchParams.get('runId'),
  );
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }
  return NextResponse.json({
    ok: true,
    removed: await cleanupStressRun(parsed.value),
    status: await stressRunStatus(parsed.value),
  });
}
