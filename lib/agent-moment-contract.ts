export const AGENT_MOMENT_SCHEMA_VERSION = 1 as const;

export const AGENT_SHARE_PROFILE_VISIBILITIES = [
  'private',
  'public',
] as const;
export const AGENT_MOMENT_VISIBILITIES = [
  'private',
  'unlisted',
  'public',
] as const;
export const AGENT_MOMENT_PUBLISH_VISIBILITIES = [
  'unlisted',
  'public',
] as const;
export const AGENT_MOMENT_STATUSES = [
  'draft',
  'published',
  'revoked',
] as const;
export const AGENT_MOMENT_TEMPLATES = [
  'daily',
  'quote',
  'progress',
  'achievement',
  'recovery',
] as const;
export const AGENT_MOMENT_KINDS = [
  'task',
  'command',
  'completion',
  'error',
  'reply',
] as const;

export const MAX_AGENT_MOMENT_ITEMS = 2;
export const MAX_AGENT_MOMENT_TITLE_LENGTH = 80;
export const MAX_AGENT_MOMENT_TEXT_LENGTH = 280;

export type AgentShareProfileVisibility =
  (typeof AGENT_SHARE_PROFILE_VISIBILITIES)[number];
export type AgentMomentVisibility =
  (typeof AGENT_MOMENT_VISIBILITIES)[number];
export type AgentMomentPublishVisibility =
  (typeof AGENT_MOMENT_PUBLISH_VISIBILITIES)[number];
export type AgentMomentStatus = (typeof AGENT_MOMENT_STATUSES)[number];
export type AgentMomentTemplate = (typeof AGENT_MOMENT_TEMPLATES)[number];
export type AgentMomentKind = (typeof AGENT_MOMENT_KINDS)[number];

export interface AgentShareSettingsPatch {
  profileVisibility?: AgentShareProfileVisibility;
  allowReplyExcerpt?: boolean;
}

export interface CreateAgentMomentInput {
  schemaVersion: typeof AGENT_MOMENT_SCHEMA_VERSION;
  enrollmentId: string;
  activityCursors: number[];
  template: AgentMomentTemplate;
}

export interface PatchAgentMomentInput {
  title?: string;
  ownerCaption?: string | null;
  template?: AgentMomentTemplate;
}

export interface PublishAgentMomentInput {
  visibility: AgentMomentPublishVisibility;
}

export interface PublicAgentMomentItem {
  position: 1 | 2;
  kind: AgentMomentKind;
  title: string;
  detail: string;
  occurredAt: string;
}

export interface PublicAgentMoment {
  schemaVersion: typeof AGENT_MOMENT_SCHEMA_VERSION;
  shareSlug: string;
  agent: {
    displayName: string;
    characterVariant: string;
    appearancePreset: string;
    color?: string;
  };
  title: string;
  ownerCaption?: string;
  template: AgentMomentTemplate;
  visibility: AgentMomentPublishVisibility;
  publishedAt: string;
  items: PublicAgentMomentItem[];
}

export interface PublicAgentMomentCursor {
  publishedAt: string;
  id: string;
}

export type AgentMomentParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): AgentMomentParseResult<true> {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(input).find((key) => !allowedKeys.has(key));
  return unknown
    ? { ok: false, error: `${label} 不允许字段：${unknown}` }
    : { ok: true, value: true };
}

function includesValue<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function normalizedText(
  value: unknown,
  field: string,
  maximum: number,
  nullable = false,
): AgentMomentParseResult<string | null> {
  if (nullable && value === null) return { ok: true, value: null };
  if (typeof value !== 'string') {
    return {
      ok: false,
      error: `${field} 必须是字符串${nullable ? '或 null' : ''}`,
    };
  }
  const text = value.trim();
  if (text.length === 0) {
    return nullable
      ? { ok: true, value: null }
      : { ok: false, error: `${field} 不能为空` };
  }
  if (Array.from(text).length > maximum) {
    return { ok: false, error: `${field} 不能超过 ${maximum} 个字符` };
  }
  return { ok: true, value: text };
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function parseActivityCursor(value: unknown): number | null {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  ) {
    return null;
  }
  return Number(value);
}

export function parseAgentShareSettingsPatch(
  input: unknown,
): AgentMomentParseResult<AgentShareSettingsPatch> {
  if (!isRecord(input)) {
    return { ok: false, error: '成长册设置必须是对象' };
  }
  const keys = hasOnlyKeys(
    input,
    ['profileVisibility', 'allowReplyExcerpt'],
    '成长册设置',
  );
  if (!keys.ok) return keys;
  const patch: AgentShareSettingsPatch = {};
  if (input.profileVisibility !== undefined) {
    if (
      !includesValue(
        AGENT_SHARE_PROFILE_VISIBILITIES,
        input.profileVisibility,
      )
    ) {
      return { ok: false, error: 'profileVisibility 不受支持' };
    }
    patch.profileVisibility = input.profileVisibility;
  }
  if (input.allowReplyExcerpt !== undefined) {
    if (typeof input.allowReplyExcerpt !== 'boolean') {
      return { ok: false, error: 'allowReplyExcerpt 必须是布尔值' };
    }
    patch.allowReplyExcerpt = input.allowReplyExcerpt;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: '至少提供一个成长册设置' };
  }
  return { ok: true, value: patch };
}

