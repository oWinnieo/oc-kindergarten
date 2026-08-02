import { HermesAgentAdapter } from './hermes-agent-adapter';
import { HermesProviderRuntimeAdapter } from './hermes-provider-runtime-adapter';
import {
  MonotonicAgentSequenceClock,
  OpenClawAgentAdapter,
} from './openclaw-agent-adapter';
import { OpenClawProviderRuntimeAdapter } from './openclaw-provider-runtime-adapter';
import { ProviderRuntimeAdapterRegistry } from './provider-runtime-adapter';
import { StarOfficeFallbackAdapter } from './star-office-fallback-adapter';

interface RuntimeAdapterRuntime {
  openClawNative: OpenClawAgentAdapter;
  openClawStarFallback: StarOfficeFallbackAdapter;
  hermes: HermesAgentAdapter;
  providers: ProviderRuntimeAdapterRegistry;
}

function createRuntime(): RuntimeAdapterRuntime {
  const clock = new MonotonicAgentSequenceClock();
  const openClawNative = new OpenClawAgentAdapter({ clock });
  const hermes = new HermesAgentAdapter({ clock });
  return {
    openClawNative,
    openClawStarFallback: new StarOfficeFallbackAdapter({ clock }),
    hermes,
    providers: new ProviderRuntimeAdapterRegistry([
      new OpenClawProviderRuntimeAdapter(openClawNative),
      new HermesProviderRuntimeAdapter(hermes),
    ]),
  };
}

const globalForAdapter = globalThis as typeof globalThis & {
  __ocKindergartenRuntimeAdapterRuntime?: RuntimeAdapterRuntime;
};

export const runtimeAdapterRuntime =
  globalForAdapter.__ocKindergartenRuntimeAdapterRuntime ?? createRuntime();

globalForAdapter.__ocKindergartenRuntimeAdapterRuntime = runtimeAdapterRuntime;
