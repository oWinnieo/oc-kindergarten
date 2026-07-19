import { NextResponse } from 'next/server';

import type { AgentEnrollmentLifecycleAction } from './agent-enrollment-contract';
import {
  AgentEnrollmentError,
  agentEnrollmentErrorStatus,
  changeAgentEnrollmentLifecycle,
} from './agent-enrollments';
import { dispatchPendingOutbox } from './durable-agent-store';
import { authenticatedParentUserId } from './parent-session';

export async function handleAgentEnrollmentLifecycle(
  enrollmentId: string,
  action: AgentEnrollmentLifecycleAction,
) {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const enrollment = await changeAgentEnrollmentLifecycle(
      parentUserId,
      enrollmentId,
      action,
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
