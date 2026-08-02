import type { RuntimeIdentity } from './provider-binding-contract';
import { parseProviderAgentDiscovery } from './provider-binding-contract';

export const HERMES_BRIDGE_VERSION = 1 as const;
export const HERMES_BRIDGE_HOOKS = [
  'on_session_start',
  'pre_llm_call',
  'pre_tool_call',
  'post_tool_call',
  'post_llm_call',
  'on_session_end',
  'on_session_finalize',
  'on_session_reset',
] as const;

export type HermesBridgeHook = (typeof HERMES_BRIDGE_HOOKS)[number];

export interface HermesBridgeData {
  isFirstTurn?: boolean;
  toolName?: string;
  durationMs?: number;
  success?: boolean;
  completed?: boolean;
  interrupted?: boolean;
  failureCode?: 'tool_failed' | 'turn_failed';
  messageContent?: string;
  reason?: 'new_session';
}

export interface HermesBridgeEvent extends RuntimeIdentity {
  bridgeVersion: typeof HERMES_BRIDGE_VERSION;
  kind: 'hermes.hook';
  bridgeEventId: string;
  adapterVersion: string;
  hook: HermesBridgeHook;
  observedAt: string;
  data: HermesBridgeData;
}

export type HermesBridgeParseResult =
  | { ok: true; event: HermesBridgeEvent }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false as const, error: `${field} 不能为空` };
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return {
      ok: false as const,
      error: `${field} 不能超过 ${maxLength} 个字符`,
    };
  }
  return { ok: true as const, value: normalized };
}

const DATA_KEYS_BY_HOOK: Record<HermesBridgeHook, readonly string[]> = {
  on_session_start: ['isFirstTurn'],
  pre_llm_call: [],
  pre_tool_call: ['toolName'],
  post_tool_call: [
    'toolName',
    'durationMs',
    'success',
    'completed',
    'interrupted',
    'failureCode',
  ],
  post_llm_call: ['messageContent'],
  on_session_end: ['completed', 'interrupted', 'failureCode'],
  on_session_finalize: ['reason'],
  on_session_reset: ['reason'],
};

function parseData(
  hook: HermesBridgeHook,
  value: unknown,
): { ok: true; data: HermesBridgeData } | { ok: false; error: string } {
  if (value === undefined) value = {};
  if (!isRecord(value)) return { ok: false, error: 'data 必须是对象' };
  const allowedKeys = new Set(DATA_KEYS_BY_HOOK[hook]);
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknownKey) {
    return { ok: false, error: `${hook}.data 不允许字段：${unknownKey}` };
  }
  for (const field of [
    'isFirstTurn',
    'success',
    'completed',
    'interrupted',
  ]) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      return { ok: false, error: `${field} 必须是布尔值` };
    }
  }
  if (
    value.durationMs !== undefined &&
    (!Number.isSafeInteger(value.durationMs) || Number(value.durationMs) < 0)
  ) {
    return { ok: false, error: 'durationMs 必须是非负安全整数' };
  }
  if (
    value.failureCode !== undefined &&
    value.failureCode !== 'tool_failed' &&
    value.failureCode !== 'turn_failed'
  ) {
    return { ok: false, error: 'failureCode 不受支持' };
  }
  if (value.reason !== undefined && value.reason !== 'new_session') {
    return { ok: false, error: 'reason 不受支持' };
  }
  if (value.toolName !== undefined) {
    const toolName = nonEmptyString(value.toolName, 'toolName', 128);
    if (!toolName.ok) return toolName;
  }
  if (hook === 'pre_tool_call' || hook === 'post_tool_call') {
    const toolName = nonEmptyString(value.toolName, 'toolName', 128);
    if (!toolName.ok) return toolName;
  }
  if (
    hook === 'post_tool_call' &&
    (typeof value.success !== 'boolean' ||
      typeof value.completed !== 'boolean' ||
      typeof value.interrupted !== 'boolean')
  ) {
    return {
      ok: false,
      error: 'post_tool_call 必须包含 success/completed/interrupted',
    };
  }
  if (
    hook === 'on_session_end' &&
    (typeof value.completed !== 'boolean' ||
      typeof value.interrupted !== 'boolean')
  ) {
    return {
      ok: false,
      error: 'on_session_end 必须包含 completed/interrupted',
    };
  }
  if (value.messageContent !== undefined) {
    const message = nonEmptyString(value.messageContent, 'messageContent', 4000);
    if (!message.ok) return message;
  }
  return { ok: true, data: value as HermesBridgeData };
}

export function parseHermesBridgeV1(input: unknown): HermesBridgeParseResult {
  if (!isRecord(input)) return { ok: false, error: 'Hermes 事件必须是对象' };
  const allowedKeys = new Set([
    'bridgeVersion',
    'kind',
    'bridgeEventId',
    'provider',
    'runtimeInstanceId',
    'nativeAgentId',
    'adapterVersion',
    'hook',
    'observedAt',
    'data',
  ]);
  const unknownKey = Object.keys(input).find((key) => !allowedKeys.has(key));
  if (unknownKey) {
    return { ok: false, error: `Hermes 事件不允许字段：${unknownKey}` };
  }
  if (input.bridgeVersion !== HERMES_BRIDGE_VERSION) {
    return { ok: false, error: '不支持的 Hermes bridgeVersion' };
  }
  if (input.kind !== 'hermes.hook' || input.provider !== 'hermes') {
    return { ok: false, error: 'Hermes 事件 kind/provider 不受支持' };
  }
  const bridgeEventId = nonEmptyString(
    input.bridgeEventId,
    'bridgeEventId',
    200,
  );
  if (!bridgeEventId.ok) return bridgeEventId;
  const adapterVersion = nonEmptyString(
    input.adapterVersion,
    'adapterVersion',
    64,
  );
  if (!adapterVersion.ok) return adapterVersion;
  if (
    typeof input.hook !== 'string' ||
    !HERMES_BRIDGE_HOOKS.includes(input.hook as HermesBridgeHook)
  ) {
    return { ok: false, error: 'Hermes hook 不受支持' };
  }
  if (
    typeof input.observedAt !== 'string' ||
    input.observedAt.trim().length === 0 ||
    Number.isNaN(Date.parse(input.observedAt))
  ) {
    return { ok: false, error: 'observedAt 必须是有效时间' };
  }
  const discovery = parseProviderAgentDiscovery({
    schemaVersion: 1,
    provider: input.provider,
    runtimeInstanceId: input.runtimeInstanceId,
    nativeAgentId: input.nativeAgentId,
    adapterVersion: adapterVersion.value,
  });
  if (!discovery.ok) return discovery;
  const data = parseData(input.hook as HermesBridgeHook, input.data);
  if (!data.ok) return data;
  return {
    ok: true,
    event: {
      bridgeVersion: HERMES_BRIDGE_VERSION,
      kind: 'hermes.hook',
      bridgeEventId: bridgeEventId.value,
      provider: 'hermes',
      runtimeInstanceId: discovery.discovery.runtimeInstanceId,
      nativeAgentId: discovery.discovery.nativeAgentId,
      adapterVersion: adapterVersion.value,
      hook: input.hook as HermesBridgeHook,
      observedAt: new Date(input.observedAt).toISOString(),
      data: data.data,
    },
  };
}
