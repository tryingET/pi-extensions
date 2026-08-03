#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  authorizeCandidateCleanup,
  createRestorationVerifiedArchive,
  executeAuthorizedCandidateCleanup,
  reissueExpiredCandidateCleanupAuthorization,
} from "../src/candidatePeerLifecycleArchive.ts";
import {
  adoptExistingCandidateWorktree,
  assertIntegrationProofCoversDisposition,
  captureCandidateReviewSnapshot,
  createDispositionReceipt,
  inventoryCandidatePeerResources,
  migrateCandidateInventory,
  readLifecycleRecord,
  reconcileCandidateOwnerRoot,
  reconcileMissingResource,
  unresolvedReviewBlockers,
  updateLifecycleRecord,
  verifyAdditiveContentCoverageProof,
  verifyCommitInclusionProof,
  verifyPatchEquivalenceProof,
} from "../src/candidatePeerLifecycleV2.ts";
import { getCandidatePeerRegistryDir } from "../src/candidatePeerRegistry.ts";
import {
  authorizeTerminalCandidateCompaction,
  executeAuthorizedTerminalCandidateCompaction,
  prepareTerminalCandidateCompaction,
  recoverTerminalCandidateCompactionLocks,
  verifyTerminalCandidateRecord,
} from "../src/candidatePeerTerminalRetention.ts";

function exactSelection(actual = [], expected = []) {
  return (
    Array.isArray(actual) &&
    Array.isArray(expected) &&
    JSON.stringify([...new Set(actual)].sort()) === JSON.stringify([...new Set(expected)].sort())
  );
}

function usage(message) {
  if (message) console.error(`error: ${message}`);
  console.error(`usage: candidate-lifecycle-v2.mjs <command> [options]
commands:
  adopt --input PATH
  inventory [--measure] [--out PATH]
  migrate --inventory PATH
  show --resource ID
  review --resource ID
  disposition --resource ID --input PATH
  integration --resource ID --input PATH
  archive --resource ID
  authorize --resource ID --input PATH
  reissue-authorization --resource ID --input PATH
  cleanup --resource ID
  reconcile-missing --resource ID --input PATH
  reconcile-owner-root --resource ID --owner-root PATH --input PATH
  terminal-retention-prepare --resource ID
  terminal-retention-authorize --resource ID --input PATH
  terminal-retention-compact --resource ID
  terminal-retention-recover-locks --resource ID --input PATH
  terminal-retention-verify --resource ID

Terminal retention preparation is non-destructive. Compaction requires a separate expiring exact authorization, publishes and restoration-verifies a complete capsule before removing redundant event/archive copies, and remains resumable after its commit marker. A hard process crash leaves fail-closed locks; recover-locks requires an owner actor and removes only exact terminal-compaction locks whose recorded process is provably absent.
All mutations use owner-only lifecycle state, resource locks, and resourceVersion CAS.
V1 cleanup packets remain permanently non-executable.`);
  process.exit(message ? 2 : 0);
}

