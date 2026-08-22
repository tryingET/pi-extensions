/**
summary: "Tests workstation contract loading, health caching and cancellation, provider registration, commands, and stream failures."
read_when:
  - "Changing workstation inference contracts, health behavior, provider models, lane-op integration, or stream error handling."
*/
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import {
  armAudio,
  clearArmedAudio,
  parseAudioSendArgs,
  readBoundedAudio,
  transformAudioPayload,
} from "../extensions/workstation-audio.ts";
import extension, {
  clearWorkstationHealthCache,
  providerModel,
  resolveContractStatus,
  streamWorkstationInference,
} from "../extensions/workstation-inference.ts";
import {
  __resetWorkstationInferenceCachesForTests,
  primeWorkstationHealth,
  workstationHealthStatus,
} from "../extensions/workstation-inference-contract.ts";
import {
  clearSchedulerHandoff,
  completeSchedulerHandoff,
  consumeSchedulerHandoff,
  parseGovernedAudioSendArgs,
  quarantineSchedulerHandoff,
  readSchedulerHandoff,
} from "../extensions/workstation-scheduler.ts";

import {
  CONTRACT_ENV,
  CONTRACT_JSON_ENV,
  canonicalJson,
  contract,
  inklingContract,
  inklingModel,
  schedulerConsumerResponse,
  schedulerHandoffPayload,
  withInlineContract,
} from "./workstation-inference-test-helpers.mjs";

beforeEach(() => {
  __resetWorkstationInferenceCachesForTests();
});

test("stale contracts warn but remain loadable so committed defaults do not disappear", async () => {
  await withInlineContract(contract({ health_url: undefined }), async () => {
    const status = await resolveContractStatus();
    assert.equal(status.status, "ok");
    assert.match(status.detail, /refresh_after_seconds=1/);
  });
});

test("contracts fail closed on non-loopback endpoints or unknown authority", async () => {
  await withInlineContract(contract({ base_url: "https://example.com/v1" }), async () => {
    const status = await resolveContractStatus();
    assert.equal(status.status, "invalid");
    assert.match(status.detail, /loopback/);
  });
  await withInlineContract(contract({ authority: "caller-authored" }), async () => {
    const status = await resolveContractStatus();
    assert.equal(status.status, "invalid");
    assert.match(status.detail, /trusted workstation owner/);
  });
});

test("health checks use a bounded TTL cache and refresh after expiry", async () => {
  const oldFetch = globalThis.fetch;
  const oldTtl = process.env.PI_WORKSTATION_INFERENCE_HEALTH_CACHE_TTL_MS;
  let calls = 0;
  process.env.PI_WORKSTATION_INFERENCE_HEALTH_CACHE_TTL_MS = "50";
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, status: 200 };
  };
  try {
    await withInlineContract(contract(), async () => {
      await resolveContractStatus({ checkHealth: true });
      await resolveContractStatus({ checkHealth: true });
      assert.equal(calls, 1);
      await new Promise((resolve) => setTimeout(resolve, 70));
      await resolveContractStatus({ checkHealth: true });
      assert.equal(calls, 2);
    });
  } finally {
    globalThis.fetch = oldFetch;
    if (oldTtl === undefined) delete process.env.PI_WORKSTATION_INFERENCE_HEALTH_CACHE_TTL_MS;
    else process.env.PI_WORKSTATION_INFERENCE_HEALTH_CACHE_TTL_MS = oldTtl;
  }
});

