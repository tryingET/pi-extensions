import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  claimAttachment,
  prepareAttachment,
  publishAttachmentViewerSafety,
  readAttachment,
  readAttachmentTicket,
  viewerArgv,
} from "../extensions/self/subagent-attachment-registry.ts";
import {
  AttachmentSafetyObserver,
  validAttachmentViewerSafety,
} from "../extensions/self/subagent-attachment-safety.ts";
import { writeSessionStatus } from "../extensions/self/subagent-session.ts";
import { fixture } from "./subagent-cockpit-harness.mjs";

const inert = { provider: "asc-attachment-inert", id: "view-only", api: "asc-attachment-inert" };
const keys = [
  "modelStartAttempts",
  "inertProviderStreamAttempts",
  "toolCallAttempts",
  "userBashAttempts",
];
const ctx = () => ({ sessionManager: { getSessionFile: () => undefined }, model: { ...inert } });
function observer(pi = { getActiveTools: () => [] }) {
  const snapshots = [];
  const safety = new AttachmentSafetyObserver(pi, inert, (s) => {
    snapshots.push(structuredClone(s));
    return true;
  });
  return { safety, snapshots };
}

test("unknown/missing/throwing SDK APIs and unregistered monitors stay null, never asserted zero", () => {
  const h = observer({});
  h.safety.publish("ready", {});
  const unknown = h.snapshots.at(-1);
  assert.deepEqual(unknown.sdk, {
    noSession: null,
    activeToolsCount: null,
    inertModelSelected: null,
  });
  assert.deepEqual(Object.values(unknown.attempts), [null, null, null, null]);
  assert.ok(validAttachmentViewerSafety(unknown));
  const failing = observer({
    getActiveTools() {
      throw Error("unavailable");
    },
  });
  failing.safety.publish("ready", {
    sessionManager: {
      getSessionFile() {
        throw Error("unavailable");
      },
    },
    get model() {
      throw Error("unavailable");
    },
  });
  assert.deepEqual(failing.snapshots.at(-1).sdk, unknown.sdk);
  for (const bad of [undefined, 0, ["tool", 1]]) {
    const invalid = observer({ getActiveTools: () => bad });
    invalid.safety.publish("ready", { sessionManager: { getSessionFile: () => null } });
    assert.equal(invalid.snapshots.at(-1).sdk.activeToolsCount, null);
    assert.equal(invalid.snapshots.at(-1).sdk.noSession, null);
  }
});

test("registered hook counters and input observation counts are bounded content-free snapshots; failed writes retry latest", async () => {
  const h = observer();
  for (const key of keys) h.safety.instrument(key);
  h.safety.publish("ready", ctx());
  assert.deepEqual(h.snapshots.at(-1).sdk, {
    noSession: true,
    activeToolsCount: 0,
    inertModelSelected: true,
  });
  assert.deepEqual(Object.values(h.snapshots.at(-1).attempts), [0, 0, 0, 0]);
  for (const key of keys) h.safety.attempt(key);
  assert.deepEqual(Object.values(h.snapshots.at(-1).attempts), [1, 1, 1, 1]);
  await assert.rejects(
    h.safety.input(ctx(), async () => {
      throw Error("control failure");
    }),
    /control failure/,
  );
  assert.deepEqual(
    h.snapshots.slice(-2).map((s) => s.stage),
    ["before_input", "after_input"],
  );
  assert.deepEqual(h.snapshots.at(-1).inputObservations, { before: 1, after: 1 });
  assert.ok(h.snapshots.every(validAttachmentViewerSafety));
  assert.ok(h.snapshots.every((s) => Buffer.byteLength(JSON.stringify(s)) < 2048));
  assert.equal(
    validAttachmentViewerSafety({ ...h.snapshots.at(-1), prompt: "MUST NOT PUBLISH" }),
    false,
  );
  assert.equal(
    validAttachmentViewerSafety({
      ...h.snapshots.at(-1),
      attempts: { ...h.snapshots.at(-1).attempts, toolCallAttempts: -1 },
    }),
    false,
  );
  let busy = true;
  const retained = [];
  const retry = new AttachmentSafetyObserver({ getActiveTools: () => [] }, inert, (s) => {
    if (busy) return false;
    retained.push(s);
    return true;
  });
  retry.instrument("toolCallAttempts");
  retry.attempt("toolCallAttempts", ctx());
  retry.attempt("toolCallAttempts");
  busy = false;
  retry.retry();
  assert.equal(retained.length, 1);
  assert.equal(retained[0].attempts.toolCallAttempts, 2);
  assert.equal(retained[0].attempts.inertProviderStreamAttempts, null);
});

