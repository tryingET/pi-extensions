#!/usr/bin/env node
// ---
// summary: "command-line entrypoint for opening, inspecting, repairing, and stopping the activity strip runtime"
// read_when:
//   - "operating or diagnosing the activity strip from a terminal"
// ---

import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  getBrokerStatus,
  isBrokerAlive,
  requestBrokerShutdown,
  sendBrokerMessage,
} from "../src/client/broker-client.mjs";
import {
  assessActivityStripCompatibility,
  formatCompatibilityReport,
} from "../src/common/compatibility.mjs";
import { ACTIVITY_STRIP_START_TIMEOUT_MS } from "../src/common/constants.mjs";
import { locateElectron } from "../src/common/electron.mjs";
import { makeMessage } from "../src/common/protocol.mjs";
import { formatBrokerRuntimeStatus } from "../src/common/status-report.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const electronEntry = path.resolve(__dirname, "..", "src", "electron", "main.mjs");
const execFileAsync = promisify(execFile);

function usage() {
  console.log(
    `Usage: pi-activity-strip <open|status|doctor|snapshot|fix-top|stop|serve> [--json]\n\nCommands:\n  open      Start the top-row activity strip if it is not already running\n  status    Check broker + overlay readiness and surface runtime warnings\n  doctor    Inspect host compatibility assumptions before opening the strip\n  snapshot  Print the current broker snapshot as JSON\n  fix-top   Move the strip window flush to the top edge in Niri\n  stop      Ask the running strip to shut down\n  serve     Internal helper; starts the Electron shell in the foreground\n`,
  );
}

async function moveStripToTop() {
  const { stdout } = await execFileAsync("niri", ["msg", "-j", "windows"], {
    env: process.env,
  });
  const windows = JSON.parse(stdout);
  if (!Array.isArray(windows)) {
    throw new Error("Unexpected niri windows payload");
  }

  const stripWindow = windows.find((window) => window?.title === "Pi Activity Strip");
  if (!stripWindow?.id) {
    throw new Error("Could not find Pi Activity Strip window in niri");
  }

  const currentY = Number(stripWindow.layout?.tile_pos_in_workspace_view?.[1] ?? 0);
  if (Math.abs(currentY) < 1) {
    return 0;
  }

  await execFileAsync(
    "niri",
    [
      "msg",
      "action",
      "move-floating-window",
      "--id",
      String(stripWindow.id),
      "-y",
      String(-Math.round(currentY)),
    ],
    { env: process.env },
  );

  console.log("Moved activity strip to the top edge.");
  return 0;
}

async function waitForBrokerReady(timeoutMs = ACTIVITY_STRIP_START_TIMEOUT_MS) {
  const timeoutAt = Date.now() + timeoutMs;
  /** @type {import("../src/common/contracts.ts").BrokerResponse | null} */
  let latestStatus = null;

  while (Date.now() < timeoutAt) {
    try {
      latestStatus = await getBrokerStatus();
    } catch {
      latestStatus = null;
    }

    if (
      latestStatus?.ok &&
      (!latestStatus.runtimeStatus || latestStatus.runtimeStatus.state === "ready")
    ) {
      return { ok: true };
    }
    if (latestStatus?.runtimeStatus?.state === "error") {
      return { ok: false, error: formatBrokerRuntimeStatus(latestStatus) };
    }

    await delay(125);
  }

  return {
    ok: false,
    error: `${formatBrokerRuntimeStatus(latestStatus || { ok: false })}\nTimeout: ${timeoutMs}ms`,
  };
}

/** @param {{ detached?: boolean }} [options] @returns {Promise<number>} */
async function openStrip({ detached = true } = {}) {
  if (await isBrokerAlive()) {
    console.log("Activity strip is already running.");
    return 0;
  }

  const compatibility = await assessActivityStripCompatibility();
  if (!compatibility.ok) {
    console.error(formatCompatibilityReport(compatibility));
    return 1;
  }

  const electron = await locateElectron();
  const child = spawn(electron, [electronEntry], {
    detached,
    stdio: detached ? "ignore" : "inherit",
    env: process.env,
  });

  if (detached) {
    child.unref();
    const ready = await waitForBrokerReady();
    if (!ready.ok) {
      console.error(ready.error || "Activity strip did not become ready.");
      return 1;
    }
    console.log("Started activity strip.");
    return 0;
  }

  return await new Promise((resolve) => {
    child.on("exit", (code) => resolve(typeof code === "number" ? code : 0));
  });
}

async function main() {
  const command = process.argv[2] ?? "open";
  const jsonOutput = process.argv.includes("--json");

  switch (command) {
    case "open":
      process.exitCode = await openStrip({ detached: true });
      return;
    case "serve":
      process.exitCode = await openStrip({ detached: false });
      return;
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
    case "fix-top": {
      try {
        process.exitCode = await moveStripToTop();
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
      return;
    }
    case "stop": {
      try {
        const result = await requestBrokerShutdown();
        console.log(result?.ok ? "stopping" : "not-running");
        process.exitCode = result?.ok ? 0 : 1;
      } catch {
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
