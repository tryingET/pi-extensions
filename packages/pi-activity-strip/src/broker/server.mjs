import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
/** @typedef {import("../common/contracts.ts").ActivityStripBrokerOptions} ActivityStripBrokerOptions */
import {
  ACTIVITY_STRIP_BROADCAST_TICK_MS,
  ACTIVITY_STRIP_SOCKET_DIR,
  ACTIVITY_STRIP_SOCKET_PATH,
} from "../common/constants.mjs";
import { SessionStore } from "./session-store.mjs";

/** @param {string} filePath */
function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}

/** @param {string} line */
function parseLine(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

export class ActivityStripBroker extends EventEmitter {
  /** @param {ActivityStripBrokerOptions} [options] */
  constructor(options = {}) {
    super();
    this.socketPath = options.socketPath ?? ACTIVITY_STRIP_SOCKET_PATH;
    this.socketDir = options.socketDir ?? ACTIVITY_STRIP_SOCKET_DIR;
    this.store = options.store ?? new SessionStore();
    this.getRuntimeStatus = options.getRuntimeStatus ?? (() => undefined);
    this.server = net.createServer((socket) => this.handleConnection(socket));
    this.tick = null;
  }

  async start() {
    fs.mkdirSync(this.socketDir, { recursive: true });
    safeUnlink(this.socketPath);

    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.socketPath, () => {
        this.server.off("error", reject);
        resolve(undefined);
      });
    });

    this.tick = setInterval(() => {
      this.emitSnapshot();
    }, ACTIVITY_STRIP_BROADCAST_TICK_MS);
    this.tick.unref?.();
    this.emitSnapshot();
  }

  emitSnapshot() {
    this.emit("snapshot", this.store.snapshot());
  }

  /** @param {import("node:net").Socket} socket @param {Record<string, unknown>} message */
  reply(socket, message) {
    socket.write(`${JSON.stringify(message)}\n`);
  }

  /** @param {import("node:net").Socket} socket */
  handleConnection(socket) {
    let buffer = "";
    socket.setEncoding("utf8");

    socket.on("data", (chunk) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        this.handleMessage(socket, line);
        newlineIndex = buffer.indexOf("\n");
      }
    });
  }

  /** @param {import("node:net").Socket} socket @param {string} line */
  handleMessage(socket, line) {
    let message;
    try {
      message = parseLine(line);
    } catch (error) {
      this.reply(socket, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (!message) return;

    switch (message.type) {
      case "ping":
        this.reply(socket, {
          ok: true,
          type: "pong",
          snapshot: this.store.snapshot(),
          runtimeStatus: this.getRuntimeStatus(),
        });
        return;
      case "shutdown":
        this.reply(socket, { ok: true, type: "shutdown" });
        setTimeout(() => {
          this.emit("shutdown-requested");
        }, 20);
        return;
      case "remove":
        this.store.remove(message.sessionId);
        this.emitSnapshot();
        return;
      case "upsert":
        this.store.upsert(message.session);
        this.emitSnapshot();
        return;
      default:
        this.reply(socket, { ok: false, error: `Unsupported message type: ${message.type}` });
    }
  }

  async stop() {
    if (this.tick) {
      clearInterval(this.tick);
      this.tick = null;
    }

    await new Promise((resolve) => {
      this.server.close(() => resolve(undefined));
    });

    safeUnlink(this.socketPath);
  }
}

/** @param {ActivityStripBrokerOptions} [options] */
export async function createActivityStripBroker(options = {}) {
  const broker = new ActivityStripBroker(options);
  await broker.start();
  return broker;
}
