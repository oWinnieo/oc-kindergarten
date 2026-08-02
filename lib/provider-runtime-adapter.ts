import type { AgentRuntimeEvent } from './agent-event-contract';
import type {
  AgentProvider,
  RuntimeIdentity,
} from './provider-binding-contract';

export type ProviderRuntimeAdapterResult =
  | { ok: true; events: AgentRuntimeEvent[]; ignored?: string }
  | { ok: false; error: string };

export interface ParsedProviderRuntimeEvent {
  identity: RuntimeIdentity;
  adapt(classroomAgentId: string): ProviderRuntimeAdapterResult;
  createBindingPresence(
    classroomAgentId: string,
  ): ProviderRuntimeAdapterResult;
}

export type ProviderRuntimeParseResult =
  | { ok: true; parsed: ParsedProviderRuntimeEvent }
  | { ok: false; error: string };

export interface ProviderRuntimeAdapter {
  readonly provider: AgentProvider;
  parse(input: unknown): ProviderRuntimeParseResult;
}

function providerFromWire(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return undefined;
  }
  const provider = (input as Record<string, unknown>).provider;
  return typeof provider === 'string' ? provider : undefined;
}

export class ProviderRuntimeAdapterRegistry {
  private readonly adapters = new Map<AgentProvider, ProviderRuntimeAdapter>();

  constructor(adapters: ProviderRuntimeAdapter[]) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.provider)) {
        throw new Error(`重复注册 provider runtime adapter：${adapter.provider}`);
      }
      this.adapters.set(adapter.provider, adapter);
    }
  }

  parse(input: unknown): ProviderRuntimeParseResult {
    const provider = providerFromWire(input);
    if (!provider) return { ok: false, error: 'provider 不能为空' };
    const adapter = this.adapters.get(provider as AgentProvider);
    if (!adapter) return { ok: false, error: 'provider 事件入口不受支持' };
    return adapter.parse(input);
  }
}
