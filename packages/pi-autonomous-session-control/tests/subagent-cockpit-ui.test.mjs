import "./subagent-cockpit-ui-loader.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CURSOR_MARKER, TuiAltScreen, TuiMainScreen, visibleWidth } from "@earendil-works/pi-tui";

const { SubagentCockpitUI } = await import("../extensions/self/subagent-cockpit-ui.ts");
const { prepareCockpitSnapshot } = await import(
  "../extensions/self/subagent-cockpit-ui-timeline.ts"
);
const { cockpitText, createCockpitSource } = await import(
  "../extensions/self/subagent-cockpit-ui-control.ts"
);
const { buildDashboardLines, cockpitShortcut, registerSubagentDashboard } = await import(
  "../extensions/self/subagent-dashboard.ts"
);

import { createSubagentState } from "../extensions/self/subagent-session.ts";
import { writeStatus } from "./subagent-dashboard-data-harness.mjs";

const theme = { fg: (_name, text) => text };
function harness(drafts = new Map()) {
  const snapshots = new Map(
    ["alpha", "beta"].map((name) => [
      name,
      {
        sessionName: name,
        status: "running",
        dispatchId: `dispatch-${name}`,
        attemptId: `attempt-${name}`,
        steeringSupported: true,
        objective: "Read the source 中文",
        profile: "minimal",
        model: "test",
        events: Array.from({ length: 25 }, (_, index) => ({
          id: `${name}-${index}`,
          timestamp: "12:00",
          kind: index % 2 ? "assistant" : "tool_result",
          text: `event-${name}-${index}`,
          toolName: "read",
          detail: `args/result-${index}\n${"中文 detail\n".repeat(20)}`,
        })),
        receipts: [],
      },
    ]),
  );
  const calls = { reads: 0, rows: 0, sends: [], cancels: [], done: 0, renders: 0 };
  const host = { terminal: { rows: 40 }, requestRender: () => calls.renders++ };
  const source = {
    rows: () => {
      calls.rows++;
      return [...snapshots.values()].map(({ sessionName, status }) => ({ sessionName, status }));
    },
    read: (name) => {
      calls.reads++;
      if (calls.failRead) throw Error("temporarily unavailable");
      return snapshots.get(name);
    },
    send: (target, message) => {
      calls.sends.push({ target, message });
      return { ok: true, status: "queued", requestId: "receipt-1" };
    },
    cancel: (target) => {
      calls.cancels.push(target);
      return { ok: true, status: "cancel_requested" };
    },
  };
  const ui = new SubagentCockpitUI(host, theme, source, () => calls.done++, "all", "alpha", drafts);
  ui.focused = true;
  return { ui, host, calls, snapshots };
}
const tab = "\t";
const enter = "\r";
const up = "\x1b[A";
const down = "\x1b[B";
const ctrlS = "\x13";
// Kitty protocol for Ctrl+Alt+X (modifier 1 + Ctrl 4 + Alt 2 = 7).
const cancelKey = "\x1b[120;7u";

function draft(ui, message) {
  ui.handleInput(tab);
  ui.handleInput(tab);
  ui.handleInput(message);
}

