import type { OpenClawAgentAdapter } from './openclaw-agent-adapter';
import { parseOpenClawBridgeV2 } from './openclaw-bridge-v2';
import type {
  ProviderRuntimeAdapter,
  ProviderRuntimeParseResult,
} from './provider-runtime-adapter';

export class OpenClawProviderRuntimeAdapter
  implements ProviderRuntimeAdapter
{
  readonly provider = 'openclaw' as const;

  constructor(private readonly adapter: OpenClawAgentAdapter) {}

  parse(input: unknown): ProviderRuntimeParseResult {
    const parsed = parseOpenClawBridgeV2(input);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      parsed: {
        identity: parsed.bridge.discovery,
        adapt: (classroomAgentId) =>
          this.adapter.adapt(parsed.bridge.bind(classroomAgentId)),
        createBindingPresence: (classroomAgentId) => {
          const bound = parsed.bridge.bind(classroomAgentId);
          return this.adapter.adapt({
            ...bound,
            bridgeEventId: `${bound.bridgeEventId}:binding-enter`,
            hook: 'gateway_start',
            data: { reason: 'active_binding' },
          });
        },
      },
    };
  }
}
