import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SciCompositeToolName } from "./tool-definitions.ts";

const FORBIDDEN_FIELDS = new Set([
  "backend",
  "backenddiagnostics",
  "backenderror",
  "cwd",
  "env",
  "environment",
  "error",
  "errors",
  "stack",
  "stacktrace",
  "stderr",
  "traceback",
  "workingdirectory",
  "workspace",
  "workspaceroot",
]);
const PREVIEW_WORKFLOWS = new Set<SciCompositeToolName>(["safe_write", "structural_patch_checks"]);

/**
 * Projects workspace-contained file URIs to repo-relative paths and rejects
 * producer fields, keys, or strings that could disclose host/backend state.
 */
export function sanitizeProducerDisclosure(
  value: Record<string, unknown>,
  workflow: SciCompositeToolName,
  workspace: string,
): { ok: boolean; changed: boolean } {
  const state = { changed: false };
  return {
    ok: sanitizeRecord(value, workflow, path.resolve(workspace), state),
    changed: state.changed,
  };
}

function sanitizeRecord(
  record: Record<string, unknown>,
  workflow: SciCompositeToolName,
  workspace: string,
  state: { changed: boolean },
): boolean {
  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeKey(key);
    const safeKey = sanitizeString(key, workspace);
    if (safeKey === undefined || safeKey !== key) return false;
    if (workflow !== "explore_symbol_impact" && FORBIDDEN_FIELDS.has(normalizedKey)) {
      delete record[key];
      state.changed = true;
      continue;
    }
    if (PREVIEW_WORKFLOWS.has(workflow)) {
      if (normalizedKey === "applied" && value !== false) return false;
      if (
        ["apply", "applyargs", "applyargument", "applycommand", "applyinstructions"].includes(
          normalizedKey,
        )
      ) {
        delete record[key];
        state.changed = true;
        continue;
      }
    }
    if (typeof value === "string") {
      const projected = sanitizeString(value, workspace);
      if (projected === undefined) return false;
      if (projected !== value) state.changed = true;
      record[key] = projected;
      continue;
    }
    if (Array.isArray(value)) {
      if (!sanitizeArray(value, workflow, workspace, state)) return false;
      continue;
    }
    if (isRecord(value) && !sanitizeRecord(value, workflow, workspace, state)) return false;
  }
  return true;
}

function sanitizeArray(
  values: unknown[],
  workflow: SciCompositeToolName,
  workspace: string,
  state: { changed: boolean },
): boolean {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value === "string") {
      const projected = sanitizeString(value, workspace);
      if (projected === undefined) return false;
      if (projected !== value) state.changed = true;
      values[index] = projected;
      continue;
    }
    if (Array.isArray(value)) {
      if (!sanitizeArray(value, workflow, workspace, state)) return false;
      continue;
    }
    if (isRecord(value) && !sanitizeRecord(value, workflow, workspace, state)) return false;
  }
  return true;
}

function sanitizeString(value: string, workspace: string): string | undefined {
  if (/^file:\/\//i.test(value)) return containedFileUri(value, workspace);
  if (validSnapshotUri(value)) return value;
  const decoded = decodeForInspection(value);
  if (!decoded.complete) return undefined;
  const inspected = decoded.value;
  if (path.isAbsolute(inspected)) return containedAbsolutePath(inspected, workspace);
  if (
    /file:\/\//i.test(inspected) ||
    containsAbsolutePath(inspected) ||
    /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(inspected) ||
    /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/i.test(inspected) ||
    /\b[A-Za-z_][A-Za-z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|DATABASE_URL)[A-Za-z0-9_]*\s*=/i.test(
      inspected,
    ) ||
    /-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----/i.test(inspected) ||
    /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/.test(inspected) ||
    /(?:Traceback \(most recent call last\):|Caused by:|[A-Za-z][A-Za-z0-9_.]*(?:Error|Exception):)/.test(
      inspected,
    ) ||
    /ALLOW_SNAPSHOT_APPLY|\bapply\s*:\s*true\b|\b(?:sci|semantic-code(?:-intelligence)?)\s+apply\b/i.test(
      inspected,
    ) ||
    /\bapply\b.{0,64}\b(?:snapshot|patch|change|result)\b|\b(?:snapshot|patch|change|result)\b.{0,64}\bapply\b/i.test(
      inspected,
    )
  ) {
    return undefined;
  }
  return value;
}

function validSnapshotUri(value: string): boolean {
  return /^snapshot:\/\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9._-]+)*$/.test(value);
}

function containedFileUri(value: string, workspace: string): string | undefined {
  try {
    return containedAbsolutePath(path.resolve(fileURLToPath(value)), workspace);
  } catch {
    return undefined;
  }
}

function containedAbsolutePath(value: string, workspace: string): string | undefined {
  const relative = path.relative(workspace, path.resolve(value));
  if (relative === "") return ".";
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return undefined;
  }
  return relative.split(path.sep).join("/");
}

function containsAbsolutePath(value: string): boolean {
  return (
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /(?:^|[^A-Za-z0-9._-])\/(?!\/)/.test(value) ||
    /(?:^|[^A-Za-z0-9._-])[A-Za-z]:[\\/]/.test(value) ||
    /(?:^|[^A-Za-z0-9._-])\\\\/.test(value)
  );
}

function decodeForInspection(value: string): { value: string; complete: boolean } {
  let decoded = value;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return { value: decoded, complete: true };
      decoded = next;
    } catch {
      return { value: decoded, complete: !/%[0-9A-Fa-f]{2}/.test(decoded) };
    }
  }
  try {
    return { value: decoded, complete: decodeURIComponent(decoded) === decoded };
  } catch {
    return { value: decoded, complete: !/%[0-9A-Fa-f]{2}/.test(decoded) };
  }
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
