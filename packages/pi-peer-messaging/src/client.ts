/**
summary: "Implements the peer broker socket client, registration lifecycle, bounded requests, presence updates, and events."
read_when:
  - "Changing broker connection state, list or send timeouts, delivery correlation, or disconnect cleanup."
*/
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import net from "node:net";

import {
  assertDeliveryResult,
  assertPeerMessage,
  assertPeerPresence,
  type DeliveryResult,
  type PeerMessage,
  type PeerPresence,
} from "./contracts.ts";
import { createFramedMessageReader, writeFramedMessage } from "./framing.ts";
import { type PeerMessagingPaths, resolvePeerMessagingPaths } from "./paths.ts";
import type { PeerPresenceUpdate, PeerRegistration } from "./presence.ts";

interface PendingListRequest {
  resolve: (peers: PeerPresence[]) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface PendingSendRequest {
  resolve: (result: DeliveryResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string.`);
  }

  return value;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class PeerMessagingClient extends EventEmitter {
  readonly paths: PeerMessagingPaths;

  private socket: net.Socket | null = null;
  private currentSessionId: string | null = null;
  private currentSelfPresence: PeerPresence | null = null;
  private connectPromise: Promise<PeerPresence> | null = null;
  private readonly pendingLists = new Map<string, PendingListRequest>();
  private readonly pendingSends = new Map<string, PendingSendRequest>();
  private disconnecting = false;
  private disconnectError: Error | null = null;

  constructor(options: { runtimeDir?: string; paths?: PeerMessagingPaths } = {}) {
    super();
    this.paths = options.paths ?? resolvePeerMessagingPaths({ runtimeDir: options.runtimeDir });
  }

  get sessionId(): string | null {
    return this.currentSessionId;
  }

  get selfPresence(): PeerPresence | null {
    return this.currentSelfPresence;
  }

  isConnected(): boolean {
    const socket = this.socket;
    return Boolean(
      socket &&
        this.currentSessionId &&
        !this.disconnecting &&
        !socket.destroyed &&
        !socket.writableEnded &&
        socket.writable,
    );
  }

  async connect(registration: PeerRegistration): Promise<PeerPresence> {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    if (this.socket) {
      throw new Error("PeerMessagingClient is already connected.");
    }

    this.connectPromise = new Promise<PeerPresence>((resolve, reject) => {
      const socket = net.connect(this.paths.socketPath);
      this.socket = socket;
      this.disconnecting = false;
      this.disconnectError = null;
      let settled = false;
      let ready = false;

      const finishError = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanupConnectListeners();
        cleanupSocketListeners();
        if (this.socket === socket) {
          this.socket = null;
        }
        socket.destroy();
        reject(error);
      };

      const finishReady = (presence: PeerPresence) => {
        if (settled) {
          return;
        }

        settled = true;
        ready = true;
        cleanupConnectListeners();
        resolve(presence);
      };

      const onClose = () => {
        const disconnectError =
          this.disconnectError ?? new Error("PeerMessagingClient disconnected.");
        cleanupConnectListeners();
        cleanupSocketListeners();
        this.failPending(disconnectError);
        if (this.socket === socket) {
          this.socket = null;
        }
        this.currentSessionId = null;
        this.currentSelfPresence = null;
        this.disconnecting = false;
        this.disconnectError = null;

        if (!ready) {
          reject(new Error("Connection closed before peer registration completed."));
          return;
        }

        this.emit("disconnected", disconnectError);
      };

      const onSocketError = (error: Error) => {
        if (!ready) {
          finishError(error);
          return;
        }

        this.disconnectError = error;
        this.emit("error", error);
      };

      const onReaderError = (error: Error) => {
        const wrapped = new Error(`Peer-messaging protocol error: ${error.message}`, {
          cause: error,
        });
        if (!ready) {
          finishError(wrapped);
          return;
        }

        this.disconnectError = wrapped;
        this.emit("error", wrapped);
        socket.destroy(wrapped);
      };

      const reader = createFramedMessageReader((message) => {
        const readyPresence = this.handleBrokerMessage(message);
        if (readyPresence) {
          finishReady(readyPresence);
        }
      }, onReaderError);

      const onConnect = () => {
        try {
          writeFramedMessage(socket, {
            type: "register",
            session: registration,
          });
        } catch (error) {
          finishError(toError(error));
        }
      };

      const connectTimeout = setTimeout(() => {
        finishError(new Error("PeerMessagingClient connection timed out."));
      }, 10_000);

      const cleanupConnectListeners = () => {
        clearTimeout(connectTimeout);
        socket.off("connect", onConnect);
      };

      const cleanupSocketListeners = () => {
        socket.off("data", reader);
        socket.off("close", onClose);
        socket.off("error", onSocketError);
      };

      socket.on("connect", onConnect);
      socket.on("data", reader);
      socket.on("close", onClose);
      socket.on("error", onSocketError);
    }).finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    const socket = this.socket;
    if (!socket) {
      return;
    }

    this.disconnecting = true;
    this.failPending(new Error("PeerMessagingClient disconnected."));

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        socket.off("close", onClose);
        socket.off("error", onError);
        resolve();
      };
      const onClose = () => {
        finish();
      };
      const onError = () => {
        socket.destroy();
      };
      const timeout = setTimeout(() => {
        socket.destroy();
      }, 2_000);

      socket.once("close", onClose);
      socket.once("error", onError);

      try {
        writeFramedMessage(socket, { type: "unregister" });
        socket.end();
      } catch {
        socket.destroy();
      }
    });
  }

  async listPeers(): Promise<PeerPresence[]> {
    const socket = this.requireSocket();
    return new Promise((resolve, reject) => {
      const requestId = randomUUID();
      const timeout = setTimeout(() => {
        const pending = this.pendingLists.get(requestId);
        if (!pending) {
          return;
        }

        this.pendingLists.delete(requestId);
        pending.reject(new Error("PeerMessagingClient listPeers timed out."));
      }, 3_000);

      this.pendingLists.set(requestId, {
        resolve: (peers) => {
          clearTimeout(timeout);
          resolve(peers);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout,
      });

      try {
        writeFramedMessage(socket, { type: "list", requestId });
      } catch (error) {
        clearTimeout(timeout);
        this.pendingLists.delete(requestId);
        reject(toError(error));
      }
    });
  }

  async sendMessage(to: string, message: PeerMessage): Promise<DeliveryResult> {
    const socket = this.requireSocket();
    assertPeerMessage(message);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.pendingSends.get(message.id);
        if (!pending) {
          return;
        }

        this.pendingSends.delete(message.id);
        pending.reject(new Error("PeerMessagingClient sendMessage timed out."));
      }, 10_000);

      this.pendingSends.set(message.id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout,
      });

      try {
        writeFramedMessage(socket, { type: "send", to, message });
      } catch (error) {
        clearTimeout(timeout);
        this.pendingSends.delete(message.id);
        reject(toError(error));
      }
    });
  }

  updatePresence(updates: PeerPresenceUpdate): void {
    const socket = this.requireSocket();
    try {
      writeFramedMessage(socket, { type: "presence", ...updates });
    } catch (error) {
      throw toError(error);
    }
  }

  private requireSocket(): net.Socket {
    if (this.disconnecting) {
      throw new Error("PeerMessagingClient is disconnecting.");
    }

    const socket = this.socket;
    if (!socket || !this.currentSessionId) {
      throw new Error("PeerMessagingClient is not connected.");
    }

    if (socket.destroyed || socket.writableEnded || !socket.writable) {
      throw new Error("PeerMessagingClient socket is not writable.");
    }

    return socket;
  }

  private failPending(error: Error): void {
    for (const pending of this.pendingLists.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingLists.clear();

    for (const pending of this.pendingSends.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingSends.clear();
  }

  private handleBrokerMessage(message: unknown): PeerPresence | null {
    const record = assertRecord(message, "PeerBrokerMessage");
    const type = assertString(record.type, "PeerBrokerMessage.type");

    switch (type) {
      case "registered": {
        const sessionId = assertString(record.sessionId, "PeerBrokerMessage.sessionId");
        assertPeerPresence(record.self);
        this.currentSessionId = sessionId;
        this.currentSelfPresence = record.self;
        return record.self;
      }

      case "sessions": {
        const requestId = assertString(record.requestId, "PeerBrokerMessage.requestId");
        if (!Array.isArray(record.sessions)) {
          throw new TypeError("PeerBrokerMessage.sessions must be an array.");
        }
        const sessions = record.sessions.map((entry) => {
          assertPeerPresence(entry);
          return entry;
        });
        const pending = this.pendingLists.get(requestId);
        if (!pending) {
          return null;
        }

        this.pendingLists.delete(requestId);
        pending.resolve(sessions);
        return null;
      }

      case "delivered": {
        const messageId = assertString(record.messageId, "PeerBrokerMessage.messageId");
        const pending = this.pendingSends.get(messageId);
        if (!pending) {
          return null;
        }

        this.pendingSends.delete(messageId);
        const result = {
          delivered: true,
          messageId,
        } satisfies DeliveryResult;
        assertDeliveryResult(result);
        pending.resolve(result);
        return null;
      }

      case "delivery_failed": {
        const messageId = assertString(record.messageId, "PeerBrokerMessage.messageId");
        const reason = assertString(record.reason, "PeerBrokerMessage.reason");
        const pending = this.pendingSends.get(messageId);
        if (!pending) {
          return null;
        }

        this.pendingSends.delete(messageId);
        const result = {
          delivered: false,
          messageId,
          reason,
        } satisfies DeliveryResult;
        assertDeliveryResult(result);
        pending.resolve(result);
        return null;
      }

      case "message": {
        assertPeerPresence(record.from);
        assertPeerMessage(record.message);
        this.emit("message", record.from, record.message);
        return null;
      }

      case "session_joined": {
        assertPeerPresence(record.session);
        this.emit("session_joined", record.session);
        return null;
      }

      case "presence_update": {
        assertPeerPresence(record.session);
        if (record.session.id === this.currentSessionId) {
          this.currentSelfPresence = record.session;
        }
        this.emit("presence_update", record.session);
        return null;
      }

      case "session_left": {
        const sessionId = assertString(record.sessionId, "PeerBrokerMessage.sessionId");
        this.emit("session_left", sessionId);
        return null;
      }

      case "error": {
        const error = new Error(assertString(record.error, "PeerBrokerMessage.error"));
        this.emit("error", error);
        return null;
      }

      default:
        throw new Error(`Unknown broker message type: ${type}`);
    }
  }
}
