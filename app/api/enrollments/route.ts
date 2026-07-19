import { NextResponse } from 'next/server';

import {
  AgentEnrollmentError,
  agentEnrollmentErrorStatus,
  createAgentEnrollment,
  listAgentEnrollments,
} from '@/lib/agent-enrollments';
import { authenticatedParentUserId } from '@/lib/parent-session';

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

export async function POST() {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const enrollment = await createAgentEnrollment(parentUserId);
    return NextResponse.json({ ok: true, enrollment }, { status: 201 });
  } catch (error) {
    return enrollmentErrorResponse(error);
  }
}
