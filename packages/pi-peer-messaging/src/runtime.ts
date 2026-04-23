import { PeerMessagingClient } from "./client.ts";
import {
  DEFAULT_ASK_TIMEOUT_MS,
  type DeliveryResult,
  definePeerMessagingRuntime,
  type PeerMessage,
  type PeerMessagingRuntime,
  type PeerPresence,
  type PeerRuntimeStatus,
} from "./contracts.ts";
import { type PeerMessagingPaths, resolvePeerMessagingPaths } from "./paths.ts";
import type { PeerPresenceUpdate, PeerRegistration } from "./presence.ts";
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

interface PendingAsk {
  targetId: string;
  targetInput: string;
  messageId: string;
  resolve: (message: PeerMessage) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isRecoverableClientError(error: unknown): boolean {
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
  private pendingAsk: PendingAsk | null = null;

  constructor(options: CreatePeerMessagingRuntimeOptions) {
    this.paths = options.paths ?? resolvePeerMessagingPaths({ runtimeDir: options.runtimeDir });
    this.autoStartBroker = options.autoStartBroker ?? true;
    this.packageRoot = options.packageRoot;
    this.idleShutdownMs = options.idleShutdownMs;
    this.registration = {
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
    this.rejectPendingAsk(new Error("PeerMessagingRuntime disconnected while waiting for reply."));

    const client = this.client;
    this.client = null;
    this.connectPromise = null;
    if (!client) {
      return;
    }

    await client.disconnect();
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

    const client = await this.ensureConnected();
    client.updatePresence({
      ...updates,
      lastActivity: this.registration.lastActivity,
    });

    const peers = await this.withConnectedClient((connectedClient) => connectedClient.listPeers());
    const selfPresence = peers.find((peer) => peer.id === client.sessionId);
    if (!selfPresence) {
      throw new Error("Peer-messaging runtime could not find its own presence after update.");
    }

    return selfPresence;
  }

  async listPeers(): Promise<PeerPresence[]> {
    return this.withConnectedClient((client) => client.listPeers());
  }

  async status(): Promise<PeerRuntimeStatus> {
    const client = await this.ensureConnected();
    const peers = await this.withConnectedClient((connectedClient) => connectedClient.listPeers());
    return {
      connected: client.isConnected(),
      selfId: client.sessionId ?? undefined,
      activePeerCount: peers.length,
    } satisfies PeerRuntimeStatus;
  }

  async send(request: { to: string; message: PeerMessage }): Promise<DeliveryResult> {
    try {
      const client = await this.ensureConnected();
      const targetId = await this.resolveTarget(request.to);
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
  }): Promise<PeerMessage> {
    if (this.pendingAsk) {
      throw new Error("Already waiting for a reply.");
    }

    const client = await this.ensureConnected();
    const targetId = await this.resolveTarget(request.to);
    if (targetId === client.sessionId) {
      throw new Error("Cannot ask the current session.");
    }

    const replyPromise = this.createPendingAsk(
      targetId,
      request.to,
      request.message.id,
      request.timeoutMs ?? DEFAULT_ASK_TIMEOUT_MS,
    );

    try {
      const delivery = await client.sendMessage(targetId, request.message);
      if (!delivery.delivered) {
        this.rejectPendingAsk(
          new Error(
            delivery.reason
              ? `Message to "${request.to}" was not delivered: ${delivery.reason}`
              : `Message to "${request.to}" was not delivered.`,
          ),
        );
      }
    } catch (error) {
      this.rejectPendingAsk(toError(error));
    }

    return replyPromise;
  }

  private createPendingAsk(
    targetId: string,
    targetInput: string,
    messageId: string,
    timeoutMs: number,
  ): Promise<PeerMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.rejectPendingAsk(new Error(`No reply from "${targetInput}" within ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pendingAsk = {
        targetId,
        targetInput,
        messageId,
        resolve,
        reject,
        timeout,
      };
    });
  }

  private resolvePendingAsk(message: PeerMessage): void {
    const pendingAsk = this.pendingAsk;
    if (!pendingAsk) {
      return;
    }

    clearTimeout(pendingAsk.timeout);
    this.pendingAsk = null;
    pendingAsk.resolve(message);
  }

  private rejectPendingAsk(error: Error): void {
    const pendingAsk = this.pendingAsk;
    if (!pendingAsk) {
      return;
    }

    clearTimeout(pendingAsk.timeout);
    this.pendingAsk = null;
    pendingAsk.reject(error);
  }

  private emitMessage(from: PeerPresence, message: PeerMessage): void {
    const pendingAsk = this.pendingAsk;
    if (pendingAsk && message.replyTo === pendingAsk.messageId) {
      if (from.id !== pendingAsk.targetId) {
        this.rejectPendingAsk(
          new Error(
            `Received ambiguous reply for ask ${pendingAsk.messageId} from unexpected peer ${from.id}.`,
          ),
        );
        return;
      }

      this.resolvePendingAsk(message);
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

  private async resolveTarget(to: string): Promise<string> {
    const peers = await this.withConnectedClient((connectedClient) => connectedClient.listPeers());
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
    action: (client: PeerMessagingClient) => Promise<T>,
    allowRetry: boolean = true,
  ): Promise<T> {
    const client = await this.ensureConnected();
    try {
      return await action(client);
    } catch (error) {
      if (!allowRetry || !isRecoverableClientError(error)) {
        throw error;
      }

      this.client = null;
      const reconnectedClient = await this.ensureConnected(true);
      return action(reconnectedClient);
    }
  }

  private async ensureConnected(forceReconnect: boolean = false): Promise<PeerMessagingClient> {
    if (!forceReconnect && this.client?.isConnected()) {
      return this.client;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      if (forceReconnect && this.client) {
        try {
          await this.client.disconnect();
        } catch {
          // Best-effort disconnect before recreating the client.
        }
        this.client = null;
      }

      if (this.autoStartBroker) {
        await spawnBrokerIfNeeded({
          paths: this.paths,
          packageRoot: this.packageRoot,
          runtimeDir: this.paths.runtimeDir,
          idleShutdownMs: this.idleShutdownMs,
        });
      }

      const client = new PeerMessagingClient({ paths: this.paths });
      client.on("disconnected", (error: Error) => {
        if (this.client === client) {
          this.client = null;
        }
        this.rejectPendingAsk(
          new Error(
            `Peer-messaging runtime disconnected while waiting for reply: ${error.message}`,
            { cause: error },
          ),
        );
      });
      client.on("error", () => {
        // Transport errors surface through disconnected/retry behavior.
      });
      client.on("message", (from: PeerPresence, message: PeerMessage) => {
        this.emitMessage(from, message);
      });
      client.on("session_left", (sessionId: string) => {
        const pendingAsk = this.pendingAsk;
        if (pendingAsk?.targetId === sessionId) {
          this.rejectPendingAsk(
            new Error(`Peer "${pendingAsk.targetInput}" disconnected before replying.`),
          );
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
        lastActivity: this.registration.lastActivity ?? Date.now(),
      });
      this.client = client;
      return client;
    })().finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
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
