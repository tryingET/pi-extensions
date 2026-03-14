import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { isBrokerAlive, requestBrokerShutdown } from "../src/client/broker-client.mjs";
import { ensureActivityStripRunning } from "../src/client/launcher.mjs";
import { createSessionTelemetry } from "../src/client/session-telemetry.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const launcherPath = path.join(packageRoot, "bin", "pi-activity-strip.mjs");
const execFileAsync = promisify(execFile);

function wantsAutostart() {
  return process.env.PI_ACTIVITY_STRIP_AUTO_START !== "0";
}

export default function activityStripExtension(pi) {
  const telemetry = createSessionTelemetry({
    pi,
    cwd: process.cwd(),
    sessionName: "",
  });

  async function ensureOpen(ctx, announce = true) {
    const result = await ensureActivityStripRunning(launcherPath);
    if (!ctx?.hasUI || !announce) return result;
    if (!result.ok) {
      ctx.ui.notify(result.error ?? "Activity strip did not start", "error");
      return result;
    }
    ctx.ui.notify(
      result.started ? "Activity strip opened" : "Activity strip already running",
      "info",
    );
    return result;
  }

  pi.registerCommand("activity-strip", {
    description: "Open or check the top-row activity strip",
    handler: async (args, ctx) => {
      const action = String(args ?? "")
        .trim()
        .toLowerCase();
      if (action === "status") {
        const alive = await isBrokerAlive();
        if (ctx.hasUI) {
          ctx.ui.notify(
            alive ? "Activity strip is running" : "Activity strip is stopped",
            alive ? "info" : "warning",
          );
        }
        return;
      }

      if (action === "fix-top") {
        try {
          await execFileAsync(process.execPath, [launcherPath, "fix-top"], {
            env: process.env,
          });
          if (ctx.hasUI) ctx.ui.notify("Moved activity strip to the top edge", "info");
        } catch (error) {
          if (ctx.hasUI) {
            ctx.ui.notify(error?.message ?? "Failed to move activity strip", "error");
          }
        }
        return;
      }

      if (action === "stop") {
        try {
          const result = await requestBrokerShutdown();
          if (ctx.hasUI)
            ctx.ui.notify(
              result?.ok ? "Stopping activity strip" : "Activity strip is not running",
              result?.ok ? "info" : "warning",
            );
        } catch {
          if (ctx.hasUI) ctx.ui.notify("Activity strip is not running", "warning");
        }
        return;
      }

      await ensureOpen(ctx, true);
    },
  });

  pi.registerCommand("activity-strip-stop", {
    description: "Stop the running activity strip broker/window",
    handler: async (_args, ctx) => {
      try {
        const result = await requestBrokerShutdown();
        if (ctx.hasUI)
          ctx.ui.notify(
            result?.ok ? "Stopping activity strip" : "Activity strip is not running",
            result?.ok ? "info" : "warning",
          );
      } catch {
        if (ctx.hasUI) ctx.ui.notify("Activity strip is not running", "warning");
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    await telemetry.onSessionStart(ctx);
    if (ctx.hasUI && wantsAutostart()) {
      await ensureOpen(ctx, false);
    }
  });

  pi.on("before_agent_start", async (event) => {
    telemetry.onBeforeAgentStart(event);
  });

  pi.on("turn_start", async (event) => {
    telemetry.onTurnStart(event);
  });

  pi.on("message_update", async (event) => {
    telemetry.onMessageUpdate(event);
  });

  pi.on("tool_execution_start", async (event) => {
    telemetry.onToolExecutionStart(event);
  });

  pi.on("tool_execution_update", async (event) => {
    telemetry.onToolExecutionUpdate(event);
  });

  pi.on("tool_execution_end", async (event) => {
    telemetry.onToolExecutionEnd(event);
  });

  pi.on("turn_end", async () => {
    telemetry.onTurnEnd();
  });

  pi.on("agent_end", async () => {
    telemetry.onAgentEnd();
  });

  pi.on("session_shutdown", async () => {
    await telemetry.shutdown();
  });
}
