import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';

import {
  AGENT_REGISTRY_SCHEMA_VERSION,
} from './agent-registry-contract';
import type {
  AgentProfile,
  AgentProfileInput,
} from './agent-registry-contract';
import { parseAgentRuntimeEvent } from './agent-event-contract';
import type { AgentRuntimeEvent } from './agent-event-contract';
import type { AgentRegistryChange } from './agent-registry';
import { getDatabaseClient } from './db/client';
import {
  agentEnrollments,
  agentEventCursors,
  agentEventLog,
  agentLatestStates,
  agentProfiles,
  eventOutbox,
  providerAgentBindings,
} from './db/schema';
import {
  DurableAgentEvent,
  DurableRegistryChange,
  durableLiveEvents,
} from './durable-live-events';

const OUTBOX_AGENT_EVENT = 'agent.event';
const OUTBOX_AGENT_REGISTRY = 'agent.registry';
export const DURABLE_REPLAY_BATCH_SIZE = 5000;

type AgentProfileRow = typeof agentProfiles.$inferSelect;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function rowToProfile(row: AgentProfileRow): AgentProfile {
  const ownerId = row.ownerId ?? row.legacyOwnerId ?? undefined;
  return {
    schemaVersion: AGENT_REGISTRY_SCHEMA_VERSION,
    agentId: row.agentId,
    displayName: row.displayName,
    characterVariant: row.characterVariant as AgentProfile['characterVariant'],
    registeredBy: row.registeredBy as AgentProfile['registeredBy'],
    ...(ownerId === undefined ? {} : { ownerId }),
    ...(row.role === null ? {} : { role: row.role }),
    ...(row.color === null ? {} : { color: row.color }),
    revision: row.revision,
    updatedAt: toIsoString(row.updatedAt),
  };
}

function parseStoredEvent(value: unknown): AgentRuntimeEvent | null {
  const parsed = parseAgentRuntimeEvent(value);
  return parsed.ok ? parsed.event : null;
}

function parseRegistryChange(value: unknown): AgentRegistryChange | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.type !== 'agent.profile.upserted' &&
    candidate.type !== 'agent.profile.removed'
  ) {
    return null;
  }
  if (
    typeof candidate.agentId !== 'string' ||
    !Number.isSafeInteger(candidate.revision) ||
    typeof candidate.observedAt !== 'string'
  ) {
    return null;
  }
  return value as AgentRegistryChange;
}

export async function snapshotAgentProfiles(): Promise<AgentProfile[]> {
  const { database } = getDatabaseClient();
  const rows = await database
    .select({ profile: agentProfiles })
    .from(agentProfiles)
    .leftJoin(
      agentEnrollments,
      eq(agentEnrollments.id, agentProfiles.enrollmentId),
    )
    .where(
      and(
        isNull(agentProfiles.archivedAt),
        or(
          isNull(agentProfiles.enrollmentId),
          eq(agentEnrollments.status, 'active'),
        ),
      ),
    )
    .orderBy(asc(agentProfiles.agentId));
  return rows.map((row) => rowToProfile(row.profile));
}

export async function hasActiveAgentProfile(agentId: string): Promise<boolean> {
  const { database } = getDatabaseClient();
  const rows = await database
    .select({ agentId: agentProfiles.agentId })
    .from(agentProfiles)
    .leftJoin(
      agentEnrollments,
      eq(agentEnrollments.id, agentProfiles.enrollmentId),
    )
    .where(
      and(
        eq(agentProfiles.agentId, agentId),
        isNull(agentProfiles.archivedAt),
        or(
          isNull(agentProfiles.enrollmentId),
          eq(agentEnrollments.status, 'active'),
        ),
      ),
    )
    .limit(1);
  return rows.length === 1;
}

