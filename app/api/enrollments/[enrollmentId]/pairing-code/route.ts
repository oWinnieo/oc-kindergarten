import { NextResponse } from 'next/server';

import {
  AgentEnrollmentError,
  agentEnrollmentErrorStatus,
  issueAgentPairingCode,
} from '@/lib/agent-enrollments';
import { authenticatedParentUserId } from '@/lib/parent-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: { enrollmentId: string } },
) {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await issueAgentPairingCode(
      parentUserId,
      context.params.enrollmentId,
    );
    return NextResponse.json({ ok: true, ...result });
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
