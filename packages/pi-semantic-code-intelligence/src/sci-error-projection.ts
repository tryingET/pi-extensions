import path from "node:path";

import { containsHighConfidenceCredential } from "./high-confidence-credential.ts";
import type { SciBridgeCallResult } from "./mcp-bridge.ts";
import type { SciCompositeToolName } from "./tool-definitions.ts";

// Owner contract: semantic-code-intelligence AK #4862, commit
// b4f3c96ed4fc77439390426393244362f14334b2 (src/core/errors.ts).
// The reason is allowlisted locally; producer prose is inspected for disclosure only and never echoed.

const OUTSIDE_WORKSPACE_REASON = "outside_workspace";
const PRODUCER_BOUNDARY_CODE = "InvalidParams";
const WITHHELD_NOTICE = "Producer diagnostics, paths, and stderr were withheld.";
const TARGET_ROOT_RECOVERY =
  "Use a repo-relative path in a Pi session started at the target repository root. A shell cd does not rebind this Pi session's workspace; start a target-root Pi session and retry.";
const NEXUS_RECOVERY_BY_REASON = new Map<string, string>([
  [
    "workspace_ref_required",
    "requires a bound workspace reference (reason: workspace_ref_required). Establish the target-root workspace handshake before retrying.",
  ],
  [
    "workspace_binding_mismatch",
    "could not validate the bound workspace (reason: workspace_binding_mismatch). Start a fresh target-root process; do not silently rebind this one.",
  ],
  [
    "workspace_path_invalid",
    "rejected a malformed workspace-relative path (reason: workspace_path_invalid). Use a normalized repository-relative path in the bound workspace.",
  ],
  [
    "workspace_state_unavailable",
    "could not establish complete workspace state (reason: workspace_state_unavailable). Use a bounded repository workspace whose state can be verified; do not retry unchanged.",
  ],
  [
    OUTSIDE_WORKSPACE_REASON,
    `rejected the request (reason: ${OUTSIDE_WORKSPACE_REASON}). ${TARGET_ROOT_RECOVERY}`,
  ],
  [
    "workspace_path_unresolved",
    "could not resolve the repository-relative path in this bound workspace (reason: workspace_path_unresolved). Verify the target-root Pi session and that the repository-relative file exists before retrying.",
  ],
  [
    "workspace_ref_mismatch",
    "rejected a workspace identity or repository-boundary mismatch (reason: workspace_ref_mismatch). Start a target-root Pi session instead of rebinding this one.",
  ],
  [
    "workspace_state_changed",
    "observed workspace drift (reason: workspace_state_changed). Retry only from a stable repository state.",
  ],
  [
    "stale_snapshot_ref",
    "rejected stale snapshot lineage (reason: stale_snapshot_ref). Restart from the latest exact snapshot reference and rerun checks.",
  ],
  [
    "legacy_unbound_snapshot",
    "rejected legacy unbound snapshot state (reason: legacy_unbound_snapshot). Create a fresh workspace-bound snapshot.",
  ],
]);
const REPO_RELATIVE_INPUT_TOOLS = new Set<SciCompositeToolName>([
  "explore_symbol_impact",
  "locate_confirm_definition",
  "rename_safely",
]);

export function sciInputPathError(
  name: SciCompositeToolName,
  args: Record<string, unknown>,
): string | undefined {
  const file = REPO_RELATIVE_INPUT_TOOLS.has(name) ? args.file : undefined;
  const invalidFile =
    file !== undefined && (typeof file !== "string" || isObviousNonRelativePath(file));
  const paths = name === "structural_patch_checks" ? args.paths : undefined;
  const invalidPaths =
    paths !== undefined &&
    (!Array.isArray(paths) ||
      paths.some((entry) => typeof entry !== "string" || isObviousNonRelativePath(entry)));
  if (!invalidFile && !invalidPaths) return undefined;

  return `SCI workflow ${name} rejected a path before execution (reason: repo_relative_path_required). ${TARGET_ROOT_RECOVERY} The supplied path and current workspace were withheld.`;
}

