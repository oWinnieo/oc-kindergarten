import type { HermesAgentAdapter } from './hermes-agent-adapter';
import { parseHermesBridgeV1 } from './hermes-bridge-v1';
import type {
  ProviderRuntimeAdapter,
  ProviderRuntimeParseResult,
} from './provider-runtime-adapter';

export class HermesProviderRuntimeAdapter implements ProviderRuntimeAdapter {
  readonly provider = 'hermes' as const;

  constructor(private readonly adapter: HermesAgentAdapter) {}

  parse(input: unknown): ProviderRuntimeParseResult {
    const parsed = parseHermesBridgeV1(input);
    if (!parsed.ok) return parsed;
    const identity = {
      provider: parsed.event.provider,
      runtimeInstanceId: parsed.event.runtimeInstanceId,
      nativeAgentId: parsed.event.nativeAgentId,
    };
    return {
      ok: true,
      parsed: {
        identity,
        adapt: (classroomAgentId) =>
          this.adapter.adapt(parsed.event, classroomAgentId),
        createBindingPresence: (classroomAgentId) =>
          this.adapter.createBindingPresence(parsed.event, classroomAgentId),
      },
    };
  }
}
