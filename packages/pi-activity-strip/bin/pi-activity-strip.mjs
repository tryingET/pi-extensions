#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  isBrokerAlive,
  requestBrokerShutdown,
  sendBrokerMessage,
} from "../src/client/broker-client.mjs";
import { locateElectron } from "../src/common/electron.mjs";
import { makeMessage } from "../src/common/protocol.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const electronEntry = path.resolve(__dirname, "..", "src", "electron", "main.mjs");
const execFileAsync = promisify(execFile);

function usage() {
  console.log(
    `Usage: pi-activity-strip <open|status|snapshot|fix-top|stop|serve>\n\nCommands:\n  open      Start the top-row activity strip if it is not already running\n  status    Check whether the local activity-strip broker is responding\n  snapshot  Print the current broker snapshot as JSON\n  fix-top   Move the strip window flush to the top edge in Niri\n  stop      Ask the running strip to shut down\n  serve     Internal helper; starts the Electron shell in the foreground\n`,
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

async function openStrip({ detached = true } = {}) {
  if (await isBrokerAlive()) {
    console.log("Activity strip is already running.");
    return 0;
  }

  const electron = await locateElectron();
  const child = spawn(electron, [electronEntry], {
    detached,
    stdio: detached ? "ignore" : "inherit",
    env: process.env,
  });

  if (detached) {
    child.unref();
    console.log("Started activity strip.");
    return 0;
  }

  return await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

async function main() {
  const command = process.argv[2] ?? "open";

  switch (command) {
    case "open":
      process.exitCode = await openStrip({ detached: true });
      return;
    case "serve":
      process.exitCode = await openStrip({ detached: false });
      return;
    case "status": {
      const alive = await isBrokerAlive();
      console.log(alive ? "running" : "stopped");
      process.exitCode = alive ? 0 : 1;
      return;
    }
    case "snapshot": {
      try {
        const result = await sendBrokerMessage(makeMessage("ping"), { expectReply: true });
        console.log(JSON.stringify(result?.snapshot ?? { sessions: [] }, null, 2));
        process.exitCode = result?.ok ? 0 : 1;
      } catch (error) {
        console.error(error?.message ?? String(error));
        process.exitCode = 1;
      }
      return;
    }
    case "fix-top": {
      try {
        process.exitCode = await moveStripToTop();
      } catch (error) {
        console.error(error?.message ?? String(error));
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
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exit(1);
});
