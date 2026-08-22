/**
 * Latency-first contract-generation and endpoint-health primitives.
 *
 * This module deliberately has no Pi, TypeBox, filesystem, or HTTP imports. The
 * workstation adapter injects those owner-specific functions, while this module
 * keeps the ordinary request path to immutable in-memory lookups.
 */

export type ContractSource<TContract> = {
  contract: TContract;
  source: string;
};

export type ModelBinding<TContract, TModel> = {
  contract: TContract;
  model: TModel;
  source: string;
  generationId: number;
};

export type ContractGenerationStatus = {
  initialized: boolean;
  generationId?: number;
  loadedAt?: number;
  refreshDueAt?: number;
  modelCount: number;
  sourceCount: number;
  refreshInFlight: boolean;
  lastRefreshError?: string;
  nextRefreshAttemptAt?: number;
};

export type HealthMode = "blocking" | "background" | "skip";

export type EndpointHealthStatus = {
  key: string;
  checkedAt?: number;
  expiresAt?: number;
  unhealthy?: string;
  degraded?: string;
  lanes?: LaneHealthInfo[];
  probeInFlight: boolean;
};

export interface ContractGenerationCacheOptions<TContract, TModel> {
  load: () => Promise<ContractSource<TContract>[]>;
  merge: (sources: ContractSource<TContract>[]) => ContractSource<TContract>;
  models: (contract: TContract) => readonly TModel[];
  modelId: (model: TModel) => string | undefined;
  refreshIntervalMs: number | (() => number);
  refreshRetryMs?: number | (() => number);
  now?: () => number;
}

