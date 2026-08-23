/**
summary: "Tests headless fast-mode injection and bounded image prompt, file, race, and error-response handling."
read_when:
  - "Changing provider priority injection, image prompt fallback, input limits, file race detection, or error truncation."
*/
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import betterOpenAI, { _test } from "../extensions/fast.ts";

function harness(flags = {}, sharedExtensionEvents = {}) {
  const resolvedFlags = typeof flags === "boolean" ? { fast: flags } : flags;
  const commands = new Map();
  const events = new Map();
  const eventHandlers = new Map();
  const tools = new Map();
  const registrations = { commands: new Map(), events: new Map(), flags: new Map() };
  const increment = (counts, name) => counts.set(name, (counts.get(name) ?? 0) + 1);
  return {
    commands,
    events,
    tools,
    registrations,
    api: {
      events: sharedExtensionEvents,
      registerFlag(name) {
        increment(registrations.flags, name);
      },
      getFlag: (name) => resolvedFlags[name] ?? false,
      registerCommand(name, command) {
        increment(registrations.commands, name);
        commands.set(name, command);
      },
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerMessageRenderer() {},
      on(name, handler) {
        increment(registrations.events, name);
        const handlers = eventHandlers.get(name) ?? [];
        handlers.push(handler);
        eventHandlers.set(name, handlers);
        events.set(name, async (event, ctx) => {
          let nextEvent = event;
          let lastResult;
          for (const currentHandler of handlers) {
            const result = await currentHandler(nextEvent, ctx);
            if (result === undefined) continue;
            lastResult = result;
            if (name === "before_provider_request") {
              nextEvent = { ...nextEvent, payload: result };
            }
          }
          return lastResult;
        });
      },
    },
  };
}

function context(cwd, entries = []) {
  return {
    cwd,
    hasUI: false,
    model: { provider: "openai", id: "gpt-5.4" },
    ui: {
      notify() {
        throw new Error("headless UI access");
      },
    },
    sessionManager: { getEntries: () => entries },
    modelRegistry: { getApiKeyForProvider: async () => undefined },
  };
}

test("package entrypoint registers Fast and Pro once in every reload generation", () => {
  const sharedExtensionEvents = {};
  const generations = [harness({}, sharedExtensionEvents), harness({}, sharedExtensionEvents)];

  for (const pi of generations) {
    betterOpenAI(pi.api);
    assert.equal(pi.registrations.flags.get("fast"), 1);
    assert.equal(pi.registrations.flags.get("pro"), 1);
    assert.equal(pi.registrations.commands.get("fast"), 1);
    assert.equal(pi.registrations.commands.get("pro"), 1);
    assert.equal(pi.registrations.commands.get("openai-settings"), 1);
    assert.equal(pi.registrations.events.get("session_start"), 2);
    assert.equal(pi.registrations.events.get("model_select"), 2);
    assert.equal(pi.registrations.events.get("before_provider_request"), 2);
  }
});

