import {
  AGENT_APPEARANCE_PRESETS,
  AGENT_CHARACTER_VARIANTS,
} from './agent-registry-contract';

export const PROVIDER_BINDING_SCHEMA_VERSION = 1 as const;
export const AGENT_PROVIDERS = ['openclaw'] as const;
export const PROVIDER_BINDING_STATUSES = [
  'pending_claim',
  'active',
  'revoked',
] as const;

export type AgentProvider = (typeof AGENT_PROVIDERS)[number];
export type ProviderBindingStatus =
  (typeof PROVIDER_BINDING_STATUSES)[number];

export interface ProviderAgentDraft {
  displayName?: string;
  role?: string;
  personalitySummary?: string;
  capabilities?: string[];
  characterVariant?: (typeof AGENT_CHARACTER_VARIANTS)[number];
  appearancePreset?: (typeof AGENT_APPEARANCE_PRESETS)[number];
  color?: string;
}

export interface ProviderAgentDiscoveryInput {
  schemaVersion: typeof PROVIDER_BINDING_SCHEMA_VERSION;
  provider: AgentProvider;
  nativeAgentId: string;
  runtimeInstanceId?: string;
  adapterVersion?: string;
  profileDraft?: ProviderAgentDraft;
}

export interface ProviderAgentBindingView {
  bindingId: string;
  provider: AgentProvider;
  nativeAgentId: string;
  runtimeInstanceId?: string;
  adapterVersion?: string;
  status: ProviderBindingStatus;
  resolution: 'active' | 'pending_binding' | 'revoked_binding';
  agentId?: string;
  lastSeenAt: string;
}

export type ProviderAgentDiscoveryParseResult =
  | { ok: true; discovery: ProviderAgentDiscoveryInput }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(
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

function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined) return { ok: true };
  return requiredString(value, field, maxLength);
}

export function parseProviderAgentDraft(
  value: unknown,
): { ok: true; draft?: ProviderAgentDraft } | { ok: false; error: string } {
  if (value === undefined) return { ok: true };
  if (!isRecord(value)) {
    return { ok: false, error: 'profileDraft 必须是对象' };
  }
  const allowedKeys = new Set([
    'displayName',
    'role',
    'personalitySummary',
    'capabilities',
    'characterVariant',
    'appearancePreset',
    'color',
  ]);
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknownKey) {
    return { ok: false, error: `profileDraft 不允许字段：${unknownKey}` };
  }
  const displayName = optionalString(value.displayName, 'displayName', 48);
  if (!displayName.ok) return displayName;
  const role = optionalString(value.role, 'role', 80);
  if (!role.ok) return role;
  const personalitySummary = optionalString(
    value.personalitySummary,
    'personalitySummary',
    240,
  );
  if (!personalitySummary.ok) return personalitySummary;
  let capabilities: string[] | undefined;
  if (value.capabilities !== undefined) {
    if (!Array.isArray(value.capabilities) || value.capabilities.length > 20) {
      return { ok: false, error: 'capabilities 必须是不超过 20 项的数组' };
    }
    capabilities = [];
    for (const item of value.capabilities) {
      const capability = requiredString(item, 'capability', 40);
      if (!capability.ok) return capability;
      if (!capabilities.includes(capability.value)) {
        capabilities.push(capability.value);
      }
    }
  }
  if (
    value.characterVariant !== undefined &&
    !AGENT_CHARACTER_VARIANTS.includes(
      value.characterVariant as (typeof AGENT_CHARACTER_VARIANTS)[number],
    )
  ) {
    return { ok: false, error: 'characterVariant 不受支持' };
  }
  if (
    value.appearancePreset !== undefined &&
    !AGENT_APPEARANCE_PRESETS.includes(
      value.appearancePreset as (typeof AGENT_APPEARANCE_PRESETS)[number],
    )
  ) {
    return { ok: false, error: 'appearancePreset 不受支持' };
  }
  const color = optionalString(value.color, 'color', 7);
  if (!color.ok) return color;
  if (color.value !== undefined && !/^#[0-9a-fA-F]{6}$/.test(color.value)) {
    return { ok: false, error: 'color 必须是 #RRGGBB 格式' };
  }
  const draft: ProviderAgentDraft = {
    ...(displayName.value === undefined
      ? {}
      : { displayName: displayName.value }),
    ...(role.value === undefined ? {} : { role: role.value }),
    ...(personalitySummary.value === undefined
      ? {}
      : { personalitySummary: personalitySummary.value }),
    ...(capabilities === undefined ? {} : { capabilities }),
    ...(value.characterVariant === undefined
      ? {}
      : {
          characterVariant:
            value.characterVariant as ProviderAgentDraft['characterVariant'],
        }),
    ...(value.appearancePreset === undefined
      ? {}
      : {
          appearancePreset:
            value.appearancePreset as ProviderAgentDraft['appearancePreset'],
        }),
    ...(color.value === undefined
      ? {}
      : { color: color.value.toLowerCase() }),
  };
  return { ok: true, draft };
}

export function parseProviderAgentDiscovery(
  input: unknown,
): ProviderAgentDiscoveryParseResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'provider discovery 必须是对象' };
  }
  const allowedKeys = new Set([
    'schemaVersion',
    'provider',
    'nativeAgentId',
    'runtimeInstanceId',
    'adapterVersion',
    'profileDraft',
  ]);
  const unknownKey = Object.keys(input).find((key) => !allowedKeys.has(key));
  if (unknownKey) {
    return { ok: false, error: `provider discovery 不允许字段：${unknownKey}` };
  }
  if (input.schemaVersion !== PROVIDER_BINDING_SCHEMA_VERSION) {
    return { ok: false, error: '不支持的 provider binding 契约版本' };
  }
  if (!AGENT_PROVIDERS.includes(input.provider as AgentProvider)) {
    return { ok: false, error: 'provider 不受支持' };
  }
  const nativeAgentId = requiredString(
    input.nativeAgentId,
    'nativeAgentId',
    128,
  );
  if (!nativeAgentId.ok) return nativeAgentId;
  const runtimeInstanceId = optionalString(
    input.runtimeInstanceId,
    'runtimeInstanceId',
    128,
  );
  if (!runtimeInstanceId.ok) return runtimeInstanceId;
  const adapterVersion = optionalString(
    input.adapterVersion,
    'adapterVersion',
    64,
  );
  if (!adapterVersion.ok) return adapterVersion;
  const profileDraft = parseProviderAgentDraft(input.profileDraft);
  if (!profileDraft.ok) return profileDraft;
  return {
    ok: true,
    discovery: {
      schemaVersion: PROVIDER_BINDING_SCHEMA_VERSION,
      provider: input.provider as AgentProvider,
      nativeAgentId: nativeAgentId.value,
      ...(runtimeInstanceId.value === undefined
        ? {}
        : { runtimeInstanceId: runtimeInstanceId.value }),
      ...(adapterVersion.value === undefined
        ? {}
        : { adapterVersion: adapterVersion.value }),
      ...(profileDraft.draft === undefined
        ? {}
        : { profileDraft: profileDraft.draft }),
    },
  };
}