test("compact widget has only current active one-line rows, retains >1h running, all-terminal counts, empty hides", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cockpit-ui-widget-"));
  try {
    const old = new Date(Date.now() - 4 * 3600000).toISOString();
    await writeStatus(dir, "alpha", "running", old, "SECRET_OBJECTIVE", {
      parentSessionKey: "parent",
      parentRepoRoot: "/repo",
    });
    await writeStatus(dir, "finished-child", "done", old, "SECRET_OBJECTIVE", {
      parentSessionKey: "parent",
      parentRepoRoot: "/repo",
    });
    await writeStatus(dir, "foreign", "running", old, "SECRET_OBJECTIVE", {
      parentSessionKey: "foreign",
      parentRepoRoot: "/repo",
    });
    await writeStatus(dir, "other-repo", "running", old, "SECRET_OBJECTIVE", {
      parentSessionKey: "parent",
      parentRepoRoot: "/other",
    });
    let lines = buildDashboardLines(200, theme, dir, "parent", "/repo");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /running=1.*done=1/);
    assert.match(lines[1], /alpha/);
    assert.doesNotMatch(lines.join("\n"), /finished-child|foreign|other-repo|SECRET|parent|\/repo/);
    await writeStatus(dir, "alpha", "aborted", old, "SECRET_OBJECTIVE", {
      parentSessionKey: "parent",
      parentRepoRoot: "/repo",
    });
    lines = buildDashboardLines(200, theme, dir, "parent", "/repo");
    assert.equal(lines.length, 1);
    assert.match(lines[0], /\/subagents.*done=1.*error=0.*timeout=0.*aborted=1.*abandoned=0/);
    assert.doesNotMatch(lines[0], /alpha|finished-child|SECRET/);
    assert.deepEqual(buildDashboardLines(80, theme, dir, "missing", "/repo"), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("render is source-read-free, bounded at narrow widths/resize, private Editor owns IME focus", () => {
  const { ui, calls, host } = harness();
  try {
    draft(ui, "中文👨‍👩‍👧‍👦é private draft");
    const reads = calls.reads;
    const rows = calls.rows;
    for (const height of [6, 20, 40]) {
      host.terminal.rows = height;
      for (const width of [1, 2, 8, 24, 80, 120]) {
        const lines = ui.render(width);
        assert.ok(lines.length <= Math.max(1, Math.floor(height * 0.85)));
        for (const line of lines) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
      }
    }
    host.terminal.rows = 40;
    assert.ok(ui.render(80).some((line) => line.includes(CURSOR_MARKER)));
    ui.focused = false;
    assert.ok(ui.render(80).every((line) => !line.includes(CURSOR_MARKER)));
    assert.equal(calls.reads, reads);
    assert.equal(calls.rows, rows);
  } finally {
    ui.dispose();
  }
});

test("drafts isolate attempts/children, Enter never sends, explicit send keeps receipt and clears only sent draft", () => {
  const drafts = new Map();
  const { ui, calls, snapshots } = harness(drafts);
  try {
    draft(ui, "literal /skill:not-expanded");
    ui.handleInput(enter);
    assert.equal(calls.sends.length, 0);
    ui.handleInput(tab); // children
    ui.handleInput(down); // beta
    draft(ui, "beta draft");
    ui.handleInput(tab);
    ui.handleInput(up); // alpha
    ui.handleInput(tab);
    ui.handleInput(tab); // draft
    assert.match(cockpitText(ui.render(120).join("\n"), 30000), /literal \/skill:not-expanded/);
    ui.handleInput(ctrlS);
    assert.equal(calls.sends.length, 1);
    assert.equal(calls.sends[0].message, "literal /skill:not-expanded");
    assert.equal(calls.sends[0].target.attemptId, "attempt-alpha");
    assert.match(ui.render(120).join("\n"), /queued.*receipt-1/);
    snapshots.get("alpha").attemptId = "new-attempt";
    ui.refresh();
    assert.doesNotMatch(ui.render(120).join("\n"), /literal/);
    ui.handleInput("new attempt draft");
    snapshots.get("alpha").attemptId = "attempt-alpha";
    ui.refresh();
    assert.doesNotMatch(ui.render(120).join("\n"), /new attempt draft/);
    ui.handleInput(tab);
    ui.handleInput(down);
    ui.handleInput(tab);
    ui.handleInput(tab);
    assert.match(cockpitText(ui.render(120).join("\n"), 30000), /beta draft/);
  } finally {
    ui.dispose();
  }
});

test("draft ownership survives attempt changes, transient read failure, disposal and reopening", () => {
  const drafts = new Map();
  const first = harness(drafts);
  const oldKey = JSON.stringify(["alpha", "dispatch-alpha", "attempt-alpha"]);
  const newKey = JSON.stringify(["alpha", "dispatch-alpha", "replacement"]);
  try {
    draft(first.ui, "original private draft");
    first.snapshots.get("alpha").attemptId = "replacement";
    first.ui.refresh();
    assert.equal(drafts.get(oldKey), "original private draft");
    first.ui.handleInput("replacement draft");
    first.calls.failRead = true;
    first.ui.refresh();
    first.ui.handleInput(" plus outage edit");
    first.calls.failRead = false;
    first.ui.refresh();
    assert.equal(drafts.get(newKey), "replacement draft plus outage edit");
    first.ui.handleInput(" plus dispose edit");
    first.ui.dispose();
    assert.equal(drafts.get(newKey), "replacement draft plus outage edit plus dispose edit");
    assert.equal(drafts.get(oldKey), "original private draft");
    const reopened = harness(drafts);
    try {
      assert.match(
        cockpitText(reopened.ui.render(120).join("\n"), 30000),
        /original private draft/,
      );
      reopened.snapshots.get("alpha").attemptId = "replacement";
      reopened.ui.refresh();
      assert.match(
        cockpitText(reopened.ui.render(120).join("\n"), 30000),
        /replacement draft plus outage edit plus dispose edit/,
      );
    } finally {
      reopened.ui.dispose();
    }
  } finally {
    first.ui.dispose();
  }
});

test("actual inline/fullscreen overlay compositor clips the manual timeline viewport exactly once", () => {
  const { ui, host } = harness();
  try {
    host.terminal.rows = 40;
    ui.handleInput(tab); // timeline
    for (const Host of [TuiMainScreen, TuiAltScreen]) {
      const nativeHost = new Host({ rows: 40, columns: 100, hideCursor() {} });
      nativeHost.stopped = true; // source-level compositor exercise; no terminal loop or writes
      const handle = nativeHost.showOverlay(ui, { width: 100, anchor: "top-left" });
      try {
        for (const [key, expected] of [
          ["\x1b[H", "event-alpha-0"],
          ["\x1b[F", "event-alpha-24"],
        ]) {
          ui.handleInput(key);
          const direct = ui.render(100);
          const composite = nativeHost.compositeOverlays([], 100, 40);
          assert.match(cockpitText(composite.join("\n"), 30000), new RegExp(expected));
          assert.deepEqual(
            composite.slice(0, direct.length).map((line) => cockpitText(line).trimEnd()),
            direct.map((line) => cockpitText(line).trimEnd()),
          );
        }
      } finally {
        handle.hide();
      }
    }
  } finally {
    ui.dispose();
  }
});

test("live timeline refreshes, selected details expand, pages scroll independently, unavailable steering never sends", () => {
  const { ui, calls, snapshots } = harness();
  try {
    ui.handleInput(tab); // timeline
    ui.handleInput(up);
    ui.handleInput(enter);
    assert.match(ui.render(100).join("\n"), /args\/result-23/);
    ui.handleInput("\x1b[5~"); // pageUp
    ui.render(100);
    ui.handleInput("\x1b[F"); // end
    snapshots.get("alpha").events.push({
      id: "new-live",
      timestamp: "12:01",
      kind: "assistant",
      text: "LIVE_NEW_MESSAGE",
    });
    snapshots.get("alpha").receipts = [
      { requestId: "req", status: "delivered", message: "guidance", updatedAt: "12:01" },
    ];
    ui.refresh();
    assert.match(ui.render(100).join("\n"), /LIVE_NEW_MESSAGE/);
    assert.match(ui.render(100).join("\n"), /Receipt req.*delivered/);
    snapshots.get("alpha").steeringSupported = false;
    snapshots.get("alpha").unavailableReason = "legacy child: read-only";
    ui.refresh();
    ui.handleInput(tab);
    ui.handleInput("draft remains");
    ui.handleInput(ctrlS);
    assert.equal(calls.sends.length, 0);
    assert.match(ui.render(100).join("\n"), /legacy child: read-only/);
  } finally {
    ui.dispose();
  }
});

test("cancel requires explicit confirmation, binds exact attempt; Escape only dismisses and disposes", () => {
  const { ui, calls } = harness();
  ui.handleInput(cancelKey);
  assert.equal(calls.cancels.length, 0);
  assert.match(ui.render(120).join("\n"), /Cancel alpha\?/);
  ui.handleInput(enter); // default is No
  assert.equal(calls.cancels.length, 0);
  ui.handleInput(cancelKey);
  ui.handleInput(down);
  ui.handleInput(enter);
  assert.equal(calls.cancels.length, 1);
  assert.deepEqual(calls.cancels[0], {
    sessionName: "alpha",
    dispatchId: "dispatch-alpha",
    attemptId: "attempt-alpha",
  });
  ui.handleInput(cancelKey);
  ui.handleInput("\x1b");
  assert.equal(calls.cancels.length, 1);
  assert.equal(calls.done, 1);
  const reads = calls.reads;
  ui.refresh();
  ui.handleInput(ctrlS);
  ui.dispose();
  assert.equal(calls.reads, reads);
  assert.deepEqual(ui.render(80), []);
});

test("adapter revalidates exact attempt + current parent/repo immediately before actions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cockpit-ui-ownership-"));
  const ctx = { cwd: process.cwd(), sessionKey: "parent" };
  const state = createSubagentState(dir);
  const source = createCockpitSource(state, ctx);
  const repo = process.cwd().split("/packages/")[0];
  const target = { sessionName: "alpha", dispatchId: "dispatch", attemptId: "attempt" };
  globalThis.__ascUiSteeringCalls = [];
  globalThis.__ascUiCancelCalls = [];
  try {
    await writeStatus(dir, "alpha", "running", new Date().toISOString(), "objective", {
      dispatchId: "dispatch",
      attemptId: "attempt",
      parentSessionKey: "parent",
      parentRepoRoot: repo,
    });
    assert.equal(source.send(target, "literal /command").ok, true);
    assert.equal(globalThis.__ascUiSteeringCalls[0].message, "literal /command");
    assert.equal(source.cancel(target).status, "cancel_requested");
    const cancellation = globalThis.__ascUiCancelCalls[0];
    assert.equal(cancellation.expectedAttemptId, "attempt");
    assert.equal(cancellation.expectedParentSessionKey, "parent");
    assert.equal(cancellation.expectedSessionName, "alpha");
    assert.equal(cancellation.parentRepoRoot, repo);
    assert.equal(cancellation.dispatchId, "dispatch");
    assert.equal(source.cancel({ ...target, attemptId: "replaced" }).status, "stale");
    await writeStatus(dir, "alpha", "running", new Date().toISOString(), "replacement", {
      dispatchId: "dispatch",
      attemptId: "replacement",
      parentSessionKey: "parent",
      parentRepoRoot: repo,
    });
    assert.equal(source.cancel(target).status, "stale");
    assert.equal(globalThis.__ascUiCancelCalls.length, 1);
    ctx.sessionKey = "changed-parent";
    assert.equal(source.send(target, "no").status, "stale");
    assert.equal(source.cancel(target).status, "stale");
    assert.equal(globalThis.__ascUiSteeringCalls.length, 1);
  } finally {
    delete globalThis.__ascUiSteeringCalls;
    delete globalThis.__ascUiCancelCalls;
    await rm(dir, { recursive: true, force: true });
  }
});