test("registered --fast initializes provider injection state in headless sessions", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "better-openai-fast-"));
  try {
    const configDir = path.join(dir, ".pi", "extensions");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "better-openai.json"),
      JSON.stringify({
        persistState: false,
        supportedModels: ["openai/gpt-5.4"],
      }),
    );
    const pi = harness(true);
    betterOpenAI(pi.api);
    const ctx = context(dir);
    await pi.events.get("session_start")({ reason: "startup" }, ctx);
    const payload = await pi.events.get("before_provider_request")(
      { payload: { model: "gpt-5.4" } },
      ctx,
    );
    assert.equal(payload.service_tier, "priority");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fast mode publishes rabbit and turtle footer status across toggles and model changes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "better-openai-fast-status-"));
  try {
    const configDir = path.join(dir, ".pi", "extensions");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "better-openai.json"),
      JSON.stringify({
        persistState: false,
        desiredActive: false,
        supportedModels: ["openai/gpt-5.4"],
      }),
    );

    const pi = harness(false);
    betterOpenAI(pi.api);
    const statuses = [];
    const lastFastStatus = () => statuses.findLast(([key]) => key === _test.FAST_STATUS_KEY);
    const ctx = {
      ...context(dir),
      hasUI: true,
      ui: {
        notify() {},
        setStatus(key, text) {
          statuses.push([key, text]);
        },
      },
    };

    await pi.events.get("session_start")({ reason: "startup" }, ctx);
    assert.deepEqual(lastFastStatus(), [_test.FAST_STATUS_KEY, "🐢"]);

    await pi.commands.get("fast").handler("", ctx);
    assert.deepEqual(lastFastStatus(), [_test.FAST_STATUS_KEY, "🐇"]);

    const unsupportedCtx = {
      ...ctx,
      model: { provider: "anthropic", id: "claude-opus-4-6" },
    };
    await pi.events.get("model_select")({}, unsupportedCtx);
    assert.deepEqual(lastFastStatus(), [_test.FAST_STATUS_KEY, "🐢"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("model selection preserves exact matches and provider-scoped wildcards", () => {
  const wildcardModels = _test.parseModels(["openai-codex/*"]);
  assert.equal(
    _test.supportsFast({ model: { provider: "openai-codex", id: "gpt-5.6-sol" } }, wildcardModels),
    true,
  );
  assert.equal(
    _test.supportsFast({ model: { provider: "openai", id: "gpt-5.6-sol" } }, wildcardModels),
    false,
  );

  const exactModels = _test.parseModels(["openai-codex/gpt-5.5"]);
  assert.equal(
    _test.supportsFast({ model: { provider: "openai-codex", id: "gpt-5.5" } }, exactModels),
    true,
  );
  assert.equal(
    _test.supportsFast({ model: { provider: "openai-codex", id: "gpt-5.6-sol" } }, exactModels),
    false,
  );
});

test("exact model configuration does not inject priority for a same-provider sibling", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "better-openai-exact-model-"));
  try {
    const configDir = path.join(dir, ".pi", "extensions");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "better-openai.json"),
      JSON.stringify({
        persistState: false,
        supportedModels: ["openai-codex/gpt-5.5"],
      }),
    );
    const pi = harness(true);
    betterOpenAI(pi.api);
    const ctx = {
      ...context(dir),
      model: { provider: "openai-codex", id: "gpt-5.6-sol" },
    };
    await pi.events.get("session_start")({ reason: "startup" }, ctx);
    const payload = await pi.events.get("before_provider_request")(
      { payload: { model: "gpt-5.6-sol" } },
      ctx,
    );
    assert.equal(payload, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Pro mode preserves reasoning fields and composes with fast mode", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "better-openai-pro-"));
  try {
    const configDir = path.join(dir, ".pi", "extensions");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "better-openai.json"),
      JSON.stringify({
        persistState: false,
        supportedModels: ["openai-codex/gpt-5.6-sol"],
        pro: { supportedModels: ["openai-codex/gpt-5.6-sol"] },
      }),
    );
    const pi = harness({ fast: true, pro: true });
    betterOpenAI(pi.api);
    const ctx = {
      ...context(dir),
      isProjectTrusted: () => true,
      model: {
        provider: "openai-codex",
        id: "gpt-5.6-sol",
        api: "openai-codex-responses",
      },
    };
    await pi.events.get("session_start")({ reason: "startup" }, ctx);
    const payload = await pi.events.get("before_provider_request")(
      {
        payload: {
          model: "gpt-5.6-sol",
          reasoning: { effort: "high", summary: "auto", context: "preserve-me" },
        },
      },
      ctx,
    );
    assert.equal(payload.service_tier, "priority");
    assert.deepEqual(payload.reasoning, {
      effort: "high",
      summary: "auto",
      context: "preserve-me",
      mode: "pro",
    });

    await pi.commands.get("openai-settings").handler("", ctx);
    const afterSettings = await pi.events.get("before_provider_request")(
      { payload: { model: "gpt-5.6-sol", reasoning: { effort: "high" } } },
      ctx,
    );
    assert.equal(afterSettings.service_tier, "priority");
    assert.equal(afterSettings.reasoning.mode, "pro");

    await pi.commands.get("fast").handler("", ctx);
    const afterFastToggle = await pi.events.get("before_provider_request")(
      { payload: { model: "gpt-5.6-sol", reasoning: { effort: "high" } } },
      ctx,
    );
    assert.equal(afterFastToggle.service_tier, undefined);
    assert.equal(afterFastToggle.reasoning.mode, "pro");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Pro mode can create reasoning while preserving the API default effort", async () => {
  const payload = _test.injectProMode({ model: "gpt-5.6-sol", input: [] }, "gpt-5.6-sol");
  assert.deepEqual(payload, {
    model: "gpt-5.6-sol",
    input: [],
    reasoning: { mode: "pro" },
  });
});

