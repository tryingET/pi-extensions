// ---
// summary: "Registers runtime status commands and renders health, routing, token, and extension state in the Pi footer."
// read_when:
//   - "Changing the orchestrator footer, runtime status display, routing selector, or boundary telemetry commands."
// ---

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  AGENT_TEAMS,
  type AgentTeam,
  getAgentTeamDisplayLabel,
} from "../src/runtime/agent-routing.ts";
import {
  formatAkCloseFrameStatusSection,
  readAkCloseFrameStatus,
} from "../src/runtime/ak-close-frame-status.ts";
import {
  getBoundaryTelemetryStats,
  getLatestBoundaryTelemetryFailure,
  isBoundaryFailure,
  summarizeBoundaryTelemetry,
} from "../src/runtime/boundaries.ts";
import { listCognitiveTools } from "../src/runtime/cognitive-tools.ts";
import {
  createSessionTokenHistoryCache,
  type SessionTokenHistoryCache,
  summarizeSessionTokenEntries,
} from "../src/runtime/session-token-history.js";
import {
  createRuntimeTruthSnapshot,
  fitRuntimeFooterLayout,
  formatRuntimeRoutingStatus,
  formatRuntimeStatusReport,
  joinRuntimeFooterSlotText,
  type RuntimeFooterSlot,
  selectRuntimeFooterSlotText,
} from "../src/runtime/status-semantics.ts";
import { getGlobalSessionTeamStore, type TeamScopedContext } from "../src/runtime/team-state.ts";

const SOCIETY_DB =
  process.env.SOCIETY_DB ||
  process.env.AK_DB ||
  path.join(os.homedir(), "ai-society", "society.db");
const DEFAULT_FOOTER_HEALTH_REFRESH_MS = 30_000;

const sessionTeams = getGlobalSessionTeamStore();
const registeredApis = new WeakSet<ExtensionAPI>();

type RuntimeStatusContext = TeamScopedContext & {
  cwd: string;
  model?: { id?: string };
  getContextUsage?: () =>
    | {
        tokens: number | null;
        contextWindow: number;
        percent: number | null;
      }
    | undefined;
};
type RuntimeSnapshot = ReturnType<typeof createRuntimeTruthSnapshot>;
type FooterTheme = {
  fg(color: string, text: string): string;
};
type FooterTui = {
  requestRender(): void;
};
type CognitiveToolsResult = Awaited<ReturnType<typeof listCognitiveTools>>;
type FooterHealthState = {
  latestToolsResult?: CognitiveToolsResult;
  lastProbeAt: number;
  probeInFlight?: Promise<void>;
  disposed: boolean;
};

function parseFooterHealthRefreshMs(value: string | undefined) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FOOTER_HEALTH_REFRESH_MS;
}

function getFooterHealthRefreshMs() {
  return parseFooterHealthRefreshMs(process.env.PI_ORCH_FOOTER_HEALTH_REFRESH_MS);
}

function getSessionEntriesForUsage(ctx: RuntimeStatusContext): unknown[] {
  const sessionManager = ctx.sessionManager;
  if (!sessionManager || typeof sessionManager !== "object") {
    return [];
  }

  const manager = sessionManager as {
    getEntries?: () => unknown;
    getBranch?: () => unknown;
  };

  try {
    if (typeof manager.getEntries === "function") {
      const entries = manager.getEntries();
      return Array.isArray(entries) ? entries : [];
    }
    if (typeof manager.getBranch === "function") {
      const entries = manager.getBranch();
      return Array.isArray(entries) ? entries : [];
    }
  } catch {
    return [];
  }

  return [];
}

function summarizeSessionTokens(ctx: RuntimeStatusContext, cache?: SessionTokenHistoryCache) {
  return summarizeSessionTokenEntries(getSessionEntriesForUsage(ctx), cache);
}

function readContextUsage(ctx: RuntimeStatusContext) {
  try {
    return ctx.getContextUsage?.();
  } catch {
    return undefined;
  }
}

function buildRuntimeSnapshot(
  ctx: RuntimeStatusContext,
  toolsResult?: CognitiveToolsResult,
  tokenHistoryCache?: SessionTokenHistoryCache,
) {
  const contextUsage = readContextUsage(ctx);

  return createRuntimeTruthSnapshot({
    cwd: ctx.cwd,
    model: ctx.model?.id,
    activeTeam: sessionTeams.getTeam(ctx),
    contextUsage: contextUsage
      ? {
          tokens: contextUsage.tokens,
          contextWindow: contextUsage.contextWindow,
        }
      : undefined,
    sessionTokens: summarizeSessionTokens(ctx, tokenHistoryCache),
    boundaryTelemetry: {
      ...getBoundaryTelemetryStats(),
      latestFailure: getLatestBoundaryTelemetryFailure(),
    },
    societyDbPath: SOCIETY_DB,
    societyDbAvailable: fs.existsSync(SOCIETY_DB),
    vaultAvailable: toolsResult ? !isBoundaryFailure(toolsResult) : false,
    vaultSummary: !toolsResult
      ? "not refreshed in this interaction"
      : isBoundaryFailure(toolsResult)
        ? `unavailable (${toolsResult.error.slice(0, 120)})`
        : `available (${toolsResult.value.length} cognitive tools)`,
  });
}

