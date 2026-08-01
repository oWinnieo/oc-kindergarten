import { runtimeAdapterRuntime } from './runtime-adapter-runtime';

export const openClawAdapterRuntime = {
  native: runtimeAdapterRuntime.openClawNative,
  starFallback: runtimeAdapterRuntime.openClawStarFallback,
};