test("Pro mode fails closed for mismatched models and malformed reasoning", () => {
  assert.equal(_test.injectProMode({ model: "gpt-5.6-terra" }, "gpt-5.6-sol"), undefined);
  assert.equal(
    _test.injectProMode({ model: "gpt-5.6-sol", reasoning: "high" }, "gpt-5.6-sol"),
    undefined,
  );
  assert.equal(
    _test.supportsPro(
      {
        model: { provider: "openai-codex", id: "gpt-5.6-sol", api: "openai-completions" },
      },
      _test.parseModels(["openai-codex/gpt-5.6-sol"]),
    ),
    false,
  );
  assert.equal(
    _test.supportsPro(
      {
        model: {
          provider: "openai-codex",
          id: "gpt-5.6-terra",
          api: "openai-codex-responses",
        },
      },
      _test.parseModels(["openai-codex/*"]),
    ),
    false,
  );
  const radiusContext = {
    model: { provider: "radius", id: "gpt-5.6-sol", api: "pi-messages" },
  };
  assert.equal(_test.supportsPro(radiusContext, _test.parseModels(["radius/gpt-5.6-sol"])), false);
  assert.match(
    _test.proStateText(radiusContext, true, false, _test.parseModels(["radius/gpt-5.6-sol"])),
    /Pi pi-messages client contract does not expose Responses API reasoning\.mode/,
  );
  assert.match(
    _test.proStateText(radiusContext, true, false, _test.parseModels(["radius/gpt-5.6-sol"])),
    /models\.json or supportedModels would not change that transport/,
  );
});

