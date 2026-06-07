import {
  DEFAULT_NEXUS_LOOP_PROMPTS,
  DEFAULT_VISIBLE_LOOP_PROMPTS,
} from "./visibleLoopPromptTemplates.ts";
import {
  NEXUS_LOOP_COMMAND,
  VISIBLE_LOOP_COMMAND,
  type VisibleLoopRunConfig,
} from "./visibleLoopTypes.ts";

// Visible-loop command profiles implement the repo-level loop taxonomy's
// "visible execution loop/profile" category. Keep Ghostty child launch,
// prompt-queue state, and completion checkpoint ownership in pi-little-helpers;
// orchestrator cognitive/control-plane loops are a separate category.
export interface VisibleLoopCommandProfile {
  commandName: string;
  titlePrefix: string;
  prompts: readonly string[];
  delegateCommitByDefault?: boolean;
}

export const DEFAULT_VISIBLE_LOOP_PROFILE: VisibleLoopCommandProfile = {
  commandName: VISIBLE_LOOP_COMMAND,
  titlePrefix: "Visible loop",
  prompts: DEFAULT_VISIBLE_LOOP_PROMPTS,
};

export const DEFAULT_NEXUS_LOOP_PROFILE: VisibleLoopCommandProfile = {
  commandName: NEXUS_LOOP_COMMAND,
  titlePrefix: "Nexus loop",
  prompts: DEFAULT_NEXUS_LOOP_PROMPTS,
  delegateCommitByDefault: true,
};

export function normalizeVisibleLoopCommandName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || undefined;
}

export function getVisibleLoopCommandName(
  config: Pick<VisibleLoopRunConfig, "commandName" | "runId" | "title">,
): string {
  const explicit = normalizeVisibleLoopCommandName(config.commandName);
  if (explicit) return explicit;
  if (config.runId.startsWith(`${NEXUS_LOOP_COMMAND}-`)) return NEXUS_LOOP_COMMAND;
  if (config.title?.trim().toLowerCase() === "nexus loop") return NEXUS_LOOP_COMMAND;
  return VISIBLE_LOOP_COMMAND;
}

export function getVisibleLoopTitle(
  config: Pick<VisibleLoopRunConfig, "commandName" | "runId" | "title">,
): string {
  const explicit =
    typeof config.title === "string" && config.title.trim() ? config.title.trim() : undefined;
  if (explicit) return explicit;
  return titleCaseCommand(getVisibleLoopCommandName(config));
}

export function getVisibleLoopIntercomEventPrefix(
  config: Pick<VisibleLoopRunConfig, "commandName" | "runId" | "title">,
): string {
  return getVisibleLoopCommandName(config).replace(/-/g, "_").toUpperCase();
}

export function getVisibleLoopHumanLabel(
  config: Pick<VisibleLoopRunConfig, "commandName" | "runId" | "title">,
): string {
  return getVisibleLoopCommandName(config);
}

function titleCaseCommand(commandName: string): string {
  return commandName
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
