// ---
// summary: verifies the Fleet Phase-2 exact-task read-only standing-agent dispatch contract end to end with fixtures.
// read_when:
//   - changing dispatch gates, ASC request composition, receipts, or evidence semantics.
// ---

import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dispatchAgent } from "../src/dispatch.ts";
import {
  dispatchReceiptFileName,
  readDispatchAttemptLedger,
  readDispatchReceipt,
} from "../src/dispatch-receipt.ts";
import { loadEcProfiles } from "../src/ec-profiles.ts";
import { createAgentRegistry } from "../src/registry.ts";
import { resolveRegistrySubagentSessionsDir } from "../src/sessions-dir.ts";
import { commitAll, createAgentRepo, createProfileRepo, initRepo } from "./fleet-lint-fixtures.mjs";

function makeFakeAk(dir, behavior) {
  const scriptPath = join(dir, "ak");
  const statePath = join(dir, "ak-state.json");
  writeFileSync(
    scriptPath,
    `#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
const calls = [];
let callsSnapshot = "[]";
try { callsSnapshot = readFileSync("${statePath}", "utf8"); } catch {}
const calls2 = JSON.parse(callsSnapshot);
calls2.push(args);
writeFileSync("${statePath}", JSON.stringify(calls2));
const mode = args[0] === "task" && args[1] === "show" ? "task" : "evidence";
const BEHAVIOR = ${JSON.stringify(behavior.task)};
const EVIDENCE = ${JSON.stringify(behavior.evidence)};
if (mode === "task") {
  if (BEHAVIOR.exitCode) { console.error(BEHAVIOR.stderr ?? ""); process.exit(BEHAVIOR.exitCode); }
  process.stdout.write(BEHAVIOR.stdout ?? "");
  process.exit(0);
}
if (EVIDENCE.exitCode) { console.error("evidence failure"); process.exit(EVIDENCE.exitCode); }
console.log("Recorded evidence #" + EVIDENCE.id);
`,
  );
  chmodSync(scriptPath, 0o755);
  return { bin: scriptPath, statePath };
}

function taskJson(repo, overrides = {}) {
  return {
    id: 5132,
    repo,
    title: overrides.title ?? "Fleet phase 2 proof",
    status: overrides.status ?? "claimed",
    claimed_by: overrides.claimed_by ?? "01a05920-5712-78d5-9e33-8d2b9e57c28d",
    lease_expires_at: overrides.lease_expires_at ?? "2999-01-01T00:00:00.000000000+00:00",
  };
}

function ledgerReceipt(world, overrides = {}) {
  return {
    schema: "pi-agent-registry.dispatch-receipt/1",
    phase: "fleet_phase_2",
    agent: {
      name: world.agentName,
      tools: ["read"],
      thinking: "medium",
      model: null,
      loadedSkills: [],
      manifestSha256: "0".repeat(64),
      manifestBlobOid: "0".repeat(40),
      systemPromptSha256: "0".repeat(64),
      agentRepo: {
        commit: "0".repeat(40),
        treeOid: "0".repeat(40),
        status: "clean_observed",
        statusSha256: "0".repeat(64),
        revisionStable: true,
      },
    },
    task: {
      id: 5132,
      repo: world.parentRoot,
      title: "prior",
      status: "claimed",
      claimedBy: "prior",
      leaseExpiresAt: "2999-01-01T00:00:00.000000000+00:00",
    },
    dispatch: {
      attemptIndex: 1,
      settlement: overrides.settlement ?? "not_settled",
      objective: "prior",
      objectiveSha256: "0".repeat(64),
      mutationPolicy: "read_only",
      allowedPaths: [],
      forbiddenPaths: [],
      effectCorrelationId: "prior",
      executionTimeoutSeconds: 1,
      startupTimeoutSeconds: 1,
      asc: {
        dispatchId: "d",
        attemptId: "a",
        sessionName: "s",
        sessionFile: "f",
        status: "done",
        effectDisposition: "settled",
      },
      outputSha256: "0".repeat(64),
      outputChars: 0,
    },
    observation: {
      parentRepoRoot: world.parentRoot,
      parentHead: "0".repeat(40),
      preStatusSha256: "0".repeat(64),
      postStatusSha256: "0".repeat(64),
      headStable: true,
      noMutationObserved: true,
      boundary: "prior",
    },
    recordedAt: "2026-08-31T00:00:00.000Z",
  };
}

