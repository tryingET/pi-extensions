import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { zstdDecompressSync } from "node:zlib";
import { streamSimple as streamSimpleOpenAICodexResponses } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { clampThinkingLevel, getSupportedThinkingLevels } from "@earendil-works/pi-ai/compat";
import { guardedCodexOptions } from "../dist/task-session/codex.js";
import { DispatchGuard } from "../dist/task-session/dispatch.js";
import { sealedHost } from "../dist/task-session/host.js";
import { bytesDigest, digest, parseJson } from "../dist/task-session/json.js";
import { launchReserved } from "../dist/task-session/launch.js";
import { assertOwnerThinkingLevel, loadOwnerModel } from "../dist/task-session/model-source.js";
import { loadHostProfile, loadProfile, preflightProfile } from "../dist/task-session/profile.js";
import { captureResources } from "../dist/task-session/resources.js";
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
    await assert.rejects(loadHostProfile(f.locator, f.request.profile), {
      message: "owner_model_reasoning_capabilities_invalid",
    });
    assert.deepEqual(calls, { plan: 0, viewer: 0, supervisor: 0, fetch: 0 });
  });
}

function reply() {
  return new Response(
    "data: " +
      JSON.stringify({
        type: "response.completed",
        response: { status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1 } },
      }) +
      "\n\n",
    { headers: { "content-type": "text/event-stream" } },
  );
}
function checkWire(f, level, url, init) {
  assert.equal(String(url), "https://chatgpt.com/backend-api/codex/responses");
  assert.equal(new Headers(init.headers).get("chatgpt-account-id"), f.pin.account);
  const body = JSON.parse(zstdDecompressSync(init.body).toString());
  assert.equal(body.model, f.source.resolved.model);
  assert.equal(
    body.reasoning?.effort,
    level === "off" ? undefined : level,
    "no native effort substitution",
  );
  if (level === "off")
    assert.equal(body.reasoning, undefined, "off omits native reasoning, not an inferred effort");
}
test("I04 all 256 declarations / 1792 membership cases and 448 native serializations", async (t) => {
  const f = base(),
    before = readFileSync(join(f.root, "state.json"));
  const credential = parseJson(
    readFileSync(join(f.root, "credentials", `${f.pin.credentialDigest}.json`)),
  );
  const counts = {
    declarations: 0,
    validDeclarations: 0,
    invalidDeclarations: 0,
    members: 0,
    nonmembers: 0,
    invalidRequests: 0,
    sends: 0,
  };
  t.mock.method(globalThis, "fetch", () => {
    throw Error("unexpected_live_fetch");
  });
  for (const reasoning of [false, true])
    for (let mask = 0; mask < 128; mask++) {
      const p = repin(f, reasoning, mask, "off"),
        valid = reasoning ? mask >= 2 : mask === 1;
      const label = `reasoning=${reasoning} mask=${mask}`;
      counts.declarations++;
      const load = () => loadOwnerModel(p.locator, p.pin.modelSourceDigest, p.source.requested);
      if (valid) {
        counts.validDeclarations++;
        assert.deepEqual(load().model, p.model, label);
        assert.deepEqual(
          getSupportedThinkingLevels(p.model),
          levels.filter((_, i) => mask & (1 << i)),
          label,
        );
      } else {
        counts.invalidDeclarations++;
        assert.throws(load, /owner_model_reasoning_capabilities_invalid/, label);
      }
      for (const [i, level] of levels.entries()) {
        const member = Boolean(mask & (1 << i)),
          select = () => assertOwnerThinkingLevel(p.model, level);
        if (!valid) {
          counts.invalidRequests++;
          assert.throws(select, /owner_model_reasoning_capabilities_invalid/, label);
          continue;
        }
        if (!member) {
          counts.nonmembers++;
          assert.throws(select, /reasoning_profile_unsupported/, label);
          continue;
        }
        counts.members++;
        select();
        assert.equal(clampThinkingLevel(p.model, level), level, label);
        const guard = new DispatchGuard("membership-table", "synthetic-profile");
        guard.prepared();
        guard.admitted(Date.now() + 60000);
        guard.closed();
        guard.begin();
        const profile = {
          model: p.model,
          account: p.pin.account,
          reasoning: level,
          runDeadline: Date.now() + 60000,
        };
        const options = guardedCodexOptions(profile, credential, guard, {
          send: async (url, init) => {
            counts.sends++;
            checkWire(p, level, url, init);
            return reply();
          },
        });
        const result = await streamSimpleOpenAICodexResponses(
          p.model,
          {
            messages: [
              { role: "user", content: "synthetic membership table", timestamp: Date.now() },
            ],
          },
          options,
        ).result();
        assert.equal(result.stopReason, "stop", `${label} ${level}: ${result.errorMessage}`);
      }
    }
  assert.deepEqual(counts, {
    declarations: 256,
    validDeclarations: 127,
    invalidDeclarations: 129,
    members: 448,
    nonmembers: 441,
    invalidRequests: 903,
    sends: 448,
  });
  assert.deepEqual(readFileSync(join(f.root, "state.json")), before);
  assert.deepEqual(readdirSync(join(f.root, "attempts")), []);
  t.diagnostic(JSON.stringify(counts));
});
for (const [reasoning, mask, level, expected] of [
  [true, 1, "off", "owner_model_reasoning_capabilities_invalid"],
  [false, 9, "off", "owner_model_reasoning_capabilities_invalid"],
  [false, 8, "off", "owner_model_reasoning_capabilities_invalid"],
  [true, 8, "off", "reasoning_profile_unsupported"],
  [true, 9, "max", "reasoning_profile_unsupported"],
])
  test(`I04 repinned inconsistent or absent request ${reasoning}/${mask}/${level} has no effects`, async (t) => {
    const f = repin(base(), reasoning, mask, level),
      before = readFileSync(join(f.root, "state.json"));
    const calls = { plan: 0, viewer: 0, supervisor: 0, fetch: 0 };
    t.mock.method(globalThis, "fetch", () => {
      calls.fetch++;
      throw Error("unexpected_fetch");
    });
    const error = new RegExp(`^${expected}$`);
    await assert.rejects(
      launchReserved(f.request, f.locator, {
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
      }),
      (e) => error.test(e.message),
    );
    await assert.rejects(loadHostProfile(f.locator, f.request.profile), (e) =>
      error.test(e.message),
    );
    assert.deepEqual(calls, { plan: 0, viewer: 0, supervisor: 0, fetch: 0 });
    assert.deepEqual(readFileSync(join(f.root, "state.json")), before);
    assert.deepEqual(readdirSync(join(f.root, "attempts")), []);
  });
