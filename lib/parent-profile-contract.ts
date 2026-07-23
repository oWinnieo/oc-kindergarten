export interface ParentProfilePatch {
  displayName?: string;
  avatarUrl?: string | null;
  timezone?: string | null;
  language?: string | null;
}

export type ParentProfilePatchParseResult =
  | { ok: true; patch: ParentProfilePatch }
  | { ok: false; error: string };

const ALLOWED_FIELDS = new Set([
  'displayName',
  'avatarUrl',
  'timezone',
  'language',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value?: string | null } | { ok: false; error: string } {
  if (value === undefined) return { ok: true };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') {
    return { ok: false, error: `${field} 必须是字符串或 null` };
  }
  const normalized = value.trim();
  if (normalized.length === 0) return { ok: true, value: null };
  if (normalized.length > maxLength) {
    return { ok: false, error: `${field} 不能超过 ${maxLength} 个字符` };
  }
  return { ok: true, value: normalized };
}

export function parseParentProfilePatch(
  input: unknown,
): ParentProfilePatchParseResult {
  if (!isRecord(input)) {
    return { ok: false, error: '主人资料必须是对象' };
  }
  const unknownField = Object.keys(input).find(
    (field) => !ALLOWED_FIELDS.has(field),
  );
  if (unknownField) {
    return { ok: false, error: `主人资料不允许字段：${unknownField}` };
  }

  const patch: ParentProfilePatch = {};
  if (input.displayName !== undefined) {
    if (typeof input.displayName !== 'string' || input.displayName.trim() === '') {
      return { ok: false, error: 'displayName 不能为空' };
    }
    const displayName = input.displayName.trim();
    if (displayName.length > 48) {
      return { ok: false, error: 'displayName 不能超过 48 个字符' };
    }
    patch.displayName = displayName;
  }

  const avatarUrl = optionalText(input.avatarUrl, 'avatarUrl', 2048);
  if (!avatarUrl.ok) return avatarUrl;
  if (avatarUrl.value !== undefined && avatarUrl.value !== null) {
    try {
      const url = new URL(avatarUrl.value);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username !== '' ||
        url.password !== ''
      ) {
        return { ok: false, error: 'avatarUrl 必须是无凭据的 HTTP(S) URL' };
      }
    } catch {
      return { ok: false, error: 'avatarUrl 必须是有效 URL' };
    }
  }
  if (avatarUrl.value !== undefined) patch.avatarUrl = avatarUrl.value;

  const timezone = optionalText(input.timezone, 'timezone', 64);
  if (!timezone.ok) return timezone;
  if (timezone.value !== undefined && timezone.value !== null) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone.value }).format();
    } catch {
      return { ok: false, error: 'timezone 必须是有效的 IANA 时区' };
    }
  }
  if (timezone.value !== undefined) patch.timezone = timezone.value;

  const language = optionalText(input.language, 'language', 35);
  if (!language.ok) return language;
  if (
    language.value !== undefined &&
    language.value !== null &&
    !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language.value)
  ) {
    return { ok: false, error: 'language 必须是有效的语言标签' };
  }
  if (language.value !== undefined) patch.language = language.value;

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: '至少提供一个可修改字段' };
  }
  return { ok: true, patch };
}
