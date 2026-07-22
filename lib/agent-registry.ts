import {
  AGENT_REGISTRY_SCHEMA_VERSION,
  DEFAULT_AGENT_APPEARANCE_PRESET,
  AgentProfile,
  AgentProfileInput,
} from './agent-registry-contract';

export type AgentRegistryChange =
  | {
      type: 'agent.profile.upserted';
      agentId: string;
      profile: AgentProfile;
      revision: number;
      observedAt: string;
    }
  | {
      type: 'agent.profile.removed';
      agentId: string;
      revision: number;
      observedAt: string;
    };

type AgentRegistryListener = (change: AgentRegistryChange) => void;

const DEFAULT_AGENT_PROFILE_INPUTS: readonly AgentProfileInput[] = [
  {
    schemaVersion: AGENT_REGISTRY_SCHEMA_VERSION,
    agentId: 'agent-scout',
    displayName: '小探',
    characterVariant: 'boy',
    registeredBy: 'system',
    role: 'Research agent',
    color: '#1677b8',
  },
  {
    schemaVersion: AGENT_REGISTRY_SCHEMA_VERSION,
    agentId: 'agent-bloom',
    displayName: '小花',
    characterVariant: 'girl',
    registeredBy: 'system',
    role: 'Writing agent',
    color: '#df4c5e',
  },
  {
    schemaVersion: AGENT_REGISTRY_SCHEMA_VERSION,
    agentId: 'agent-spark',
    displayName: '小光',
    characterVariant: 'genderless',
    registeredBy: 'system',
    role: 'Execution agent',
    color: '#6576d8',
  },
] as const;

const DEFAULT_UPDATED_AT = '2026-07-18T00:00:00.000Z';

export class AgentRegistry {
  private readonly profiles = new Map<string, AgentProfile>();
  private readonly listeners = new Set<AgentRegistryListener>();
  private revisionClock = 0;

  constructor(seedProfiles: readonly AgentProfileInput[] = DEFAULT_AGENT_PROFILE_INPUTS) {
    for (const input of seedProfiles) {
      this.revisionClock += 1;
      this.profiles.set(input.agentId, {
        ...input,
        appearancePreset:
          input.appearancePreset ?? DEFAULT_AGENT_APPEARANCE_PRESET,
        revision: this.revisionClock,
        updatedAt: DEFAULT_UPDATED_AT,
      });
    }
  }

  snapshot(): AgentProfile[] {
    return Array.from(this.profiles.values()).sort((first, second) =>
      first.agentId.localeCompare(second.agentId),
    );
  }

  get(agentId: string): AgentProfile | undefined {
    return this.profiles.get(agentId);
  }

  has(agentId: string): boolean {
    return this.profiles.has(agentId);
  }

  upsert(input: AgentProfileInput, now = new Date()): AgentProfile {
    this.revisionClock += 1;
    const profile: AgentProfile = {
      ...input,
      appearancePreset:
        input.appearancePreset ?? DEFAULT_AGENT_APPEARANCE_PRESET,
      revision: this.revisionClock,
      updatedAt: now.toISOString(),
    };
    this.profiles.set(profile.agentId, profile);
    this.publish({
      type: 'agent.profile.upserted',
      agentId: profile.agentId,
      profile,
      revision: profile.revision,
      observedAt: profile.updatedAt,
    });
    return profile;
  }

  remove(agentId: string, now = new Date()): boolean {
    if (!this.profiles.delete(agentId)) return false;
    this.revisionClock += 1;
    this.publish({
      type: 'agent.profile.removed',
      agentId,
      revision: this.revisionClock,
      observedAt: now.toISOString(),
    });
    return true;
  }

  subscribe(listener: AgentRegistryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(change: AgentRegistryChange) {
    this.listeners.forEach((listener) => listener(change));
  }
}

const globalForAgentRegistry = globalThis as typeof globalThis & {
  __ocKindergartenAgentRegistry?: AgentRegistry;
};

export const agentRegistry =
  globalForAgentRegistry.__ocKindergartenAgentRegistry ?? new AgentRegistry();

globalForAgentRegistry.__ocKindergartenAgentRegistry = agentRegistry;
