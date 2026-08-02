import { NextResponse } from 'next/server';

import {
  AgentEnrollmentError,
  agentEnrollmentErrorStatus,
  createAgentEnrollment,
  listAgentEnrollments,
} from '@/lib/agent-enrollments';
import { authenticatedParentUserId } from '@/lib/parent-session';
import {
  AGENT_PROVIDERS,
  type AgentProvider,
} from '@/lib/provider-binding-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function enrollmentErrorResponse(error: unknown) {
  if (error instanceof AgentEnrollmentError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: agentEnrollmentErrorStatus(error) },
    );
  }
  throw error;
}

export async function GET() {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    enrollments: await listAgentEnrollments(parentUserId),
  });
}

export async function POST(request: Request) {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  let provider: AgentProvider = 'openclaw';
  const rawBody = await request.text();
  if (rawBody.trim()) {
    let input: unknown;
    try {
      input = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { ok: false, error: '请求体必须是 JSON' },
        { status: 400 },
      );
    }
    if (
      typeof input !== 'object' ||
      input === null ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => key !== 'provider') ||
      !AGENT_PROVIDERS.includes(
        (input as { provider?: unknown }).provider as AgentProvider,
      )
    ) {
      return NextResponse.json(
        { ok: false, error: 'provider 不受支持' },
        { status: 400 },
      );
    }
    provider = (input as { provider: AgentProvider }).provider;
  }
  try {
    const enrollment = await createAgentEnrollment(parentUserId, provider);
    return NextResponse.json({ ok: true, enrollment }, { status: 201 });
  } catch (error) {
    return enrollmentErrorResponse(error);
  }
}
