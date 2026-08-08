import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { listCandidateAdmissionPermits } from "./candidatePeerAdmissionState.ts";
import {
  activeProcessPids,
  branchOid,
  candidateGitCommonDir,
  canonicalTimestamp,
  exactCleanupEffects,
  REQUIRED_CLEANUP_EFFECTS,
  run,
  verifyPublishedArchive,
} from "./candidatePeerLifecycleArchiveShared.ts";
import type {
  CandidateCleanupAuthorization,
  CandidateCleanupEffect,
} from "./candidatePeerLifecycleArchiveTypes.ts";
import {
  appendCleanupObservation,
  type CleanupEffectEvent,
  cleanupObservations,
  readCleanupEvents,
} from "./candidatePeerLifecycleCleanupEvents.ts";
import type { CandidateLifecycleRecord } from "./candidatePeerLifecycleV2.ts";
import {
  appendLifecycleEvent,
  assertCandidateResourceId,
  captureCandidateReviewSnapshot,
  digestObject,
  readLifecycleRecord,
  withResourceLock,
  writeLockedLifecycleRecord,
} from "./candidatePeerLifecycleV2.ts";
import { candidateCurrentInventoryBindingBlockers } from "./candidatePeerLifecycleV2Binding.ts";
import { inventoryCandidatePeerResources } from "./candidatePeerLifecycleV2Inventory.ts";
import { withCandidateRegistryMutationLock } from "./candidatePeerLifecycleV2State.ts";
import { getCandidatePeerRegistryDir } from "./candidatePeerRegistry.ts";

function assertCleanupAuthorization(
  current: CandidateLifecycleRecord,
): CandidateCleanupAuthorization {
  const auth = current.cleanupAuthorization as CandidateCleanupAuthorization | undefined;
  if (
    !auth ||
    auth.authorizationDigest !==
      digestObject(
        Object.fromEntries(Object.entries(auth).filter(([key]) => key !== "authorizationDigest")),
      )
  ) {
    throw new Error("cleanup authorization digest mismatch");
  }
  exactCleanupEffects(auth.effects);
  if (canonicalTimestamp(auth.expiresAt, "cleanup authorization expiry") <= Date.now()) {
    throw new Error("cleanup authorization expired");
  }
  if (
    current.state === "cleanup_authorized"
      ? auth.authorizedResourceVersion !== current.resourceVersion
      : auth.authorizedResourceVersion >= current.resourceVersion
  ) {
    throw new Error("cleanup authorization resourceVersion lineage mismatch");
  }
  if (current.state === "cleanup_partial") {
    const partial = current.terminalReceipt as Record<string, unknown> | undefined;
    if (
      partial?.type !== "cleanup_partial" ||
      partial.authorizationDigest !== auth.authorizationDigest ||
      !Array.isArray(partial.effects)
    ) {
      throw new Error("cleanup_partial record is not bound to its authorization and effects");
    }
  }
  return auth;
}

