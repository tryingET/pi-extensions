import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as zlib from "node:zlib";
import { getModel } from "@earendil-works/pi-ai/compat";
import {
  interpretTaskSessionMessage,
  taskSessionAdapterIdentity,
} from "../../pi-society-orchestrator/dist/task-session/task-session-adapter.js";
import { AdmissionChannel, encodeFrame, FrameDecoder } from "../dist/task-session/channel.js";
import { classifySnapshot } from "../dist/task-session/classify.js";
import { guardedCodexOptions, readonlyCredentials } from "../dist/task-session/codex.js";
import { DispatchGuard } from "../dist/task-session/dispatch.js";
import { sealedHost } from "../dist/task-session/host.js";
import { digest, parseJson } from "../dist/task-session/json.js";
import { captureResources, literalLoader } from "../dist/task-session/resources.js";
import { launchRestrictedTaskSessionWindow } from "../dist/task-session/shared-ghostty.js";
import {
  conflicts,
  durableWrite,
  physicalIdentity,
  readSnapshot,
  reserve,
} from "../dist/task-session/state.js";

const scratch = () => mkdtempSync(join(tmpdir(), "task5480-"));
const d = {
  akInstance: "synthetic",
  taskId: 1,
  checkout: "/synthetic/a",
  commonGit: "/synthetic/a/.git",
  sharedEffects: ["effect"],
  physical: { checkout: "1:1", commonGit: "1:2" },
};
function fixture() {
  const root = scratch();
  chmodSync(root, 0o700);
  writeFileSync(join(root, "namespace.lock"), "", { mode: 0o600 });
  const rs = lstatSync(root),
    ls = lstatSync(join(root, "namespace.lock"));
  const locator = {
    schema: "pi.task-session.locator.v1",
    namespace: "synthetic",
    root,
    uid: process.getuid(),
    rootDev: rs.dev,
    rootIno: rs.ino,
    lockDev: ls.dev,
    lockIno: ls.ino,
  };
  mkdirSync(join(root, ".git"));
  const bound = {
    ...d,
    checkout: root,
    commonGit: join(root, ".git"),
    physical: { checkout: physicalIdentity(root), commonGit: physicalIdentity(join(root, ".git")) },
  };
  const state = {
    schema: "pi.task-session.state.v1",
    namespace: "synthetic",
    generation: 1,
    withdrawn: false,
    inventoryComplete: true,
    domains: [bound],
    enrolled: [bound],
    attempts: [],
  };
  durableWrite(join(root, "state.json"), state);
  return { root, locator, state, d: bound };
}
const profile = () => ({
  model: getModel("openai-codex", "gpt-5.4"),
  reasoning: "high",
  account: "synthetic-account",
  runDeadline: Date.now() + 60000,
});
const credential = () => ({
  type: "oauth",
  access: `synthetic.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "synthetic-account" } })).toString("base64url")}.synthetic`,
  refresh: "synthetic-not-a-secret",
  expires: Date.now() + 3600000,
});
function active() {
  const g = new DispatchGuard("inc", "profile");
  g.prepared();
  g.admitted(Date.now() + 60000);
  g.closed();
  g.begin();
  return g;
}
const payload = (p) => ({
  model: p.model.id,
  stream: true,
  store: false,
  reasoning: { effort: "high" },
});
const headers = (c) => ({
  authorization: `Bearer ${c.access}`,
  "chatgpt-account-id": "synthetic-account",
});
for (const [name, input] of Object.entries({
  duplicate: '{"x":1,"x":2}',
  escapedDuplicate: '{"x":1,"\\u0078":2}',
  negative: "-1",
  float: "1.1",
  bom: "\ufeff{}",
  invalidUtf8: Buffer.from([0xff]),
  surrogate: '"\\ud800"',
  nonAsciiKey: '{"λ":1}',
  unsafeInteger: "9007199254740992",
  deep: `${"[".repeat(18)}0${"]".repeat(18)}`,
  trailing: "{}{}",
}))
  test(`strict parser refuses ${name}`, () => assert.throws(() => parseJson(input)));
