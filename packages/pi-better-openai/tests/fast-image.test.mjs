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

function harness(flag = false) {
  const events = new Map();
  const tools = new Map();
  return {
    events,
    tools,
    api: {
      registerFlag() {},
      getFlag: () => flag,
      registerCommand() {},
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerMessageRenderer() {},
      on(name, handler) {
        events.set(name, handler);
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
