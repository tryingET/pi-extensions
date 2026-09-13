import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import betterOpenAI, { _test as parentTest } from "../extensions/fast.ts";
import inheritedFastMode, {
  BETTER_OPENAI_FAST_MODE_ENV,
  _test as childTest,
} from "../extensions/fast-child.ts";
import { supportsFast } from "../src/fast-support.ts";

const ASTRA = "gpt-6-astra";
const API = "openai-codex-responses";
const model = (provider, id = ASTRA, api = API) => ({ provider, id, api });
const allowed = (provider = "openai-codex", id = "*") => [{ provider, id }];

test("parent and child share one account-aware eligibility predicate", () => {
  assert.equal(parentTest.supportsFast, supportsFast);
  assert.equal(childTest.supportsFast, supportsFast);
  for (const provider of ["openai-codex", "openai-codex-1", "openai-codex-2", "openai-codex-42"]) {
    assert.equal(supportsFast({ model: model(provider) }, allowed()), true, provider);
  }
  for (const provider of [
    "openai",
    "openai-2",
    "radius",
    "anthropic",
    "openai-codex-0",
    "openai-codex-02",
    "openai-codex--2",
    "openai-codex-2-extra",
    "openai-codex-2.0",
    "openai-codex-",
  ]) {
    assert.equal(supportsFast({ model: model(provider) }, allowed()), false, provider);
  }
  for (const api of [undefined, "openai-responses", "openai-completions", "pi-messages"]) {
    assert.equal(
      supportsFast({ model: { provider: "openai-codex-2", id: ASTRA, api } }, allowed()),
      false,
    );
  }
  assert.equal(supportsFast({}, allowed()), false);
  assert.equal(supportsFast({ model: model("openai-codex-2") }, []), false);
});

test("alias inheritance preserves exact model restrictions and account-specific configuration", () => {
  assert.equal(
    supportsFast({ model: model("openai-codex-2") }, allowed("openai-codex", ASTRA)),
    true,
  );
  assert.equal(
    supportsFast({ model: model("openai-codex-2", "gpt-5.6-sol") }, allowed("openai-codex", ASTRA)),
    false,
  );
  assert.equal(
    supportsFast({ model: model("openai-codex-2") }, allowed("openai-codex", "gpt-5.5")),
    false,
  );
  for (const provider of ["openai-codex", "openai-codex-3"]) {
    assert.equal(supportsFast({ model: model(provider) }, allowed("openai-codex-2")), false);
  }
  assert.equal(supportsFast({ model: model("openai-codex-2") }, allowed("openai-codex-2")), true);
});

function harness(child, flag) {
  const handlers = new Map();
  const commands = new Map();
  const events = [];
  const api = {
    events: { emit: (name, value) => events.push({ name, value }), on: () => () => {} },
    registerFlag() {},
    getFlag: (name) => name === "fast" && flag,
    registerCommand: (name, value) => commands.set(name, value),
    registerTool() {},
    registerMessageRenderer() {},
    on(name, handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
  };
  (child ? inheritedFastMode : betterOpenAI)(api);
  return {
    commands,
    events,
    async emit(name, event, ctx) {
      let result;
      for (const handler of handlers.get(name) ?? []) {
        const value = await handler(event, ctx);
        if (value !== undefined) {
          result = value;
          if (name === "before_provider_request") event = { ...event, payload: value };
        }
      }
      return result;
    },
  };
}

for (const child of [false, true]) {
  test(`${child ? "child" : "parent"} injects Astra priority without changing selected account or payload`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fast-alias-"));
    const previous = process.env[BETTER_OPENAI_FAST_MODE_ENV];
    process.env[BETTER_OPENAI_FAST_MODE_ENV] = "on";
    try {
      const dir = path.join(root, ".pi", "extensions");
      fs.mkdirSync(dir, { recursive: true });
      const configPath = path.join(dir, "better-openai.json");
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          persistState: false,
          desiredActive: false,
          supportedModels: ["openai-codex/*"],
        }),
      );
      const configBefore = fs.readFileSync(configPath);
      const selected = Object.freeze(model("openai-codex-2"));
      const ctx = {
        cwd: root,
        hasUI: false,
        model: selected,
        ui: {
          notify() {
            assert.fail("headless UI access");
          },
        },
        sessionManager: { getEntries: () => [] },
        modelRegistry: {
          getApiKeyForProvider() {
            assert.fail("eligibility must not resolve credentials");
          },
        },
      };
      const pi = harness(child, true);
      await pi.emit("session_start", {}, ctx);
      const payload = Object.freeze({
        model: ASTRA,
        service_tier: "default",
        input: [],
        reasoning: { effort: "high" },
      });
      const sent = await pi.emit("before_provider_request", { payload }, ctx);
      assert.deepEqual(sent, { ...payload, service_tier: "priority" });
      assert.equal(payload.service_tier, "default");
      assert.equal(ctx.model, selected);
      assert.equal(selected.provider, "openai-codex-2");
      const unsupported = { ...ctx, model: model("openai-codex-2", ASTRA, "pi-messages") };
      await pi.emit("model_select", {}, unsupported);
      assert.equal(await pi.emit("before_provider_request", { payload }, unsupported), undefined);
      await pi.emit("model_select", {}, ctx);
      assert.equal(
        (await pi.emit("before_provider_request", { payload }, ctx)).service_tier,
        "priority",
      );
      if (child) {
        process.env[BETTER_OPENAI_FAST_MODE_ENV] = "off";
        await pi.emit("model_select", {}, ctx);
      } else {
        await pi.commands.get("fast").handler("", ctx);
        assert.equal(pi.events.at(-1).value.active, false);
      }
      assert.equal(await pi.emit("before_provider_request", { payload }, ctx), undefined);
      assert.deepEqual(fs.readFileSync(configPath), configBefore);
    } finally {
      if (previous === undefined) delete process.env[BETTER_OPENAI_FAST_MODE_ENV];
      else process.env[BETTER_OPENAI_FAST_MODE_ENV] = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
