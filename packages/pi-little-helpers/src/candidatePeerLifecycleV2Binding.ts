import type {
  CandidateLifecycleInventory,
  CandidateLifecycleRecord,
} from "./candidatePeerLifecycleV2Core.ts";

function sameStrings(left: string[], right: string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

export function candidateCurrentInventoryBindingBlockers(
  record: CandidateLifecycleRecord,
  inventory: CandidateLifecycleInventory,
): string[] {
  const current = inventory.resources.filter(
    (resource) => resource.resourceId === record.resourceId,
  );
  if (current.length !== 1) {
    return ["current registry inventory does not contain exactly one matching resource"];
  }
  const resource = current[0];
  const blockers: string[] = [];
  if (
    record.schemaVersion !== 2 ||
    record.generationId !== resource.generationId ||
    record.worktreePath !== resource.worktreePath
  ) {
    blockers.push("lifecycle record does not match the current inventory resource generation");
  }
  if (!sameStrings(record.aliases, resource.aliases)) {
    blockers.push("lifecycle aliases do not exactly match the current registry inventory");
  }
  if (!sameStrings(record.repoRoots, resource.repoRoots)) {
    blockers.push("lifecycle repository roots do not exactly match the current registry inventory");
  }
  if (!sameStrings(record.branchNames, resource.branchNames)) {
    blockers.push("lifecycle branches do not exactly match the current registry inventory");
  }
  if (resource.anomalies.length > 0) {
    blockers.push(
      `current registry inventory has identity anomalies: ${resource.anomalies.join(",")}`,
    );
  }
  return blockers;
}
