import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  claimAttachment,
  MAX_ATTACHMENT_GENERATIONS,
  prepareAttachment,
  readAttachment,
  settleAttachment,
  viewerArgv,
} from "../extensions/self/subagent-attachment-registry.ts";
import { fixture } from "./subagent-cockpit-harness.mjs";

const viewer = fileURLToPath(
  new URL("../extensions/self/subagent-attachment-viewer.ts", import.meta.url),
);
const registry = fileURLToPath(
  new URL("../extensions/self/subagent-attachment-registry.ts", import.meta.url),
);
async function output(child, expected) {
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d;
  });
  const data = await Promise.race([
    once(child.stdout, "data").then(([d]) => String(d)),
    once(child, "exit").then(() => {
      throw new Error(stderr || "Fixture exited before output");
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Fixture output timeout")), 5000).unref(),
    ),
  ]);
  assert.match(data, expected, stderr);
}

test("ACK-vs-controller lock registers PID first, waits without ready/shutdown/transport retry, then ACKs exact generation", async () => {
  const f = fixture();
  let child;
  try {
    const item = prepareAttachment(f.binding, viewer);
    assert.equal(claimAttachment(item).action, "launch");
    settleAttachment(item, { ok: true, effectDisposition: "settled" });
    const lock = join(dirname(item.ticketPath), "lock");
    writeFileSync(lock, "fixture holds controller lock", { flag: "wx", mode: 0o600 });
    const before = readFileSync(join(f.state.sessionsDir, "child.status.json"), "utf8");
    const script = join(f.root, "ack-contention-fixture.mjs");
    writeFileSync(
      script,
      `import { once } from 'node:events';
      import { acknowledgeAttachmentWithRetry } from ${JSON.stringify(registry)};
      await acknowledgeAttachmentWithRetry(process.argv.at(-1), { intervalMs: 100,
        wait: async () => { console.log('blocked-awaiting-release'); await once(process.stdin, 'data'); } });
      console.log('ready');
      setInterval(() => {}, 1000);`,
    );
    child = spawn(process.execPath, [script, ...viewerArgv(viewer, item.ticketPath)], {
      cwd: f.root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    await output(child, /blocked-awaiting-release/);
    const pending = readAttachment(item);
    assert.equal(pending.status, "bootstrapping");
    assert.equal(pending.viewerPid, child.pid);
    assert.ok(pending.viewerStartedAt > 0);
    assert.equal(claimAttachment(item).action, "blocked");
    assert.match(readFileSync(lock, "utf8"), /fixture holds/);
    const ready = output(child, /ready/);
    unlinkSync(lock); // Only this test's own held lock, deliberately released by its owner.
    child.stdin.write("release\n");
    await ready;
    assert.equal(readAttachment(item).status, "ready");
    assert.equal(claimAttachment(item).action, "reuse");
    assert.equal(prepareAttachment(f.binding, viewer).ticketPath, item.ticketPath);
    assert.equal(readFileSync(join(f.state.sessionsDir, "child.status.json"), "utf8"), before);
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    f.cleanup();
  }
});

test("bounded ACK exhaustion retains bootstrap PID for death proof; no stale takeover, explicit reopen only", async () => {
  const f = fixture();
  let child;
  try {
    const item = prepareAttachment(f.binding, viewer);
    claimAttachment(item);
    const lock = join(dirname(item.ticketPath), "lock");
    writeFileSync(lock, "owned fixture lock", { flag: "wx", mode: 0o600 });
    const script = join(f.root, "ack-timeout-fixture.mjs");
    writeFileSync(
      script,
      `import assert from 'node:assert/strict';
      import { acknowledgeAttachmentWithRetry } from ${JSON.stringify(registry)};
      let waits = 0;
      await assert.rejects(acknowledgeAttachmentWithRetry(process.argv.at(-1), {
        timeoutMs: 3000, intervalMs: 100, wait: async () => { waits++; }
      }), /ACK lock timeout/);
      assert.ok(waits <= 30);
      console.log('timeout-recorded-pid');`,
    );
    child = spawn(process.execPath, [script, ...viewerArgv(viewer, item.ticketPath)], {
      cwd: f.root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await output(child, /timeout-recorded-pid/);
    if (child.exitCode === null) await once(child, "exit");
    assert.equal(readAttachment(item).status, "viewer_dead");
    assert.match(readFileSync(lock, "utf8"), /owned fixture lock/);
    assert.throws(() => prepareAttachment(f.binding, viewer));
    unlinkSync(lock);
    assert.equal(readAttachment(item).status, "viewer_dead"); // Reading never reopens.
    const reopened = prepareAttachment(f.binding, viewer);
    assert.notEqual(reopened.ticketPath, item.ticketPath);
    assert.equal(claimAttachment(reopened).action, "launch");
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    f.cleanup();
  }
});

test("per-attempt reopen ticket count capped, including orphan tickets; retained state never deleted", () => {
  const f = fixture();
  try {
    let item = prepareAttachment(f.binding, viewer);
    const orphan = join(dirname(item.ticketPath), "ticket-orphan-uncertain.json");
    writeFileSync(orphan, "Uncertain retained generation; do not delete", {
      flag: "wx",
      mode: 0o600,
    });
    for (let i = 0; i < MAX_ATTACHMENT_GENERATIONS - 1; i++) {
      item = prepareAttachment(f.binding, viewer);
      assert.equal(claimAttachment(item).action, "launch");
      settleAttachment(item, { ok: false, effectDisposition: "confirmed_no_effects" });
    }
    const dir = dirname(item.ticketPath);
    const before = readdirSync(dir).sort();
    assert.equal(
      before.filter((name) => name.startsWith("ticket-")).length,
      MAX_ATTACHMENT_GENERATIONS,
    );
    assert.throws(() => prepareAttachment(f.binding, viewer), /generation limit/);
    assert.deepEqual(readdirSync(dir).sort(), before);
    assert.match(readFileSync(orphan, "utf8"), /Uncertain retained generation/);
    assert.equal(readAttachment(item).status, "confirmed_no_effects");
  } finally {
    f.cleanup();
  }
});
