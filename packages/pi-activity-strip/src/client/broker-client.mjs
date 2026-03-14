import net from "node:net";
import {
  ACTIVITY_STRIP_CONNECT_TIMEOUT_MS,
  ACTIVITY_STRIP_SOCKET_PATH,
} from "../common/constants.mjs";
import { makeMessage } from "../common/protocol.mjs";

export function sendBrokerMessage(message, options = {}) {
  const expectReply = Boolean(options.expectReply);
  const timeoutMs =
    Number(options.timeoutMs ?? ACTIVITY_STRIP_CONNECT_TIMEOUT_MS) ||
    ACTIVITY_STRIP_CONNECT_TIMEOUT_MS;
  const socketPath = options.socketPath ?? ACTIVITY_STRIP_SOCKET_PATH;

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let settled = false;
    let buffer = "";

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      socket.destroy();
      handler(value);
    };

    const timeoutId = setTimeout(() => {
      finish(reject, new Error(`Timed out contacting activity strip broker after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.setEncoding("utf8");

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(message)}\n`, () => {
        if (!expectReply) {
          finish(resolve, { ok: true });
        }
      });
    });

    socket.on("data", (chunk) => {
      if (!expectReply || settled) return;
      buffer += chunk;
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const line = buffer.slice(0, newlineIndex).trim();
      if (!line) return;
      try {
        finish(resolve, JSON.parse(line));
      } catch (error) {
        finish(reject, error);
      }
    });

    socket.on("error", (error) => {
      finish(reject, error);
    });
  });
}

export async function isBrokerAlive(options = {}) {
  try {
    const result = await sendBrokerMessage(makeMessage("ping"), {
      ...options,
      expectReply: true,
    });
    return result?.ok === true;
  } catch {
    return false;
  }
}

export async function requestBrokerShutdown(options = {}) {
  return await sendBrokerMessage(makeMessage("shutdown"), {
    ...options,
    expectReply: true,
  });
}

export async function publishSessionSnapshot(session, options = {}) {
  await sendBrokerMessage(makeMessage("upsert", { session }), options);
}

export async function removeSession(sessionId, options = {}) {
  await sendBrokerMessage(makeMessage("remove", { sessionId }), options);
}
