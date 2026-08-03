import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type CandidateAdmissionPermit,
  candidateAdmissionPermitPath,
  readAdmissionJson,
} from "./candidatePeerAdmissionState.ts";
import {
  type CandidateCleanupAuthorization,
  executeAuthorizedCandidateCleanup,
} from "./candidatePeerLifecycleArchive.ts";
import {
  type CandidateLifecycleRecord,
  type CandidateLifecycleState,
  getCandidateLifecycleRecordPath,
} from "./candidatePeerLifecycleV2.ts";
import { candidateCurrentInventoryBindingBlockers } from "./candidatePeerLifecycleV2Binding.ts";
import { inventoryCandidatePeerResources } from "./candidatePeerLifecycleV2Inventory.ts";
import {
  type CandidatePeerRegistryRecord,
  getCandidatePeerRegistryDir,
  getCandidatePeerRegistryPath,
} from "./candidatePeerRegistry.ts";

export type CandidatePeerCloseoutAction = "status" | "plan" | "execute_authorized";

export type CandidatePeerAdmissionBinding = {
  status: "verified" | "legacy_unbound" | "invalid";
  admissionId?: string;
  permitPath?: string;
  permitStatus?: CandidateAdmissionPermit["status"];
  blockers: string[];
};

export type CandidatePeerCloseoutResource = {
  resourceId: string;
  generationId: string;
  requestedPeerRunIds: string[];
  allAliases: string[];
  worktreePath: string;
  repoRoots: string[];
  branchNames: string[];
  recordPath: string;
  record?: CandidateLifecycleRecord;
  admissionBindings: CandidatePeerAdmissionBinding[];
  blockers: string[];
  nextActions: string[];
  executionEligible: boolean;
};

export type CandidatePeerCloseoutProjection = {
  schemaVersion: 2;
  capturedAt: string;
  action: "status" | "plan";
  readOnly: true;
  peerRunIds: string[];
  inventoryDigest: string;
  resources: CandidatePeerCloseoutResource[];
  blockers: string[];
  boundary: string;
};

export type CandidatePeerCloseoutExecution = {
  schemaVersion: 2;
  capturedAt: string;
  action: "execute_authorized";
  readOnly: false;
  peerRunIds: string[];
  execution: "completed" | "blocked_before_execution" | "stopped_after_error";
  resources: CandidatePeerCloseoutResource[];
  executed: Array<{
    resourceId: string;
    generationId: string;
    state: CandidateLifecycleState;
    resourceVersion: number;
    terminalReceipt?: Record<string, unknown>;
  }>;
  blockers: string[];
  boundary: string;
};

type CleanupExecutor = typeof executeAuthorizedCandidateCleanup;

function normalizedPeerRunIds(peerRunIds: string[]): string[] {
  const normalized = peerRunIds.map((value) => value.trim());
  if (normalized.some((value) => value.length === 0)) {
    throw new Error("candidate closeout requires non-empty exact peerRunIds");
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("candidate closeout peerRunIds must be unique");
  }
  return normalized.sort();
}

function readExactRegistryRecord(
  peerRunId: string,
  env: NodeJS.ProcessEnv,
): CandidatePeerRegistryRecord {
  const expectedPath = resolve(getCandidatePeerRegistryPath(peerRunId, env));
  const record = JSON.parse(readFileSync(expectedPath, "utf8")) as CandidatePeerRegistryRecord;
  if (
    record.schemaVersion !== 1 ||
    record.peerRunId !== peerRunId ||
    record.registryPath !== expectedPath
  ) {
    throw new Error(`candidate registry identity mismatch for ${peerRunId}`);
  }
  return record;
}

function verifyAdmissionBinding(
  registry: CandidatePeerRegistryRecord,
  env: NodeJS.ProcessEnv,
): CandidatePeerAdmissionBinding {
  if (!registry.admission) return { status: "legacy_unbound", blockers: [] };
  const { admissionId } = registry.admission;
  const expectedPath = resolve(candidateAdmissionPermitPath(admissionId, env));
  const blockers: string[] = [];
  if (registry.admission.permitPath !== expectedPath) {
    blockers.push("registry admission permit path does not match its exact admission id");
  }
  if (!existsSync(expectedPath)) {
    blockers.push("bound admission permit is missing");
    return {
      status: "invalid",
      admissionId,
      permitPath: expectedPath,
      blockers,
    };
  }
  const permit = readAdmissionJson<CandidateAdmissionPermit>(expectedPath);
  if (
    permit.schemaVersion !== 2 ||
    permit.admissionId !== admissionId ||
    permit.peerRunId !== registry.peerRunId ||
    permit.repoRoot !== registry.repoRoot ||
    permit.worktreePath !== registry.worktreePath ||
    permit.branchName !== registry.branchName
  ) {
    blockers.push("admission permit does not match the exact registry resource binding");
  }
  return {
    status: blockers.length === 0 ? "verified" : "invalid",
    admissionId,
    permitPath: expectedPath,
    permitStatus: permit.status,
    blockers,
  };
}

