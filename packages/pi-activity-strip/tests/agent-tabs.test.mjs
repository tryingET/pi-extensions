// ---
// summary: "verifies agent process recognition, record shaping, procfs discovery, and agent window placement"
// read_when:
//   - "adding an agent CLI or changing agent tab discovery and placement"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_ACTIVE_WINDOW_MS,
  agentSessionRecord,
  classifyAgentProcess,
  repoLabelFor,
} from "../src/common/agent-identity.mjs";
import { placeSessionWindow, resolveAgentSessionWindow } from "../src/common/niri-focus.mjs";
import { sessionCardId } from "../src/common/session-cards.mjs";
import {
  discoverAgentTabs,
  readClaudeHookEvent,
  readClaudeTelemetry,
  resolveClaudeSession,
} from "../src/native/agent-discovery.mjs";

test("agent recognition admits known CLIs and refuses runtimes, Pi, and disabled kinds", () => {
  assert.equal(classifyAgentProcess({ command: "claude" })?.kind, "claude");
  assert.equal(classifyAgentProcess({ command: "/usr/local/bin/codex" })?.kind, "codex");
  assert.equal(classifyAgentProcess({ command: "", argv0: "/opt/bin/gemini" })?.kind, "gemini");
  assert.equal(classifyAgentProcess({ command: "CLAUDE" })?.kind, "claude");
  assert.equal(classifyAgentProcess({ command: "pi" }), null, "Pi publishes its own telemetry");
  assert.equal(classifyAgentProcess({ command: "node" }), null);
  assert.equal(classifyAgentProcess({ command: "bash" }), null);
  assert.equal(
    classifyAgentProcess({ command: "btop" }),
    null,
    "a plain terminal app is not an agent",
  );
  assert.equal(classifyAgentProcess({}), null);
  assert.equal(
    classifyAgentProcess({
      command: "claude",
      env: { PI_ACTIVITY_STRIP_AGENT_KINDS_DISABLED: "claude" },
    }),
    null,
  );
  assert.equal(repoLabelFor("/home/x/work/repo"), "repo");
  assert.equal(repoLabelFor("/"), "");
});

test("an agent record carries a terminal card identity and whole-millisecond timestamps", () => {
  const base = {
    kind: "claude",
    label: "Claude Code",
    processId: 501,
    cwd: "/home/x/work/repo",
    terminalKey: "ghostty:main:16",
    terminalFamily: "main",
    terminalSurfaceId: "16",
    sessionKey: "9e3dc376-ca33-4ad3-af0b-4415926927fe",
    titleSuffix: "a live topic",
  };
  const now = 1_788_731_376_000;
  const active = agentSessionRecord({
    ...base,
    startedAt: 1_788_700_000_000.4158,
    lastEventAt: now - 1000.77,
    now: now + 0.5,
  });
  assert.equal(active.sessionId, "agent:claude:9e3dc376-ca33-4ad3-af0b-4415926927fe");
  assert.equal(sessionCardId(active), "terminal:ghostty:main:16");
  assert.equal(active.repoLabel, "repo");
  assert.equal(active.phase, "Claude Code");
  assert.equal(active.state, "thinking");
  assert.equal(active.agentActive, true);
  for (const key of ["startedAt", "lastEventAt", "updatedAt", "agentStartedAt"]) {
    assert.equal(Number.isInteger(active[key]), true, `${key} must be an integer`);
  }

  const quiet = agentSessionRecord({
    ...base,
    sessionKey: "",
    startedAt: 1_788_700_000_000,
    lastEventAt: now - AGENT_ACTIVE_WINDOW_MS - 1,
    now,
  });
  assert.equal(quiet.state, "idle");
  assert.equal(quiet.agentActive, false);
  assert.equal(quiet.agentStartedAt, null);
  assert.equal(quiet.sessionId, "agent:claude:501", "without a session key the pid identifies it");
});

