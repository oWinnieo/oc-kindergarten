import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import type {
  AgentActivationInput,
  AgentEnrollmentLifecycleAction,
  AgentEnrollmentStatus,
  AgentEnrollmentView,
  RuntimeEnrollmentPairingInput,
} from './agent-enrollment-contract';
import {
  canParentArchiveEnrollment,
  generatePairingCode,
  hashPairingCode,
  nextAgentEnrollmentStatus,
} from './agent-enrollment-contract';
import type { AgentProfile } from './agent-registry-contract';
import { AGENT_REGISTRY_SCHEMA_VERSION } from './agent-registry-contract';
import { getDatabaseClient } from './db/client';
import {
  agentEnrollments,
  agentLatestStates,
  agentProfiles,
  eventOutbox,
  providerAgentBindings,
} from './db/schema';
import { parseProviderAgentDraft } from './provider-binding-contract';

const OPEN_ENROLLMENT_STATUSES: AgentEnrollmentStatus[] = [
  'draft',
  'awaiting_pairing',
  'pending_parent_confirmation',
  'active',
  'suspended',
];
const CLAIMED_ENROLLMENT_STATUSES: AgentEnrollmentStatus[] = [
  'pending_parent_confirmation',
  'active',
  'suspended',
];
const MAX_OPEN_ENROLLMENTS_PER_PARENT = 20;
const PAIRING_CODE_LIFETIME_MS = 15 * 60 * 1000;
const OUTBOX_AGENT_REGISTRY = 'agent.registry';

export type AgentEnrollmentErrorCode =
  | 'not_found'
  | 'invalid_state'
  | 'pairing_code_invalid'
  | 'pairing_code_expired'
  | 'native_agent_claimed'
  | 'archive_deferred'
  | 'too_many_open_enrollments';

