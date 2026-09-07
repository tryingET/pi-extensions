import assert from "node:assert/strict";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { zstdDecompressSync } from "node:zlib";
import { launchTaskSession, taskSessionRequest } from "../dist/task-session/core.js";
import { sealedHost } from "../dist/task-session/host.js";
import { bytesDigest, digest, parseJson } from "../dist/task-session/json.js";
import { launchReserved } from "../dist/task-session/launch.js";
import { loadOwnerModel } from "../dist/task-session/model-source.js";
import { loadHostProfile, preflightProfile } from "../dist/task-session/profile.js";
import { captureResources } from "../dist/task-session/resources.js";
import { durableWrite, readSnapshot } from "../dist/task-session/state.js";
import { restrictedViewComponent } from "../dist/task-session/ui.js";
import { provisionOwnerModel, setup } from "./fixtures/task-session/startup-fixture.mjs";

test("I04 nonbuiltin alias: literal identity, native SDK serializer, same OAuth account", async (t) => {
  const f = provisionOwnerModel(setup());
  const loaded = await loadHostProfile(f.locator, f.request.profile);
  assert.equal(loaded.profile.model.provider, f.source.resolved.provider);
  assert.equal(loaded.profile.model.id, f.source.resolved.model);
  assert.equal(loaded.profile.model.cost.input, 1.25);
  assert.equal(bytesDigest(JSON.stringify(loaded.profile.model)), f.pin.modelDigest);
  assert.deepEqual(taskSessionRequest(f.request), f.request);
  assert.throws(
    () => taskSessionRequest({ ...f.request, modelSource: f.source }),
    /invalid_fields/,
  );
  await assert.rejects(launchTaskSession(f.request), /ak_producer_verification_pending/);
  let sends = 0;
  t.mock.method(globalThis, "fetch", () => {
    throw Error("unexpected_live_fetch");
  });
  const h = await sealedHost(
    {
      incarnation: "owner-alias",
      cwd: f.checkout,
      objective: "literal synthetic alias objective",
      profile: loaded.profile,
      resources: captureResources(f.checkout, f.pin.agentDir),
    },
    loaded.credential,
    {
      send: async (url, init) => {
        sends++;
        assert.equal(String(url), "https://chatgpt.com/backend-api/codex/responses");
        assert.equal(init.redirect, "error");
        assert.equal(new Headers(init.headers).get("chatgpt-account-id"), f.request.account);
        assert.equal(
          new Headers(init.headers).get("authorization"),
          `Bearer ${loaded.credential.access}`,
        );
        const body = JSON.parse(zstdDecompressSync(init.body).toString());
        assert.equal(body.model, f.source.resolved.model);
        assert.notEqual(body.model, f.request.model);
        assert.equal(body.reasoning.effort, f.request.reasoning);
        assert.equal(body.input[0].content[0].text, "literal synthetic alias objective");
        return new Response(
          `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1 } } })}\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    },
  );
  assert.equal(sends, 0);
  for (const identity of [h.identity, h.inspect().identity]) {
    assert.equal(identity.provider, f.request.provider);
    assert.equal(identity.model, f.request.model);
    assert.equal(identity.resolvedProvider, f.source.resolved.provider);
    assert.equal(identity.resolvedModel, f.source.resolved.model);
    assert.equal(identity.account, identity.resolvedAccount);
    assert.equal(identity.modelSourceDigest, f.pin.modelSourceDigest);
  }
  const view = restrictedViewComponent(
    () => h.inspect(),
    async () => {},
    () => {},
    () => {},
  );
  const visible = view.render(80).join("\n");
  for (const label of [
    f.request.provider,
    f.request.model,
    f.source.resolved.provider,
    f.source.resolved.model,
  ])
    assert.ok(visible.includes(label), label);
  h.admit(Date.now() + 30000);
  await h.dispatchAfterClosed(() => {});
  assert.equal(sends, 1);
  assert.equal(
    readSnapshot(f.locator).attempts.length,
    0,
    "direct host test is not reservation/admission proof",
  );
});

test("I04 canonical source identity is independent of JSON key order", async () => {
  const f = provisionOwnerModel(setup()),
    path = join(f.root, "model-sources", `${f.pin.modelSourceDigest}.json`);
  const before = await preflightProfile(f.locator, f.request.profile);
  const reverse = (v) =>
    Array.isArray(v)
      ? v.map(reverse)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .reverse()
              .map(([k, value]) => [k, reverse(value)]),
          )
        : v;
  writeFileSync(path, JSON.stringify(reverse(f.source)));
  const after = await preflightProfile(f.locator, f.request.profile);
  assert.deepEqual(after.resolution, before.resolution);
  assert.equal(
    loadOwnerModel(f.locator, f.pin.modelSourceDigest, f.source.requested).resolution.modelDigest,
    f.pin.modelDigest,
  );
});

const negatives = {
  api: (s) => {
    s.api = "openai-responses";
  },
  endpoint: (s) => {
    s.baseUrl = "https://synthetic.invalid/backend-api";
  },
  websocket: (s) => {
    s.transport = "websocket";
  },
  refresh: (s) => {
    s.auth.refresh = true;
  },
  "auth-owner": (s) => {
    s.auth.provider = "other-auth-owner";
  },
  "account-change": (s) => {
    s.resolved.account = "another-billing-account";
  },
  "requested-label-change": (s) => {
    s.requested.model = "other-label";
  },
  headers: (s) => {
    s.headers = { "x-extra": "unapproved" };
  },
  factory: (s) => {
    s.factory = "unapproved-module";
  },
  implementation: (s) => {
    s.implementation = "unapproved-stream";
  },
  "unknown-metadata": (s) => {
    s.metadata.extra = "unknown";
  },
  "reasoning-remap": (s) => {
    s.metadata.thinkingLevelMap.high = "medium";
  },
  "cost-change": (s) => {
    s.metadata.costMicroUsdPerMillion.input++;
  },
  "wire-model-change": (s) => {
    s.resolved.model = "another-wire-model";
  },
};
for (const [name, mutate] of Object.entries(negatives))
  test(`I04 ${name} metadata refuses before all effect ports`, async (t) => {
    const f = provisionOwnerModel(setup(), mutate),
      before = readFileSync(join(f.root, "state.json"));
    const calls = { plan: 0, viewer: 0, supervisor: 0, network: 0 };
    t.mock.method(globalThis, "fetch", () => {
      calls.network++;
      throw Error("unexpected_fetch");
    });
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
      /owner_model_|model_source_identity_mismatch|invalid_fields|model_pin_mismatch/,
    );
    assert.deepEqual(calls, { plan: 0, viewer: 0, supervisor: 0, network: 0 });
    assert.deepEqual(readFileSync(join(f.root, "state.json")), before);
    assert.deepEqual(readdirSync(join(f.root, "attempts")), []);
  });
for (const fault of ["missing-source", "changed-bytes", "unsupported-reasoning"]) {
  test(`I04 ${fault} cannot fall back or create occupancy`, async () => {
    const f = provisionOwnerModel(setup()),
      path = join(f.root, "model-sources", `${f.pin.modelSourceDigest}.json`);
    if (fault === "missing-source") rmSync(path);
    if (fault === "changed-bytes")
      writeFileSync(path, JSON.stringify({ ...f.source, transport: "websocket" }));
    if (fault === "unsupported-reasoning") {
      f.pin.reasoning = "max";
      f.request.reasoning = "max";
      f.request.profile = digest(f.pin);
      durableWrite(join(f.root, "profiles", `${f.request.profile}.json`), f.pin, true);
    }
    let effects = 0;
    const before = readFileSync(join(f.root, "state.json"));
    await assert.rejects(
      launchReserved(f.request, f.locator, {
        plan: async () => {
          effects++;
          throw Error("unexpected_plan");
        },
        openViewer: async () => {
          effects++;
          return { ok: true };
        },
        supervise: async () => {
          effects++;
        },
      }),
      /ENOENT|model_source_pin_mismatch|reasoning_profile_unsupported/,
    );
    assert.equal(effects, 0);
    assert.deepEqual(readFileSync(join(f.root, "state.json")), before);
    assert.deepEqual(readdirSync(join(f.root, "attempts")), []);
  });
}

test("I04 separate owner accounts cannot borrow each other's copied native credentials", async () => {
  const first = provisionOwnerModel(setup()),
    base = setup();
  const c = parseJson(
    readFileSync(join(base.root, "credentials", `${base.pin.credentialDigest}.json`)),
  );
  c.access = `synthetic.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "synthetic-second-account" } })).toString("base64url")}.synthetic`;
  base.pin.account = "synthetic-second-account";
  base.pin.credentialDigest = digest(c);
  durableWrite(join(base.root, "credentials", `${base.pin.credentialDigest}.json`), c, true);
  const second = provisionOwnerModel(base),
    observed = [];
  const hosts = [];
  for (const f of [first, second]) {
    const p = await loadHostProfile(f.locator, f.request.profile);
    hosts.push(
      await sealedHost(
        {
          incarnation: f.pin.account,
          cwd: f.checkout,
          objective: "synthetic account isolation",
          profile: p.profile,
          resources: captureResources(f.checkout, f.pin.agentDir),
        },
        p.credential,
        {
          send: async (_url, init) => {
            assert.equal(
              new Headers(init.headers).get("authorization"),
              `Bearer ${p.credential.access}`,
            );
            observed.push(new Headers(init.headers).get("chatgpt-account-id"));
            return new Response(
              `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1 } } })}\n\n`,
              { headers: { "content-type": "text/event-stream" } },
            );
          },
        },
      ),
    );
  }
  for (const h of hosts) {
    h.admit(Date.now() + 30000);
    await h.dispatchAfterClosed(() => {});
  }
  assert.deepEqual(observed, [first.pin.account, second.pin.account]);
});
