/** The single public ASC controller command and dashboard shortcut router. */

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getContextRepoRoot, getContextSessionKey } from "./session-context.ts";
import { requestSubagentTabs } from "./subagent-attachment-commands.ts";
import {
  formatSharedSubagentCapacityHolders,
  inspectSharedSubagentCapacity,
} from "./subagent-capacity.ts";
import { inertText } from "./subagent-cockpit-io.ts";
import { createSubagentDashboardSnapshot } from "./subagent-dashboard-data.ts";
import {
  cleanupOldSessions,
  clearSubagentSessions,
  getSubagentStats,
  type SubagentState,
} from "./subagent-session.ts";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSION_AGE_DAYS = 7;
const DEFAULT_MAX_SESSION_COUNT = 100;
const OBSERVER_EVENT = "asc:subagent-observer:diagnose:v1";
// LH open waits up to 6 seconds for bounded startup; do not misreport normal work as absent.
const OBSERVER_REPLY_WAIT_MS = 7000;
const MAX_OBSERVER_MESSAGE = 4096;
const MAX_OBSERVER_DISPLAY = 500;

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" = "info"): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
}

function notifyPreserved(ctx: ExtensionContext, command: string): void {
  notify(
    ctx,
    `/subagents diagnose ${command} preserved subagent sessions. Pass --delete for explicit destructive pruning.`,
  );
}

function showCapacity(state: SubagentState, ctx: ExtensionContext): void {
  const stats = getSubagentStats(state);
  const holders = inspectSharedSubagentCapacity(state.sessionsDir, state.maxConcurrent);
  const oldestAge = stats.oldestSessionAge
    ? `${Math.round(stats.oldestSessionAge / ONE_DAY_MS)}d old`
    : "none";
  const summary = Object.entries(stats.statusCounts)
    .map(([status, n]) => `${status}=${n}`)
    .join(", ");
  notify(
    ctx,
    `Subagents: ${stats.active}/${stats.maxConcurrent} process-local active, shared holders=${holders.length}/${stats.maxConcurrent}, ${stats.completed} completed, ${stats.sessionFiles} sessions (${oldestAge}); ${summary}${holders.length > 0 ? `; ${formatSharedSubagentCapacityHolders(holders)}` : ""}`,
  );
}

function showStatus(state: SubagentState, ctx: ExtensionContext): void {
  const parentSessionKey = getContextSessionKey(ctx);
  const parentRepoRoot = getContextRepoRoot(ctx);
  if (!parentSessionKey || !parentRepoRoot) {
    notify(ctx, "Current parent session/repository identity required.", "warning");
    return;
  }
  const { counts } = createSubagentDashboardSnapshot(state.sessionsDir, {
    currentSessionKey: parentSessionKey,
    currentRepoRoot: parentRepoRoot,
    sessionScope: "current",
    limit: 0,
  });
  const holders = inspectSharedSubagentCapacity(state.sessionsDir, state.maxConcurrent);
  notify(
    ctx,
    `Subagents (current session): ${Object.entries(counts)
      .map(([status, n]) => `${status}=${n}`)
      .join(", ")}; repository shared holders=${holders.length}/${state.maxConcurrent}`,
  );
}

async function diagnoseObserver(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  action: "open" | "status",
): Promise<void> {
  if (ctx.mode !== "tui" || !ctx.hasUI) {
    notify(
      ctx,
      "Subagent observer diagnostics require interactive Pi TUI; no fallback.",
      "warning",
    );
    return;
  }
  const parentSessionKey = getContextSessionKey(ctx);
  if (!parentSessionKey || !ctx.cwd) {
    notify(ctx, "Current parent session/cwd identity required.", "warning");
    return;
  }
  const cwd = resolve(ctx.cwd);
  const requestId = randomUUID();
  const sameContext = () =>
    ctx.mode === "tui" &&
    ctx.hasUI &&
    getContextSessionKey(ctx) === parentSessionKey &&
    resolve(ctx.cwd) === cwd;
  await new Promise<void>((done) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      done();
    };
    const unavailable = () => {
      if (finished) return;
      if (sameContext())
        notify(
          ctx,
          "Subagent observer unavailable: LH diagnostic listener did not reply. Load pi-little-helpers; no fallback or retry.",
          "warning",
        );
      finish();
    };
    const timer = setTimeout(unavailable, OBSERVER_REPLY_WAIT_MS);
    const request = {
      schema: "asc.subagent-observer.diagnose.v1",
      requestId,
      cwd,
      parentSessionKey,
      action,
      reply(result: unknown) {
        if (finished || !sameContext()) return;
        let response: { message: string; level: "info" | "warning" };
        try {
          if (!result || typeof result !== "object" || Array.isArray(result)) return;
          if (![Object.prototype, null].includes(Object.getPrototypeOf(result))) return;
          const descriptors = Object.getOwnPropertyDescriptors(result);
          const keys = Reflect.ownKeys(result);
          const fields = ["requestId", "message", "level"];
          if (
            keys.length !== fields.length ||
            !fields.every((key) => Object.hasOwn(descriptors, key) && "value" in descriptors[key])
          )
            return;
          // No getters, inherited fields or additional content in the callback envelope.
          const id: unknown = descriptors.requestId.value;
          const raw: unknown = descriptors.message.value;
          const level: unknown = descriptors.level.value;
          if (
            id !== requestId ||
            typeof raw !== "string" ||
            raw.length > MAX_OBSERVER_MESSAGE ||
            (level !== "info" && level !== "warning")
          )
            return;
          const message = inertText(raw, MAX_OBSERVER_DISPLAY).replace(/\s+/gu, " ").trim();
          if (!message) return;
          response = { message, level };
        } catch {
          return; // Malformed objects (including proxies) cannot interrupt the bounded wait.
        }
        finish();
        notify(ctx, response.message, response.level);
      },
    };
    try {
      // The event bus emits synchronously; only the bounded callback reply is awaited.
      pi.events.emit(OBSERVER_EVENT, request);
    } catch {
      if (!finished) unavailable();
    }
  });
}

