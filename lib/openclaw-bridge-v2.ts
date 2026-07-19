import {
  OpenClawBridgeEvent,
  parseOpenClawBridgeEvent,
} from './openclaw-agent-adapter';
import {
  ProviderAgentDiscoveryInput,
  parseProviderAgentDiscovery,
} from './provider-binding-contract';

export const OPENCLAW_BRIDGE_V2_VERSION = 2 as const;

export interface ParsedOpenClawBridgeV2 {
  discovery: ProviderAgentDiscoveryInput;
  bind(classroomAgentId: string): OpenClawBridgeEvent;
}

export type OpenClawBridgeV2ParseResult =
  | { ok: true; bridge: ParsedOpenClawBridgeV2 }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isOpenClawBridgeV2(input: unknown): boolean {
  return isRecord(input) && input.bridgeVersion === OPENCLAW_BRIDGE_V2_VERSION;
}

export function parseOpenClawBridgeV2(
  input: unknown,
): OpenClawBridgeV2ParseResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'OpenClaw bridge v2 事件必须是对象' };
  }
  if (input.bridgeVersion !== OPENCLAW_BRIDGE_V2_VERSION) {
    return { ok: false, error: '不支持的 OpenClaw bridge v2 版本' };
  }
  const discovery = parseProviderAgentDiscovery({
    schemaVersion: 1,
    provider: input.provider,
    nativeAgentId: input.nativeAgentId,
    runtimeInstanceId: input.runtimeInstanceId,
    adapterVersion: input.adapterVersion,
    profileDraft: input.profileDraft,
  });
  if (!discovery.ok) return discovery;

  const v1Candidate = parseOpenClawBridgeEvent({
    ...input,
    bridgeVersion: 1,
    classroomAgentId: '__binding_resolution__',
    nativeAgentId: discovery.discovery.nativeAgentId,
    runtimeInstanceId: discovery.discovery.runtimeInstanceId,
    adapterVersion: discovery.discovery.adapterVersion,
  });
  if (!v1Candidate.ok) return v1Candidate;
  const candidate = v1Candidate.event;
  return {
    ok: true,
    bridge: {
      discovery: discovery.discovery,
      bind(classroomAgentId) {
        return { ...candidate, classroomAgentId };
      },
    },
  };
}
