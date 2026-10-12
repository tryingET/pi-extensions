import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import {
  cancelSubagentDispatch,
  readSubagentCancelRequest,
} from "../extensions/self/subagent-control.ts";
import { writeSessionStatus } from "../extensions/self/subagent-session.ts";
import { fixture } from "./subagent-cockpit-harness.mjs";

function cancellation(f, overrides = {}) {
  return cancelSubagentDispatch({
    state: f.state,
    dispatchId: f.binding.dispatchId,
    requestedBy: "operator",
    parentRepoRoot: f.root,
    expectedAttemptId: f.binding.attemptId,
    expectedParentSessionKey: f.binding.parentSessionKey,
    expectedSessionName: f.binding.sessionName,
    ...overrides,
  });
}
function captureSignals(action) {
  const original = process.kill,
    signals = [];
  process.kill = (pid, signal) => {
    if (signal === 0) return original(pid, signal);
    signals.push({ pid, signal });
    return true;
  };
  try {
    action(signals);
  } finally {
    process.kill = original;
  }
}

for (const foreign of [
  { expectedAttemptId: "old" },
  { expectedParentSessionKey: "foreign" },
  { expectedSessionName: "another" },
  { parentRepoRoot: "/foreign" },
]) {
  test(`cancellation rejects foreign expected identity ${JSON.stringify(foreign)}`, () => {
    const f = fixture();
    try {
      writeSessionStatus(f.binding.sessionsDir, "child", { ...f.fields, cancelSupported: true });
      captureSignals((signals) => {
        assert.equal(cancellation(f, foreign).ok, false);
        assert.deepEqual(signals, []);
        assert.equal(
          readSubagentCancelRequest(f.binding.sessionsDir, "child", f.binding.attemptId),
          undefined,
        );
      });
    } finally {
      f.cleanup();
    }
  });
}

test("matching expected identity signals once; optional-free legacy callers remain compatible", () => {
  const f = fixture();
  try {
    writeSessionStatus(f.binding.sessionsDir, "child", { ...f.fields, cancelSupported: true });
    captureSignals((signals) => {
      assert.equal(cancellation(f).status, "cancel_requested");
      assert.equal(
        cancellation(f, {
          expectedAttemptId: undefined,
          expectedParentSessionKey: undefined,
          expectedSessionName: undefined,
        }).status,
        "cancel_requested",
      );
      assert.deepEqual(signals, [
        { pid: process.pid, signal: "SIGTERM" },
        { pid: process.pid, signal: "SIGTERM" },
      ]);
    });
  } finally {
    f.cleanup();
  }
});

for (const replacement of [
  { attemptId: "next" },
  { parentSessionKey: "foreign" },
  { parentRepoRoot: "/foreign" },
  { cancelSupported: false },
  { pid: 999999, pidStartedAt: 1 },
  { attemptId: "next", status: "done" },
]) {
  test(`replacement after cancellation lookup cannot be signalled: ${JSON.stringify(replacement)}`, () => {
    const f = fixture(),
      original = fs.openSync;
    try {
      writeSessionStatus(f.binding.sessionsDir, "child", { ...f.fields, cancelSupported: true });
      let replaced = false;
      fs.openSync = (path, ...args) => {
        if (!replaced && typeof path === "string" && path.endsWith(".cancel.json")) {
          replaced = true;
          writeSessionStatus(f.binding.sessionsDir, "child", {
            ...f.fields,
            cancelSupported: true,
            ...replacement,
          });
        }
        return original(path, ...args);
      };
      syncBuiltinESMExports();
      captureSignals((signals) => {
        const result = cancellation(f);
        assert.equal(replaced, true);
        assert.equal(result.ok, false);
        assert.equal(result.status, "not_live");
        assert.deepEqual(signals, []);
        assert.equal(
          readSubagentCancelRequest(f.binding.sessionsDir, "child", f.binding.attemptId),
          undefined,
        );
      });
    } finally {
      fs.openSync = original;
      syncBuiltinESMExports();
      f.cleanup();
    }
  });
}
