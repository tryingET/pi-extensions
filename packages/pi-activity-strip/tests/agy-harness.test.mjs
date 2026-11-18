// ---
// summary: "verifies the agy adapter, Nodecode and Claude registry session binding, and one-card-per-tab ownership"
// read_when:
//   - "changing agy, Nodecode or Claude Code tab identification, telemetry, or child-process handling"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_ACTIVE_WINDOW_MS, agentSessionRecord } from "../src/common/agent-identity.mjs";
import {
  AGY_STEP_STATUS,
  AGY_STEP_TYPE,
  parseAgyAnnotationTitle,
  parseAgySteps,
} from "../src/common/agy-conversation.mjs";
import { protoString, protoTimestampsMs } from "../src/common/protobuf-wire.mjs";
import { discoverAgentTabs } from "../src/native/agent-discovery.mjs";
import {
  heldLockInodes,
  readAgyTelemetry,
  resolveAgySession,
} from "../src/native/agy-discovery.mjs";
import {
  claudeProjectDirectoryName,
  resolveClaudeRegistrySession,
} from "../src/native/claude-registry.mjs";
import { nodecodeTelemetry, readNodecodeShell } from "../src/native/nodecode-discovery.mjs";

// --- a minimal protobuf encoder, so fixtures carry agy's real field numbers ---
/** @param {number} value */
function varint(value) {
  const bytes = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return bytes;
}
/** @param {number} field @param {number | string | Uint8Array} value */
function pb(field, value) {
  if (typeof value === "number") return Uint8Array.from([...varint(field * 8), ...varint(value)]);
  const body = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Uint8Array.from([...varint(field * 8 + 2), ...varint(body.length), ...body]);
}
/** @param {...Uint8Array} parts */
function msg(...parts) {
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}
/** @param {number} ms */
function ts(ms) {
  return msg(pb(1, Math.floor(ms / 1000)), pb(2, (ms % 1000) * 1e6));
}
const T0 = 1_795_005_184_000;
/** @param {number} ms @param {{name?: string; args?: string}} [tool] */
function metadata(ms, tool) {
  const call = tool
    ? [pb(4, msg(pb(1, "call_1"), pb(2, tool.name ?? ""), pb(3, tool.args ?? "")))]
    : [];
  return msg(pb(1, ts(ms - 500)), ...call, pb(26, msg(pb(1, msg(pb(1, 2), pb(2, ts(ms)))))));
}
/** @param {number} idx @param {number} stepType @param {number} status @param {Partial<{metadata: Uint8Array; payload: Uint8Array}>} [extra] */
function step(idx, stepType, status, extra = {}) {
  return { idx, stepType, status, metadata: metadata(T0 + idx * 1000), payload: null, ...extra };
}
const userInput = (idx, text) =>
  step(idx, AGY_STEP_TYPE.USER_INPUT, AGY_STEP_STATUS.DONE, { payload: pb(19, msg(pb(2, text))) });

test("the wire reader returns nested strings and timestamps and refuses malformed bytes", () => {
  const bytes = msg(pb(4, msg(pb(2, "run_command"))), pb(1, ts(T0)));
  assert.equal(protoString(bytes, [4, 2]), "run_command");
  assert.deepEqual(protoTimestampsMs(bytes, [1]), [T0]);
  assert.equal(protoString(Uint8Array.from([0x22, 0x09, 0x41]), [4]), "", "truncated length");
  assert.equal(protoString(null, [1]), "");
});

