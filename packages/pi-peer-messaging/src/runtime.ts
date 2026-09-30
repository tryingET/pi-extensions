// ---
// summary: manages broker connectivity, peer operations, correlated asks, retries, and presence updates
// read_when:
//   - changing the managed runtime lifecycle, targeting, reconnection, or ask semantics
// ---

import { setTimeout as sleep } from "node:timers/promises";
import { PeerMessagingClient } from "./client.ts";
import {
  DEFAULT_ASK_TIMEOUT_MS,
  type DeliveryResult,
  definePeerMessagingRuntime,
  PeerAskCancelledError,
  PeerAskInFlightError,
  type PeerMessage,
  type PeerMessagingRuntime,
  type PeerPresence,
  type PeerRuntimeStatus,
} from "./contracts.ts";
import { type PeerMessagingPaths, resolvePeerMessagingPaths } from "./paths.ts";
import type { PeerPresenceUpdate, PeerRegistration } from "./presence.ts";
import { type ActiveAsk, lostAskError, MAX_TIMER_DELAY_MS } from "./runtime-ask.ts";
import { spawnBrokerIfNeeded } from "./spawn.ts";

export interface CreatePeerMessagingRuntimeOptions
  extends Omit<PeerRegistration, "pid" | "startedAt"> {
  pid?: number;
  startedAt?: number;
  runtimeDir?: string;
  paths?: PeerMessagingPaths;
  packageRoot?: string;
  autoStartBroker?: boolean;
  idleShutdownMs?: number;
}

export type PeerMessageListener = (from: PeerPresence, message: PeerMessage) => void;

export interface ManagedPeerMessagingRuntime extends PeerMessagingRuntime {
  disconnect(): Promise<void>;
  updatePresence(updates: PeerPresenceUpdate): Promise<PeerPresence>;
  getPaths(): PeerMessagingPaths;
  onMessage(listener: PeerMessageListener): () => void;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// How long disconnect() waits for a connect it interrupted to close itself. The client's own connect
// timeout is 10 s; a shutdown should not wait that long.
const DISCONNECT_WAIT_MS = 2_000;

function isRecoverableClientError(error: unknown): boolean {
  // A broker that died mid-request resets the connection or breaks the pipe.
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ECONNRESET" || code === "EPIPE") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("not connected") ||
    message.includes("socket is not writable") ||
    message.includes("timed out") ||
    message.includes("disconnected")
  );
}

class PeerMessagingRuntimeManager {
  readonly paths: PeerMessagingPaths;

  private readonly autoStartBroker: boolean;
  private readonly packageRoot?: string;
  private readonly idleShutdownMs?: number;
  private readonly registration: PeerRegistration;
  private readonly messageListeners = new Set<PeerMessageListener>();
  private client: PeerMessagingClient | null = null;
  private connectPromise: Promise<PeerMessagingClient> | null = null;
  private activeAsk: ActiveAsk | null = null;
  // Bumped by disconnect(): work started before it must not reconnect this session afterwards. Each
  // public operation samples it once, on entry, and passes it down.
  private generation = 0;
  // Settles when the last disconnect() has closed the connection and any connect it interrupted.
  private disconnecting: Promise<void> | null = null;
  // Connections being replaced by a re-registration under their own id: their close is expected.
  private readonly replaced = new WeakSet<PeerMessagingClient>();

  constructor(options: CreatePeerMessagingRuntimeOptions) {
    this.paths = options.paths ?? resolvePeerMessagingPaths({ runtimeDir: options.runtimeDir });
    this.autoStartBroker = options.autoStartBroker ?? true;
    this.packageRoot = options.packageRoot;
    this.idleShutdownMs = options.idleShutdownMs;
    this.registration = {
      id: options.id,
      name: options.name,
      cwd: options.cwd,
      model: options.model,
      pid: options.pid ?? process.pid,
      startedAt: options.startedAt ?? Date.now(),
      lastActivity: options.lastActivity,
      status: options.status,
    };
  }

