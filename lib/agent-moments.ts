import { randomBytes } from 'node:crypto';

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  lt,
  or,
  type SQL,
} from 'drizzle-orm';

import { parseAgentRuntimeEvent } from './agent-event-contract';
import {
  AGENT_MOMENT_SCHEMA_VERSION,
  MAX_AGENT_MOMENT_TEXT_LENGTH,
  MAX_AGENT_MOMENT_TITLE_LENGTH,
  type AgentMomentPublishVisibility,
  type AgentMomentStatus,
  type AgentMomentTemplate,
  type AgentMomentVisibility,
  type AgentShareProfileVisibility,
  type AgentShareSettingsPatch,
  type CreateAgentMomentInput,
  type PatchAgentMomentInput,
} from './agent-moment-contract';
import type {
  OwnerAgentMoment,
  OwnerAgentMomentItem,
  OwnerAgentMomentPage,
  OwnerAgentShareSettings,
} from './agent-moment-owner-contract';
import {
  mapMomentCandidate,
  sanitizeMomentText,
} from './agent-moment-sanitizer';
import { getDatabaseClient } from './db/client';
import {
  agentEnrollments,
  agentEventLog,
  agentMomentItems,
  agentMoments,
  agentProfiles,
  agentShareSettings,
} from './db/schema';

export type AgentMomentErrorCode =
  | 'not_found'
  | 'invalid_state'
  | 'not_shareable'
  | 'sensitive_content'
  | 'conflict';

export class AgentMomentError extends Error {
  constructor(
    public readonly code: AgentMomentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentMomentError';
  }
}

export function agentMomentErrorStatus(error: AgentMomentError): number {
  switch (error.code) {
    case 'not_found':
      return 404;
    case 'invalid_state':
    case 'conflict':
      return 409;
    case 'not_shareable':
    case 'sensitive_content':
      return 422;
  }
}

interface OwnerAccess {
  enrollmentId: string;
  enrollmentStatus: string;
  agentId: string;
  displayName: string;
  characterVariant: string;
  appearancePreset: string;
  color: string | null;
}

interface OwnerMomentCursor {
  createdAt: string;
  id: string;
}

const DEFAULT_OWNER_PAGE_SIZE = 20;
const MAX_OWNER_PAGE_SIZE = 50;

type AgentMomentDatabase = ReturnType<
  typeof getDatabaseClient
>['database'];
type AgentMomentTransaction = Parameters<
  Parameters<AgentMomentDatabase['transaction']>[0]
>[0];
type AgentMomentExecutor = AgentMomentDatabase | AgentMomentTransaction;

function dateIso(value: Date | null): string | undefined {
  return value?.toISOString();
}