test("private safety publisher binds real viewer PID-start/generation; controller, invalid payload, replay, stale attempt rejected", async () => {
  const f = fixture();
  let child;
  try {
    const viewer = fileURLToPath(
      new URL("../extensions/self/subagent-attachment-viewer.ts", import.meta.url),
    );
    const registry = fileURLToPath(
      new URL("../extensions/self/subagent-attachment-registry.ts", import.meta.url),
    );
    const helper = fileURLToPath(
      new URL("../extensions/self/subagent-attachment-safety.ts", import.meta.url),
    );
    const item = prepareAttachment(f.binding, viewer);
    claimAttachment(item);
    const ticket = readAttachmentTicket(item.ticketPath);
    const h = observer();
    for (const key of keys) h.safety.instrument(key);
    h.safety.publish("ready", ctx());
    assert.equal(publishAttachmentViewerSafety(ticket, h.snapshots[0]), false); // Controller is not the native viewer.
    const script = join(f.root, "safety-publisher-fixture.mjs");
    writeFileSync(
      script,
      `import assert from 'node:assert/strict';
      import { acknowledgeAttachmentWithRetry, publishAttachmentViewerSafety } from ${JSON.stringify(registry)};
      import { AttachmentSafetyObserver } from ${JSON.stringify(helper)};
      const t = await acknowledgeAttachmentWithRetry(process.argv.at(-1));
      let last;
      const safety = new AttachmentSafetyObserver({ getActiveTools: () => [] }, ${JSON.stringify(inert)}, s => {
        last = structuredClone(s); return publishAttachmentViewerSafety(t, s);
      });
      for (const key of ${JSON.stringify(keys)}) safety.instrument(key);
      safety.publish('ready', { sessionManager: { getSessionFile: () => undefined }, model: ${JSON.stringify(inert)} });
      assert.equal(publishAttachmentViewerSafety(t, last), false);
      assert.equal(publishAttachmentViewerSafety(t, { ...last, prompt: 'MUST NOT PUBLISH' }), false);
      console.log('published');
      process.stdin.on('data', () => {
        assert.equal(publishAttachmentViewerSafety(t, { ...last, revision: last.revision + 1 }), false);
        console.log('stale-rejected'); process.exit(0);
      });`,
    );
    child = spawn(process.execPath, [script, ...viewerArgv(viewer, item.ticketPath)], {
      cwd: f.root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d;
    });
    await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(() => {
        throw Error(err || "publisher fixture exited");
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(Error("publisher timeout")), 5000).unref(),
      ),
    ]);
    const rawPath = join(dirname(item.ticketPath), "channel.json");
    const raw = JSON.parse(readFileSync(rawPath, "utf8"));
    assert.equal(raw.viewerPid, child.pid);
    assert.equal(raw.viewerSafety.sdk.noSession, true);
    assert.equal(raw.viewerSafety.sdk.activeToolsCount, 0);
    assert.equal(raw.viewerSafety.sdk.inertModelSelected, true);
    assert.ok(validAttachmentViewerSafety(raw.viewerSafety));
    assert.equal("viewerSafety" in readAttachment(item), false); // Fixed event read contract unchanged.
    assert.equal(
      publishAttachmentViewerSafety(ticket, { ...raw.viewerSafety, revision: 100 }),
      false,
    );
    assert.doesNotMatch(JSON.stringify(raw.viewerSafety), /MUST NOT PUBLISH|nonce|prompt|toolName/);
    writeSessionStatus(f.state.sessionsDir, "child", { ...f.fields, attemptId: "replacement" });
    const before = readFileSync(rawPath, "utf8");
    const exit = once(child, "exit");
    child.stdin.write("stale\n");
    await exit;
    assert.equal(child.exitCode, 0, err);
    assert.equal(readFileSync(rawPath, "utf8"), before);
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
    f.cleanup();
  }
});
