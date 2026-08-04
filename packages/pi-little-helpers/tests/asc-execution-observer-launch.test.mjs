// summary: proves sidequest owns automatic Ghostty launch for ASC observation groups without replacing execution.
// read_when:
//   - changing sidequest event-bus wiring, Ghostty observer command launch, or duplicate-listener policy.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSidequestExtension } from "../extensions/sidequest.ts";
import { ASC_EXECUTION_OBSERVATION_EVENT } from "../src/ascExecutionObserver.ts";
import { createContext, registerExtension } from "./sidequest-harness.mjs";

function observation(sequence = 1) {
  return {
    schema: "asc.execution_observation.v1",
    event: "dispatch_progress",
    observedAt: new Date().toISOString(),
    producer: "loop_execute",
    cwd: "/repo",
    group: { id: "transcendent-visible-1", kind: "loop", label: "TRANSCENDENT loop" },
    phase: {
      name: "diagnose",
      index: 1,
      count: 8,
      agent: "scout",
      cognitiveTool: "first-principles",
    },
    dispatch: {
      dispatchId: "dispatch-visible-1",
      attemptId: "attempt-visible-1",
      profile: "custom",
    },
    progress: {
      status: "running",
      phase: "running",
      sequence,
      lastActivityAt: Date.now(),
      latestTool: "read",
    },
  };
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  assert.fail("timed out waiting for observer launch");
}

test("ASC observation opens one read-only Ghostty command tab per logical loop group", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-launch-"));
  const calls = [];
  try {
    const extension = createSidequestExtension({
      env: {
        TERM_PROGRAM: "ghostty",
        PI_ASC_OBSERVER_STATE_DIR: root,
        PI_SIDEQUEST_LAUNCH_STAGGER_MS: "0",
      },
      ascObserverStateRoot: root,
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
      async exec(command, args) {
        calls.push({ command, args });
        if (command === "/usr/bin/ghostty" && args[0] === "+help") {
          return { code: 0, stdout: "Available actions:\n  +new-tab\n" };
        }
        if (command === "/usr/bin/ghostty" && args[0] === "+new-tab") {
          return { code: 0, stdout: "" };
        }
        throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
      },
    });
    const harness = registerExtension(extension);
    const { ctx } = createContext({ cwd: "/repo", sessionId: "controller-session" });
    for (const handler of harness.events.get("session_start") ?? []) {
      await handler({ type: "session_start", reason: "startup" }, ctx);
    }

    for (const handler of harness.busEvents.get(ASC_EXECUTION_OBSERVATION_EVENT) ?? []) {
      handler(observation(1));
      handler(observation(2));
    }
    await waitFor(() => calls.some((call) => call.args[0] === "+new-tab"));
    await new Promise((resolve) => setTimeout(resolve, 30));

    const launches = calls.filter((call) => call.args[0] === "+new-tab");
    assert.equal(launches.length, 1);
    const args = launches[0].args;
    assert.ok(args.includes(process.execPath));
    assert.ok(args.some((value) => value.endsWith("scripts/asc-execution-observer.mjs")));
    assert.ok(args.includes("--state"));
    assert.ok(args.includes("--controller-instance"));
    const statePath = args[args.indexOf("--state") + 1];
    const controllerInstanceId = args[args.indexOf("--controller-instance") + 1];
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(state.group.id, "transcendent-visible-1");
    assert.equal(state.controllerInstanceId, controllerInstanceId);
    assert.equal(state.observer.launchStatus, "launched");
    assert.match(state.notice, /closing this tab does not cancel work/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("headless Pi sessions keep ASC execution headless even when Ghostty env is inherited", async () => {
  let launches = 0;
  const extension = createSidequestExtension({
    env: { TERM_PROGRAM: "ghostty" },
    ascExecutionObserver: {
      setHostContext(context) {
        this.hasUI = context.hasUI;
      },
      handle() {
        if (this.hasUI) launches += 1;
      },
      async flush() {},
      async dispose() {},
      statePathFor() {
        return "/unused";
      },
    },
  });
  const harness = registerExtension(extension);
  const { ctx } = createContext({ cwd: "/repo" });
  ctx.hasUI = false;
  for (const handler of harness.events.get("session_start") ?? []) {
    await handler({ type: "session_start", reason: "startup" }, ctx);
  }
  for (const handler of harness.busEvents.get(ASC_EXECUTION_OBSERVATION_EVENT) ?? []) {
    handler(observation());
  }
  assert.equal(launches, 0);
});

test("session shutdown unsubscribes the observer listener and disposes its state", async () => {
  let disposeCalls = 0;
  const extension = createSidequestExtension({
    ascExecutionObserver: {
      setHostContext() {},
      handle() {},
      async flush() {},
      async dispose() {
        disposeCalls += 1;
      },
      statePathFor() {
        return "/unused";
      },
    },
  });
  const harness = registerExtension(extension);
  const { ctx } = createContext({ cwd: "/repo" });
  for (const handler of harness.events.get("session_start") ?? []) {
    await handler({ type: "session_start", reason: "startup" }, ctx);
  }
  assert.equal(harness.busEvents.get(ASC_EXECUTION_OBSERVATION_EVENT)?.length, 1);

  for (const handler of harness.events.get("session_shutdown") ?? []) {
    await handler({ type: "session_shutdown", reason: "reload" }, ctx);
  }
  assert.equal(harness.busEvents.get(ASC_EXECUTION_OBSERVATION_EVENT)?.length, 0);
  assert.equal(disposeCalls, 1);
});

test("toolbox-only sidequest projection does not register a second ASC observer listener", () => {
  const harness = registerExtension(
    createSidequestExtension({ registerCommands: false, registerTools: true }),
  );
  assert.equal(harness.busEvents.has(ASC_EXECUTION_OBSERVATION_EVENT), false);
});