function summarizeFooterHealth(toolsResult?: CognitiveToolsResult) {
  if (!toolsResult) {
    return "unrefreshed";
  }
  return isBoundaryFailure(toolsResult)
    ? `error:${toolsResult.error}`
    : `ok:${toolsResult.value.length}`;
}

function createFooterHealthState(initialToolsResult?: CognitiveToolsResult): FooterHealthState {
  return {
    latestToolsResult: initialToolsResult,
    lastProbeAt: initialToolsResult ? Date.now() : 0,
    probeInFlight: undefined,
    disposed: false,
  };
}

function shouldRefreshFooterHealth(state: FooterHealthState) {
  if (state.disposed || state.probeInFlight) {
    return false;
  }
  return Date.now() - state.lastProbeAt >= getFooterHealthRefreshMs();
}

function refreshFooterHealth(state: FooterHealthState, cwd?: string, tui?: FooterTui) {
  if (!shouldRefreshFooterHealth(state)) {
    return;
  }

  const previousHealth = summarizeFooterHealth(state.latestToolsResult);
  state.lastProbeAt = Date.now();
  state.probeInFlight = (async () => {
    let nextToolsResult: CognitiveToolsResult;
    try {
      nextToolsResult = await listCognitiveTools({ cwd });
    } catch (error) {
      nextToolsResult = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    state.latestToolsResult = nextToolsResult;
    if (!state.disposed && summarizeFooterHealth(nextToolsResult) !== previousHealth) {
      tui?.requestRender();
    }
  })().finally(() => {
    state.probeInFlight = undefined;
  });
}

function renderFooterSlotText(
  theme: FooterTheme,
  slots: RuntimeFooterSlot[],
  compactModel = false,
) {
  const separator = theme.fg("muted", " · ");
  return slots
    .map((slot) => theme.fg(slot.tone, selectRuntimeFooterSlotText(slot, compactModel)))
    .join(separator);
}

function sanitizeStatusText(text: string): string {
  const escapeChar = String.fromCharCode(27);
  return text
    .replace(new RegExp(`${escapeChar}\\[[0-9;]*m`, "g"), "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function compactExtensionStatus(key: string, text: string): string | undefined {
  const sanitized = sanitizeStatusText(text);
  if (!sanitized) return undefined;

  if (key === "asc-rewind") {
    const match = sanitized.match(/(\d+) rewind points? \/ (\d+) snapshots?/);
    return match ? `rw ${match[1]}/${match[2]}` : sanitized.replace(/^◆\s*/, "rw ");
  }
  if (key === "stash") {
    return sanitized.replace(/^stash:\s*/, "stash ");
  }
  if (key === "society-context") {
    return sanitized;
  }
  return undefined;
}

function buildExtensionStatusSlots(statuses: ReadonlyMap<string, string>): RuntimeFooterSlot[] {
  const slots: RuntimeFooterSlot[] = [];
  for (const key of ["asc-rewind", "society-context", "stash"]) {
    const status = statuses.get(key);
    const compact = status ? compactExtensionStatus(key, status) : undefined;
    if (compact) {
      slots.push({
        id: `status-${key}`,
        tone: "dim",
        full: compact,
        optional: true,
      });
    }
  }
  return slots;
}

function renderRuntimeFooterLine(
  width: number,
  theme: FooterTheme,
  snapshot: RuntimeSnapshot,
  extraLeftSlots: RuntimeFooterSlot[] = [],
) {
  const layout = fitRuntimeFooterLayout(snapshot, width, extraLeftSlots);
  const rightPlain = joinRuntimeFooterSlotText(layout.right);
  const rightText = renderFooterSlotText(theme, layout.right);
  const rightWidth = visibleWidth(rightPlain);

  if (rightWidth >= width || layout.left.length === 0) {
    return truncateToWidth(rightText, width);
  }

  const leftPlain = joinRuntimeFooterSlotText(layout.left, layout.compactModel);
  const leftText = renderFooterSlotText(theme, layout.left, layout.compactModel);
  const leftWidth = visibleWidth(leftPlain) + 1;
  const paddedRightWidth = rightWidth + 1;
  if (leftWidth + paddedRightWidth + 1 > width) {
    return truncateToWidth(rightText, width);
  }

  const leftSegment = ` ${leftText}`;
  const rightSegment = `${rightText} `;
  const padWidth = Math.max(1, width - leftWidth - paddedRightWidth);
  return leftSegment + " ".repeat(padWidth) + rightSegment;
}

export default function runtimeFooterExtension(pi: ExtensionAPI) {
  if (registeredApis.has(pi)) {
    return;
  }
  registeredApis.add(pi);

  pi.registerCommand("cognitive", {
    description: "List available cognitive tools from the vault",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const toolsResult = await listCognitiveTools({ cwd: ctx.cwd });
      if (isBoundaryFailure(toolsResult)) {
        ctx.ui.notify(`Failed to list cognitive tools: ${toolsResult.error}`, "error");
        return;
      }

      const tools = toolsResult.value;
      const output = tools.map((t) => `- \`${t.name}\` — ${t.description}`).join("\n");
      await ctx.ui.editor(
        "Cognitive Tools",
        `# Available Cognitive Tools (${tools.length})\n\n${output}`,
      );
    },
  });

  pi.registerCommand("agents-team", {
    description: "Select routing scope",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const options = Object.entries(AGENT_TEAMS).map(([name, agents]) => ({
        value: name as AgentTeam,
        label: `${getAgentTeamDisplayLabel(name)} — ${agents.join(", ")}`,
      }));

      const choice = await ctx.ui.select(
        "Select routing scope",
        options.map((o) => o.label),
      );
      if (choice === undefined) return;

      const idx = options.findIndex((o) => o.label === choice);
      if (idx >= 0) {
        const team = options[idx].value;
        const stored = sessionTeams.setTeam(ctx, team);
        if (!stored) {
          ctx.ui.notify(
            "Cannot set team for this session because no session identity is available.",
            "error",
          );
          return;
        }

        const snapshot = buildRuntimeSnapshot(ctx);
        ctx.ui.notify(
          `${formatRuntimeRoutingStatus(snapshot)} (${AGENT_TEAMS[team].join(", ")})`,
          "info",
        );
      }
    },
  });

  pi.registerCommand("runtime-status", {
    description: "Inspect runtime truth and routing status",
    handler: async (_args, ctx) => {
      const toolsResult = await listCognitiveTools({ cwd: ctx.cwd });
      const snapshot = buildRuntimeSnapshot(ctx, toolsResult);
      const akCloseFrameStatus = await readAkCloseFrameStatus({
        cwd: ctx.cwd,
        societyDb: SOCIETY_DB,
      });
      const output = `${formatRuntimeStatusReport(snapshot)}\n\n${formatAkCloseFrameStatusSection(akCloseFrameStatus)}`;
      if (!ctx.hasUI) {
        console.log(output);
        return;
      }
      await ctx.ui.editor("Runtime Status", output);
    },
  });

  pi.registerCommand("runtime-boundary-telemetry", {
    description: "Inspect lower-plane boundary execution telemetry",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      await ctx.ui.editor("Runtime Boundary Telemetry", summarizeBoundaryTelemetry());
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const toolsResult = await listCognitiveTools({ cwd: ctx.cwd });
    const footerHealthState = createFooterHealthState(toolsResult);
    const snapshot = buildRuntimeSnapshot(ctx, footerHealthState.latestToolsResult);
    const dbOk = snapshot.societyDb.available;
    const vaultStatus = isBoundaryFailure(toolsResult)
      ? `✗ (${toolsResult.error.slice(0, 120)})`
      : `✓ (${toolsResult.value.length} cognitive tools)`;

    ctx.ui.notify(
      `${snapshot.descriptor.extensionTitle} status surface\n` +
        `DB: ${dbOk ? "✓" : "✗"} ${snapshot.societyDb.path}\n` +
        `Vault: ${vaultStatus}\n` +
        `${formatRuntimeRoutingStatus(snapshot)}\n\n` +
        `/cognitive          List cognitive tools\n` +
        `${snapshot.descriptor.routingSelectorCommand.padEnd(20, " ")}Select routing scope\n` +
        `${snapshot.descriptor.runtimeStatusCommand.padEnd(20, " ")}Inspect runtime truth\n` +
        `/runtime-boundary-telemetry Inspect lower-plane telemetry`,
      isBoundaryFailure(toolsResult) ? "warning" : "info",
    );

    const tokenHistoryCache = createSessionTokenHistoryCache();
    ctx.ui.setFooter((tui, theme, footerData) => ({
      dispose: () => {
        footerHealthState.disposed = true;
      },
      invalidate() {
        // History continuity is checked at render time using stable session entry ids plus
        // boundary usage, so defensive copies and mutable tail usage invalidate safely.
      },
      render(width: number): string[] {
        refreshFooterHealth(footerHealthState, ctx.cwd, tui);
        const footerSnapshot = buildRuntimeSnapshot(
          ctx,
          footerHealthState.latestToolsResult,
          tokenHistoryCache,
        );
        const extensionStatuses = footerData?.getExtensionStatuses?.() ?? new Map<string, string>();
        const extensionStatusSlots = buildExtensionStatusSlots(extensionStatuses);
        return [renderRuntimeFooterLine(width, theme, footerSnapshot, extensionStatusSlots)];
      },
    }));
  });
}