test("only explicit legacy diagnostic opens overlay; default/shortcut never mutate main editor", async () => {
  const handlers = new Map(),
    commands = new Map(),
    shortcuts = new Map();
  const pi = {
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, def) => commands.set(name, def),
    registerShortcut: (key, def) => shortcuts.set(key, def),
  };
  const state = {
    sessionsDir: join(tmpdir(), "nonexistent-cockpit-ui-test"),
    activeCount: 0,
    completedCount: 0,
    maxConcurrent: 5,
    reservedSessionNames: new Set(),
  };
  registerSubagentDashboard(pi, state);
  assert.ok(
    commands.has("subagents") &&
      commands.has("subagent-dashboard") &&
      commands.has("subagent-inspect"),
  );
  let custom = 0;
  const ctx = {
    mode: "tui",
    hasUI: true,
    cwd: process.cwd(),
    sessionKey: "parent",
    waitForIdle: () => {
      throw Error("must not wait");
    },
    ui: {
      custom: async (_factory, options) => {
        custom++;
        assert.equal(options.overlay, true);
      },
      setEditorText: () => {
        throw Error("main editor must not change");
      },
      notify: () => {},
    },
  };
  await commands.get("subagents").handler("running", ctx);
  await shortcuts.get("ctrl+alt+shift+s").handler(ctx);
  assert.equal(custom, 0);
  await commands.get("subagent-dashboard").handler("running", ctx);
  assert.equal(custom, 1);
  await commands.get("subagent-dashboard").handler("bad-filter", ctx);
  await commands.get("subagents").handler("", { ...ctx, mode: "rpc" });
  assert.equal(custom, 1);
  assert.equal(cockpitShortcut("ctrl+o"), undefined);
  assert.equal(cockpitShortcut("off"), undefined);
  assert.equal(cockpitShortcut("ctrl+alt+shift+d"), "ctrl+alt+shift+d");
});

