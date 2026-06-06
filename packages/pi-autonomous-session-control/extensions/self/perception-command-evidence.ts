/**
 * Command normalization and validation/recovery evidence helpers for self perception.
 */

import type { CommandExecution, ErrorEncounter, OperationLog } from "./types.ts";

const COMMAND_NORMALIZE_MAX_LEN = 100;

const PACKAGE_MANAGER_VALIDATION_SCRIPT =
  "(?:test|check|lint|typecheck|quality(?::\\w+)?|ci|release:check(?::quick)?)";
const PACKAGE_MANAGER_SCOPE_OPTION =
  "(?:(?:--prefix|-c|--cwd|--workspace|-w|--filter|-F|-C)(?:\\s+|=)\\S+|--\\S+(?:=\\S+)?)";
const PACKAGE_MANAGER_VALIDATION_PATTERNS = [
  new RegExp(
    `\\b(?:npm|pnpm|yarn)(?:\\s+${PACKAGE_MANAGER_SCOPE_OPTION})*\\s+(?:run\\s+)?${PACKAGE_MANAGER_VALIDATION_SCRIPT}\\b`,
  ),
  new RegExp(
    `\\b(?:npm|pnpm|yarn)\\s+run(?:\\s+${PACKAGE_MANAGER_SCOPE_OPTION})*\\s+${PACKAGE_MANAGER_VALIDATION_SCRIPT}\\b`,
  ),
];

export function normalizeCommand(command: string): string {
  return (
    command
      // Remove specific numbers (but keep structure)
      .replace(/\b\d{2,}\b/g, "N")
      // Remove timestamps
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, "TS")
      // Remove file paths (keep basename)
      .replace(/\/[^\s]+\//g, "PATH/")
      // Remove UUIDs
      .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "UUID")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, COMMAND_NORMALIZE_MAX_LEN)
  );
}

export function normalizeRawCommandForStorage(command: string): string {
  return command.slice(0, COMMAND_NORMALIZE_MAX_LEN);
}

export function extractErrorSignature(message: string): string {
  return message
    .slice(0, 80)
    .replace(/\b\d+\b/g, "N")
    .replace(/"[^"]*"/g, '"..."')
    .replace(/'[^']*'/g, "'...'")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidationOrQualityCommand(lowerCommand: string): boolean {
  return (
    PACKAGE_MANAGER_VALIDATION_PATTERNS.some((pattern) => pattern.test(lowerCommand)) ||
    /\b(?:node\s+--test|vitest|jest|tsc|biome\s+(?:check|ci|lint)|just\s+(?:test|check|lint|ci))\b/.test(
      lowerCommand,
    )
  );
}

export function isProductiveWorkflowCommand(command: string): boolean {
  const lower = command.trim().toLowerCase();
  return (
    /\bprovenance[-_]?note\b|\bpi[-_]?provenance\b/.test(lower) ||
    /^git\s+(?:commit|status|log|diff|show|rev-parse)\b/.test(lower) ||
    /^ak\s+task\s+(?:complete|close|done|finish|update\b.*\b(?:done|completed))\b/.test(lower) ||
    isValidationOrQualityCommand(lower)
  );
}

export function isRecoveryEvidenceCommand(command: string): boolean {
  return isValidationOrQualityCommand(command.trim().toLowerCase());
}

export function commandIsProductiveWorkflow(cmd: CommandExecution): boolean {
  return cmd.productiveWorkflow ?? isProductiveWorkflowCommand(cmd.rawCommand);
}

export function commandIsRecoveryEvidence(cmd: CommandExecution): boolean {
  if (!cmd.success) return false;
  if (typeof cmd.recoveryEvidence === "boolean") return cmd.recoveryEvidence;
  return (
    cmd.rawCommand.length < COMMAND_NORMALIZE_MAX_LEN && isRecoveryEvidenceCommand(cmd.rawCommand)
  );
}

export function latestSuccessfulRecoveryEvidenceCommandAt(log: OperationLog): number {
  return log.commands.reduce(
    (latest, cmd) => (commandIsRecoveryEvidence(cmd) ? Math.max(latest, cmd.timestamp) : latest),
    0,
  );
}

export function latestRecoveryEvidenceCommandIndex(log: OperationLog): number {
  let latestRecoveryEvidenceIndex = -1;
  log.commands.forEach((cmd, index) => {
    if (commandIsRecoveryEvidence(cmd)) {
      latestRecoveryEvidenceIndex = index;
    }
  });
  return latestRecoveryEvidenceIndex;
}

export function recoveryEvidenceAppliesToError(error: ErrorEncounter): boolean {
  return error.toolName === "bash";
}

export function activeErrorCount(error: ErrorEncounter, latestRecoveryEvidenceAt: number): number {
  const lastSeen = error.lastSeen ?? error.timestamp;
  if (
    recoveryEvidenceAppliesToError(error) &&
    latestRecoveryEvidenceAt > 0 &&
    lastSeen < latestRecoveryEvidenceAt
  ) {
    return 0;
  }
  return typeof error.activeCount === "number" ? error.activeCount : error.count;
}
