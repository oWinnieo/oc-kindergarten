import { createHash, randomBytes } from 'node:crypto';

import type { AgentCharacterVariant } from './agent-registry-contract';
import {
  parseProviderAgentDiscovery,
  parseProviderAgentDraft,
} from './provider-binding-contract';
import type {
  AgentProvider,
  ProviderAgentDiscoveryInput,
  ProviderAgentDraft,
} from './provider-binding-contract';

export const AGENT_ENROLLMENT_SCHEMA_VERSION = 1 as const;
export const AGENT_ENROLLMENT_STATUSES = [
  'draft',
  'awaiting_pairing',
  'pending_parent_confirmation',
  'active',
  'suspended',
  'archived',
] as const;

export type AgentEnrollmentStatus =
  (typeof AGENT_ENROLLMENT_STATUSES)[number];

export type AgentEnrollmentLifecycleAction =
  | 'suspend'
  | 'resume'
  | 'archive';

export function nextAgentEnrollmentStatus(
  status: AgentEnrollmentStatus,
  action: AgentEnrollmentLifecycleAction,
): AgentEnrollmentStatus | null {
  if (action === 'suspend') return status === 'active' ? 'suspended' : null;
  if (action === 'resume') return status === 'suspended' ? 'active' : null;
  return status === 'archived' ? null : 'archived';
}

export function canParentArchiveEnrollment(
  status: AgentEnrollmentStatus,
): boolean {
  return (
    status === 'draft' ||
    status === 'awaiting_pairing' ||
    status === 'pending_parent_confirmation'
  );
}

export interface EnrolledAgentSummary extends ProviderAgentDraft {
  agentId: string;
  displayName: string;
  characterVariant: AgentCharacterVariant;
  revision: number;
  updatedAt: string;
}

export interface AgentEnrollmentView {
  id: string;
  status: AgentEnrollmentStatus;
  draftProfile?: ProviderAgentDraft;
  provider?: AgentProvider;
  nativeAgentId?: string;
  pairingExpiresAt?: string;
  pairingExpired?: boolean;
  pairedAt?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
  agent?: EnrolledAgentSummary;
}

export interface RuntimeEnrollmentPairingInput {
  schemaVersion: typeof AGENT_ENROLLMENT_SCHEMA_VERSION;
  pairingCode: string;
  discovery: ProviderAgentDiscoveryInput;
}

export interface AgentActivationInput extends ProviderAgentDraft {
  displayName: string;
  characterVariant: AgentCharacterVariant;
}

export type RuntimeEnrollmentPairingParseResult =
  | { ok: true; pairing: RuntimeEnrollmentPairingInput }
  | { ok: false; error: string };

export type AgentActivationParseResult =
  | { ok: true; activation: AgentActivationInput }
  | { ok: false; error: string };

export function normalizePairingCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const compact = value.toUpperCase().replace(/[\s-]/g, '');
  return /^[0-9A-F]{20}$/.test(compact) ? compact : null;
}

export function hashPairingCode(value: string): string {
  const normalized = normalizePairingCode(value);
  if (!normalized) throw new Error('配对码格式无效');
  return createHash('sha256')
    .update(`oc-kindergarten-pairing-v1:${normalized}`)
    .digest('hex');
}

export function generatePairingCode(): string {
  const compact = randomBytes(10).toString('hex').toUpperCase();
  return compact.match(/.{5}/g)?.join('-') ?? compact;
}

export function parseRuntimeEnrollmentPairing(
  input: unknown,
): RuntimeEnrollmentPairingParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'runtime pairing 必须是对象' };
  }
  const candidate = input as Record<string, unknown>;
  const allowedKeys = new Set(['schemaVersion', 'pairingCode', 'discovery']);
  const unknownKey = Object.keys(candidate).find(
    (key) => !allowedKeys.has(key),
  );
  if (unknownKey) {
    return { ok: false, error: `runtime pairing 不允许字段：${unknownKey}` };
  }
  if (candidate.schemaVersion !== AGENT_ENROLLMENT_SCHEMA_VERSION) {
    return { ok: false, error: '不支持的 enrollment 契约版本' };
  }
  const pairingCode = normalizePairingCode(candidate.pairingCode);
  if (!pairingCode) return { ok: false, error: 'pairingCode 格式无效' };
  const discovery = parseProviderAgentDiscovery(candidate.discovery);
  if (!discovery.ok) return discovery;
  return {
    ok: true,
    pairing: {
      schemaVersion: AGENT_ENROLLMENT_SCHEMA_VERSION,
      pairingCode,
      discovery: discovery.discovery,
    },
  };
}

export function parseAgentActivation(
  input: unknown,
): AgentActivationParseResult {
  const parsed = parseProviderAgentDraft(input);
  if (!parsed.ok) return parsed;
  if (!parsed.draft?.displayName) {
    return { ok: false, error: 'displayName 不能为空' };
  }
  if (!parsed.draft.characterVariant) {
    return { ok: false, error: '必须由家长明确选择 characterVariant' };
  }
  return {
    ok: true,
    activation: {
      ...parsed.draft,
      displayName: parsed.draft.displayName,
      characterVariant: parsed.draft.characterVariant,
    },
  };
}
