import { PeerMessagingClient } from "./client.ts";
import {
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

export interface ManagedPeerMessagingRuntime extends PeerMessagingRuntime {
  disconnect(): Promise<void>;
  updatePresence(updates: PeerPresenceUpdate): Promise<PeerPresence>;
  getPaths(): PeerMessagingPaths;
}

class PeerMessagingRuntimeManager {
  readonly paths: PeerMessagingPaths;

  private readonly autoStartBroker: boolean;
  private readonly packageRoot?: string;
  private readonly idleShutdownMs?: number;
  private readonly registration: PeerRegistration;
  private client: PeerMessagingClient | null = null;
  private connectPromise: Promise<PeerMessagingClient> | null = null;

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

  async disconnect(): Promise<void> {
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

    const client = (await this.ensureConnected()) as PeerMessagingClient;
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
    const client = (await this.ensureConnected()) as PeerMessagingClient;
    const peers = await this.withConnectedClient((connectedClient) => connectedClient.listPeers());
    return {
      connected: client.isConnected(),
      selfId: client.sessionId ?? undefined,
      activePeerCount: peers.length,
    } satisfies PeerRuntimeStatus;
  }

  async send(_request: { to: string; message: PeerMessage }): Promise<DeliveryResult> {
    throw new Error(
      "PeerMessagingRuntime.send is not implemented yet. PM-2 lands broker/client runtime and peer presence; PM-3 adds direct send/ask semantics.",
    );
  }

  async ask(_request: {
    to: string;
    message: PeerMessage;
    timeoutMs?: number;
  }): Promise<PeerMessage> {
    throw new Error(
      "PeerMessagingRuntime.ask is not implemented yet. PM-2 lands broker/client runtime and peer presence; PM-3 adds direct send/ask semantics.",
    );
  }

  private async withConnectedClient<T>(
    action: (client: PeerMessagingClient) => Promise<T>,
    allowRetry: boolean = true,
  ): Promise<T> {
    const client = await this.ensureConnected();
    try {
      return await action(client);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry =
        allowRetry &&
        (message.includes("not connected") ||
          message.includes("socket is not writable") ||
          message.includes("timed out") ||
          message.includes("disconnected"));
      if (!shouldRetry) {
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
      client.on("disconnected", () => {
        if (this.client === client) {
          this.client = null;
        }
      });
      client.on("error", () => {
        // Transport errors surface through disconnected/retry behavior.
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
  });
}
