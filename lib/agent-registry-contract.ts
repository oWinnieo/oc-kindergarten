export const AGENT_REGISTRY_SCHEMA_VERSION = 1 as const;

export const AGENT_CHARACTER_VARIANTS = [
  'boy',
  'girl',
  'genderless',
] as const;

export const AGENT_APPEARANCE_PRESETS = [
  'classic',
  'meadow',
  'berry',
] as const;
export const DEFAULT_AGENT_APPEARANCE_PRESET = 'classic' as const;

export const AGENT_REGISTRATION_ACTORS = ['owner', 'agent', 'system'] as const;

export type AgentCharacterVariant = (typeof AGENT_CHARACTER_VARIANTS)[number];
export type AgentAppearancePreset = (typeof AGENT_APPEARANCE_PRESETS)[number];
export type AgentRegistrationActor = (typeof AGENT_REGISTRATION_ACTORS)[number];

export interface AgentProfileInput {
  schemaVersion: typeof AGENT_REGISTRY_SCHEMA_VERSION;
  agentId: string;
  displayName: string;
  characterVariant: AgentCharacterVariant;
  appearancePreset?: AgentAppearancePreset;
  registeredBy: AgentRegistrationActor;
  ownerId?: string;
  role?: string;
  color?: string;
}

export interface AgentProfile extends Omit<AgentProfileInput, 'appearancePreset'> {
  appearancePreset: AgentAppearancePreset;
  revision: number;
  updatedAt: string;
}

export type AgentProfileParseResult =
  | { ok: true; profile: AgentProfileInput }
  | { ok: false; error: string };

export type StoredAgentProfileParseResult =
  | { ok: true; profile: AgentProfile }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedRequiredString(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, error: `${field} 不能为空` };
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return { ok: false, error: `${field} 不能超过 ${maxLength} 个字符` };
  }
  return { ok: true, value: normalized };
}

function normalizedOptionalString(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined) return { ok: true };
  const normalized = normalizedRequiredString(value, field, maxLength);
  return normalized.ok ? normalized : normalized;
}

function includesValue<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

export function parseAgentProfileInput(input: unknown): AgentProfileParseResult {
  if (!isRecord(input)) return { ok: false, error: 'Agent profile 必须是对象' };
  if (input.schemaVersion !== AGENT_REGISTRY_SCHEMA_VERSION) {
    return { ok: false, error: '不支持的 Agent Registry 契约版本' };
  }

  const agentId = normalizedRequiredString(input.agentId, 'agentId', 128);
  if (!agentId.ok) return agentId;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(agentId.value)) {
    return { ok: false, error: 'agentId 只能包含字母、数字、点、下划线、冒号和连字符' };
  }

  const displayName = normalizedRequiredString(
    input.displayName,
    'displayName',
    48,
  );
  if (!displayName.ok) return displayName;
  if (!includesValue(AGENT_CHARACTER_VARIANTS, input.characterVariant)) {
    return { ok: false, error: 'characterVariant 不受支持' };
  }
  if (
    input.appearancePreset !== undefined &&
    !includesValue(AGENT_APPEARANCE_PRESETS, input.appearancePreset)
  ) {
    return { ok: false, error: 'appearancePreset 不受支持' };
  }
  if (!includesValue(AGENT_REGISTRATION_ACTORS, input.registeredBy)) {
    return { ok: false, error: 'registeredBy 不受支持' };
  }

  const ownerId = normalizedOptionalString(input.ownerId, 'ownerId', 128);
  if (!ownerId.ok) return ownerId;
  if (input.registeredBy === 'owner' && ownerId.value === undefined) {
    return { ok: false, error: '主人注册时 ownerId 不能为空' };
  }
  const role = normalizedOptionalString(input.role, 'role', 80);
  if (!role.ok) return role;
  const color = normalizedOptionalString(input.color, 'color', 7);
  if (!color.ok) return color;
  if (color.value !== undefined && !/^#[0-9a-fA-F]{6}$/.test(color.value)) {
    return { ok: false, error: 'color 必须是 #RRGGBB 格式' };
  }

  return {
    ok: true,
    profile: {
      schemaVersion: AGENT_REGISTRY_SCHEMA_VERSION,
      agentId: agentId.value,
      displayName: displayName.value,
      characterVariant: input.characterVariant,
      appearancePreset:
        input.appearancePreset ?? DEFAULT_AGENT_APPEARANCE_PRESET,
      registeredBy: input.registeredBy,
      ...(ownerId.value === undefined ? {} : { ownerId: ownerId.value }),
      ...(role.value === undefined ? {} : { role: role.value }),
      ...(color.value === undefined
        ? {}
        : { color: color.value.toLowerCase() }),
    },
  };
}

export function parseAgentProfile(input: unknown): StoredAgentProfileParseResult {
  const parsed = parseAgentProfileInput(input);
  if (!parsed.ok) return parsed;
  if (!isRecord(input)) return { ok: false, error: 'Agent profile 必须是对象' };
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 1) {
    return { ok: false, error: 'revision 必须是大于 0 的安全整数' };
  }
  if (
    typeof input.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(input.updatedAt))
  ) {
    return { ok: false, error: 'updatedAt 必须是有效的 ISO 时间' };
  }
  return {
    ok: true,
    profile: {
      ...parsed.profile,
      appearancePreset:
        parsed.profile.appearancePreset ?? DEFAULT_AGENT_APPEARANCE_PRESET,
      revision: Number(input.revision),
      updatedAt: input.updatedAt,
    },
  };
}
