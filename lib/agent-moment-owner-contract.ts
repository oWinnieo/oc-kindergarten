import {
  AGENT_MOMENT_SCHEMA_VERSION,
  type AgentMomentStatus,
  type AgentMomentTemplate,
  type AgentMomentVisibility,
  type AgentShareProfileVisibility,
} from './agent-moment-contract';

export interface OwnerAgentShareSettings {
  schemaVersion: typeof AGENT_MOMENT_SCHEMA_VERSION;
  enrollmentId: string;
  profileVisibility: AgentShareProfileVisibility;
  allowReplyExcerpt: boolean;
}

export interface OwnerAgentMomentItem {
  position: 1 | 2;
  kind: string;
  title: string;
  detail: string;
  occurredAt: string;
  sourceCursor: string | null;
}

export interface OwnerAgentMoment {
  schemaVersion: typeof AGENT_MOMENT_SCHEMA_VERSION;
  id: string;
  enrollmentId: string;
  agent: {
    displayName: string;
    characterVariant: string;
    appearancePreset: string;
    color?: string;
  };
  title: string;
  ownerCaption?: string;
  template: AgentMomentTemplate;
  visibility: AgentMomentVisibility;
  status: AgentMomentStatus;
  shareSlug?: string;
  publishedAt?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
  items: OwnerAgentMomentItem[];
}

export interface OwnerAgentMomentPage {
  items: OwnerAgentMoment[];
  nextCursor: string | null;
}