export function executeAuthorizedCandidateCleanup({
  resourceId,
  env = process.env,
}: {
  resourceId: string;
  env?: NodeJS.ProcessEnv;
}): CandidateLifecycleRecord {
  assertCandidateResourceId(resourceId);
  return withCandidateRegistryMutationLock("cleanup_execute", env, () =>
    withResourceLock(resourceId, "cleanup_execute", env, () => {
      const current = readLifecycleRecord(resourceId, env);
      const currentInventory = inventoryCandidatePeerResources({
        registryDir: getCandidatePeerRegistryDir(env),
      });
      const inventoryBlockers = candidateCurrentInventoryBindingBlockers(current, currentInventory);
      if (inventoryBlockers.length > 0) {
        throw new Error(
          `candidate registry inventory drifted before cleanup: ${inventoryBlockers.join("; ")}`,
        );
      }
      const unregisteredEntrants = listCandidateAdmissionPermits(env).filter(
        (permit) =>
          permit.status === "reserved" &&
          permit.peerRunId &&
          permit.worktreePath === current.worktreePath &&
          !current.aliases.includes(permit.peerRunId),
      );
      if (unregisteredEntrants.length > 0) {
        throw new Error(
          `candidate admission entered the resource before registry publication: ${unregisteredEntrants
            .map((permit) => permit.peerRunId)
            .sort()
            .join(",")}`,
        );
      }
      if (!["cleanup_authorized", "cleanup_partial"].includes(current.state)) {
        throw new Error(`resource is not cleanup-authorized or retryable: ${current.state}`);
      }
      const auth = assertCleanupAuthorization(current);
      if (!current.reviewSnapshot || !current.archive || !current.disposition) {
        throw new Error("cleanup bindings are incomplete");
      }
      verifyPublishedArchive(current);
      const repoRoot = current.repoRoots[0];
      if (!repoRoot) throw new Error("owner repo root is ambiguous or missing");
      let events = readCleanupEvents(resourceId, env).events;
      const observations = cleanupObservations(events, auth.authorizationDigest);
      const removeObserved = observations.has("remove_worktree");
      if (existsSync(current.worktreePath)) {
        const currentSnapshot = captureCandidateReviewSnapshot(current);
        if (currentSnapshot.contentDigest !== current.reviewSnapshot.contentDigest) {
          throw new Error("candidate drifted after cleanup authorization");
        }
        if (realpathSync(current.worktreePath) !== auth.expectedWorktreeRealPath) {
          throw new Error("worktree realpath drifted");
        }
        if (candidateGitCommonDir(current.worktreePath) !== auth.expectedGitCommonDir) {
          throw new Error("candidate Git common directory drifted before cleanup");
        }
        if (removeObserved) {
          throw new Error("removed candidate worktree reappeared after observation");
        }
        const pids = activeProcessPids(auth.expectedWorktreeRealPath);
        if (pids.length > 0) {
          throw new Error(`candidate has active process leases: ${pids.join(",")}`);
        }
      } else if (!removeObserved) {
        const intended = events.some(
          (event) =>
            event.event === "cleanup_effect_intent" &&
            event.effect === "remove_worktree" &&
            event.authorizationDigest === auth.authorizationDigest,
        );
        if (!intended) throw new Error("candidate worktree disappeared without cleanup intent");
      }

      const performEffect = (effect: CandidateCleanupEffect): CleanupEffectEvent => {
        const observed = observations.get(effect);
        if (observed) {
          const stillPresent =
            effect === "remove_worktree"
              ? existsSync(current.worktreePath)
              : branchOid(repoRoot, auth.branchName) !== undefined;
          if (stillPresent) throw new Error(`cleanup effect postcondition drifted: ${effect}`);
          return observed;
        }
        const priorIntent = [...events]
          .reverse()
          .find(
            (event) =>
              event.event === "cleanup_effect_intent" &&
              event.effect === effect &&
              event.authorizationDigest === auth.authorizationDigest,
          ) as CleanupEffectEvent | undefined;
        const effectPresent =
          effect === "remove_worktree"
            ? existsSync(current.worktreePath)
            : branchOid(repoRoot, auth.branchName) !== undefined;
        if (!priorIntent && !effectPresent) {
          throw new Error(`cleanup effect target disappeared without durable intent: ${effect}`);
        }
        const attemptId = priorIntent?.attemptId ?? randomUUID();
        if (!priorIntent) {
          const intent: CleanupEffectEvent = {
            event: "cleanup_effect_intent",
            effect,
            authorizationDigest: auth.authorizationDigest,
            attemptId,
            at: new Date().toISOString(),
          };
          appendLifecycleEvent(resourceId, intent, env);
          events = [...events, intent];
        }
        let recoveredAfterCrash = false;
        if (effect === "remove_worktree") {
          if (existsSync(current.worktreePath)) {
            run("git", ["-C", repoRoot, "worktree", "remove", "--force", current.worktreePath]);
          } else {
            recoveredAfterCrash = true;
          }
          return appendCleanupObservation(
            resourceId,
            {
              effect,
              authorizationDigest: auth.authorizationDigest,
              attemptId,
              recoveredAfterCrash,
              worktreePath: current.worktreePath,
            },
            env,
          );
        }
        const oid = branchOid(repoRoot, auth.branchName);
        if (oid !== undefined) {
          if (oid !== auth.branchOid) throw new Error("branch OID changed before exact deletion");
          run("git", ["-C", repoRoot, "branch", "-D", auth.branchName]);
        } else {
          recoveredAfterCrash = true;
        }
        return appendCleanupObservation(
          resourceId,
          {
            effect,
            authorizationDigest: auth.authorizationDigest,
            attemptId,
            recoveredAfterCrash,
            branchName: auth.branchName,
            branchOid: auth.branchOid,
          },
          env,
        );
      };

      let failure: unknown;
      try {
        observations.set("remove_worktree", performEffect("remove_worktree"));
        observations.set("delete_branch", performEffect("delete_branch"));
      } catch (error) {
        failure = error;
      }
      const effects = REQUIRED_CLEANUP_EFFECTS.map((effect) => observations.get(effect)).filter(
        (effect): effect is CleanupEffectEvent => Boolean(effect),
      );
      const next = structuredClone(current);
      next.resourceVersion = current.resourceVersion + 1;
      next.state = failure ? "cleanup_partial" : "cleaned";
      const receiptBase = {
        schemaVersion: 2,
        type: failure ? "cleanup_partial" : "cleaned",
        resourceId,
        generationId: current.generationId,
        effects,
        at: new Date().toISOString(),
        archiveDigest: current.archive.archiveDigest,
        authorizationDigest: auth.authorizationDigest,
        ...(failure ? { failure: String(failure) } : {}),
      };
      next.terminalReceipt = { ...receiptBase, receiptDigest: digestObject(receiptBase) };
      const saved = writeLockedLifecycleRecord(
        current,
        next,
        failure ? "cleanup_partial" : "cleaned",
        env,
      );
      if (failure) {
        throw new Error(`candidate cleanup stopped after partial effects: ${String(failure)}`);
      }
      return saved;
    }),
  );
}
