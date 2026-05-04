import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import {
  AGENT_TEAMS,
  type AgentTeam,
  getAgentTeamDisplayLabel,
} from "../src/runtime/agent-routing.ts";
import {
  getBoundaryTelemetryStats,
  getLatestBoundaryTelemetryFailure,
  isBoundaryFailure,
  summarizeBoundaryTelemetry,
} from "../src/runtime/boundaries.ts";
import { listCognitiveTools } from "../src/runtime/cognitive-tools.ts";
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

function normalizeSessionTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function summarizeSessionTokens(ctx: RuntimeStatusContext) {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;

  for (const entry of getSessionEntriesForUsage(ctx)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const messageEntry = entry as {
      type?: unknown;
      message?: {
        role?: unknown;
        usage?: {
          input?: unknown;
          output?: unknown;
          cacheRead?: unknown;
          cacheWrite?: unknown;
        };
      };
    };
    if (messageEntry.type !== "message" || messageEntry.message?.role !== "assistant") {
      continue;
    }

    input += normalizeSessionTokenCount(messageEntry.message.usage?.input);
    output += normalizeSessionTokenCount(messageEntry.message.usage?.output);
    cacheRead += normalizeSessionTokenCount(messageEntry.message.usage?.cacheRead);
    cacheWrite += normalizeSessionTokenCount(messageEntry.message.usage?.cacheWrite);
  }

  return { input, output, cacheRead, cacheWrite };
}

function readContextUsage(ctx: RuntimeStatusContext) {
  try {
    return ctx.getContextUsage?.();
  } catch {
    return undefined;
  }
}

function buildRuntimeSnapshot(ctx: RuntimeStatusContext, toolsResult?: CognitiveToolsResult) {
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
    sessionTokens: summarizeSessionTokens(ctx),
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

function renderRuntimeFooterLine(width: number, theme: FooterTheme, snapshot: RuntimeSnapshot) {
  const layout = fitRuntimeFooterLayout(snapshot, width);
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
      if (!ctx.hasUI) return;

      const toolsResult = await listCognitiveTools({ cwd: ctx.cwd });
      const snapshot = buildRuntimeSnapshot(ctx, toolsResult);
      await ctx.ui.editor("Runtime Status", formatRuntimeStatusReport(snapshot));
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

    ctx.ui.setFooter((tui, theme, _footerData) => ({
      dispose: () => {
        footerHealthState.disposed = true;
      },
      invalidate() {},
      render(width: number): string[] {
        refreshFooterHealth(footerHealthState, ctx.cwd, tui);
        const footerSnapshot = buildRuntimeSnapshot(ctx, footerHealthState.latestToolsResult);
        return [renderRuntimeFooterLine(width, theme, footerSnapshot)];
      },
    }));
  });
}