test("untrusted project config cannot silently enable Pro mode", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "better-openai-pro-untrusted-"));
  const previousHome = process.env.HOME;
  try {
    const home = path.join(dir, "home");
    const globalConfigDir = path.join(home, ".pi", "agent", "extensions");
    const configDir = path.join(dir, ".pi", "extensions");
    fs.mkdirSync(globalConfigDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalConfigDir, "better-openai.json"),
      JSON.stringify({
        persistState: false,
        pro: { desiredActive: false },
      }),
    );
    fs.writeFileSync(
      path.join(configDir, "better-openai.json"),
      JSON.stringify({
        persistState: false,
        pro: { desiredActive: true },
      }),
    );
    process.env.HOME = home;
    const pi = harness();
    betterOpenAI(pi.api);
    const ctx = {
      ...context(dir),
      isProjectTrusted: () => false,
      model: {
        provider: "openai-codex",
        id: "gpt-5.6-sol",
        api: "openai-codex-responses",
      },
    };
    await pi.events.get("session_start")({ reason: "startup" }, ctx);
    const payload = await pi.events.get("before_provider_request")(
      { payload: { model: "gpt-5.6-sol", reasoning: { effort: "high" } } },
      ctx,
    );
    assert.equal(payload, undefined);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("untrusted project config cannot override global Pro persistence policy", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "better-openai-pro-persistence-"));
  try {
    const home = path.join(dir, "home");
    const project = path.join(dir, "project");
    fs.mkdirSync(path.join(home, ".pi", "agent", "extensions"), { recursive: true });
    fs.mkdirSync(path.join(project, ".pi", "extensions"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".pi", "agent", "extensions", "better-openai.json"),
      JSON.stringify({ persistState: false }),
    );
    fs.writeFileSync(
      path.join(project, ".pi", "extensions", "better-openai.json"),
      JSON.stringify({ persistState: true }),
    );

    const untrusted = _test.resolveConfig(project, { allowProjectPro: false, home });
    assert.equal(untrusted.proPersistState, false);
    assert.equal(
      untrusted.proConfigPath,
      path.join(home, ".pi", "agent", "extensions", "better-openai.json"),
    );

    const trusted = _test.resolveConfig(project, { allowProjectPro: true, home });
    assert.equal(trusted.proPersistState, true);
    assert.equal(
      trusted.proConfigPath,
      path.join(project, ".pi", "extensions", "better-openai.json"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("explicit image tool prompt wins over session fallback", () => {
  const ctx = context("/tmp", [
    {
      type: "message",
      message: { role: "user", content: "older user prompt" },
    },
  ]);
  assert.equal(
    _test.imageTest.resolveToolPrompt({ prompt: "explicit image prompt" }, ctx),
    "explicit image prompt",
  );
  assert.equal(_test.imageTest.resolveToolPrompt({ prompt: "  " }, ctx), "older user prompt");
});

test("image input count and byte limits fail before unbounded reads", async () => {
  const tooMany = Array.from(
    { length: _test.imageTest.MAX_INPUT_IMAGES + 1 },
    (_, i) => `${i}.png`,
  );
  await assert.rejects(() => _test.imageTest.readImageInputs(tooMany, "/tmp"), /At most/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "better-openai-image-"));
  try {
    const image = path.join(dir, "large.png");
    fs.writeFileSync(image, Buffer.alloc(_test.imageTest.MAX_INPUT_IMAGE_BYTES + 1));
    await assert.rejects(() => _test.imageTest.readImageInputs([image], dir), /exceeds/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bounded image reads tolerate legal short positional reads", async () => {
  const content = Buffer.from("short reads still produce the complete image");
  const result = await _test.imageTest.readExpectedFileBytes(
    content.byteLength,
    async (target, offset, length, position) => {
      if (position >= content.byteLength) return 0;
      return content.copy(target, offset, position, position + Math.min(2, length));
    },
  );
  assert.equal(result.bytesRead, content.byteLength);
  assert.deepEqual(result.buffer.subarray(0, result.bytesRead), content);
});

test("image input reads reject path replacement after opening the bounded file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "better-openai-image-race-"));
  try {
    const image = path.join(dir, "input.png");
    const moved = path.join(dir, "opened.png");
    fs.writeFileSync(image, "original");
    await assert.rejects(
      () =>
        _test.imageTest.readBoundedImageFile(image, () => {
          fs.renameSync(image, moved);
          fs.writeFileSync(image, Buffer.alloc(_test.imageTest.MAX_INPUT_IMAGE_BYTES + 1));
        }),
      /changed while reading/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("image input reads reject growth of the opened file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "better-openai-image-growth-"));
  try {
    const image = path.join(dir, "input.png");
    fs.writeFileSync(image, "small");
    await assert.rejects(
      () =>
        _test.imageTest.readBoundedImageFile(image, () => {
          fs.appendFileSync(image, Buffer.alloc(1024));
        }),
      /changed while reading/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("upstream error bodies are bounded", async () => {
  const limit = _test.imageTest.MAX_ERROR_BODY_BYTES;
  const response = new Response("x".repeat(limit * 2));
  const text = await _test.imageTest.readBoundedResponseText(response, limit);
  assert.ok(Buffer.byteLength(text) < limit + 32);
  assert.match(text, /truncated/);
});

test("exact-limit upstream error bodies are not mislabeled as truncated", async () => {
  const limit = 32;
  const text = await _test.imageTest.readBoundedResponseText(
    new Response("x".repeat(limit)),
    limit,
  );
  assert.equal(text, "x".repeat(limit));
});
