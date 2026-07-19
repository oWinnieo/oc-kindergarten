import type { AgentRuntimeEvent } from './agent-event-contract';
import type { AgentRegistryChange } from './agent-registry';

export interface DurableAgentEvent {
  cursor: number;
  event: AgentRuntimeEvent;
}

export interface DurableRegistryChange {
  cursor: number;
  change: AgentRegistryChange;
}

type AgentEventListener = (event: DurableAgentEvent) => void;
type RegistryChangeListener = (change: DurableRegistryChange) => void;

class DurableLiveEvents {
  private readonly agentEventListeners = new Set<AgentEventListener>();
  private readonly registryChangeListeners = new Set<RegistryChangeListener>();

  publishAgentEvent(event: DurableAgentEvent) {
    this.agentEventListeners.forEach((listener) => listener(event));
  }

  publishRegistryChange(change: DurableRegistryChange) {
    this.registryChangeListeners.forEach((listener) => listener(change));
  }

  subscribeAgentEvents(listener: AgentEventListener): () => void {
    this.agentEventListeners.add(listener);
    return () => this.agentEventListeners.delete(listener);
  }

  subscribeRegistryChanges(listener: RegistryChangeListener): () => void {
    this.registryChangeListeners.add(listener);
    return () => this.registryChangeListeners.delete(listener);
  }
}

const globalForLiveEvents = globalThis as typeof globalThis & {
  __ocKindergartenDurableLiveEvents?: DurableLiveEvents;
};

export const durableLiveEvents =
  globalForLiveEvents.__ocKindergartenDurableLiveEvents ??
  new DurableLiveEvents();

globalForLiveEvents.__ocKindergartenDurableLiveEvents = durableLiveEvents;
