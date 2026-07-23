import type { AgentStateEvent } from './agent-event-contract';
import type { AgentTaskState } from './classroom-runtime';

export const TRANSIENT_AGENT_STATE_MAX_AGE_MS = 30 * 60 * 1000;

const TRANSIENT_AGENT_STATES = new Set<AgentTaskState>([
  'writing',
  'researching',
  'executing',
  'syncing',
]);

export interface AgentStateLiveness {
  state: AgentTaskState;
  expiresInMs: number | null;
}

export function resolveAgentStateLiveness(
  event: AgentStateEvent,
  nowMs = Date.now(),
): AgentStateLiveness {
  if (!TRANSIENT_AGENT_STATES.has(event.state)) {
    return { state: event.state, expiresInMs: null };
  }

  const expiresAt = Date.parse(event.observedAt) +
    TRANSIENT_AGENT_STATE_MAX_AGE_MS;
  const expiresInMs = Math.max(0, expiresAt - nowMs);
  return {
    state: expiresInMs === 0 ? 'idle' : event.state,
    expiresInMs,
  };
}

