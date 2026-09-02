// summary: verifies private, grouped, fail-open ASC Ghostty observer state handling.
// read_when:
//   - changing ASC observer event parsing, launch policy, grouping, or private state files.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ASC_EXECUTION_OBSERVATION_EVENT,
  ASC_EXECUTION_OBSERVER_STATE_SCHEMA,
  createAscExecutionObserverController,
  resolveAscObserverPolicy,
} from "../src/ascExecutionObserver.ts";

function progressEvent(overrides = {}) {
  return {
    schema: "asc.execution_observation.v1",
    event: "dispatch_progress",
    observedAt: "2026-08-04T01:00:00.000Z",
    producer: "loop_execute",
    cwd: "/repo",
    group: { id: "transcendent-123", kind: "loop", label: "TRANSCENDENT loop" },
    phase: {
      name: "first-100x",
      index: 2,
      count: 8,
      agent: "builder",
      cognitiveTool: "nexus",
    },
    dispatch: {
      dispatchId: "dispatch-1",
      attemptId: "attempt-1",
      profile: "custom",
    },
    progress: {
      status: "running",
      phase: "running",
      sequence: 4,
      lastActivityAt: 1_700_000_000_000,
      latestTool: "edit",
      usage: {
        turns: 4,
        input: 10,
        output: 20,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0.01,
        contextTokens: 30,
      },
    },
    objective: "must not persist",
    fullOutput: "must not persist",
    ...overrides,
  };
}

function terminalEvent(event = "dispatch_terminal", overrides = {}) {
  return {
    ...progressEvent(),
    event,
    progress: undefined,
    terminal: {
      ok: true,
      status: "done",
      effectDisposition: "settled",
      elapsedMs: 12_000,
    },
    ...overrides,
  };
}

function interactiveHost(overrides = {}) {
  return { mode: "tui", hasUI: true, cwd: "/repo", ...overrides };
}

test("ASC observer protocol event name stays aligned with producers", () => {
  assert.equal(ASC_EXECUTION_OBSERVATION_EVENT, "asc:execution-observation:v1");
});

