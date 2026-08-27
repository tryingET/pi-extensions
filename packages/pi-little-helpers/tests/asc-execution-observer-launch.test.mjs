// summary: proves sidequest owns automatic Ghostty launch for ASC observation groups without replacing execution.
// read_when:
//   - changing sidequest event-bus wiring, Ghostty observer command launch, or duplicate-listener policy.

import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSidequestExtension } from "../extensions/sidequest.ts";
import { ASC_EXECUTION_OBSERVATION_EVENT } from "../src/ascExecutionObserver.ts";
import {
  createContext,
  isLocalGhosttyWrapper,
  LOCAL_GHOSTTY_BIN,
  LOCAL_GHOSTTY_ORIGIN_MAIN_BIN,
  registerExtension,
} from "./sidequest-harness.mjs";

function observation(sequence = 1, producer = "loop_execute") {
  const directDispatch = producer === "dispatch_subagent";
  return {
    schema: "asc.execution_observation.v1",
    event: "dispatch_progress",
    observedAt: new Date().toISOString(),
    producer,
    cwd: "/repo",
    group: directDispatch
      ? { id: "dispatch-visible-1", kind: "dispatch", label: "Dispatch · reviewer" }
      : { id: "transcendent-visible-1", kind: "loop", label: "TRANSCENDENT loop" },
    ...(directDispatch
      ? {}
      : {
          phase: {
            name: "diagnose",
            index: 1,
            count: 8,
            agent: "scout",
            cognitiveTool: "first-principles",
          },
        }),
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

function observerStatePath(root) {
  const files = readdirSync(root).filter((name) => name.endsWith(".json"));
  assert.equal(files.length, 1);
  return join(root, files[0]);
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  assert.fail("timed out waiting for observer launch");
}

for (const scenario of [
  {
    name: "direct dispatch",
    producer: "dispatch_subagent",
    groupId: "dispatch-visible-1",
  },
  {
    name: "logical loop group",
    producer: "loop_execute",
    groupId: "transcendent-visible-1",
  },
]) {
  test(`ASC ${scenario.name} opens one observer tab through the exact controller process`, async () => {
    const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-launch-"));
    const calls = [];
    try {
      const extension = createSidequestExtension({
        env: {
          TERM_PROGRAM: "ghostty",
          GHOSTTY_SURFACE_ID: "0x1234",
          PI_ASC_OBSERVER_STATE_DIR: root,
          PI_SIDEQUEST_LAUNCH_STAGGER_MS: "0",
        },
        ascObserverStateRoot: root,
        currentSessionGhosttyBin: LOCAL_GHOSTTY_BIN,
        currentGhosttyAncestor: { pid: 111, exe: LOCAL_GHOSTTY_BIN },
        readProcessExecutable(pid) {
          return pid === 222 ? LOCAL_GHOSTTY_BIN : undefined;
        },
        pathExists(path) {
          return path === LOCAL_GHOSTTY_BIN || isLocalGhosttyWrapper(path);
        },
        async exec(command, args) {
          calls.push({ command, args });
          if (command === LOCAL_GHOSTTY_BIN && args[0] === "+help") {
            return { code: 0, stdout: "Available actions:\n  +new-tab\n" };
          }
          if (command === LOCAL_GHOSTTY_BIN && args[0] === "+version") {
            return { code: 0, stdout: "Ghostty 1.4.0-sidequest.1\n" };
          }
          if (command === "busctl" && args[1] === "list") {
            return {
              code: 0,
              stdout:
                ":1.42 111 ghostty user :1.42 user@1000.service - -\n" +
                ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
                "com.tryinget.ghosttysidequest 222 ghostty user :1.43 user@1000.service - -\n",
            };
          }
          if (command === "busctl" && args[1] === "call") {
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
        handler(observation(1, scenario.producer));
        handler(observation(2, scenario.producer));
      }
      await waitFor(() =>
        calls.some((call) => call.command === "busctl" && call.args[1] === "call"),
      );
      await new Promise((resolve) => setTimeout(resolve, 30));

      const launches = calls.filter((call) => call.command === "busctl" && call.args[1] === "call");
      assert.equal(launches.length, 1);
      const args = launches[0].args;
      assert.equal(args[2], "--expect-reply=no");
      assert.equal(args[3], ":1.43");
      assert.equal(Number(args[12]), args.length - 15);
      assert.ok(args.includes(process.execPath));
      assert.ok(args.some((value) => value.endsWith("scripts/asc-execution-observer.mjs")));
      assert.ok(args.includes("--state"));
      assert.ok(args.includes("--controller-instance"));
      assert.equal(
        calls.some((call) => isLocalGhosttyWrapper(call.command) && call.args[0] === "+new-tab"),
        false,
      );
      const statePath = args[args.indexOf("--state") + 1];
      const controllerInstanceId = args[args.indexOf("--controller-instance") + 1];
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      assert.equal(state.producer, scenario.producer);
      assert.equal(state.group.id, scenario.groupId);
      assert.equal(state.controllerInstanceId, controllerInstanceId);
      assert.equal(state.observer.launchStatus, "launched");
      assert.match(state.observer.note, /targeted Ghostty single-instance process 222/);
      assert.match(state.notice, /closing this tab does not cancel work/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("automatic ASC observer targets the normal origin/main broker exactly", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-origin-main-"));
  const calls = [];
  try {
    const extension = createSidequestExtension({
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_SURFACE_ID: "0x1234",
        PI_ASC_OBSERVER_STATE_DIR: root,
        PI_SIDEQUEST_GHOSTTY_BIN: LOCAL_GHOSTTY_BIN,
        PI_SIDEQUEST_LAUNCH_STAGGER_MS: "0",
      },
      ascObserverStateRoot: root,
      currentSessionGhosttyBin: LOCAL_GHOSTTY_ORIGIN_MAIN_BIN,
      currentGhosttyAncestor: { pid: 111, exe: LOCAL_GHOSTTY_ORIGIN_MAIN_BIN },
      readProcessExecutable(pid) {
        return pid === 222 ? LOCAL_GHOSTTY_ORIGIN_MAIN_BIN : undefined;
      },
      pathExists(path) {
        return path === LOCAL_GHOSTTY_ORIGIN_MAIN_BIN || path === LOCAL_GHOSTTY_BIN;
      },
      async exec(command, args) {
        calls.push({ command, args });
        if (command === LOCAL_GHOSTTY_ORIGIN_MAIN_BIN && args[0] === "+help") {
          return { code: 0, stdout: "Available actions:\n  +new-tab\n" };
        }
        if (command === LOCAL_GHOSTTY_ORIGIN_MAIN_BIN && args[0] === "+version") {
          return { code: 0, stdout: "Ghostty 1.4.0-origin-main-9d8fbd15b3b4\n" };
        }
        if (command === "busctl" && args[1] === "list") {
          return {
            code: 0,
            stdout:
              ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
              ":1.44 333 ghostty user :1.44 user@1000.service - -\n" +
              "com.mitchellh.ghostty 222 ghostty user :1.43 user@1000.service - -\n" +
              "com.tryinget.ghosttysidequest 333 ghostty user :1.44 user@1000.service - -\n",
          };
        }
        if (command === "busctl" && args[1] === "call") return { code: 0, stdout: "" };
        throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
      },
    });
    const harness = registerExtension(extension);
    const { ctx } = createContext({ cwd: "/repo", sessionId: "origin-main-controller" });
    for (const handler of harness.events.get("session_start") ?? []) {
      await handler({ type: "session_start", reason: "startup" }, ctx);
    }
    for (const handler of harness.busEvents.get(ASC_EXECUTION_OBSERVATION_EVENT) ?? []) {
      handler(observation(1, "dispatch_subagent"));
      handler(observation(2, "dispatch_subagent"));
    }

    await waitFor(() =>
      calls.some(({ command, args }) => command === "busctl" && args[1] === "call"),
    );
    const launches = calls.filter(
      ({ command, args }) => command === "busctl" && args[1] === "call",
    );
    assert.equal(launches.length, 1);
    assert.equal(launches[0].args[2], "--expect-reply=no");
    assert.equal(launches[0].args[3], ":1.43");
    assert.equal(launches[0].args[4], "/com/mitchellh/ghostty");
    assert.equal(launches[0].args[11], "4660");
    assert.equal(Number(launches[0].args[12]), launches[0].args.length - 15);
    assert.equal(launches[0].args[13], "--");
    assert.equal(
      calls.some(
        ({ command, args }) => command === LOCAL_GHOSTTY_ORIGIN_MAIN_BIN && args[0] === "+new-tab",
      ),
      false,
    );
    assert.equal(
      calls.some(({ command }) => command === LOCAL_GHOSTTY_BIN),
      false,
      "strict observer eligibility must ignore PI_SIDEQUEST_GHOSTTY_BIN",
    );
    const state = JSON.parse(readFileSync(observerStatePath(root), "utf8"));
    assert.equal(state.observer.launchStatus, "launched");
    assert.match(state.observer.note, /targeted Ghostty single-instance process 222/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("automatic ASC observer stays headless when stock Ghostty cannot host an exact tab", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-headless-"));
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
      currentGhosttyAncestor: { pid: 111, exe: "/usr/bin/ghostty" },
      pathExists(path) {
        return path === "/usr/bin/ghostty" || isLocalGhosttyWrapper(path);
      },
      async exec(command, args) {
        calls.push({ command, args });
        if (command === "/usr/bin/ghostty" && args[0] === "+help") {
          return { code: 0, stdout: "Available actions:\n  +new-window\n" };
        }
        throw new Error(`automatic observer must not launch ${command} ${args.join(" ")}`);
      },
    });
    const harness = registerExtension(extension);
    const { ctx, notifications } = createContext({
      cwd: "/repo",
      sessionId: "stock-controller-session",
    });
    for (const handler of harness.events.get("session_start") ?? []) {
      await handler({ type: "session_start", reason: "startup" }, ctx);
    }
    for (const handler of harness.busEvents.get(ASC_EXECUTION_OBSERVATION_EVENT) ?? []) {
      handler(observation(1, "dispatch_subagent"));
      handler(observation(2, "dispatch_subagent"));
    }

    await waitFor(() => notifications.length === 1);
    const state = JSON.parse(readFileSync(observerStatePath(root), "utf8"));
    assert.equal(state.observer.launchStatus, "failed");
    assert.match(state.observer.failure, /exact controller Ghostty tab unavailable/i);
    assert.match(state.observer.failure, /does not support \+new-tab/i);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "/usr/bin/ghostty");
    assert.equal(calls[0].args[0], "+help");
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].message, /execution continues headlessly/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("automatic ASC observer rejects an ambiguous controller D-Bus target without fallback", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-ambiguous-"));
  const calls = [];
  try {
    const extension = createSidequestExtension({
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_SURFACE_ID: "0x1234",
        PI_ASC_OBSERVER_STATE_DIR: root,
        PI_SIDEQUEST_LAUNCH_STAGGER_MS: "0",
      },
      ascObserverStateRoot: root,
      currentSessionGhosttyBin: LOCAL_GHOSTTY_BIN,
      currentGhosttyAncestor: { pid: 111, exe: LOCAL_GHOSTTY_BIN },
      readProcessExecutable(pid) {
        return pid === 222 ? LOCAL_GHOSTTY_BIN : undefined;
      },
      pathExists(path) {
        return path === LOCAL_GHOSTTY_BIN || isLocalGhosttyWrapper(path);
      },
      async exec(command, args) {
        calls.push({ command, args });
        if (command === LOCAL_GHOSTTY_BIN && args[0] === "+help") {
          return { code: 0, stdout: "Available actions:\n  +new-tab\n" };
        }
        if (command === LOCAL_GHOSTTY_BIN && args[0] === "+version") {
          return { code: 0, stdout: "Ghostty 1.4.0-sidequest.1\n" };
        }
        if (command === "busctl" && args[1] === "list") {
          return {
            code: 0,
            stdout:
              ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
              ":1.44 222 ghostty user :1.44 user@1000.service - -\n" +
              "com.tryinget.ghosttysidequest 222 ghostty user :1.43 user@1000.service - -\n",
          };
        }
        throw new Error(`automatic observer must not launch ${command} ${args.join(" ")}`);
      },
    });
    const harness = registerExtension(extension);
    const { ctx, notifications } = createContext({
      cwd: "/repo",
      sessionId: "ambiguous-controller-session",
    });
    for (const handler of harness.events.get("session_start") ?? []) {
      await handler({ type: "session_start", reason: "startup" }, ctx);
    }
    for (const handler of harness.busEvents.get(ASC_EXECUTION_OBSERVATION_EVENT) ?? []) {
      handler(observation(1, "dispatch_subagent"));
      handler(observation(2, "dispatch_subagent"));
    }

    await waitFor(() => notifications.length === 1);
    const state = JSON.parse(readFileSync(observerStatePath(root), "utf8"));
    assert.equal(state.observer.launchStatus, "failed");
    assert.match(state.observer.failure, /D-Bus target could not be proven/i);
    assert.equal(
      calls.some((call) => call.command === "busctl" && call.args[1] === "call"),
      false,
    );
    assert.equal(
      calls.some((call) => isLocalGhosttyWrapper(call.command) && call.args[0] === "+new-tab"),
      false,
    );
    assert.equal(notifications.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("automatic ASC observer does not open another window after exact activation fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-asc-observer-activation-failure-"));
  const calls = [];
  try {
    const extension = createSidequestExtension({
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_SURFACE_ID: "0x1234",
        PI_ASC_OBSERVER_STATE_DIR: root,
        PI_SIDEQUEST_LAUNCH_STAGGER_MS: "0",
      },
      ascObserverStateRoot: root,
      currentSessionGhosttyBin: LOCAL_GHOSTTY_BIN,
      currentGhosttyAncestor: { pid: 111, exe: LOCAL_GHOSTTY_BIN },
      readProcessExecutable(pid) {
        return pid === 222 ? LOCAL_GHOSTTY_BIN : undefined;
      },
      pathExists(path) {
        return path === LOCAL_GHOSTTY_BIN || isLocalGhosttyWrapper(path);
      },
      async exec(command, args) {
        calls.push({ command, args });
        if (command === LOCAL_GHOSTTY_BIN && args[0] === "+help") {
          return { code: 0, stdout: "Available actions:\n  +new-tab\n" };
        }
        if (command === LOCAL_GHOSTTY_BIN && args[0] === "+version") {
          return { code: 0, stdout: "Ghostty 1.4.0-sidequest.1\n" };
        }
        if (command === "busctl" && args[1] === "list") {
          return {
            code: 0,
            stdout:
              ":1.42 111 ghostty user :1.42 user@1000.service - -\n" +
              ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
              "com.tryinget.ghosttysidequest 222 ghostty user :1.43 user@1000.service - -\n",
          };
        }
        if (command === "busctl" && args[1] === "call") {
          return { code: 0, stdout: "", killed: true };
        }
        throw new Error(`automatic observer must not launch ${command} ${args.join(" ")}`);
      },
    });
    const harness = registerExtension(extension);
    const { ctx, notifications } = createContext({
      cwd: "/repo",
      sessionId: "failed-activation-session",
    });
    for (const handler of harness.events.get("session_start") ?? []) {
      await handler({ type: "session_start", reason: "startup" }, ctx);
    }
    for (const handler of harness.busEvents.get(ASC_EXECUTION_OBSERVATION_EVENT) ?? []) {
      handler(observation(1, "dispatch_subagent"));
      handler(observation(2, "dispatch_subagent"));
    }

    await waitFor(() => notifications.length === 1);
    const state = JSON.parse(readFileSync(observerStatePath(root), "utf8"));
    assert.equal(state.observer.launchStatus, "failed");
    assert.match(state.observer.failure, /launch effect is indeterminate/i);
    assert.equal(
      calls.filter((call) => call.command === "busctl" && call.args[1] === "call").length,
      1,
    );
    assert.equal(
      calls.some((call) => isLocalGhosttyWrapper(call.command) && call.args[0] === "+new-tab"),
      false,
    );
    assert.equal(
      calls.some(
        (call) =>
          isLocalGhosttyWrapper(call.command) &&
          call.args.some((argument) => argument.startsWith("--working-directory=")),
      ),
      false,
    );
    assert.equal(notifications.length, 1);
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