test("canonical parser positive", () =>
  assert.deepEqual(parseJson('{"b":[true,null,0],"a":"literal /skill:x"}'), {
    b: [true, null, 0],
    a: "literal /skill:x",
  }));
for (const [name, other] of Object.entries({
  task: { ...d, checkout: "/b", commonGit: "/b/.git", sharedEffects: [] },
  git: { ...d, taskId: 2, checkout: "/b", sharedEffects: [] },
  nested: { ...d, taskId: 2, checkout: "/synthetic/a/nested", commonGit: "/x", sharedEffects: [] },
  effect: { ...d, taskId: 2, checkout: "/b", commonGit: "/b/.git" },
}))
  test(`independent ${name} conflict`, () => assert.equal(conflicts(d, other), true));
test("independent domains do not conflict", () =>
  assert.equal(
    conflicts(d, { ...d, taskId: 2, checkout: "/b", commonGit: "/b/.git", sharedEffects: [] }),
    false,
  ));
test("real mutex reservation durable, repeat inspects, different digest refuses", () => {
  const { root, locator, d } = fixture();
  const a = reserve(locator, "r", digest("one"), d);
  assert.deepEqual(reserve(locator, "r", digest("one"), d), a);
  assert.throws(() => reserve(locator, "r", digest("two"), d));
  assert.throws(() => reserve(locator, "other", digest("one"), d), /domain_occupied/);
  assert.equal(readSnapshot(locator).attempts.length, 1);
  assert.equal(lstatSync(join(root, "namespace.lock")).ino, locator.lockIno);
});
test("three retirement fields independent and withdrawn history remains", () => {
  const { locator, d, root } = fixture();
  const a = reserve(locator, "r", digest("one"), d);
  for (const field of ["hostClosed", "effectsDisposed", "claimResolved"]) {
    const s = readSnapshot(locator);
    s.attempts[0][field] = true;
    durableWrite(join(root, "state.json"), s);
    if (field !== "claimResolved") assert.throws(() => reserve(locator, "new", digest("two"), d));
  }
  const s = readSnapshot(locator);
  s.withdrawn = true;
  durableWrite(join(root, "state.json"), s);
  assert.throws(() => reserve(locator, "new", digest("two"), d), /withdrawn/);
  assert.equal(readSnapshot(locator).attempts[0].attempt, a.attempt);
});
test("state symlink/mode/inode replacement refuses", () => {
  const { root, locator } = fixture();
  chmodSync(join(root, "state.json"), 0o644);
  assert.throws(() => readSnapshot(locator));
  chmodSync(join(root, "state.json"), 0o600);
  const other = join(root, "other");
  writeFileSync(other, "", { mode: 0o600 });
  assert.throws(() => readSnapshot({ ...locator, lockIno: lstatSync(other).ino }));
});
test("immutable T1 cannot replace existing record", () => {
  const root = scratch();
  durableWrite(join(root, "t1.json"), { n: 1 }, true);
  assert.throws(() => durableWrite(join(root, "t1.json"), { n: 2 }, true));
  assert.equal(parseJson(readFileSync(join(root, "t1.json"))).n, 1);
});
test("whole request classification: outside, mixed, missing, task cross-checkout", () => {
  const { state } = fixture();
  const outside = { ...fixture().d, taskId: 2, sharedEffects: [] };
  state.domains.push(outside);
  const request = {
    schema: "pi.task-session.classify-request.v1",
    requestId: "r",
    akInstance: "synthetic",
    taskIds: [2],
    cwd: outside.checkout,
  };
  assert.equal(classifySnapshot(request, state).classification, "outside");
  assert.equal(classifySnapshot({ ...request, taskIds: [1, 2] }, state).classification, "enrolled");
  assert.equal(classifySnapshot({ ...request, taskIds: [3] }, state).classification, "unknown");
  state.inventoryComplete = false;
  assert.equal(classifySnapshot(request, state).classification, "unknown");
});
test("default denial irreversible before construction", () => {
  const g = new DispatchGuard("i", "p");
  assert.throws(() => g.assert());
  assert.throws(() => g.prepared());
});
test("duplicate CLOSED / ingress and identity drift deny", () => {
  const g = active();
  assert.throws(() => g.begin());
  const h = active();
  assert.throws(() => h.assert("wrong", "profile"));
  assert.throws(() => h.assert());
});
test("auth mutation rejected before updater and expiry before read", async () => {
  let updates = 0;
  const g = active();
  const store = readonlyCredentials(credential(), profile(), g);
  await assert.rejects(
    store.modify("openai-codex", async () => {
      updates++;
      return credential();
    }),
  );
  assert.equal(updates, 0);
  const c = credential();
  c.expires = Date.now() + 1000;
  await assert.rejects(
    readonlyCredentials(c, profile(), active()).read("openai-codex"),
    /auth_refresh_required/,
  );
});
for (const compression of ["string", "zstd"])
  test(`actual-send validates ${compression} body and forces redirect error`, async () => {
    const p = profile(),
      c = credential(),
      g = active();
    let calls = 0;
    const o = guardedCodexOptions(p, c, g, {
      send: async (_url, init) => {
        calls++;
        assert.equal(init.redirect, "error");
        return new Response("");
      },
    });
    const body = JSON.stringify(o.onPayload(payload(p)));
    const h = headers(c);
    const bytes = compression === "zstd" ? zlib.zstdCompressSync(body) : body;
    if (compression === "zstd") h["content-encoding"] = "zstd";
    await o.fetch("https://chatgpt.com/backend-api/codex/responses", {
      method: "POST",
      headers: h,
      body: bytes,
    });
    assert.equal(calls, 1);
    await assert.rejects(
      o.fetch("https://chatgpt.com/backend-api/codex/responses", {
        method: "POST",
        headers: h,
        body: bytes,
      }),
    );
    assert.equal(calls, 1);
  });