export async function upsertAgentProfile(
  input: AgentProfileInput,
  now = new Date(),
  source: 'runtime' | 'test' = 'runtime',
): Promise<AgentProfile> {
  const { database } = getDatabaseClient();
  return database.transaction(async (transaction) => {
    const rows = await transaction
      .insert(agentProfiles)
      .values({
        agentId: input.agentId,
        schemaVersion: input.schemaVersion,
        legacyOwnerId: input.ownerId,
        source,
        displayName: input.displayName,
        characterVariant: input.characterVariant,
        registeredBy: input.registeredBy,
        role: input.role,
        color: input.color,
        updatedAt: now,
        archivedAt: null,
      })
      .onConflictDoUpdate({
        target: agentProfiles.agentId,
        set: {
          schemaVersion: input.schemaVersion,
          legacyOwnerId: input.ownerId ?? null,
          source,
          displayName: input.displayName,
          characterVariant: input.characterVariant,
          registeredBy: input.registeredBy,
          role: input.role ?? null,
          color: input.color ?? null,
          revision: sql`nextval('agent_profile_revision_seq')`,
          updatedAt: now,
          archivedAt: null,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Agent profile 写入后未返回记录');
    const profile = rowToProfile(row);
    const change: AgentRegistryChange = {
      type: 'agent.profile.upserted',
      agentId: profile.agentId,
      profile,
      revision: profile.revision,
      observedAt: profile.updatedAt,
    };
    await transaction.insert(eventOutbox).values({
      topic: OUTBOX_AGENT_REGISTRY,
      aggregateId: profile.agentId,
      payload: change,
    });
    return profile;
  });
}

export async function archiveAgentProfile(
  agentId: string,
  now = new Date(),
): Promise<boolean> {
  const { database } = getDatabaseClient();
  return database.transaction(async (transaction) => {
    const rows = await transaction
      .update(agentProfiles)
      .set({
        archivedAt: now,
        updatedAt: now,
        revision: sql`nextval('agent_profile_revision_seq')`,
      })
      .where(
        and(
          eq(agentProfiles.agentId, agentId),
          isNull(agentProfiles.archivedAt),
        ),
      )
      .returning({
        revision: agentProfiles.revision,
        enrollmentId: agentProfiles.enrollmentId,
      });
    const row = rows[0];
    if (!row) return false;
    await transaction
      .delete(agentLatestStates)
      .where(eq(agentLatestStates.agentId, agentId));
    if (row.enrollmentId) {
      await transaction
        .update(agentEnrollments)
        .set({
          status: 'archived',
          pairingCodeHash: null,
          pairingExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(agentEnrollments.id, row.enrollmentId));
      await transaction
        .update(providerAgentBindings)
        .set({ status: 'revoked', updatedAt: now })
        .where(eq(providerAgentBindings.agentId, agentId));
    }
    const change: AgentRegistryChange = {
      type: 'agent.profile.removed',
      agentId,
      revision: row.revision,
      observedAt: now.toISOString(),
    };
    await transaction.insert(eventOutbox).values({
      topic: OUTBOX_AGENT_REGISTRY,
      aggregateId: agentId,
      payload: change,
    });
    return true;
  });
}

class RejectedStoredEventError extends Error {
  constructor(
    readonly reason: 'duplicate_event' | 'stale_sequence' | 'inactive_agent',
  ) {
    super(reason);
  }
}

export interface StoreAgentEventResult {
  accepted: boolean;
  reason?: 'duplicate_event' | 'stale_sequence' | 'inactive_agent';
  stored?: DurableAgentEvent;
}

export async function storeAgentEvent(
  event: AgentRuntimeEvent,
): Promise<StoreAgentEventResult> {
  const { database } = getDatabaseClient();
  try {
    const stored = await database.transaction(async (transaction) => {
      const profileRows = await transaction
        .select({ enrollmentId: agentProfiles.enrollmentId })
        .from(agentProfiles)
        .where(
          and(
            eq(agentProfiles.agentId, event.agentId),
            isNull(agentProfiles.archivedAt),
          ),
        )
        .limit(1)
        .for('key share');
      const profile = profileRows[0];
      if (!profile) throw new RejectedStoredEventError('inactive_agent');
      if (profile.enrollmentId) {
        const enrollmentRows = await transaction
          .select({ status: agentEnrollments.status })
          .from(agentEnrollments)
          .where(eq(agentEnrollments.id, profile.enrollmentId))
          .limit(1)
          .for('key share');
        if (enrollmentRows[0]?.status !== 'active') {
          throw new RejectedStoredEventError('inactive_agent');
        }
      }

      const duplicateRows = await transaction
        .select({ id: agentEventLog.id })
        .from(agentEventLog)
        .where(eq(agentEventLog.eventId, event.eventId))
        .limit(1);
      if (duplicateRows.length > 0) {
        throw new RejectedStoredEventError('duplicate_event');
      }

      const cursorResult = await transaction.execute<{ last_sequence: string }>(
        sql`
          insert into agent_event_cursors (source, agent_id, last_sequence, updated_at)
          values (${event.source}, ${event.agentId}, ${event.sequence}, now())
          on conflict (source, agent_id) do update
          set last_sequence = excluded.last_sequence, updated_at = now()
          where agent_event_cursors.last_sequence < excluded.last_sequence
          returning last_sequence
        `,
      );
      if (cursorResult.length === 0) {
        throw new RejectedStoredEventError('stale_sequence');
      }

      const eventRows = await transaction
        .insert(agentEventLog)
        .values({
          eventId: event.eventId,
          agentId: event.agentId,
          source: event.source,
          sourceSequence: event.sequence,
          eventType: event.type,
          payload: event,
          observedAt: new Date(event.observedAt),
        })
        .onConflictDoNothing()
        .returning({ id: agentEventLog.id });
      const eventRow = eventRows[0];
      if (!eventRow) {
        throw new RejectedStoredEventError('duplicate_event');
      }

      if (event.type === 'agent.presence') {
        await transaction
          .insert(agentLatestStates)
          .values({
            agentId: event.agentId,
            presenceSource: event.source,
            presenceLogId: eventRow.id,
            presenceSequence: event.sequence,
            presenceEventId: event.eventId,
            presenceAction: event.action,
            scenePointId: event.scenePointId,
            presenceObservedAt: new Date(event.observedAt),
            presencePayload: event,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: agentLatestStates.agentId,
            set: {
              presenceSource: event.source,
              presenceLogId: eventRow.id,
              presenceSequence: event.sequence,
              presenceEventId: event.eventId,
              presenceAction: event.action,
              scenePointId: event.scenePointId,
              presenceObservedAt: new Date(event.observedAt),
              presencePayload: event,
              stateSource: null,
              stateLogId: null,
              stateSequence: null,
              stateEventId: null,
              state: null,
              taskSummary: null,
              stateObservedAt: null,
              statePayload: null,
              updatedAt: new Date(),
            },
          });
      } else {
        await transaction
          .insert(agentLatestStates)
          .values({
            agentId: event.agentId,
            stateSource: event.source,
            stateLogId: eventRow.id,
            stateSequence: event.sequence,
            stateEventId: event.eventId,
            state: event.state,
            taskSummary: event.taskSummary,
            stateObservedAt: new Date(event.observedAt),
            statePayload: event,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: agentLatestStates.agentId,
            set: {
              stateSource: event.source,
              stateLogId: eventRow.id,
              stateSequence: event.sequence,
              stateEventId: event.eventId,
              state: event.state,
              taskSummary: event.taskSummary ?? null,
              stateObservedAt: new Date(event.observedAt),
              statePayload: event,
              updatedAt: new Date(),
            },
          });
      }

      const durableEvent: DurableAgentEvent = {
        cursor: eventRow.id,
        event,
      };
      await transaction.insert(eventOutbox).values({
        topic: OUTBOX_AGENT_EVENT,
        aggregateId: event.agentId,
        payload: durableEvent,
      });
      return durableEvent;
    });
    return { accepted: true, stored };
  } catch (error) {
    if (error instanceof RejectedStoredEventError) {
      return { accepted: false, reason: error.reason };
    }
    throw error;
  }
}

export async function storeAgentEvents(
  events: readonly AgentRuntimeEvent[],
): Promise<StoreAgentEventResult[]> {
  const results: StoreAgentEventResult[] = [];
  for (const event of events) results.push(await storeAgentEvent(event));
  return results;
}

export async function snapshotAgentEvents(): Promise<DurableAgentEvent[]> {
  const { database } = getDatabaseClient();
  const rows = await database.select().from(agentLatestStates);
  const snapshot: DurableAgentEvent[] = [];
  for (const row of rows) {
    const presence = parseStoredEvent(row.presencePayload);
    if (presence && row.presenceLogId !== null) {
      snapshot.push({ cursor: row.presenceLogId, event: presence });
    }
    const state = parseStoredEvent(row.statePayload);
    if (
      state &&
      row.stateLogId !== null &&
      (!presence ||
        presence.type !== 'agent.presence' ||
        presence.action === 'enter')
    ) {
      snapshot.push({ cursor: row.stateLogId, event: state });
    }
  }
  return snapshot.sort((first, second) => first.cursor - second.cursor);
}

export async function agentEventsAfter(
  cursor: number,
): Promise<DurableAgentEvent[]> {
  const { database } = getDatabaseClient();
  const rows = await database
    .select({ id: agentEventLog.id, payload: agentEventLog.payload })
    .from(agentEventLog)
    .where(gt(agentEventLog.id, cursor))
    .orderBy(asc(agentEventLog.id))
    .limit(DURABLE_REPLAY_BATCH_SIZE);
  const events: DurableAgentEvent[] = [];
  for (const row of rows) {
    const event = parseStoredEvent(row.payload);
    if (event) events.push({ cursor: row.id, event });
  }
  return events;
}

export async function registryChangesAfter(
  cursor: number,
): Promise<DurableRegistryChange[]> {
  const { database } = getDatabaseClient();
  const rows = await database
    .select({ id: eventOutbox.id, payload: eventOutbox.payload })
    .from(eventOutbox)
    .where(
      and(
        eq(eventOutbox.topic, OUTBOX_AGENT_REGISTRY),
        gt(eventOutbox.id, cursor),
      ),
    )
    .orderBy(asc(eventOutbox.id))
    .limit(DURABLE_REPLAY_BATCH_SIZE);
  const changes: DurableRegistryChange[] = [];
  for (const row of rows) {
    const change = parseRegistryChange(row.payload);
    if (change) changes.push({ cursor: row.id, change });
  }
  return changes;
}

let dispatchPromise: Promise<void> | null = null;

export function dispatchPendingOutbox(): Promise<void> {
  if (dispatchPromise) return dispatchPromise;
  dispatchPromise = dispatchPendingOutboxInternal().finally(() => {
    dispatchPromise = null;
  });
  return dispatchPromise;
}

async function dispatchPendingOutboxInternal(): Promise<void> {
  const { database } = getDatabaseClient();
  const rows = await database
    .select()
    .from(eventOutbox)
    .where(isNull(eventOutbox.publishedAt))
    .orderBy(asc(eventOutbox.id))
    .limit(250);
  for (const row of rows) {
    try {
      if (row.topic === OUTBOX_AGENT_EVENT) {
        const payload = row.payload as Partial<DurableAgentEvent>;
        const event = parseStoredEvent(payload.event);
        if (event && Number.isSafeInteger(payload.cursor)) {
          durableLiveEvents.publishAgentEvent({
            cursor: Number(payload.cursor),
            event,
          });
        }
      } else if (row.topic === OUTBOX_AGENT_REGISTRY) {
        const change = parseRegistryChange(row.payload);
        if (change) {
          durableLiveEvents.publishRegistryChange({
            cursor: row.id,
            change,
          });
        }
      }
      await database
        .update(eventOutbox)
        .set({
          publishedAt: new Date(),
          attemptCount: sql`${eventOutbox.attemptCount} + 1`,
          lastErrorCode: null,
        })
        .where(eq(eventOutbox.id, row.id));
    } catch {
      await database
        .update(eventOutbox)
        .set({
          attemptCount: sql`${eventOutbox.attemptCount} + 1`,
          lastErrorCode: 'live_publish_failed',
        })
        .where(eq(eventOutbox.id, row.id));
      break;
    }
  }
}
