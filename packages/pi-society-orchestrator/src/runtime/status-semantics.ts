import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import {
  AGENT_TEAMS,
  type AgentTeam,
  DEFAULT_AGENT_TEAM,
  getAgentTeamDisplayLabel,
} from "./agent-routing.ts";

export interface RuntimeTruthDescriptor {
  packageName: string;
  extensionTitle: string;
  coordinationOwner: string;
  coordinationRole: string;
  executionOwner: string;
  executionRole: string;
  executionSeamLabel: string;
  routingLabel: string;
  routingSelectorCommand: string;
  runtimeStatusCommand: string;
}

export interface RuntimeTruthSnapshot {
  descriptor: RuntimeTruthDescriptor;
  cwd: string;
  model: string;
  routing: {
    activeTeam: AgentTeam;
    defaultTeam: AgentTeam;
    allowedAgents: string[];
  };
  societyDb: {
    path: string;
    available: boolean;
  };
  vault: {
    available: boolean;
    summary: string;
  };
}

export type RuntimeFooterSlotTone = "dim" | "accent" | "warning";

export interface RuntimeFooterSlot {
  id: string;
  tone: RuntimeFooterSlotTone;
  full: string;
  compact?: string;
  optional?: boolean;
}

export interface RuntimeFooterLayout {
  left: RuntimeFooterSlot[];
  right: RuntimeFooterSlot[];
  compactModel: boolean;
}

export const RUNTIME_TRUTH_DESCRIPTOR: RuntimeTruthDescriptor = Object.freeze({
  packageName: "pi-society-orchestrator",
  extensionTitle: "Society Orchestrator",
  coordinationOwner: "pi-society-orchestrator",
  coordinationRole: "coordination/control plane",
  executionOwner: "pi-autonomous-session-control",
  executionRole: "execution/runtime plane",
  executionSeamLabel: "orchestrator→ASC",
  routingLabel: "Routing",
  routingSelectorCommand: "/agents-team",
  runtimeStatusCommand: "/runtime-status",
});

export function createRuntimeTruthSnapshot(params: {
  cwd: string;
  model?: string;
  activeTeam?: AgentTeam;
  defaultTeam?: AgentTeam;
  societyDbPath: string;
  societyDbAvailable: boolean;
  vaultAvailable: boolean;
  vaultSummary: string;
}): RuntimeTruthSnapshot {
  const activeTeam = params.activeTeam ?? DEFAULT_AGENT_TEAM;
  const defaultTeam = params.defaultTeam ?? DEFAULT_AGENT_TEAM;

  return {
    descriptor: RUNTIME_TRUTH_DESCRIPTOR,
    cwd: params.cwd,
    model: params.model || "no-model",
    routing: {
      activeTeam,
      defaultTeam,
      allowedAgents: [...AGENT_TEAMS[activeTeam]],
    },
    societyDb: {
      path: params.societyDbPath,
      available: params.societyDbAvailable,
    },
    vault: {
      available: params.vaultAvailable,
      summary: params.vaultSummary,
    },
  };
}

export function formatRuntimeRoutingStatus(snapshot: RuntimeTruthSnapshot): string {
  return `${snapshot.descriptor.routingLabel}: ${getAgentTeamDisplayLabel(snapshot.routing.activeTeam)}`;
}

export function formatRuntimeFooterLeft(snapshot: RuntimeTruthSnapshot): string {
  return `${snapshot.model} · ${snapshot.descriptor.executionSeamLabel}`;
}

export function selectRuntimeFooterSlotText(slot: RuntimeFooterSlot, compactModel = false): string {
  return compactModel && slot.id === "model" && slot.compact ? slot.compact : slot.full;
}

export function joinRuntimeFooterSlotText(
  slots: RuntimeFooterSlot[],
  compactModel = false,
): string {
  return slots.map((slot) => selectRuntimeFooterSlotText(slot, compactModel)).join(" · ");
}

export function buildRuntimeFooterSlots(snapshot: RuntimeTruthSnapshot): {
  left: RuntimeFooterSlot[];
  right: RuntimeFooterSlot[];
} {
  const [modelLabel, seamLabel = snapshot.descriptor.executionSeamLabel] =
    formatRuntimeFooterLeft(snapshot).split(" · ");

  return {
    left: [
      {
        id: "model",
        tone: "dim",
        full: modelLabel,
        compact: truncateToWidth(modelLabel, 18, "...", true),
      },
      { id: "seam", tone: "accent", full: seamLabel },
      {
        id: "db",
        tone: snapshot.societyDb.available ? "accent" : "warning",
        full: snapshot.societyDb.available ? "DB✓" : "DB✗",
        optional: true,
      },
      {
        id: "vault",
        tone: snapshot.vault.available ? "accent" : "warning",
        full: snapshot.vault.available ? "Vault✓" : "Vault✗",
        optional: true,
      },
    ],
    right: [
      {
        id: "routing",
        tone: "dim",
        full: formatRuntimeRoutingStatus(snapshot),
      },
    ],
  };
}

