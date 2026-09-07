// ---
// summary: "verifies Codex rollout state derivation, thread binding, and hook-record pruning"
// read_when:
//   - "changing Codex telemetry, its session binding rules, or orphan event cleanup"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import {
  CLAUDE_EVENT_ORPHAN_GRACE_MS,
  CLAUDE_EVENT_SCHEMA,
  pruneClaudeEventRecords,
} from "../src/common/claude-events.mjs";
import { describeCodexToolTarget, parseCodexRolloutTail } from "../src/common/codex-transcript.mjs";
import {
  bindCodexThread,
  CODEX_THREAD_START_SLACK_MS,
  openRolloutPaths,
  readCodexThreads,
  resolveCodexStateDb,
} from "../src/native/codex-discovery.mjs";

const line = (value) => JSON.stringify(value);
const at = (seconds) => `2026-09-02T08:0${seconds}:00.000Z`;
const meta = line({
  type: "session_meta",
  timestamp: at(0),
  payload: {
    id: "01a060bd-7847-7302-96aa-b395748ea25c",
    cwd: "/home/x/repo",
    git: { branch: "main" },
  },
});
const context = line({
  type: "turn_context",
  timestamp: at(1),
  payload: { cwd: "/home/x/repo", approval_policy: "never", sandbox_policy: { type: "read-only" } },
});
const event = (payload, seconds) => line({ type: "event_msg", timestamp: at(seconds), payload });
const item = (payload, seconds) => line({ type: "response_item", timestamp: at(seconds), payload });

test("a Codex tool call reads as running until its output arrives", () => {
  const call = {
    type: "function_call",
    name: "exec_command",
    call_id: "call_1",
    arguments: JSON.stringify({ cmd: "npm test", workdir: "/home/x/repo" }),
  };
  const running = parseCodexRolloutTail(
    [meta, context, event({ type: "task_started", turn_id: "t1" }, 2), item(call, 3)].join("\n"),
  );
  assert.equal(running.state, "tool");
  assert.equal(running.toolName, "exec_command");
  assert.equal(running.toolTarget, "npm test");
  assert.equal(running.cwd, "/home/x/repo");
  assert.equal(running.gitBranch, "main");
  assert.equal(running.mode, "never");
  assert.equal(running.permissionMode, "read-only");
  assert.equal(running.sessionId, "01a060bd-7847-7302-96aa-b395748ea25c");

  const returned = parseCodexRolloutTail(
    [
      meta,
      item(call, 3),
      item({ type: "function_call_output", call_id: "call_1", output: "ok" }, 4),
      item(call, 5),
    ].join("\n"),
  );
  assert.equal(returned.state, "tool", "a second call with the same id is still running");

  const finished = parseCodexRolloutTail(
    [meta, item(call, 3), item({ type: "function_call_output", call_id: "call_1" }, 4)].join("\n"),
  );
  assert.equal(finished.state, "thinking", "a returned tool result means the model resumed");
  assert.equal(finished.toolName, "");
});

test("Codex turn boundaries, previews and other tool shapes are reported", () => {
  const telemetry = parseCodexRolloutTail(
    [
      meta,
      event({ type: "user_message", message: "please run the suite" }, 2),
      event({ type: "agent_message", message: "running it now" }, 3),
      event({ type: "task_complete", turn_id: "t1", last_agent_message: "all green" }, 4),
    ].join("\n"),
  );
  assert.equal(telemetry.state, "idle");
  assert.equal(telemetry.turnIndex, 1);
  assert.equal(telemetry.lastPrompt, "please run the suite");
  assert.equal(telemetry.assistantPreview, "all green");
  assert.equal(telemetry.lastEventAt, Date.parse(at(4)));

  assert.equal(
    parseCodexRolloutTail([meta, item({ type: "web_search_call", call_id: "w1" }, 3)].join("\n"))
      .toolName,
    "web_search",
  );
  assert.equal(
    parseCodexRolloutTail([meta, item({ type: "local_shell_call", call_id: "s1" }, 3)].join("\n"))
      .toolName,
    "shell",
  );
  assert.equal(
    parseCodexRolloutTail([meta, item({ type: "reasoning" }, 3)].join("\n")).state,
    "thinking",
  );
});

test("Codex tool targets survive unparseable arguments and empty rollouts", () => {
  assert.equal(describeCodexToolTarget({ arguments: '{"query":"how to"}' }), "how to");
  assert.equal(describeCodexToolTarget({ arguments: { path: "/a/b.ts" } }), "/a/b.ts");
  assert.equal(describeCodexToolTarget({ arguments: { cmd: ["ls", "-l"] } }), "ls -l");
  assert.equal(describeCodexToolTarget({ arguments: "not json" }), "not json");
  assert.equal(describeCodexToolTarget({ arguments: {} }), "");
  assert.equal(describeCodexToolTarget({}), "");

  assert.equal(parseCodexRolloutTail("").state, "idle");
  assert.equal(parseCodexRolloutTail("").lastEventAt, 0);
  assert.equal(parseCodexRolloutTail("garbage").lastEventAt, 0);
  const fragment = parseCodexRolloutTail(`"cut":"line"}\n${meta}`);
  assert.equal(fragment.sessionId, "01a060bd-7847-7302-96aa-b395748ea25c");
});