interface ContractGeneration<TContract, TModel> {
  id: number;
  loadedAt: number;
  refreshDueAt: number;
  sources: ContractSource<TContract>[];
  merged: ContractSource<TContract>;
  byModelId: Map<string, ModelBinding<TContract, TModel>>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function positiveMs(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function resolveNumber(value: number | (() => number)): number {
  return positiveMs(typeof value === "function" ? value() : value);
}

/**
 * One immutable, atomically replaceable contract generation.
 *
 * Once initialized, resolveCurrent() performs only Date.now(), two branches,
 * and one Map lookup. A TTL expiry starts at most one background refresh and
 * never blocks the current request. Explicit callers can await refresh().
 */
export class ContractGenerationCache<TContract, TModel> {
  readonly #options: ContractGenerationCacheOptions<TContract, TModel>;
  readonly #now: () => number;
  #active?: ContractGeneration<TContract, TModel>;
  #refreshPromise?: Promise<ContractGeneration<TContract, TModel>>;
  #nextGenerationId = 1;
  #lastRefreshError?: string;
  #nextRefreshAttemptAt = 0;
  #epoch = 0;

  constructor(options: ContractGenerationCacheOptions<TContract, TModel>) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
  }

  async initialize(): Promise<ContractGenerationStatus> {
    if (!this.#active) await this.refresh("initial");
    return this.status();
  }

  resolveCurrent(modelId: string): ModelBinding<TContract, TModel> | undefined {
    const active = this.#active;
    if (!active) return undefined;
    this.#scheduleRefreshIfDue(active);
    return active.byModelId.get(modelId);
  }

  async resolve(modelId: string): Promise<ModelBinding<TContract, TModel> | undefined> {
    const current = this.resolveCurrent(modelId);
    if (current) return current;
    if (!this.#active) await this.initialize();
    return this.resolveCurrent(modelId);
  }

  mergedCurrent(): ContractSource<TContract> | undefined {
    const active = this.#active;
    if (!active) return undefined;
    this.#scheduleRefreshIfDue(active);
    return active.merged;
  }

  async merged(): Promise<ContractSource<TContract>> {
    const current = this.mergedCurrent();
    if (current) return current;
    await this.initialize();
    const merged = this.#active?.merged;
    if (!merged) throw new Error("contract generation did not initialize");
    return merged;
  }

  sourcesCurrent(): readonly ContractSource<TContract>[] {
    const active = this.#active;
    if (!active) return [];
    this.#scheduleRefreshIfDue(active);
    return active.sources;
  }

  async sources(): Promise<readonly ContractSource<TContract>[]> {
    if (!this.#active) await this.initialize();
    return this.sourcesCurrent();
  }

  async refresh(
    _reason: "initial" | "ttl" | "explicit" = "explicit",
  ): Promise<ContractGenerationStatus> {
    if (this.#refreshPromise) {
      await this.#refreshPromise;
      return this.status();
    }

    const refreshEpoch = this.#epoch;
    let refresh!: Promise<ContractGeneration<TContract, TModel>>;
    refresh = Promise.resolve()
      .then(() => this.#options.load())
      .then((sources) => this.#buildGeneration(sources))
      .then((generation) => {
        if (refreshEpoch !== this.#epoch) {
          throw new Error("contract generation cache cleared during refresh");
        }
        this.#active = generation;
        this.#lastRefreshError = undefined;
        this.#nextRefreshAttemptAt = generation.refreshDueAt;
        return generation;
      })
      .catch((error: unknown) => {
        if (refreshEpoch === this.#epoch) {
          this.#lastRefreshError = errorText(error);
          const retryMs = resolveNumber(
            this.#options.refreshRetryMs ?? this.#options.refreshIntervalMs,
          );
          this.#nextRefreshAttemptAt = this.#now() + retryMs;
        }
        throw error;
      })
      .finally(() => {
        if (this.#refreshPromise === refresh) this.#refreshPromise = undefined;
      });

    this.#refreshPromise = refresh;
    await refresh;
    return this.status();
  }

  status(): ContractGenerationStatus {
    const active = this.#active;
    return {
      initialized: Boolean(active),
      generationId: active?.id,
      loadedAt: active?.loadedAt,
      refreshDueAt: active?.refreshDueAt,
      modelCount: active?.byModelId.size ?? 0,
      sourceCount: active?.sources.length ?? 0,
      refreshInFlight: Boolean(this.#refreshPromise),
      lastRefreshError: this.#lastRefreshError,
      nextRefreshAttemptAt: this.#nextRefreshAttemptAt || undefined,
    };
  }

  clear(): void {
    this.#epoch += 1;
    this.#active = undefined;
    this.#refreshPromise = undefined;
    this.#nextGenerationId = 1;
    this.#lastRefreshError = undefined;
    this.#nextRefreshAttemptAt = 0;
  }

  #scheduleRefreshIfDue(active: ContractGeneration<TContract, TModel>): void {
    const now = this.#now();
    if (this.#refreshPromise) return;
    if (now < active.refreshDueAt || now < this.#nextRefreshAttemptAt) return;
    void this.refresh("ttl").catch(() => {
      // The previous immutable generation remains active. status() exposes the
      // failure and retry time without putting refresh I/O on the data plane.
    });
  }

  #buildGeneration(sources: ContractSource<TContract>[]): ContractGeneration<TContract, TModel> {
    if (sources.length === 0) throw new Error("no workstation inference contracts loaded");

    const loadedAt = this.#now();
    const generationId = this.#nextGenerationId++;
    const immutableSources = sources.map((source) => ({ ...source }));
    const byModelId = new Map<string, ModelBinding<TContract, TModel>>();

    // Match the existing package: the first loaded contract wins on duplicate
    // model IDs (canonical before canary before optional modality contracts).
    for (const source of immutableSources) {
      for (const model of this.#options.models(source.contract)) {
        const id = this.#options.modelId(model);
        if (!id || byModelId.has(id)) continue;
        byModelId.set(id, {
          contract: source.contract,
          model,
          source: source.source,
          generationId,
        });
      }
    }

    return {
      id: generationId,
      loadedAt,
      refreshDueAt: loadedAt + resolveNumber(this.#options.refreshIntervalMs),
      sources: immutableSources,
      merged: this.#options.merge(immutableSources),
      byModelId,
    };
  }
}

/**
 * A probe may return a plain string (hard-unhealthy reason), undefined
 * (healthy), or a structured outcome that distinguishes hard failure from
 * partial degradation. Degradation never gates requests by itself; it is
 * carried so status surfaces can tell the truth about partial lanes.
 */
export interface LaneHealthInfo {
  lane_id: string;
  models: string[];
  healthy: boolean;
  is_default?: boolean;
  detail?: string;
}

export interface HealthProbeOutcome {
  unhealthy?: string;
  degraded?: string;
  lanes?: LaneHealthInfo[];
}

export type HealthProbeResult = string | undefined | HealthProbeOutcome;

export function healthProbeOutcome(result: HealthProbeResult): {
  unhealthy?: string;
  degraded?: string;
  lanes?: LaneHealthInfo[];
} {
  if (result === undefined || typeof result === "string") {
    return { unhealthy: result };
  }
  return result;
}

export interface EndpointHealthCacheOptions {
  probe: (key: string) => Promise<HealthProbeResult>;
  ttlMs: number | (() => number);
  now?: () => number;
}

interface HealthEntry {
  checkedAt: number;
  expiresAt: number;
  unhealthy?: string;
  degraded?: string;
  lanes?: LaneHealthInfo[];
}

/** Singleflight endpoint health with stale-while-revalidate semantics. */
export class EndpointHealthCache {
  readonly #options: EndpointHealthCacheOptions;
  readonly #now: () => number;
  readonly #entries = new Map<string, HealthEntry>();
  readonly #inflight = new Map<string, Promise<string | undefined>>();
  #epoch = 0;

  constructor(options: EndpointHealthCacheOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
  }

  async check(
    key: string,
    options: { mode?: HealthMode; signal?: AbortSignal } = {},
  ): Promise<string | undefined> {
    const mode = options.mode ?? "blocking";
    if (mode === "skip") return undefined;
    if (options.signal?.aborted) return "health check cancelled by caller";

    const cached = this.#entries.get(key);
    if (cached && cached.expiresAt > this.#now()) return cached.unhealthy;

    const probe = this.#probe(key);
    if (mode === "background") {
      void probe.catch(() => {});
      return cached?.unhealthy;
    }

    return this.#awaitWithSignal(probe, options.signal);
  }

  async prime(keys: Iterable<string>): Promise<void> {
    await Promise.all([...new Set(keys)].map((key) => this.#probe(key)));
  }

  mark(key: string, unhealthy?: string, degraded?: string, lanes?: LaneHealthInfo[]): void {
    const checkedAt = this.#now();
    this.#entries.set(key, {
      checkedAt,
      expiresAt: checkedAt + resolveNumber(this.#options.ttlMs),
      unhealthy,
      degraded,
      lanes,
    });
  }

  status(): EndpointHealthStatus[] {
    const keys = new Set([...this.#entries.keys(), ...this.#inflight.keys()]);
    return [...keys].sort().map((key) => {
      const entry = this.#entries.get(key);
      return {
        key,
        checkedAt: entry?.checkedAt,
        expiresAt: entry?.expiresAt,
        unhealthy: entry?.unhealthy,
        degraded: entry?.degraded,
        lanes: entry?.lanes,
        probeInFlight: this.#inflight.has(key),
      };
    });
  }

  clear(): void {
    this.#epoch += 1;
    this.#entries.clear();
    this.#inflight.clear();
  }

  #probe(key: string): Promise<string | undefined> {
    const existing = this.#inflight.get(key);
    if (existing) return existing;

    const probeEpoch = this.#epoch;
    let probe!: Promise<string | undefined>;
    probe = Promise.resolve()
      .then(() => this.#options.probe(key))
      .catch((error: unknown) => errorText(error))
      .then((result) => {
        const { unhealthy, degraded, lanes } = healthProbeOutcome(result);
        if (probeEpoch === this.#epoch) this.mark(key, unhealthy, degraded, lanes);
        return unhealthy;
      })
      .finally(() => {
        if (this.#inflight.get(key) === probe) this.#inflight.delete(key);
      });

    this.#inflight.set(key, probe);
    return probe;
  }

  async #awaitWithSignal(
    probe: Promise<string | undefined>,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    if (!signal) return probe;
    if (signal.aborted) return "health check cancelled by caller";

    return new Promise<string | undefined>((resolve) => {
      let settled = false;
      const finish = (value: string | undefined) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      };
      const onAbort = () => finish("health check cancelled by caller");
      signal.addEventListener("abort", onAbort, { once: true });
      probe.then(finish, (error) => finish(errorText(error)));
    });
  }
}
