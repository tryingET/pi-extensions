import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  lstatSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  claimAttachment,
  prepareAttachment,
  readAttachment,
  readAttachmentTicket,
  settleAttachment,
  viewerArgv,
} from "../extensions/self/subagent-attachment-registry.ts";
import { writeSessionStatus } from "../extensions/self/subagent-session.ts";
import { fixture } from "./subagent-cockpit-harness.mjs";

const viewer = fileURLToPath(
  new URL("../extensions/self/subagent-attachment-viewer.ts", import.meta.url),
);
const prepare = (f) => prepareAttachment(f.binding, viewer);

test("private exact-attempt ticket, atomic cross-reload claim, indeterminate launch never retries", async () => {
  const f = fixture();
  try {
    const item = prepare(f);
    const t = readAttachmentTicket(item.ticketPath);
    assert.equal(lstatSync(dirname(item.ticketPath)).mode & 0o077, 0);
    assert.equal(lstatSync(item.ticketPath).mode & 0o077, 0);
    assert.equal(lstatSync(join(dirname(dirname(item.ticketPath)))).mode & 0o077, 0);
    assert.deepEqual(t.argv, viewerArgv(viewer, item.ticketPath));
    assert.ok(t.argv.includes("--no-session"));
    assert.ok(!t.argv.includes("--session"));
    assert.ok(!JSON.stringify(item).includes(t.nonce));
    assert.equal(claimAttachment(item).action, "launch");
    const reloaded = await import(
      `../extensions/self/subagent-attachment-registry.ts?reload=${Date.now()}`
    );
    assert.equal(reloaded.claimAttachment(item).action, "blocked");
    settleAttachment(item, { ok: false, detail: "timeout without no-effects proof" });
    assert.equal(readAttachment(item).status, "effect_indeterminate");
    const repeated = prepare(f);
    assert.equal(repeated.ticketPath, item.ticketPath);
    assert.equal(claimAttachment(repeated).action, "blocked");
    settleAttachment(item, { ok: false, effectDisposition: "confirmed_no_effects" });
    assert.equal(readAttachment(item).status, "effect_indeterminate");
    assert.equal(f.snapshot().attemptId, f.binding.attemptId);
  } finally {
    f.cleanup();
  }
});

test("only explicit proven no-effects request creates next generation; late old callbacks cannot affect it", () => {
  const f = fixture();
  try {
    const first = prepare(f);
    assert.equal(claimAttachment(first).action, "launch");
    settleAttachment(first, { ok: false, effectDisposition: "confirmed_no_effects" });
    const next = prepare(f);
    assert.notEqual(first.ticketPath, next.ticketPath);
    assert.equal(claimAttachment(first).action, "blocked");
    assert.throws(() => settleAttachment(first, { ok: true, effectDisposition: "settled" }));
    assert.equal(claimAttachment(next).action, "launch");
  } finally {
    f.cleanup();
  }
});

test("failed-success without explicit disposition is indeterminate; settled transport is not ready", () => {
  for (const result of [
    { ok: true },
    { ok: false, effectDisposition: "settled" },
    { ok: true, effectDisposition: "settled" },
  ]) {
    const f = fixture();
    try {
      const item = prepare(f);
      claimAttachment(item);
      settleAttachment(item, result);
      assert.equal(
        readAttachment(item).status,
        result.ok && result.effectDisposition === "settled"
          ? "awaiting_ready"
          : "effect_indeterminate",
      );
      assert.equal(claimAttachment(item).action, "blocked");
      assert.equal(prepare(f).ticketPath, item.ticketPath);
    } finally {
      f.cleanup();
    }
  }
});