function fakeRuntime(handler) {
  return () => ({
    state: { sessionsDir: "unused" },
    cancel: () => ({ ok: true, status: "cancelled" }),
    execute: handler,
  });
}

const settledDetails = (overrides = {}) => ({
  dispatchId: "dispatch-test-0001",
  attemptId: "attempt-test-0001",
  sessionName: "agent-test-steward",
  sessionFile: "/sessions/agent-test-steward.jsonl",
  status: "done",
  exitCode: 0,
  effectDisposition: "settled",
  effectReceipt: {
    schema: "asc.dispatch_effect_receipt.v1",
    dispatchId: "dispatch-test-0001",
    attemptId: "attempt-test-0001",
    sessionName: "agent-test-steward",
    consumerCorrelationId: "pi-agent-registry:ak-5132:agent-test-steward:cafebabe",
    disposition: "settled",
    recordedAt: "2026-08-31T00:00:00.000Z",
    receiptPath: "/sessions/agent-test-steward.attempt-test-0001.effect-receipt.json",
  },
  requestedModel: "zai/glm-5.3",
  effectiveModel: "zai/glm-5.3",
  usage: { turns: 3, output: 900 },
  ...overrides,
});

async function setupWorld(options = {}) {
  const scratch = mkdtempSync(join(tmpdir(), "phase2-dispatch-"));
  const profileRoot = join(scratch, "profiles");
  const templateRoot = join(scratch, "template");
  const fleetRoot = join(scratch, "fleet");
  const parentRoot = join(scratch, "parent-repo");
  const receiptsDir = join(scratch, "receipts");
  const piAgentDir = join(scratch, "pi-agent");
  createProfileRepo(profileRoot);
  initRepo(templateRoot);
  writeFileSync(join(templateRoot, "README.md"), "template\n");
  const templateCommit = commitAll(templateRoot, "template");
  const agentName = options.agentName ?? "agent-test-steward";
  const agentRoot = join(fleetRoot, agentName);
  const agentCommit = await createAgentRepo({
    root: agentRoot,
    name: agentName,
    role: "Test Steward",
    creationTask: "AK-4242",
    profile: "ec-current",
    tools: options.tools ?? ["read", "bash"],
    templateRoot,
    templateCommit,
  });
  initRepo(parentRoot);
  writeFileSync(join(parentRoot, "README.md"), "parent repo\n");
  const parentCommit = commitAll(parentRoot, "parent fixture");
  const ec = await loadEcProfiles(join(profileRoot, "skills", "profiles.json"));
  const registry = await createAgentRegistry({ roots: [join(fleetRoot, "agent-*")], ec });
  const cwd = join(parentRoot, "docs");
  await mkdir(cwd, { recursive: true });
  const ak = makeFakeAk(scratch, {
    task: options.akTask ?? { stdout: `${JSON.stringify(taskJson(parentRoot))}\n` },
    evidence: options.akEvidence ?? { id: 4242 },
  });
  return {
    scratch,
    agentName,
    agentRoot,
    agentCommit,
    parentRoot,
    parentCommit,
    receiptsDir,
    piAgentDir,
    registry,
    cwd,
    ak,
    ec,
  };
}

function withPiAgentDir(piAgentDir, fn) {
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = piAgentDir;
  return Promise.resolve(fn()).finally(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  });
}

