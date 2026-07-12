// ---
// summary: implements the local socket broker for peer registration, presence, and message delivery
// read_when:
//   - changing broker protocol handling, routing, or session cleanup
// ---
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";

import {
  assertPeerMessage,
  assertPeerPresence,
  type PeerMessage,
  type PeerPresence,
} from "./contracts.ts";
import { createFramedMessageReader, writeFramedMessage } from "./framing.ts";
import { type PeerMessagingPaths, resolvePeerMessagingPaths } from "./paths.ts";
import {
  applyPresenceUpdate,
  buildPeerPresence,
  type PeerPresenceUpdate,
  type PeerRegistration,
} from "./presence.ts";
import type { PeerBrokerMessage } from "./protocol.ts";

interface ConnectedPeerSession {
  socket: net.Socket;
  presence: PeerPresence;
}

export interface PeerMessagingBrokerOptions {
  runtimeDir?: string;
  paths?: PeerMessagingPaths;
  idleShutdownMs?: number;
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

function resolveRequestedSessionId(registration: PeerRegistration): string {
  const requested = registration.id?.trim();
  if (!requested) {
    return `session-${randomUUID()}`;
  }

  const normalized = requested.startsWith("session-") ? requested : `session-${requested}`;
  const sanitized = normalized.replace(/[^a-zA-Z0-9-]/g, "-");
  return sanitized === "session-" ? `session-${randomUUID()}` : sanitized;
}

function assertOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return assertString(value, label);
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }

  return value;
}

function assertPeerRegistration(value: unknown): PeerRegistration {
  const record = assertRecord(value, "PeerRegistration");

  return {
    id: assertOptionalString(record.id, "PeerRegistration.id"),
    name: assertOptionalString(record.name, "PeerRegistration.name"),
    cwd: assertString(record.cwd, "PeerRegistration.cwd"),
    model: assertString(record.model, "PeerRegistration.model"),
    pid: assertFiniteNumber(record.pid, "PeerRegistration.pid"),
    startedAt: assertFiniteNumber(record.startedAt, "PeerRegistration.startedAt"),
    lastActivity:
      record.lastActivity === undefined
        ? undefined
        : assertFiniteNumber(record.lastActivity, "PeerRegistration.lastActivity"),
    status: assertOptionalString(record.status, "PeerRegistration.status"),
  };
}

