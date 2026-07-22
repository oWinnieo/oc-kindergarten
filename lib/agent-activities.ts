import { and, desc, eq, lt } from 'drizzle-orm';

import {
  mapAgentActivityRecord,
  type AgentActivityPage,
} from './agent-activity-contract';
import { getDatabaseClient } from './db/client';
import {
  agentEnrollments,
  agentEventLog,
  agentProfiles,
} from './db/schema';

export interface ListAgentActivitiesOptions {
  cursor?: number;
  limit: number;
}

export async function listAgentActivities(
  parentUserId: string,
  enrollmentId: string,
  options: ListAgentActivitiesOptions,
): Promise<AgentActivityPage | null> {
  const { database } = getDatabaseClient();
  const accessRows = await database
    .select({ agentId: agentProfiles.agentId })
    .from(agentEnrollments)
    .innerJoin(
      agentProfiles,
      eq(agentProfiles.enrollmentId, agentEnrollments.id),
    )
    .where(
      and(
        eq(agentEnrollments.id, enrollmentId),
        eq(agentEnrollments.parentUserId, parentUserId),
        eq(agentProfiles.ownerId, parentUserId),
      ),
    )
    .limit(1);
  const agentId = accessRows[0]?.agentId;
  if (!agentId) return null;

  const where =
    options.cursor === undefined
      ? eq(agentEventLog.agentId, agentId)
      : and(
          eq(agentEventLog.agentId, agentId),
          lt(agentEventLog.id, options.cursor),
        );
  const rows = await database
    .select({
      id: agentEventLog.id,
      eventType: agentEventLog.eventType,
      payload: agentEventLog.payload,
      observedAt: agentEventLog.observedAt,
    })
    .from(agentEventLog)
    .where(where)
    .orderBy(desc(agentEventLog.id))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const pageRows = rows.slice(0, options.limit);
  return {
    items: pageRows.map(mapAgentActivityRecord),
    nextCursor:
      hasMore && pageRows.length > 0
        ? String(pageRows[pageRows.length - 1]!.id)
        : null,
  };
}
