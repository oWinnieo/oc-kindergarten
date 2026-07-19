import { NextResponse } from 'next/server';

import { parseAgentActivation } from '@/lib/agent-enrollment-contract';
import {
  activateAgentEnrollment,
  AgentEnrollmentError,
  agentEnrollmentErrorStatus,
} from '@/lib/agent-enrollments';
import { dispatchPendingOutbox } from '@/lib/durable-agent-store';
import { authenticatedParentUserId } from '@/lib/parent-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: { enrollmentId: string } },
) {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) {
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
  const parsed = parseAgentActivation(input);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  try {
    const enrollment = await activateAgentEnrollment(
      parentUserId,
      context.params.enrollmentId,
      parsed.activation,
    );
    await dispatchPendingOutbox();
    return NextResponse.json({ ok: true, enrollment });
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
