import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { digest, id, integer, record, refuse } from "./json.js";
import {
  accountLocator,
  assertDomainPhysical,
  canonicalPath,
  conflicts,
  type Locator,
  occupied,
  readSnapshot,
  type Snapshot,
} from "./state.js";
export const producer = Object.freeze({
  package: "@tryinget/pi-little-helpers",
  version: "0.9.0",
  interface: "pi.task-session.classification.v1",
});
export interface ClassificationRequest {
  schema: "pi.task-session.classify-request.v1";
  requestId: string;
  akInstance: string;
  taskIds: number[];
  cwd: string;
}
export function classificationRequest(v: unknown): ClassificationRequest {
  const r = record(v, ["schema", "requestId", "akInstance", "taskIds", "cwd"]);
  if (r.schema !== "pi.task-session.classify-request.v1") refuse("request_version_unsupported");
  id(r.requestId);
  id(r.akInstance);
  if (!Array.isArray(r.taskIds) || !r.taskIds.length || r.taskIds.length > 256)
    refuse("invalid_tasks");
  r.taskIds.forEach((v: unknown) => {
    integer(v);
  });
  if (new Set(r.taskIds).size !== r.taskIds.length) refuse("duplicate_tasks");
  canonicalPath(r.cwd);
  return structuredClone(r) as ClassificationRequest;
}
/** Filesystem-only Git identity, no git process, no hooks, no DB. */
export function commonGit(cwd: string): string {
  const dot = join(cwd, ".git");
  const s = lstatSync(dot);
  if (s.isSymbolicLink()) refuse("git_identity_ambiguous");
  let gitDir = dot;
  if (s.isFile()) {
    if (s.size > 4096) refuse("git_identity_ambiguous");
    const m = /^gitdir: ([^\r\n]+)\n?$/.exec(
      new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(dot)),
    );
    if (!m) refuse("git_identity_ambiguous");
    gitDir = realpathSync(resolve(cwd, m[1]));
  } else if (!s.isDirectory()) refuse("git_identity_ambiguous");
  try {
    const path = join(gitDir, "commondir");
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096)
      refuse("git_identity_ambiguous");
    const value = readFileSync(path, "utf8").trim();
    if (!value || value.includes("\n")) refuse("git_identity_ambiguous");
    return realpathSync(resolve(gitDir, value));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return realpathSync(gitDir);
}
export function classifySnapshot(
  request: ClassificationRequest,
  s: Snapshot,
  git = commonGit(request.cwd),
) {
  const base = {
    schema: "pi.task-session.classification.v1",
    producer,
    requestDigest: digest(request),
    namespace: { id: s.namespace, generation: s.generation, snapshotDigest: digest(s) },
  };
  const domains = request.taskIds.map((taskId) =>
    s.domains.find((d) => d.taskId === taskId && d.akInstance === request.akInstance),
  );
  // Include requested cwd independently; task inventory alone cannot conceal an enrolled checkout.
  const requested = {
    akInstance: request.akInstance,
    taskId: request.taskIds[0],
    checkout: request.cwd,
    commonGit: git,
    sharedEffects: [],
  };
  const protectedDomains = [...s.enrolled, ...s.attempts.filter(occupied).map((a) => a.domain)];
  if (
    protectedDomains.some(
      (e) => conflicts(e, requested) || domains.some((d) => d && conflicts(e, d)),
    )
  )
    return { ...base, classification: "enrolled", reasons: ["protected_domain"] };
  if (
    !s.inventoryComplete ||
    domains.some((d) => !d) ||
    !s.domains.some((d) => d.checkout === request.cwd && d.commonGit === git)
  )
    return { ...base, classification: "unknown", reasons: ["incomplete_domain_inventory"] };
  return { ...base, classification: "outside", reasons: [] };
}
export function classifyNamespace(request: ClassificationRequest, locator: Locator) {
  const snapshot = readSnapshot(locator);
  for (const domain of snapshot.domains) assertDomainPhysical(domain);
  return classifySnapshot(request, snapshot);
}
export function classifyTaskSessionRequest(input: unknown) {
  const request = classificationRequest(input);
  try {
    return classifyNamespace(request, accountLocator());
  } catch {
    return {
      schema: "pi.task-session.classification.v1",
      producer,
      requestDigest: digest(request),
      namespace: null,
      classification: "unknown",
      reasons: ["not_configured_or_incompatible"],
    };
  }
}