  onMessage(listener: PeerMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
    const ask = this.activeAsk;
    if (ask) {
      this.finishAsk(ask, { error: lostAskError(ask, "runtime_disconnected") });
    }

    const client = this.client;
    this.client = null;
    // A connect still in flight sees the new generation and closes itself instead of becoming
    // this.client. It is awaited (bounded, so shutdown is not held up by a hung connect): otherwise
    // a later connect under the same stable id could register first and then be evicted by it.
    const interrupted = this.connectPromise;
    this.connectPromise = null;
    // Chained: a second disconnect() must not cut short the first one's wait.
    const previous = this.disconnecting;
    const closing = (async () => {
      await previous;
      if (interrupted) {
        await Promise.race([
          interrupted.catch(() => {}),
          sleep(DISCONNECT_WAIT_MS, undefined, { ref: false }),
        ]);
      }
      await client?.disconnect();
    })();
    this.disconnecting = closing;
    try {
      await closing;
    } finally {
      if (this.disconnecting === closing) this.disconnecting = null;
    }
  }

  async updatePresence(updates: PeerPresenceUpdate): Promise<PeerPresence> {
    if (updates.name !== undefined) {
      this.registration.name = updates.name;
    }
    if (updates.status !== undefined) {
      this.registration.status = updates.status;
    }
    if (updates.model !== undefined) {
      this.registration.model = updates.model;
    }
    this.registration.lastActivity = updates.lastActivity ?? Date.now();
    const generation = this.generation;

    // A reconnect on the way registers the updated presence itself; the update is then repeated.
    await this.withConnectedClient(generation, async (client) => {
      client.updatePresence({ ...updates, lastActivity: this.registration.lastActivity });
    });
    // The listing and the id come from the same connection, whichever one answered.
    const { peers, selfId } = await this.withConnectedClient(generation, async (client) => ({
      peers: await client.listPeers(),
      selfId: client.sessionId,
    }));
    const selfPresence = peers.find((peer) => peer.id === selfId);
    if (!selfPresence) {
      throw new Error("Peer-messaging runtime could not find its own presence after update.");
    }

    return selfPresence;
  }

  async listPeers(): Promise<PeerPresence[]> {
    return this.withConnectedClient(this.generation, (client) => client.listPeers());
  }

  async status(): Promise<PeerRuntimeStatus> {
    // Reported from the connection that answered, not one captured before a retry replaced it.
    return this.withConnectedClient(this.generation, async (client) => {
      const peers = await client.listPeers();
      return {
        connected: client.isConnected(),
        selfId: client.sessionId ?? undefined,
        activePeerCount: peers.length,
      } satisfies PeerRuntimeStatus;
    });
  }

  async send(request: { to: string; message: PeerMessage }): Promise<DeliveryResult> {
    const generation = this.generation;
    try {
      const targetId = await this.resolveTarget(generation, request.to);
      // Taken after resolving, which may have reconnected; the send itself is never retried.
      const client = await this.ensureConnected(generation);
      if (targetId === client.sessionId) {
        return {
          delivered: false,
          messageId: request.message.id,
          reason: "Cannot message the current session.",
        } satisfies DeliveryResult;
      }

      return await client.sendMessage(targetId, request.message);
    } catch (error) {
      return {
        delivered: false,
        messageId: request.message.id,
        reason: toError(error).message,
      } satisfies DeliveryResult;
    }
  }

