#!/usr/bin/env node
// ---
// summary: "command-line entrypoint for opening, inspecting, repairing, and stopping the activity strip runtime"
// read_when:
//   - "operating or diagnosing the activity strip from a terminal"
// ---

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getBrokerStatus,
  isBrokerAlive,
  requestBrokerShutdown,
  sendBrokerMessage,
} from "../src/client/broker-client.mjs";
import {
  RUNTIME_LOCK_CONFLICT_EXIT_CODE,
  waitForRuntimeExit,
  waitForStartedRuntime,
} from "../src/client/runtime-lock.mjs";
import {
  assessActivityStripCompatibility,
  formatCompatibilityReport,
} from "../src/common/compatibility.mjs";
import {
  ACTIVITY_STRIP_SOCKET_DIR,
  ACTIVITY_STRIP_START_TIMEOUT_MS,
  ACTIVITY_STRIP_STOP_TIMEOUT_MS,
} from "../src/common/constants.mjs";
import { makeMessage } from "../src/common/protocol.mjs";
import { formatBrokerRuntimeStatus } from "../src/common/status-report.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nativeEntry = path.resolve(__dirname, "..", "src", "native", "main.mjs");
const runtimeLockPath = path.join(ACTIVITY_STRIP_SOCKET_DIR, "runtime.lock");

function usage() {
  console.log(
    `Usage: pi-activity-strip <open|focus-strip|focus-session|status|doctor|snapshot|claude-hooks|fix-top|stop|serve> [options]\n\nCommands:\n  open              Start the interactive top-row activity strip (--click-through opts out)\n  focus-strip       Focus the visible strip already resident on the focused Niri workspace\n  focus-session ID  Focus the one Ghostty/Niri window matching an exact Pi session identity\n  status            Check broker + overlay readiness and surface runtime warnings\n  doctor            Inspect host compatibility assumptions before opening the strip\n  snapshot          Print the current broker snapshot as JSON\n  claude-hooks      Print the Claude Code settings fragment for live agent telemetry\n  fix-top           Confirm compositor-owned layer-shell placement\n  stop              Ask the running strip to shut down\n  serve             Internal helper; starts the native runtime in the foreground\n`,
  );
}

/** @param {{ detached?: boolean }} [options] @returns {Promise<number>} */
async function openStrip({ detached = true } = {}) {
  if (await isBrokerAlive()) {
    const status = await getBrokerStatus({ expectReply: true }).catch(() => null);
    if (status?.runtimeStatus?.state !== "error") {
      console.log("Activity strip is already running.");
      return 0;
    }
    await requestBrokerShutdown().catch(() => null);
    // Its broker closes before it exits; starting before the lock is released would lose it.
    const exit = await waitForRuntimeExit(runtimeLockPath, {
      timeoutMs: ACTIVITY_STRIP_STOP_TIMEOUT_MS,
    });
    if (!exit.released) {
      console.error(exit.error ?? formatBrokerRuntimeStatus(status));
      return 1;
    }
  }

  const compatibility = await assessActivityStripCompatibility();
  if (!compatibility.ok) {
    console.error(formatCompatibilityReport(compatibility));
    return 1;
  }

  fs.mkdirSync(ACTIVITY_STRIP_SOCKET_DIR, { recursive: true, mode: 0o700 });
  const child = spawn(
    "flock",
    [
      "--nonblock",
      "--conflict-exit-code",
      String(RUNTIME_LOCK_CONFLICT_EXIT_CODE),
      runtimeLockPath,
      process.execPath,
      nativeEntry,
    ],
    {
      detached,
      stdio: detached ? "ignore" : "inherit",
      env: { ...process.env, PI_ACTIVITY_STRIP_RUNTIME_LOCK_HELD: "1" },
    },
  );
  if (!detached) {
    return await new Promise((resolve) => {
      child.on("exit", (code) => resolve(typeof code === "number" ? code : 0));
    });
  }

  /** @type {{exitCode: number | null | undefined; error?: string}} */
  const controller = { exitCode: undefined };
  child.once("exit", (code) => {
    controller.exitCode = code;
  });
  child.once("error", (error) => {
    controller.exitCode = null;
    controller.error = error.message;
  });
  child.unref();
  const result = await waitForStartedRuntime({
    controller,
    getStatus: () => getBrokerStatus().catch(() => null),
  });
  if (result.ok) {
    console.log(result.started ? "Started activity strip." : "Activity strip is already running.");
    return 0;
  }
  if (result.reason === "lock-held") {
    console.error(
      "Another activity-strip runtime still holds the runtime lock, probably one that is shutting down; nothing was started. `stop` waits for it to exit.",
    );
  } else if (result.reason === "exited") {
    console.error(
      controller.error
        ? `The activity-strip runtime could not be started: ${controller.error}`
        : `The activity-strip runtime exited during startup (code ${result.exitCode}).`,
    );
  } else {
    const timeout =
      result.reason === "timeout" ? `\nTimeout: ${ACTIVITY_STRIP_START_TIMEOUT_MS}ms` : "";
    console.error(`${formatBrokerRuntimeStatus(result.status ?? { ok: false })}${timeout}`);
  }
  return 1;
}

