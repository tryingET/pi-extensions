// summary: verifies exact lifecycle-v2 alias resolution, authorized-only execution, and janitor boundaries.
// read_when:
//   - changing candidate_peer_closeout actions, lifecycle generation binding, or janitor selection.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import { bindCandidateAdmission } from "../src/candidatePeerAdmission.ts";
import {
  candidateAdmissionPermitPath,
  readAdmissionJson,
  writeAdmissionJson,
} from "../src/candidatePeerAdmissionState.ts";
import {
  executeCandidatePeerCloseout,
  projectCandidatePeerCloseout,
} from "../src/candidatePeerCloseout.ts";
import { runCandidatePeerJanitor } from "../src/candidatePeerJanitor.ts";
import { executeAuthorizedCandidateCleanup } from "../src/candidatePeerLifecycleArchive.ts";
import {
  getCandidateLifecycleRecordPath,
  inventoryCandidatePeerResources,
} from "../src/candidatePeerLifecycleV2.ts";
import { withCandidateRegistryMutationLock } from "../src/candidatePeerLifecycleV2State.ts";
import {
  createCandidatePeerRegistryRecord,
  getCandidatePeerRegistryDir,
  getCandidatePeerRegistryPath,
  writeCandidatePeerRegistryRecord,
} from "../src/candidatePeerRegistry.ts";
import { createContext, registerExtension } from "./sidequest-harness.mjs";

const NOW = "2026-08-03T05:00:00.000Z";
const FUTURE = "2026-08-03T06:00:00.000Z";