export function candidateCleanupAuthorizationBlockers(
  record: CandidateLifecycleRecord,
  nowMs: number,
  allowPartial: boolean,
): string[] {
  const blockers: string[] = [];
  if (
    record.state !== "cleanup_authorized" &&
    !(allowPartial && record.state === "cleanup_partial")
  ) {
    blockers.push(`resource state is ${record.state}, not cleanup_authorized`);
    return blockers;
  }
  const authorization = record.cleanupAuthorization as CandidateCleanupAuthorization | undefined;
  if (!authorization) {
    blockers.push("cleanup authorization is missing");
    return blockers;
  }
  if (
    authorization.schemaVersion !== 2 ||
    authorization.resourceId !== record.resourceId ||
    authorization.generationId !== record.generationId
  ) {
    blockers.push("cleanup authorization resource generation binding is invalid");
  }
  if (record.state === "cleanup_authorized") {
    if (authorization.authorizedResourceVersion !== record.resourceVersion) {
      blockers.push("cleanup authorization resourceVersion no longer matches the record");
    }
  } else if (authorization.authorizedResourceVersion >= record.resourceVersion) {
    blockers.push("partial cleanup authorization lineage is invalid");
  }
  const expiresAt = Date.parse(authorization.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
    blockers.push("cleanup authorization is expired or invalid");
  }
  if (
    JSON.stringify([...authorization.aliases].sort()) !== JSON.stringify([...record.aliases].sort())
  ) {
    blockers.push("cleanup authorization aliases no longer match the lifecycle record");
  }
  return blockers;
}

function nextActionsFor(record: CandidateLifecycleRecord | undefined): string[] {
  if (!record) return ["migrate or adopt the exact registry resource into lifecycle v2"];
  switch (record.state) {
    case "open":
    case "review_pending":
      return ["capture and review the exact candidate snapshot"];
    case "deferred":
      return ["wait for or perform the owner-specified next review"];
    case "accepted":
      return ["record and verify exact integration proof"];
    case "rejected":
    case "superseded":
    case "integration_verified":
    case "archive_pending":
      return ["create and restoration-test the lifecycle-v2 archive"];
    case "archive_verified":
      return ["obtain an expiring exact cleanup authorization from the owner"];
    case "cleanup_authorized":
      return ["explicitly execute the already-authorized cleanup through lifecycle v2"];
    case "cleanup_partial":
      return ["review the partial receipt, then explicitly resume through lifecycle v2"];
    case "cleanup_partial_review":
      return ["complete owner review of the partial cleanup effects"];
    case "missing_investigation":
      return ["investigate and reconcile the missing resource with owner evidence"];
    case "reconciled_missing":
    case "cleaned":
    case "closed_with_retained_effects":
      return [];
  }
}

function resolveCandidatePeerResources({
  peerRunIds,
  env,
  now,
}: {
  peerRunIds: string[];
  env: NodeJS.ProcessEnv;
  now: string;
}): { inventoryDigest: string; resources: CandidatePeerCloseoutResource[] } {
  const requested = normalizedPeerRunIds(peerRunIds);
  if (requested.length === 0) throw new Error("candidate closeout requires at least one peerRunId");
  const registryByAlias = new Map(
    requested.map((peerRunId) => [peerRunId, readExactRegistryRecord(peerRunId, env)]),
  );
  const inventory = inventoryCandidatePeerResources({
    registryDir: getCandidatePeerRegistryDir(env),
    now,
  });
  const selected = inventory.resources.filter((resource) =>
    resource.aliases.some((alias) => registryByAlias.has(alias)),
  );
  for (const peerRunId of requested) {
    if (!selected.some((resource) => resource.aliases.includes(peerRunId))) {
      throw new Error(
        `candidate peer alias did not resolve to an inventory resource: ${peerRunId}`,
      );
    }
  }

  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("candidate closeout timestamp is invalid");
  return {
    inventoryDigest: inventory.digest,
    resources: selected.map((resource) => {
      const requestedPeerRunIds = resource.aliases.filter((alias) => registryByAlias.has(alias));
      const bindings = requestedPeerRunIds.map((alias) => {
        const registry = registryByAlias.get(alias) as CandidatePeerRegistryRecord;
        if (
          registry.worktreePath !== resource.worktreePath ||
          !resource.repoRoots.includes(registry.repoRoot) ||
          !resource.branchNames.includes(registry.branchName)
        ) {
          throw new Error(`candidate inventory binding drift for ${alias}`);
        }
        return verifyAdmissionBinding(registry, env);
      });
      const recordPath = getCandidateLifecycleRecordPath(resource.resourceId, env);
      const record = existsSync(recordPath)
        ? (JSON.parse(readFileSync(recordPath, "utf8")) as CandidateLifecycleRecord)
        : undefined;
      const blockers = bindings.flatMap((binding) => binding.blockers);
      if (!record)
        blockers.push("lifecycle-v2 record is missing for the exact resource generation");
      else {
        if (record.resourceId !== resource.resourceId) {
          blockers.push("lifecycle-v2 record resource id does not match the registry inventory");
        }
        blockers.push(...candidateCurrentInventoryBindingBlockers(record, inventory));
      }
      const executionBlockers = record
        ? candidateCleanupAuthorizationBlockers(record, nowMs, true)
        : ["lifecycle-v2 record is missing"];
      return {
        resourceId: resource.resourceId,
        generationId: resource.generationId,
        requestedPeerRunIds,
        allAliases: resource.aliases,
        worktreePath: resource.worktreePath,
        repoRoots: resource.repoRoots,
        branchNames: resource.branchNames,
        recordPath,
        ...(record ? { record } : {}),
        admissionBindings: bindings,
        blockers,
        nextActions: nextActionsFor(record),
        executionEligible: blockers.length === 0 && executionBlockers.length === 0,
      };
    }),
  };
}

