import { and, count, eq, inArray, like } from 'drizzle-orm';

import type { AgentTaskState } from './classroom-runtime';
import { getDatabaseClient } from './db/client';
import {
  agentActionCommands,
  agentEventCursors,
  agentEventLog,
  agentLatestStates,
  agentProfiles,
  eventOutbox,
  providerAgentBindings,
} from './db/schema';
import {
  dispatchPendingOutbox,
  storeAgentEvents,
  upsertAgentProfile,
} from './durable-agent-store';
import type { AgentRuntimeEvent } from './agent-event-contract';
import { stressAgentPrefix } from './stress-test-contract';

const OUTBOX_AGENT_REGISTRY = 'agent.registry';

const STRESS_COLORS = ['#3b82a0', '#d56b52', '#6f8a3c'] as const;
const STRESS_VARIANTS = ['boy', 'girl', 'genderless'] as const;

export interface StressRunStatus {
  runId: string;
  agentIds: string[];
  profileCount: number;
  latestStateCount: number;
  eventCount: number;
  cursorCount: number;
  outboxCount: number;
  bindingCount: number;
  commandCount: number;
}

export interface StressOperationResult {
  operation: 'enter' | 'target' | 'release';
  attempted: number;
  accepted: number;
  duplicate: number;
  durationMs: number;
}

function stressAgentId(runId: string, index: number): string {
  return `${stressAgentPrefix(runId)}${String(index + 1).padStart(2, '0')}`;
}

async function stressAgentIds(runId: string): Promise<string[]> {
  const { database } = getDatabaseClient();
  const rows = await database
    .select({ agentId: agentProfiles.agentId })
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.source, 'test'),
        like(agentProfiles.agentId, `${stressAgentPrefix(runId)}%`),
      ),
    )
    .orderBy(agentProfiles.agentId);
  return rows.map((row) => row.agentId);
}

export async function stressRunStatus(runId: string): Promise<StressRunStatus> {
  const { database } = getDatabaseClient();
  const agentIds = await stressAgentIds(runId);
  if (agentIds.length === 0) {
    return {
      runId,
      agentIds,
      profileCount: 0,
      latestStateCount: 0,
      eventCount: 0,
      cursorCount: 0,
      outboxCount: 0,
      bindingCount: 0,
      commandCount: 0,
    };
  }

  const [latest, events, cursors, outbox, bindings, commands] =
    await Promise.all([
      database
        .select({ value: count() })
        .from(agentLatestStates)
        .where(inArray(agentLatestStates.agentId, agentIds)),
      database
        .select({ value: count() })
        .from(agentEventLog)
        .where(inArray(agentEventLog.agentId, agentIds)),
      database
        .select({ value: count() })
        .from(agentEventCursors)
        .where(inArray(agentEventCursors.agentId, agentIds)),
      database
        .select({ value: count() })
        .from(eventOutbox)
        .where(inArray(eventOutbox.aggregateId, agentIds)),
      database
        .select({ value: count() })
        .from(providerAgentBindings)
        .where(inArray(providerAgentBindings.agentId, agentIds)),
      database
        .select({ value: count() })
        .from(agentActionCommands)
        .where(inArray(agentActionCommands.agentId, agentIds)),
    ]);

  return {
    runId,
    agentIds,
    profileCount: agentIds.length,
    latestStateCount: latest[0]?.value ?? 0,
    eventCount: events[0]?.value ?? 0,
    cursorCount: cursors[0]?.value ?? 0,
    outboxCount: outbox[0]?.value ?? 0,
    bindingCount: bindings[0]?.value ?? 0,
    commandCount: commands[0]?.value ?? 0,
  };
}

export async function seedStressRun(
  runId: string,
  agentCount: number,
): Promise<StressRunStatus> {
  const { database } = getDatabaseClient();
  const targetAgentIds = Array.from({ length: agentCount }, (_, index) =>
    stressAgentId(runId, index),
  );
  const existing = await database
    .select({ agentId: agentProfiles.agentId })
    .from(agentProfiles)
    .where(inArray(agentProfiles.agentId, targetAgentIds))
    .limit(1);
  if (existing.length > 0) {
    throw new Error('stress_run_exists');
  }

  const now = new Date();
  for (let index = 0; index < agentCount; index += 1) {
    await upsertAgentProfile(
      {
        schemaVersion: 1,
        agentId: stressAgentId(runId, index),
        displayName: `压测 ${String(index + 1).padStart(2, '0')}`,
        characterVariant: STRESS_VARIANTS[index % STRESS_VARIANTS.length],
        registeredBy: 'system',
        role: `Capacity stress ${runId}`,
        color: STRESS_COLORS[index % STRESS_COLORS.length],
      },
      now,
      'test',
    );
  }
  await dispatchPendingOutbox();
  return stressRunStatus(runId);
}

