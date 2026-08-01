// ---
// summary: "Creates session-scoped cached first-use loaders for pi-autoresearch runtime and domain implementations."
// read_when:
//   - "Changing dynamic import caching, implementation injection, or lazy-load failure behavior."
// ---

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
}

export function createAutoresearchLazyModules(
  overrides: Partial<PiAutoresearchModuleLoaders> = {},
): AutoresearchLazyModules {
  return {
    runtime: createCachedFirstUseLoader(
      overrides.runtime ?? (() => import("../../src/core/runtime.ts")),
    ),
    finalize: createCachedFirstUseLoader(
      overrides.finalize ?? (() => import("../../src/core/finalize.ts")),
    ),
    selfHosting: createCachedFirstUseLoader(
      overrides.selfHosting ?? (() => import("../../src/core/selfHosting.ts")),
    ),
    llamacpp: createCachedFirstUseLoader(
      overrides.llamacpp ?? (() => import("../../src/core/llamacppCampaign.ts")),
    ),
    vllm: createCachedFirstUseLoader(
      overrides.vllm ?? (() => import("../../src/core/vllmCampaignCockpit.ts")),
    ),
    autoContinuation: createCachedFirstUseLoader(
      overrides.autoContinuation ?? (() => import("../../src/core/autoContinuation.ts")),
    ),
    decisions: createCachedFirstUseLoader(
      overrides.decisions ?? (() => import("../../src/core/decisions.ts")),
    ),
    piAiCompat: createCachedFirstUseLoader(
      overrides.piAiCompat ?? (() => import("@earendil-works/pi-ai/compat")),
    ),
  };
}

export function createCachedFirstUseLoader<T>(loader: () => Promise<T>): () => Promise<T> {
  let inFlightOrLoaded: Promise<T> | null = null;
  return () => {
    inFlightOrLoaded ??= Promise.resolve().then(loader);
    return inFlightOrLoaded;
  };
}
