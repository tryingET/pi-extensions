// ---
// summary: "Creates session-scoped cached first-use loaders for pi-autoresearch runtime and domain implementations."
// read_when:
//   - "Changing dynamic import caching, implementation injection, or lazy-load failure behavior."
// ---

import {
  type AutoresearchSessionEffects,
  assertAutoresearchSessionActive,
} from "./sessionEffects.ts";

export type AutoresearchRuntimeModule = typeof import("../../src/core/runtime.ts");
export type AutoresearchFinalizeModule = typeof import("../../src/core/finalize.ts");
export type AutoresearchSelfHostingModule = typeof import("../../src/core/selfHosting.ts");
export type AutoresearchLlamacppModule = typeof import("../../src/core/llamacppCampaign.ts");
export type AutoresearchVllmModule = typeof import("../../src/core/vllmCampaignCockpit.ts");
export type AutoresearchAutoContinuationModule =
  typeof import("../../src/core/autoContinuation.ts");
export type AutoresearchDecisionsModule = typeof import("../../src/core/decisions.ts");
export type PiAiCompatModule = typeof import("@earendil-works/pi-ai/compat");

export interface PiAutoresearchModuleLoaders {
  runtime: () => Promise<AutoresearchRuntimeModule>;
  finalize: () => Promise<AutoresearchFinalizeModule>;
  selfHosting: () => Promise<AutoresearchSelfHostingModule>;
  llamacpp: () => Promise<AutoresearchLlamacppModule>;
  vllm: () => Promise<AutoresearchVllmModule>;
  autoContinuation: () => Promise<AutoresearchAutoContinuationModule>;
  decisions: () => Promise<AutoresearchDecisionsModule>;
  piAiCompat: () => Promise<PiAiCompatModule>;
}

export interface AutoresearchLazyModules {
  runtime: () => Promise<AutoresearchRuntimeModule>;
  finalize: () => Promise<AutoresearchFinalizeModule>;
  selfHosting: () => Promise<AutoresearchSelfHostingModule>;
  llamacpp: () => Promise<AutoresearchLlamacppModule>;
  vllm: () => Promise<AutoresearchVllmModule>;
  autoContinuation: () => Promise<AutoresearchAutoContinuationModule>;
  decisions: () => Promise<AutoresearchDecisionsModule>;
  piAiCompat: () => Promise<PiAiCompatModule>;
  reset(): void;
}

export function createAutoresearchLazyModules(
  overrides: Partial<PiAutoresearchModuleLoaders> = {},
  getSessionEffects?: () => AutoresearchSessionEffects,
): AutoresearchLazyModules {
  const loaders: PiAutoresearchModuleLoaders = {
    runtime: overrides.runtime ?? (() => import("../../src/core/runtime.ts")),
    finalize: overrides.finalize ?? (() => import("../../src/core/finalize.ts")),
    selfHosting: overrides.selfHosting ?? (() => import("../../src/core/selfHosting.ts")),
    llamacpp: overrides.llamacpp ?? (() => import("../../src/core/llamacppCampaign.ts")),
    vllm: overrides.vllm ?? (() => import("../../src/core/vllmCampaignCockpit.ts")),
    autoContinuation:
      overrides.autoContinuation ?? (() => import("../../src/core/autoContinuation.ts")),
    decisions: overrides.decisions ?? (() => import("../../src/core/decisions.ts")),
    piAiCompat: overrides.piAiCompat ?? (() => import("@earendil-works/pi-ai/compat")),
  };

  const createSessionLoaders = (): PiAutoresearchModuleLoaders => ({
    runtime: createCachedFirstUseLoader(loaders.runtime),
    finalize: createCachedFirstUseLoader(loaders.finalize),
    selfHosting: createCachedFirstUseLoader(loaders.selfHosting),
    llamacpp: createCachedFirstUseLoader(loaders.llamacpp),
    vllm: createCachedFirstUseLoader(loaders.vllm),
    autoContinuation: createCachedFirstUseLoader(loaders.autoContinuation),
    decisions: createCachedFirstUseLoader(loaders.decisions),
    piAiCompat: createCachedFirstUseLoader(loaders.piAiCompat),
  });
  let sessionLoaders = createSessionLoaders();

  const loadForCurrentSession = async <T>(loader: () => Promise<T>): Promise<T> => {
    const effects = getSessionEffects?.();
    const value = await loader();
    if (effects) assertAutoresearchSessionActive(effects);
    return value;
  };

  return {
    runtime: () => loadForCurrentSession(sessionLoaders.runtime),
    finalize: () => loadForCurrentSession(sessionLoaders.finalize),
    selfHosting: () => loadForCurrentSession(sessionLoaders.selfHosting),
    llamacpp: () => loadForCurrentSession(sessionLoaders.llamacpp),
    vllm: () => loadForCurrentSession(sessionLoaders.vllm),
    autoContinuation: () => loadForCurrentSession(sessionLoaders.autoContinuation),
    decisions: () => loadForCurrentSession(sessionLoaders.decisions),
    piAiCompat: () => loadForCurrentSession(sessionLoaders.piAiCompat),
    reset() {
      sessionLoaders = createSessionLoaders();
    },
  };
}

export function createCachedFirstUseLoader<T>(loader: () => Promise<T>): () => Promise<T> {
  let inFlightOrLoaded: Promise<T> | null = null;
  return () => {
    inFlightOrLoaded ??= Promise.resolve().then(loader);
    return inFlightOrLoaded;
  };
}
