// summary: exercises gate wiring, real Git fingerprints, operator separation and reload refusal.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import extension from "../extensions/session-closeout.ts";
import { CLOSEOUT_ENTRY } from "../src/sessionCloseout.ts";
import { gitSnapshot } from "../src/sessionCloseoutReadback.ts";
import { testGit } from "./session-closeout-git.mjs";

async function harness(t) {
  const repo = await mkdtemp(join(tmpdir(), "session-closeout-test-"));
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
  let events;
  let tools;
  let commands;
  const approvals = [];
  const sent = [];
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
    ui: {
      editor: async (title, body) => {
        approvals.push({ title, body });
        return body;
      },
      input: async (title) => title.replace("Type exactly: ", ""),
      notify: () => {},
    },
  };
  function load() {
    events = new Map();
    tools = new Map();
    commands = new Map();
    extension({
      registerTool: (tool) => tools.set(tool.name, tool),
      registerCommand: (name, command) => commands.set(name, command),
      on: (name, handler) => events.set(name, handler),
      appendEntry: (customType, data) =>
        entries.push({
          type: "custom",
          customType,
          id: `entry-${entries.length}`,
          data: structuredClone(data),
        }),
      setActiveTools: () => {},
      getActiveTools: () => [],
      getCommands: () => [],
      sendMessage: (message) => sent.push(message),
      sendUserMessage: (message) => sent.push(message),
    });
  }
  load();
  const call = async (action, extra = {}) =>
    tools.get("session_closeout").execute("own", { action, ...extra }, undefined, undefined, ctx);
  return {
    repo,
    entries,
    ctx,
    approvals,
    sent,
    load,
    call,
    events: () => events,
    commands: () => commands,
    tools: () => tools,
  };
}

test("test Git leaves inherited outside index and ambient hooks untouched", async (t) => {
  const outside = await mkdtemp(join(tmpdir(), "closeout-outside-index-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const index = join(outside, "index");
  await writeFile(index, "operator index sentinel");
  const env = {
    ...process.env,
    GIT_INDEX_FILE: index,
    GIT_DIR: outside,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: outside,
  };
  const repo = join(outside, "scratch");
  testGit(["init", "-q", repo], env);
  await writeFile(join(repo, "file"), "test");
  testGit(["-C", repo, "add", "file"], env);
  await writeFile(join(outside, "pre-commit"), "#!/bin/sh\nexit 99\n", { mode: 0o755 });
  testGit(
    [
      "-C",
      repo,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-qm",
      "test",
    ],
    env,
  );
  assert.equal(await readFile(index, "utf8"), "operator index sentinel");
  assert.equal(testGit(["-C", repo, "status", "--porcelain"], env), "");
});

test("real Git snapshot detects unstaged, untracked and index-only changes", async (t) => {
  const h = await harness(t);
  const a = await gitSnapshot(h.repo);
  await writeFile(join(h.repo, "file"), "a");
  const b = await gitSnapshot(h.repo);
  assert.notEqual(a.digest, b.digest);
  testGit(["-C", h.repo, "add", "file"]);
  const c = await gitSnapshot(h.repo);
  assert.notEqual(b.digest, c.digest);
  await writeFile(join(h.repo, "file"), "b");
  assert.notEqual((await gitSnapshot(h.repo)).digest, c.digest);
});

test("model cannot certify: TUI freeze and separate seal confirmation required; reload retains inventory", async (t) => {
  const h = await harness(t);
  await h.call("open");
  assert.equal((await h.call("seal")).details.session, "BLOCKED");
  h.ctx.mode = "print";
  h.ctx.hasUI = false;
  await assert.rejects(h.call("freeze"), /TUI/);
  h.ctx.mode = "rpc";
  h.ctx.hasUI = true;
  await assert.rejects(h.call("freeze"), /TUI/);
  h.ctx.mode = "tui";
  await h.call("freeze");
  assert.equal(h.approvals.length, 1);
  h.load();
  assert.equal((await h.call("status")).details.frozen, true);
  assert.equal((await h.call("check")).details.session, "BLOCKED");
  assert.equal((await h.call("seal")).details.session, "SAFE_TO_CLOSE");
  assert.equal(h.approvals.length, 2);
  const state = h.entries.filter((e) => e.customType === CLOSEOUT_ENTRY).at(-1).data;
  assert.equal(state.receipt.reviewer, "operator-confirmation");
  assert.equal((await h.call("check")).details.historicalReceiptMatches, true);
  h.ctx.mode = "print";
  await assert.rejects(h.call("seal"), /TUI/);
  assert.equal(h.tools().get("session_closeout").parameters.additionalProperties, false);
  assert.equal(h.tools().get("session_closeout").parameters.properties.verdict, undefined);
});

test("declined confirmation, queued work and active sibling tools cannot mint a receipt", async (t) => {
  const h = await harness(t);
  await h.call("open");
  await h.call("freeze");
  h.ctx.ui.input = async () => undefined;
  await assert.rejects(h.call("seal"), /declined/);
  h.ctx.hasPendingMessages = () => true;
  assert.equal((await h.call("seal")).details.session, "BLOCKED");
  h.ctx.hasPendingMessages = () => false;
  h.events().get("tool_execution_start")({ toolCallId: "sibling", toolName: "bash" });
  assert.equal((await h.call("seal")).details.session, "BLOCKED");
});

test("Git/host mutations during independent confirmation invalidate approval", async (t) => {
  const h = await harness(t);
  await h.call("open");
  await h.call("freeze");
  h.ctx.ui.editor = async (_title, body) => {
    await writeFile(join(h.repo, "changed"), "new bytes");
    return body;
  };
  await assert.rejects(h.call("seal"), /changed/);
  assert.equal(
    h.entries.filter((e) => e.customType === CLOSEOUT_ENTRY).at(-1).data.receipt,
    undefined,
  );
});

test("foreign fork and branch rewind cannot reuse or drop caller inventory", async (t) => {
  const h = await harness(t);
  await h.call("open");
  await h.call("freeze");
  h.ctx.sessionManager.getBranch = () => h.entries.slice(0, 1);
  await assert.rejects(h.call("status"), /another branch/);
  h.ctx.sessionManager.getBranch = () => h.entries;
  h.ctx.sessionManager.getSessionId = () => "child";
  h.ctx.sessionManager.getHeader = () => ({ id: "child" });
  await assert.rejects(h.call("seal"), /Open this exact/);
});

test("late identity-await branch drift refuses freeze without splitting journal", async (t) => {
  const h = await harness(t);
  await h.call("open");
  const beforeCount = h.entries.length;
  h.ctx.ui.input = async (title) => {
    h.ctx.sessionManager.getHeader = () => {
      h.ctx.sessionManager.getBranch = () => h.entries.slice(0, 1);
      return { id: "caller" };
    };
    return title.replace("Type exactly: ", "");
  };
  await assert.rejects(h.call("freeze"), /changed|another branch/);
  assert.equal(h.entries.length, beforeCount);
  h.ctx.sessionManager.getHeader = () => ({ id: "caller" });
  h.ctx.sessionManager.getBranch = () => h.entries;
  assert.equal((await h.call("status")).details.frozen, false);
});

test("operator must submit unchanged review and exact typed token, never default Yes", async (t) => {
  const h = await harness(t);
  await h.call("open");
  h.ctx.ui.input = async () => "yes";
  await assert.rejects(h.call("freeze"), /not approved/);
  h.ctx.ui.editor = async () => "weakened inventory";
  h.ctx.ui.input = async (title) => title.replace("Type exactly: ", "");
  await assert.rejects(h.call("freeze"), /not approved/);
});