async function runDispatch(world, params = {}, options = {}) {
  return withPiAgentDir(world.piAgentDir, () =>
    dispatchAgent(
      {
        agent: params.agent ?? world.agentName,
        task: params.task ?? 5132,
        objective: params.objective ?? "Read-only observation report for the phase-2 proof.",
      },
      {
        registry: world.registry,
        akBinary: params.akBinary ?? world.ak.bin,
        receiptsDir: world.receiptsDir,
        ...(options.runtimeFactory ? { createRuntime: options.runtimeFactory } : {}),
      },
      { cwd: world.cwd },
    ),
  );
}

test("invalid requests fail closed before any observable effect", async () => {
  const world = await setupWorld();
  const outcome = await runDispatch(world, { agent: " ", objective: "x" });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "invalid_request");
  assert.equal(outcome.effectDisposition, "confirmed_no_effects");
  assert.equal(outcome.spawnAttempted, false);
  await rm(world.scratch, { recursive: true, force: true });
});

test("dispatched standing-agent children cannot dispatch again", async () => {
  const world = await setupWorld();
  const previous = process.env.PI_PROVENANCE_STANDING_AGENT_DISPATCH;
  process.env.PI_PROVENANCE_STANDING_AGENT_DISPATCH = "ak-1:agent-parent";
  try {
    const outcome = await runDispatch(world);
    assert.equal(outcome.reason, "recursive_dispatch");
    assert.equal(outcome.effectDisposition, "confirmed_no_effects");
  } finally {
    if (previous === undefined) delete process.env.PI_PROVENANCE_STANDING_AGENT_DISPATCH;
    else process.env.PI_PROVENANCE_STANDING_AGENT_DISPATCH = previous;
  }
  await rm(world.scratch, { recursive: true, force: true });
});

test("unknown agents and settled pairs fail closed", async () => {
  const world = await setupWorld();
  const unknown = await runDispatch(world, { agent: "agent-ghost" });
  assert.equal(unknown.reason, "unknown_agent");

  const { writeImmutableDispatchReceipt } = await import("../src/dispatch-receipt.ts");
  await mkdir(world.receiptsDir, { recursive: true });
  await writeImmutableDispatchReceipt(ledgerReceipt(world, { settlement: "settled" }), {
    dir: world.receiptsDir,
  });
  const replay = await runDispatch(world);
  assert.equal(replay.reason, "dispatch_already_recorded");
  assert.match(replay.message, /one settled dispatch per \(agent, exact task\) pair/);
  await rm(world.scratch, { recursive: true, force: true });
});

test("failed attempts are retained immutably and bounded", async () => {
  const world = await setupWorld();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const outcome = await runDispatch(
      world,
      {},
      {
        runtimeFactory: fakeRuntime(async () => ({
          ok: false,
          text: "child failed",
          details: settledDetails({ status: "error", exitCode: 1 }),
        })),
      },
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, "dispatch_failed");
    assert.ok(outcome.receiptPath);
    assert.equal(outcome.receipt.dispatch.attemptIndex, attempt);
    assert.equal(outcome.receipt.dispatch.settlement, "not_settled");
  }
  const exhausted = await runDispatch(world);
  assert.equal(exhausted.reason, "dispatch_attempts_exhausted");
  const ledger = await readDispatchAttemptLedger(world.agentName, 5132, {
    dir: world.receiptsDir,
  });
  assert.equal(ledger.attempts.length, 3);
  assert.equal(ledger.settled, undefined);
  assert.equal(ledger.nextAttemptIndex, 4);
  await rm(world.scratch, { recursive: true, force: true });
});

