import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { AgentActionInput } from './agent-action-contract';
import type { AgentRuntimeEvent } from './agent-event-contract';
import { getDatabaseClient } from './db/client';
import {
  agentActionCommands,
  agentEnrollments,
  agentEventCursors,
  agentEventLog,
  agentLatestStates,
  agentProfiles,
  eventOutbox,
  providerAgentBindings,
} from './db/schema';
import type { DurableAgentEvent } from './durable-live-events';

const OUTBOX_AGENT_EVENT = 'agent.event';

const ACTION_SUMMARIES: Record<AgentActionInput['action'], string> = {
  idle: '休息',
  writing: '写画',
  researching: '阅读',
  executing: '搭积木或做手工',
  syncing: '收发与交流',
  error: '修理与检查',
};

export type AgentActionActor =
  | { type: 'parent'; parentUserId: string }
  | { type: 'admin' };

export type AgentActionCommandErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'inactive_agent'
  | 'invalid_binding'
  | 'idempotency_conflict';

export class AgentActionCommandError extends Error {
  constructor(
    readonly code: AgentActionCommandErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function agentActionCommandErrorStatus(
  error: AgentActionCommandError,
): number {
  if (error.code === 'not_found') return 404;
  if (error.code === 'forbidden') return 403;
  return 409;
}

export interface AgentActionCommandResult {
  accepted: boolean;
  commandId: string;
  stored: DurableAgentEvent;
}

function actorMatches(
  actor: AgentActionActor,
  row: typeof agentActionCommands.$inferSelect,
): boolean {
  return (
    row.actorType === actor.type &&
    (actor.type === 'admin'
      ? row.actorParentUserId === null
      : row.actorParentUserId === actor.parentUserId)
  );
}

export async function issueAgentActionCommand(
  actor: AgentActionActor,
  agentId: string,
  input: AgentActionInput,
): Promise<AgentActionCommandResult> {
  const { database } = getDatabaseClient();
  const proposedCommandId = randomUUID();
  const proposedEventId = `command:${proposedCommandId}`;

  return database.transaction(async (transaction) => {
    const existingRows = await transaction
      .select()
      .from(agentActionCommands)
      .where(eq(agentActionCommands.requestId, input.requestId))
      .limit(1);
    const returnExisting = async (
      existing: typeof agentActionCommands.$inferSelect,
    ): Promise<AgentActionCommandResult> => {
      if (
        !actorMatches(actor, existing) ||
        existing.agentId !== agentId ||
        existing.action !== input.action
      ) {
        throw new AgentActionCommandError(
          'idempotency_conflict',
          'requestId 已用于另一条行为指令',
        );
      }
      const eventRows = await transaction
        .select({ id: agentEventLog.id, payload: agentEventLog.payload })
        .from(agentEventLog)
        .where(eq(agentEventLog.eventId, existing.eventId))
        .limit(1);
      const eventRow = eventRows[0];
      if (!eventRow) throw new Error('行为指令存在但对应事件缺失');
      return {
        accepted: false,
        commandId: existing.id,
        stored: {
          cursor: eventRow.id,
          event: eventRow.payload as AgentRuntimeEvent,
        },
      };
    };
    if (existingRows[0]) return returnExisting(existingRows[0]);

    const profileRows = await transaction
      .select({
        agentId: agentProfiles.agentId,
        ownerId: agentProfiles.ownerId,
        enrollmentId: agentProfiles.enrollmentId,
      })
      .from(agentProfiles)
      .where(
        and(
          eq(agentProfiles.agentId, agentId),
          isNull(agentProfiles.archivedAt),
        ),
      )
      .limit(1)
      .for('key share');
    const profile = profileRows[0];
    if (!profile) {
      throw new AgentActionCommandError('not_found', 'Agent 不存在');
    }
    if (actor.type === 'parent' && profile.ownerId !== actor.parentUserId) {
      throw new AgentActionCommandError(
        'forbidden',
        '你不能控制其他家庭的 Agent',
      );
    }

    if (profile.enrollmentId) {
      const enrollmentRows = await transaction
        .select({ status: agentEnrollments.status })
        .from(agentEnrollments)
        .where(eq(agentEnrollments.id, profile.enrollmentId))
        .limit(1)
        .for('key share');
      if (enrollmentRows[0]?.status !== 'active') {
        throw new AgentActionCommandError(
          'inactive_agent',
          'Agent 当前未处于 active 状态',
        );
      }
      const bindingRows = await transaction
        .select({ id: providerAgentBindings.id })
        .from(providerAgentBindings)
        .where(
          and(
            eq(providerAgentBindings.agentId, agentId),
            eq(providerAgentBindings.status, 'active'),
          ),
        )
        .limit(1);
      if (!bindingRows[0]) {
        throw new AgentActionCommandError(
          'invalid_binding',
          'Agent runtime binding 当前不可用',
        );
      }
    } else if (actor.type === 'parent') {
      throw new AgentActionCommandError(
        'forbidden',
        '这个 Agent 不属于任何家庭',
      );
    }

    const commandRows = await transaction
      .insert(agentActionCommands)
      .values({
        id: proposedCommandId,
        requestId: input.requestId,
        agentId,
        actorType: actor.type,
        actorParentUserId:
          actor.type === 'parent' ? actor.parentUserId : null,
        action: input.action,
        eventId: proposedEventId,
      })
      .onConflictDoNothing()
      .returning();
    const command = commandRows[0];
    if (!command) {
      const racedRows = await transaction
        .select()
        .from(agentActionCommands)
        .where(eq(agentActionCommands.requestId, input.requestId))
        .limit(1);
      if (!racedRows[0]) throw new Error('行为指令幂等冲突后无法读取记录');
      return returnExisting(racedRows[0]);
    }

    const sequenceRows = await transaction.execute<{ last_sequence: string }>(
      sql`
        insert into agent_event_cursors (source, agent_id, last_sequence, updated_at)
        values ('command', ${agentId}, 1, now())
        on conflict (source, agent_id) do update
        set last_sequence = agent_event_cursors.last_sequence + 1,
            updated_at = now()
        returning last_sequence
      `,
    );
    const sequence = Number(sequenceRows[0]?.last_sequence);
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      throw new Error('行为指令无法取得有效事件序号');
    }

    const now = new Date();
    const event: AgentRuntimeEvent = {
      schemaVersion: 1,
      eventId: command.eventId,
      type: 'agent.state',
      agentId,
      source: 'command',
      observedAt: now.toISOString(),
      sequence,
      state: input.action,
      taskSummary: `${actor.type === 'parent' ? '主人' : '管理员'}指令：${ACTION_SUMMARIES[input.action]}`,
      metadata: {
        actorType: actor.type,
        requestId: input.requestId,
      },
    };
    const eventRows = await transaction
      .insert(agentEventLog)
      .values({
        eventId: event.eventId,
        agentId,
        source: event.source,
        sourceSequence: sequence,
        eventType: event.type,
        payload: event,
        observedAt: now,
      })
      .returning({ id: agentEventLog.id });
    const eventRow = eventRows[0];
    if (!eventRow) throw new Error('行为指令事件写入后未返回记录');

    await transaction
      .insert(agentLatestStates)
      .values({
        agentId,
        stateSource: event.source,
        stateLogId: eventRow.id,
        stateSequence: sequence,
        stateEventId: event.eventId,
        state: event.state,
        taskSummary: event.taskSummary,
        stateObservedAt: now,
        statePayload: event,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: agentLatestStates.agentId,
        set: {
          stateSource: event.source,
          stateLogId: eventRow.id,
          stateSequence: sequence,
          stateEventId: event.eventId,
          state: event.state,
          taskSummary: event.taskSummary ?? null,
          stateObservedAt: now,
          statePayload: event,
          updatedAt: now,
        },
      });

    const stored: DurableAgentEvent = { cursor: eventRow.id, event };
    await transaction.insert(eventOutbox).values({
      topic: OUTBOX_AGENT_EVENT,
      aggregateId: agentId,
      payload: stored,
    });
    return {
      accepted: true,
      commandId: command.id,
      stored,
    };
  });
}