function fakeProcfs(files = {}, links = {}, dirs = {}, mtimes = {}) {
  return {
    readFile: (filePath) => files[filePath] ?? "",
    readLink: (filePath) => links[filePath] ?? "",
    readDir: (filePath) => dirs[filePath] ?? [],
    statMtimeMs: (filePath) => mtimes[filePath] ?? 0,
    readTail: (filePath) => files[filePath] ?? "",
  };
}

test("the Claude adapter reads the session from an open scratchpad and the last recorded title", () => {
  const procfs = fakeProcfs(
    {
      "/transcript.jsonl": [
        '{"type":"ai-title","aiTitle":"first topic","sessionId":"9e3dc376-ca33-4ad3-af0b-4415926927fe"}',
        '{"type":"assistant","message":"ignored"}',
        '{"type":"ai-title","aiTitle":"later \\"quoted\\" topic","sessionId":"9e3dc376-ca33-4ad3-af0b-4415926927fe"}',
      ].join("\n"),
      "/empty.jsonl": '{"type":"assistant"}',
    },
    {
      "/proc/501/fd/0": "/dev/pts/1",
      "/proc/501/fd/7":
        "/home/x/.local/state/tmp/claude-1000/-home-x-work-repo/9e3dc376-ca33-4ad3-af0b-4415926927fe/tasks",
      "/proc/502/fd/0": "/dev/pts/2",
    },
    { "/proc/501/fd": ["0", "7"], "/proc/502/fd": ["0"] },
  );
  const cache = new Map();
  assert.equal(
    readClaudeTelemetry("/transcript.jsonl", procfs, cache).title,
    'later "quoted" topic',
  );
  assert.equal(readClaudeTelemetry("/empty.jsonl", procfs, cache).title, "");
  assert.equal(readClaudeTelemetry("/missing.jsonl", procfs, cache).title, "");
  assert.equal(readClaudeHookEvent("not-a-session", procfs), null);

  assert.deepEqual(resolveClaudeSession(501, procfs, "/home/x"), {
    sessionId: "9e3dc376-ca33-4ad3-af0b-4415926927fe",
    encodedCwd: "-home-x-work-repo",
    transcript:
      "/home/x/.claude/projects/-home-x-work-repo/9e3dc376-ca33-4ad3-af0b-4415926927fe.jsonl",
  });
  assert.equal(resolveClaudeSession(502, procfs, "/home/x"), null);
});

