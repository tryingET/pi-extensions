import { commonGit } from "./git.js";

export { commonGit } from "./git.js";

import { digest, id, integer, record, refuse } from "./json.js";
import {
  accountLocator,
  assertSnapshotDomains,
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
export function classifySnapshot(request: ClassificationRequest, s: Snapshot) {
  assertSnapshotDomains(s);
  const git = commonGit(request.cwd);
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