export class AgentEnrollmentError extends Error {
  constructor(
    readonly code: AgentEnrollmentErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function agentEnrollmentErrorStatus(error: AgentEnrollmentError): number {
  if (error.code === 'not_found' || error.code === 'pairing_code_invalid') {
    return 404;
  }
  if (error.code === 'pairing_code_expired') return 410;
  return 409;
}

type EnrollmentViewRow = {
  id: string;
  status: string;
  draftProfile: unknown;
  provider: string | null;
  nativeAgentId: string | null;
  pairingExpiresAt: Date | null;
  pairedAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  profileAgentId: string | null;
  profileDisplayName: string | null;
  profileCharacterVariant: string | null;
  profileRole: string | null;
  profilePersonalitySummary: string | null;
  profileCapabilities: unknown;
  profileColor: string | null;
  profileRevision: number | null;
  profileUpdatedAt: Date | null;
};

type AgentProfileRow = typeof agentProfiles.$inferSelect;

const enrollmentViewSelection = {
  id: agentEnrollments.id,
  status: agentEnrollments.status,
  draftProfile: agentEnrollments.draftProfile,
  provider: agentEnrollments.provider,
  nativeAgentId: agentEnrollments.nativeAgentId,
  pairingExpiresAt: agentEnrollments.pairingExpiresAt,
  pairedAt: agentEnrollments.pairedAt,
  confirmedAt: agentEnrollments.confirmedAt,
  createdAt: agentEnrollments.createdAt,
  updatedAt: agentEnrollments.updatedAt,
  profileAgentId: agentProfiles.agentId,
  profileDisplayName: agentProfiles.displayName,
  profileCharacterVariant: agentProfiles.characterVariant,
  profileRole: agentProfiles.role,
  profilePersonalitySummary: agentProfiles.personalitySummary,
  profileCapabilities: agentProfiles.capabilities,
  profileColor: agentProfiles.color,
  profileRevision: agentProfiles.revision,
  profileUpdatedAt: agentProfiles.updatedAt,
};

function normalizedDraft(value: unknown) {
  const parsed = parseProviderAgentDraft(value);
  return parsed.ok ? parsed.draft : undefined;
}

function profileRowToPublicProfile(row: AgentProfileRow): AgentProfile {
  return {
    schemaVersion: AGENT_REGISTRY_SCHEMA_VERSION,
    agentId: row.agentId,
    displayName: row.displayName,
    characterVariant: row.characterVariant as AgentProfile['characterVariant'],
    registeredBy: row.registeredBy as AgentProfile['registeredBy'],
    ...(row.ownerId === null ? {} : { ownerId: row.ownerId }),
    ...(row.role === null ? {} : { role: row.role }),
    ...(row.color === null ? {} : { color: row.color }),
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function appendRegistryUpsert(
  transaction: Parameters<
    Parameters<ReturnType<typeof getDatabaseClient>['database']['transaction']>[0]
  >[0],
  row: AgentProfileRow,
) {
  const profile = profileRowToPublicProfile(row);
  await transaction.insert(eventOutbox).values({
    topic: OUTBOX_AGENT_REGISTRY,
    aggregateId: profile.agentId,
    payload: {
      type: 'agent.profile.upserted',
      agentId: profile.agentId,
      profile,
      revision: profile.revision,
      observedAt: profile.updatedAt,
    },
  });
}

async function appendRegistryRemove(
  transaction: Parameters<
    Parameters<ReturnType<typeof getDatabaseClient>['database']['transaction']>[0]
  >[0],
  agentId: string,
  revision: number,
  observedAt: Date,
) {
  await transaction.insert(eventOutbox).values({
    topic: OUTBOX_AGENT_REGISTRY,
    aggregateId: agentId,
    payload: {
      type: 'agent.profile.removed',
      agentId,
      revision,
      observedAt: observedAt.toISOString(),
    },
  });
}

function rowToEnrollmentView(
  row: EnrollmentViewRow,
  now = new Date(),
): AgentEnrollmentView {
  const draftProfile = normalizedDraft(row.draftProfile);
  const capabilities = Array.isArray(row.profileCapabilities)
    ? row.profileCapabilities.filter(
        (item): item is string => typeof item === 'string',
      )
    : undefined;
  const pairingExpired =
    row.status === 'awaiting_pairing' &&
    row.pairingExpiresAt !== null &&
    row.pairingExpiresAt.getTime() <= now.getTime();
  const hasAgent =
    row.profileAgentId !== null &&
    row.profileDisplayName !== null &&
    row.profileCharacterVariant !== null &&
    row.profileRevision !== null &&
    row.profileUpdatedAt !== null;
  const agent = hasAgent
    ? {
        agentId: row.profileAgentId!,
        displayName: row.profileDisplayName!,
        characterVariant:
          row.profileCharacterVariant as NonNullable<
            AgentEnrollmentView['agent']
          >['characterVariant'],
        ...(row.profileRole === null ? {} : { role: row.profileRole }),
        ...(row.profilePersonalitySummary === null
          ? {}
          : { personalitySummary: row.profilePersonalitySummary }),
        ...(capabilities === undefined ? {} : { capabilities }),
        ...(row.profileColor === null ? {} : { color: row.profileColor }),
        revision: row.profileRevision!,
        updatedAt: row.profileUpdatedAt!.toISOString(),
      }
    : undefined;
  return {
    id: row.id,
    status: row.status as AgentEnrollmentStatus,
    ...(draftProfile === undefined ? {} : { draftProfile }),
    ...(row.provider === null
      ? {}
      : { provider: row.provider as AgentEnrollmentView['provider'] }),
    ...(row.nativeAgentId === null
      ? {}
      : { nativeAgentId: row.nativeAgentId }),
    ...(row.pairingExpiresAt === null
      ? {}
      : { pairingExpiresAt: row.pairingExpiresAt.toISOString() }),
    ...(row.status === 'awaiting_pairing' ? { pairingExpired } : {}),
    ...(row.pairedAt === null ? {} : { pairedAt: row.pairedAt.toISOString() }),
    ...(row.confirmedAt === null
      ? {}
      : { confirmedAt: row.confirmedAt.toISOString() }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(agent === undefined ? {} : { agent }),
  };
}

async function enrollmentViewById(
  parentUserId: string,
  enrollmentId: string,
): Promise<AgentEnrollmentView | null> {
  const { database } = getDatabaseClient();
  const rows = await database
    .select(enrollmentViewSelection)
    .from(agentEnrollments)
    .leftJoin(
      agentProfiles,
      eq(agentProfiles.enrollmentId, agentEnrollments.id),
    )
    .where(
      and(
        eq(agentEnrollments.id, enrollmentId),
        eq(agentEnrollments.parentUserId, parentUserId),
      ),
    )
    .limit(1);
  return rows[0] ? rowToEnrollmentView(rows[0] as EnrollmentViewRow) : null;
}

export async function listAgentEnrollments(
  parentUserId: string,
): Promise<AgentEnrollmentView[]> {
  const { database } = getDatabaseClient();
  const rows = await database
    .select(enrollmentViewSelection)
    .from(agentEnrollments)
    .leftJoin(
      agentProfiles,
      eq(agentProfiles.enrollmentId, agentEnrollments.id),
    )
    .where(eq(agentEnrollments.parentUserId, parentUserId))
    .orderBy(asc(agentEnrollments.createdAt));
  return rows.map((row) => rowToEnrollmentView(row as EnrollmentViewRow));
}

export async function createAgentEnrollment(
  parentUserId: string,
): Promise<AgentEnrollmentView> {
  const { database } = getDatabaseClient();
  const countRows = await database
    .select({ value: count() })
    .from(agentEnrollments)
    .where(
      and(
        eq(agentEnrollments.parentUserId, parentUserId),
        inArray(agentEnrollments.status, OPEN_ENROLLMENT_STATUSES),
      ),
    );
  if ((countRows[0]?.value ?? 0) >= MAX_OPEN_ENROLLMENTS_PER_PARENT) {
    throw new AgentEnrollmentError(
      'too_many_open_enrollments',
      '当前未归档的 Agent 入园申请过多',
    );
  }
  const rows = await database
    .insert(agentEnrollments)
    .values({ parentUserId, status: 'draft' })
    .returning({ id: agentEnrollments.id });
  const id = rows[0]?.id;
  if (!id) throw new Error('Agent enrollment 写入后未返回记录');
  const view = await enrollmentViewById(parentUserId, id);
  if (!view) throw new Error('Agent enrollment 写入后无法读取');
  return view;
}

export async function issueAgentPairingCode(
  parentUserId: string,
  enrollmentId: string,
): Promise<{
  enrollment: AgentEnrollmentView;
  pairingCode: string;
  pairingExpiresAt: string;
}> {
  const { database } = getDatabaseClient();
  const pairingCode = generatePairingCode();
  const pairingCodeHash = hashPairingCode(pairingCode);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAIRING_CODE_LIFETIME_MS);
  const rows = await database
    .update(agentEnrollments)
    .set({
      status: 'awaiting_pairing',
      draftProfile: null,
      provider: null,
      nativeAgentId: null,
      pairingCodeHash,
      pairingExpiresAt: expiresAt,
      pairedAt: null,
      confirmedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentEnrollments.id, enrollmentId),
        eq(agentEnrollments.parentUserId, parentUserId),
        inArray(agentEnrollments.status, ['draft', 'awaiting_pairing']),
      ),
    )
    .returning({ id: agentEnrollments.id });
  if (!rows[0]) {
    const existing = await enrollmentViewById(parentUserId, enrollmentId);
    throw new AgentEnrollmentError(
      existing ? 'invalid_state' : 'not_found',
      existing ? '当前入园申请不能生成新的配对码' : 'Agent 入园申请不存在',
    );
  }
  const enrollment = await enrollmentViewById(parentUserId, enrollmentId);
  if (!enrollment) throw new Error('配对码生成后无法读取 enrollment');
  return {
    enrollment,
    pairingCode,
    pairingExpiresAt: expiresAt.toISOString(),
  };
}

export async function pairRuntimeAgent(
  input: RuntimeEnrollmentPairingInput,
): Promise<{
  enrollmentId: string;
  status: 'pending_parent_confirmation';
  provider: string;
  nativeAgentId: string;
}> {
  const { database } = getDatabaseClient();
  const pairingCodeHash = hashPairingCode(input.pairingCode);
  const now = new Date();
  return database.transaction(async (transaction) => {
    const enrollmentRows = await transaction
      .select()
      .from(agentEnrollments)
      .where(eq(agentEnrollments.pairingCodeHash, pairingCodeHash))
      .limit(1)
      .for('update');
    const enrollment = enrollmentRows[0];
    if (!enrollment || enrollment.status !== 'awaiting_pairing') {
      throw new AgentEnrollmentError(
        'pairing_code_invalid',
        '配对码不存在或已经使用',
      );
    }
    if (
      !enrollment.pairingExpiresAt ||
      enrollment.pairingExpiresAt.getTime() <= now.getTime()
    ) {
      throw new AgentEnrollmentError('pairing_code_expired', '配对码已过期');
    }

    const discovery = input.discovery;
    const conflictingEnrollments = await transaction
      .select({ id: agentEnrollments.id })
      .from(agentEnrollments)
      .where(
        and(
          eq(agentEnrollments.provider, discovery.provider),
          eq(agentEnrollments.nativeAgentId, discovery.nativeAgentId),
          ne(agentEnrollments.id, enrollment.id),
          inArray(agentEnrollments.status, CLAIMED_ENROLLMENT_STATUSES),
        ),
      )
      .limit(1);
    if (conflictingEnrollments[0]) {
      throw new AgentEnrollmentError(
        'native_agent_claimed',
        '这个 runtime Agent 已被其他入园申请认领',
      );
    }

    const bindingRows = await transaction
      .select()
      .from(providerAgentBindings)
      .where(
        and(
          eq(providerAgentBindings.provider, discovery.provider),
          eq(providerAgentBindings.nativeAgentId, discovery.nativeAgentId),
        ),
      )
      .limit(1)
      .for('update');
    const binding = bindingRows[0];
    let preserveTechnicalBinding = false;
    if (binding?.agentId) {
      const linkedProfiles = await transaction
        .select({
          ownerId: agentProfiles.ownerId,
          enrollmentId: agentProfiles.enrollmentId,
          registeredBy: agentProfiles.registeredBy,
        })
        .from(agentProfiles)
        .where(eq(agentProfiles.agentId, binding.agentId))
        .limit(1);
      const linkedProfile = linkedProfiles[0];
      preserveTechnicalBinding = Boolean(
        linkedProfile &&
          linkedProfile.ownerId === null &&
          linkedProfile.enrollmentId === null &&
          linkedProfile.registeredBy === 'system',
      );
      if (!preserveTechnicalBinding) {
        throw new AgentEnrollmentError(
          'native_agent_claimed',
          '这个 runtime Agent 已经绑定到正式家庭',
        );
      }
    }

    const storedBindingDraft = normalizedDraft(binding?.discoveryDraft);
    const draftProfile = discovery.profileDraft ??
      storedBindingDraft ?? { displayName: discovery.nativeAgentId };
    if (binding) {
      await transaction
        .update(providerAgentBindings)
        .set({
          runtimeInstanceId:
            discovery.runtimeInstanceId ?? binding.runtimeInstanceId,
          adapterVersion: discovery.adapterVersion ?? binding.adapterVersion,
          discoveryDraft: draftProfile,
          status: preserveTechnicalBinding ? 'active' : 'pending_claim',
          agentId: preserveTechnicalBinding ? binding.agentId : null,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(providerAgentBindings.id, binding.id));
    } else {
      await transaction.insert(providerAgentBindings).values({
        provider: discovery.provider,
        nativeAgentId: discovery.nativeAgentId,
        runtimeInstanceId: discovery.runtimeInstanceId,
        adapterVersion: discovery.adapterVersion,
        discoveryDraft: draftProfile,
        status: 'pending_claim',
        lastSeenAt: now,
        updatedAt: now,
      });
    }

    await transaction
      .update(agentEnrollments)
      .set({
        status: 'pending_parent_confirmation',
        draftProfile,
        provider: discovery.provider,
        nativeAgentId: discovery.nativeAgentId,
        pairingCodeHash: null,
        pairingExpiresAt: null,
        pairedAt: now,
        updatedAt: now,
      })
      .where(eq(agentEnrollments.id, enrollment.id));

    return {
      enrollmentId: enrollment.id,
      status: 'pending_parent_confirmation',
      provider: discovery.provider,
      nativeAgentId: discovery.nativeAgentId,
    };
  });
}

export async function activateAgentEnrollment(
  parentUserId: string,
  enrollmentId: string,
  activation: AgentActivationInput,
): Promise<AgentEnrollmentView> {
  const { database } = getDatabaseClient();
  await database.transaction(async (transaction) => {
    const enrollmentRows = await transaction
      .select()
      .from(agentEnrollments)
      .where(
        and(
          eq(agentEnrollments.id, enrollmentId),
          eq(agentEnrollments.parentUserId, parentUserId),
        ),
      )
      .limit(1)
      .for('update');
    const enrollment = enrollmentRows[0];
    if (!enrollment) {
      throw new AgentEnrollmentError('not_found', 'Agent 入园申请不存在');
    }
    if (enrollment.status === 'active') return;
    if (
      enrollment.status !== 'pending_parent_confirmation' ||
      !enrollment.provider ||
      !enrollment.nativeAgentId
    ) {
      throw new AgentEnrollmentError(
        'invalid_state',
        'Agent 尚未完成 runtime 配对，不能确认入园',
      );
    }

    const bindingRows = await transaction
      .select()
      .from(providerAgentBindings)
      .where(
        and(
          eq(providerAgentBindings.provider, enrollment.provider),
          eq(providerAgentBindings.nativeAgentId, enrollment.nativeAgentId),
        ),
      )
      .limit(1)
      .for('update');
    const binding = bindingRows[0];
    if (!binding) {
      throw new AgentEnrollmentError(
        'invalid_state',
        'runtime binding 不存在，请重新配对',
      );
    }

    let previousTechnicalAgentId: string | null = null;
    if (binding.agentId) {
      const linkedProfiles = await transaction
        .select({
          ownerId: agentProfiles.ownerId,
          enrollmentId: agentProfiles.enrollmentId,
          registeredBy: agentProfiles.registeredBy,
        })
        .from(agentProfiles)
        .where(eq(agentProfiles.agentId, binding.agentId))
        .limit(1);
      const linkedProfile = linkedProfiles[0];
      if (
        linkedProfile?.enrollmentId === enrollment.id &&
        linkedProfile.ownerId === parentUserId
      ) {
        return;
      }
      if (
        linkedProfile?.ownerId === null &&
        linkedProfile.enrollmentId === null &&
        linkedProfile.registeredBy === 'system'
      ) {
        previousTechnicalAgentId = binding.agentId;
      } else {
        throw new AgentEnrollmentError(
          'native_agent_claimed',
          '这个 runtime Agent 已经绑定到正式家庭',
        );
      }
    }

    const now = new Date();
    const agentId = `agent-${enrollment.id}`;
    const profileRows = await transaction
      .insert(agentProfiles)
      .values({
        agentId,
        schemaVersion: AGENT_REGISTRY_SCHEMA_VERSION,
        enrollmentId: enrollment.id,
        ownerId: parentUserId,
        displayName: activation.displayName,
        characterVariant: activation.characterVariant,
        registeredBy: 'owner',
        role: activation.role,
        personalitySummary: activation.personalitySummary,
        capabilities: activation.capabilities,
        color: activation.color,
        updatedAt: now,
        archivedAt: null,
      })
      .onConflictDoNothing()
      .returning();
    const profile = profileRows[0];
    if (!profile) {
      throw new AgentEnrollmentError(
        'invalid_state',
        'Agent profile 已存在但不属于当前入园申请',
      );
    }

    await transaction
      .update(providerAgentBindings)
      .set({
        agentId,
        status: 'active',
        discoveryDraft: activation,
        updatedAt: now,
      })
      .where(eq(providerAgentBindings.id, binding.id));

    if (previousTechnicalAgentId && previousTechnicalAgentId !== agentId) {
      await transaction
        .delete(agentLatestStates)
        .where(eq(agentLatestStates.agentId, previousTechnicalAgentId));
    }

    await transaction
      .update(agentEnrollments)
      .set({
        status: 'active',
        draftProfile: activation,
        pairingCodeHash: null,
        pairingExpiresAt: null,
        confirmedAt: now,
        updatedAt: now,
      })
      .where(eq(agentEnrollments.id, enrollment.id));

    await appendRegistryUpsert(transaction, profile);
  });

  const view = await enrollmentViewById(parentUserId, enrollmentId);
  if (!view) throw new Error('Agent 激活后无法读取 enrollment');
  return view;
}

export async function changeAgentEnrollmentLifecycle(
  parentUserId: string,
  enrollmentId: string,
  action: AgentEnrollmentLifecycleAction,
): Promise<AgentEnrollmentView> {
  const { database } = getDatabaseClient();
  await database.transaction(async (transaction) => {
    const initialRows = await transaction
      .select({
        id: agentEnrollments.id,
        status: agentEnrollments.status,
      })
      .from(agentEnrollments)
      .where(
        and(
          eq(agentEnrollments.id, enrollmentId),
          eq(agentEnrollments.parentUserId, parentUserId),
        ),
      )
      .limit(1);
    if (!initialRows[0]) {
      throw new AgentEnrollmentError('not_found', 'Agent 入园申请不存在');
    }

    const profileRows = await transaction
      .select()
      .from(agentProfiles)
      .where(
        and(
          eq(agentProfiles.enrollmentId, enrollmentId),
          eq(agentProfiles.ownerId, parentUserId),
        ),
      )
      .limit(1)
      .for('update');
    const profile = profileRows[0];

    const enrollmentRows = await transaction
      .select()
      .from(agentEnrollments)
      .where(
        and(
          eq(agentEnrollments.id, enrollmentId),
          eq(agentEnrollments.parentUserId, parentUserId),
        ),
      )
      .limit(1)
      .for('update');
    const enrollment = enrollmentRows[0];
    if (!enrollment) {
      throw new AgentEnrollmentError('not_found', 'Agent 入园申请不存在');
    }
    const currentStatus = enrollment.status as AgentEnrollmentStatus;
    const nextStatus = nextAgentEnrollmentStatus(currentStatus, action);
    if (!nextStatus) {
      throw new AgentEnrollmentError(
        'invalid_state',
        `当前入园状态不能执行 ${action}`,
      );
    }
    if (
      action === 'archive' &&
      !canParentArchiveEnrollment(currentStatus)
    ) {
      throw new AgentEnrollmentError(
        'archive_deferred',
        '已入园 Agent 的归档暂未开放，请先使用暂停入园',
      );
    }
    if (action !== 'archive' && !profile) {
      throw new AgentEnrollmentError(
        'invalid_state',
        'Agent 尚未完成入园，不能更改运行状态',
      );
    }
    if (
      action === 'archive' &&
      !profile &&
      (currentStatus === 'active' || currentStatus === 'suspended')
    ) {
      throw new AgentEnrollmentError(
        'invalid_state',
        'Agent 状态刚刚发生变化，请重试归档',
      );
    }

    if (action !== 'archive' && profile) {
      const bindingRows = await transaction
        .select({ id: providerAgentBindings.id })
        .from(providerAgentBindings)
        .where(
          and(
            eq(providerAgentBindings.agentId, profile.agentId),
            eq(providerAgentBindings.status, 'active'),
          ),
        )
        .limit(1);
      if (!bindingRows[0]) {
        throw new AgentEnrollmentError(
          'invalid_state',
          'Agent runtime binding 已失效，不能更改运行状态',
        );
      }
    }

    const now = new Date();
    await transaction
      .update(agentEnrollments)
      .set({
        status: nextStatus,
        ...(action === 'archive'
          ? { pairingCodeHash: null, pairingExpiresAt: null }
          : {}),
        updatedAt: now,
      })
      .where(eq(agentEnrollments.id, enrollment.id));

    if (!profile) {
      if (
        action === 'archive' &&
        enrollment.provider &&
        enrollment.nativeAgentId
      ) {
        await transaction
          .update(providerAgentBindings)
          .set({ status: 'revoked', updatedAt: now })
          .where(
            and(
              eq(providerAgentBindings.provider, enrollment.provider),
              eq(
                providerAgentBindings.nativeAgentId,
                enrollment.nativeAgentId,
              ),
              isNull(providerAgentBindings.agentId),
            ),
          );
      }
      return;
    }

    const updatedProfileRows = await transaction
      .update(agentProfiles)
      .set({
        revision: sql`nextval('agent_profile_revision_seq')`,
        updatedAt: now,
        ...(action === 'archive' ? { archivedAt: now } : {}),
      })
      .where(eq(agentProfiles.agentId, profile.agentId))
      .returning();
    const updatedProfile = updatedProfileRows[0];
    if (!updatedProfile) throw new Error('Agent profile 状态更新后未返回记录');

    if (action === 'archive') {
      await transaction
        .update(providerAgentBindings)
        .set({ status: 'revoked', updatedAt: now })
        .where(eq(providerAgentBindings.agentId, profile.agentId));
    }
    if (action !== 'resume') {
      await transaction
        .delete(agentLatestStates)
        .where(eq(agentLatestStates.agentId, profile.agentId));
      await appendRegistryRemove(
        transaction,
        profile.agentId,
        updatedProfile.revision,
        now,
      );
    } else {
      await appendRegistryUpsert(transaction, updatedProfile);
    }
  });

  const view = await enrollmentViewById(parentUserId, enrollmentId);
  if (!view) throw new Error('Agent 生命周期更新后无法读取 enrollment');
  return view;
}