test("discovery admits only agent processes bound to a live Ghostty surface", () => {
  const stat = (pid, ppid, start) =>
    `${pid} (x) S ${ppid} 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 0`;
  const environ = (extra = {}) =>
    Object.entries({ TERM_PROGRAM: "ghostty", GHOSTTY_SURFACE_ID: "0x10", ...extra })
      .map(([key, value]) => `${key}=${value}`)
      .join("\0");
  const transcript =
    "/home/x/.claude/projects/-home-x-work-repo/9e3dc376-ca33-4ad3-af0b-4415926927fe.jsonl";
  const procfs = fakeProcfs(
    {
      "/proc/uptime": "1000.0 1.0",
      "/proc/501/comm": "claude\n",
      "/proc/501/environ": environ(),
      "/proc/501/stat": stat(501, 400, 50_000),
      "/proc/502/comm": "claude\n",
      "/proc/502/environ": environ({ TERM_PROGRAM: "foot" }),
      "/proc/503/comm": "btop\n",
      "/proc/503/environ": environ(),
      "/proc/504/comm": "claude\n",
      "/proc/504/environ": environ({ GHOSTTY_SURFACE_ID: "not-a-number" }),
      "/proc/505/comm": "codex\n",
      "/proc/505/environ": environ({ GHOSTTY_SURFACE_ID: "0x20" }),
      "/proc/505/stat": stat(505, 401, 60_000),
      "/proc/400/comm": "ghostty\n",
      "/proc/400/stat": stat(400, 1, 10),
      "/proc/401/comm": "foot\n",
      "/proc/401/stat": stat(401, 1, 10),
      [transcript]: [
        '{"type":"ai-title","aiTitle":"a live topic"}',
        JSON.stringify({
          type: "assistant",
          timestamp: new Date(1_788_700_500_000).toISOString(),
          message: {
            content: [{ type: "tool_use", name: "Bash", input: { description: "run the suite" } }],
            stop_reason: "tool_use",
          },
        }),
      ].join("\n"),
    },
    {
      "/proc/400/exe": "/opt/ghostty-origin-main/bin/ghostty",
      "/proc/401/exe": "/usr/bin/foot",
      "/proc/501/cwd": "/home/x/work/repo",
      "/proc/501/fd/7":
        "/tmp/claude-1000/-home-x-work-repo/9e3dc376-ca33-4ad3-af0b-4415926927fe/tasks",
    },
    {
      "/proc": ["501", "502", "503", "504", "505", "400", "401", "self"],
      "/proc/501/fd": ["7"],
    },
    { [transcript]: 1_788_700_500_000 },
  );

  const tabs = discoverAgentTabs({
    procfs,
    env: {},
    homeDir: "/home/x",
    now: () => 1_788_700_500_500,
  });
  assert.equal(tabs.length, 1, "only the Ghostty-bound agent with a known host family is admitted");
  const [tab] = tabs;
  assert.equal(tab.agentKind, "claude");
  assert.equal(tab.processId, 501);
  assert.equal(tab.terminalKey, "ghostty:main:16");
  assert.equal(tab.titleSuffix, "a live topic");
  assert.equal(tab.repoLabel, "repo");
  assert.equal(tab.state, "tool", "live transcript state reaches the card");
  assert.equal(tab.toolName, "Bash");
  assert.equal(tab.toolTarget, "run the suite");
  assert.equal(tab.phase, "a live topic", "the conversation topic names the card");
  assert.equal(
    discoverAgentTabs({
      procfs,
      env: { PI_ACTIVITY_STRIP_AGENT_KINDS_DISABLED: "claude" },
      homeDir: "/home/x",
    }).length,
    0,
  );
});

test("an agent tab is placed by its own title, and ambiguity places nothing", () => {
  const session = {
    sessionId: "agent:claude:9e3dc376",
    processId: 501,
    terminalKind: "ghostty-surface",
    terminalKey: "ghostty:main:16",
    terminalFamily: "main",
    terminalSurfaceId: "16",
    titleSuffix: "a live topic",
  };
  const window = (id, title, pid = 4000, app_id = "com.mitchellh.ghostty") => ({
    id,
    title,
    pid,
    app_id,
    workspace_id: 2,
  });
  const windows = [
    window(44, "◐ a live topic"),
    window(45, "~/programming"),
    window(46, "x", 4001),
  ];
  const placed = resolveAgentSessionWindow(windows, session, {});
  assert.equal(placed?.window.id, 44);
  assert.equal(placed?.placement, "title");
  assert.equal(placeSessionWindow(windows, session, {})?.window.id, 44);

  assert.equal(
    resolveAgentSessionWindow([...windows, window(47, "also a live topic")], session, {}),
    null,
    "two windows claiming the title place nothing",
  );
  assert.equal(
    resolveAgentSessionWindow([window(44, "◐ a live topic", 4000, "brave-browser")], session, {}),
    null,
    "a non-Ghostty window never matches",
  );

  const hidden = resolveAgentSessionWindow(
    [window(45, "~/programming"), window(46, "x", 4001)],
    session,
    {
      resolveHostPid: () => 4000,
    },
  );
  assert.equal(hidden?.window.id, 45, "an inactive agent tab falls back to host containment");
  assert.equal(hidden?.placement, "host");
  assert.equal(
    placeSessionWindow(windows, { sessionId: "agent:claude:1", titleSuffix: "a live topic" }, {}),
    null,
    "a record without a terminal identity is never placed",
  );
});
