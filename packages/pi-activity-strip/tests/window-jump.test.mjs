import assert from "node:assert/strict";
import test from "node:test";
import { resolveWindowDirectory } from "../src/common/workspace-view.mjs";
import { createWindowJump } from "../src/native/window-jump.mjs";

const raw = { sessionId: "019fa4d0-7142-7fb4-8d30-f98e951f0513", publisherId: "p" };
const owner = {
  id: 44,
  workspace_id: 7,
  app_id: "com.mitchellh.ghostty",
  title: "π - topic · 019fa4d071427fb48d30f98e951f0513",
};
const options = { resolveHostPid: () => null, existsSync: () => false };

test("hover numeric jump rechecks actual production admission after read; missing/replaced/ambiguous ids cannot jump", async () => {
  for (const windows of [
    [owner],
    [],
    [{ ...owner, title: "ordinary shell" }],
    [owner, { ...owner, id: 45, workspace_id: 8 }],
  ]) {
    const focused = [];
    const jump = createWindowJump({
      isNiriSession: () => true,
      readWindows: async () => windows,
      isAdmittedWindow: (id, current) =>
        resolveWindowDirectory(current, [{ id: 7 }, { id: 8 }], [raw], options).entries.some(
          (entry) => entry.windowId === id,
        ),
      focusWindow: async (id) => {
        focused.push(id);
      },
      reconcile: () => {},
    });
    const ok = windows.length === 1 && windows[0].title === owner.title;
    assert.equal((await jump(44)).ok, ok);
    assert.deepEqual(focused, ok ? [44] : []);
  }
});

test("hover cannot jump unlisted; only explicit permission admits an existing unlisted number", async () => {
  const focused = [];
  const jump = createWindowJump({
    isNiriSession: () => true,
    readWindows: async () => [owner],
    isAdmittedWindow: () => false,
    focusWindow: async (id) => {
      focused.push(id);
    },
    reconcile: () => {},
  });
  assert.equal((await jump(44)).ok, false);
  assert.equal((await jump(44, true)).ok, true);
  assert.equal((await jump(99, true)).ok, false);
  assert.deepEqual(focused, [44]);
});

test("directory revocation while window read is pending rejects rather than queuing a stale hover focus", async () => {
  let finish;
  let admitted = true;
  const jump = createWindowJump({
    isNiriSession: () => true,
    readWindows: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    isAdmittedWindow: () => admitted,
    focusWindow: async () => assert.fail("revoked target"),
    reconcile: () => {},
  });
  const pending = jump(44);
  admitted = false;
  finish([owner]);
  assert.equal((await pending).ok, false);
  admitted = true;
  const lostContext = jump(44, true, () => false);
  finish([owner]);
  assert.equal(
    (await lostContext).ok,
    false,
    "even explicit permission cannot outlive a revoked source context",
  );
});
