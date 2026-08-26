// ---
// summary: "sends newline-delimited broker requests for status, shutdown, session publication, and removal"
// read_when:
//   - "changing client socket transport, reply timeouts, or broker request helpers"
// ---

import net from "node:net";
/** @typedef {import("../common/contracts.ts").BrokerClientOptions} BrokerClientOptions */
/** @typedef {import("../common/contracts.ts").BrokerResponse} BrokerResponse */
/** @typedef {import("../common/contracts.ts").SessionSnapshot} SessionSnapshot */
import {
  ACTIVITY_STRIP_CONNECT_TIMEOUT_MS,
  ACTIVITY_STRIP_SOCKET_PATH,
} from "../common/constants.mjs";
import { makeMessage } from "../common/protocol.mjs";

/** @param {Record<string, unknown>} message @param {BrokerClientOptions} [options] @returns {Promise<BrokerResponse>} */
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

    /** @param {BrokerResponse} value */
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      socket.destroy();
      resolve(value);
    };

    /** @param {Error} error */
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      socket.destroy();
      reject(error);
    };

    const timeoutId = setTimeout(() => {
      finishReject(new Error(`Timed out contacting activity strip broker after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.setEncoding("utf8");

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(message)}\n`, () => {
        if (!expectReply) {
          finishResolve({ ok: true });
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
        const parsed = JSON.parse(line);
        finishResolve(
          parsed && typeof parsed === "object"
            ? /** @type {BrokerResponse} */ (parsed)
            : { ok: false, error: "Invalid broker response payload" },
        );
      } catch (error) {
        finishReject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    socket.on("error", (error) => {
      finishReject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

/** @param {BrokerClientOptions} [options] */
export async function getBrokerStatus(options = {}) {
  return await sendBrokerMessage(makeMessage("ping"), {
    ...options,
    expectReply: true,
  });
}

/** @param {BrokerClientOptions} [options] */
export async function isBrokerAlive(options = {}) {
  try {
    const result = await getBrokerStatus(options);
    return result?.ok === true;
  } catch {
    return false;
  }
}

/** @param {BrokerClientOptions} [options] @returns {Promise<BrokerResponse>} */
export async function requestBrokerShutdown(options = {}) {
  return await sendBrokerMessage(makeMessage("shutdown"), {
    ...options,
    expectReply: true,
  });
}

/** @param {SessionSnapshot} session @param {BrokerClientOptions} [options] */
export async function publishSessionSnapshot(session, options = {}) {
  await sendBrokerMessage(makeMessage("upsert", { session }), options);
}

/** @param {{ sessionId: string; publisherId: string }} session @param {BrokerClientOptions} [options] */
export async function removeSession(session, options = {}) {
  /** @type {Record<string, unknown>} */
  let record = {};
  let fallbackId = "";
  if (session && typeof session === "object") {
    record = session;
  } else {
    fallbackId = String(session ?? "");
  }
  await sendBrokerMessage(
    makeMessage("remove", {
      sessionId: String(record.sessionId ?? fallbackId),
      publisherId: String(record.publisherId ?? ""),
    }),
    options,
  );
}