function operationEvents(
  runId: string,
  agentIds: readonly string[],
  operation: 'enter' | 'target' | 'release',
  state?: AgentTaskState,
): AgentRuntimeEvent[] {
  const observedAt = new Date().toISOString();
  return agentIds.map((agentId) => {
    if (operation === 'enter') {
      return {
        schemaVersion: 1,
        eventId: `test:${runId}:enter:${agentId}`,
        type: 'agent.presence',
        agentId,
        source: 'replay',
        observedAt,
        sequence: 1,
        action: 'enter',
        scenePointId: 'entrance-door',
      };
    }
    const nextState = operation === 'release' ? 'idle' : state ?? 'writing';
    return {
      schemaVersion: 1,
      eventId: `test:${runId}:${operation}:${agentId}`,
      type: 'agent.state',
      agentId,
      source: 'replay',
      observedAt,
      sequence: operation === 'target' ? 2 : 3,
      state: nextState,
      taskSummary:
        operation === 'release'
          ? 'Capacity stress release'
          : `Capacity stress target ${nextState}`,
      metadata: { source: 'test', runId },
    };
  });
}

export async function runStressOperation(
  runId: string,
  operation: 'enter' | 'target' | 'release',
  options: { state?: AgentTaskState; count?: number } = {},
): Promise<StressOperationResult> {
  const allAgentIds = await stressAgentIds(runId);
  if (allAgentIds.length === 0) throw new Error('stress_run_not_found');
  const agentIds =
    operation === 'release'
      ? allAgentIds.slice(0, options.count ?? 1)
      : allAgentIds;
  const events = operationEvents(runId, agentIds, operation, options.state);
  const startedAt = performance.now();
  const results = await storeAgentEvents(events);
  await dispatchPendingOutbox();
  return {
    operation,
    attempted: events.length,
    accepted: results.filter((result) => result.accepted).length,
    duplicate: results.filter(
      (result) => !result.accepted && result.reason === 'duplicate_event',
    ).length,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}

export async function cleanupStressRun(runId: string): Promise<number> {
  const { database } = getDatabaseClient();
  const profiles = await database
    .select({ agentId: agentProfiles.agentId, revision: agentProfiles.revision })
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.source, 'test'),
        like(agentProfiles.agentId, `${stressAgentPrefix(runId)}%`),
      ),
    );
  if (profiles.length === 0) return 0;
  const agentIds = profiles.map((profile) => profile.agentId);
  const now = new Date();

  await database.transaction(async (transaction) => {
    await transaction
      .delete(agentActionCommands)
      .where(inArray(agentActionCommands.agentId, agentIds));
    await transaction
      .delete(agentEventCursors)
      .where(inArray(agentEventCursors.agentId, agentIds));
    await transaction
      .delete(agentLatestStates)
      .where(inArray(agentLatestStates.agentId, agentIds));
    await transaction
      .delete(agentEventLog)
      .where(inArray(agentEventLog.agentId, agentIds));
    await transaction
      .delete(providerAgentBindings)
      .where(inArray(providerAgentBindings.agentId, agentIds));
    await transaction
      .delete(eventOutbox)
      .where(inArray(eventOutbox.aggregateId, agentIds));
    await transaction
      .delete(agentProfiles)
      .where(inArray(agentProfiles.agentId, agentIds));
    await transaction.insert(eventOutbox).values(
      profiles.map((profile) => ({
        topic: OUTBOX_AGENT_REGISTRY,
        aggregateId: profile.agentId,
        payload: {
          type: 'agent.profile.removed',
          agentId: profile.agentId,
          revision: profile.revision + 1,
          observedAt: now.toISOString(),
        },
      })),
    );
  });

  await dispatchPendingOutbox();
  await database
    .delete(eventOutbox)
    .where(inArray(eventOutbox.aggregateId, agentIds));
  return profiles.length;
}