test("AK authorization failures fail closed before agent inspection", async () => {
  const world = await setupWorld();
  const unavailable = await runDispatch(world, { akBinary: join(world.scratch, "missing-ak") });
  assert.equal(unavailable.reason, "ak_unavailable");

  const cases = [
    [{ stdout: "{}\n" }, "task_not_found"],
    [{ stdout: `${JSON.stringify(taskJson("/elsewhere/repo"))}\n` }, "task_repo_mismatch"],
    [
      { stdout: `${JSON.stringify(taskJson(world.parentRoot, { status: "pending" }))}\n` },
      "task_not_claimed",
    ],
    [
      {
        stdout: `${JSON.stringify(
          taskJson(world.parentRoot, { lease_expires_at: "2000-01-01T00:00:00.000000000+00:00" }),
        )}\n`,
      },
      "task_lease_expired",
    ],
  ];
  for (const [behavior, reason] of cases) {
    const ak = makeFakeAk(world.scratch, { task: behavior, evidence: { id: 1 } });
    const outcome = await runDispatch(world, { akBinary: ak.bin });
    assert.equal(outcome.reason, reason, `expected ${reason}`);
    assert.equal(outcome.effectDisposition, "confirmed_no_effects");
  }
  await rm(world.scratch, { recursive: true, force: true });
});

test("agents declaring mutation tools are not read-only dispatchable", async () => {
  const world = await setupWorld({ tools: ["read", "edit"] });
  const outcome = await runDispatch(world);
  assert.equal(outcome.reason, "agent_not_read_only");
  assert.match(outcome.message, /subset of \[read, bash\]/);
  await rm(world.scratch, { recursive: true, force: true });
});

test("dirty agent repositories cannot bind an immutable revision", async () => {
  const world = await setupWorld();
  await writeFile(join(world.agentRoot, "uncommitted.txt"), "dirty\n");
  const outcome = await runDispatch(world);
  assert.equal(outcome.reason, "agent_repo_dirty");
  await rm(world.scratch, { recursive: true, force: true });
});

test("settled dispatch writes one immutable receipt and records AK evidence", async () => {
  const world = await setupWorld();
  const requests = [];
  const outcome = await runDispatch(
    world,
    {},
    {
      runtimeFactory: fakeRuntime(async (request, ctx, onUpdate) => {
        requests.push({ request, ctx });
        onUpdate?.({ text: "progress", details: { status: "running" } });
        const details = settledDetails();
        details.effectReceipt.consumerCorrelationId = request.effectCorrelationId;
        return { ok: true, text: "child observation report", details };
      }),
    },
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.evidenceId, 4242);

  const request = requests[0].request;
  assert.equal(request.profile, "custom");
  assert.equal(request.name, world.agentName);
  assert.equal(request.tools, "read,bash");
  assert.equal(request.mutationPolicy, "read_only");
  assert.equal(request.skillProfile, world.agentName);
  assert.deepEqual(Object.keys(request.env), ["PI_PROVENANCE_STANDING_AGENT_DISPATCH"]);
  assert.equal(request.env.PI_PROVENANCE_STANDING_AGENT_DISPATCH, `ak-5132:${world.agentName}`);
  assert.match(
    request.effectCorrelationId,
    /^pi-agent-registry:ak-5132:agent-test-steward:[0-9a-f]{16}$/,
  );
  assert.ok(request.constraints.some((line) => line.includes("read-only")));
  assert.ok(request.systemPrompt.length > 0);
  assert.match(
    request.systemPrompt,
    /^# Standing-agent dispatch: agent-test-steward \(AK task 5132, Fleet Phase 2, read-only\)/,
    "child prompt envelope must keep the leading argv token dash-safe",
  );
  assert.equal(request.thinking, "medium");

  const receiptPath = join(world.receiptsDir, dispatchReceiptFileName(world.agentName, 5132, 1));
  assert.ok(existsSync(receiptPath));
  assert.equal(statSync(receiptPath).mode & 0o777, 0o400);
  const receipt = await readDispatchReceipt(receiptPath);
  assert.ok(receipt);
  assert.equal(receipt.phase, "fleet_phase_2");
  assert.equal(receipt.dispatch.attemptIndex, 1);
  assert.equal(receipt.dispatch.settlement, "settled");
  assert.equal(receipt.agent.agentRepo.commit, world.agentCommit);
  assert.equal(receipt.agent.agentRepo.revisionStable, true);
  assert.equal(receipt.task.id, 5132);
  assert.equal(receipt.task.claimedBy, "01a05920-5712-78d5-9e33-8d2b9e57c28d");
  assert.equal(receipt.observation.noMutationObserved, true);
  assert.equal(receipt.observation.headStable, true);
  assert.equal(receipt.observation.parentHead, world.parentCommit);
  assert.equal(receipt.dispatch.outputSha256, outcome.receipt.dispatch.outputSha256);
  assert.equal(receipt.dispatch.asc.effectDisposition, "settled");
  assert.equal(receipt.receiptSha256, outcome.receipt.receiptSha256);

  const akCalls = JSON.parse(readFileSync(world.ak.statePath, "utf8"));
  const evidenceCall = akCalls.find((call) => call[0] === "evidence");
  assert.ok(evidenceCall, "evidence recorded through ak");
  const detailsIndex = evidenceCall.indexOf("--details");
  const details = JSON.parse(evidenceCall[detailsIndex + 1]);
  assert.equal(details.receiptSha256, receipt.receiptSha256);
  assert.equal(details.agent, world.agentName);
  assert.equal(evidenceCall[evidenceCall.indexOf("--check-type") + 1], "standing-agent-dispatch");
  assert.equal(evidenceCall[evidenceCall.indexOf("--task") + 1], "5132");
  assert.equal(evidenceCall[evidenceCall.indexOf("--result") + 1], "pass");

  const replay = await runDispatch(world);
  assert.equal(replay.reason, "dispatch_already_recorded");
  await rm(world.scratch, { recursive: true, force: true });
});

