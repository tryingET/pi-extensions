// ---
// summary: deterministic digest, diagnostic, and logical-identity helpers shared by fleet lint modules.
// read_when:
//   - changing fleet report hashing, diagnostic ordering, or logical repository identity.
// ---

import { createHash } from "node:crypto";
import { basename, dirname } from "node:path";
import type { FleetLintDiagnostic } from "./fleet-lint-types.ts";

export function fleetSha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableFleetValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableFleetValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, stableFleetValue(entry)]),
  );
}

export function addFleetDiagnostic(
  target: FleetLintDiagnostic[],
  repo: string,
  code: string,
  severity: FleetLintDiagnostic["severity"],
  message: string,
  path?: string,
  hint?: string,
): void {
  target.push({
    code,
    severity,
    repo,
    ...(path ? { path } : {}),
    message,
    ...(hint ? { hint } : {}),
  });
}

export function sortFleetDiagnostics(values: FleetLintDiagnostic[]): FleetLintDiagnostic[] {
  const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
  return values.sort((a, b) =>
    compare(
      [a.repo, a.code, a.path ?? "", a.message].join("\0"),
      [b.repo, b.code, b.path ?? "", b.message].join("\0"),
    ),
  );
}

function logicalFleetPath(root: string): string {
  const parent = basename(dirname(root)) || "root";
  const leaf = basename(root) || "unknown";
  return `${parent}/${leaf}`;
}

export function logicalFleetRepo(root: string): string {
  return logicalFleetPath(root);
}

export function logicalFleetRoot(root: string): string {
  return logicalFleetPath(root);
}
