/**
 * summary: "assesses non-live package manifests, command collisions, and blockers for prompt execution cutover."
 * read_when:
 *   - "reviewing whether the prompt-template successor remains non-live or is blocked from cutover."
 */
/**
 * Non-live safety report helpers for prompt-template-execution.
 *
 * These helpers make the current candidate posture explicit: package manifests
 * must stay non-live, command snapshots can prove current collisions such as
 * /commit, and the report never registers commands or mutates the host.
 */
import { findPromptCommandCollisions } from "./registration.js";

export const SAFETY_REPORT_KIND = "pi-prompt-template-execution/non-live-safety-report/v1";

function commandName(command) {
  const raw = command?.invocationName ?? command?.name ?? command;
  if (typeof raw !== "string") return undefined;
  return raw.startsWith("/") ? raw.slice(1) : raw;
}

function manifestSummary(name, manifest = {}) {
  return {
    name,
    hasPi: Boolean(manifest.pi),
    hasPiExtensions: Boolean(manifest["pi.extensions"]),
    hasPiPrompts: Boolean(manifest["pi.prompts"]),
  };
}

function manifestBlockers(summary) {
  const blockers = [];
  if (summary.hasPi) blockers.push(`${summary.name}:package.json#pi_present`);
  if (summary.hasPiExtensions) blockers.push(`${summary.name}:package.json#pi.extensions_present`);
  if (summary.hasPiPrompts) blockers.push(`${summary.name}:package.json#pi.prompts_present`);
  return blockers;
}

function promptMap(loadResult) {
  return loadResult?.prompts instanceof Map ? loadResult.prompts : new Map();
}

export function buildNonLiveSafetyReport(input = {}) {
  const promptExecutionManifest = manifestSummary(
    "pi-prompt-template-execution",
    input.promptExecutionManifest,
  );
  const sessionCompactionManifest = manifestSummary(
    "pi-session-compaction",
    input.sessionCompactionManifest,
  );
  const existingCommands = Array.isArray(input.existingCommands)
    ? input.existingCommands.map(commandName).filter(Boolean).sort()
    : undefined;
  const commandCollisions = findPromptCommandCollisions(
    promptMap(input.loadResult),
    input.existingCommands,
  );
  const blockers = [
    ...manifestBlockers(promptExecutionManifest),
    ...manifestBlockers(sessionCompactionManifest),
  ];

  if (commandCollisions === undefined) {
    blockers.push("unknown_existing_commands");
  } else if (commandCollisions.length > 0) {
    blockers.push(...commandCollisions.map((name) => `existing_command:${name}`));
  }

  if (input.externalPromptTemplateModelInstalled === true) {
    blockers.push("external_prompt_template_model_installed");
  }

  return {
    kind: SAFETY_REPORT_KIND,
    liveMutation: false,
    manifests: {
      promptTemplateExecution: promptExecutionManifest,
      sessionCompaction: sessionCompactionManifest,
    },
    existingCommands,
    commandCollisions,
    externalPromptTemplateModelInstalled:
      input.externalPromptTemplateModelInstalled === undefined
        ? undefined
        : Boolean(input.externalPromptTemplateModelInstalled),
    safeAsNonLiveCandidate:
      !promptExecutionManifest.hasPi &&
      !promptExecutionManifest.hasPiExtensions &&
      !promptExecutionManifest.hasPiPrompts &&
      !sessionCompactionManifest.hasPi &&
      !sessionCompactionManifest.hasPiExtensions &&
      !sessionCompactionManifest.hasPiPrompts,
    liveCutoverBlocked: blockers.length > 0,
    blockers,
    notes: [
      "report only: no commands, hooks, prompts, packages, installs, or reloads are changed",
      "an existing /commit collision is expected while npm:pi-prompt-template-model remains installed",
      "live cutover still requires explicit operator approval and exactly one /commit owner",
    ],
  };
}
