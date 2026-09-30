/**
summary: "Composition reports shared by /mode-status, /mode-preview and the selector, and machine output that is safe in a terminal."
read_when:
  - "Changing what status or preview report, or how project confirmations are looked up for them."
*/
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ModeCommandServices } from "./mode-command-handlers.ts";
import { createCompositionReport } from "./mode-observability.ts";
import {
  composeModeSelection,
  type LoadedModes,
  type ModeSelection,
  type ModeStateV3,
  type ProjectTrust,
  resolutionPolicy,
  selectedKeys,
} from "./modes.ts";
import { inertJson } from "./untrusted-text.ts";

export function reportFor(
  ctx: ExtensionCommandContext,
  selection: ModeSelection,
  state: ModeStateV3 | undefined,
  modes: LoadedModes["modes"],
  includePrompt: boolean,
  // Status passes the confirmed project definitions so it reports what a turn really composes;
  // previews pass "review", because reading an unconfirmed prompt is how it gets reviewed.
  trust: ProjectTrust,
  // Previews compose the files as they are now; `state` then only describes the activation.
  options: { applyDrift?: boolean } = {},
) {
  const hostPrompt = ctx.getSystemPrompt();
  const composed = composeModeSelection(
    selection,
    modes,
    ctx.getSystemPromptOptions(),
    hostPrompt,
    trust,
    resolutionPolicy(options.applyDrift === false ? undefined : state),
  );
  return createCompositionReport({
    selection,
    resolved: composed.resolved,
    prompt: composed.prompt,
    hostPrompt,
    ...(state ? { state } : {}),
    includePrompt,
  });
}

// The record is read only when it can matter: a selected mode is project-scoped.
export function approvalsFor(
  services: ModeCommandServices,
  selection: ModeSelection,
  modes: LoadedModes["modes"],
): ReadonlyMap<string, string> {
  const project = selectedKeys(selection).some(
    (key) => modes.find((mode) => mode.key === key)?.scope === "project",
  );
  return project ? services.projectModeApprovals(modes) : new Map();
}

export function writeMachineOutput(value: unknown): void {
  console.log(inertJson(value));
}