test("caller cancellation aborts an in-flight health check before its timeout", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      if (init.signal.aborted) {
        reject(init.signal.reason);
        return;
      }
      init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
    });
  try {
    await withInlineContract(contract(), async () => {
      const controller = new AbortController();
      const pending = resolveContractStatus({ checkHealth: true, signal: controller.signal });
      controller.abort(new Error("operator cancelled"));
      const status = await pending;
      assert.equal(status.status, "unhealthy");
      assert.match(status.detail, /cancelled by caller/);
    });
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("providerModel strips thinking controls from visible non-reasoning aliases", () => {
  const model = providerModel(contract().models[0]);
  assert.equal(model.reasoning, false);
  assert.equal(model.thinkingLevelMap, undefined);
  assert.equal(model.compat, undefined);
});

test("default provider registration merges baseline and distinct Inkling canary models", async () => {
  const oldPath = process.env[CONTRACT_ENV];
  const oldJson = process.env[CONTRACT_JSON_ENV];
  const oldRoot = process.env.PI_WORKSTATION_ROOT;
  const root = await mkdtemp(join(tmpdir(), "workstation-provider-"));
  const stateDir = join(root, "phasee", "state");
  const providers = [];
  try {
    await mkdir(stateDir, { recursive: true });
    await writeFile(
      join(stateDir, "workstation-inference-provider.json"),
      JSON.stringify(contract({ generated_at: new Date().toISOString() })),
    );
    await writeFile(
      join(stateDir, "workstation-inference-provider.canary.json"),
      JSON.stringify(
        contract({
          surface: "canary",
          base_url: "http://127.0.0.1:1334/v1",
          health_url: "http://127.0.0.1:1334/health",
          models: [
            ...contract().models,
            {
              pi_model_id: "baseline-text-mtp-visible",
              name: "MTP visible",
              context_window: 153600,
              max_tokens: 65536,
              reasoning: false,
              input: ["text"],
            },
          ],
        }),
      ),
    );
    await writeFile(
      join(stateDir, "workstation-inference-provider.inkling-canary.json"),
      JSON.stringify(inklingContract()),
    );
    delete process.env[CONTRACT_ENV];
    delete process.env[CONTRACT_JSON_ENV];
    process.env.PI_WORKSTATION_ROOT = root;

    await extension({
      registerCommand() {},
      registerProvider(name, config) {
        providers.push({ name, config });
      },
    });

    assert.equal(providers.length, 1);
    assert.equal(providers[0].config.api, "workstation-inference");
    assert.ok(providers[0].config.models.some((model) => model.id === "baseline-text-mtp-visible"));
    assert.ok(providers[0].config.models.some((model) => model.id === "inkling-small-iq2m-canary"));
  } finally {
    await rm(root, { recursive: true, force: true });
    if (oldPath === undefined) delete process.env[CONTRACT_ENV];
    else process.env[CONTRACT_ENV] = oldPath;
    if (oldJson === undefined) delete process.env[CONTRACT_JSON_ENV];
    else process.env[CONTRACT_JSON_ENV] = oldJson;
    if (oldRoot === undefined) delete process.env.PI_WORKSTATION_ROOT;
    else process.env.PI_WORKSTATION_ROOT = oldRoot;
  }
});

test("status command registers provider after contract appears post-load", async () => {
  const oldPath = process.env[CONTRACT_ENV];
  const oldJson = process.env[CONTRACT_JSON_ENV];
  const oldFetch = globalThis.fetch;
  const oldEmptyKey = process.env.EMPTY_WORKSTATION_TEST_KEY;
  const commands = new Map();
  const providers = [];
  process.env[CONTRACT_ENV] = "/tmp/workstation-inference-provider-test-missing.json";
  delete process.env[CONTRACT_JSON_ENV];
  globalThis.fetch = async () => ({ ok: true, status: 200 });
  try {
    await extension({
      registerCommand(name, command) {
        commands.set(name, command);
      },
      registerProvider(name, config) {
        providers.push({ name, config });
      },
    });
    assert.equal(providers.length, 0);
    process.env.EMPTY_WORKSTATION_TEST_KEY = "";
    process.env[CONTRACT_JSON_ENV] = JSON.stringify(
      contract({
        generated_at: new Date().toISOString(),
        api_key_env: "EMPTY_WORKSTATION_TEST_KEY",
      }),
    );
    await commands.get("workstation-inference").handler("status", {
      hasUI: true,
      ui: { notify() {} },
    });
    assert.equal(providers.length, 1);
    assert.equal(providers[0].name, "workstation-inference");
    assert.equal(providers[0].config.apiKey, "workstation-local");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldPath === undefined) delete process.env[CONTRACT_ENV];
    else process.env[CONTRACT_ENV] = oldPath;
    if (oldJson === undefined) delete process.env[CONTRACT_JSON_ENV];
    else process.env[CONTRACT_JSON_ENV] = oldJson;
    if (oldEmptyKey === undefined) delete process.env.EMPTY_WORKSTATION_TEST_KEY;
    else process.env.EMPTY_WORKSTATION_TEST_KEY = oldEmptyKey;
  }
});