test("poll preparation bounds text/details and preserves the newest live events", () => {
  const prepared = prepareCockpitSnapshot({
    sessionName: "alpha",
    status: "running",
    steeringSupported: false,
    receipts: [],
    events: Array.from({ length: 1000 }, (_, index) => ({
      id: String(index),
      timestamp: "now",
      kind: "tool",
      text: `newest-${index}${"x".repeat(8000)}`,
      detail: "result".repeat(8000),
    })),
  });
  assert.equal(prepared.events.length, 160);
  assert.ok(prepared.events.reduce((total, event) => total + event.text.length, 0) <= 32000);
  assert.ok(
    prepared.events.reduce((total, event) => total + (event.detail?.length ?? 0), 0) <= 32000,
  );
  assert.match(prepared.events.at(-1).text, /^newest-999/);
  assert.equal(prepared.truncated, true);
});

test("tiny terminal cannot confirm cancellation without visible choices", () => {
  const { ui, host, calls } = harness();
  try {
    ui.handleInput(cancelKey);
    host.terminal.rows = 3;
    ui.handleInput(down);
    ui.handleInput(enter);
    assert.equal(calls.cancels.length, 0);
    host.terminal.rows = 30;
    assert.match(ui.render(80).join("\n"), /Keep running/);
    ui.handleInput(down);
    ui.handleInput(enter);
    assert.equal(calls.cancels.length, 1);
  } finally {
    ui.dispose();
  }
});