test("agy step status decides the card: tool, waiting, error, generating and the end of a turn", () => {
  const running = parseAgySteps([
    userInput(1, "Fix   the build"),
    step(2, AGY_STEP_TYPE.GENERIC, AGY_STEP_STATUS.RUNNING, {
      metadata: metadata(T0 + 2000, { name: "run_command", args: '{"CommandLine":"npm test"}' }),
    }),
  ]);
  assert.equal(running.state, "tool");
  assert.equal(running.toolName, "run_command");
  assert.equal(running.toolTarget, "npm test");
  assert.equal(running.lastPrompt, "Fix the build");
  assert.equal(running.lastEventAt, T0 + 2000);
  assert.equal(running.stateIsCurrent, true, "a running step is agy's own current state");

  const waiting = parseAgySteps([
    step(5, AGY_STEP_TYPE.GENERIC, AGY_STEP_STATUS.WAITING, {
      metadata: metadata(T0, { name: "ask_question" }),
    }),
  ]);
  assert.equal(waiting.state, "waiting");
  assert.equal(waiting.toolName, "ask_question");

  assert.equal(
    parseAgySteps([step(3, AGY_STEP_TYPE.PLANNER_RESPONSE, AGY_STEP_STATUS.GENERATING)]).state,
    "thinking",
  );
  assert.equal(
    parseAgySteps([step(3, AGY_STEP_TYPE.GENERIC, AGY_STEP_STATUS.ERROR)]).state,
    "thinking",
  );
  const answer = msg(pb(20, msg(pb(3, "1, 2, 3"))));
  const ended = parseAgySteps([
    userInput(1, "count"),
    step(2, AGY_STEP_TYPE.PLANNER_RESPONSE, AGY_STEP_STATUS.DONE, { payload: answer }),
  ]);
  assert.equal(ended.state, "idle", "a planner response that requested no tool ends the turn");
  assert.equal(ended.assistantPreview, "1, 2, 3");
  assert.equal(ended.stateIsCurrent, false);
  const handsOver = msg(pb(20, msg(pb(7, msg(pb(1, "call_9"), pb(2, "view_file"))))));
  assert.equal(
    parseAgySteps([
      step(2, AGY_STEP_TYPE.PLANNER_RESPONSE, AGY_STEP_STATUS.DONE, { payload: handsOver }),
    ]).state,
    "thinking",
    "a planner response that requested tools hands over to them",
  );
  assert.equal(
    parseAgySteps([step(4, AGY_STEP_TYPE.SYSTEM_MESSAGE, AGY_STEP_STATUS.DONE)]).state,
    "thinking",
    "a tool result goes back to the model",
  );
  assert.equal(
    parseAgySteps([step(4, AGY_STEP_TYPE.GENERIC, AGY_STEP_STATUS.CANCELED)]).state,
    "idle",
  );
  assert.equal(parseAgySteps([]).state, "idle");
  assert.equal(parseAgySteps([step(4, 999, 77)]).state, "idle", "unknown values are not busy");
});

test("agy titles decode text-format octal escapes", () => {
  assert.equal(parseAgyAnnotationTitle('title:"Pr\\303\\274fung \\"A\\""\n'), 'Prüfung "A"');
  assert.equal(parseAgyAnnotationTitle("other:1"), "");
});

const ID_A = "b758ec8f-6161-4de6-83bc-39a730cbb370";
const ID_B = "d4d56429-ed47-40b0-a39a-0dee1aa7449a";
const HOME = "/home/x/.gemini/antigravity-cli";
/** @param {Record<string, string>} links */
function fdProcfs(links) {
  return {
    readFile: () => "",
    readLink: (p) => links[p] ?? "",
    readDir: (p) =>
      p === "/proc/700/fd" ? Object.keys(links).map((l) => l.split("/").at(-1)) : [],
    statMtimeMs: () => 0,
  };
}

test("an agy process binds to the conversation whose presence lock it holds under flock", () => {
  const links = {
    "/proc/700/fd/3": `${HOME}/presence/${ID_A}.lock`,
    "/proc/700/fd/4": `${HOME}/presence/${ID_B}.lock`,
    "/proc/700/fd/5": `${HOME}/conversations/${ID_A}.db`,
  };
  const lockInodeOf = (fd) => ({ "/proc/700/fd/3": "111", "/proc/700/fd/4": "222" })[fd] ?? "";
  const locks =
    "1: FLOCK  ADVISORY  WRITE 700 00:23:222 0 EOF\n2: FLOCK  ADVISORY  WRITE 9 00:23:111 0 EOF\n";
  assert.deepEqual([...heldLockInodes(locks, 700)], ["222"]);
  const held = resolveAgySession(700, fdProcfs(links), { locks, lockInodeOf });
  assert.equal(held?.conversationId, ID_B, "the flock decides between two open locks");
  assert.equal(held?.evidence, "presence-lock-held");
  assert.equal(held?.databasePath, `${HOME}/conversations/${ID_B}.db`);
  assert.equal(
    resolveAgySession(700, fdProcfs(links), { locks: "", lockInodeOf }),
    null,
    "ambiguous",
  );
  const single = resolveAgySession(700, fdProcfs({ "/proc/700/fd/3": links["/proc/700/fd/3"] }));
  assert.equal(single?.conversationId, ID_A);
  assert.equal(single?.evidence, "presence-lock-open");
  const storeOnly = resolveAgySession(700, fdProcfs({ "/proc/700/fd/5": links["/proc/700/fd/5"] }));
  assert.equal(storeOnly?.evidence, "conversation-open");
  assert.equal(resolveAgySession(700, fdProcfs({ "/proc/700/fd/9": "/tmp/x.lock" })), null);
});

