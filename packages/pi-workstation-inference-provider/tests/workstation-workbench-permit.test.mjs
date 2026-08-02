import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  armAudio,
  assertAudioAttachmentValidAtProviderWrite,
} from "../extensions/workstation-audio.ts";
import {
  DISPATCH_PERMIT_MAX_AGE_MS,
  deriveDispatchPermitId,
  WorkbenchInheritedAuthorityChannel,
} from "../extensions/workstation-authority-channel.ts";
import extension, {
  clearWorkstationHealthCache,
  sendWorkbenchAudioTurn,
} from "../extensions/workstation-inference.ts";
import {
  inklingContract,
  inklingModel,
  withInlineContract,
} from "./workstation-inference-test-helpers.mjs";

async function runWorkbenchAuthorityProviderCase({
  withholdAuthorization = false,
  expireBeforeProviderWrite = false,
  providerStatus = 200,
  resetAfterRequest = false,
  callerFetch,
  callerHeaders,
  callerOnPayload,
} = {}) {
  const oldFetch = globalThis.fetch;
  const root = await mkdtemp(join(tmpdir(), "workstation-workbench-authority-"));
  const audioPath = join(root, "turn.wav");
  const audio = Buffer.from("RIFF0000WAVE", "ascii");
  const messages = [];
  const providers = [];
  const events = [];
  let sent = "";
  let providerPosts = 0;
  const providerRequests = [];
  const armMessage = {
    protocol: "workbench-inkling-broker/v1",
    kind: "arm_turn",
    session_id: "1".repeat(32),
    turn_id: "2".repeat(32),
    attempt_nonce: "3".repeat(32),
    claim_generation: 1,
    profile_digest: "4".repeat(64),
    audio_sha256: createHash("sha256").update(audio).digest("hex"),
  };
  const clockBaseMs = Date.now();
  let wallReads = 0;
  let monotonicReads = 0;
  const permit = {
    ...Object.fromEntries(Object.entries(armMessage).filter(([key]) => key !== "kind")),
    kind: "dispatch_permit",
    provider_id: "workstation-inference",
    model_id: "inkling-small-iq2m-canary",
    issued_at: new Date(clockBaseMs).toISOString(),
    expires_at: new Date(clockBaseMs + DISPATCH_PERMIT_MAX_AGE_MS).toISOString(),
    permit_max_age_ms: DISPATCH_PERMIT_MAX_AGE_MS,
    dispatch_intent_digest: "6".repeat(64),
    reservation_lease_identity_digest: "7".repeat(64),
  };
  permit.permit_id = deriveDispatchPermitId(permit);
  const server = createServer((request, response) => {
    providerPosts += 1;
    providerRequests.push({ method: request.method, url: request.url });
    if (resetAfterRequest) {
      request.socket.destroy();
      return;
    }
    request.resume();
    request.once("end", () => {
      const body = [
        'data: {"id":"turn","object":"chat.completion.chunk","created":1,"model":"thinkingmachines/Inkling-Small","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}',
        'data: {"id":"turn","object":"chat.completion.chunk","created":1,"model":"thinkingmachines/Inkling-Small","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":0,"total_tokens":1}}',
        "data: [DONE]",
        "",
      ].join("\n\n");
      response.writeHead(providerStatus, {
        "content-type": providerStatus === 200 ? "text/event-stream" : "text/plain",
      });
      response.end(providerStatus === 200 ? body : "temporarily unavailable");
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server address missing");
  const providerBaseUrl = `http://127.0.0.1:${address.port}/v1`;
  const authority = new WorkbenchInheritedAuthorityChannel(
    {
      async receiveArm() {
        messages.push(armMessage);
        return armMessage;
      },
      async exchange(message) {
        messages.push(message);
        if (withholdAuthorization && message.kind === "authorize_dispatch") {
          return new Promise(() => undefined);
        }
        return message.kind === "authorize_dispatch" ? permit : message;
      },
    },
    {
      acknowledgementTimeoutMs: withholdAuthorization ? 10 : 1_000,
      wallNowMs: () => {
        wallReads += 1;
        return expireBeforeProviderWrite && wallReads > 1
          ? clockBaseMs + DISPATCH_PERMIT_MAX_AGE_MS
          : clockBaseMs + 100;
      },
      monotonicNowMs: () => {
        monotonicReads += 1;
        return expireBeforeProviderWrite && monotonicReads > 1 ? 910 : 10;
      },
    },
  );
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "POST") {
      throw new Error("Workbench provider POST bypassed the governed socket transport");
    }
    return { ok: true, status: 200 };
  };
  try {
    await writeFile(audioPath, audio);
    clearWorkstationHealthCache();
    await withInlineContract(
      inklingContract({
        runtime_profile_id: "workbench-inkling-canary",
        base_url: providerBaseUrl,
        health_url: `http://127.0.0.1:${address.port}/health`,
      }),
      async () => {
        const pi = {
          on() {},
          registerCommand() {},
          registerProvider(name, config) {
            providers.push({ name, config });
          },
          sendUserMessage(message) {
            sent = message;
          },
          async exec() {
            throw new Error("legacy scheduler authority must not be called");
          },
        };
        await extension(pi);
        await sendWorkbenchAudioTurn(
          pi,
          `${audioPath} -- `,
          {
            cwd: root,
            model: inklingModel(),
            signal: undefined,
            isIdle: () => true,
            hasUI: false,
          },
          authority,
        );
        const stream = providers[0].config.streamSimple(
          inklingModel(),
          { messages: [{ role: "user", content: sent }] },
          {
            apiKey: "workstation-local",
            ...(callerFetch ? { fetch: callerFetch } : {}),
            ...(callerHeaders ? { headers: callerHeaders } : {}),
            ...(callerOnPayload ? { onPayload: callerOnPayload } : {}),
          },
        );
        for await (const event of stream) events.push(event);
      },
    );
    return { armMessage, events, messages, providerPosts, providerRequests };
  } finally {
    globalThis.fetch = oldFetch;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
}

test("Workbench inherited authority gates the actual provider dispatch without legacy scheduler calls", async () => {
  const result = await runWorkbenchAuthorityProviderCase();
  assert.equal(result.providerPosts, 1);
  assert.deepEqual(result.providerRequests, [{ method: "POST", url: "/v1/chat/completions" }]);
  assert.deepEqual(
    result.messages.map((message) => message.kind),
    ["arm_turn", "authorize_dispatch", "report_disposition"],
  );
  assert.deepEqual(result.messages[2], {
    ...result.armMessage,
    kind: "report_disposition",
    disposition: "stream_completed",
    dispatch_count: 1,
    terminal_provider_class: "stop",
  });
});

test("withheld Workbench authorization acknowledgement causes zero provider POSTs", async () => {
  const result = await runWorkbenchAuthorityProviderCase({ withholdAuthorization: true });
  assert.equal(result.providerPosts, 0);
  assert.deepEqual(
    result.messages.map((message) => message.kind),
    ["arm_turn", "authorize_dispatch"],
  );
  assert.ok(result.events.some((event) => event.type === "error"));
});

test("provider boundary rejects audio bytes that drift from the armed authority digest", async () => {
  const data = Buffer.from("RIFF0000WAVE", "ascii");
  const binding = {
    protocol: "workbench-inkling-broker/v1",
    kind: "arm_turn",
    session_id: "1".repeat(32),
    turn_id: "2".repeat(32),
    attempt_nonce: "3".repeat(32),
    claim_generation: 1,
    profile_digest: "4".repeat(64),
    audio_sha256: createHash("sha256").update(data).digest("hex"),
  };
  const authority = new WorkbenchInheritedAuthorityChannel({
    async receiveArm() {
      return binding;
    },
    async exchange(message) {
      return message;
    },
  });
  await authority.arm();
  const attachment = armAudio({
    providerId: "workstation-inference",
    modelId: "inkling-small-iq2m-canary",
    payloadModel: "thinkingmachines/Inkling-Small",
    format: "wav",
    data,
    authority,
  });
  data[4] ^= 1;
  assert.throws(() => assertAudioAttachmentValidAtProviderWrite(attachment), /digest drifted/);
});

test("permit expiring between authorization and governed fetch causes zero provider POSTs", async () => {
  const result = await runWorkbenchAuthorityProviderCase({ expireBeforeProviderWrite: true });
  assert.equal(result.providerPosts, 0);
  assert.deepEqual(
    result.messages.map((message) => message.kind),
    ["arm_turn", "authorize_dispatch", "report_disposition"],
  );
  assert.equal(result.messages[2].disposition, "not_dispatched");
  assert.equal(result.messages[2].dispatch_count, 0);
  assert.ok(result.events.some((event) => event.type === "error"));
});

test("post-delegation provider failure remains one ambiguous dispatch with no retry", async () => {
  const result = await runWorkbenchAuthorityProviderCase({ providerStatus: 503 });
  assert.equal(result.providerPosts, 1);
  assert.deepEqual(
    result.messages.map((message) => message.kind),
    ["arm_turn", "authorize_dispatch", "report_disposition"],
  );
  assert.equal(result.messages[2].disposition, "dispatch_ambiguous");
  assert.equal(result.messages[2].dispatch_count, 1);
});

test("post-write socket reset remains one ambiguous dispatch with no retry", async () => {
  const result = await runWorkbenchAuthorityProviderCase({ resetAfterRequest: true });
  assert.equal(result.providerPosts, 1);
  assert.deepEqual(
    result.messages.map((message) => message.kind),
    ["arm_turn", "authorize_dispatch", "report_disposition"],
  );
  assert.equal(result.messages[2].disposition, "dispatch_ambiguous");
  assert.equal(result.messages[2].dispatch_count, 1);
});

test("bodyless provider response cannot escape ambiguous disposition handling", async () => {
  const result = await runWorkbenchAuthorityProviderCase({ providerStatus: 204 });
  assert.equal(result.providerPosts, 1);
  assert.deepEqual(
    result.messages.map((message) => message.kind),
    ["arm_turn", "authorize_dispatch", "report_disposition"],
  );
  assert.equal(result.messages[2].disposition, "dispatch_ambiguous");
  assert.equal(result.messages[2].dispatch_count, 1);
});

test("Workbench governed dispatch rejects caller transport customization", async () => {
  let callerEffects = 0;
  const cases = [
    {
      callerFetch: async () => {
        callerEffects += 1;
        throw new Error("must not run");
      },
    },
    { callerHeaders: { authorization: "Bearer forbidden" } },
    {
      callerOnPayload: async () => {
        callerEffects += 1;
        return { arbitrary: true };
      },
    },
  ];
  for (const options of cases) {
    const result = await runWorkbenchAuthorityProviderCase(options);
    assert.equal(result.providerPosts, 0);
    assert.deepEqual(
      result.messages.map((message) => message.kind),
      ["arm_turn", "report_disposition"],
    );
    assert.equal(result.messages[1].disposition, "not_dispatched");
  }
  assert.equal(callerEffects, 0);
});
