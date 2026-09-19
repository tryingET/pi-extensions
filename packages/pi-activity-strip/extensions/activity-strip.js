// ---
// summary: "registers activity-strip commands and forwards Pi lifecycle telemetry to the local broker"
// read_when:
//   - "changing extension commands, autostart behavior, or telemetry event wiring"
// ---

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
/** @typedef {import("@earendil-works/pi-coding-agent").ExtensionAPI} ExtensionAPI */
/** @typedef {import("../src/common/contracts.ts").BeforeAgentStartEventLike} BeforeAgentStartEventLike */
/** @typedef {import("../src/common/contracts.ts").MessageUpdateEventLike} MessageUpdateEventLike */
/** @typedef {import("../src/common/contracts.ts").SessionStartContextLike} SessionStartContextLike */
/** @typedef {import("../src/common/contracts.ts").ToolExecutionEventLike} ToolExecutionEventLike */
/** @typedef {import("../src/common/contracts.ts").TurnStartEventLike} TurnStartEventLike */
import { getBrokerStatus } from "../src/client/broker-client.mjs";
import { ensureActivityStripRunning } from "../src/client/launcher.mjs";
import { stopRuntime } from "../src/client/runtime-lock.mjs";
import { createSessionTelemetry } from "../src/client/session-telemetry.mjs";
import {
  formatBrokerRuntimeStatus,
  summarizeBrokerRuntimeStatus,
} from "../src/common/status-report.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const launcherPath = path.join(packageRoot, "bin", "pi-activity-strip.mjs");
const execFileAsync = promisify(execFile);

/** @typedef {SessionStartContextLike & { hasUI?: boolean; ui?: { notify?: (message: string, level?: "info" | "warning" | "error") => void; editor?: (title: string, text: string) => Promise<unknown> } }} UiContextLike */

function wantsAutostart() {
  return process.env.PI_ACTIVITY_STRIP_AUTO_START !== "0";
}

/** @type {Record<string, [string, "info" | "warning" | "error"]>} */
const STOP_NOTICES = {
  stopped: ["Activity strip stopped", "info"],
  "not-running": ["Activity strip is not running", "warning"],
  "still-stopping": ["Activity strip is still shutting down", "warning"],
};

/** @param {ExtensionAPI} pi */
export default function activityStripExtension(pi) {
  const telemetry = createSessionTelemetry({
    pi,
    cwd: process.cwd(),
    sessionName: "",
  });

  /** @param {UiContextLike} ctx @param {boolean} [announce] */
  async function ensureOpen(ctx, announce = true) {
    const result = await ensureActivityStripRunning(launcherPath);
    if (!ctx?.hasUI || !announce) return result;
    if (!result.ok) {
      ctx.ui?.notify?.(result.error ?? "Activity strip did not start", "error");
      return result;
    }
    ctx.ui?.notify?.(
      result.started ? "Activity strip opened" : "Activity strip already running",
      "info",
    );
    return result;
  }

  /**
   * Returns once the runtime has exited, so an open right after it cannot race a runtime that is
   * still shutting down and leave no ribbon running.
   * @param {UiContextLike} ctx
   */
  async function stopStrip(ctx) {
    const result = await stopRuntime();
    if (!ctx.hasUI) return;
    /** @type {[string, "info" | "warning" | "error"]} */
    const [message, level] =
      result.outcome === "error" ? [result.error, "error"] : STOP_NOTICES[result.outcome];
    ctx.ui?.notify?.(message, level);
  }

  pi.registerCommand("activity-strip", {
    description: "Open or check the top-row activity strip",
    /** @param {string} args @param {UiContextLike} ctx */
    handler: async (args, ctx) => {
      const action = String(args ?? "")
        .trim()
        .toLowerCase();
      if (action === "status") {
        try {
          const result = await getBrokerStatus();
          if (ctx.hasUI && typeof ctx.ui?.editor === "function") {
            await ctx.ui.editor("Activity Strip Status", formatBrokerRuntimeStatus(result));
          } else if (ctx.hasUI) {
            const summary = summarizeBrokerRuntimeStatus(result);
            ctx.ui?.notify?.(summary.headline, summary.level);
          }
        } catch {
          if (ctx.hasUI && typeof ctx.ui?.editor === "function") {
            await ctx.ui.editor("Activity Strip Status", "stopped");
          } else if (ctx.hasUI) {
            ctx.ui?.notify?.("Activity strip is stopped", "warning");
          }
        }
        return;
      }

      if (action === "doctor") {
        try {
          const { stdout } = await execFileAsync(process.execPath, [launcherPath, "doctor"], {
            env: process.env,
          });
          if (ctx.hasUI && typeof ctx.ui?.editor === "function") {
            await ctx.ui.editor("Activity Strip Doctor", stdout.trim() || "No output");
          } else if (ctx.hasUI) {
            ctx.ui?.notify?.("Opened activity strip compatibility report", "info");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Activity strip doctor failed";
          if (ctx.hasUI && typeof ctx.ui?.editor === "function") {
            await ctx.ui.editor("Activity Strip Doctor", message);
          } else if (ctx.hasUI) {
            ctx.ui?.notify?.(message, "error");
          }
        }
        return;
      }

      if (action === "fix-top") {
        try {
          await execFileAsync(process.execPath, [launcherPath, "fix-top"], {
            env: process.env,
          });
          if (ctx.hasUI) ctx.ui?.notify?.("Moved activity strip to the top edge", "info");
        } catch (error) {
          if (ctx.hasUI) {
            ctx.ui?.notify?.(
              error instanceof Error ? error.message : "Failed to move activity strip",
              "error",
            );
          }
        }
        return;
      }

      if (action === "stop") {
        await stopStrip(ctx);
        return;
      }

      await ensureOpen(ctx, true);
    },
  });

  pi.registerCommand("activity-strip-stop", {
    description: "Stop the running activity strip broker/window",
    /** @param {string} _args @param {UiContextLike} ctx */
    handler: async (_args, ctx) => {
      await stopStrip(ctx);
    },
  });

  /** @param {unknown} _event @param {UiContextLike} ctx */
  pi.on("session_start", async (_event, ctx) => {
    await telemetry.onSessionStart(ctx);
    if (ctx.hasUI && wantsAutostart()) {
      await ensureOpen(ctx, false);
    }
  });

  /** @param {BeforeAgentStartEventLike} event */
  pi.on("before_agent_start", async (event) => {
    telemetry.onBeforeAgentStart(event);
  });

  /** @param {TurnStartEventLike} event */
  pi.on("turn_start", async (event) => {
    telemetry.onTurnStart(event);
  });

  /** @param {MessageUpdateEventLike} event */
  pi.on("message_update", async (event) => {
    telemetry.onMessageUpdate(event);
  });

  /** @param {ToolExecutionEventLike} event */
  pi.on("tool_execution_start", async (event) => {
    telemetry.onToolExecutionStart(event);
  });

  /** @param {ToolExecutionEventLike} event */
  pi.on("tool_execution_update", async (event) => {
    telemetry.onToolExecutionUpdate(event);
  });

  /** @param {ToolExecutionEventLike} event */
  pi.on("tool_execution_end", async (event) => {
    telemetry.onToolExecutionEnd(event);
  });

  pi.on("turn_end", async (event) => {
    telemetry.onTurnEnd(event);
  });

  pi.on("agent_settled", async () => {
    telemetry.onAgentSettled();
  });

  pi.on("session_shutdown", async () => {
    await telemetry.shutdown();
  });
}