function assertPresenceUpdate(value: unknown): PeerPresenceUpdate {
  const record = assertRecord(value, "PeerPresenceUpdate");

  return {
    name: assertOptionalString(record.name, "PeerPresenceUpdate.name"),
    status: assertOptionalString(record.status, "PeerPresenceUpdate.status"),
    model: assertOptionalString(record.model, "PeerPresenceUpdate.model"),
    lastActivity:
      record.lastActivity === undefined
        ? undefined
        : assertFiniteNumber(record.lastActivity, "PeerPresenceUpdate.lastActivity"),
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class PeerMessagingBroker {
  readonly paths: PeerMessagingPaths;

  private readonly idleShutdownMs: number;
  private readonly sessions = new Map<string, ConnectedPeerSession>();
  private readonly server: net.Server;
  private shutdownTimer: NodeJS.Timeout | null = null;
  private started = false;
  private stopping: Promise<void> | null = null;

  constructor(options: PeerMessagingBrokerOptions = {}) {
    this.paths = options.paths ?? resolvePeerMessagingPaths({ runtimeDir: options.runtimeDir });
    this.idleShutdownMs = options.idleShutdownMs ?? 5_000;
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    fs.mkdirSync(this.paths.runtimeDir, { recursive: true });
    if (process.platform !== "win32") {
      try {
        fs.unlinkSync(this.paths.socketPath);
      } catch {
        // No stale socket to remove.
      }
    }

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        resolve();
      };

      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(this.paths.socketPath);
    });

    fs.writeFileSync(this.paths.pidPath, String(process.pid), "utf8");
    this.started = true;
  }

  async stop(): Promise<void> {
    if (this.stopping) {
      return this.stopping;
    }

    this.stopping = (async () => {
      if (this.shutdownTimer) {
        clearTimeout(this.shutdownTimer);
        this.shutdownTimer = null;
      }

      for (const session of this.sessions.values()) {
        session.socket.destroy();
      }
      this.sessions.clear();

      await new Promise<void>((resolve) => {
        this.server.close(() => {
          resolve();
        });
      });

      if (process.platform !== "win32") {
        try {
          fs.unlinkSync(this.paths.socketPath);
        } catch {
          // Socket already removed.
        }
      }

      try {
        fs.unlinkSync(this.paths.pidPath);
      } catch {
        // PID file already removed.
      }

      this.started = false;
      this.stopping = null;
    })();

    return this.stopping;
  }

  private handleConnection(socket: net.Socket): void {
    let sessionId: string | null = null;

    const reader = createFramedMessageReader(
      (message) => {
        this.handleClientMessage(socket, message, sessionId, (nextSessionId) => {
          sessionId = nextSessionId;
        });
      },
      (error) => {
        socket.destroy(error);
      },
    );

    socket.on("data", reader);
    socket.on("close", () => {
      if (!sessionId) {
        return;
      }

      this.sessions.delete(sessionId);
      this.broadcast({ type: "session_left", sessionId }, sessionId);
      this.scheduleIdleShutdown();
    });
    socket.on("error", () => {
      // Socket-specific errors are handled through close/disconnect cleanup.
    });
  }

  private scheduleIdleShutdown(): void {
    if (this.shutdownTimer || this.sessions.size > 0) {
      return;
    }

    this.shutdownTimer = setTimeout(() => {
      this.shutdownTimer = null;
      if (this.sessions.size === 0) {
        void this.stop();
      }
    }, this.idleShutdownMs);
  }

  private handleClientMessage(
    socket: net.Socket,
    message: unknown,
    currentSessionId: string | null,
    setSessionId: (sessionId: string | null) => void,
  ): void {
    const record = assertRecord(message, "PeerClientMessage");
    const type = assertString(record.type, "PeerClientMessage.type");

    if (!currentSessionId && type !== "register") {
      throw new Error(`Received ${type} before register.`);
    }

    switch (type) {
      case "register": {
        if (currentSessionId) {
          throw new Error("Received duplicate register message.");
        }

        const registration = assertPeerRegistration(record.session);
        const sessionId = resolveRequestedSessionId(registration);
        const existingSession = this.sessions.get(sessionId);
        if (existingSession) {
          existingSession.socket.destroy(
            new Error(`Peer session ${sessionId} re-registered; replacing stale connection.`),
          );
          this.sessions.delete(sessionId);
        }
        const presence = buildPeerPresence(sessionId, registration);

        this.sessions.set(sessionId, { socket, presence });
        setSessionId(sessionId);
        if (this.shutdownTimer) {
          clearTimeout(this.shutdownTimer);
          this.shutdownTimer = null;
        }

        writeFramedMessage(socket, { type: "registered", sessionId, self: presence });
        this.broadcast({ type: "session_joined", session: presence }, sessionId);
        break;
      }

      case "unregister": {
        const sessionId = currentSessionId ?? "";
        this.sessions.delete(sessionId);
        this.broadcast({ type: "session_left", sessionId }, sessionId);
        setSessionId(null);
        this.scheduleIdleShutdown();
        break;
      }

      case "list": {
        const requestId = assertString(record.requestId, "PeerClientMessage.requestId");
        const sessions = [...this.sessions.values()].map((session) => session.presence);
        sessions.forEach((presence) => {
          assertPeerPresence(presence);
        });
        writeFramedMessage(socket, { type: "sessions", requestId, sessions });
        break;
      }

      case "presence": {
        const sessionId = currentSessionId ?? "";
        const session = this.sessions.get(sessionId);
        if (!session) {
          throw new Error(`Could not find session ${sessionId} for presence update.`);
        }

        session.presence = applyPresenceUpdate(session.presence, assertPresenceUpdate(record));
        this.broadcast({ type: "presence_update", session: session.presence }, sessionId);
        break;
      }

      case "send": {
        const sessionId = currentSessionId ?? "";
        const session = this.sessions.get(sessionId);
        const to = assertString(record.to, "PeerClientMessage.to");
        if (!session) {
          throw new Error(`Could not find session ${sessionId} for message delivery.`);
        }

        assertPeerMessage(record.message);
        this.handleDelivery(socket, session.presence, to, record.message);
        break;
      }

      default:
        throw new Error(`Unknown client message type: ${type}`);
    }
  }

  private handleDelivery(
    senderSocket: net.Socket,
    from: PeerPresence,
    to: string,
    message: PeerMessage,
  ): void {
    const targets = this.findTargets(to);
    if (targets.length === 0) {
      writeFramedMessage(senderSocket, {
        type: "delivery_failed",
        messageId: message.id,
        reason: `No peer matched "${to}".`,
      });
      return;
    }

    if (targets.length > 1) {
      writeFramedMessage(senderSocket, {
        type: "delivery_failed",
        messageId: message.id,
        reason: `Multiple peers matched "${to}". Use the exact session id instead.`,
      });
      return;
    }

    writeFramedMessage(targets[0].socket, {
      type: "message",
      from,
      message,
    });
    writeFramedMessage(senderSocket, {
      type: "delivered",
      messageId: message.id,
    });
  }

  private findTargets(nameOrId: string): ConnectedPeerSession[] {
    const exactId = this.sessions.get(nameOrId);
    if (exactId) {
      return [exactId];
    }

    const lowerValue = nameOrId.toLowerCase();
    return [...this.sessions.values()].filter((session) => {
      return session.presence.addressLabel.toLowerCase() === lowerValue;
    });
  }

  private broadcast(message: PeerBrokerMessage, excludeSessionId?: string): void {
    for (const [sessionId, session] of this.sessions) {
      if (sessionId === excludeSessionId) {
        continue;
      }

      try {
        writeFramedMessage(session.socket, message);
      } catch (error) {
        session.socket.destroy(toError(error));
      }
    }
  }
}