test("the newest state database wins and a Codex-free home yields nothing", () => {
  const fsImpl = {
    readdirSync: (dir) =>
      dir === "/codex"
        ? ["state_4.sqlite", "state_11.sqlite", "state_5.sqlite", "notes.txt", "state_x.sqlite"]
        : (() => {
            throw new Error("ENOENT");
          })(),
  };
  assert.equal(resolveCodexStateDb("/codex", fsImpl), "/codex/state_11.sqlite");
  assert.equal(resolveCodexStateDb("/missing", fsImpl), "");
  assert.deepEqual(readCodexThreads(""), []);
  assert.deepEqual(readCodexThreads("/missing/state_1.sqlite"), [], "an unreadable index is empty");
});

test("a Codex process binds to its thread only on exact or unambiguous evidence", () => {
  const started = 1_788_000_000_000;
  const thread = (id, cwd, createdOffset, rolloutPath = `/r/${id}.jsonl`) => ({
    id,
    rolloutPath,
    cwd,
    title: `title ${id}`,
    createdAtMs: started + createdOffset,
    updatedAtMs: started + createdOffset,
  });
  const threads = [
    thread("a", "/home/x/repo", 1000),
    thread("b", "/home/x/other", 1000),
    thread("c", "/home/x/repo", -60_000),
  ];

  assert.equal(
    bindCodexThread({ processId: 1, cwd: "/home/x/repo", startedAt: started }, threads)?.id,
    "a",
    "one thread created after the process started in that directory is exact enough",
  );
  assert.equal(
    bindCodexThread(
      { processId: 1, cwd: "/home/x/repo", startedAt: started, openPaths: ["/r/c.jsonl"] },
      threads,
    )?.id,
    "c",
    "an open rollout wins over the directory rule",
  );
  assert.equal(
    bindCodexThread(
      {
        processId: 1,
        cwd: "/home/x/repo",
        startedAt: started,
        openPaths: ["/r/a.jsonl", "/r/c.jsonl"],
      },
      threads,
    ),
    null,
    "two open rollouts are ambiguous",
  );
  assert.equal(
    bindCodexThread({ processId: 1, cwd: "/home/x/repo", startedAt: started }, [
      ...threads,
      thread("d", "/home/x/repo", 2000),
    ]),
    null,
    "two candidate threads in one directory bind nothing",
  );
  assert.equal(
    bindCodexThread({ processId: 1, cwd: "/home/x/repo", startedAt: started + 120_000 }, threads),
    null,
    "a thread older than the process is never its own",
  );
  assert.equal(
    bindCodexThread(
      {
        processId: 1,
        cwd: "/home/x/repo",
        startedAt: started + 1000 + CODEX_THREAD_START_SLACK_MS,
      },
      threads,
    )?.id,
    "a",
    "clock slack is tolerated",
  );
  assert.equal(bindCodexThread({ processId: 1, cwd: "", startedAt: started }, threads), null);
  assert.equal(bindCodexThread({ processId: 1, cwd: "/home/x/repo", startedAt: 0 }, threads), null);

  const procfs = {
    readDir: () => ["0", "7", "9"],
    readLink: (p) =>
      p.endsWith("/7")
        ? "/home/x/.codex/sessions/2026/09/02/rollout-x.jsonl"
        : p.endsWith("/9")
          ? "/home/x/.codex/log/codex-tui.log"
          : "/dev/pts/1",
  };
  assert.deepEqual(openRolloutPaths(11, procfs), [
    "/home/x/.codex/sessions/2026/09/02/rollout-x.jsonl",
  ]);
});

test("orphaned hook records are retired once no live session claims them", () => {
  const now = 1_788_000_000_000;
  const live = "9e3dc376-ca33-4ad3-af0b-4415926927fe";
  const dead = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const fresh = "11111111-2222-3333-4444-555555555555";
  const files = new Map([
    [`/e/${live}.json`, JSON.stringify({ schema: CLAUDE_EVENT_SCHEMA, at: now - 1000 })],
    [
      `/e/${dead}.json`,
      JSON.stringify({ schema: CLAUDE_EVENT_SCHEMA, at: now - CLAUDE_EVENT_ORPHAN_GRACE_MS - 1 }),
    ],
    [`/e/${fresh}.json`, JSON.stringify({ schema: CLAUDE_EVENT_SCHEMA, at: now - 1000 })],
    ["/e/corrupt.json", "{not json"],
    ["/e/notes.txt", "ignored"],
  ]);
  const fsImpl = {
    readdirSync: () => [...files.keys()].map((key) => key.slice("/e/".length)),
    readFileSync: (filePath) => {
      if (!files.has(filePath)) throw new Error("ENOENT");
      return files.get(filePath);
    },
    unlinkSync: (filePath) => files.delete(filePath),
  };

  const retired = pruneClaudeEventRecords([live], { fs: fsImpl, directory: "/e", now });
  assert.deepEqual(retired.sort(), [dead, "corrupt"].sort());
  assert.equal(files.has(`/e/${live}.json`), true, "a live session keeps its record");
  assert.equal(files.has(`/e/${fresh}.json`), true, "a recent record survives its first scans");
  assert.equal(files.has("/e/notes.txt"), true, "unrelated files are never touched");

  assert.deepEqual(
    pruneClaudeEventRecords([live], {
      fs: {
        ...fsImpl,
        readdirSync: () => {
          throw new Error("ENOENT");
        },
      },
      directory: "/e",
      now,
    }),
    [],
    "a missing directory is not an error",
  );
});