export function fitRuntimeFooterLayout(
  snapshot: RuntimeTruthSnapshot,
  width: number,
): RuntimeFooterLayout {
  const { left, right } = buildRuntimeFooterSlots(snapshot);
  const fittedLeft = [...left];
  let compactModel = false;
  const rightWidth = visibleWidth(joinRuntimeFooterSlotText(right));

  while (fittedLeft.length > 0) {
    const leftWidth = visibleWidth(joinRuntimeFooterSlotText(fittedLeft, compactModel));
    const totalWidth = leftWidth + 1 + rightWidth;
    if (totalWidth <= width) {
      break;
    }

    let optionalIndex = -1;
    for (let i = fittedLeft.length - 1; i >= 0; i -= 1) {
      if (fittedLeft[i]?.optional) {
        optionalIndex = i;
        break;
      }
    }
    if (optionalIndex !== -1) {
      fittedLeft.splice(optionalIndex, 1);
      continue;
    }

    if (!compactModel && fittedLeft.some((slot) => slot.id === "model" && slot.compact)) {
      compactModel = true;
      continue;
    }

    const modelIndex = fittedLeft.findIndex((slot) => slot.id === "model");
    if (modelIndex !== -1) {
      fittedLeft.splice(modelIndex, 1);
      continue;
    }

    const seamIndex = fittedLeft.findIndex((slot) => slot.id === "seam");
    if (seamIndex !== -1) {
      fittedLeft.splice(seamIndex, 1);
      continue;
    }

    break;
  }

  return {
    left: fittedLeft,
    right,
    compactModel,
  };
}

export function formatRuntimeStatusReport(snapshot: RuntimeTruthSnapshot): string {
  const descriptor = snapshot.descriptor;
  const routing = formatRuntimeRoutingStatus(snapshot);
  const routingAgents = snapshot.routing.allowedAgents.join(", ");
  const dbStatus = snapshot.societyDb.available ? "available" : "missing";
  const activeRoutingDisplay = getAgentTeamDisplayLabel(snapshot.routing.activeTeam);
  const defaultRoutingDisplay = getAgentTeamDisplayLabel(snapshot.routing.defaultTeam);
  const activeRoutingInternalNote =
    activeRoutingDisplay === snapshot.routing.activeTeam
      ? ""
      : ` [internal: \`${snapshot.routing.activeTeam}\`]`;
  const defaultRoutingInternalNote =
    defaultRoutingDisplay === snapshot.routing.defaultTeam
      ? ""
      : ` [internal: \`${snapshot.routing.defaultTeam}\`]`;

  return [
    `# ${descriptor.extensionTitle} Runtime Status`,
    "",
    "## Runtime truth",
    `- coordination owner: \`${descriptor.coordinationOwner}\` (${descriptor.coordinationRole})`,
    `- execution owner: \`${descriptor.executionOwner}\` (${descriptor.executionRole})`,
    `- seam label: \`${descriptor.executionSeamLabel}\``,
    `- routing label: \`${descriptor.routingLabel}\``,
    `- routing selector: \`${descriptor.routingSelectorCommand}\``,
    `- inspector: \`${descriptor.runtimeStatusCommand}\``,
    "",
    "## Live status",
    `- cwd: \`${snapshot.cwd}\``,
    `- model: \`${snapshot.model}\``,
    `- routing: \`${activeRoutingDisplay}\`${activeRoutingInternalNote} (${routingAgents})`,
    `- default routing: \`${defaultRoutingDisplay}\`${defaultRoutingInternalNote}`,
    `- society db: ${dbStatus} — \`${snapshot.societyDb.path}\``,
    `- vault: ${snapshot.vault.summary}`,
    "",
    "## Surface contracts",
    `- footer left: \`${formatRuntimeFooterLeft(snapshot)}\``,
    "- footer optional slots: `DB✓|DB✗ · Vault✓|Vault✗` when width allows",
    `- footer right: \`${routing}\``,
    `- operator-visible status should present orchestrator as the coordination plane while ASC owns execution/runtime behavior`,
  ].join("\n");
}
