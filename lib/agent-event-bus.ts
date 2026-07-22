import { AgentRuntimeEvent } from './agent-event-contract';

type AgentEventListener = (event: AgentRuntimeEvent) => void;

class AgentEventBus {
  private readonly listeners = new Set<AgentEventListener>();
  private readonly latestPresenceByAgent = new Map<string, AgentRuntimeEvent>();
  private readonly latestStateByAgent = new Map<string, AgentRuntimeEvent>();

  publish(event: AgentRuntimeEvent) {
    if (event.type === 'agent.presence') {
      this.latestPresenceByAgent.set(event.agentId, event);
      this.latestStateByAgent.delete(event.agentId);
    } else if (event.type === 'agent.state') {
      this.latestStateByAgent.set(event.agentId, event);
    }
    this.listeners.forEach((listener) => listener(event));
  }

  snapshot(): AgentRuntimeEvent[] {
    const agentIds = new Set<string>();
    this.latestPresenceByAgent.forEach((_event, agentId) => agentIds.add(agentId));
    this.latestStateByAgent.forEach((_event, agentId) => agentIds.add(agentId));
    const events: AgentRuntimeEvent[] = [];
    for (const agentId of Array.from(agentIds).sort()) {
      const presence = this.latestPresenceByAgent.get(agentId);
      const state = this.latestStateByAgent.get(agentId);
      if (presence) events.push(presence);
      if (
        state &&
        (!presence ||
          presence.type !== 'agent.presence' ||
          presence.action === 'enter')
      ) {
        events.push(state);
      }
    }
    return events;
  }

  forget(agentId: string) {
    this.latestPresenceByAgent.delete(agentId);
    this.latestStateByAgent.delete(agentId);
  }

  subscribe(listener: AgentEventListener, replayLatest = true): () => void {
    this.listeners.add(listener);
    if (replayLatest) {
      for (const event of this.snapshot()) listener(event);
    }
    return () => this.listeners.delete(listener);
  }
}

const globalForAgentEventBus = globalThis as typeof globalThis & {
  __ocKindergartenAgentEventBus?: AgentEventBus;
};

export const agentEventBus =
  globalForAgentEventBus.__ocKindergartenAgentEventBus ?? new AgentEventBus();

globalForAgentEventBus.__ocKindergartenAgentEventBus = agentEventBus;
