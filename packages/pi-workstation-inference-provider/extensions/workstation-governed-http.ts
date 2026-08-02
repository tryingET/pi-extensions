import { Agent, type ClientRequestArgs, type IncomingMessage, request } from "node:http";
import { Readable } from "node:stream";

const WORKBENCH_PATH = "/v1/chat/completions";
const MAX_WORKBENCH_REQUEST_BYTES = 24 * 1024 * 1024;
const BODYLESS_RESPONSE_STATUSES = new Set([204, 205, 304]);

type ConnectionFactory = NonNullable<ClientRequestArgs["createConnection"]>;

export type GovernedWorkbenchHttpOptions = {
  atProviderWrite: () => void;
  expectedModel: string;
  /** Hermetic-test seam. Production always uses Node's unpooled connection factory. */
  createConnection?: ConnectionFactory;
};

function exactWorkbenchUrl(input: RequestInfo | URL): URL {
  if (input instanceof Request) {
    throw new Error("Workbench governed HTTP rejects preconstructed Request objects");
  }
  const url = new URL(typeof input === "string" ? input : input.toString());
  const port = Number(url.port);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== WORKBENCH_PATH ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Workbench governed HTTP target is not the exact loopback provider path");
  }
  return url;
}

function countAudioBlocks(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((count, item) => count + countAudioBlocks(item), 0);
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  const own = record.type === "input_audio" && record.input_audio ? 1 : 0;
  return (
    own + Object.values(record).reduce<number>((count, item) => count + countAudioBlocks(item), 0)
  );
}

function requestBody(body: BodyInit | null | undefined, expectedModel: string): Uint8Array {
  let bytes: Uint8Array;
  if (typeof body === "string") bytes = new TextEncoder().encode(body);
  else if (body instanceof Uint8Array) bytes = body;
  else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
  else if (ArrayBuffer.isView(body)) {
    bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  } else {
    throw new Error("Workbench governed HTTP body is not a bounded in-memory payload");
  }
  if (bytes.byteLength < 2 || bytes.byteLength > MAX_WORKBENCH_REQUEST_BYTES) {
    throw new Error("Workbench governed HTTP body exceeds its exact size boundary");
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not object");
    const payload = value as Record<string, unknown>;
    if (
      payload.model !== expectedModel ||
      payload.stream !== true ||
      !Array.isArray(payload.messages) ||
      payload.messages.length === 0 ||
      (Array.isArray(payload.tools) && payload.tools.length > 0) ||
      countAudioBlocks(payload.messages) !== 1
    ) {
      throw new Error("shape mismatch");
    }
  } catch {
    throw new Error("Workbench governed HTTP body is not the exact audio request shape");
  }
  return bytes;
}

function responseHeaders(response: IncomingMessage): Headers {
  const headers = new Headers();
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    headers.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
  }
  return headers;
}

function webBody(response: IncomingMessage): ReadableStream<Uint8Array> {
  return Readable.toWeb(response) as ReadableStream<Uint8Array>;
}

/**
 * Build the one allowed Workbench provider transport.
 *
 * No request header or body is flushed while connection acquisition is pending.
 * Once a socket is connected, atProviderWrite runs synchronously in the same
 * callback immediately before request.end() admits the exact request bytes to
 * the socket. A failure before end() destroys the connection with zero request
 * bytes and never retries.
 */
export function createGovernedWorkbenchHttpFetch(
  options: GovernedWorkbenchHttpOptions,
): typeof fetch {
  return async (input, init = {}) => {
    const url = exactWorkbenchUrl(input);
    if (init.method !== "POST" || init.redirect === "follow" || init.redirect === "manual") {
      throw new Error("Workbench governed HTTP requires one non-redirecting POST");
    }
    const body = requestBody(init.body, options.expectedModel);
    const signal = init.signal ?? undefined;
    if (signal?.aborted) throw new Error("Workbench governed HTTP request was aborted");
    const connectionFactory = options.createConnection;
    const agent = connectionFactory
      ? (new Agent({ keepAlive: false }) as Agent & { createConnection: ConnectionFactory })
      : false;
    if (agent && connectionFactory) agent.createConnection = connectionFactory;

    return new Promise<Response>((resolve, reject) => {
      let promiseSettled = false;
      let boundaryAttempted = false;
      let activeResponse: IncomingMessage | undefined;
      const cleanup = () => signal?.removeEventListener("abort", onAbort);
      const fail = (error: unknown) => {
        const failure = error instanceof Error ? error : new Error(String(error));
        if (promiseSettled) {
          activeResponse?.destroy(failure);
          return;
        }
        promiseSettled = true;
        cleanup();
        reject(failure);
      };
      const client = request(
        {
          protocol: "http:",
          hostname: "127.0.0.1",
          port: Number(url.port),
          path: WORKBENCH_PATH,
          method: "POST",
          headers: {
            accept: "text/event-stream",
            connection: "close",
            "content-length": String(body.byteLength),
            "content-type": "application/json",
          },
          agent,
        },
        (response) => {
          if (promiseSettled) {
            response.destroy();
            return;
          }
          activeResponse = response;
          try {
            const status = response.statusCode ?? 0;
            if (status < 200 || status > 599) {
              throw new Error("Workbench governed HTTP response status is invalid");
            }
            const result = new Response(
              BODYLESS_RESPONSE_STATUSES.has(status) ? null : webBody(response),
              {
                status,
                statusText: response.statusMessage,
                headers: responseHeaders(response),
              },
            );
            promiseSettled = true;
            response.once("close", cleanup);
            resolve(result);
          } catch (error) {
            response.destroy(error instanceof Error ? error : new Error(String(error)));
            client.destroy(error instanceof Error ? error : new Error(String(error)));
            fail(error);
          }
        },
      );
      const onAbort = () => {
        const error = new Error("Workbench governed HTTP request was aborted");
        activeResponse?.destroy(error);
        client.destroy(error);
        fail(error);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      client.once("error", fail);
      client.once("socket", (socket) => {
        const write = () => {
          if (boundaryAttempted || promiseSettled) return;
          boundaryAttempted = true;
          try {
            options.atProviderWrite();
            client.end(body);
          } catch (error) {
            client.destroy(error instanceof Error ? error : new Error(String(error)));
            fail(error);
          }
        };
        if ("connecting" in socket && socket.connecting) socket.once("connect", write);
        else write();
      });
    });
  };
}