test("local terminal escapes/control and bidi text are inert", () => {
  const text = cockpitText("\x1b[31mred\x1b[0m\x1b]0;owned\x07\u202eevil\x08");
  assert.equal(text, "redevil");
});

test("private Editor preserves multiline literal guidance and failed sends preserve the draft", () => {
  const { ui, calls, snapshots } = harness();
  try {
    draft(ui, "first line");
    ui.handleInput("\x1b[13;2u"); // Shift+Enter
    ui.handleInput("second line /literal-command");
    snapshots.get("alpha").status = "done";
    ui.refresh();
    ui.handleInput(ctrlS);
    assert.equal(calls.sends.length, 0);
    snapshots.get("alpha").status = "running";
    ui.refresh();
    ui.handleInput(ctrlS);
    assert.equal(calls.sends[0].message, "first line\nsecond line /literal-command");
  } finally {
    ui.dispose();
  }
});

test("popup polling timer clears once and late callbacks do no work after disposal", () => {
  const originalSet = globalThis.setInterval,
    originalClear = globalThis.clearInterval;
  let callback,
    clears = 0;
  const timer = { unref() {} };
  globalThis.setInterval = (fn) => {
    callback = fn;
    return timer;
  };
  globalThis.clearInterval = (value) => {
    assert.equal(value, timer);
    clears++;
  };
  try {
    const { ui, calls } = harness();
    callback();
    const reads = calls.reads;
    ui.dispose();
    ui.dispose();
    callback();
    assert.equal(clears, 1);
    assert.equal(calls.reads, reads);
  } finally {
    globalThis.setInterval = originalSet;
    globalThis.clearInterval = originalClear;
  }
});

test("unavailable snapshot source stays an explicit read-only popup, not a render failure", () => {
  const source = {
    rows: () => {
      throw Error("busy data source");
    },
  };
  const ui = new SubagentCockpitUI(
    { terminal: { rows: 30 }, requestRender() {} },
    theme,
    source,
    () => {},
  );
  try {
    assert.match(ui.render(80).join("\n"), /Unavailable:.*busy data source/);
  } finally {
    ui.dispose();
  }
});
