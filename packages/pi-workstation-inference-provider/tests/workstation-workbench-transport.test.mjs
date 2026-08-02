import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { Socket } from "node:net";
import test from "node:test";
import {
  DISPATCH_PERMIT_MAX_AGE_MS,
  deriveDispatchPermitId,
  WorkbenchInheritedAuthorityChannel,
} from "../extensions/workstation-authority-channel.ts";
import { createGovernedWorkbenchHttpFetch } from "../extensions/workstation-governed-http.ts";

function audioPayload() {
  return JSON.stringify({
    model: "thinkingmachines/Inkling-Small",
    stream: true,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "bounded" },
          { type: "input_audio", input_audio: { data: "YXVkaW8=", format: "wav" } },
        ],
      },
    ],
  });
}

function binding() {
  return {
    protocol: "workbench-inkling-broker/v1",
    kind: "arm_turn",
    session_id: "1".repeat(32),
    turn_id: "2".repeat(32),
    attempt_nonce: "3".repeat(32),
    claim_generation: 1,
    profile_digest: "4".repeat(64),
    audio_sha256: createHash("sha256").update("audio").digest("hex"),
  };
}

function authority(clock) {
  const arm = binding();
  const permit = {
    ...Object.fromEntries(Object.entries(arm).filter(([key]) => key !== "kind")),
    kind: "dispatch_permit",
    provider_id: "workstation-inference",
    model_id: "inkling-small-iq2m-canary",
    issued_at: new Date(clock.base).toISOString(),
    expires_at: new Date(clock.base + DISPATCH_PERMIT_MAX_AGE_MS).toISOString(),
    permit_max_age_ms: DISPATCH_PERMIT_MAX_AGE_MS,
    dispatch_intent_digest: "6".repeat(64),
    reservation_lease_identity_digest: "7".repeat(64),
  };
  permit.permit_id = deriveDispatchPermitId(permit);
  return new WorkbenchInheritedAuthorityChannel(
    {
      async receiveArm() {
        return arm;
      },
      async exchange(message) {
        return message.kind === "authorize_dispatch" ? permit : message;
      },
    },
    {
      wallNowMs: () => clock.wall,
      monotonicNowMs: () => clock.monotonic,
    },
  );
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server address missing");
  return address.port;
}

async function close(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

function delayedConnectedSocket() {
  let capturedResolve;
  const connectedButWithheld = new Promise((resolve) => {
    capturedResolve = resolve;
  });
  let release;
  const factory = (options) => {
    const socket = new Socket();
    const emit = socket.emit;
    socket.emit = (event, ...args) => {
      if (event === "connect" && !release) {
        release = () => emit.call(socket, "connect", ...args);
        capturedResolve();
        return false;
      }
      return emit.call(socket, event, ...args);
    };
    socket.connect(Number(options.port), String(options.hostname ?? options.host));
    return socket;
  };
  return {
    factory,
    connectedButWithheld,
    release: () => {
      if (!release) throw new Error("connect event was not captured");
      release();
    },
  };
}

test("expiry after transport delegation but before connected-socket write sends zero bytes", async () => {
  let providerBytes = 0;
  let providerRequests = 0;
  const server = createServer((_request, response) => {
    providerRequests += 1;
    response.end("unexpected");
  });
  server.on("connection", (socket) => {
    socket.on("data", (chunk) => {
      providerBytes += chunk.length;
    });
  });
  const port = await listen(server);
  const clock = { base: Date.now(), wall: 0, monotonic: 10 };
  clock.wall = clock.base + 100;
  const channel = authority(clock);
  await channel.arm();
  await channel.authorizeDispatch();
  const delayed = delayedConnectedSocket();
  const governedFetch = createGovernedWorkbenchHttpFetch({
    createConnection: delayed.factory,
    expectedModel: "thinkingmachines/Inkling-Small",
    atProviderWrite: () => channel.consumeDispatchPermitAtProviderWrite(),
  });

  try {
    const pending = governedFetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: audioPayload(),
    });
    await delayed.connectedButWithheld;
    clock.wall = clock.base + DISPATCH_PERMIT_MAX_AGE_MS;
    clock.monotonic = 1_010;
    delayed.release();
    await assert.rejects(pending, /expired at the provider write boundary/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(providerBytes, 0);
    assert.equal(providerRequests, 0);
    assert.equal(channel.dispatchCount, 0);
    assert.equal(channel.state, "expired");
  } finally {
    await close(server);
  }
});