for (const kind of ["body", "account", "url", "stop", "compression"])
  test(`send refuses ${kind} before network`, async () => {
    const p = profile(),
      c = credential(),
      g = active();
    let calls = 0;
    const o = guardedCodexOptions(p, c, g, {
      send: async () => {
        calls++;
        return new Response("");
      },
    });
    const body = JSON.stringify(o.onPayload(payload(p)));
    const h = headers(c);
    if (kind === "account") h["chatgpt-account-id"] = "other";
    if (kind === "stop") g.stop();
    if (kind === "compression") h["content-encoding"] = "zstd";
    await assert.rejects(
      o.fetch(
        kind === "url"
          ? "https://elsewhere.invalid"
          : "https://chatgpt.com/backend-api/codex/responses",
        {
          method: "POST",
          headers: h,
          body: kind === "body" ? "{}" : kind === "compression" ? Buffer.from("bad") : body,
        },
      ),
    );
    assert.equal(calls, 0);
  });
for (const option of [
  { transport: "auto" },
  { maxRetries: 1 },
  { apiKey: "override" },
  { fetch: () => {} },
  { env: {} },
  { headers: {} },
])
  test(`no provider override ${Object.keys(option)[0]}`, () =>
    assert.throws(() =>
      guardedCodexOptions(profile(), credential(), active(), { send: fetch }, option),
    ));
test("literal resources ordered and executable factories absent", () => {
  const root = scratch(),
    agent = join(root, "agent"),
    repo = join(root, "repo");
  mkdirSync(agent);
  mkdirSync(repo);
  mkdirSync(join(repo, ".git"));
  writeFileSync(join(root, "AGENTS.md"), "ancestor");
  writeFileSync(join(agent, "AGENTS.md"), "global");
  writeFileSync(join(repo, "AGENTS.override.md"), "override");
  writeFileSync(join(repo, "AGENTS.md"), "shadowed");
  const r = captureResources(repo, agent);
  assert.deepEqual(
    r.context.map((x) => x.content),
    ["global", "ancestor", "override"],
  );
  const loader = literalLoader(r);
  assert.deepEqual(loader.getExtensions().extensions, []);
  assert.throws(() => loader.extendResources({}));
  writeFileSync(join(repo, "AGENTS.override.md"), Buffer.from([0xff]));
  assert.throws(() => captureResources(repo, agent));
});
const draft = JSON.parse(
  readFileSync(new URL("./fixtures/task-session/ak-draft.json", import.meta.url)),
);
test("actual AK source fixtures decode without asserting native integration readiness", async () => {
  for (const message of draft.valid)
    assert.deepEqual(interpretTaskSessionMessage(message), message);
  const { interpretTaskSessionDefinition } = await import(
    "../dist/task-session/producer-adapter.js"
  );
  for (const [name, value] of Object.entries(draft.definition_fixtures))
    assert.deepEqual(interpretTaskSessionDefinition(name, value), value);
  assert.equal(taskSessionAdapterIdentity.integrationReady, false);
});
for (const mutation of draft.invalid_mutations_of_valid_0)
  test(`AK producer negative fixture ${mutation.path.join(".")}`, () => {
    const v = structuredClone(draft.valid[0]);
    let parent = v;
    for (const key of mutation.path.slice(0, -1)) parent = parent[key];
    parent[mutation.path.at(-1)] = mutation.value;
    assert.throws(() => interpretTaskSessionMessage(v));
  });