export const CANDIDATE_CLOSEOUT_BOUNDARY =
  "Peer reports, age, integration-closeout metadata, and registry-v1 packets are never cleanup authority. Execution delegates only to lifecycle-v2 locks, verified archives, expiring exact authorization, drift checks, and terminal effect receipts.";

export function projectCandidatePeerCloseout({
  peerRunIds,
  action,
  env = process.env,
  now = new Date().toISOString(),
}: {
  peerRunIds: string[];
  action: "status" | "plan";
  env?: NodeJS.ProcessEnv;
  now?: string;
}): CandidatePeerCloseoutProjection {
  const resolved = resolveCandidatePeerResources({ peerRunIds, env, now });
  const blockers = resolved.resources.flatMap((resource) =>
    resource.blockers.map((blocker) => `${resource.resourceId}: ${blocker}`),
  );
  return {
    schemaVersion: 2,
    capturedAt: now,
    action,
    readOnly: true,
    peerRunIds: normalizedPeerRunIds(peerRunIds),
    inventoryDigest: resolved.inventoryDigest,
    resources: resolved.resources,
    blockers,
    boundary: CANDIDATE_CLOSEOUT_BOUNDARY,
  };
}

export function executeCandidatePeerCloseout({
  peerRunIds,
  env = process.env,
  now = new Date().toISOString(),
  executeCleanup = executeAuthorizedCandidateCleanup,
}: {
  peerRunIds: string[];
  env?: NodeJS.ProcessEnv;
  now?: string;
  executeCleanup?: CleanupExecutor;
}): CandidatePeerCloseoutExecution {
  const projection = projectCandidatePeerCloseout({ peerRunIds, action: "status", env, now });
  const preflightBlockers = [...projection.blockers];
  if (projection.resources.length !== 1) {
    preflightBlockers.push(
      `execute_authorized requires exactly one resolved lifecycle resource, found ${projection.resources.length}`,
    );
  }
  for (const resource of projection.resources) {
    if (!resource.executionEligible) {
      preflightBlockers.push(`${resource.resourceId}: cleanup is not currently executable`);
    }
  }
  if (preflightBlockers.length > 0) {
    return {
      schemaVersion: 2,
      capturedAt: now,
      action: "execute_authorized",
      readOnly: false,
      peerRunIds: projection.peerRunIds,
      execution: "blocked_before_execution",
      resources: projection.resources,
      executed: [],
      blockers: [...new Set(preflightBlockers)],
      boundary: CANDIDATE_CLOSEOUT_BOUNDARY,
    };
  }

  const executed: CandidatePeerCloseoutExecution["executed"] = [];
  const blockers: string[] = [];
  for (const resource of projection.resources) {
    try {
      const record = executeCleanup({ resourceId: resource.resourceId, env });
      executed.push({
        resourceId: record.resourceId,
        generationId: record.generationId,
        state: record.state,
        resourceVersion: record.resourceVersion,
        terminalReceipt: record.terminalReceipt,
      });
    } catch (error) {
      blockers.push(
        `${resource.resourceId}: lifecycle-v2 execution stopped: ${error instanceof Error ? error.message : String(error)}`,
      );
      break;
    }
  }
  return {
    schemaVersion: 2,
    capturedAt: now,
    action: "execute_authorized",
    readOnly: false,
    peerRunIds: projection.peerRunIds,
    execution: blockers.length === 0 ? "completed" : "stopped_after_error",
    resources: projection.resources,
    executed,
    blockers,
    boundary: CANDIDATE_CLOSEOUT_BOUNDARY,
  };
}