test("foreign owner, unsafe tickets, held lock, changed attempt/PID cannot claim", () => {
  const f = fixture();
  try {
    assert.throws(() => prepareAttachment(f.binding, "/foreign/subagent-attachment-viewer.ts"));
    const item = prepare(f);
    const lock = join(dirname(item.ticketPath), "lock");
    writeFileSync(lock, "", { mode: 0o600 });
    assert.equal(claimAttachment(item).action, "blocked");
    assert.throws(() => prepare(f));
    // Only remove this test's own inactive fixture lock.
    unlinkSync(lock);
    chmodSync(item.ticketPath, 0o644);
    assert.equal(claimAttachment(item).action, "blocked");
    chmodSync(item.ticketPath, 0o600);
    writeSessionStatus(f.state.sessionsDir, "child", { ...f.fields, attemptId: "new-attempt" });
    assert.equal(claimAttachment(item).action, "blocked");
    writeSessionStatus(f.state.sessionsDir, "child", { ...f.fields, pid: process.pid + 1 });
    assert.equal(claimAttachment(item).action, "blocked");
    const alias = join(
      dirname(item.ticketPath),
      "ticket-00000000-0000-0000-0000-000000000000.json",
    );
    symlinkSync(item.ticketPath, alias);
    assert.throws(() => readAttachmentTicket(alias));
  } finally {
    f.cleanup();
  }
});

test("real isolated registry ACK binds viewer PID-start/argv, reuse survives reload, detach needs proven death", async () => {
  const f = fixture();
  let child;
  try {
    const item = prepare(f);
    claimAttachment(item);
    const modulePath = fileURLToPath(
      new URL("../extensions/self/subagent-attachment-registry.ts", import.meta.url),
    );
    const script = join(f.root, "registry-ack-fixture.mjs");
    writeFileSync(
      script,
      `import assert from 'node:assert/strict';
      import { acknowledgeAttachment, detachAttachment, prepareAttachment } from ${JSON.stringify(modulePath)};
      const ticket = acknowledgeAttachment(process.argv.at(-1));
      assert.throws(() => acknowledgeAttachment(process.argv.at(-1)), /already acknowledged/);
      assert.throws(() => prepareAttachment(ticket, ticket.viewerExtensionPath), /Different original controller owner/);
      console.log('ready');
      process.on('SIGUSR1', () => { detachAttachment(ticket); console.log('detached-but-live'); });
      process.on('SIGTERM', () => { detachAttachment(ticket); process.exit(0); });
      setInterval(() => {}, 1000);`,
    );
    child = spawn(process.execPath, [script, ...viewerArgv(viewer, item.ticketPath)], {
      cwd: f.root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d;
    });
    await Promise.race([
      once(child.stdout, "data"),
      once(child, "exit").then(() => {
        throw new Error(err || "ACK fixture died");
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("ACK fixture timeout")), 5000).unref(),
      ),
    ]);
    const read = readAttachment(item);
    assert.equal(read.status, "ready", err);
    assert.equal(read.viewerPid, child.pid);
    assert.ok(read.viewerStartedAt > 0);
    assert.equal(claimAttachment(item).action, "reuse");
    assert.equal(prepare(f).ticketPath, item.ticketPath);
    settleAttachment(item, { ok: false, effectDisposition: "confirmed_no_effects" });
    assert.equal(readAttachment(item).status, "ready");
    const before = readFileSync(join(f.state.sessionsDir, "child.status.json"), "utf8");
    child.kill("SIGUSR1");
    await once(child.stdout, "data");
    assert.equal(readAttachment(item).status, "closed");
    assert.equal(claimAttachment(item).action, "blocked");
    assert.equal(prepare(f).ticketPath, item.ticketPath);
    child.kill("SIGTERM");
    await once(child, "exit");
    assert.equal(readAttachment(item).status, "viewer_dead");
    const reopened = prepare(f);
    assert.notEqual(reopened.ticketPath, item.ticketPath);
    assert.equal(claimAttachment(reopened).action, "launch");
    assert.equal(readFileSync(join(f.state.sessionsDir, "child.status.json"), "utf8"), before);
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
    f.cleanup();
  }
});