function encodeOwnerCursor(cursor: OwnerMomentCursor): string {
  return Buffer.from(
    JSON.stringify({ c: cursor.createdAt, i: cursor.id }),
    'utf8',
  ).toString('base64url');
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function parseOwnerAgentMomentPageQuery(search: URLSearchParams):
  | {
      ok: true;
      value: { enrollmentId: string; cursor?: OwnerMomentCursor; limit: number };
    }
  | { ok: false; error: string } {
  const enrollmentId = search.get('enrollmentId');
  if (!isUuid(enrollmentId)) {
    return { ok: false, error: 'enrollmentId 格式无效' };
  }
  const rawLimit = search.get('limit');
  const limit = rawLimit === null ? DEFAULT_OWNER_PAGE_SIZE : Number(rawLimit);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_OWNER_PAGE_SIZE
  ) {
    return { ok: false, error: 'limit 必须是 1 到 50 的整数' };
  }
  const rawCursor = search.get('cursor');
  if (!rawCursor) {
    return { ok: true, value: { enrollmentId, limit } };
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(rawCursor, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    if (
      typeof decoded.c !== 'string' ||
      Number.isNaN(Date.parse(decoded.c)) ||
      !isUuid(decoded.i)
    ) {
      throw new Error('invalid');
    }
    return {
      ok: true,
      value: {
        enrollmentId,
        limit,
        cursor: { createdAt: decoded.c, id: decoded.i },
      },
    };
  } catch {
    return { ok: false, error: 'cursor 格式无效' };
  }
}

async function resolveOwnerAccess(
  parentUserId: string,
  enrollmentId: string,
  executor: AgentMomentExecutor = getDatabaseClient().database,
): Promise<OwnerAccess | null> {
  const rows = await executor
    .select({
      enrollmentId: agentEnrollments.id,
      enrollmentStatus: agentEnrollments.status,
      agentId: agentProfiles.agentId,
      displayName: agentProfiles.displayName,
      characterVariant: agentProfiles.characterVariant,
      appearancePreset: agentProfiles.appearancePreset,
      color: agentProfiles.color,
    })
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
  return rows[0] ?? null;
}

async function readShareSettings(
  parentUserId: string,
  access: OwnerAccess,
  executor: AgentMomentExecutor = getDatabaseClient().database,
): Promise<OwnerAgentShareSettings> {
  const rows = await executor
    .select({
      profileVisibility: agentShareSettings.profileVisibility,
      allowReplyExcerpt: agentShareSettings.allowReplyExcerpt,
    })
    .from(agentShareSettings)
    .where(
      and(
        eq(agentShareSettings.agentId, access.agentId),
        eq(agentShareSettings.ownerId, parentUserId),
      ),
    )
    .limit(1);
  return {
    schemaVersion: AGENT_MOMENT_SCHEMA_VERSION,
    enrollmentId: access.enrollmentId,
    profileVisibility:
      (rows[0]?.profileVisibility as AgentShareProfileVisibility | undefined) ??
      'private',
    allowReplyExcerpt: rows[0]?.allowReplyExcerpt ?? false,
  };
}

export async function getAgentShareSettings(
  parentUserId: string,
  enrollmentId: string,
): Promise<OwnerAgentShareSettings> {
  const access = await resolveOwnerAccess(parentUserId, enrollmentId);
  if (!access) {
    throw new AgentMomentError('not_found', 'Agent 入园记录不存在');
  }
  return readShareSettings(parentUserId, access);
}

export async function updateAgentShareSettings(
  parentUserId: string,
  enrollmentId: string,
  patch: AgentShareSettingsPatch,
): Promise<OwnerAgentShareSettings> {
  const { database } = getDatabaseClient();
  return database.transaction(async (tx) => {
    const access = await resolveOwnerAccess(parentUserId, enrollmentId, tx);
    if (!access) {
      throw new AgentMomentError('not_found', 'Agent 入园记录不存在');
    }
    await tx
      .insert(agentShareSettings)
      .values({
        agentId: access.agentId,
        ownerId: parentUserId,
        profileVisibility: 'private',
        allowReplyExcerpt: false,
      })
      .onConflictDoNothing({ target: agentShareSettings.agentId });
    const settingsRows = await tx
      .select({
        profileVisibility: agentShareSettings.profileVisibility,
        allowReplyExcerpt: agentShareSettings.allowReplyExcerpt,
      })
      .from(agentShareSettings)
      .where(eq(agentShareSettings.agentId, access.agentId))
      .limit(1)
      .for('update');
    const current = settingsRows[0];
    if (!current) {
      throw new AgentMomentError('conflict', '成长册设置状态已经改变');
    }
    const nextVisibility =
      patch.profileVisibility ??
      (current.profileVisibility as AgentShareProfileVisibility);
    const nextReplyExcerpt =
      patch.allowReplyExcerpt ?? current.allowReplyExcerpt;
    const now = new Date();
    await tx
      .update(agentShareSettings)
      .set({
        ownerId: parentUserId,
        profileVisibility: nextVisibility,
        allowReplyExcerpt: nextReplyExcerpt,
        updatedAt: now,
      })
      .where(eq(agentShareSettings.agentId, access.agentId));
    if (
      current.profileVisibility === 'public' &&
      nextVisibility === 'private'
    ) {
      await tx
        .update(agentMoments)
        .set({
          status: 'draft',
          visibility: 'private',
          updatedAt: now,
        })
        .where(
          and(
            eq(agentMoments.ownerId, parentUserId),
            eq(agentMoments.agentId, access.agentId),
            eq(agentMoments.status, 'published'),
          ),
        );
    }
    return {
      schemaVersion: AGENT_MOMENT_SCHEMA_VERSION,
      enrollmentId,
      profileVisibility: nextVisibility,
      allowReplyExcerpt: nextReplyExcerpt,
    };
  });
}

function ownerMomentSelection() {
  return {
    id: agentMoments.id,
    ownerId: agentMoments.ownerId,
    agentId: agentMoments.agentId,
    shareSlug: agentMoments.shareSlug,
    title: agentMoments.title,
    ownerCaption: agentMoments.ownerCaption,
    template: agentMoments.template,
    visibility: agentMoments.visibility,
    status: agentMoments.status,
    publishedAt: agentMoments.publishedAt,
    revokedAt: agentMoments.revokedAt,
    createdAt: agentMoments.createdAt,
    updatedAt: agentMoments.updatedAt,
    enrollmentId: agentProfiles.enrollmentId,
    enrollmentParentUserId: agentEnrollments.parentUserId,
    displayName: agentProfiles.displayName,
    characterVariant: agentProfiles.characterVariant,
    appearancePreset: agentProfiles.appearancePreset,
    color: agentProfiles.color,
  };
}

async function hydrateOwnerMoments(
  rows: Array<{
    id: string;
    shareSlug: string | null;
    title: string;
    ownerCaption: string | null;
    template: string;
    visibility: string;
    status: string;
    publishedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    enrollmentId: string | null;
    enrollmentParentUserId: string;
    displayName: string;
    characterVariant: string;
    appearancePreset: string;
    color: string | null;
  }>,
  executor: AgentMomentExecutor = getDatabaseClient().database,
): Promise<OwnerAgentMoment[]> {
  if (rows.length === 0) return [];
  const itemRows = await executor
    .select({
      momentId: agentMomentItems.momentId,
      position: agentMomentItems.position,
      kind: agentMomentItems.kind,
      title: agentMomentItems.titleSnapshot,
      detail: agentMomentItems.detailSnapshot,
      occurredAt: agentMomentItems.occurredAtSnapshot,
      sourceCursor: agentMomentItems.sourceEventLogId,
    })
    .from(agentMomentItems)
    .where(inArray(agentMomentItems.momentId, rows.map((row) => row.id)))
    .orderBy(asc(agentMomentItems.position));
  const itemsByMoment = new Map<string, OwnerAgentMomentItem[]>();
  for (const item of itemRows) {
    const items = itemsByMoment.get(item.momentId) ?? [];
    items.push({
      position: item.position as 1 | 2,
      kind: item.kind,
      title: item.title,
      detail: item.detail,
      occurredAt: item.occurredAt.toISOString(),
      sourceCursor:
        item.sourceCursor === null ? null : String(item.sourceCursor),
    });
    itemsByMoment.set(item.momentId, items);
  }
  return rows.map((row) => ({
    schemaVersion: AGENT_MOMENT_SCHEMA_VERSION,
    id: row.id,
    enrollmentId: row.enrollmentId!,
    agent: {
      displayName: row.displayName,
      characterVariant: row.characterVariant,
      appearancePreset: row.appearancePreset,
      ...(row.color ? { color: row.color } : {}),
    },
    title: row.title,
    ...(row.ownerCaption ? { ownerCaption: row.ownerCaption } : {}),
    template: row.template as AgentMomentTemplate,
    visibility: row.visibility as AgentMomentVisibility,
    status: row.status as AgentMomentStatus,
    ...(row.shareSlug ? { shareSlug: row.shareSlug } : {}),
    ...(dateIso(row.publishedAt)
      ? { publishedAt: dateIso(row.publishedAt) }
      : {}),
    ...(dateIso(row.revokedAt) ? { revokedAt: dateIso(row.revokedAt) } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: itemsByMoment.get(row.id) ?? [],
  }));
}

async function readOwnerMomentRows(
  parentUserId: string,
  where: SQL | undefined,
  limit?: number,
  executor: AgentMomentExecutor = getDatabaseClient().database,
) {
  let query = executor
    .select(ownerMomentSelection())
    .from(agentMoments)
    .innerJoin(agentProfiles, eq(agentProfiles.agentId, agentMoments.agentId))
    .innerJoin(
      agentEnrollments,
      eq(agentEnrollments.id, agentProfiles.enrollmentId),
    )
    .$dynamic();
  query = query.where(
    and(
      eq(agentMoments.ownerId, parentUserId),
      eq(agentProfiles.ownerId, parentUserId),
      eq(agentEnrollments.parentUserId, parentUserId),
      where,
    ),
  );
  query = query.orderBy(desc(agentMoments.createdAt), desc(agentMoments.id));
  if (limit !== undefined) query = query.limit(limit);
  return query;
}

export async function createAgentMomentDraft(
  parentUserId: string,
  input: CreateAgentMomentInput,
): Promise<OwnerAgentMoment> {
  const { database } = getDatabaseClient();
  const momentId = await database.transaction(async (tx) => {
    const access = await resolveOwnerAccess(
      parentUserId,
      input.enrollmentId,
      tx,
    );
    if (!access) {
      throw new AgentMomentError('not_found', 'Agent 入园记录不存在');
    }
    if (!['active', 'suspended', 'archived'].includes(access.enrollmentStatus)) {
      throw new AgentMomentError(
        'invalid_state',
        '当前入园状态不能从活动创建成长瞬间',
      );
    }
    const settings = await readShareSettings(parentUserId, access, tx);
    const eventRows = await tx
      .select({
        id: agentEventLog.id,
        payload: agentEventLog.payload,
      })
      .from(agentEventLog)
      .where(
        and(
          eq(agentEventLog.agentId, access.agentId),
          inArray(agentEventLog.id, input.activityCursors),
        ),
      );
    if (eventRows.length !== input.activityCursors.length) {
      throw new AgentMomentError(
        'not_found',
        '选择的活动不存在或不属于这个 Agent',
      );
    }
    const candidates = eventRows.map((row) => {
      const parsed = parseAgentRuntimeEvent(row.payload);
      if (!parsed.ok) {
        throw new AgentMomentError('not_shareable', '有一项活动不可分享');
      }
      const candidate = mapMomentCandidate(parsed.event, {
        allowReplyExcerpt: settings.allowReplyExcerpt,
      });
      if (!candidate.eligible) {
        throw new AgentMomentError('not_shareable', '有一项活动不可分享');
      }
      return { ...candidate, sourceEventLogId: row.id };
    });
    candidates.sort(
      (left, right) =>
        Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
    );
    const now = new Date();
    const inserted = await tx
      .insert(agentMoments)
      .values({
        ownerId: parentUserId,
        agentId: access.agentId,
        title: `${access.displayName}的成长瞬间`,
        template: input.template,
        visibility: 'private',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: agentMoments.id });
    const id = inserted[0]!.id;
    await tx.insert(agentMomentItems).values(
      candidates.map((candidate, index) => ({
        momentId: id,
        sourceEventLogId: candidate.sourceEventLogId,
        position: index + 1,
        kind: candidate.kind,
        titleSnapshot: candidate.title,
        detailSnapshot: candidate.detail,
        occurredAtSnapshot: new Date(candidate.occurredAt),
      })),
    );
    return id;
  });
  const moment = await getOwnerAgentMoment(parentUserId, momentId);
  if (!moment) {
    throw new AgentMomentError('not_found', '成长瞬间不存在');
  }
  return moment;
}

export async function listOwnerAgentMoments(
  parentUserId: string,
  enrollmentId: string,
  options: { cursor?: OwnerMomentCursor; limit: number },
): Promise<OwnerAgentMomentPage> {
  const access = await resolveOwnerAccess(parentUserId, enrollmentId);
  if (!access) {
    throw new AgentMomentError('not_found', 'Agent 入园记录不存在');
  }
  const cursorWhere = options.cursor
    ? or(
        lt(agentMoments.createdAt, new Date(options.cursor.createdAt)),
        and(
          eq(agentMoments.createdAt, new Date(options.cursor.createdAt)),
          lt(agentMoments.id, options.cursor.id),
        ),
      )
    : undefined;
  const rows = await readOwnerMomentRows(
    parentUserId,
    and(eq(agentMoments.agentId, access.agentId), cursorWhere),
    options.limit + 1,
  );
  const hasMore = rows.length > options.limit;
  const pageRows = rows.slice(0, options.limit);
  return {
    items: await hydrateOwnerMoments(pageRows),
    nextCursor:
      hasMore && pageRows.length > 0
        ? encodeOwnerCursor({
            createdAt: pageRows[pageRows.length - 1]!.createdAt.toISOString(),
            id: pageRows[pageRows.length - 1]!.id,
          })
        : null,
  };
}

export async function getOwnerAgentMoment(
  parentUserId: string,
  momentId: string,
): Promise<OwnerAgentMoment | null> {
  const rows = await readOwnerMomentRows(
    parentUserId,
    eq(agentMoments.id, momentId),
    1,
  );
  return (await hydrateOwnerMoments(rows))[0] ?? null;
}

function assertOwnerText(
  value: string,
  field: string,
  maximum: number,
): string {
  const sanitized = sanitizeMomentText(value, {
    mode: 'owner',
    maximum,
  });
  if (sanitized.status === 'rejected') {
    throw new AgentMomentError(
      'sensitive_content',
      `${field} 可能包含敏感信息，请删减后重试`,
    );
  }
  return sanitized.text;
}

export async function updateAgentMomentDraft(
  parentUserId: string,
  momentId: string,
  patch: PatchAgentMomentInput,
): Promise<OwnerAgentMoment> {
  const current = await getOwnerAgentMoment(parentUserId, momentId);
  if (!current) {
    throw new AgentMomentError('not_found', '成长瞬间不存在');
  }
  if (current.status === 'revoked') {
    throw new AgentMomentError(
      'invalid_state',
      '已下架内容只读，请复制为新草稿后修改',
    );
  }
  const set: {
    title?: string;
    ownerCaption?: string | null;
    template?: AgentMomentTemplate;
    status?: 'draft';
    visibility?: 'private';
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    set.title = assertOwnerText(
      patch.title,
      '标题',
      MAX_AGENT_MOMENT_TITLE_LENGTH,
    );
  }
  if (patch.ownerCaption !== undefined) {
    set.ownerCaption =
      patch.ownerCaption === null
        ? null
        : assertOwnerText(
            patch.ownerCaption,
            '主人评语',
            MAX_AGENT_MOMENT_TEXT_LENGTH,
          );
  }
  if (patch.template !== undefined) set.template = patch.template;
  if (current.status === 'published') {
    set.status = 'draft';
    set.visibility = 'private';
  }
  const { database } = getDatabaseClient();
  const updated = await database
    .update(agentMoments)
    .set(set)
    .where(
      and(
        eq(agentMoments.id, momentId),
        eq(agentMoments.ownerId, parentUserId),
        eq(agentMoments.status, current.status),
      ),
    )
    .returning({ id: agentMoments.id });
  if (updated.length === 0) {
    throw new AgentMomentError('conflict', '成长瞬间状态已经改变');
  }
  return (await getOwnerAgentMoment(parentUserId, momentId))!;
}

function assertPublishableMoment(moment: OwnerAgentMoment): void {
  assertOwnerText(moment.title, '标题', MAX_AGENT_MOMENT_TITLE_LENGTH);
  if (moment.ownerCaption) {
    assertOwnerText(
      moment.ownerCaption,
      '主人评语',
      MAX_AGENT_MOMENT_TEXT_LENGTH,
    );
  }
  if (moment.items.length < 1 || moment.items.length > 2) {
    throw new AgentMomentError('invalid_state', '成长瞬间必须包含 1 到 2 项活动');
  }
  for (const item of moment.items) {
    const title = sanitizeMomentText(item.title, {
      maximum: MAX_AGENT_MOMENT_TITLE_LENGTH,
    });
    const detail = sanitizeMomentText(item.detail, {
      maximum: MAX_AGENT_MOMENT_TEXT_LENGTH,
    });
    if (title.status !== 'accepted' || detail.status !== 'accepted') {
      throw new AgentMomentError(
        'sensitive_content',
        '活动快照未通过发布前安全检查',
      );
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  let candidate = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof candidate !== 'object' || candidate === null) return false;
    if (
      'code' in candidate &&
      (candidate as { code?: unknown }).code === '23505'
    ) {
      return true;
    }
    candidate =
      'cause' in candidate
        ? (candidate as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}

export async function publishAgentMoment(
  parentUserId: string,
  momentId: string,
  visibility: AgentMomentPublishVisibility,
): Promise<OwnerAgentMoment> {
  const { database } = getDatabaseClient();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await database.transaction(async (tx) => {
        const rows = await tx
          .select(ownerMomentSelection())
          .from(agentMoments)
          .innerJoin(
            agentProfiles,
            eq(agentProfiles.agentId, agentMoments.agentId),
          )
          .innerJoin(
            agentEnrollments,
            eq(agentEnrollments.id, agentProfiles.enrollmentId),
          )
          .where(
            and(
              eq(agentMoments.id, momentId),
              eq(agentMoments.ownerId, parentUserId),
              eq(agentProfiles.ownerId, parentUserId),
              eq(agentEnrollments.parentUserId, parentUserId),
            ),
          )
          .limit(1)
          .for('update');
        const row = rows[0];
        if (!row) {
          throw new AgentMomentError('not_found', '成长瞬间不存在');
        }
        if (row.status !== 'draft') {
          throw new AgentMomentError('invalid_state', '只有草稿可以发布');
        }
        const settingsRows = await tx
          .select({
            profileVisibility: agentShareSettings.profileVisibility,
          })
          .from(agentShareSettings)
          .where(
            and(
              eq(agentShareSettings.agentId, row.agentId),
              eq(agentShareSettings.ownerId, parentUserId),
            ),
          )
          .limit(1)
          .for('update');
        if (settingsRows[0]?.profileVisibility !== 'public') {
          throw new AgentMomentError(
            'invalid_state',
            '请先将这个 Agent 的成长册设为公开',
          );
        }
        const hydrated = (await hydrateOwnerMoments([row], tx))[0]!;
        assertPublishableMoment(hydrated);
        const slug =
          row.shareSlug ?? randomBytes(24).toString('base64url');
        const updated = await tx
          .update(agentMoments)
          .set({
            shareSlug: slug,
            status: 'published',
            visibility,
            publishedAt: new Date(),
            revokedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(agentMoments.id, momentId),
              eq(agentMoments.ownerId, parentUserId),
              eq(agentMoments.status, 'draft'),
            ),
          )
          .returning({ id: agentMoments.id });
        if (updated.length === 0) {
          throw new AgentMomentError('conflict', '成长瞬间状态已经改变');
        }
      });
      return (await getOwnerAgentMoment(parentUserId, momentId))!;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (attempt === 2) {
        throw new AgentMomentError(
          'conflict',
          '无法生成唯一分享链接，请重试',
        );
      }
    }
  }
  throw new AgentMomentError('conflict', '无法生成唯一分享链接，请重试');
}

export async function revokeAgentMoment(
  parentUserId: string,
  momentId: string,
): Promise<OwnerAgentMoment> {
  const current = await getOwnerAgentMoment(parentUserId, momentId);
  if (!current) {
    throw new AgentMomentError('not_found', '成长瞬间不存在');
  }
  if (current.status !== 'published') {
    throw new AgentMomentError('invalid_state', '只有已发布内容可以下架');
  }
  const { database } = getDatabaseClient();
  const updated = await database
    .update(agentMoments)
    .set({
      status: 'revoked',
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentMoments.id, momentId),
        eq(agentMoments.ownerId, parentUserId),
        eq(agentMoments.status, 'published'),
      ),
    )
    .returning({ id: agentMoments.id });
  if (updated.length === 0) {
    throw new AgentMomentError('conflict', '成长瞬间状态已经改变');
  }
  return (await getOwnerAgentMoment(parentUserId, momentId))!;
}

export async function duplicateAgentMoment(
  parentUserId: string,
  momentId: string,
): Promise<OwnerAgentMoment> {
  const current = await getOwnerAgentMoment(parentUserId, momentId);
  if (!current) {
    throw new AgentMomentError('not_found', '成长瞬间不存在');
  }
  if (current.status !== 'revoked') {
    throw new AgentMomentError(
      'invalid_state',
      '只有已下架内容可以复制为新草稿',
    );
  }
  const { database } = getDatabaseClient();
  const newId = await database.transaction(async (tx) => {
    const access = await resolveOwnerAccess(
      parentUserId,
      current.enrollmentId,
      tx,
    );
    if (!access) {
      throw new AgentMomentError('not_found', 'Agent 入园记录不存在');
    }
    const inserted = await tx
      .insert(agentMoments)
      .values({
        ownerId: parentUserId,
        agentId: access.agentId,
        title: current.title,
        ownerCaption: current.ownerCaption ?? null,
        template: current.template,
        visibility: 'private',
        status: 'draft',
      })
      .returning({ id: agentMoments.id });
    const id = inserted[0]!.id;
    await tx.insert(agentMomentItems).values(
      current.items.map((item) => ({
        momentId: id,
        sourceEventLogId:
          item.sourceCursor === null ? null : Number(item.sourceCursor),
        position: item.position,
        kind: item.kind,
        titleSnapshot: item.title,
        detailSnapshot: item.detail,
        occurredAtSnapshot: new Date(item.occurredAt),
      })),
    );
    return id;
  });
  return (await getOwnerAgentMoment(parentUserId, newId))!;
}
