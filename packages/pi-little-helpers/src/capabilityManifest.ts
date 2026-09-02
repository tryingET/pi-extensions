// summary: "declares visible-peer command and tool capabilities, toolbox exports, and registration completeness checks"
// read_when:
//   - "changing little-helpers command names, peer tool projections, toolbox exposure, or capability validation"

export const LITTLE_HELPERS_CAPABILITY_ID = "pi-little-helpers.visible-peer-spawn";

export const LITTLE_HELPERS_COMMAND_NAMES = [
  "sidequest",
  "scoutpeer",
  "parallelquest",
  "fresh-handoff",
  "visible-loop",
  "nexus-loop",
] as const;
export const LITTLE_HELPERS_PEER_TOOL_NAMES = [
  "fork_peer_spawn",
  "scout_peer_spawn",
  "fresh_handoff_spawn",
  "candidate_peer_spawn",
  "candidate_peer_cleanup",
  "candidate_peer_closeout",
] as const;

export const LITTLE_HELPERS_TOOL_COMMAND_PROJECTIONS = [
  {
    tool: "fork_peer_spawn",
    command: "sidequest",
    slash: "/sidequest",
    sessionMode: "forked-context",
    reportBack: "manual-visible-or-explicit-intercom",
  },
  {
    tool: "scout_peer_spawn",
    command: "scoutpeer",
    slash: "/scoutpeer",
    sessionMode: "clean-scout",
    reportBack: "intercom-when-session-id-available",
  },
  {
    tool: "candidate_peer_spawn",
    command: "parallelquest",
    slash: "/parallelquest",
    sessionMode: "clean-candidate-worktree",
    reportBack: "manual-visible",
  },
  {
    tool: "fresh_handoff_spawn",
    command: "fresh-handoff",
    slash: "/fresh-handoff",
    sessionMode: "clean-handoff",
    reportBack: "none-continuation-session",
  },
] as const;

export const LITTLE_HELPERS_TOOLBOX_EXPORTS = [
  {
    mode: "monorepo-sibling",
    specifier: "packages/pi-little-helpers/src/toolboxBundle.ts",
  },
  {
    mode: "published-package",
    specifier: "@tryinget/pi-little-helpers/toolbox-bundle",
  },
] as const;

export const LITTLE_HELPERS_CAPABILITY_MANIFEST = {
  schemaVersion: 1,
  id: LITTLE_HELPERS_CAPABILITY_ID,
  ownerPackage: "@tryinget/pi-little-helpers",
  title: "Visible peer and loop helpers",
  description:
    "Fork, scout, candidate peer, clean handoff, and visible loop slash-command surfaces, with model-callable tools for peer spawn plus lifecycle-v2 candidate closeout and quarantined registry-v1 inspection. Unscoped child cwd receives controller company provenance automatically; session mode is not a company switch.",
  commands: LITTLE_HELPERS_COMMAND_NAMES,
  commandOnlySurfaces: ["visible-loop", "nexus-loop"],
  tools: LITTLE_HELPERS_PEER_TOOL_NAMES,
  projections: LITTLE_HELPERS_TOOL_COMMAND_PROJECTIONS,
  toolboxExports: LITTLE_HELPERS_TOOLBOX_EXPORTS,
} as const;

export type LittleHelpersCommandName = (typeof LITTLE_HELPERS_COMMAND_NAMES)[number];
export type LittleHelpersPeerToolName = (typeof LITTLE_HELPERS_PEER_TOOL_NAMES)[number];
export type LittleHelpersToolCommandProjection =
  (typeof LITTLE_HELPERS_TOOL_COMMAND_PROJECTIONS)[number];

export interface CapabilityRegistrationSnapshot {
  commands: string[];
  tools: string[];
}

export interface CapabilityRegistrationCheck {
  ok: boolean;
  capabilityId: typeof LITTLE_HELPERS_CAPABILITY_ID;
  missingCommands: LittleHelpersCommandName[];
  missingTools: LittleHelpersPeerToolName[];
}

export function checkLittleHelpersCapabilityRegistration(
  snapshot: CapabilityRegistrationSnapshot,
): CapabilityRegistrationCheck {
  const commandSet = new Set(snapshot.commands);
  const toolSet = new Set(snapshot.tools);
  const missingCommands = LITTLE_HELPERS_COMMAND_NAMES.filter(
    (command) => !commandSet.has(command),
  );
  const missingTools = LITTLE_HELPERS_PEER_TOOL_NAMES.filter((tool) => !toolSet.has(tool));
  return {
    ok: missingCommands.length === 0 && missingTools.length === 0,
    capabilityId: LITTLE_HELPERS_CAPABILITY_ID,
    missingCommands,
    missingTools,
  };
}
