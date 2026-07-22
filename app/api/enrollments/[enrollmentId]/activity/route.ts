import { NextResponse } from 'next/server';

import {
  AGENT_ACTIVITY_SCHEMA_VERSION,
  parseAgentActivityPageQuery,
} from '@/lib/agent-activity-contract';
import { listAgentActivities } from '@/lib/agent-activities';
import { authenticatedParentUserId } from '@/lib/parent-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: { enrollmentId: string } },
) {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const query = parseAgentActivityPageQuery(new URL(request.url).searchParams);
  if (!query.ok) {
    return NextResponse.json(
      { ok: false, error: query.error },
      { status: 400 },
    );
  }

  const page = await listAgentActivities(
    parentUserId,
    context.params.enrollmentId,
    query,
  );
  if (!page) {
    return NextResponse.json(
      { ok: false, error: 'Agent 入园记录不存在' },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      schemaVersion: AGENT_ACTIVITY_SCHEMA_VERSION,
      items: page.items,
      nextCursor: page.nextCursor,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