test("failed child runs record the receipt but never AK evidence", async () => {
  const world = await setupWorld();
  const outcome = await runDispatch(
    world,
    {},
    {
      runtimeFactory: fakeRuntime(async () => ({
        ok: false,
        text: "child failed",
        details: settledDetails({ status: "error", exitCode: 1, effectDisposition: "settled" }),
      })),
    },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "dispatch_failed");
  assert.ok(outcome.receiptPath);
  const receipt = await readDispatchReceipt(outcome.receiptPath);
  assert.equal(receipt.dispatch.asc.status, "error");
  const akCalls = JSON.parse(readFileSync(world.ak.statePath, "utf8"));
  assert.equal(akCalls.filter((call) => call[0] === "evidence").length, 0);
  await rm(world.scratch, { recursive: true, force: true });
});

test("parent-repo mutation during the dispatch window voids the read-only proof", async () => {
  const world = await setupWorld();
  const outcome = await runDispatch(
    world,
    {},
    {
      runtimeFactory: fakeRuntime(async () => {
        await writeFile(join(world.parentRoot, "sneaky.txt"), "mutated during window\n");
        return { ok: true, text: "child report", details: settledDetails() };
      }),
    },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "read_only_violation_observed");
  assert.equal(outcome.receipt.observation.noMutationObserved, false);
  const akCalls = JSON.parse(readFileSync(world.ak.statePath, "utf8"));
  assert.equal(akCalls.filter((call) => call[0] === "evidence").length, 0);
  await rm(world.scratch, { recursive: true, force: true });
});

test("settlement requires an owner-issued ASC effect receipt, not a bare details field", async () => {
  const world = await setupWorld();
  const bareDetails = await runDispatch(
    world,
    {},
    {
      runtimeFactory: fakeRuntime(async () => {
        const details = settledDetails();
        delete details.effectDisposition;
        delete details.effectReceipt;
        return {
          ok: true,
          text: "child report",
          details: { ...details, effectDisposition: "settled" },
        };
      }),
    },
  );
  assert.equal(bareDetails.ok, false);
  assert.equal(bareDetails.reason, "dispatch_failed");
  assert.equal(bareDetails.receipt.dispatch.settlement, "not_settled");
  await rm(world.scratch, { recursive: true, force: true });
});

