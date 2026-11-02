// summary: budget mutations must not append after branch drift in the guard/commit await gap.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import extension from "../extensions/session-closeout.ts";
import { CLOSEOUT_ENTRY } from "../src/sessionCloseout.ts";
import { testGit } from "./session-closeout-git.mjs";

async function harness(t) {
  const repo = await mkdtemp(join(tmpdir(), "closeout-budget-race-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  testGit(["init", "-q", repo]);
  testGit([
    "-C",
    repo,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "--allow-empty",
    "-qm",
    "initial",
  ]);
  const entries = [
    { type: "message", id: "user", message: { role: "user", content: "Close this session" } },
  ];
  const events = new Map();
  const tools = new Map();
  const commands = new Map();
  const appends = [];
  const notices = [];
  let drifted = false;
  const ctx = {
    cwd: repo,
    mode: "tui",
    hasUI: true,
    isIdle: () => true,
    hasPendingMessages: () => false,
    sessionManager: {
      getSessionId: () => "caller",
      getSessionFile: () => join(repo, "caller.jsonl"),
      getHeader: () => ({ id: "caller" }),
      getLeafId: () => entries.at(-1)?.id ?? null,
      getBranch: () => entries,
      getEntries: () => entries,
    },
    ui: { notify: (message) => notices.push(message) },
  };
  extension({
    registerTool: (tool) => tools.set(tool.name, tool),
    registerCommand: (name, command) => commands.set(name, command),
    on: (name, handler) => events.set(name, handler),
    appendEntry: (customType, data) => {
      appends.push({ customType, drifted });
      entries.push({
        type: "custom",
        customType,
        id: `entry-${entries.length}`,
        data: structuredClone(data),
      });
    },
    sendMessage: () => {},
  });
  const call = (action, extra = {}) =>
    tools.get("session_closeout").execute("own", { action, ...extra }, undefined, undefined, ctx);
  await call("open");
  appends.length = 0;
  let branchReads = 0;
  ctx.sessionManager.getBranch = () => {
    // Current path: initial journal, activity frontier, guard activity, guard journal.
    // Queue drift at that last synchronous read. The vulnerable async helper returns,
    // drift runs, then the caller resumes from `await guardMutation()` and saves.
    if (++branchReads === 4) {
      queueMicrotask(() => {
        drifted = true;
        ctx.sessionManager.getBranch = () => entries.slice(0, 1);
        events.get("session_tree")({});
      });
    }
    return entries;
  };
  return {
    ctx,
    commands,
    call,
    appends,
    notices,
    drifted: () => drifted,
    branchReads: () => branchReads,
  };
}

for (const entrypoint of ["tool", "shortcut"]) {
  test(`budget ${entrypoint}: no journal append after queued branch/activity drift`, async (t) => {
    const h = await harness(t);
    let refusal;
    try {
      if (entrypoint === "tool") {
        await h.call("budget", {
          profile: "large-assets",
          rationale: "Reproduce guard/commit race",
        });
      } else {
        await h.commands.get("session-closeout").handler("budget large-assets", h.ctx);
      }
    } catch (error) {
      refusal = error;
    }
    assert.equal(h.drifted(), true, "probe must actually deliver the queued drift");
    assert.ok(h.branchReads() >= 4, "probe must reach the final journal check");
    // An atomic implementation may save BEFORE drift or refuse without saving.
    // Only persistence AFTER drift is forbidden; do not require refusal after a valid commit.
    assert.equal(
      h.appends.filter((entry) => entry.customType === CLOSEOUT_ENTRY && entry.drifted).length,
      0,
      `${entrypoint} appended closeout journal after branch/activity drift`,
    );
    if (refusal) assert.match(refusal.message, /changed|another branch/);
    for (const notice of h.notices) assert.match(notice, /changed|another branch/);
  });
}