test("agy telemetry is read once per store change and titled from agy's annotation", () => {
  let reads = 0;
  const procfs = {
    readFile: (p) => (p === `${HOME}/annotations/${ID_A}.pbtxt` ? 'title:"Atlas review"' : ""),
    readLink: () => "",
    readDir: () => [],
    statMtimeMs: (p) => (p.endsWith("-wal") ? T0 + 5 : T0),
  };
  const session = {
    conversationId: ID_A,
    home: HOME,
    databasePath: `${HOME}/conversations/${ID_A}.db`,
    evidence: "presence-lock-held",
  };
  const readSteps = () => {
    reads += 1;
    return [userInput(1, "review")];
  };
  const cache = new Map();
  const first = readAgyTelemetry(session, procfs, cache, readSteps);
  readAgyTelemetry(session, procfs, cache, readSteps);
  assert.equal(reads, 1);
  assert.equal(first.title, "Atlas review");
  assert.equal(first.sessionId, ID_A);
  assert.equal(first.state, "thinking");
});

test("a state the agent keeps current survives the liveness window; an inferred one does not", () => {
  const base = {
    kind: "agy",
    label: "agy",
    processId: 1,
    cwd: "/w",
    terminalKey: "ghostty:main:1",
    terminalFamily: "main",
    terminalSurfaceId: "1",
    startedAt: T0 - 1e6,
  };
  const old = T0 - AGENT_ACTIVE_WINDOW_MS - 60_000;
  const current = agentSessionRecord({
    ...base,
    lastEventAt: old,
    now: T0,
    telemetry: { state: "tool", toolName: "run_command", stateIsCurrent: true },
  });
  assert.equal(current.state, "tool");
  assert.equal(current.agentActive, true);
  const inferred = agentSessionRecord({
    ...base,
    lastEventAt: old,
    now: T0,
    telemetry: { state: "thinking" },
  });
  assert.equal(inferred.state, "idle");
});

test("a Nodecode shell record binds only the live process with its own start ticks", () => {
  const record = {
    version: 1,
    kind: "nodecode-shell",
    pid: 42,
    start_ticks: 9000,
    session_id: "s-1LEDPR09",
    home: "/home/x/.nodecode/profiles/main/",
    cwd: "/w",
  };
  const procfs = {
    readFile: (p) => (p === "/run/user/1/nodecode/shells/42.json" ? JSON.stringify(record) : ""),
  };
  const shell = readNodecodeShell(42, "9000", "/run/user/1/nodecode/shells", procfs);
  assert.equal(shell?.sessionId, "s-1LEDPR09");
  assert.equal(shell?.home, "/home/x/.nodecode/profiles/main/");
  assert.equal(
    readNodecodeShell(42, "9001", "/run/user/1/nodecode/shells", procfs),
    null,
    "reused pid",
  );
  assert.equal(readNodecodeShell(42, "9000", "", procfs), null, "no runtime directory");
});

test("Nodecode telemetry: an open turn is current work, a question on the latest turn waits", () => {
  const row = {
    session_id: "s-A",
    title: "Add agy",
    prompt: "look into",
    updated_at: "2026-11-18T12:00:00Z",
    turn_id: "t2",
    turn_kind: "turn.started",
    waits: null,
    waits_turn: null,
    open_turn: "t2",
    last_event_at: "2026-11-18T12:00:05Z",
  };
  const NOW = Date.parse("2026-11-18T12:01:00Z");
  const busy = nodecodeTelemetry(row, NOW);
  assert.equal(busy.state, "thinking");
  assert.equal(busy.stateIsCurrent, true);
  assert.equal(busy.title, "Add agy");
  assert.equal(busy.lastEventAt, Date.parse("2026-11-18T12:00:05Z"));
  const asking = nodecodeTelemetry({
    ...row,
    open_turn: null,
    turn_kind: "turn.completed",
    waits: "A or B?",
    waits_turn: "t2",
  });
  assert.equal(asking.state, "waiting");
  assert.equal(asking.assistantPreview, "A or B?");
  assert.equal(
    nodecodeTelemetry({ ...row, open_turn: null, waits: "old", waits_turn: "t1" }).state,
    "idle",
  );
  assert.equal(nodecodeTelemetry(undefined).state, "idle");
});

