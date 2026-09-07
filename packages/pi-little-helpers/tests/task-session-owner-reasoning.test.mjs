import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { clampThinkingLevel, getSupportedThinkingLevels } from "@earendil-works/pi-ai/compat";
import { bytesDigest, digest, parseJson } from "../dist/task-session/json.js";
import { launchReserved } from "../dist/task-session/launch.js";
import { loadOwnerModel } from "../dist/task-session/model-source.js";
import { loadProfile } from "../dist/task-session/profile.js";
import { durableWrite } from "../dist/task-session/state.js";
import { provisionOwnerModel, setup } from "./fixtures/task-session/startup-fixture.mjs";

const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const capabilityMap = (mask) =>
  Object.fromEntries(
    levels.map((level, i) => [level, mask & (1 << i) ? (level === "off" ? "none" : level) : null]),
  );
function base() {
  const f = provisionOwnerModel(setup());
  return {
    ...f,
    model: loadOwnerModel(f.locator, f.pin.modelSourceDigest, f.source.requested).model,
  };
}
function persist(file, value) {
  if (existsSync(file)) assert.equal(digest(parseJson(readFileSync(file))), digest(value));
  else durableWrite(file, value, true);
}
// Independent mutation of a known valid descriptor: do NOT ask the rejecting loader to create
// a negative model pin. Recompute source, materialized model AND profile hashes for every case.
function repin(f, reasoning, mask, level) {
  const source = structuredClone(f.source),
    model = structuredClone(f.model);
  source.metadata.reasoning = model.reasoning = reasoning;
  source.metadata.thinkingLevelMap = model.thinkingLevelMap = capabilityMap(mask);
  const pin = {
    ...f.pin,
    reasoning: level,
    modelSourceDigest: digest(source),
    modelDigest: bytesDigest(JSON.stringify(model)),
  };
  const reference = digest(pin);
  persist(join(f.root, "model-sources", `${pin.modelSourceDigest}.json`), source);
  persist(join(f.root, "profiles", `${reference}.json`), pin);
  assert.deepEqual(loadProfile(f.locator, reference), pin);
  return {
    ...f,
    source,
    model,
    pin,
    request: { ...f.request, reasoning: level, profile: reference },
  };
}
for (const [name, reasoning, mask] of [
  ["reasoning true all-null", true, 0],
  ["reasoning false off-null", false, 0],
]) {
  test(`I04 repinned ${name} rejects SDK off fallback before effects`, async (t) => {
    const f = repin(base(), reasoning, mask, "off");
    assert.deepEqual(getSupportedThinkingLevels(f.model), reasoning ? [] : ["off"]);
    assert.equal(clampThinkingLevel(f.model, "off"), "off", "the SDK fallback itself is unchanged");
    const before = readFileSync(join(f.root, "state.json")),
      calls = { plan: 0, viewer: 0, supervisor: 0, fetch: 0 };
    t.mock.method(globalThis, "fetch", () => {
      calls.fetch++;
      throw Error("unexpected_fetch");
    });
    let error;
    try {
      await launchReserved(f.request, f.locator, {
        plan: async () => {
          calls.plan++;
          throw Error("unexpected_plan");
        },
        openViewer: async () => {
          calls.viewer++;
          return { ok: true };
        },
        supervise: async () => {
          calls.supervisor++;
        },
      });
    } catch (e) {
      error = e;
    }
    assert.deepEqual(readFileSync(join(f.root, "state.json")), before);
    assert.deepEqual(readdirSync(join(f.root, "attempts")), []);
    t.diagnostic(JSON.stringify(calls));
    assert.equal(error?.message, "owner_model_reasoning_capabilities_invalid");
    assert.deepEqual(calls, { plan: 0, viewer: 0, supervisor: 0, fetch: 0 });
  });
}
