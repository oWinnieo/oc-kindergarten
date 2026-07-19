import { and, eq, isNull, or } from 'drizzle-orm';

import { getDatabaseClient } from './db/client';
import {
  agentEnrollments,
  agentLatestStates,
  agentProfiles,
  providerAgentBindings,
} from './db/schema';
import type {
  AgentProvider,
  ProviderAgentBindingView,
  ProviderAgentDiscoveryInput,
  ProviderBindingStatus,
} from './provider-binding-contract';

type BindingRow = typeof providerAgentBindings.$inferSelect;

function resolutionForStatus(
  status: ProviderBindingStatus,
): ProviderAgentBindingView['resolution'] {
  if (status === 'active') return 'active';
  if (status === 'revoked') return 'revoked_binding';
  return 'pending_binding';
}

function rowToView(
  row: BindingRow,
  activeAgentId?: string,
): ProviderAgentBindingView {
  const storedStatus = row.status as ProviderBindingStatus;
  const status =
    storedStatus === 'active' && activeAgentId === undefined
      ? 'revoked'
      : storedStatus;
  return {
    bindingId: row.id,
    provider: row.provider as AgentProvider,
    nativeAgentId: row.nativeAgentId,
    ...(row.runtimeInstanceId === null
      ? {}
      : { runtimeInstanceId: row.runtimeInstanceId }),
    ...(row.adapterVersion === null
      ? {}
      : { adapterVersion: row.adapterVersion }),
    status,
    resolution: resolutionForStatus(status),
    ...(activeAgentId === undefined ? {} : { agentId: activeAgentId }),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

async function activeAgentIdForBinding(
  provider: AgentProvider,
  nativeAgentId: string,
): Promise<string | undefined> {
  const { database } = getDatabaseClient();
  const rows = await database
    .select({ agentId: agentProfiles.agentId })
    .from(providerAgentBindings)
    .innerJoin(
      agentProfiles,
      eq(providerAgentBindings.agentId, agentProfiles.agentId),
    )
    .leftJoin(
      agentEnrollments,
      eq(agentEnrollments.id, agentProfiles.enrollmentId),
    )
    .where(
      and(
        eq(providerAgentBindings.provider, provider),
        eq(providerAgentBindings.nativeAgentId, nativeAgentId),
        eq(providerAgentBindings.status, 'active'),
        isNull(agentProfiles.archivedAt),
        or(
          isNull(agentProfiles.enrollmentId),
          eq(agentEnrollments.status, 'active'),
        ),
      ),
    )
    .limit(1);
  return rows[0]?.agentId;
}

export async function discoverProviderAgent(
  discovery: ProviderAgentDiscoveryInput,
): Promise<ProviderAgentBindingView> {
  const { database } = getDatabaseClient();
  const now = new Date();
  const updateValues: Partial<typeof providerAgentBindings.$inferInsert> = {
    lastSeenAt: now,
    updatedAt: now,
    ...(discovery.runtimeInstanceId === undefined
      ? {}
      : { runtimeInstanceId: discovery.runtimeInstanceId }),
    ...(discovery.adapterVersion === undefined
      ? {}
      : { adapterVersion: discovery.adapterVersion }),
    ...(discovery.profileDraft === undefined
      ? {}
      : { discoveryDraft: discovery.profileDraft }),
  };
  const rows = await database
    .insert(providerAgentBindings)
    .values({
      provider: discovery.provider,
      nativeAgentId: discovery.nativeAgentId,
      runtimeInstanceId: discovery.runtimeInstanceId,
      adapterVersion: discovery.adapterVersion,
      discoveryDraft: discovery.profileDraft,
      status: 'pending_claim',
      lastSeenAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        providerAgentBindings.provider,
        providerAgentBindings.nativeAgentId,
      ],
      set: updateValues,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('provider discovery 写入后未返回 binding');
  const activeAgentId = await activeAgentIdForBinding(
    discovery.provider,
    discovery.nativeAgentId,
  );
  return rowToView(row, activeAgentId);
}

export async function resolveProviderAgent(
  provider: AgentProvider,
  nativeAgentId: string,
): Promise<ProviderAgentBindingView | null> {
  const { database } = getDatabaseClient();
  const rows = await database
    .select()
    .from(providerAgentBindings)
    .where(
      and(
        eq(providerAgentBindings.provider, provider),
        eq(providerAgentBindings.nativeAgentId, nativeAgentId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const activeAgentId = await activeAgentIdForBinding(provider, nativeAgentId);
  return rowToView(row, activeAgentId);
}

export async function isAgentPresent(agentId: string): Promise<boolean> {
  const { database } = getDatabaseClient();
  const rows = await database
    .select({ action: agentLatestStates.presenceAction })
    .from(agentLatestStates)
    .where(eq(agentLatestStates.agentId, agentId))
    .limit(1);
  return rows[0]?.action === 'enter';
}
