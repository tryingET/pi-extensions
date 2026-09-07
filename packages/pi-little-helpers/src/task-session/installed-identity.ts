import { classificationRequest, classifySnapshot, producer } from "./classify.js";
import { digest, record, refuse } from "./json.js";
import {
  accountLocator,
  assertDomainPhysical,
  type Locator,
  readSnapshot,
  type Snapshot,
} from "./state.js";

export function identityFromSnapshot(s: Snapshot) {
  const instances = [...new Set(s.domains.map((d) => d.akInstance))];
  if (s.withdrawn || !s.inventoryComplete || instances.length !== 1)
    refuse("canonical_instance_unavailable");
  for (const domain of s.domains) assertDomainPhysical(domain);
  const identity = {
    schema: "pi.task-session.installed-identity.v1",
    producer,
    configured: true,
    akInstance: instances[0],
    namespace: { id: s.namespace, generation: s.generation, snapshotDigest: digest(s) },
    classificationExport: "classifyInstalledTaskSessionRequest",
    classificationRequestSchema: "pi.task-session.classify-installed-request.v1",
  };
  return { ...identity, identityDigest: digest(identity) };
}
export function taskSessionInstalledIdentity() {
  try {
    return identityFromSnapshot(readSnapshot(accountLocator()));
  } catch {
    return {
      schema: "pi.task-session.installed-identity.v1",
      producer,
      configured: false,
      akInstance: null,
      namespace: null,
      identityDigest: null,
      reasons: ["not_configured_or_incompatible"],
    };
  }
}
/** Internal dependency boundary, no public locator/environment override. */
export function classifyInstalledInNamespace(input: unknown, locator: Locator) {
  const r = record(input, ["schema", "requestId", "taskIds", "cwd"]);
  if (r.schema !== "pi.task-session.classify-installed-request.v1")
    refuse("request_version_unsupported");
  const snapshot = readSnapshot(locator),
    identity = identityFromSnapshot(snapshot);
  const request = classificationRequest({
    ...r,
    schema: "pi.task-session.classify-request.v1",
    akInstance: identity.akInstance,
  });
  return {
    ...classifySnapshot(request, snapshot),
    requestDigest: digest(r),
    identityDigest: identity.identityDigest,
  };
}
export function classifyInstalledTaskSessionRequest(input: unknown) {
  // Validate before reading even a missing namespace; never classify malformed legacy input outside.
  const r = record(input, ["schema", "requestId", "taskIds", "cwd"]);
  if (r.schema !== "pi.task-session.classify-installed-request.v1")
    refuse("request_version_unsupported");
  classificationRequest({
    ...r,
    schema: "pi.task-session.classify-request.v1",
    akInstance: "validation-only",
  });
  try {
    return classifyInstalledInNamespace(r, accountLocator());
  } catch {
    return {
      schema: "pi.task-session.classification.v1",
      producer,
      requestDigest: digest(r),
      namespace: null,
      identityDigest: null,
      classification: "unknown",
      reasons: ["not_configured_or_incompatible"],
    };
  }
}