test("settlement requires complete ASC identity and a correlation echo", async () => {
  const world = await setupWorld();
  const mismatchedEcho = await runDispatch(
    world,
    {},
    {
      runtimeFactory: fakeRuntime(async () => {
        const details = settledDetails();
        details.effectReceipt.consumerCorrelationId = "someone-elses-correlation";
        return { ok: true, text: "child report", details };
      }),
    },
  );
  assert.equal(mismatchedEcho.ok, false);
  assert.equal(mismatchedEcho.reason, "dispatch_failed");
  assert.equal(mismatchedEcho.receipt.dispatch.settlement, "not_settled");

  const world2 = await setupWorld();
  const anonymous = await runDispatch(
    world2,
    {},
    {
      runtimeFactory: fakeRuntime(async () => {
        const details = settledDetails();
        delete details.dispatchId;
        return { ok: true, text: "child report", details };
      }),
    },
  );
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.reason, "dispatch_failed");
  assert.equal(anonymous.receipt.dispatch.asc.dispatchId, "");
  await rm(world.scratch, { recursive: true, force: true });
  await rm(world2.scratch, { recursive: true, force: true });
});

test("effect truth is derived from the ASC effect receipt, not the absent details field", async () => {
  const world = await setupWorld();
  const outcome = await runDispatch(
    world,
    {},
    {
      runtimeFactory: fakeRuntime(async (request) => {
        const details = settledDetails();
        // exactly the live 2026-08-31 surface: terminal details omit the
        // effectDisposition field; only the effect receipt carries the truth
        delete details.effectDisposition;
        details.effectReceipt.consumerCorrelationId = request.effectCorrelationId;
        return { ok: true, text: "child report", details };
      }),
    },
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.receipt.dispatch.asc.effectDisposition, "settled");
  assert.equal(outcome.receipt.dispatch.settlement, "settled");
  await rm(world.scratch, { recursive: true, force: true });
});

test("evidence-recording failure still reports the settled receipt", async () => {
  const world = await setupWorld({
    akEvidence: { exitCode: 1, id: 0 },
  });
  const outcome = await runDispatch(
    world,
    {},
    {
      runtimeFactory: fakeRuntime(async (request) => ({
        ok: true,
        text: "child report",
        details: {
          ...settledDetails(),
          effectReceipt: {
            ...settledDetails().effectReceipt,
            consumerCorrelationId: request.effectCorrelationId,
          },
        },
      })),
    },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "evidence_record_failed");
  assert.equal(outcome.effectDisposition, "settled");
  assert.ok(outcome.receiptPath);
  await rm(world.scratch, { recursive: true, force: true });
});

test("sessions are resolved through the ASC-owned contract", async () => {
  const { resetAscExecutionSurfaceCache } = await import("../src/asc-execution-surface.ts");
  resetAscExecutionSurfaceCache();
  const scratch = mkdtempSync(join(tmpdir(), "phase2-sessions-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = join(scratch, "pi-agent");
  try {
    const path = await resolveRegistrySubagentSessionsDir(join(scratch, "cwd"));
    assert.match(path, /asc-subagents$/);
    assert.ok(path.startsWith(join(scratch, "pi-agent")));
    assert.ok(existsSync(path));
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(scratch, { recursive: true, force: true });
  }
});

test("shipped dispatch adapter routes through ASC and carries no alternate spawn route", () => {
  const pipeline = readFileSync(new URL("../src/dispatch.ts", import.meta.url), "utf8");
  const request = readFileSync(new URL("../src/dispatch-request.ts", import.meta.url), "utf8");
  assert.match(pipeline, /createPhase2AscRuntime/);
  assert.match(request, /createAscExecutionRuntime/);
  assert.match(request, /resolveSubagentSessionsDir/);
  for (const source of [pipeline, request]) {
    assert.doesNotMatch(
      source,
      /spawnSubagent|fork_peer_spawn|scout_peer_spawn|candidate_peer_spawn|loop_execute|workflow_execute/,
    );
  }
  const sessions = readFileSync(new URL("../src/sessions-dir.ts", import.meta.url), "utf8");
  assert.match(sessions, /resolveSubagentSessionsDir/);
  assert.doesNotMatch(sessions, /PI_SUBAGENT_SESSIONS_DIR/);
});