test("framing split at every byte and oversize/truncation rejection", () => {
  const frame = encodeFrame(draft.valid[0]);
  const decoder = new FrameDecoder();
  const messages = [];
  for (const byte of frame) messages.push(...decoder.push(Buffer.from([byte])));
  decoder.end();
  assert.deepEqual(messages, [draft.valid[0]]);
  assert.throws(() => new FrameDecoder().push(Buffer.from([255, 255, 255, 255])));
  const truncated = new FrameDecoder();
  truncated.push(frame.subarray(0, 9));
  assert.throws(() => truncated.end());
});
test("channel immutable T1 then bound one-shot CLOSED; restart cannot replay", () => {
  const p = structuredClone(draft.valid[0]);
  p.body.startup_deadline_ms = Date.now() + 60000;
  const c = new AdmissionChannel(p, interpretTaskSessionMessage);
  const admission = {
    protocol: p.protocol,
    kind: "ADMISSION_RESULT",
    binding: p.binding,
    body: {
      outcome: "ADMITTED",
      baseline_digest: p.body.baseline_digest,
      readback_digest: "a".repeat(64),
      claim: {
        task_id: 1,
        repo: p.body.repo,
        version: 2,
        claimed_by: p.body.actor,
        claimed_at: new Date().toISOString(),
        lease_expires_at: new Date(Date.now() + 60000).toISOString(),
      },
      effects: "committed_verified",
      reason: "native_claim_verified",
      accounting: {
        task_version_before: 1,
        task_version_after: 2,
        restored_evidence_attachments_preserved: true,
        expired_deferrals: [],
        governance_receipt_ids: ["1"],
        event_ids: ["1"],
      },
    },
  };
  const t1 = c.admission(admission);
  const root = scratch();
  c.publish(root);
  const closed = {
    protocol: p.protocol,
    kind: "CLOSED",
    binding: p.binding,
    body: { outcome: "ADMITTED", t1_digest: digest(t1) },
  };
  assert.ok(c.closed(closed) > Date.now());
  assert.throws(() => c.closed(closed));
  assert.throws(() => new AdmissionChannel(p, interpretTaskSessionMessage).closed(closed));
});
test("restricted production transport port contract rejects failure without shell fallback (not G2 process proof)", async () => {
  const calls = [];
  const result = await launchRestrictedTaskSessionWindow(
    "synthetic",
    "/synthetic",
    async (command, args, options) => {
      calls.push({ command, args, options });
      return { code: 1, killed: false };
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "/usr/bin/ghostty");
  assert.ok(calls[0].args.includes("/home/tryinget/.local/libexec/pi-task-sessions/view-v1"));
  assert.ok(!calls[0].args.some((a) => ["/bin/sh", "-lc", "-i"].includes(a)));
  assert.equal(result.effectDisposition, "effect_indeterminate");
});
function completeResponse() {
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
test("actual SDK host constructs without auth/send, literal prompt uses native compressed Codex serializer", async () => {
  const root = scratch(),
    agent = join(root, "agent");
  mkdirSync(agent);
  mkdirSync(join(root, ".git"));
  let sends = 0;
  const p = profile();
  assert.ok(p.model);
  const objective = "/skill:literal !not-a-command";
  const h = await sealedHost(
    {
      incarnation: "synthetic",
      cwd: root,
      objective,
      profile: p,
      resources: captureResources(root, agent),
    },
    credential(),
    {
      send: async (_url, init) => {
        sends++;
        assert.equal(new Headers(init.headers).get("content-encoding"), "zstd");
        const body = JSON.parse(zlib.zstdDecompressSync(init.body).toString());
        assert.equal(body.model, p.model.id);
        assert.equal(body.input[0].content[0].text, objective);
        return completeResponse();
      },
    },
  );
  assert.equal(sends, 0);
  assert.equal(h.inspect().phase, "prepared");
  assert.ok(!("session" in h));
  h.admit(Date.now() + 30000);
  await h.dispatchAfterClosed(() => {});
  assert.equal(sends, 1);
  assert.equal(h.inspect().started, true);
  await assert.rejects(h.dispatchAfterClosed(() => {}));
});
function toolResponse(path) {
  const item = {
    type: "function_call",
    id: "fc_synthetic",
    call_id: "call_synthetic",
    name: "write",
    arguments: JSON.stringify({ path, content: "synthetic tool evidence" }),
  };
  return new Response(
    [
      { type: "response.output_item.added", output_index: 0, item: { ...item, arguments: "" } },
      { type: "response.output_item.done", output_index: 0, item },
      {
        type: "response.completed",
        response: {
          status: "completed",
          output: [item],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ]
      .map((e) => `data: ${JSON.stringify(e)}\n\n`)
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}
for (const stopped of [false, true])
  test(`actual SDK/native Codex tool round ${stopped ? "denied after send" : "executes and continues"}`, async () => {
    const root = scratch(),
      agent = join(root, "agent");
    mkdirSync(agent);
    mkdirSync(join(root, ".git"));
    const target = join(root, "tool-proof");
    let sends = 0;
    const h = await sealedHost(
      {
        incarnation: "i",
        cwd: root,
        objective: "write synthetic proof",
        profile: profile(),
        resources: captureResources(root, agent),
      },
      credential(),
      {
        send: async () => {
          sends++;
          if (sends === 1) {
            if (stopped) h.deny("synthetic_stop");
            return toolResponse(target);
          }
          return completeResponse();
        },
      },
    );
    h.admit(Date.now() + 30000);
    await h.dispatchAfterClosed(() => {});
    assert.equal(existsSync(target), !stopped);
    assert.equal(sends, stopped ? 1 : 2);
    if (!stopped) assert.equal(readFileSync(target, "utf8"), "synthetic tool evidence");
  });
test("host persistence failure after CLOSED sends nothing", async () => {
  const root = scratch(),
    agent = join(root, "agent");
  mkdirSync(agent);
  mkdirSync(join(root, ".git"));
  let sends = 0;
  const h = await sealedHost(
    {
      incarnation: "i",
      cwd: root,
      objective: "literal",
      profile: profile(),
      resources: captureResources(root, agent),
    },
    credential(),
    {
      send: async () => {
        sends++;
        return completeResponse();
      },
    },
  );
  h.admit(Date.now() + 30000);
  await assert.rejects(
    h.dispatchAfterClosed(() => {
      throw new Error("synthetic fsync fault");
    }),
  );
  assert.equal(sends, 0);
  assert.equal(h.inspect().denial, "post_close_persistence_failed");
});

test("SDK provider failure is not labeled a normal host finish", async () => {
  const root = scratch(),
    agent = join(root, "agent");
  mkdirSync(agent);
  mkdirSync(join(root, ".git"));
  let sends = 0;
  const h = await sealedHost(
    {
      incarnation: "synthetic",
      cwd: root,
      objective: "synthetic failure",
      profile: profile(),
      resources: captureResources(root, agent),
    },
    credential(),
    {
      send: async () => {
        sends++;
        return new Response('data: {"type":"error","message":"synthetic provider failure"}\n\n', {
          headers: { "content-type": "text/event-stream" },
        });
      },
    },
  );
  h.admit(Date.now() + 30000);
  await h.dispatchAfterClosed(() => {});
  assert.equal(sends, 1);
  assert.equal(h.inspect().denial, "provider_error");
});
