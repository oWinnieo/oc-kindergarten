import {
  MonotonicAgentSequenceClock,
  OpenClawAgentAdapter,
} from './openclaw-agent-adapter';
import { StarOfficeFallbackAdapter } from './star-office-fallback-adapter';

interface OpenClawAdapterRuntime {
  native: OpenClawAgentAdapter;
  starFallback: StarOfficeFallbackAdapter;
}

function createRuntime(): OpenClawAdapterRuntime {
  const clock = new MonotonicAgentSequenceClock();
  return {
    native: new OpenClawAgentAdapter({ clock }),
    starFallback: new StarOfficeFallbackAdapter({ clock }),
  };
}

const globalForAdapter = globalThis as typeof globalThis & {
  __ocKindergartenOpenClawAdapterRuntime?: OpenClawAdapterRuntime;
};

export const openClawAdapterRuntime =
  globalForAdapter.__ocKindergartenOpenClawAdapterRuntime ?? createRuntime();

globalForAdapter.__ocKindergartenOpenClawAdapterRuntime = openClawAdapterRuntime;