for (const [reasoning, mask, level] of [
  ...levels.map((level) => [true, 127, level]),
  [false, 1, "off"],
  ...levels.slice(1).map((level, i) => [true, 1 << (i + 1), level]),
]) {
  test(`I04 valid ${reasoning}/${mask}/${level} stays exact through preflight, SDK host and wire`, async (t) => {
    const f = repin(base(), reasoning, mask, level),
      before = readFileSync(join(f.root, "state.json"));
    let sends = 0;
    t.mock.method(globalThis, "fetch", () => {
      throw Error("unexpected_live_fetch");
    });
    assert.equal((await preflightProfile(f.locator, f.request.profile)).reasoning, level);
    const p = await loadHostProfile(f.locator, f.request.profile);
    const h = await sealedHost(
      {
        incarnation: `valid-${reasoning}-${mask}-${level}`,
        cwd: f.checkout,
        objective: "synthetic exact reasoning",
        profile: p.profile,
        resources: captureResources(f.checkout, f.pin.agentDir),
      },
      p.credential,
      {
        send: async (url, init) => {
          sends++;
          checkWire(f, level, url, init);
          return reply();
        },
      },
    );
    assert.equal(h.identity.reasoning, level);
    assert.equal(sends, 0);
    h.admit(Date.now() + 30000);
    await h.dispatchAfterClosed(() => {});
    assert.equal(sends, 1);
    assert.deepEqual(readFileSync(join(f.root, "state.json")), before);
    assert.deepEqual(readdirSync(join(f.root, "attempts")), []);
  });
}

test("I04 every nonidentity native effort remap refuses even when unrequested", () => {
  const f = repin(base(), true, 127, "off");
  let refused = 0;
  for (const level of levels)
    for (const effort of ["none", ...levels.slice(1)]) {
      if (effort === (level === "off" ? "none" : level)) continue;
      const model = structuredClone(f.model);
      model.thinkingLevelMap[level] = effort;
      assert.throws(
        () => assertOwnerThinkingLevel(model, "off"),
        /owner_model_reasoning_remap_forbidden/,
      );
      refused++;
    }
  assert.equal(refused, 42);
});