export function parseCreateAgentMoment(
  input: unknown,
): AgentMomentParseResult<CreateAgentMomentInput> {
  if (!isRecord(input)) {
    return { ok: false, error: '成长瞬间草稿必须是对象' };
  }
  const keys = hasOnlyKeys(
    input,
    ['schemaVersion', 'enrollmentId', 'activityCursors', 'template'],
    '成长瞬间草稿',
  );
  if (!keys.ok) return keys;
  if (input.schemaVersion !== AGENT_MOMENT_SCHEMA_VERSION) {
    return { ok: false, error: '不支持的成长瞬间契约版本' };
  }
  if (!isUuid(input.enrollmentId)) {
    return { ok: false, error: 'enrollmentId 格式无效' };
  }
  if (
    !Array.isArray(input.activityCursors) ||
    input.activityCursors.length < 1 ||
    input.activityCursors.length > MAX_AGENT_MOMENT_ITEMS
  ) {
    return { ok: false, error: 'activityCursors 必须包含 1 到 2 项' };
  }
  const activityCursors = input.activityCursors.map(parseActivityCursor);
  if (activityCursors.some((cursor) => cursor === null)) {
    return { ok: false, error: 'activityCursors 必须是安全的正整数游标' };
  }
  const cursors = activityCursors as number[];
  if (new Set(cursors).size !== cursors.length) {
    return { ok: false, error: 'activityCursors 不能重复' };
  }
  if (!includesValue(AGENT_MOMENT_TEMPLATES, input.template)) {
    return { ok: false, error: 'template 不受支持' };
  }
  return {
    ok: true,
    value: {
      schemaVersion: AGENT_MOMENT_SCHEMA_VERSION,
      enrollmentId: input.enrollmentId,
      activityCursors: cursors,
      template: input.template,
    },
  };
}

export function parsePatchAgentMoment(
  input: unknown,
): AgentMomentParseResult<PatchAgentMomentInput> {
  if (!isRecord(input)) {
    return { ok: false, error: '成长瞬间修改必须是对象' };
  }
  const keys = hasOnlyKeys(
    input,
    ['title', 'ownerCaption', 'template'],
    '成长瞬间修改',
  );
  if (!keys.ok) return keys;
  const patch: PatchAgentMomentInput = {};
  if (input.title !== undefined) {
    const title = normalizedText(
      input.title,
      'title',
      MAX_AGENT_MOMENT_TITLE_LENGTH,
    );
    if (!title.ok) return title;
    patch.title = title.value as string;
  }
  if (input.ownerCaption !== undefined) {
    const caption = normalizedText(
      input.ownerCaption,
      'ownerCaption',
      MAX_AGENT_MOMENT_TEXT_LENGTH,
      true,
    );
    if (!caption.ok) return caption;
    patch.ownerCaption = caption.value;
  }
  if (input.template !== undefined) {
    if (!includesValue(AGENT_MOMENT_TEMPLATES, input.template)) {
      return { ok: false, error: 'template 不受支持' };
    }
    patch.template = input.template;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: '至少提供一个成长瞬间修改字段' };
  }
  return { ok: true, value: patch };
}

export function parsePublishAgentMoment(
  input: unknown,
): AgentMomentParseResult<PublishAgentMomentInput> {
  if (!isRecord(input)) {
    return { ok: false, error: '发布设置必须是对象' };
  }
  const keys = hasOnlyKeys(input, ['visibility'], '发布设置');
  if (!keys.ok) return keys;
  if (
    !includesValue(AGENT_MOMENT_PUBLISH_VISIBILITIES, input.visibility)
  ) {
    return { ok: false, error: 'visibility 只能是 unlisted 或 public' };
  }
  return { ok: true, value: { visibility: input.visibility } };
}

const BANNED_PUBLIC_KEYS = new Set([
  'ownerid',
  'agentid',
  'momentid',
  'eventid',
  'cursor',
  'source',
  'provider',
  'nativeagentid',
  'runtimeinstanceid',
  'sessionid',
  'requestid',
  'metadata',
  'payload',
]);

export function publicMomentContainsBannedField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(publicMomentContainsBannedField);
  }
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      BANNED_PUBLIC_KEYS.has(key.replace(/[_-]/g, '').toLowerCase()) ||
      publicMomentContainsBannedField(child),
  );
}

export function encodePublicAgentMomentCursor(
  cursor: PublicAgentMomentCursor,
): string {
  if (
    Number.isNaN(Date.parse(cursor.publishedAt)) ||
    !isUuid(cursor.id)
  ) {
    throw new Error('公开成长瞬间 cursor 无效');
  }
  return Buffer.from(
    JSON.stringify({ p: cursor.publishedAt, i: cursor.id }),
    'utf8',
  ).toString('base64url');
}

export function parsePublicAgentMomentCursor(
  value: unknown,
): AgentMomentParseResult<PublicAgentMomentCursor> {
  if (
    typeof value !== 'string' ||
    value.length < 16 ||
    value.length > 256 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return { ok: false, error: 'cursor 格式无效' };
  }
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (!isRecord(decoded)) {
      return { ok: false, error: 'cursor 格式无效' };
    }
    const keys = hasOnlyKeys(decoded, ['p', 'i'], 'cursor');
    if (
      !keys.ok ||
      typeof decoded.p !== 'string' ||
      Number.isNaN(Date.parse(decoded.p)) ||
      !isUuid(decoded.i)
    ) {
      return { ok: false, error: 'cursor 格式无效' };
    }
    return {
      ok: true,
      value: {
        publishedAt: new Date(decoded.p).toISOString(),
        id: decoded.i,
      },
    };
  } catch {
    return { ok: false, error: 'cursor 格式无效' };
  }
}
