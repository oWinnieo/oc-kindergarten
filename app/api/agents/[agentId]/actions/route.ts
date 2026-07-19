import { NextResponse } from 'next/server';

import { parseAgentAction } from '@/lib/agent-action-contract';
import {
  AgentActionCommandError,
  agentActionCommandErrorStatus,
  issueAgentActionCommand,
} from '@/lib/agent-action-commands';
import { ADMIN_SESSION_COOKIE, isAdminSession } from '@/lib/admin-session';
import { dispatchPendingOutbox } from '@/lib/durable-agent-store';
import { authenticatedParentUserId } from '@/lib/parent-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function cookieValue(request: Request, name: string): string | undefined {
  return (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([candidate]) => candidate === name)?.[1];
}

export async function POST(
  request: Request,
  context: { params: { agentId: string } },
) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: '请求体必须是 JSON' },
      { status: 400 },
    );
  }
  const parsed = parseAgentAction(input);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  const adminSession = isAdminSession(
    cookieValue(request, ADMIN_SESSION_COOKIE),
  );
  const explicitAdmin = request.headers.get('x-oc-kindergarten-actor') === 'admin';
  const parentUserId = explicitAdmin ? null : await authenticatedParentUserId();
  const actor = explicitAdmin && adminSession
    ? ({ type: 'admin' } as const)
    : parentUserId
      ? ({ type: 'parent', parentUserId } as const)
      : adminSession
        ? ({ type: 'admin' } as const)
        : null;
  if (!actor) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await issueAgentActionCommand(
      actor,
      context.params.agentId,
      parsed.command,
    );
    if (result.accepted) await dispatchPendingOutbox();
    return NextResponse.json({
      ok: true,
      accepted: result.accepted ? 1 : 0,
      commandId: result.commandId,
      cursor: result.stored.cursor,
      event: result.stored.event,
    });
  } catch (error) {
    if (error instanceof AgentActionCommandError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: agentActionCommandErrorStatus(error) },
      );
    }
    throw error;
  }
}
