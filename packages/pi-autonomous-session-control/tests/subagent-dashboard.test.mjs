import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { registerSubagentDashboard } from "../extensions/self/subagent-dashboard.ts";
import { createSubagentState, getSessionStatusPath } from "../extensions/self/subagent-session.ts";

async function writeStatus(sessionsDir, sessionName, updatedAt, extras = {}) {
  await writeFile(
    getSessionStatusPath(sessionsDir, sessionName),
    JSON.stringify({
      sessionName,
      status: "done",
      pid: process.pid,
      ppid: process.ppid,
      createdAt: updatedAt,
      updatedAt,
      objective: "Review the current-session dashboard behavior.",
      ...extras,
    }),
  );
}

function createPiHarness() {
  const handlers = new Map();
  const commands = new Map();

  return {
    pi: {
      on(eventName, handler) {
        handlers.set(eventName, handler);
      },
      registerCommand(name, definition) {
        commands.set(name, definition);
      },
    },
    getHandler(eventName) {
      return handlers.get(eventName);
    },
  };
}

function createUiHarness(cwd = process.cwd()) {
  const widgetCalls = [];

  return {
    widgetCalls,
    ctx: {
      cwd,
      hasUI: true,
      sessionKey: "live-session-key",
      ui: {
        setWidget(key, content, options) {
          widgetCalls.push({ key, content, options });
        },
        async editor() {},
        notify() {},
      },
    },
  };
}

test("registerSubagentDashboard mounts the widget once and refreshes it in place", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-register-"));
  const intervalState = { callback: null, cleared: 0 };
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  globalThis.setInterval = (callback) => {
    intervalState.callback = callback;
    return { unref() {} };
  };
  globalThis.clearInterval = () => {
    intervalState.cleared += 1;
  };

  try {
    const repoRoot = resolve(process.cwd(), "../..");

    await writeStatus(
      sessionsDir,
      "reviewer-1",
      new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      {
        parentSessionKey: "live-session-key",
        parentRepoRoot: repoRoot,
      },
    );

    const { pi, getHandler } = createPiHarness();
    const uiHarness = createUiHarness();
    const state = createSubagentState(sessionsDir);
    let renderRequests = 0;
    const theme = {
      fg(_name, value) {
        return value;
      },
    };

    registerSubagentDashboard(pi, state);
    const sessionStart = getHandler("session_start");
    await sessionStart?.({}, uiHarness.ctx);

    assert.equal(uiHarness.widgetCalls.length, 1);
    assert.equal(uiHarness.widgetCalls[0].key, "subagent-ops-dashboard");
    assert.equal(typeof uiHarness.widgetCalls[0].content, "function");
    assert.equal(typeof intervalState.callback, "function");

    const component = uiHarness.widgetCalls[0].content(
      {
        requestRender() {
          renderRequests += 1;
        },
      },
      theme,
    );

    assert.ok(component.render(80).length > 0);

    intervalState.callback();
    intervalState.callback();

    assert.equal(uiHarness.widgetCalls.length, 1);
    assert.equal(renderRequests, 2);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("registerSubagentDashboard keeps the widget stable across one empty poll and hides only after the grace window", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-grace-"));
  const intervalState = { callback: null };
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalDateNow = Date.now;
  const baseNow = Date.parse("2026-04-07T10:00:05.000Z");

  globalThis.setInterval = (callback) => {
    intervalState.callback = callback;
    return { unref() {} };
  };
  globalThis.clearInterval = () => {};
  Date.now = () => baseNow;

  try {
    const repoRoot = resolve(process.cwd(), "../..");

    await writeStatus(sessionsDir, "reviewer-1", "2026-04-07T10:00:00.000Z", {
      parentSessionKey: "live-session-key",
      parentRepoRoot: repoRoot,
    });

    const { pi, getHandler } = createPiHarness();
    const uiHarness = createUiHarness();
    const state = createSubagentState(sessionsDir);
    const theme = {
      fg(_name, value) {
        return value;
      },
    };

    registerSubagentDashboard(pi, state);
    const sessionStart = getHandler("session_start");
    await sessionStart?.({}, uiHarness.ctx);

    const component = uiHarness.widgetCalls[0].content({ requestRender() {} }, theme);

    assert.ok(component.render(80).length > 0);

    uiHarness.ctx.sessionKey = undefined;
    Date.now = () => baseNow + 2_000;
    intervalState.callback();
    assert.ok(component.render(80).length > 0);

    Date.now = () => baseNow + 12_000;
    intervalState.callback();
    assert.deepEqual(component.render(80), []);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    Date.now = originalDateNow;
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("registerSubagentDashboard hides subagents from another repo even when the live session key matches", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-repo-scope-"));
  const intervalState = { callback: null };
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  globalThis.setInterval = (callback) => {
    intervalState.callback = callback;
    return { unref() {} };
  };
  globalThis.clearInterval = () => {};

  try {
    await writeStatus(sessionsDir, "reviewer-1", new Date().toISOString(), {
      parentSessionKey: "live-session-key",
      parentRepoRoot: "/tmp/other-repo",
    });

    const { pi, getHandler } = createPiHarness();
    const uiHarness = createUiHarness(process.cwd());
    const state = createSubagentState(sessionsDir);
    const theme = {
      fg(_name, value) {
        return value;
      },
    };

    registerSubagentDashboard(pi, state);
    const sessionStart = getHandler("session_start");
    await sessionStart?.({}, uiHarness.ctx);

    const component = uiHarness.widgetCalls[0].content({ requestRender() {} }, theme);
    assert.deepEqual(component.render(80), []);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("registerSubagentDashboard clears its timer and widget on session_shutdown", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dashboard-shutdown-"));
  const intervalState = { callback: null, cleared: 0 };
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  globalThis.setInterval = (callback) => {
    intervalState.callback = callback;
    return { unref() {} };
  };
  globalThis.clearInterval = () => {
    intervalState.cleared += 1;
  };

  try {
    await writeStatus(sessionsDir, "reviewer-1", new Date().toISOString(), {
      parentSessionKey: "live-session-key",
      parentRepoRoot: resolve(process.cwd(), "../.."),
    });

    const { pi, getHandler } = createPiHarness();
    const uiHarness = createUiHarness(process.cwd());
    const state = createSubagentState(sessionsDir);

    registerSubagentDashboard(pi, state);
    const sessionStart = getHandler("session_start");
    const sessionShutdown = getHandler("session_shutdown");
    await sessionStart?.({}, uiHarness.ctx);
    await sessionShutdown?.({}, uiHarness.ctx);

    assert.equal(intervalState.cleared, 1);
    assert.equal(uiHarness.widgetCalls.at(-1)?.key, "subagent-ops-dashboard");
    assert.equal(uiHarness.widgetCalls.at(-1)?.content, undefined);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