function argsMap(values) {
  const result = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function required(options, key) {
  const value = options[key];
  if (typeof value !== "string" || !value.trim()) usage(`--${key} is required`);
  return value.trim();
}

function inputJson(options) {
  const path = required(options, "input");
  return JSON.parse(readFileSync(path, "utf8"));
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const [command, ...rest] = process.argv.slice(2);
if (!command || command === "help" || command === "--help") usage();
const options = argsMap(rest);
const env = process.env;

if (command === "adopt") {
  output(
    adoptExistingCandidateWorktree({
      input: inputJson(options),
      registryDir: getCandidatePeerRegistryDir(env),
      env,
    }),
  );
} else if (command === "inventory") {
  const inventory = inventoryCandidatePeerResources({
    registryDir: getCandidatePeerRegistryDir(env),
    measureBytes: options.measure === true,
  });
  if (typeof options.out === "string") {
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, `${JSON.stringify(inventory, null, 2)}\n`, { mode: 0o600 });
  }
  output(inventory);
} else if (command === "migrate") {
  const path = required(options, "inventory");
  const inventory = JSON.parse(readFileSync(path, "utf8"));
  output({
    migrated: migrateCandidateInventory(inventory, env).length,
    inventoryDigest: inventory.digest,
  });
} else if (command === "show") {
  output(readLifecycleRecord(required(options, "resource"), env));
} else if (command === "review") {
  const resourceId = required(options, "resource");
  const current = readLifecycleRecord(resourceId, env);
  const snapshot = captureCandidateReviewSnapshot(current);
  const next = updateLifecycleRecord({
    resourceId,
    expectedVersion: current.resourceVersion,
    event: "review_captured",
    env,
    mutate(record) {
      if (
        ["cleaned", "closed_with_retained_effects", "reconciled_missing"].includes(record.state)
      ) {
        throw new Error(`terminal resource cannot be reviewed: ${record.state}`);
      }
      record.state = "review_pending";
      record.reviewSnapshot = snapshot;
      delete record.disposition;
      delete record.integrationProof;
      delete record.archive;
      delete record.cleanupAuthorization;
      return record;
    },
  });
  output(next);
} else if (command === "disposition") {
  const resourceId = required(options, "resource");
  const current = readLifecycleRecord(resourceId, env);
  if (current.state !== "review_pending" || !current.reviewSnapshot)
    throw new Error("disposition requires review_pending snapshot");
  const input = inputJson(options);
  const unresolvedBlockers = unresolvedReviewBlockers(
    current.reviewSnapshot,
    input.discardIgnoredPaths,
  );
  if (input.disposition !== "deferred" && unresolvedBlockers.length > 0)
    throw new Error(`review blockers prevent disposition: ${unresolvedBlockers.join(",")}`);
  const receipt = createDispositionReceipt({
    ...input,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    reviewSnapshotDigest: current.reviewSnapshot.snapshotDigest,
  });
  const next = updateLifecycleRecord({
    resourceId,
    expectedVersion: current.resourceVersion,
    event: `disposition_${receipt.disposition}`,
    env,
    mutate(record) {
      if (record.reviewSnapshot?.snapshotDigest !== receipt.reviewSnapshotDigest)
        throw new Error("review snapshot changed before disposition");
      record.disposition = receipt;
      record.state = receipt.disposition;
      return record;
    },
  });
  output(next);
} else if (command === "integration") {
  const resourceId = required(options, "resource");
  const current = readLifecycleRecord(resourceId, env);
  if (current.state !== "accepted" || current.disposition?.disposition !== "accepted")
    throw new Error("integration proof requires accepted disposition");
  const input = inputJson(options);
  if (!current.reviewSnapshot) throw new Error("accepted resource is missing its review snapshot");
  const dispositionCommits = current.disposition.selectedCommits ?? [];
  const dispositionPaths = current.disposition.selectedPaths ?? [];
  if (input.selectedCommits && !exactSelection(input.selectedCommits, dispositionCommits)) {
    throw new Error("integration input selectedCommits must exactly match accepted disposition");
  }
  if (input.selectedPaths && !exactSelection(input.selectedPaths, dispositionPaths)) {
    throw new Error("integration input selectedPaths must exactly match accepted disposition");
  }
  if (
    input.form === "content_coverage" &&
    (dispositionPaths.length === 0 || dispositionCommits.length > 0)
  ) {
    throw new Error("content-coverage proof requires a path-only accepted disposition");
  }
  if (
    input.form === "patch_equivalence" &&
    input.candidateHeadOid &&
    input.candidateHeadOid !== current.reviewSnapshot?.headOid
  ) {
    throw new Error("patch-equivalence candidateHeadOid must match the reviewed candidate HEAD");
  }
  const proof =
    input.form === "patch_equivalence"
      ? verifyPatchEquivalenceProof({
          ...input,
          candidateHeadOid: current.reviewSnapshot?.headOid,
          issuedAt: input.issuedAt ?? new Date().toISOString(),
        })
      : input.form === "content_coverage"
        ? verifyAdditiveContentCoverageProof({
            ...input,
            candidateRepoRoot: current.reviewSnapshot.repoRoot,
            candidateCommitOid: current.reviewSnapshot.headOid,
            selectedPaths: dispositionPaths,
            issuedAt: input.issuedAt ?? new Date().toISOString(),
          })
        : verifyCommitInclusionProof({
            ...input,
            selectedCommits: dispositionCommits,
            candidateRepoRoot: current.reviewSnapshot.repoRoot,
            candidateHeadOid: current.reviewSnapshot.headOid,
            issuedAt: input.issuedAt ?? new Date().toISOString(),
          });
  assertIntegrationProofCoversDisposition(current.disposition, current.reviewSnapshot, proof);
  const next = updateLifecycleRecord({
    resourceId,
    expectedVersion: current.resourceVersion,
    event: "integration_verified",
    env,
    mutate(record) {
      if (record.disposition?.receiptDigest !== current.disposition?.receiptDigest)
        throw new Error("disposition changed before integration proof");
      record.integrationProof = proof;
      record.state = "integration_verified";
      return record;
    },
  });
  output(next);
} else if (command === "archive") {
  const resourceId = required(options, "resource");
  const current = readLifecycleRecord(resourceId, env);
  output(
    createRestorationVerifiedArchive({
      record: current,
      expectedVersion: current.resourceVersion,
      env,
    }),
  );
} else if (command === "authorize") {
  const resourceId = required(options, "resource");
  const current = readLifecycleRecord(resourceId, env);
  const input = inputJson(options);
  output(
    authorizeCandidateCleanup({
      record: current,
      expectedVersion: current.resourceVersion,
      actor: input.actor,
      expiresAt: input.expiresAt,
      effects: input.effects,
      env,
    }),
  );
} else if (command === "reissue-authorization") {
  const resourceId = required(options, "resource");
  const current = readLifecycleRecord(resourceId, env);
  const input = inputJson(options);
  output(
    reissueExpiredCandidateCleanupAuthorization({
      record: current,
      expectedVersion: current.resourceVersion,
      actor: input.actor,
      expiresAt: input.expiresAt,
      env,
    }),
  );
} else if (command === "cleanup") {
  output(executeAuthorizedCandidateCleanup({ resourceId: required(options, "resource"), env }));
} else if (command === "reconcile-owner-root") {
  const resourceId = required(options, "resource");
  const current = readLifecycleRecord(resourceId, env);
  const input = inputJson(options);
  output(
    reconcileCandidateOwnerRoot({
      record: current,
      expectedVersion: current.resourceVersion,
      ownerRoot: required(options, "owner-root"),
      actor: input.actor,
      rationale: input.rationale,
      env,
    }),
  );
} else if (command === "reconcile-missing") {
  const resourceId = required(options, "resource");
  const current = readLifecycleRecord(resourceId, env);
  const input = inputJson(options);
  output(
    reconcileMissingResource({
      record: current,
      expectedVersion: current.resourceVersion,
      actor: input.actor,
      recoverable: input.recoverable ?? [],
      lost: input.lost ?? [],
      evidence: input.evidence ?? [],
      env,
    }),
  );
} else if (command === "terminal-retention-prepare") {
  output(prepareTerminalCandidateCompaction({ resourceId: required(options, "resource"), env }));
} else if (command === "terminal-retention-authorize") {
  const input = inputJson(options);
  output(
    authorizeTerminalCandidateCompaction({
      resourceId: required(options, "resource"),
      actor: input.actor,
      expiresAt: input.expiresAt,
      env,
    }),
  );
} else if (command === "terminal-retention-compact") {
  output(
    executeAuthorizedTerminalCandidateCompaction({
      resourceId: required(options, "resource"),
      env,
    }),
  );
} else if (command === "terminal-retention-recover-locks") {
  const input = inputJson(options);
  output(
    recoverTerminalCandidateCompactionLocks({
      resourceId: required(options, "resource"),
      actor: input.actor,
      env,
    }),
  );
} else if (command === "terminal-retention-verify") {
  const record = readLifecycleRecord(required(options, "resource"), env);
  output({
    resourceId: record.resourceId,
    terminalDigest: verifyTerminalCandidateRecord(record, env),
  });
} else {
  usage(`unknown command: ${command}`);
}
