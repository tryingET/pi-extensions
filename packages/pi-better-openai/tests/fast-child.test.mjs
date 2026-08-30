import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import inheritedFastMode, { BETTER_OPENAI_FAST_MODE_ENV } from "../extensions/fast-child.ts";

function harness() {
  const handlers = new Map();
  return {
    handlers,
    api: {
      on(name, handler) {
        handlers.set(name, handler);
      },
    },
  };
}

function context(cwd) {
  return {
    cwd,
    hasUI: false,
    model: { provider: "openai", id: "gpt-5.4" },
  };
}

async function withEnv(value, run) {
  const previous = process.env[BETTER_OPENAI_FAST_MODE_ENV];
  if (value === undefined) delete process.env[BETTER_OPENAI_FAST_MODE_ENV];
  else process.env[BETTER_OPENAI_FAST_MODE_ENV] = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env[BETTER_OPENAI_FAST_MODE_ENV];
    else process.env[BETTER_OPENAI_FAST_MODE_ENV] = previous;
  }
}

function writeProjectConfig(dir, desiredActive) {
  const configDir = path.join(dir, ".pi", "extensions");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "better-openai.json"),
    JSON.stringify({
      persistState: false,
      desiredActive,
      supportedModels: ["openai/gpt-5.4"],
    }),
  );
}

async function providerPayload(dir, inheritedMode) {
  return withEnv(inheritedMode, async () => {
    const pi = harness();
    inheritedFastMode(pi.api);
    const ctx = context(dir);
    await pi.handlers.get("session_start")({ reason: "startup" }, ctx);
    return pi.handlers.get("before_provider_request")({ payload: { model: "gpt-5.4" } }, ctx);
  });
}

test("child fast hook uses the inherited on/off mode instead of persisted configuration", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "better-openai-fast-child-"));
  try {
    writeProjectConfig(dir, false);
    const enabled = await providerPayload(dir, "on");
    assert.equal(enabled.service_tier, "priority");

    writeProjectConfig(dir, true);
    const disabled = await providerPayload(dir, "off");
    assert.equal(disabled, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
