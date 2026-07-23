import {
  bigint,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const agentProfileRevisionSequence = pgSequence(
  'agent_profile_revision_seq',
  { startWith: 1 },
);

export const parentUsers = pgTable(
  'parent_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    oidcIssuer: text('oidc_issuer').notNull(),
    oidcSubject: text('oidc_subject').notNull(),
    email: text('email'),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    timezone: text('timezone'),
    language: text('language'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('parent_users_oidc_identity_uq').on(
      table.oidcIssuer,
      table.oidcSubject,
    ),
  ],
);

export const agentEnrollments = pgTable(
  'agent_enrollments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentUserId: uuid('parent_user_id')
      .notNull()
      .references(() => parentUsers.id),
    status: text('status').notNull(),
    draftProfile: jsonb('draft_profile'),
    provider: text('provider'),
    nativeAgentId: text('native_agent_id'),
    pairingCodeHash: text('pairing_code_hash'),
    pairingExpiresAt: timestamp('pairing_expires_at', { withTimezone: true }),
    pairedAt: timestamp('paired_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('agent_enrollments_parent_idx').on(table.parentUserId),
    index('agent_enrollments_provider_native_idx').on(
      table.provider,
      table.nativeAgentId,
    ),
    uniqueIndex('agent_enrollments_pairing_hash_uq').on(table.pairingCodeHash),
  ],
);

export const agentProfiles = pgTable(
  'agent_profiles',
  {
    agentId: text('agent_id').primaryKey(),
    schemaVersion: integer('schema_version').notNull().default(1),
    enrollmentId: uuid('enrollment_id')
      .unique()
      .references(() => agentEnrollments.id),
    ownerId: uuid('owner_id').references(() => parentUsers.id),
    legacyOwnerId: text('legacy_owner_id'),
    source: text('source').notNull().default('runtime'),
    displayName: text('display_name').notNull(),
    characterVariant: text('character_variant').notNull(),
    appearancePreset: text('appearance_preset').notNull().default('classic'),
    registeredBy: text('registered_by').notNull(),
    role: text('role'),
    personalitySummary: text('personality_summary'),
    capabilities: jsonb('capabilities'),
    color: text('color'),
    revision: bigint('revision', { mode: 'number' })
      .notNull()
      .default(sql`nextval('agent_profile_revision_seq')`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    index('agent_profiles_owner_idx').on(table.ownerId),
    index('agent_profiles_active_idx').on(table.archivedAt),
    index('agent_profiles_source_idx').on(table.source),
  ],
);

export const providerAgentBindings = pgTable(
  'provider_agent_bindings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull(),
    nativeAgentId: text('native_agent_id').notNull(),
    agentId: text('agent_id').references(() => agentProfiles.agentId),
    runtimeInstanceId: text('runtime_instance_id'),
    adapterVersion: text('adapter_version'),
    discoveryDraft: jsonb('discovery_draft'),
    status: text('status').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('provider_agent_bindings_native_uq').on(
      table.provider,
      table.nativeAgentId,
    ),
    index('provider_agent_bindings_agent_idx').on(table.agentId),
  ],
);

export const runtimeCredentials = pgTable(
  'runtime_credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bindingId: uuid('binding_id')
      .notNull()
      .references(() => providerAgentBindings.id),
    tokenHash: text('token_hash').notNull(),
    status: text('status').notNull().default('active'),
    runtimeInstanceId: text('runtime_instance_id'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('runtime_credentials_token_hash_uq').on(table.tokenHash),
    index('runtime_credentials_binding_idx').on(table.bindingId),
    index('runtime_credentials_status_idx').on(table.status),
  ],
);

export const agentEventCursors = pgTable(
  'agent_event_cursors',
  {
    source: text('source').notNull(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agentProfiles.agentId),
    lastSequence: bigint('last_sequence', { mode: 'number' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('agent_event_cursors_source_agent_uq').on(
      table.source,
      table.agentId,
    ),
  ],
);

export const agentLatestStates = pgTable('agent_latest_states', {
  agentId: text('agent_id')
    .primaryKey()
    .references(() => agentProfiles.agentId),
  presenceSource: text('presence_source'),
  presenceLogId: bigint('presence_log_id', { mode: 'number' }),
  presenceSequence: bigint('presence_sequence', { mode: 'number' }),
  presenceEventId: text('presence_event_id').unique(),
  presenceAction: text('presence_action'),
  scenePointId: text('scene_point_id'),
  presenceObservedAt: timestamp('presence_observed_at', { withTimezone: true }),
  presencePayload: jsonb('presence_payload'),
  stateSource: text('state_source'),
  stateLogId: bigint('state_log_id', { mode: 'number' }),
  stateSequence: bigint('state_sequence', { mode: 'number' }),
  stateEventId: text('state_event_id').unique(),
  state: text('state'),
  taskSummary: text('task_summary'),
  stateObservedAt: timestamp('state_observed_at', { withTimezone: true }),
  statePayload: jsonb('state_payload'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentEventLog = pgTable(
  'agent_event_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    eventId: text('event_id').notNull().unique(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agentProfiles.agentId),
    source: text('source').notNull(),
    sourceSequence: bigint('source_sequence', { mode: 'number' }).notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('agent_event_log_source_sequence_uq').on(
      table.source,
      table.agentId,
      table.sourceSequence,
    ),
    index('agent_event_log_agent_created_idx').on(table.agentId, table.id),
  ],
);

export const agentActionCommands = pgTable(
  'agent_action_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: text('request_id').notNull().unique(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agentProfiles.agentId),
    actorType: text('actor_type').notNull(),
    actorParentUserId: uuid('actor_parent_user_id').references(
      () => parentUsers.id,
    ),
    action: text('action').notNull(),
    status: text('status').notNull().default('accepted'),
    eventId: text('event_id').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('agent_action_commands_agent_created_idx').on(
      table.agentId,
      table.createdAt,
    ),
    index('agent_action_commands_parent_idx').on(table.actorParentUserId),
  ],
);

export const eventOutbox = pgTable(
  'event_outbox',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    topic: text('topic').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastErrorCode: text('last_error_code'),
  },
  (table) => [
    index('event_outbox_pending_idx').on(table.publishedAt, table.id),
    index('event_outbox_topic_idx').on(table.topic, table.id),
  ],
);