  async ask(request: {
    to: string;
    message: PeerMessage;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<PeerMessage> {
    if (this.activeAsk) {
      throw new PeerAskInFlightError();
    }

    // The record exists, and its timer runs, before the first await: asks started in the same tick
    // cannot all pass the check above (AK5928), and disconnect or abort can end this one at any point.
    const timeoutMs = request.timeoutMs ?? DEFAULT_ASK_TIMEOUT_MS;
    let resolve!: (reply: PeerMessage) => void;
    let reject!: (error: Error) => void;
    const outcome = new Promise<PeerMessage>((resolveOutcome, rejectOutcome) => {
      resolve = resolveOutcome;
      reject = rejectOutcome;
    });
    // The caller awaits `outcome`; this only keeps an early rejection from counting as unhandled.
    outcome.catch(() => {});

    const signal = request.signal;
    const onAbort = () => {
      this.finishAsk(ask, { error: new PeerAskCancelledError(request.message.id) });
    };
    const ask: ActiveAsk = {
      messageId: request.message.id,
      targetInput: request.to,
      timeoutMs,
      targetId: null,
      client: null,
      delivered: false,
      resolve,
      reject,
      timeout: setTimeout(
        () => {
          this.finishAsk(ask, { error: lostAskError(ask, "timeout") });
        },
        Math.min(timeoutMs, MAX_TIMER_DELAY_MS),
      ),
      detachAbort: () => signal?.removeEventListener("abort", onAbort),
    };
    this.activeAsk = ask;
    try {
      if (signal?.aborted) {
        onAbort();
      } else {
        signal?.addEventListener("abort", onAbort, { once: true });
      }
    } catch (error) {
      this.finishAsk(ask, { error: toError(error) });
      return outcome;
    }

    void this.sendAsk(ask, request.message, this.generation);
    return outcome;
  }

  private async sendAsk(ask: ActiveAsk, message: PeerMessage, generation: number): Promise<void> {
    try {
      // An ask that already ended (cancelled, timed out, disconnected) does no connect or send work.
      if (this.activeAsk !== ask) {
        return;
      }
      const targetId = await this.resolveTarget(generation, ask.targetInput);
      if (this.activeAsk !== ask) {
        return;
      }
      // Take the client after resolving: resolving may have reconnected.
      const client = await this.ensureConnected(generation);
      if (this.activeAsk !== ask) {
        return;
      }
      if (targetId === client.sessionId) {
        this.finishAsk(ask, { error: new Error("Cannot ask the current session.") });
        return;
      }

      ask.targetId = targetId;
      ask.client = client;
      const delivery = await client.sendMessage(targetId, message, {
        onDelivered: () => {
          ask.delivered = true;
        },
      });
      if (!delivery.delivered) {
        this.finishAsk(ask, {
          error: new Error(
            delivery.reason
              ? `Message to "${ask.targetInput}" was not delivered: ${delivery.reason}`
              : `Message to "${ask.targetInput}" was not delivered.`,
          ),
        });
      }
    } catch (error) {
      this.finishAsk(ask, { error: toError(error) });
    }
  }

  /**
   * Starts the broker if needed and registers a new connection (under `requestedId` when replacing
   * one); a connection that disconnect() overtook is closed again instead of being returned.
   */
  private async connectClient(
    generation: number,
    requestedId?: string,
  ): Promise<PeerMessagingClient> {
    if (generation !== this.generation) {
      throw new Error("PeerMessagingRuntime disconnected while connecting.");
    }
    if (this.autoStartBroker) {
      await spawnBrokerIfNeeded({
        paths: this.paths,
        packageRoot: this.packageRoot,
        runtimeDir: this.paths.runtimeDir,
        idleShutdownMs: this.idleShutdownMs,
      });
    }
    if (generation !== this.generation) {
      throw new Error("PeerMessagingRuntime disconnected while connecting.");
    }
    const client = new PeerMessagingClient({ paths: this.paths });
    client.on("disconnected", (error: Error) => {
      if (this.client === client) {
        this.client = null;
      }
      // Only the connection the question went out on can take its reply path away; one replaced
      // under its own id hands the reply path to its replacement.
      const ask = this.activeAsk;
      if (ask?.client === client && !this.replaced.has(client)) {
        this.finishAsk(ask, {
          error: lostAskError(
            ask,
            "runtime_disconnected",
            `Peer-messaging runtime disconnected (${error.message})`,
          ),
        });
      }
    });
    client.on("error", () => {
      // Transport errors surface through disconnected/retry behavior.
    });
    client.on("message", (from: PeerPresence, message: PeerMessage) => {
      this.emitMessage(from, message);
    });
    client.on("session_left", (sessionId: string) => {
      const ask = this.activeAsk;
      if (ask?.targetId === sessionId) {
        this.finishAsk(ask, { error: lostAskError(ask, "peer_disconnected") });
      }
    });
    client.on("presence_update", (presence: PeerPresence) => {
      if (presence.id === client.sessionId) {
        this.registration.name = presence.name;
        this.registration.model = presence.model;
        this.registration.status = presence.status;
        this.registration.lastActivity = presence.lastActivity;
      }
    });

    await client.connect({
      ...this.registration,
      ...(requestedId ? { id: requestedId } : {}),
      lastActivity: this.registration.lastActivity ?? Date.now(),
    });
    if (generation !== this.generation) {
      // disconnect() ran while this connect was in flight; do not leave the session registered.
      await client.disconnect();
      throw new Error("PeerMessagingRuntime disconnected while connecting.");
    }
    return client;
  }

  /** A replaced connection is no longer current, and its close no longer fails an ask. */
  private markReplaced(client: PeerMessagingClient): void {
    this.replaced.add(client);
    if (this.client === client) this.client = null;
  }

  /**
   * Lets go of a connection that was replaced (or could not be): an ask waiting on it moves to `next`
   * only when that kept its session id, since replies are addressed to it, and fails otherwise. Its
   * socket is closed without holding up the operation that asked for the new connection.
   */
  private retire(
    replacement: { client: PeerMessagingClient; sessionId: string | null },
    next?: PeerMessagingClient,
    error?: unknown,
  ): void {
    const { client: old, sessionId } = replacement;
    this.markReplaced(old);
    const ask = this.activeAsk;
    if (ask?.client === old) {
      if (next && sessionId && next.sessionId === sessionId) {
        ask.client = next;
      } else {
        this.finishAsk(ask, {
          error: lostAskError(
            ask,
            "runtime_disconnected",
            `Peer-messaging runtime could not keep its session (${error ? toError(error).message : "reconnected under a new session id"})`,
          ),
        });
      }
    }
    void old.disconnect().catch(() => {});
  }

  /** Settles `ask` once; later outcomes for an ask that already ended are ignored. */
  private finishAsk(ask: ActiveAsk, outcome: { reply: PeerMessage } | { error: Error }): void {
    if (this.activeAsk !== ask) {
      return;
    }
    this.activeAsk = null;
    clearTimeout(ask.timeout);
    if ("reply" in outcome) {
      ask.resolve(outcome.reply);
    } else {
      ask.reject(outcome.error);
    }
    try {
      ask.detachAbort();
    } catch {
      // A signal without a working removeEventListener has nothing to detach; the ask is settled.
    }
  }

  private emitMessage(from: PeerPresence, message: PeerMessage): void {
    const ask = this.activeAsk;
    // Before the question is sent (targetId null) nothing can be replying to it yet.
    if (ask?.targetId && message.replyTo === ask.messageId) {
      if (from.id !== ask.targetId) {
        this.finishAsk(ask, {
          error: new Error(
            `Received ambiguous reply for ask ${ask.messageId} from unexpected peer ${from.id}.`,
          ),
        });
        return;
      }

      this.finishAsk(ask, { reply: message });
      return;
    }

    for (const listener of [...this.messageListeners]) {
      try {
        listener(from, message);
      } catch {
        // Message listeners are consumer-side helpers; keep transport runtime stable.
      }
    }
  }

  private async resolveTarget(generation: number, to: string): Promise<string> {
    const peers = await this.withConnectedClient(generation, (client) => client.listPeers());
    const byId = peers.find((peer) => peer.id === to);
    if (byId) {
      return byId.id;
    }

    const lowerTarget = to.toLowerCase();
    const byAddressLabel = peers.filter((peer) => peer.addressLabel.toLowerCase() === lowerTarget);
    if (byAddressLabel.length === 0) {
      throw new Error(`No peer matched "${to}".`);
    }

    if (byAddressLabel.length > 1) {
      throw new Error(`Multiple peers matched "${to}". Use the exact session id instead.`);
    }

    const [resolvedPeer] = byAddressLabel;
    if (!resolvedPeer) {
      throw new Error(`No peer matched "${to}".`);
    }

    return resolvedPeer.id;
  }

  private async withConnectedClient<T>(
    generation: number,
    action: (client: PeerMessagingClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.ensureConnected(generation);
    // Taken now: a connection reset clears the client's id before the failure arrives here.
    const sessionId = client.sessionId;
    try {
      return await action(client);
    } catch (error) {
      // A disconnect() since the operation started is final for it: never reconnect behind it.
      if (!isRecoverableClientError(error) || generation !== this.generation) {
        throw error;
      }
      // Re-register under the same id, so the broker replaces the old connection silently: no ghost
      // registration left behind (a duplicate name would then fail closed) and no session_left that
      // would fail peers' asks.
      const reconnectedClient = await this.ensureConnected(generation, { client, sessionId });
      return action(reconnectedClient);
    }
  }

  private async ensureConnected(
    generation: number,
    replacement?: { client: PeerMessagingClient; sessionId: string | null },
  ): Promise<PeerMessagingClient> {
    const replacing = replacement?.client;
    if (generation !== this.generation) {
      throw new Error("PeerMessagingRuntime disconnected.");
    }
    if (!replacing && this.client?.isConnected()) {
      return this.client;
    }
    // Another operation may already have replaced it.
    if (replacing && this.client && this.client !== replacing && this.client.isConnected()) {
      return this.client;
    }

    if (this.connectPromise) {
      if (!replacement) return this.connectPromise;
      // Joins a connect already under way; the connection being replaced is let go either way.
      try {
        const client = await this.connectPromise;
        this.retire(replacement, client);
        return client;
      } catch (error) {
        this.retire(replacement, undefined, error);
        throw error;
      }
    }

    const connecting = (async () => {
      // A connect interrupted by the last disconnect() must be closed before this one registers.
      if (this.disconnecting) {
        await this.disconnecting;
      }
      // Its close is expected from here on: it must not fail an ask that moves to the replacement.
      if (replacing) this.markReplaced(replacing);
      try {
        const client = await this.connectClient(generation, replacement?.sessionId ?? undefined);
        this.client = client;
        if (replacement) this.retire(replacement, client);
        return client;
      } catch (error) {
        // Not replaced after all: the old connection is closed rather than left registered.
        if (replacement) this.retire(replacement, undefined, error);
        throw error;
      }
    })().finally(() => {
      if (this.connectPromise === connecting) {
        this.connectPromise = null;
      }
    });
    this.connectPromise = connecting;

    return connecting;
  }
}

export async function createPeerMessagingRuntime(
  options: CreatePeerMessagingRuntimeOptions,
): Promise<ManagedPeerMessagingRuntime> {
  const manager = new PeerMessagingRuntimeManager(options);
  await manager.status();

  const runtime = definePeerMessagingRuntime({
    listPeers: async () => manager.listPeers(),
    send: async (request) => manager.send(request),
    ask: async (request) => manager.ask(request),
    status: async () => manager.status(),
  });

  return Object.freeze({
    ...runtime,
    disconnect: async () => manager.disconnect(),
    updatePresence: async (updates: PeerPresenceUpdate) => manager.updatePresence(updates),
    getPaths: () => manager.paths,
    onMessage: (listener: PeerMessageListener) => manager.onMessage(listener),
  });
}