async function main() {
  const command = process.argv[2] ?? "open";
  const jsonOutput = process.argv.includes("--json");
  if (process.argv.includes("--click-through")) {
    process.env.PI_ACTIVITY_STRIP_CLICK_THROUGH = "1";
  }

  switch (command) {
    case "open":
      process.exitCode = await openStrip({ detached: true });
      return;
    case "serve":
      process.exitCode = await openStrip({ detached: false });
      return;
    case "focus-strip": {
      try {
        const status = await getBrokerStatus({ expectReply: true });
        if (status?.runtimeStatus?.windowVisible !== true) {
          console.error("No visible strip exists on the focused workspace; focus did nothing.");
          process.exitCode = 1;
          return;
        }
        const result = await sendBrokerMessage(makeMessage("focus-strip"), {
          expectReply: true,
        });
        if (!result.ok) console.error(result.error || "Strip focus did nothing.");
        process.exitCode = result.ok ? 0 : 1;
      } catch {
        console.error("Activity strip is not running; focus did nothing.");
        process.exitCode = 1;
      }
      return;
    }
    case "focus":
    case "focus-session": {
      const sessionId = String(process.argv[3] ?? "").trim();
      if (!sessionId) {
        console.error("focus-session requires the full Pi session id");
        process.exitCode = 2;
        return;
      }
      try {
        const result = await sendBrokerMessage(makeMessage("focus", { sessionId }), {
          expectReply: true,
        });
        if (!result?.ok) console.error(result?.error || "Focus did nothing.");
        process.exitCode = result?.ok ? 0 : 1;
      } catch {
        console.error("Activity strip is not running; focus did nothing.");
        process.exitCode = 1;
      }
      return;
    }
    case "status": {
      try {
        const result = await getBrokerStatus({ expectReply: true });
        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatBrokerRuntimeStatus(result));
        }
        process.exitCode =
          result?.ok && (!result.runtimeStatus || result.runtimeStatus.state === "ready") ? 0 : 1;
      } catch {
        console.log(
          jsonOutput ? JSON.stringify({ ok: false, state: "stopped" }, null, 2) : "stopped",
        );
        process.exitCode = 1;
      }
      return;
    }
    case "doctor": {
      const report = await assessActivityStripCompatibility();
      if (jsonOutput) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatCompatibilityReport(report));
      }
      process.exitCode = report.ok ? 0 : 1;
      return;
    }
    case "snapshot": {
      try {
        const result = await sendBrokerMessage(makeMessage("ping"), { expectReply: true });
        console.log(JSON.stringify(result?.snapshot ?? { sessions: [] }, null, 2));
        process.exitCode = result?.ok ? 0 : 1;
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
      return;
    }
    case "claude-hooks": {
      const { claudeHookSettings } = await import("../src/common/claude-hook-config.mjs");
      const hookPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "pi-activity-strip-claude-hook.mjs",
      );
      const settings = claudeHookSettings(`${process.execPath} ${hookPath}`);
      if (jsonOutput) {
        console.log(JSON.stringify(settings, null, 2));
      } else {
        console.log(
          "Merge this into ~/.claude/settings.json so Claude Code sessions report live state:\n",
        );
        console.log(JSON.stringify(settings, null, 2));
        console.log(
          "\nOnly low-frequency events are hooked, so nothing runs per tool call. Tool and thinking",
        );
        console.log("state already come from the transcript without any configuration.");
      }
      return;
    }
    case "fix-top":
      console.log("Native layer-shell placement is compositor-owned; no repair was needed.");
      process.exitCode = 0;
      return;
    case "stop": {
      let accepted = false;
      try {
        accepted = (await requestBrokerShutdown())?.ok === true;
      } catch {
        accepted = false;
      }
      // Wait on the lock even when no broker answered: a runtime whose broker has already closed
      // still holds it until it exits, and `stop && open` must not race that.
      const exit = await waitForRuntimeExit(runtimeLockPath, {
        timeoutMs: ACTIVITY_STRIP_STOP_TIMEOUT_MS,
      });
      if (exit.error) {
        console.error(exit.error);
        process.exitCode = 1;
      } else if (!exit.released) {
        console.log("stopping (still shutting down)");
        process.exitCode = 1;
      } else if (accepted || exit.waited) {
        console.log("stopped");
        process.exitCode = 0;
      } else {
        console.log("not-running");
        process.exitCode = 1;
      }
      return;
    }
    case "-h":
    case "--help":
      usage();
      process.exitCode = 0;
      return;
    default:
      usage();
      console.error(`Unknown command: ${command}`);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
