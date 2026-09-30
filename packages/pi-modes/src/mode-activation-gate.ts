/**
summary: "Confirmations an activation needs before it is recorded: unconfirmed project modes it adds, and a new or changed replace_final base."
read_when:
  - "Changing when /mode, /mode use, the selector or /mode-reapprove ask before activating."
*/
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ResolvedMode } from "./mode-definitions.ts";
import { selectedKeys } from "./mode-state.ts";
import type { DefinitionFingerprints, LoadedModes, ModeSelection } from "./modes.ts";
import {
  displaySafe,
  projectConfirmationBody,
  projectConfirmationError,
  projectConfirmationTitle,
  unconfirmedProjectModes,
} from "./project-mode-approvals.ts";
import { requiresReplaceFinalConfirmation } from "./selection-commands.ts";

/** Exact project mode definitions the operator confirmed (path -> digest), and recording new ones. */
export interface ProjectApprovalStore {
  // `modes` are the definitions being evaluated: startup acknowledgements count only where they match.
  projectModeApprovals(modes: readonly ResolvedMode[]): ReadonlyMap<string, string>;
  recordProjectModeApprovals(modes: readonly ResolvedMode[]): void;
}

/** Headless acknowledgements; the TUI asks instead (--confirm-project also widens what it asks). */
export interface ActivationFlags {
  exact: boolean;
  project: boolean;
}

export type ConfirmActivation = (
  ctx: ExtensionCommandContext,
  current: ModeSelection,
  next: ModeSelection,
  modes: LoadedModes["modes"],
  flags: ActivationFlags,
  approvedFingerprints?: DefinitionFingerprints,
) => Promise<boolean>;

export async function confirmExact(
  ctx: ExtensionCommandContext,
  current: ModeSelection,
  next: ModeSelection,
  modes: LoadedModes["modes"],
  explicit: boolean,
  approvedFingerprints?: DefinitionFingerprints,
): Promise<boolean> {
  if (!requiresReplaceFinalConfirmation(current, next, modes, approvedFingerprints)) return true;
  const mode = modes.find((candidate) => candidate.key === next.baseKey);
  if (ctx.mode === "tui") {
    return ctx.ui.confirm(
      `Activate exact-final mode ${displaySafe(mode?.label ?? next.baseKey ?? "")}?`,
      "This removes the host envelope, context, skills, date, cwd, and overlays for future turns.",
    );
  }
  if (explicit) return true;
  throw new Error("replace_final activation requires --confirm-exact in headless/RPC mode");
}

// AK6201: Pi auto-trusts a repository whose only Pi config is .pi/modes, so a project mode's exact
// definition is used only once the operator confirmed it.
export async function confirmProjectModes(
  ctx: ExtensionCommandContext,
  unconfirmed: readonly ResolvedMode[],
  acknowledged: boolean,
): Promise<boolean> {
  if (unconfirmed.length === 0) return true;
  if (ctx.mode === "tui") {
    return ctx.ui.confirm(
      projectConfirmationTitle(unconfirmed),
      projectConfirmationBody(unconfirmed),
    );
  }
  if (acknowledged) return true;
  throw new Error(projectConfirmationError(unconfirmed, "--confirm-project"));
}

/**
 * Gates an activation: unconfirmed project modes it adds, then a new or changed replace_final.
 * An active mode whose file changed is confirmed with /mode-reapprove, or by passing
 * --confirm-project, which covers every project mode in the result; otherwise editing the rest of a
 * composition never stalls on it. Approvals are recorded only once every confirmation passed.
 */
export function createConfirmActivation(services: ProjectApprovalStore): ConfirmActivation {
  return async (ctx, current, next, modes, flags, approvedFingerprints) => {
    const active = new Set(selectedKeys(current));
    const unconfirmed = unconfirmedProjectModes(
      selectedKeys(next).filter((key) => flags.project || !active.has(key)),
      modes,
      services.projectModeApprovals(modes),
    );
    if (!(await confirmProjectModes(ctx, unconfirmed, flags.project))) return false;
    if (!(await confirmExact(ctx, current, next, modes, flags.exact, approvedFingerprints))) {
      return false;
    }
    if (unconfirmed.length > 0) services.recordProjectModeApprovals(unconfirmed);
    return true;
  };
}