test("ASC observer suppresses unchanged progress rewrites", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-unchanged-"));
  let now = 1_700_000_001_000;
  try {
    const controller = createAscExecutionObserverController({
      env: { TERM_PROGRAM: "ghostty", PI_ASC_OBSERVER_STATE_DIR: root },
      stateRoot: root,
      now: () => now,
      async launch() {
        return { ok: true, launchMode: "tab" };
      },
    });
    controller.setHostContext(interactiveHost({ sessionId: "unchanged-session" }));
    controller.handle(progressEvent());
    await controller.flush();
    const statePath = controller.statePathFor("transcendent-123");
    const first = readFileSync(statePath, "utf8");

    now += 60_000;
    controller.handle(progressEvent());
    await controller.flush();
    assert.equal(readFileSync(statePath, "utf8"), first);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ASC observer launches once per loop group and persists only bounded telemetry", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-"));
  const launches = [];
  try {
    const controller = createAscExecutionObserverController({
      env: { TERM_PROGRAM: "ghostty", PI_ASC_OBSERVER_STATE_DIR: root },
      stateRoot: root,
      processId: process.pid,
      now: () => 1_700_000_001_000,
      async launch(request) {
        launches.push(request);
        return { ok: true, launchMode: "tab", note: "current Ghostty tab" };
      },
    });
    controller.setHostContext(interactiveHost({ sessionId: "session-1" }));

    controller.handle(progressEvent());
    controller.handle(
      progressEvent({
        progress: { ...progressEvent().progress, sequence: 5, latestTool: "bash" },
      }),
    );
    controller.handle(terminalEvent());
    controller.handle(terminalEvent("group_terminal", { phase: undefined, dispatch: undefined }));
    await controller.flush();

    assert.equal(launches.length, 1);
    assert.ok(launches[0].controllerInstanceId);
    const statePath = controller.statePathFor("transcendent-123");
    assert.equal(statePath.includes("transcendent-123"), false);
    assert.equal(statSync(statePath).mode & 0o777, 0o600);
    const text = readFileSync(statePath, "utf8");
    const state = JSON.parse(text);
    assert.equal(state.schema, ASC_EXECUTION_OBSERVER_STATE_SCHEMA);
    assert.equal(state.status, "done");
    assert.equal(state.lastObservationAt, 1_700_000_001_000);
    assert.equal(state.terminal.ok, true);
    assert.equal(state.terminal.effectDisposition, "settled");
    assert.equal(state.phases.length, 1);
    assert.equal(state.phases[0].status, "done");
    assert.equal(state.phases[0].effectDisposition, "settled");
    assert.equal(state.observer.launchStatus, "launched");
    assert.equal(text.includes("must not persist"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("one loop phase terminal does not terminalize the observer group", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-"));
  try {
    const controller = createAscExecutionObserverController({
      env: { TERM_PROGRAM: "ghostty" },
      stateRoot: root,
      async launch() {
        return { ok: true, launchMode: "tab" };
      },
    });
    controller.setHostContext(interactiveHost({ sessionId: "session-2" }));
    controller.handle(progressEvent());
    controller.handle(terminalEvent());
    await controller.flush();

    const state = JSON.parse(readFileSync(controller.statePathFor("transcendent-123"), "utf8"));
    assert.equal(state.terminal, undefined);
    assert.equal(state.phases[0].status, "done");
    assert.equal(state.phases[0].effectDisposition, "settled");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resumed progress clears terminal state and its expiry deadline", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-"));
  let clock = 1_700_000_001_000;
  let launches = 0;
  try {
    const controller = createAscExecutionObserverController({
      env: { TERM_PROGRAM: "ghostty" },
      stateRoot: root,
      now: () => clock,
      async launch() {
        launches += 1;
        return { ok: true, launchMode: "tab" };
      },
    });
    controller.setHostContext(interactiveHost());
    controller.handle(progressEvent());
    controller.handle(terminalEvent("group_terminal", { phase: undefined, dispatch: undefined }));
    await controller.flush();

    clock += 1_000;
    controller.handle(progressEvent({ progress: { ...progressEvent().progress, sequence: 8 } }));
    await controller.flush();

    clock += 10 * 60 * 1000;
    controller.handle(progressEvent({ progress: { ...progressEvent().progress, sequence: 9 } }));
    await controller.flush();

    const state = JSON.parse(readFileSync(controller.statePathFor("transcendent-123"), "utf8"));
    assert.equal(state.status, "running");
    assert.equal(state.terminal, undefined);
    assert.equal(launches, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("direct dispatch terminal events terminalize their own observer group", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-"));
  try {
    const controller = createAscExecutionObserverController({
      env: { TERM_PROGRAM: "ghostty" },
      stateRoot: root,
      async launch() {
        return { ok: true, launchMode: "tab" };
      },
    });
    controller.setHostContext(interactiveHost());
    const direct = {
      ...progressEvent(),
      producer: "dispatch_subagent",
      group: { id: "direct-1", kind: "dispatch", label: "Dispatch · reviewer" },
      phase: undefined,
    };
    controller.handle(direct);
    controller.handle({
      ...terminalEvent(),
      producer: "dispatch_subagent",
      group: direct.group,
      phase: undefined,
    });
    await controller.flush();

    const statePath = controller.statePathFor("direct-1", "dispatch_subagent", "dispatch");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(state.terminal.status, "done");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("headless, RPC, non-Ghostty auto, and explicitly disabled sessions have no observer effects", async () => {
  for (const variant of [
    { env: { TERM_PROGRAM: "ghostty" }, mode: "tui", hasUI: false },
    { env: { TERM_PROGRAM: "ghostty" }, mode: "rpc", hasUI: true },
    {
      env: { TERM_PROGRAM: "ghostty", PI_ASC_OBSERVER: "off" },
      mode: "tui",
      hasUI: true,
    },
    { env: {}, mode: "tui", hasUI: true },
  ]) {
    const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-"));
    let launches = 0;
    try {
      const controller = createAscExecutionObserverController({
        env: variant.env,
        stateRoot: root,
        async launch() {
          launches += 1;
          return { ok: true };
        },
      });
      controller.setHostContext({ mode: variant.mode, hasUI: variant.hasUI, cwd: "/repo" });
      controller.handle(progressEvent());
      await controller.flush();
      assert.equal(launches, 0);
      assert.throws(() => statSync(controller.statePathFor("transcendent-123")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("a rejected observer launch is recorded and reported exactly once", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-"));
  const failures = [];
  let launchAttempts = 0;
  try {
    const controller = createAscExecutionObserverController({
      env: { TERM_PROGRAM: "ghostty" },
      stateRoot: root,
      async launch() {
        launchAttempts += 1;
        throw new Error("Ghostty rejected launch");
      },
      onLaunchFailure(message) {
        failures.push(message);
      },
    });
    controller.setHostContext(interactiveHost());
    controller.handle(progressEvent());
    controller.handle(progressEvent({ progress: { ...progressEvent().progress, sequence: 5 } }));
    await controller.flush();

    const state = JSON.parse(readFileSync(controller.statePathFor("transcendent-123"), "utf8"));
    assert.equal(state.observer.launchStatus, "failed");
    assert.equal(launchAttempts, 1);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /execution continues headlessly/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("observer rejects foreign cwd, incompatible producer/group, and oversized group identity", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-"));
  let launches = 0;
  try {
    const controller = createAscExecutionObserverController({
      env: { TERM_PROGRAM: "ghostty" },
      stateRoot: root,
      async launch() {
        launches += 1;
        return { ok: true };
      },
    });
    controller.setHostContext(interactiveHost());
    controller.handle({ ...progressEvent(), schema: "wrong" });
    controller.handle({ ...progressEvent(), cwd: "/other-repo" });
    controller.handle({ ...progressEvent(), producer: "dispatch_subagent" });
    controller.handle({
      ...progressEvent(),
      group: { ...progressEvent().group, id: "x".repeat(161) },
    });
    controller.handle({ ...progressEvent(), progress: undefined, fullOutput: "raw output" });
    await controller.flush();
    assert.equal(launches, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("controller disposal marks snapshots inactive and drops future events", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-"));
  let launches = 0;
  try {
    const controller = createAscExecutionObserverController({
      env: { TERM_PROGRAM: "ghostty" },
      stateRoot: root,
      async launch() {
        launches += 1;
        return { ok: true };
      },
    });
    controller.setHostContext(interactiveHost());
    controller.handle(progressEvent());
    await controller.flush();
    await controller.dispose();
    controller.handle(progressEvent({ group: { ...progressEvent().group, id: "after-dispose" } }));
    await controller.flush();

    const state = JSON.parse(readFileSync(controller.statePathFor("transcendent-123"), "utf8"));
    assert.equal(state.controllerActive, false);
    assert.equal(launches, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("expired terminal groups are pruned before saturated-capacity admission", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-retention-"));
  let clock = 1_700_000_001_000;
  let launches = 0;
  try {
    const controller = createAscExecutionObserverController({
      env: { TERM_PROGRAM: "ghostty" },
      stateRoot: root,
      now: () => clock,
      async launch() {
        launches += 1;
        return { ok: true, launchMode: "tab" };
      },
    });
    controller.setHostContext(interactiveHost({ sessionId: "retention-session" }));

    for (let index = 0; index < 128; index += 1) {
      const group = {
        id: `dispatch-retention-${index}`,
        kind: "dispatch",
        label: `Dispatch ${index}`,
      };
      const progress = {
        ...progressEvent(),
        producer: "dispatch_subagent",
        group,
        phase: undefined,
        dispatch: {
          dispatchId: `dispatch-${index}`,
          attemptId: `attempt-${index}`,
          profile: "minimal",
        },
      };
      controller.handle(progress);
      controller.handle({
        ...progress,
        event: "dispatch_terminal",
        progress: undefined,
        terminal: { ok: true, status: "done", effectDisposition: "settled" },
      });
    }
    await controller.flush();
    assert.equal(launches, 128);

    clock += 10 * 60 * 1000 + 1;
    const nextGroup = {
      id: "dispatch-after-retention",
      kind: "dispatch",
      label: "Dispatch after retention",
    };
    controller.handle({
      ...progressEvent(),
      producer: "dispatch_subagent",
      group: nextGroup,
      phase: undefined,
      dispatch: {
        dispatchId: "dispatch-after-retention",
        attemptId: "attempt-after-retention",
        profile: "minimal",
      },
    });
    await controller.flush();

    assert.equal(launches, 129);
    assert.equal(
      statSync(controller.statePathFor(nextGroup.id, "dispatch_subagent", "dispatch")).isFile(),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("capacity admission counts queued retained groups only once", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-capacity-"));
  let launches = 0;
  try {
    const controller = createAscExecutionObserverController({
      env: { TERM_PROGRAM: "ghostty" },
      stateRoot: root,
      async launch() {
        launches += 1;
        return { ok: true, launchMode: "tab" };
      },
    });
    controller.setHostContext(interactiveHost({ sessionId: "capacity-session" }));

    for (let index = 0; index < 127; index += 1) {
      controller.handle(
        progressEvent({
          group: { id: `capacity-${index}`, kind: "loop", label: `Loop ${index}` },
          dispatch: {
            dispatchId: `dispatch-${index}`,
            attemptId: `attempt-${index}`,
            profile: "minimal",
          },
        }),
      );
    }
    await controller.flush();
    assert.equal(launches, 127);

    controller.handle(
      progressEvent({
        group: { id: "capacity-0", kind: "loop", label: "Loop 0" },
        progress: { ...progressEvent().progress, sequence: 5 },
      }),
    );
    controller.handle(
      progressEvent({
        group: { id: "capacity-127", kind: "loop", label: "Loop 127" },
        dispatch: {
          dispatchId: "dispatch-127",
          attemptId: "attempt-127",
          profile: "minimal",
        },
      }),
    );
    await controller.flush();

    assert.equal(launches, 128);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("observer policy supports automatic Ghostty and explicit override modes", () => {
  assert.equal(resolveAscObserverPolicy({}), "auto");
  assert.equal(resolveAscObserverPolicy({ PI_ASC_OBSERVER: "ghostty" }), "ghostty");
  assert.equal(resolveAscObserverPolicy({ PI_ASC_OBSERVER: "0" }), "off");
});

test("observer renderer classifies prolonged semantic quiet without cancelling", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-render-"));
  const statePath = join(root, "state.json");
  const scriptPath = new URL("../scripts/asc-execution-observer.mjs", import.meta.url);
  const now = Date.now();
  const controllerInstanceId = "renderer-test-instance";
  writeFileSync(
    statePath,
    `${JSON.stringify({
      schema: ASC_EXECUTION_OBSERVER_STATE_SCHEMA,
      group: { id: "render-test", kind: "loop", label: "Render test" },
      producer: "loop_execute",
      cwd: "/repo",
      ownerPid: process.pid,
      controllerInstanceId,
      controllerActive: true,
      createdAt: new Date(now - 20_000).toISOString(),
      updatedAt: new Date(now).toISOString(),
      lastObservationAt: now,
      status: "running",
      lastActivityAt: now - 10_000,
      activeDispatch: { latestTool: "bash", dispatchId: "dispatch-render" },
      phases: [{ name: "inspect", index: 1, count: 2, status: "running", agent: "reviewer" }],
      observer: { launchStatus: "launched", launchMode: "tab" },
      notice:
        "Read-only observer. ASC remains execution truth; closing this tab does not cancel work.",
    })}\n`,
    { mode: 0o600 },
  );

  const child = spawn(
    process.execPath,
    [scriptPath.pathname, "--state", statePath, "--controller-instance", controllerInstanceId],
    {
      env: {
        ...process.env,
        PI_ASC_OBSERVER_QUIET_MS: "10",
        PI_ASC_OBSERVER_STALLED_MS: "20",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (output.includes("suspected stall")) child.kill("SIGTERM");
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 2_000);
  try {
    await once(child, "close");
    assert.match(output, /suspected stall — inspect before cancelling/);
    assert.match(output, /telemetry heartbeat:/);
    assert.match(output, /Closing this tab does not cancel the agent/);
    assert.match(output, /latest tool: bash/);
  } finally {
    clearTimeout(timeout);
    rmSync(root, { recursive: true, force: true });
  }
});

test("observer reports an expired renewable telemetry lease without cancelling", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-lease-"));
  const statePath = join(root, "state.json");
  const scriptPath = new URL("../scripts/asc-execution-observer.mjs", import.meta.url);
  const now = Date.now();
  const controllerInstanceId = "renderer-lease-instance";
  writeFileSync(
    statePath,
    `${JSON.stringify({
      schema: ASC_EXECUTION_OBSERVER_STATE_SCHEMA,
      group: { id: "lease-test", kind: "dispatch", label: "Lease test" },
      producer: "dispatch_subagent",
      cwd: "/repo",
      ownerPid: process.pid,
      controllerInstanceId,
      controllerActive: true,
      createdAt: new Date(now - 20_000).toISOString(),
      updatedAt: new Date(now).toISOString(),
      lastObservationAt: now - 10_000,
      status: "running",
      lastActivityAt: now,
      phases: [],
      observer: { launchStatus: "launched", launchMode: "tab" },
      notice:
        "Read-only observer. ASC remains execution truth; closing this tab does not cancel work.",
    })}\n`,
    { mode: 0o600 },
  );

  const child = spawn(
    process.execPath,
    [scriptPath.pathname, "--state", statePath, "--controller-instance", controllerInstanceId],
    {
      env: { ...process.env, PI_ASC_OBSERVER_LIVENESS_LEASE_MS: "10" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (output.includes("telemetry lease expired")) child.kill("SIGTERM");
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 2_000);
  try {
    await once(child, "close");
    assert.match(output, /telemetry lease expired — execution truth remains ASC/);
    assert.match(output, /Closing this tab does not cancel the agent/);
  } finally {
    clearTimeout(timeout);
    rmSync(root, { recursive: true, force: true });
  }
});
