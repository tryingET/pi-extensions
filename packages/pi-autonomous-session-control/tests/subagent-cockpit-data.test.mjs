import assert from "node:assert/strict";
import fs, {
  chmodSync,
  lstatSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import test from "node:test";
import {
  appendCockpitEvent,
  closeCockpitChannel,
  createCockpitChannel,
  mutateChannel,
  readChannel,
} from "../extensions/self/subagent-cockpit-channel.ts";
import { readSubagentCockpit } from "../extensions/self/subagent-cockpit-data.ts";
import { writeCockpitFence } from "../extensions/self/subagent-cockpit-fence.ts";
import {
  inertText,
  MAX_CHANNEL_BYTES,
  readBoundedFile,
} from "../extensions/self/subagent-cockpit-io.ts";
import {
  GUIDANCE_CUSTOM_TYPE,
  readActiveTrace,
} from "../extensions/self/subagent-cockpit-trace.ts";
import { writeSessionStatus } from "../extensions/self/subagent-session.ts";
import { fixture } from "./subagent-cockpit-harness.mjs";

const entry = (id, parentId, text, role = "assistant") => ({
  type: "message",
  id,
  parentId,
  timestamp: new Date().toISOString(),
  message: { role, content: [{ type: "text", text }] },
});

function trace(f, entries) {
  writeFileSync(f.binding.sessionFile, `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`, {
    mode: 0o600,
  });
}

test("private exact-attempt queue and identity filters, no nonce in public snapshot", () => {
  const f = fixture();
  try {
    assert.equal(f.send().ok, false);
    assert.equal(f.snapshot().steeringSupported, false);
    f.ready();
    assert.equal(f.snapshot().steeringSupported, true);
    assert.equal(f.snapshot({}).steeringSupported, false);
    for (const change of [
      { attemptId: "old" },
      { dispatchId: "old" },
      { parentSessionKey: "foreign" },
      { parentRepoRoot: "/foreign" },
    ]) {
      assert.equal(f.send(change).status, "rejected");
    }
    assert.equal(
      f.snapshot({ currentSessionKey: "foreign", currentRepoRoot: f.root }).status,
      "stale",
    );
    assert.deepEqual(f.snapshot({ currentRepoRoot: "/foreign" }).events, []);
    const literal =
      "/reload\n/skill:whatever @path <directive>do not expand</directive>\u2028suffix";
    const queued = f.send({ message: literal });
    assert.equal(queued.status, "queued");
    assert.equal(f.snapshot().receipts[0].message, literal);
    assert.equal(f.snapshot().receipts[0].status, "queued");
    assert.equal(JSON.stringify(f.snapshot()).includes(readChannel(f.dir).nonce), false);
    assert.equal(lstatSync(f.dir).mode & 0o077, 0);
    assert.equal(lstatSync(join(f.dir, "channel.json")).mode & 0o077, 0);
    for (const message of ["", "  ", "x".repeat(4097), "\x1b[31mbad", "bad\u202e", "bad\0"])
      assert.equal(f.send({ message }).ok, false);
    assert.throws(() => createCockpitChannel(f.binding));
  } finally {
    f.cleanup();
  }
});

test("legacy and terminal attempts cannot steer; persisted fallback follows only active ancestry", () => {
  const f = fixture();
  try {
    trace(f, [
      entry("root", null, "question", "user"),
      entry("old", "root", "discarded SECRET"),
      entry("active", "root", "visible\x1b[31m safe\x1b[0m"),
    ]);
    // Remove only the channel metadata: simulates a legacy child without native support.
    unlinkSync(join(f.dir, "channel.json"));
    const snapshot = f.snapshot();
    assert.equal(snapshot.steeringSupported, false);
    assert.deepEqual(
      snapshot.events.map((e) => e.text),
      ["question", "visible safe"],
    );
    assert.equal(f.send().ok, false);
    assert.equal(readSubagentCockpit(f.binding.sessionsDir, "../child", {}).status, "unavailable");
    trace(f, [entry("broken", "missing", "not active")]);
    assert.equal(readActiveTrace(f.binding.sessionsDir, "child"), undefined);
  } finally {
    f.cleanup();
  }
});

test("bounded queue, expiration and terminal closure preserve delivered receipts", () => {
  const f = fixture();
  try {
    f.ready();
    for (let i = 0; i < 8; i++) assert.equal(f.send().ok, true);
    assert.equal(f.send().ok, false);
    const first = readChannel(f.dir).requests[0];
    mutateChannel(f.dir, (c) => {
      c.requests[0].staged = true;
      for (const r of c.requests.slice(1)) r.expiresAt = 0;
    });
    trace(f, [
      {
        type: "custom_message",
        id: "guidance",
        parentId: null,
        timestamp: new Date().toISOString(),
        customType: GUIDANCE_CUSTOM_TYPE,
        content: first.message,
        details: {
          requestId: first.requestId,
          dispatchId: f.binding.dispatchId,
          attemptId: f.binding.attemptId,
        },
      },
    ]);
    assert.equal(f.snapshot().receipts[0].status, "delivered");
    assert.equal(f.snapshot().receipts[1].status, "expired");
    for (let i = 8; i < 32; i++) {
      mutateChannel(f.dir, (c) => {
        for (const r of c.requests) if (!r.staged) r.expiresAt = 0;
      });
      assert.equal(f.send().ok, true);
    }
    assert.equal(f.send().ok, false);
    closeCockpitChannel(f.dir, "parent finalized");
    assert.equal(readChannel(f.dir).phase, "closed");
    assert.equal(readChannel(f.dir).requests[0].status, "delivered");
    assert.equal(f.send().ok, false);
    writeSessionStatus(f.binding.sessionsDir, "child", { ...f.fields, status: "done" });
    assert.equal(f.snapshot().steeringSupported, false);
    assert.equal(f.send().ok, false);
  } finally {
    f.cleanup();
  }
});

test("stale child/parent process identity and current attempt replacement fail closed", () => {
  const f = fixture();
  try {
    f.ready();
    f.send();
    mutateChannel(f.dir, (c) => {
      c.childTicks++;
    });
    assert.equal(f.send().ok, false);
    assert.equal(f.snapshot().status, "stale");
    assert.equal(f.snapshot().receipts[0].status, "expired");
    f.ready();
    mutateChannel(f.dir, (c) => {
      c.parentTicks++;
    });
    assert.equal(f.send().ok, false);
    writeSessionStatus(f.binding.sessionsDir, "child", { ...f.fields, attemptId: "attempt-2" });
    assert.deepEqual(f.snapshot().receipts, []);
    assert.equal(f.send().ok, false);
  } finally {
    f.cleanup();
  }
});

test("symlink, unsafe permissions, oversized files and abandoned locks are rejected", () => {
  const f = fixture();
  try {
    f.ready();
    const channel = join(f.dir, "channel.json"),
      moved = join(f.dir, "moved.json");
    renameSync(channel, moved);
    symlinkSync(moved, channel);
    assert.equal(f.send().ok, false);
    assert.throws(() => readChannel(f.dir));
    unlinkSync(channel);
    renameSync(moved, channel);
    chmodSync(channel, 0o644);
    assert.equal(f.send().ok, false);
    chmodSync(channel, 0o600);
    writeFileSync(join(f.dir, "lock"), "", { mode: 0o600 });
    assert.equal(f.send().ok, false);
    assert.equal(lstatSync(join(f.dir, "lock")).isFile(), true);
    unlinkSync(join(f.dir, "lock"));
    const huge = join(f.root, "huge");
    writeFileSync(huge, "x".repeat(3000));
    assert.throws(() => readBoundedFile(huge, 100));
    renameSync(f.dir, `${f.dir}-real`);
    symlinkSync(`${f.dir}-real`, f.dir);
    assert.equal(f.send().ok, false);
    assert.throws(() => readChannel(f.dir));
  } finally {
    f.cleanup();
  }
});

test("UTF8 aggregate budget evicts telemetry without losing any control receipts", () => {
  const f = fixture();
  try {
    f.ready();
    for (let i = 0; i < 32; i++) {
      assert.equal(f.send({ message: i % 2 ? "界".repeat(1365) : "😀".repeat(1024) }).ok, true);
      mutateChannel(f.dir, (c) => {
        c.requests.at(-1).status = i === 0 ? "delivered" : "expired";
      });
    }
    const receipts = readChannel(f.dir).requests;
    mutateChannel(f.dir, (c) => {
      for (let i = 0; i < 80; i++)
        appendCockpitEvent(c, {
          id: `event-${i}`,
          kind: "tool",
          toolName: "bash",
          text: i < 70 ? "界".repeat(2048) : "😀".repeat(1024),
          detail: i < 70 ? "界".repeat(4096) : "😀".repeat(2048),
        });
    });
    const raw = readFileSync(join(f.dir, "channel.json"));
    assert.ok(raw.length <= MAX_CHANNEL_BYTES);
    const current = readChannel(f.dir);
    assert.deepEqual(current.requests, receipts);
    assert.ok(current.events.length > 0 && current.events.length < 80);
    assert.equal(current.events.at(-1).id, "event-79");
    assert.equal(f.snapshot().truncated, true);
    mutateChannel(f.dir, (c) => {
      c.phase = "closing";
    });
    assert.equal(readChannel(f.dir).phase, "closing");
  } finally {
    f.cleanup();
  }
});

test("native polling does no trace IO without pending proof, caches pending proofs, and invalidates for late commit", () => {
  const f = fixture(),
    original = fs.openSync;
  try {
    f.ready();
    const request = f.send();
    trace(f, [entry("root", null, "objective", "user")]);
    let opens = 0;
    fs.openSync = (path, ...args) => {
      if (
        path === f.binding.sessionFile &&
        typeof args[0] === "number" &&
        (args[0] & 3) === fs.constants.O_RDONLY
      )
        opens++;
      return original(path, ...args);
    };
    syncBuiltinESMExports();
    for (let i = 0; i < 5; i++) f.snapshot();
    assert.equal(opens, 0);
    mutateChannel(f.dir, (c) => {
      c.requests[0].staged = true;
    });
    for (let i = 0; i < 5; i++) assert.equal(f.snapshot().receipts[0].status, "queued");
    assert.equal(opens, 1);
    trace(f, [
      entry("root", null, "objective", "user"),
      {
        type: "custom_message",
        id: "guide",
        parentId: "root",
        timestamp: new Date().toISOString(),
        customType: GUIDANCE_CUSTOM_TYPE,
        content: "Literal guidance",
        details: {
          requestId: request.requestId,
          dispatchId: f.binding.dispatchId,
          attemptId: f.binding.attemptId,
        },
      },
    ]);
    assert.equal(f.snapshot().receipts[0].status, "delivered");
    assert.equal(opens, 2);
  } finally {
    fs.openSync = original;
    syncBuiltinESMExports();
    f.cleanup();
  }
});

test("fence interposed during enqueue publication returns explicit rejection with retained request identity", () => {
  const f = fixture(),
    original = fs.renameSync;
  try {
    f.ready();
    const nonce = readChannel(f.dir).nonce;
    let fenced = false;
    fs.renameSync = (source, target) => {
      if (!fenced && target === join(f.dir, "channel.json")) {
        fenced = true;
        writeCockpitFence(f.dir, nonce, "Final boundary lock timeout: guidance rejected");
      }
      return original(source, target);
    };
    syncBuiltinESMExports();
    const result = f.send();
    assert.equal(result.status, "rejected");
    assert.ok(result.requestId);
    assert.equal(f.snapshot().receipts[0].requestId, result.requestId);
    assert.equal(f.snapshot().receipts[0].status, "rejected");
    assert.equal(f.send().ok, false);
  } finally {
    fs.renameSync = original;
    syncBuiltinESMExports();
    f.cleanup();
  }
});

test("private nonce is redacted even when tool content or a caller quotes it", () => {
  const f = fixture();
  try {
    f.ready();
    const nonce = readChannel(f.dir).nonce;
    assert.equal(f.send({ message: `literal ${nonce}` }).ok, true);
    mutateChannel(f.dir, (c) =>
      appendCockpitEvent(c, { id: "tool", kind: "tool", text: nonce, detail: `secret ${nonce}` }),
    );
    assert.equal(JSON.stringify(f.snapshot()).includes(nonce), false);
    assert.equal(readChannel(f.dir).requests[0].message, `literal ${nonce}`);
  } finally {
    f.cleanup();
  }
});

test("transient event ring is bounded, sanitized and independent of generic observation", () => {
  const f = fixture();
  try {
    f.ready();
    mutateChannel(f.dir, (c) => {
      for (let i = 0; i < 100; i++)
        appendCockpitEvent(c, {
          id: `event-${i}`,
          kind: "tool",
          text: `\x1b]8;;https://unsafe\x07click\x1b]8;;\x07${"x".repeat(3000)}`,
          detail: "y".repeat(5000),
          toolName: "bash",
        });
    });
    const snapshot = f.snapshot();
    assert.equal(snapshot.events.length, 80);
    assert.equal(snapshot.truncated, true);
    assert.equal(snapshot.latestTool, "bash");
    assert.equal(snapshot.events[0].text.length, 2048);
    assert.equal(snapshot.events[0].detail.length, 4096);
    assert.equal(snapshot.events[0].text.includes("\x1b"), false);
    assert.equal(inertText("\u009bbad\u202e"), "bad");
    assert.ok(readFileSync(join(f.dir, "channel.json")).length < 1024 * 1024);
  } finally {
    f.cleanup();
  }
});