test("refresh keeps baseline usable when optional Inkling export is unavailable", async () => {
  const oldPath = process.env[CONTRACT_ENV];
  const oldJson = process.env[CONTRACT_JSON_ENV];
  const oldRoot = process.env.PI_WORKSTATION_ROOT;
  const oldFetch = globalThis.fetch;
  const commands = new Map();
  const providers = [];
  const execCalls = [];
  let notice = "";
  process.env[CONTRACT_ENV] = "/tmp/workstation-inference-provider-test-missing.json";
  process.env.PI_WORKSTATION_ROOT = "/workstation";
  delete process.env[CONTRACT_JSON_ENV];
  globalThis.fetch = async () => ({ ok: true, status: 200 });
  try {
    await extension({
      registerCommand(name, command) {
        commands.set(name, command);
      },
      registerProvider(name, config) {
        providers.push({ name, config });
      },
      async exec(command, args, options) {
        execCalls.push({ command, args, options });
        process.env[CONTRACT_JSON_ENV] = JSON.stringify(
          contract({ generated_at: new Date().toISOString() }),
        );
        return args.includes("inkling")
          ? { code: 1, stdout: "", stderr: "Inkling exporter unavailable", killed: false }
          : { code: 0, stdout: '{"result":"ok"}', stderr: "", killed: false };
      },
    });

    await commands.get("workstation-inference").handler("refresh", {
      hasUI: true,
      ui: {
        notify(message) {
          notice = message;
        },
      },
    });

    assert.equal(execCalls.length, 3);
    assert.equal(execCalls[0].command, "python3");
    assert.deepEqual(execCalls[0].args, [
      "scripts/phasee/lane-op.py",
      "provider-contract",
      "baseline-text",
      "--surface",
      "canonical",
      "--write",
    ]);
    assert.deepEqual(execCalls[1].args, [
      "scripts/phasee/lane-op.py",
      "provider-contract",
      "baseline-text",
      "--surface",
      "canary",
      "--write",
    ]);
    assert.deepEqual(execCalls[2].args, [
      "scripts/phasee/lane-op.py",
      "provider-contract",
      "inkling",
      "--surface",
      "canary",
      "--write",
    ]);
    assert.equal(execCalls[0].options.cwd, "/workstation");
    assert.equal(execCalls[1].options.cwd, "/workstation");
    assert.equal(execCalls[2].options.cwd, "/workstation");
    assert.equal(providers.length, 1);
    assert.match(notice, /optional Inkling refresh unavailable/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldPath === undefined) delete process.env[CONTRACT_ENV];
    else process.env[CONTRACT_ENV] = oldPath;
    if (oldJson === undefined) delete process.env[CONTRACT_JSON_ENV];
    else process.env[CONTRACT_JSON_ENV] = oldJson;
    if (oldRoot === undefined) delete process.env.PI_WORKSTATION_ROOT;
    else process.env.PI_WORKSTATION_ROOT = oldRoot;
  }
});