test("connected-socket write consumes once and never follows a redirect", async () => {
  let providerRequests = 0;
  const server = createServer((request, response) => {
    providerRequests += 1;
    request.resume();
    response.writeHead(302, { location: "/v1/chat/completions" });
    response.end();
  });
  const port = await listen(server);
  const clock = { base: Date.now(), wall: 0, monotonic: 10 };
  clock.wall = clock.base + 100;
  const channel = authority(clock);
  await channel.arm();
  await channel.authorizeDispatch();
  const governedFetch = createGovernedWorkbenchHttpFetch({
    atProviderWrite: () => channel.consumeDispatchPermitAtProviderWrite(),
    expectedModel: "thinkingmachines/Inkling-Small",
  });
  try {
    const response = await governedFetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: audioPayload(),
    });
    assert.equal(response.status, 302);
    assert.equal(providerRequests, 1);
    assert.equal(channel.dispatchCount, 1);
    assert.equal(channel.state, "dispatched");
  } finally {
    await close(server);
  }
});

test("abort after response headers destroys the provider stream after one dispatch", async () => {
  let peerClosedResolve;
  const peerClosed = new Promise((resolve) => {
    peerClosedResolve = resolve;
  });
  const server = createServer((request, response) => {
    request.resume();
    request.socket.once("close", peerClosedResolve);
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write('data: {"choices":[]}\n\n');
  });
  const port = await listen(server);
  const clock = { base: Date.now(), wall: 0, monotonic: 10 };
  clock.wall = clock.base + 100;
  const channel = authority(clock);
  await channel.arm();
  await channel.authorizeDispatch();
  const controller = new AbortController();
  const governedFetch = createGovernedWorkbenchHttpFetch({
    atProviderWrite: () => channel.consumeDispatchPermitAtProviderWrite(),
    expectedModel: "thinkingmachines/Inkling-Small",
  });
  try {
    const response = await governedFetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      body: audioPayload(),
    });
    const reader = response.body.getReader();
    assert.equal((await reader.read()).done, false);
    controller.abort();
    await assert.rejects(reader.read(), /aborted/);
    await Promise.race([
      peerClosed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("peer stayed open")), 1_000)),
    ]);
    assert.equal(channel.dispatchCount, 1);
  } finally {
    await close(server);
  }
});

test("governed transport strips caller credentials and emits exact bounded headers", async () => {
  let observed;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.once("end", () => {
      observed = { body: Buffer.concat(chunks).toString("utf8"), headers: request.headers };
      response.writeHead(204);
      response.end();
    });
  });
  const port = await listen(server);
  const governedFetch = createGovernedWorkbenchHttpFetch({
    atProviderWrite() {},
    expectedModel: "thinkingmachines/Inkling-Small",
  });
  try {
    const body = audioPayload();
    const response = await governedFetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      redirect: "error",
      headers: { authorization: "Bearer forbidden", host: "attacker.invalid", "x-extra": "no" },
      body,
    });
    assert.equal(response.status, 204);
    assert.equal(observed.body, body);
    assert.equal(observed.headers.authorization, undefined);
    assert.equal(observed.headers["x-extra"], undefined);
    assert.equal(observed.headers.connection, "close");
    assert.equal(observed.headers["content-type"], "application/json");
    assert.equal(observed.headers["content-length"], String(Buffer.byteLength(body)));
    assert.equal(observed.headers.host, `127.0.0.1:${port}`);
  } finally {
    await close(server);
  }
});

test("governed transport rejects any non-exact target before connection", async () => {
  let connections = 0;
  const governedFetch = createGovernedWorkbenchHttpFetch({
    createConnection() {
      connections += 1;
      throw new Error("must not connect");
    },
    expectedModel: "thinkingmachines/Inkling-Small",
    atProviderWrite() {
      throw new Error("must not write");
    },
  });
  await assert.rejects(
    governedFetch("http://localhost:1364/v1/chat/completions", {
      method: "POST",
      redirect: "error",
      body: audioPayload(),
    }),
    /exact loopback provider path/,
  );
  await assert.rejects(
    governedFetch("http://127.0.0.1:1364/v1/other", {
      method: "POST",
      redirect: "error",
      body: audioPayload(),
    }),
    /exact loopback provider path/,
  );
  assert.equal(connections, 0);
});
