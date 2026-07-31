// summary: verifies typed deferred/blocked visible-loop terminal outcomes, queue cancellation, and replay safety.
// read_when:
//   - changing visible-loop terminal disposition tools, records, prompt membranes, or restart behavior.
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  createVisibleLoopRunConfig,
  getVisibleLoopTerminalDispositionPath,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import {
  appendVisibleLoopStatus,
  writeVisibleLoopTerminalDisposition,
} from "../src/visibleLoopState.ts";
import {
  createContext,
  observeLatestVisibleLoopMessage,
  registerExtension,
} from "./sidequest-harness.mjs";

function terminalRequest(configPath, overrides = {}) {
  return {
    configPath,
    iteration: 1,
    disposition: "deferred",
    reason: "Owner decision is required before this slice becomes lawful.",
    items: [
      {
        kind: "decision",
        ref: "decision:release-policy",
        state: "waiting",
        nextAction: "Accept the release-policy decision, then launch a fresh bound loop.",
      },
    ],
    ...overrides,
  };
}

function readJsonLines(path) {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("typed defer stops the remaining queue without claiming completion and blocks replay", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-terminal-defer-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const extension = createSidequestExtension({ registerTools: true, env });
    const { commands, events, tools, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 2,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "defer terminal test" },
      prompts: ["implement bounded slice", "review bounded slice", "refresh posture"],
      runId: "visible-loop-terminal-defer",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    assert.equal(userMessages.length, 1);
    assert.match(userMessages[0].message, /visible_loop_child_defer/);
    assert.match(
      userMessages[0].message,
      new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);

    const result = await tools
      .get("visible_loop_child_defer")
      .execute("defer-terminal", terminalRequest(configPath), null, null, harness.ctx);
    assert.equal(result.details.accepted, true, result.details.reason);
    assert.equal(result.details.disposition, "deferred");
    assert.equal(result.details.remainingPromptCount, 3);
    assert.equal(result.terminate, true);
    assert.match(result.details.relaunchGuidance, /fresh loop/);

    await events.get("agent_settled")[0]({}, harness.ctx);
    assert.equal(userMessages.length, 1, "terminal disposition must cancel all later prompts");

    const terminalPath = getVisibleLoopTerminalDispositionPath(config, env);
    assert.equal(result.details.terminalRecordPath, terminalPath);
    assert.equal(statSync(terminalPath).mode & 0o777, 0o600);
    const terminal = JSON.parse(readFileSync(terminalPath, "utf8"));
    assert.equal(terminal.disposition, "deferred");
    assert.equal(terminal.authority, "local_loop_control_only_non_authoritative");
    assert.deepEqual(
      terminal.items.map((item) => item.ref),
      ["decision:release-policy"],
    );

    const status = readJsonLines(result.details.statusPath);
    assert.ok(status.some((entry) => entry.event === "loop_terminal_disposition_recorded"));
    assert.equal(
      status.some((entry) => entry.event === "iteration_completed"),
      false,
    );
    assert.equal(
      status.some((entry) => entry.event === "loop_completed"),
      false,
    );

    const completion = await tools
      .get("visible_loop_child_complete")
      .execute("terminal-completion", { configPath, iteration: 1 }, null, null, harness.ctx);
    assert.equal(completion.details.accepted, false);
    assert.match(completion.details.reason, /terminal disposition deferred/);

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    assert.equal(userMessages.length, 1, "terminal config must not restart or redeliver prompts");
    assert.match(harness.notifications.at(-1).message, /already deferred/);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("blocked disposition can close an ineligible completion checkpoint without false success", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-terminal-checkpoint-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const extension = createSidequestExtension({ registerTools: true, env });
    const { commands, events, tools, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "blocked checkpoint test" },
      prompts: ["perform work if lawful"],
      runId: "visible-loop-terminal-checkpoint",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);

    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);
    await events.get("agent_settled")[0]({}, harness.ctx);
    assert.equal(userMessages.length, 2);
    assert.match(userMessages[1].message, /internal completion checkpoint/i);
    assert.match(userMessages[1].message, /visible_loop_child_defer/);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);

    const result = await tools.get("visible_loop_child_defer").execute(
      "blocked-terminal",
      terminalRequest(configPath, {
        disposition: "blocked",
        reason: "The prior commit prompt stopped with no tracked implementation.",
        items: [
          {
            kind: "owner_gate",
            ref: "git:tracked-slice",
            state: "blocked",
            nextAction: "Launch a fresh loop only after an authorized tracked slice exists.",
          },
        ],
      }),
      null,
      null,
      harness.ctx,
    );
    assert.equal(result.details.accepted, true);
    assert.equal(result.details.disposition, "blocked");
    assert.equal(result.details.remainingPromptCount, 0);
    assert.equal(result.terminate, true);
    await events.get("agent_settled")[0]({}, harness.ctx);
    assert.equal(userMessages.length, 2);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("rejected terminal requests fail closed and do not release another prompt", async () => {
  const cases = [
    {
      name: "escaped",
      request(_configPath) {
        return terminalRequest("/tmp/outside-visible-loop.json");
      },
      expected: /outside visible-loop state directory/,
    },
    {
      name: "multiline",
      request(configPath) {
        return terminalRequest(configPath, { reason: "owner gate\nsecret-shaped continuation" });
      },
      expected: /single-line/,
    },
    {
      name: "stale",
      request(configPath) {
        return terminalRequest(configPath, { iteration: 2 });
      },
      expected: /stale or out-of-order/,
    },
    {
      name: "huge",
      request(configPath) {
        return terminalRequest(configPath, { reason: "x".repeat(501) });
      },
      expected: /bounded single-line/,
    },
    {
      name: "duplicate-refs",
      request(configPath) {
        const item = terminalRequest(configPath).items[0];
        return terminalRequest(configPath, { items: [item, { ...item }] });
      },
      expected: /refs must be unique/,
    },
  ];

  for (const scenario of cases) {
    const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-terminal-${scenario.name}-`);
    try {
      const env = { XDG_STATE_HOME: stateHome };
      const extension = createSidequestExtension({ registerTools: true, env });
      const { commands, events, tools, userMessages } = registerExtension(extension);
      const harness = createContext({ cwd: `${stateHome}/repo` });
      const config = createVisibleLoopRunConfig({
        loopCount: 1,
        cwd: harness.ctx.cwd,
        reportBack: "none",
        executionBinding: { mode: "operator_objective", objective: scenario.name },
        prompts: ["inspect authority", "must never run"],
        runId: `visible-loop-terminal-${scenario.name}`,
      });
      const configPath = writeVisibleLoopRunConfig(config, env);
      await commands.get("visible-loop-child").handler(configPath, harness.ctx);
      await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
      await events.get("agent_start")[0]({}, harness.ctx);

      const result = await tools
        .get("visible_loop_child_defer")
        .execute(
          `terminal-${scenario.name}`,
          scenario.request(configPath),
          null,
          null,
          harness.ctx,
        );
      assert.equal(result.details.accepted, false);
      assert.equal(result.details.queueStopped, true);
      assert.equal(result.details.disposition, "blocked");
      assert.equal(result.terminate, true);
      assert.match(result.details.reason, scenario.expected);
      await events.get("agent_settled")[0]({}, harness.ctx);
      assert.equal(userMessages.length, 1, `${scenario.name} rejection must stop the queue`);
      const terminal = JSON.parse(
        readFileSync(getVisibleLoopTerminalDispositionPath(config, env), "utf8"),
      );
      assert.equal(terminal.disposition, "blocked");
      assert.match(terminal.reason, /request rejected/);
    } finally {
      rmSync(stateHome, { recursive: true, force: true });
    }
  }
});

test("duplicate terminal disposition is rejected without replacing the first record", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-terminal-duplicate-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const extension = createSidequestExtension({ registerTools: true, env });
    const { commands, events, tools, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "duplicate terminal" },
      prompts: ["inspect authority"],
      runId: "visible-loop-terminal-duplicate",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);
    const tool = tools.get("visible_loop_child_defer");
    const accepted = await tool.execute(
      "terminal-valid",
      terminalRequest(configPath),
      null,
      null,
      harness.ctx,
    );
    assert.equal(accepted.details.accepted, true);
    const firstBytes = readFileSync(accepted.details.terminalRecordPath, "utf8");
    const duplicate = await tool.execute(
      "terminal-duplicate",
      terminalRequest(configPath, { reason: "must not replace" }),
      null,
      null,
      harness.ctx,
    );
    assert.equal(duplicate.details.accepted, false);
    assert.match(duplicate.details.reason, /already has terminal disposition deferred/);
    assert.equal(readFileSync(accepted.details.terminalRecordPath, "utf8"), firstBytes);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("terminal and completion requests serialize so only one transition can win", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-terminal-race-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const extension = createSidequestExtension({ registerTools: true, env });
    const { commands, events, tools, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "terminal race" },
      prompts: ["perform work"],
      runId: "visible-loop-terminal-race",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);
    await events.get("agent_settled")[0]({}, harness.ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);

    const [terminal, completion] = await Promise.all([
      tools
        .get("visible_loop_child_defer")
        .execute("race-terminal", terminalRequest(configPath), null, null, harness.ctx),
      tools
        .get("visible_loop_child_complete")
        .execute("race-completion", { configPath, iteration: 1 }, null, null, harness.ctx),
    ]);
    assert.equal(terminal.details.accepted, true);
    assert.equal(completion.details.accepted, false);
    assert.match(completion.details.reason, /transition lock unavailable|terminal disposition/);
    const status = readJsonLines(terminal.details.statusPath);
    assert.equal(
      status.some((entry) => entry.event === "iteration_completed"),
      false,
    );
    assert.equal(
      status.some((entry) => entry.event === "loop_completed"),
      false,
    );
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("pathless completion checks an existing terminal record", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-terminal-pathless-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const extension = createSidequestExtension({ registerTools: true, env });
    const { commands, events, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "pathless terminal" },
      prompts: ["perform work"],
      runId: "visible-loop-terminal-pathless",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);
    writeVisibleLoopTerminalDisposition(
      config,
      {
        schemaVersion: 1,
        runId: config.runId,
        iteration: 1,
        disposition: "blocked",
        reason: "Concurrent owner gate appeared.",
        items: [
          {
            kind: "owner_gate",
            ref: "decision:concurrent-gate",
            state: "blocked",
            nextAction: "Resolve the owner gate and launch a fresh loop.",
          },
        ],
        createdAt: new Date().toISOString(),
        authority: "local_loop_control_only_non_authoritative",
      },
      env,
    );

    await commands.get("visible-loop-child-complete").handler("", harness.ctx);
    assert.match(harness.notifications.at(-1).message, /terminal disposition blocked/);
    const statusPath = `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.status.jsonl`;
    const status = readJsonLines(statusPath);
    assert.equal(
      status.some((entry) => entry.event === "iteration_completed"),
      false,
    );
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("an unavailable transition lock stops the queue without stealing the lock", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-terminal-lock-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const extension = createSidequestExtension({ registerTools: true, env });
    const { commands, events, tools, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "transition lock" },
      prompts: ["inspect authority", "must never run"],
      runId: "visible-loop-terminal-lock",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);
    const lockPath = `${stateHome}/pi-little-helpers/visible-loop/${config.runId}.transition.lock`;
    writeFileSync(lockPath, "owned by another transition\n", { mode: 0o600 });

    const result = await tools
      .get("visible_loop_child_defer")
      .execute("locked-terminal", terminalRequest(configPath), null, null, harness.ctx);
    assert.equal(result.details.accepted, false);
    assert.equal(result.details.queueStopped, true);
    assert.equal(result.terminate, true);
    assert.match(result.details.reason, /transition lock unavailable/);
    assert.equal(readFileSync(lockPath, "utf8"), "owned by another transition\n");
    await events.get("agent_settled")[0]({}, harness.ctx);
    assert.equal(userMessages.length, 1);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("a terminal-path symlink is never replaced or followed for writes", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-terminal-symlink-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const extension = createSidequestExtension({ registerTools: true, env });
    const { commands, events, tools, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "terminal symlink" },
      prompts: ["inspect authority", "must never run"],
      runId: "visible-loop-terminal-symlink",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);
    const externalPath = `${stateHome}/external-owner-file.txt`;
    const externalBytes = "external bytes must survive\n";
    writeFileSync(externalPath, externalBytes, "utf8");
    symlinkSync(externalPath, getVisibleLoopTerminalDispositionPath(config, env));

    const result = await tools
      .get("visible_loop_child_defer")
      .execute("symlink-terminal", terminalRequest(configPath), null, null, harness.ctx);
    assert.equal(result.details.accepted, false);
    assert.equal(result.details.queueStopped, true);
    assert.equal(result.terminate, true);
    assert.match(result.details.reason, /terminal disposition/);
    assert.equal(readFileSync(externalPath, "utf8"), externalBytes);
    await events.get("agent_settled")[0]({}, harness.ctx);
    assert.equal(userMessages.length, 1);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("a stale process cannot terminalize an iteration already completed elsewhere", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-terminal-stale-process-`);
  try {
    const env = { XDG_STATE_HOME: stateHome };
    const extension = createSidequestExtension({ registerTools: true, env });
    const { commands, events, tools, userMessages } = registerExtension(extension);
    const harness = createContext({ cwd: `${stateHome}/repo` });
    const config = createVisibleLoopRunConfig({
      loopCount: 2,
      cwd: harness.ctx.cwd,
      reportBack: "none",
      executionBinding: { mode: "operator_objective", objective: "stale process" },
      prompts: ["inspect authority", "must never run"],
      runId: "visible-loop-terminal-stale-process",
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    await commands.get("visible-loop-child").handler(configPath, harness.ctx);
    await observeLatestVisibleLoopMessage(events, userMessages, harness.ctx);
    await events.get("agent_start")[0]({}, harness.ctx);
    appendVisibleLoopStatus(
      config,
      {
        event: "iteration_completed",
        source: "simulated_concurrent_process",
        completedIterations: 1,
      },
      env,
    );

    const result = await tools
      .get("visible_loop_child_defer")
      .execute("stale-process-terminal", terminalRequest(configPath), null, null, harness.ctx);
    assert.equal(result.details.accepted, false);
    assert.equal(result.details.queueStopped, true);
    assert.equal(result.terminate, true);
    assert.match(result.details.reason, /iteration already completed by another transition/);
    assert.equal(existsSync(getVisibleLoopTerminalDispositionPath(config, env)), false);
    await events.get("agent_settled")[0]({}, harness.ctx);
    assert.equal(userMessages.length, 1);
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});