test("lane-status command delegates to lane-op read-only status", async () => {
  const commands = new Map();
  const execCalls = [];
  let notice = "";
  await extension({
    registerCommand(name, command) {
      commands.set(name, command);
    },
    registerProvider() {},
    async exec(command, args, options) {
      execCalls.push({ command, args, options });
      return { code: 0, stdout: '{"status":"ok"}', stderr: "", killed: false };
    },
  });

  await commands.get("workstation-inference").handler("lane-status", {
    hasUI: true,
    ui: {
      notify(message) {
        notice = message;
      },
    },
  });

  assert.equal(execCalls.length, 1);
  assert.deepEqual(execCalls[0].args, [
    "scripts/phasee/lane-op.py",
    "status",
    "baseline-text",
    "--surface",
    "canonical",
  ]);
  assert.equal(notice, '{"status":"ok"}');
});

test("streamWorkstationInference returns an error event when health is bad", async () => {
  const unreachable = await new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
  await withInlineContract(
    contract({ base_url: `http://127.0.0.1:${unreachable}/v1` }),
    async () => {
      const events = [];
      const stream = streamWorkstationInference(
        {
          id: "baseline-text-visible",
          name: "Visible",
          provider: "workstation-inference",
          api: "workstation-inference",
          baseUrl: "http://127.0.0.1:1234/v1",
          reasoning: false,
          input: ["text"],
          contextWindow: 32768,
          maxTokens: 16384,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        },
        { messages: [] },
        { apiKey: "workstation-local" },
      );
      // Stale-while-revalidate health (ADR 2026-08-20, decision 6) lets the
      // ordinary-text request start; the unreachable endpoint surfaces as an
      // error event from the transport instead of a blocking preflight.
      for await (const event of stream) {
        events.push(event);
        if (events.length > 10) break;
      }
      const errorEvent = events.find((event) => event.type === "error");
      assert.ok(
        errorEvent,
        `expected an error event among: ${events.map((e) => e.type).join(",")}`,
      );
      assert.match(errorEvent.errorErrorMessage ?? errorEvent.error?.errorMessage ?? "", /./);
    },
  );
});

test("degraded adapter health propagates without gating ordinary requests", async () => {
  const oldFetch = globalThis.fetch;
  const oldInline = process.env[CONTRACT_JSON_ENV];
  const providers = [];
  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "degraded-side-lanes",
        default_lane: { healthy: true },
        side_lanes: { qwen27b_configi: { healthy: false } },
      }),
    });
    process.env[CONTRACT_JSON_ENV] = JSON.stringify(contract());
    __resetWorkstationInferenceCachesForTests();
    await extension({
      registerCommand() {},
      registerProvider(_name, provider) {
        providers.push(provider);
      },
    });
    assert.equal(providers.length, 1, "degradation must not block provider registration");
    await primeWorkstationHealth();

    const healthStatuses = workstationHealthStatus();
    const degraded = healthStatuses.find((entry) => entry.degraded);
    assert.ok(degraded, `expected a degraded entry among: ${JSON.stringify(healthStatuses)}`);
    assert.match(degraded.degraded, /degraded-side-lanes/);
    assert.equal(degraded.unhealthy, undefined, "degradation is not hard unhealthiness");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldInline === undefined) delete process.env[CONTRACT_JSON_ENV];
    else process.env[CONTRACT_JSON_ENV] = oldInline;
    __resetWorkstationInferenceCachesForTests();
  }
});