test("a resumed Claude Code session binds through its registry record and start ticks", () => {
  const id = "aca43503-71b9-48bf-ac23-c4ac1f1a98f7";
  const encoded = claudeProjectDirectoryName("/home/x/ai.society/repo_one");
  assert.equal(encoded, "-home-x-ai-society-repo-one");
  const moved = `/home/x/.claude/projects/-home-x-other/${id}.jsonl`;
  const procfs = {
    readFile: (p) =>
      p === "/home/x/.claude/sessions/501.json"
        ? JSON.stringify({
            pid: 501,
            sessionId: id.toUpperCase(),
            procStart: "5849927",
            cwd: "/home/x/ai.society/repo_one",
          })
        : "",
    readLink: () => "",
    readDir: (p) => (p === "/home/x/.claude/projects" ? [encoded, "-home-x-other"] : []),
    statMtimeMs: (p) => (p === moved ? 1 : 0),
    readTail: () => "",
  };
  const found = resolveClaudeRegistrySession(501, "5849927", procfs, "/home/x", new Map());
  assert.equal(found?.sessionId, id);
  assert.equal(found?.transcript, moved, "a resumed transcript is found where it started");
  assert.equal(
    resolveClaudeRegistrySession(501, "1", procfs, "/home/x", new Map()),
    null,
    "reused pid",
  );
  assert.equal(resolveClaudeRegistrySession(502, "5849927", procfs, "/home/x", new Map()), null);
});

/** @param {number} pid @param {number} ppid @param {number} [ticks] */
const stat = (pid, ppid, ticks = 1000) =>
  `${pid} (x) S ${ppid} ${" 0".repeat(17).trim()} ${ticks} 0`;
/** @param {Record<string, string>} [extra] */
const environ = (extra = {}) =>
  Object.entries({ TERM_PROGRAM: "ghostty", GHOSTTY_SURFACE_ID: "0x10", ...extra })
    .map(([k, v]) => `${k}=${v}`)
    .join("\0");

