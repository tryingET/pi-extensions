/**
 * Non-live dry-run diagnostics for prompt-template execution claim decisions.
 *
 * This module reports which prompt templates the successor would claim without
 * registering slash commands or mutating the Pi host.
 */
import { loadPromptTemplates } from "./loader.js";
import { findPromptCommandCollisions } from "./registration.js";

export const DIAGNOSTIC_REPORT_KIND = "pi-prompt-template-execution/dry-run-report/v1";

function commandName(command) {
  const raw = command?.invocationName ?? command?.name ?? command;
  if (typeof raw !== "string") return undefined;
  return raw.startsWith("/") ? raw.slice(1) : raw;
}

function sortedDiagnostics(diagnostics = []) {
  return [...diagnostics].sort((left, right) => {
    const leftKey = left?.key ?? `${left?.code ?? ""}:${left?.filePath ?? ""}`;
    const rightKey = right?.key ?? `${right?.code ?? ""}:${right?.filePath ?? ""}`;
    return leftKey.localeCompare(rightKey);
  });
}

function claimReasons(prompt) {
  const reasons = [];
  if (prompt.models?.length > 0) reasons.push("model");
  if (prompt.thinking) reasons.push("thinking");
  if (prompt.skill) reasons.push("skill");
  if (/<if-model(?:\s|>)|<else(?:\s|>)|<\/if-model\s*>/.test(prompt.content ?? "")) {
    reasons.push("model-conditionals");
  }
  return reasons.length > 0 ? reasons : ["extension-frontmatter"];
}

function promptNameSort(left, right) {
  return left.name.localeCompare(right.name) || left.filePath.localeCompare(right.filePath);
}

function commandSnapshot(existingCommands) {
  if (!Array.isArray(existingCommands)) return undefined;
  return existingCommands.map(commandName).filter(Boolean).sort();
}

function summarizeDiagnostics(diagnostics) {
  const byCode = {};
  for (const diagnostic of diagnostics) {
    const code = diagnostic?.code ?? "unknown";
    byCode[code] = (byCode[code] ?? 0) + 1;
  }
  return byCode;
}

export function buildPromptTemplateDiagnosticReport(loadResult, options = {}) {
  const prompts = loadResult?.prompts instanceof Map ? loadResult.prompts : new Map();
  const diagnostics = sortedDiagnostics(loadResult?.diagnostics ?? []);
  const existingCommands = options.existingCommands;
  const collisions = findPromptCommandCollisions(prompts, existingCommands);
  const collisionSet = new Set(collisions ?? []);
  const claims = [...prompts.values()].sort(promptNameSort).map((prompt) => ({
    name: prompt.name,
    command: `/${prompt.name}`,
    source: prompt.source,
    subdir: prompt.subdir,
    filePath: prompt.filePath,
    description: prompt.description,
    models: prompt.models ?? [],
    restore: prompt.restore,
    thinking: prompt.thinking,
    skill: prompt.skill,
    reasons: claimReasons(prompt),
    blockedByExistingCommand: collisionSet.has(prompt.name),
  }));

  const registrationReadiness = (() => {
    if (!Array.isArray(existingCommands)) {
      return {
        wouldRegister: false,
        reason: "unknown_existing_commands",
        message:
          "existing command list is unknown; this dry run cannot prove no duplicate slash-command registration",
      };
    }
    if ((collisions ?? []).length > 0) {
      return {
        wouldRegister: false,
        reason: "existing_command_collision",
        collisions,
        message: `would refuse to register prompt command(s) already present: ${collisions.join(", ")}`,
      };
    }
    return {
      wouldRegister: true,
      reason: "clean_command_snapshot",
      message: "no command-name collisions found in the provided explicit command snapshot",
    };
  })();

  return {
    kind: DIAGNOSTIC_REPORT_KIND,
    liveMutation: false,
    cwd: options.cwd,
    promptDirectories: {
      globalDir: options.globalDir,
      projectDir: options.projectDir,
    },
    totals: {
      claimedTemplates: claims.length,
      diagnostics: diagnostics.length,
      commandCollisions: collisions?.length,
      diagnosticCodes: summarizeDiagnostics(diagnostics),
    },
    existingCommands: commandSnapshot(existingCommands),
    claimedTemplates: claims,
    commandCollisions: collisions,
    registrationReadiness,
    diagnostics,
    notes: [
      "dry-run only: no slash commands were registered",
      "loop/chain/workflow semantics remain owned by pi-society-orchestrator",
      "subagent/runtime execution remains owned by pi-autonomous-session-control",
    ],
  };
}

export function loadPromptTemplateDiagnosticReport(options = {}) {
  const load = options.loadPromptTemplates ?? loadPromptTemplates;
  const loadResult =
    options.loadResult ??
    load({ cwd: options.cwd, globalDir: options.globalDir, projectDir: options.projectDir });
  return buildPromptTemplateDiagnosticReport(loadResult, options);
}