test("ordinary Inkling requests are denied before health or provider network effects", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("network should not be reached");
  };
  try {
    await withInlineContract(inklingContract(), async () => {
      const events = [];
      const stream = streamWorkstationInference(
        inklingModel(),
        { messages: [] },
        { apiKey: "workstation-local" },
      );
      for await (const event of stream) events.push(event);
      assert.equal(events.length, 1);
      assert.equal(events[0].type, "error");
      assert.match(events[0].error.errorMessage, /exact external scheduler claim/);
      assert.equal(fetchCalls, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("governed audio args and handoff bind one exact Inkling claim", async () => {
  const root = await mkdtemp(join(tmpdir(), "workstation-handoff-"));
  const handoffPath = join(root, "handoff.json");
  const schedulerDb = join(root, "scheduler.sqlite3");
  const linked = join(root, "linked.json");
  let handoff;
  try {
    const parsed = parseGovernedAudioSendArgs(
      `--handoff ${handoffPath} --scheduler-db=${schedulerDb} "/audio/class question.wav" -- Explain this`,
      root,
    );
    assert.equal(parsed.path, "/audio/class question.wav");
    assert.equal(parsed.prompt, "Explain this");
    assert.equal(parsed.handoffPath, handoffPath);
    assert.equal(parsed.schedulerDb, schedulerDb);

    const payload = schedulerHandoffPayload();
    await writeFile(handoffPath, JSON.stringify(payload));
    handoff = await readSchedulerHandoff(
      handoffPath,
      schedulerDb,
      "workstation-inference",
      "inkling-small-iq2m-canary",
    );
    assert.equal(handoff.handoffDigest, payload.handoff_digest);
    assert.equal(handoff.attemptNonce, "attempt-audio-test");
    assert.notEqual(handoff.handoffPath, handoffPath);
    assert.equal(
      JSON.parse(await readFile(handoff.handoffPath, "utf8")).handoff_digest,
      payload.handoff_digest,
    );
    const policyRevision = "338405904887567215";
    const lifecycleRevision = "30350130036645910";
    const largeUnsigned = schedulerHandoffPayload();
    delete largeUnsigned.handoff_digest;
    largeUnsigned.owner_authority.profile_policy_revision = policyRevision;
    largeUnsigned.owner_authority.lifecycle_revision = lifecycleRevision;
    const largeCanonical = canonicalJson(largeUnsigned)
      .replace(JSON.stringify(policyRevision), policyRevision)
      .replace(JSON.stringify(lifecycleRevision), lifecycleRevision);
    const largeDigest = createHash("sha256").update(largeCanonical).digest("hex");
    const largePayloadText = JSON.stringify({
      ...largeUnsigned,
      handoff_digest: largeDigest,
    })
      .replace(JSON.stringify(policyRevision), policyRevision)
      .replace(JSON.stringify(lifecycleRevision), lifecycleRevision);
    await writeFile(handoffPath, largePayloadText);
    const largeHandoff = await readSchedulerHandoff(
      handoffPath,
      schedulerDb,
      "workstation-inference",
      "inkling-small-iq2m-canary",
    );
    const largeSnapshot = await readFile(largeHandoff.handoffPath, "utf8");
    assert.equal(largeSnapshot, largePayloadText);
    await clearSchedulerHandoff(largeHandoff);
    await writeFile(handoffPath, largePayloadText.replace(policyRevision, "338405904887567216"));
    await assert.rejects(
      readSchedulerHandoff(
        handoffPath,
        schedulerDb,
        "workstation-inference",
        "inkling-small-iq2m-canary",
      ),
      /digest is invalid/,
    );
    await symlink(handoffPath, linked);
    await assert.rejects(
      readSchedulerHandoff(
        linked,
        schedulerDb,
        "workstation-inference",
        "inkling-small-iq2m-canary",
      ),
      /ELOOP|symbolic link/i,
    );
    await writeFile(handoffPath, JSON.stringify({ ...payload, handoff_digest: "0".repeat(64) }));
    await assert.rejects(
      readSchedulerHandoff(
        handoffPath,
        schedulerDb,
        "workstation-inference",
        "inkling-small-iq2m-canary",
      ),
      /digest is invalid/,
    );
    await writeFile(
      handoffPath,
      JSON.stringify(schedulerHandoffPayload({ claim: { consumer_id: "another-consumer" } })),
    );
    await assert.rejects(
      readSchedulerHandoff(
        handoffPath,
        schedulerDb,
        "workstation-inference",
        "inkling-small-iq2m-canary",
      ),
      /selected Inkling model/,
    );
  } finally {
    if (handoff) await clearSchedulerHandoff(handoff);
    await rm(root, { recursive: true, force: true });
  }
});

test("scheduler consumer invokes only pre/post/complete/quarantine surfaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "workstation-scheduler-consumer-"));
  const handoffPath = join(root, "handoff.json");
  const schedulerDb = join(root, "scheduler.sqlite3");
  const payload = schedulerHandoffPayload();
  const calls = [];
  try {
    await writeFile(handoffPath, JSON.stringify(payload));
    const handoff = await readSchedulerHandoff(
      handoffPath,
      schedulerDb,
      "workstation-inference",
      "inkling-small-iq2m-canary",
    );
    const pi = {
      async exec(command, args) {
        calls.push({ command, args });
        const action = args[args.indexOf("external-effect") + 1];
        if (action === "consume") {
          const phase = args[args.indexOf("--phase") + 1];
          return {
            code: 0,
            stdout: JSON.stringify(schedulerConsumerResponse(payload, action, phase)),
            stderr: "",
            killed: false,
          };
        }
        if (action === "complete") {
          const resultPath = args[args.indexOf("--result") + 1];
          const result = JSON.parse(await readFile(resultPath, "utf8"));
          assert.deepEqual(result, {
            schema_version: 1,
            kind: "pi-inkling-external-effect-result",
            handoff_digest: payload.handoff_digest,
            provider_id: "workstation-inference",
            model_id: "inkling-small-iq2m-canary",
            attempt_nonce: "attempt-audio-test",
            dispatch_count: 1,
            outcome: "known",
            stream_completed: true,
          });
          return {
            code: 0,
            stdout: JSON.stringify(schedulerConsumerResponse(payload, action)),
            stderr: "",
            killed: false,
          };
        }
        return {
          code: 3,
          stdout: JSON.stringify(schedulerConsumerResponse(payload, action)),
          stderr: "",
          killed: false,
        };
      },
    };
    await consumeSchedulerHandoff(pi, handoff, "pre-effect");
    await consumeSchedulerHandoff(pi, handoff, "post-effect");
    await completeSchedulerHandoff(pi, handoff);
    await quarantineSchedulerHandoff(pi, handoff, "test-unknown");
    await clearSchedulerHandoff(handoff);
    assert.equal(calls.length, 4);
    assert.ok(calls.every((call) => call.command === "uv"));
    assert.ok(calls.every((call) => call.args.includes("external-effect")));
    assert.ok(
      calls.every((call) => {
        const index = call.args.indexOf("--handoff");
        return index >= 0 && call.args[index + 1] === handoff.handoffPath;
      }),
    );
    assert.notEqual(handoff.handoffPath, handoffPath);
    assert.ok(
      calls.every(
        (call) =>
          !call.args.includes("external-claim") &&
          !call.args.includes("release") &&
          !call.args.includes("reconcile"),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audio file guard rejects symlinks, bad magic, and encoded oversize", async () => {
  const root = await mkdtemp(join(tmpdir(), "workstation-audio-"));
  const valid = join(root, "valid.wav");
  const linked = join(root, "linked.wav");
  const bad = join(root, "bad.wav");
  const bytes = Buffer.from("RIFF0000WAVE", "ascii");
  const policy = inklingContract().models[0].audio_input;
  try {
    await writeFile(valid, bytes);
    await symlink(valid, linked);
    await writeFile(bad, Buffer.from("not audio"));
    await assert.rejects(readBoundedAudio(linked, root, policy), /ELOOP|symbolic link/i);
    await assert.rejects(readBoundedAudio(bad, root, policy), /do not match/);
    await assert.rejects(
      readBoundedAudio(valid, root, { ...policy, max_encoded_bytes: 8 }),
      /max_encoded_bytes=8/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audio payload transformation is exact and rejects model or marker drift", () => {
  const parsed = parseAudioSendArgs('"/tmp/class question.wav" -- What is the pupil asking?');
  assert.equal(parsed.path, "/tmp/class question.wav");
  assert.equal(parsed.prompt, "What is the pupil asking?");
  const attachment = armAudio({
    providerId: "workstation-inference",
    modelId: "inkling-small-iq2m-canary",
    payloadModel: "thinkingmachines/Inkling-Small",
    format: "wav",
    data: Buffer.from("RIFF0000WAVE", "ascii"),
  });
  try {
    const transformed = transformAudioPayload(
      {
        model: "thinkingmachines/Inkling-Small",
        messages: [{ role: "user", content: `${attachment.marker}\nExplain this.` }],
        inherited_hook: true,
      },
      attachment,
    );
    assert.equal(transformed.inherited_hook, true);
    assert.equal(transformed.messages[0].content[0].text, "Explain this.");
    assert.equal(transformed.messages[0].content[1].type, "input_audio");
    assert.equal(transformed.messages[0].content[1].input_audio.format, "wav");
    assert.throws(
      () => transformAudioPayload({ model: "wrong", messages: [] }, attachment),
      /model drifted/,
    );
    assert.throws(
      () =>
        transformAudioPayload(
          {
            model: "thinkingmachines/Inkling-Small",
            messages: [{ role: "user", content: attachment.marker }],
            tools: [{ type: "function" }],
          },
          attachment,
        ),
      /must not contain tools/,
    );
    assert.throws(
      () =>
        transformAudioPayload(
          {
            model: "thinkingmachines/Inkling-Small",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: attachment.marker },
                  { type: "input_audio", input_audio: { data: "extra", format: "wav" } },
                ],
              },
            ],
          },
          attachment,
        ),
      /already contains input_audio/,
    );
    attachment.expiresAt = Date.now() - 1;
    assert.throws(
      () =>
        transformAudioPayload(
          {
            model: "thinkingmachines/Inkling-Small",
            messages: [{ role: "user", content: attachment.marker }],
          },
          attachment,
        ),
      /expired before dispatch/,
    );
  } finally {
    clearArmedAudio(attachment);
  }
});

test("audio-send consumes one external claim and completes one streamed dispatch", async () => {
  const oldFetch = globalThis.fetch;
  const root = await mkdtemp(join(tmpdir(), "workstation-audio-e2e-"));
  const audioPath = join(root, "question.wav");
  const handoffPath = join(root, "handoff.json");
  const schedulerDb = join(root, "scheduler.sqlite3");
  const commands = new Map();
  const providers = [];
  const schedulerActions = [];
  const handoffPayload = schedulerHandoffPayload();
  let sent = "";
  let notice = "";
  let providerPosts = 0;
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "POST") {
      providerPosts += 1;
      const body = [
        'data: {"id":"audio-1","object":"chat.completion.chunk","created":1,"model":"thinkingmachines/Inkling-Small","choices":[{"index":0,"delta":{"role":"assistant","content":"heard"},"finish_reason":null}]}',
        'data: {"id":"audio-1","object":"chat.completion.chunk","created":1,"model":"thinkingmachines/Inkling-Small","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}',
        "data: [DONE]",
        "",
      ].join("\n\n");
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    return { ok: true, status: 200 };
  };
  try {
    await writeFile(audioPath, Buffer.from("RIFF0000WAVE", "ascii"));
    await writeFile(handoffPath, JSON.stringify(handoffPayload));
    clearWorkstationHealthCache();
    await withInlineContract(inklingContract(), async () => {
      const pi = {
        on() {},
        registerCommand(name, command) {
          commands.set(name, command);
        },
        registerProvider(name, config) {
          providers.push({ name, config });
        },
        sendUserMessage(message) {
          sent = message;
        },
        async exec(_command, args) {
          const action = args[args.indexOf("external-effect") + 1];
          schedulerActions.push(action === "consume" ? args[args.indexOf("--phase") + 1] : action);
          const phase = action === "consume" ? args[args.indexOf("--phase") + 1] : undefined;
          return {
            code: 0,
            stdout: JSON.stringify(schedulerConsumerResponse(handoffPayload, action, phase)),
            stderr: "",
            killed: false,
          };
        },
      };
      await extension(pi);
      await commands
        .get("workstation-inference")
        .handler(
          `audio-send --handoff ${handoffPath} --scheduler-db ${schedulerDb} ${audioPath} -- Explain`,
          {
            cwd: root,
            model: inklingModel(),
            signal: undefined,
            isIdle: () => true,
            hasUI: true,
            ui: {
              notify(message) {
                notice = message;
              },
            },
          },
        );
      assert.match(sent, /\[pi-workstation-audio:v1:/);
      assert.match(notice, /one provider dispatch/);
      assert.deepEqual(schedulerActions, ["pre-effect"]);
      const stream = providers[0].config.streamSimple(
        inklingModel(),
        { messages: [{ role: "user", content: sent }] },
        { apiKey: "workstation-local" },
      );
      const events = [];
      for await (const event of stream) events.push(event);
      assert.ok(events.some((event) => event.type === "text_delta"));
      assert.equal(providerPosts, 1);
      assert.deepEqual(schedulerActions, ["pre-effect", "post-effect", "complete"]);
    });
  } finally {
    globalThis.fetch = oldFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("retryable audio provider failure dispatches once and quarantines without retry", async () => {
  const oldFetch = globalThis.fetch;
  const root = await mkdtemp(join(tmpdir(), "workstation-audio-error-"));
  const audioPath = join(root, "question.wav");
  const handoffPath = join(root, "handoff.json");
  const schedulerDb = join(root, "scheduler.sqlite3");
  const commands = new Map();
  const providers = [];
  const schedulerActions = [];
  const handoffPayload = schedulerHandoffPayload();
  let sent = "";
  let providerPosts = 0;
  globalThis.fetch = async (_url, init = {}) => {
    if (init.method === "POST") {
      providerPosts += 1;
      return new Response("retryable provider failure", { status: 503 });
    }
    return { ok: true, status: 200 };
  };
  try {
    await writeFile(audioPath, Buffer.from("RIFF0000WAVE", "ascii"));
    await writeFile(handoffPath, JSON.stringify(handoffPayload));
    clearWorkstationHealthCache();
    await withInlineContract(inklingContract(), async () => {
      const pi = {
        on() {},
        registerCommand(name, command) {
          commands.set(name, command);
        },
        registerProvider(name, config) {
          providers.push({ name, config });
        },
        sendUserMessage(message) {
          sent = message;
        },
        async exec(_command, args) {
          const action = args[args.indexOf("external-effect") + 1];
          schedulerActions.push(action === "consume" ? args[args.indexOf("--phase") + 1] : action);
          const phase = action === "consume" ? args[args.indexOf("--phase") + 1] : undefined;
          return {
            code: action === "quarantine" ? 3 : 0,
            stdout: JSON.stringify(schedulerConsumerResponse(handoffPayload, action, phase)),
            stderr: "",
            killed: false,
          };
        },
      };
      await extension(pi);
      await commands
        .get("workstation-inference")
        .handler(
          `audio-send --handoff ${handoffPath} --scheduler-db ${schedulerDb} ${audioPath} -- Explain`,
          {
            cwd: root,
            model: inklingModel(),
            signal: undefined,
            isIdle: () => true,
            hasUI: false,
          },
        );
      const stream = providers[0].config.streamSimple(
        inklingModel(),
        { messages: [{ role: "user", content: sent }] },
        { apiKey: "workstation-local" },
      );
      const events = [];
      for await (const event of stream) events.push(event);
      assert.equal(providerPosts, 1);
      assert.deepEqual(schedulerActions, ["pre-effect", "quarantine"]);
      assert.ok(events.some((event) => event.type === "error"));
      assert.ok(
        events.some(
          (event) =>
            event.type === "error" && /Automatic retry is disabled/.test(event.error.errorMessage),
        ),
      );
    });
  } finally {
    globalThis.fetch = oldFetch;
    await rm(root, { recursive: true, force: true });
  }
});