test("one tab is one card: agents an agent starts in its own tab are not cards", () => {
  /** @type {Record<string, string>} */
  const files = {
    "/proc/uptime": "1000.0 1.0",
    "/proc/400/comm": "ghostty\n",
    "/proc/400/stat": stat(400, 1),
  };
  /** @type {Record<string, string>} */
  const links = { "/proc/400/exe": "/usr/bin/ghostty" };
  const procs = [];
  /** @param {number} pid @param {number} ppid @param {string} comm @param {string} [cmdline] @param {string} [surface] */
  const add = (pid, ppid, comm, cmdline = comm, surface = "0x10") => {
    files[`/proc/${pid}/comm`] = `${comm}\n`;
    files[`/proc/${pid}/stat`] = stat(pid, ppid);
    files[`/proc/${pid}/cmdline`] = cmdline.split(" ").join("\0");
    files[`/proc/${pid}/environ`] = environ({ GHOSTTY_SURFACE_ID: surface });
    links[`/proc/${pid}/cwd`] = "/w";
    procs.push(String(pid));
  };
  add(500, 400, "claude", "claude --resume x", "0x10");
  add(501, 500, "claude", "claude daemon run", "0x10");
  add(510, 400, "nodecode", "nodecode -p main", "0x11");
  add(511, 510, "setsid", "setsid -w nodecode serve", "0x11");
  add(512, 511, "nodecode", "nodecode serve", "0x11");
  add(513, 510, "agy", "agy -p hi", "0x11");
  add(520, 400, "node", "node /home/x/.npm-global/bin/codex", "0x12");
  add(521, 520, "codex", "/home/x/vendor/codex/codex", "0x12");
  add(530, 400, "agy", "agy", "0x13");
  // Review S2: a Codex launcher inside a Nodecode tab folds, and the walk goes on to Nodecode.
  add(540, 400, "nodecode", "nodecode -p main", "0x14");
  add(541, 540, "node", "node /home/x/.npm-global/bin/codex", "0x14");
  add(542, 541, "codex", "/home/x/vendor/codex/codex", "0x14");
  // Review S2: a Node-hosted Claude that starts a native Claude of its own is the owner.
  add(550, 400, "node", "node /home/x/.npm-global/bin/claude", "0x15");
  add(551, 550, "claude", "claude -p sub", "0x15");
  // The resumed Claude Code tab holds no scratchpad; its registry record names it.
  files["/home/x/.claude/sessions/500.json"] = JSON.stringify({
    pid: 500,
    sessionId: "aca43503-71b9-48bf-ac23-c4ac1f1a98f7",
    procStart: "1000",
    cwd: "/w",
  });
  const procfs = {
    readFile: (p) => files[p] ?? "",
    readLink: (p) => links[p] ?? "",
    readDir: (p) => (p === "/proc" ? [...procs, "400"] : []),
    statMtimeMs: () => 0,
    readTail: () => "",
    lockInodeOf: () => "",
  };
  const tabs = discoverAgentTabs({
    procfs,
    env: {},
    homeDir: "/home/x",
    now: () => T0,
    readNodecode: () => new Map(),
  });
  const owners = tabs.map((tab) => `${tab.processId}:${tab.agentKind}`).sort();
  assert.deepEqual(owners, [
    "500:claude",
    "510:nodecode",
    "521:codex",
    "530:agy",
    "540:nodecode",
    "550:claude",
  ]);
  assert.equal(
    new Set(tabs.map((tab) => tab.terminalKey)).size,
    tabs.length,
    "no tab has two cards",
  );
  assert.equal(
    tabs.find((tab) => tab.agentKind === "claude")?.sessionId,
    "agent:claude:aca43503-71b9-48bf-ac23-c4ac1f1a98f7",
  );
  const agy = tabs.find((tab) => tab.agentKind === "agy");
  assert.equal(agy?.agentLabel, "agy");
  assert.equal(agy?.titleSuffix, "", "agy does not title its terminal by conversation");
});

test("a Nodecode tab carries its session id, title and live state from its home's store", () => {
  const files = {
    "/proc/uptime": "1000.0 1.0",
    "/proc/400/comm": "ghostty\n",
    "/proc/400/stat": stat(400, 1),
    "/proc/510/comm": "nodecode\n",
    "/proc/510/stat": stat(510, 400, 4242),
    "/proc/510/environ": environ(),
    "/run/u/nodecode/shells/510.json": JSON.stringify({
      version: 1,
      kind: "nodecode-shell",
      pid: 510,
      start_ticks: 4242,
      session_id: "s-ABC",
      home: "/h/main",
    }),
  };
  const procfs = {
    readFile: (p) => files[p] ?? "",
    readLink: (p) => ({ "/proc/400/exe": "/usr/bin/ghostty", "/proc/510/cwd": "/w/repo" })[p] ?? "",
    readDir: (p) => (p === "/proc" ? ["400", "510"] : []),
    statMtimeMs: () => 0,
    readTail: () => "",
  };
  /** @type {Array<[string, string[]]>} */
  const asked = [];
  const readNodecode = (home, ids) => {
    asked.push([home, ids]);
    return new Map([
      [
        "s-ABC",
        {
          session_id: "s-ABC",
          title: "Harness audit",
          prompt: "p",
          updated_at: new Date(T0 - 600_000).toISOString(),
          turn_id: "t",
          turn_kind: "turn.started",
          waits: null,
          waits_turn: null,
          open_turn: "t",
          last_event_at: new Date(T0 - 300_000).toISOString(),
        },
      ],
    ]);
  };
  const [tab] = discoverAgentTabs({
    procfs,
    env: { XDG_RUNTIME_DIR: "/run/u" },
    homeDir: "/home/x",
    now: () => T0,
    readNodecode,
  });
  assert.deepEqual(asked, [["/h/main", ["s-ABC"]]], "one store read per home");
  assert.equal(tab?.sessionId, "agent:nodecode:s-ABC");
  assert.equal(tab?.phase, "Harness audit");
  assert.equal(tab?.state, "thinking", "an open turn is work even after five quiet minutes");
  assert.equal(tab?.titleSuffix, "", "Nodecode titles its terminal by profile and directory");
});