function withState(testFn) {
  const stateHome = mkdtempSync(join(tmpdir(), "candidate-closeout-"));
  try {
    return testFn(stateHome, { XDG_STATE_HOME: stateHome });
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function writeRegistry({ env, peerRunId, repoRoot, worktreePath, branchName }) {
  const record = createCandidatePeerRegistryRecord(
    {
      peerRunId,
      tool: "candidate_peer_spawn",
      canonicalTool: "candidate_peer_spawn",
      parentCwd: repoRoot,
      repoRoot,
      worktreePath,
      branchName,
      baseRef: "0".repeat(40),
      parentDirty: false,
      reusedExisting: false,
      reportBack: "manual",
      launch: { status: "launched" },
    },
    env,
    "2026-08-01T00:00:00.000Z",
  );
  return writeCandidatePeerRegistryRecord(record, env);
}

function lifecycleRecord(resource, overrides = {}) {
  return {
    schemaVersion: 2,
    resourceId: resource.resourceId,
    generationId: resource.generationId,
    resourceVersion: 3,
    state: "review_pending",
    createdAt: resource.createdAt,
    updatedAt: "2026-08-01T00:00:00.000Z",
    worktreePath: resource.worktreePath,
    aliases: resource.aliases,
    repoRoots: resource.repoRoots,
    branchNames: resource.branchNames,
    migrationInventoryDigest: "inventory-digest",
    ...overrides,
  };
}

function cleanupAuthorization(record, overrides = {}) {
  return {
    schemaVersion: 2,
    resourceId: record.resourceId,
    generationId: record.generationId,
    authorizedResourceVersion: record.resourceVersion,
    aliases: record.aliases,
    actor: "owner/test",
    issuedAt: "2026-08-03T04:00:00.000Z",
    expiresAt: FUTURE,
    nonce: "test-nonce",
    dispositionDigest: "disposition",
    reviewSnapshotDigest: "snapshot",
    archiveDigest: "archive",
    expectedWorktreeRealPath: record.worktreePath,
    expectedGitCommonDir: join(record.repoRoots[0], ".git"),
    branchName: record.branchNames[0],
    branchOid: "1".repeat(40),
    effects: ["delete_branch", "remove_worktree"],
    authorizationDigest: "authorization",
    ...overrides,
  };
}

test("status and plan resolve an exact peer alias without mutating lifecycle state", () =>
  withState((stateHome, env) => {
    const peerRunId = "candidatepeer-exact-alias";
    const repoRoot = join(stateHome, "repo");
    const worktreePath = join(stateHome, "worktrees", "candidate");
    writeRegistry({ env, peerRunId, repoRoot, worktreePath, branchName: "candidatepeer/exact" });
    const inventory = inventoryCandidatePeerResources({
      registryDir: getCandidatePeerRegistryDir(env),
      now: NOW,
    });
    const resource = inventory.resources[0];
    const recordPath = getCandidateLifecycleRecordPath(resource.resourceId, env);
    writeJson(recordPath, lifecycleRecord(resource));
    const before = readFileSync(recordPath, "utf8");

    const status = projectCandidatePeerCloseout({
      action: "status",
      peerRunIds: [peerRunId],
      env,
      now: NOW,
    });
    const plan = projectCandidatePeerCloseout({
      action: "plan",
      peerRunIds: [peerRunId],
      env,
      now: NOW,
    });

    assert.equal(status.readOnly, true);
    assert.equal(status.resources[0].resourceId, resource.resourceId);
    assert.equal(status.resources[0].generationId, resource.generationId);
    assert.deepEqual(status.resources[0].requestedPeerRunIds, [peerRunId]);
    assert.equal(status.resources[0].admissionBindings[0].status, "legacy_unbound");
    assert.equal(status.resources[0].executionEligible, false);
    assert.deepEqual(plan.resources[0].nextActions, [
      "capture and review the exact candidate snapshot",
    ]);
    assert.equal(readFileSync(recordPath, "utf8"), before);
  }));

test("new same-resource aliases invalidate closeout and janitor execution", () =>
  withState((stateHome, env) => {
    const first = "candidatepeer-alias-a";
    const second = "candidatepeer-alias-b";
    const repoRoot = join(stateHome, "repo");
    const worktreePath = join(stateHome, "worktrees", "reused");
    const branchName = "candidatepeer/reused";
    writeRegistry({ env, peerRunId: first, repoRoot, worktreePath, branchName });
    const initialInventory = inventoryCandidatePeerResources({
      registryDir: getCandidatePeerRegistryDir(env),
      now: NOW,
    });
    const resource = initialInventory.resources[0];
    const authorized = lifecycleRecord(resource, {
      state: "cleanup_authorized",
      resourceVersion: 7,
    });
    authorized.cleanupAuthorization = cleanupAuthorization(authorized);
    writeJson(getCandidateLifecycleRecordPath(resource.resourceId, env), authorized);

    writeRegistry({ env, peerRunId: second, repoRoot, worktreePath, branchName });
    const calls = [];
    const executeCleanup = ({ resourceId }) => {
      calls.push(resourceId);
      return { ...authorized, state: "cleaned", resourceVersion: 8 };
    };
    const closeout = executeCandidatePeerCloseout({
      peerRunIds: [first],
      env,
      now: NOW,
      executeCleanup,
    });
    const janitor = runCandidatePeerJanitor({
      action: "execute_authorized",
      repoRoot,
      env,
      now: NOW,
      executeCleanup,
    });

    assert.equal(closeout.execution, "blocked_before_execution");
    assert.match(closeout.blockers.join("\n"), /aliases.*current registry inventory/);
    assert.equal(janitor.execution, "blocked_before_execution");
    assert.match(janitor.blockers.join("\n"), /aliases.*current registry inventory/);
    assert.deepEqual(calls, []);
  }));

test("registry publication and destructive cleanup share one mutation membrane", () =>
  withState((stateHome, env) => {
    const first = "candidatepeer-lock-a";
    const second = "candidatepeer-lock-b";
    const repoRoot = join(stateHome, "repo");
    const worktreePath = join(stateHome, "worktrees", "locked");
    const branchName = "candidatepeer/locked";
    writeRegistry({ env, peerRunId: first, repoRoot, worktreePath, branchName });
    const resource = inventoryCandidatePeerResources({
      registryDir: getCandidatePeerRegistryDir(env),
      now: NOW,
    }).resources[0];

    withCandidateRegistryMutationLock("test_race", env, () => {
      assert.throws(
        () => executeAuthorizedCandidateCleanup({ resourceId: resource.resourceId, env }),
        /candidate registry mutation is locked/,
      );
      assert.throws(
        () => writeRegistry({ env, peerRunId: second, repoRoot, worktreePath, branchName }),
        /candidate registry mutation is locked/,
      );
    });

    assert.equal(existsSync(getCandidatePeerRegistryPath(second, env)), false);
  }));

test("admission bind serializes resource entry before launch and blocks cleanup until publication", () =>
  withState((stateHome, env) => {
    const first = "candidatepeer-entry-a";
    const second = "candidatepeer-entry-b";
    const admissionId = "cadm-entry-race";
    const repoRoot = join(stateHome, "repo");
    const worktreePath = join(stateHome, "worktrees", "entry");
    const branchName = "candidatepeer/entry";
    writeRegistry({ env, peerRunId: first, repoRoot, worktreePath, branchName });
    const resource = inventoryCandidatePeerResources({
      registryDir: getCandidatePeerRegistryDir(env),
      now: NOW,
    }).resources[0];
    const authorized = lifecycleRecord(resource, {
      state: "cleanup_authorized",
      resourceVersion: 7,
    });
    authorized.cleanupAuthorization = cleanupAuthorization(authorized);
    const recordPath = getCandidateLifecycleRecordPath(resource.resourceId, env);
    writeJson(recordPath, authorized);
    const permitPath = candidateAdmissionPermitPath(admissionId, env);
    writeAdmissionJson(permitPath, {
      schemaVersion: 2,
      admissionId,
      status: "reserved",
      repoRoot,
    });

    withCandidateRegistryMutationLock("cleanup_race", env, () => {
      assert.throws(
        () =>
          bindCandidateAdmission({ admissionId, peerRunId: second, worktreePath, branchName }, env),
        /candidate registry mutation is locked/,
      );
    });
    assert.equal(readAdmissionJson(permitPath).peerRunId, undefined);

    bindCandidateAdmission({ admissionId, peerRunId: second, worktreePath, branchName }, env);
    assert.throws(
      () => executeAuthorizedCandidateCleanup({ resourceId: resource.resourceId, env }),
      /admission entered the resource before registry publication/,
    );
    assert.equal(existsSync(getCandidatePeerRegistryPath(second, env)), false);
    assert.equal(JSON.parse(readFileSync(recordPath, "utf8")).state, "cleanup_authorized");
  }));

test("execute_authorized delegates the exact generation and blocks mixed unauthorized batches", () =>
  withState((stateHome, env) => {
    const repoRoot = join(stateHome, "repo");
    const first = "candidatepeer-authorized";
    const second = "candidatepeer-review-pending";
    writeRegistry({
      env,
      peerRunId: first,
      repoRoot,
      worktreePath: join(stateHome, "worktrees", "authorized"),
      branchName: "candidatepeer/authorized",
    });
    writeRegistry({
      env,
      peerRunId: second,
      repoRoot,
      worktreePath: join(stateHome, "worktrees", "review"),
      branchName: "candidatepeer/review",
    });
    const inventory = inventoryCandidatePeerResources({
      registryDir: getCandidatePeerRegistryDir(env),
      now: NOW,
    });
    const [authorizedResource, reviewResource] = inventory.resources;
    const authorizedBase = lifecycleRecord(authorizedResource, {
      state: "cleanup_authorized",
      resourceVersion: 7,
    });
    writeJson(
      getCandidateLifecycleRecordPath(authorizedResource.resourceId, env),
      lifecycleRecord(authorizedResource, {
        state: "cleanup_authorized",
        resourceVersion: 7,
        cleanupAuthorization: cleanupAuthorization(authorizedBase),
      }),
    );
    writeJson(
      getCandidateLifecycleRecordPath(reviewResource.resourceId, env),
      lifecycleRecord(reviewResource),
    );
    const calls = [];
    const executeCleanup = ({ resourceId }) => {
      calls.push(resourceId);
      const current = JSON.parse(
        readFileSync(getCandidateLifecycleRecordPath(resourceId, env), "utf8"),
      );
      return { ...current, state: "cleaned", resourceVersion: current.resourceVersion + 1 };
    };

    const blocked = executeCandidatePeerCloseout({
      peerRunIds: [first, second],
      env,
      now: NOW,
      executeCleanup,
    });
    assert.equal(blocked.execution, "blocked_before_execution");
    assert.deepEqual(calls, []);

    const secondAuthorized = lifecycleRecord(reviewResource, {
      state: "cleanup_authorized",
      resourceVersion: 5,
    });
    secondAuthorized.cleanupAuthorization = cleanupAuthorization(secondAuthorized);
    writeJson(getCandidateLifecycleRecordPath(reviewResource.resourceId, env), secondAuthorized);
    const multiAuthorized = executeCandidatePeerCloseout({
      peerRunIds: [first, second],
      env,
      now: NOW,
      executeCleanup,
    });
    assert.equal(multiAuthorized.execution, "blocked_before_execution");
    assert.match(multiAuthorized.blockers.join("\n"), /requires exactly one resolved/);
    assert.deepEqual(calls, []);

    const completed = executeCandidatePeerCloseout({
      peerRunIds: [first],
      env,
      now: NOW,
      executeCleanup,
    });
    assert.equal(completed.execution, "completed");
    assert.deepEqual(calls, [authorizedResource.resourceId]);
    assert.equal(completed.executed[0].generationId, authorizedResource.generationId);
  }));

test("janitor reports overdue records but executes only unchanged cleanup_authorized records", () =>
  withState((stateHome, env) => {
    const repoRoot = join(stateHome, "repo");
    const specs = [
      ["candidatepeer-authorized", "authorized"],
      ["candidatepeer-review", "review"],
      ["candidatepeer-partial", "partial"],
      ["candidatepeer-expired", "expired"],
    ];
    for (const [peerRunId, name] of specs) {
      writeRegistry({
        env,
        peerRunId,
        repoRoot,
        worktreePath: join(stateHome, name),
        branchName: `candidatepeer/${name}`,
      });
    }
    const inventory = inventoryCandidatePeerResources({
      registryDir: getCandidatePeerRegistryDir(env),
      now: NOW,
    });
    const resourceFor = (alias) =>
      inventory.resources.find((resource) => resource.aliases.includes(alias));
    const authorized = lifecycleRecord(resourceFor("candidatepeer-authorized"), {
      state: "cleanup_authorized",
      resourceVersion: 4,
    });
    authorized.cleanupAuthorization = cleanupAuthorization(authorized);
    const reviewPending = lifecycleRecord(resourceFor("candidatepeer-review"), {
      state: "review_pending",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    const partial = lifecycleRecord(resourceFor("candidatepeer-partial"), {
      state: "cleanup_partial",
      resourceVersion: 5,
    });
    partial.cleanupAuthorization = cleanupAuthorization(partial, {
      authorizedResourceVersion: 4,
    });
    const expired = lifecycleRecord(resourceFor("candidatepeer-expired"), {
      state: "cleanup_authorized",
      resourceVersion: 4,
    });
    expired.cleanupAuthorization = cleanupAuthorization(expired, { expiresAt: NOW });
    writeJson(getCandidateLifecycleRecordPath(authorized.resourceId, env), authorized);
    writeJson(getCandidateLifecycleRecordPath(reviewPending.resourceId, env), reviewPending);
    writeJson(getCandidateLifecycleRecordPath(partial.resourceId, env), partial);
    writeJson(getCandidateLifecycleRecordPath(expired.resourceId, env), expired);
    const calls = [];
    const executeCleanup = ({ resourceId }) => {
      calls.push(resourceId);
      const current = JSON.parse(
        readFileSync(getCandidateLifecycleRecordPath(resourceId, env), "utf8"),
      );
      return { ...current, state: "cleaned", resourceVersion: current.resourceVersion + 1 };
    };

    const status = runCandidatePeerJanitor({
      action: "status",
      repoRoot,
      overdueAfterMs: 24 * 60 * 60 * 1000,
      env,
      now: NOW,
      executeCleanup,
    });
    assert.equal(status.execution, "not_requested");
    assert.deepEqual(calls, []);
    assert.ok(status.overdue.some((item) => item.resourceId === reviewPending.resourceId));
    assert.equal(
      status.authorized.find((item) => item.resourceId === authorized.resourceId).executionEligible,
      true,
    );
    assert.equal(status.authorized.length, 2);
    assert.equal(
      status.authorized.find((item) => item.resourceId === expired.resourceId).executionEligible,
      false,
    );
    assert.equal(
      status.authorized.some((item) => item.resourceId === partial.resourceId),
      false,
    );

    const blocked = runCandidatePeerJanitor({
      action: "execute_authorized",
      repoRoot,
      overdueAfterMs: 24 * 60 * 60 * 1000,
      env,
      now: NOW,
      executeCleanup,
    });
    assert.equal(blocked.execution, "blocked_before_execution");
    assert.deepEqual(calls, []);

    writeJson(getCandidateLifecycleRecordPath(expired.resourceId, env), {
      ...expired,
      state: "archive_verified",
      cleanupAuthorization: undefined,
    });
    const reviewAuthorized = {
      ...reviewPending,
      state: "cleanup_authorized",
      resourceVersion: 4,
    };
    reviewAuthorized.cleanupAuthorization = cleanupAuthorization(reviewAuthorized);
    writeJson(getCandidateLifecycleRecordPath(reviewAuthorized.resourceId, env), reviewAuthorized);
    const executed = runCandidatePeerJanitor({
      action: "execute_authorized",
      repoRoot,
      overdueAfterMs: 24 * 60 * 60 * 1000,
      env,
      now: NOW,
      executeCleanup,
    });
    assert.equal(executed.execution, "completed");
    assert.equal(calls.length, 1);
    assert.deepEqual(
      executed.executed.map((item) => item.resourceId),
      calls,
    );
    assert.equal(executed.remainingEligible, 1);
  }));

test("candidate_peer_closeout maps controller actions while keeping planning evidence non-authorizing", async () => {
  const calls = [];
  const base = {
    schemaVersion: 2,
    capturedAt: NOW,
    peerRunIds: ["candidatepeer-tool"],
    resources: [],
    blockers: [],
    boundary: "test boundary",
  };
  const extension = createSidequestExtension({
    registerCommands: false,
    candidateCloseout: {
      project(input) {
        calls.push({ kind: "project", input });
        return { ...base, action: input.action, readOnly: true, inventoryDigest: "digest" };
      },
      execute(input) {
        calls.push({ kind: "execute", input });
        return {
          ...base,
          action: "execute_authorized",
          readOnly: false,
          execution: "completed",
          executed: [],
        };
      },
      janitor(input) {
        calls.push({ kind: "janitor", input });
        return {
          schemaVersion: 2,
          capturedAt: NOW,
          action: input.action,
          repoRoot: input.repoRoot,
          overdueAfterMs: 1,
          execution: input.action === "status" ? "not_requested" : "completed",
          recordsScanned: 0,
          overdue: [],
          authorized: [],
          executed: [],
          blockers: [],
          boundary: "test boundary",
        };
      },
    },
  });
  const { tools } = registerExtension(extension);
  const tool = tools.get("candidate_peer_closeout");
  const ctx = createContext({ cwd: "/repo" }).ctx;

  const plan = await tool.execute(
    "tool-plan",
    {
      action: "plan",
      peerRunIds: ["candidatepeer-tool"],
      taskId: 4580,
      integrationCloseout: { status: "successful", commit: "abc" },
    },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(plan.details.readOnly, true);
  assert.equal(plan.details.planningContext.nonAuthorizing, true);

  const execution = await tool.execute(
    "tool-execute",
    { action: "execute_authorized", peerRunIds: ["candidatepeer-tool"] },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(execution.details.execution, "completed");

  const janitor = await tool.execute(
    "tool-janitor",
    { action: "janitor_status", repoRoot: "/repo" },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(janitor.details.execution, "not_requested");
  assert.deepEqual(
    calls.map((call) => call.kind),
    ["project", "execute", "janitor"],
  );
});