async function diagnose(
  pi: ExtensionAPI,
  state: SubagentState,
  ctx: ExtensionContext,
  tokens: string[],
): Promise<void> {
  const [command, ...args] = tokens;
  const usage = () =>
    notify(
      ctx,
      "Usage: /subagents diagnose capacity | clear [--delete] | cleanup [--delete] [maxAgeDays] [maxCount] | observer [status]",
      "warning",
    );
  if (command === "capacity" && args.length === 0) {
    showCapacity(state, ctx);
    return;
  }
  if (
    command === "observer" &&
    (args.length === 0 || (args.length === 1 && args[0] === "status"))
  ) {
    await diagnoseObserver(pi, ctx, args.length ? "status" : "open");
    return;
  }
  if (command === "clear" && (args.length === 0 || (args.length === 1 && args[0] === "--delete"))) {
    if (!args.length) notifyPreserved(ctx, command);
    else {
      clearSubagentSessions(state);
      notify(ctx, "Subagent sessions deleted after explicit --delete");
    }
    return;
  }
  if (command === "cleanup") {
    const deleting = args[0] === "--delete";
    const thresholds = deleting ? args.slice(1) : args;
    if (
      thresholds.length > 2 ||
      thresholds.some((n) => !/^\d+$/.test(n) || !Number.isSafeInteger(Number(n)))
    ) {
      usage();
      return;
    }
    const maxAgeDays =
      thresholds[0] === undefined ? DEFAULT_MAX_SESSION_AGE_DAYS : Number(thresholds[0]);
    const maxCount =
      thresholds[1] === undefined ? DEFAULT_MAX_SESSION_COUNT : Number(thresholds[1]);
    if (!Number.isSafeInteger(maxAgeDays * ONE_DAY_MS)) {
      usage();
      return;
    }
    if (!deleting) notifyPreserved(ctx, command);
    else {
      const result = cleanupOldSessions(state, { maxAgeMs: maxAgeDays * ONE_DAY_MS, maxCount });
      notify(
        ctx,
        `Deleted ${result.removedSessions} sessions (${result.removedFiles} files), ${result.kept} remaining after explicit --delete`,
      );
    }
    return;
  }
  usage();
}

export async function routeSubagentCommand(
  pi: ExtensionAPI,
  state: SubagentState,
  ctx: ExtensionContext,
  args = "",
): Promise<void> {
  const text = args.trim();
  if (!text) return requestSubagentTabs(pi, state, ctx);
  if (text === "status") return showStatus(state, ctx);
  if (/^--name(?:\s|$)/u.test(text)) {
    const name = text.slice("--name".length).trim();
    if (!name) {
      notify(ctx, "Usage: /subagents --name <exact name>", "warning");
      return;
    }
    return requestSubagentTabs(pi, state, ctx, "all", name);
  }
  const tokens = text.split(/\s+/u);
  if (tokens[0] === "diagnose") return diagnose(pi, state, ctx, tokens.slice(1));
  return requestSubagentTabs(pi, state, ctx, "all", text);
}

export function registerSubagentCommands(pi: ExtensionAPI, state: SubagentState): void {
  pi.registerCommand("subagents", {
    description: "Open running children or one exact name; status; advanced diagnose namespace",
    handler: (args, ctx) => routeSubagentCommand(pi, state, ctx, args),
  });
}