export function hasSciErrorSignal(result: SciBridgeCallResult): boolean {
  try {
    const envelope = plainRecord(result);
    if (!envelope) return true;
    if (Object.hasOwn(envelope, "error")) return true;
    return Object.hasOwn(envelope, "isError") && envelope.isError !== false;
  } catch {
    return true;
  }
}

export function sciErrorText(name: SciCompositeToolName, result: SciBridgeCallResult): string {
  const recovery = allowlistedRecovery(result);
  return recovery
    ? `SCI workflow ${name} ${recovery} ${WITHHELD_NOTICE}`
    : `SCI workflow ${name} returned an error. ${WITHHELD_NOTICE}`;
}

export function sciBridgeFailureText(name: SciCompositeToolName): string {
  return `SCI workflow ${name} failed. Backend diagnostics, paths, and stderr were withheld.`;
}

/** Only exact locally authored output may be rendered as a safe plain-text error. */
export function knownSciErrorText(name: SciCompositeToolName, text: unknown): string | undefined {
  if (typeof text !== "string" || text.length > 4096) return undefined;
  const messages = [
    sciErrorText(name, { isError: true }),
    sciBridgeFailureText(name),
    sciInputPathError(name, { file: "..", paths: [".."] }),
    ...[...NEXUS_RECOVERY_BY_REASON.values()].map(
      (recovery) => `SCI workflow ${name} ${recovery} ${WITHHELD_NOTICE}`,
    ),
  ];
  return messages.find((message) => message === text);
}

function allowlistedRecovery(result: SciBridgeCallResult): string | undefined {
  try {
    const envelope = plainRecord(result);
    if (
      !envelope ||
      !hasExactKeys(envelope, ["isError", "error", "content"]) ||
      envelope.isError !== true
    ) {
      return undefined;
    }
    const error = plainRecord(envelope.error);
    const data = plainRecord(error?.data);
    if (
      !error ||
      !data ||
      !hasExactKeys(error, ["code", "message", "data"]) ||
      !hasExactKeys(data, ["reason", "remediation"]) ||
      error.code !== PRODUCER_BOUNDARY_CODE ||
      !safeProducerText(error.message) ||
      typeof data.reason !== "string" ||
      !NEXUS_RECOVERY_BY_REASON.has(data.reason) ||
      !safeProducerText(data.remediation)
    ) {
      return undefined;
    }

    if (!Array.isArray(envelope.content) || envelope.content.length !== 1) return undefined;
    const text = plainRecord(envelope.content[0]);
    return text &&
      hasExactKeys(text, ["type", "text"]) &&
      text.type === "text" &&
      text.text === error.message &&
      safeProducerText(text.text)
      ? NEXUS_RECOVERY_BY_REASON.get(data.reason)
      : undefined;
  } catch {
    return undefined;
  }
}

function isObviousNonRelativePath(value: string): boolean {
  const inspected = decodeForInspection(value);
  return (
    value.includes("\0") ||
    inspected.includes("\0") ||
    /^file:/iu.test(inspected) ||
    path.posix.isAbsolute(inspected) ||
    path.win32.isAbsolute(inspected) ||
    /^[A-Za-z]:/u.test(inspected) ||
    inspected.split(/[\\/]/u).includes("..")
  );
}

function safeProducerText(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    Buffer.byteLength(value, "utf8") > 2_048
  ) {
    return false;
  }
  const inspected = decodeForInspection(value);
  if (
    containsHighConfidenceCredential(inspected) ||
    /\b(?:stderr|stdout|stack|traceback|password|passwd|secret|token|api key|private key)\b/iu.test(
      inspected,
    ) ||
    !/^[A-Za-z][A-Za-z .,'()-]*$/u.test(inspected)
  ) {
    return false;
  }
  const words = inspected.toLowerCase().match(/[a-z]+/gu);
  return Boolean(words && words.length >= 3);
}

function decodeForInspection(value: string): string {
  let decoded = value;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    } catch {
      return decoded;
    }
  }
  return decoded;
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}
