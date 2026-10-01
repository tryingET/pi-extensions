// Demand-driven collection; only a generation-bound, one-shot UI expiry timer runs while idle.
import { performance } from "node:perf_hooks";
import { OwnedReaders } from "./command-runner.ts";
import type { ContextConfig } from "./config.ts";

export interface CollectionPacket {
  applicable: boolean;
  packetTier: "fast" | "full";
  fullRefreshStatus: "not_applicable" | "pending" | "complete" | "failed";
  sourceHealth?: "healthy" | "degraded" | "not_checked";
  freshness?: "fresh" | "stale";
  refreshState?: "idle" | "refreshing" | "backoff" | "shutdown" | "blocked_cleanup";
  collectionElapsedMs?: number;
  collectionStartedMonoMs?: number;
  configFingerprint?: string;
  collectionGeneration?: number;
}
interface Dependencies<P extends CollectionPacket> {
  fast: (config: ContextConfig, error?: unknown) => P;
  collect: (config: ContextConfig, signal: AbortSignal, resources: OwnedReaders) => Promise<P>;
  resources?: OwnedReaders;
  now?: () => number;
  random?: () => number;
  changed?: (packet: P | undefined) => void;
}
export class RefreshLifecycle<P extends CollectionPacket> {
  private config?: ContextConfig;
  private packet?: P;
  private started = 0;
  private retryAt = 0;
  private failures = 0;
  private generation = 0;
  private stopped = false;
  private flight?: Promise<void>;
  private abort?: AbortController;
  private pending = new Set<Promise<void>>();
  private currentConfig?: () => ContextConfig;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly resources: OwnedReaders;
  private expiryTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly dependencies: Dependencies<P>) {
    this.now = dependencies.now || (() => performance.now());
    this.random = dependencies.random || Math.random;
    this.resources = dependencies.resources || new OwnedReaders();
  }
  hasBlockedCleanup(): boolean {
    return this.resources.blocked();
  }
  private cancelExpiry(): void {
    clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
  }
  private armExpiry(generation: number, config: ContextConfig): void {
    this.cancelExpiry();
    const remaining = config.ttlMs - (this.now() - this.started);
    if (
      !this.dependencies.changed ||
      this.packet?.sourceHealth !== "healthy" ||
      this.packet.packetTier !== "full" ||
      this.resources.blocked() ||
      remaining <= 0
    )
      return;
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = undefined;
      if (this.stopped || this.generation !== generation) return;
      if (this.valid(generation, config) && this.now() - this.started < config.ttlMs) {
        this.armExpiry(generation, config);
        return;
      }
      this.dependencies.changed?.(this.view());
    }, Math.ceil(remaining));
    this.expiryTimer.unref();
  }
  // Replacing a session is distinct from concurrent manual requests.
  restart(): void {
    this.cancelExpiry();
    this.generation++;
    this.abort?.abort("session_replaced");
    this.flight = undefined;
    this.config = undefined;
    this.packet = undefined;
    this.stopped = false;
  }
  private reconcile(config: ContextConfig, current: () => ContextConfig): void {
    this.currentConfig = current;
    if (this.config?.fingerprint === config.fingerprint) return;
    this.cancelExpiry();
    this.generation++;
    this.abort?.abort("superseded");
    this.flight = undefined;
    this.abort = undefined;
    this.config = config;
    this.packet = this.dependencies.fast(config);
    this.failures = 0;
    this.retryAt = 0;
  }
  private valid(generation: number, config: ContextConfig): boolean {
    return (
      !this.stopped &&
      generation === this.generation &&
      this.config?.fingerprint === config.fingerprint &&
      this.currentConfig?.().fingerprint === config.fingerprint
    );
  }
  view(): P | undefined {
    if (
      this.stopped ||
      !this.packet ||
      !this.config ||
      this.currentConfig?.().fingerprint !== this.config.fingerprint
    )
      return undefined;
    if (this.resources.blocked())
      return {
        ...this.dependencies.fast(
          this.config,
          new Error("cleanup_failure: owned resources remain unresolved; collection blocked"),
        ),
        sourceHealth: "degraded",
        freshness: "stale",
        refreshState: "blocked_cleanup",
        fullRefreshStatus: "failed",
        configFingerprint: this.config.fingerprint,
        collectionGeneration: this.generation,
      };
    const freshness =
      this.packet.packetTier === "full" && this.now() - this.started < this.config.ttlMs
        ? "fresh"
        : "stale";
    const refreshState = this.flight
      ? "refreshing"
      : this.failures > 0 && this.now() < this.retryAt
        ? "backoff"
        : "idle";
    return {
      ...this.packet,
      freshness,
      refreshState,
      configFingerprint: this.config.fingerprint,
      collectionGeneration: this.generation,
    };
  }
  consume(packet: P | undefined, current: () => ContextConfig): P | undefined {
    if (
      !packet ||
      this.stopped ||
      packet.collectionGeneration !== this.generation ||
      packet.configFingerprint !== current().fingerprint
    )
      return undefined;
    return this.view();
  }
  async waitCurrent(current: () => ContextConfig): Promise<P | undefined> {
    const generation = this.generation;
    await this.flight;
    if (this.generation !== generation) return undefined;
    return this.consume(this.view(), current);
  }
  private start(config: ContextConfig): void {
    if (this.flight || !this.packet?.applicable || this.stopped || this.resources.blocked()) return;
    this.cancelExpiry();
    const generation = this.generation;
    const controller = new AbortController();
    this.abort = controller;
    // Do not overlap the replacement's readers with the old generation's cleanup.
    const predecessors = [...this.pending];
    let flight: Promise<void>;
    flight = (async () => {
      await Promise.all(predecessors);
      if (!this.valid(generation, config) || controller.signal.aborted || this.resources.blocked())
        return;
      const started = this.now();
      let packet: P;
      try {
        packet = await this.dependencies.collect(config, controller.signal, this.resources);
      } catch (error) {
        packet = this.dependencies.fast(config, error);
      }
      if (!this.valid(generation, config) || controller.signal.aborted) return;
      this.packet = {
        ...packet,
        collectionStartedMonoMs: started,
        collectionElapsedMs: packet.collectionElapsedMs ?? this.now() - started,
        configFingerprint: config.fingerprint,
      };
      this.started = started;
      if (packet.sourceHealth === "healthy" && !this.resources.blocked()) {
        this.failures = 0;
        this.retryAt = 0;
      } else {
        this.failures++;
        const base = config.retryBaseMs * 2 ** Math.min(this.failures - 1, 30);
        const jitter = 1 + Math.max(0, Math.min(1, this.random())) * 0.25;
        this.retryAt = this.now() + Math.min(config.retryCapMs, base * jitter);
      }
    })().finally(() => {
      this.pending.delete(flight);
      if (this.flight === flight && this.generation === generation) {
        this.flight = undefined;
        this.abort = undefined;
        this.armExpiry(generation, config);
        this.dependencies.changed?.(this.view());
      }
    });
    this.flight = flight;
    this.pending.add(flight);
    this.dependencies.changed?.(this.view());
  }
  async request(
    current: () => ContextConfig,
    manual = false,
    waitMs?: number,
  ): Promise<P | undefined> {
    if (this.stopped) return undefined;
    const config = current();
    this.reconcile(config, current);
    const generation = this.generation;
    const view = this.view();
    const due =
      view?.packetTier !== "full" || view.sourceHealth !== "healthy"
        ? this.now() >= this.retryAt
        : view.freshness === "stale";
    if (manual || due) this.start(config);
    const flight = this.flight;
    const wait = waitMs ?? (manual ? undefined : config.waitMs);
    if (flight && (wait === undefined || wait > 0)) {
      if (wait === undefined) await flight;
      else
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, wait);
          void flight.then(() => {
            clearTimeout(timer);
            resolve();
          });
        });
    }
    // Consumption must be just as strict as publication, including bounded-wait races.
    if (this.stopped || this.generation !== generation) return undefined;
    const after = current();
    if (after.fingerprint !== config.fingerprint) {
      this.reconcile(after, current);
      this.start(after);
    }
    return this.view();
  }
  async shutdown(): Promise<void> {
    this.cancelExpiry();
    this.stopped = true;
    const generation = ++this.generation;
    this.abort?.abort("shutdown");
    // Superseded collectors already have their own abort. Await their actual cleanup too.
    await Promise.all([...this.pending]);
    if (this.generation !== generation) return;
    this.flight = undefined;
    this.abort = undefined;
    this.packet = undefined;
  }
}
