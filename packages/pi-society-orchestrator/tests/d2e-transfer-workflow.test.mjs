import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectD2ERepository, validateChangedPaths } from "../src/runtime/d2e-transfer-effects.ts";
import {
  D2E_TRANSFER_COMPLETE_SCHEMA,
  D2E_WORKFLOW_TEMPLATE_NAMES,
  D2E_WORKFLOW_TEMPLATE_OWNERS,
  D2ETransferError,
  executeD2ETransferWorkflow,
} from "../src/runtime/d2e-transfer-workflow.ts";

const repo = "/repos/frankensqlite";
const packetKey = "decision-87-generation-stable-sidecar-safe-vfs-open";
const taskTitle = "Implement the exact authorized owner task";
const objective = taskTitle;
const doneContract = {
  completion_kind: "orchestrator_binding",
  required_outcomes: ["Bind the exact D2E workflow gate"],
  required_validation: ["Run focused and package checks"],
  required_evidence_classes: ["test_receipts"],
  review_questions: ["Can unrelated in-scope work complete?"],
};
const taskGuardrails = {
  invariants: ["Task-native intent controls execution"],
  anti_goals: ["Do not mutate live stores"],
  constraints: ["Stay inside exact scope"],
  rollback_boundaries: ["Disable applied dispatch"],
};
const content = "governed d2e workflow";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
};
const taskIntentSha256 = hash(
  canonicalize({
    schema: "D2E_TASK_INTENT_V1",
    title: taskTitle,
    description: null,
    done_contract: { entity_version: 1, contract: doneContract },
    guardrails: { entity_version: 1, guardrails: taskGuardrails },
  }),
);
const templateIdentity = {
  templateId: 42,
  templateName: "repo-direction-to-execution",
  artifactKind: "procedure",
  controlMode: "one_shot",
  formalizationLevel: "workflow",
  ownerCompany: "holding",
  templateVersion: 7,
  contentSha256: hash(content),
};

function fixtures(overrides = {}) {
  return {
    packet: {
      packet: {
        id: 74,
        repo_scope: repo,
        packet_key: packetKey,
        lifecycle_state: "assessed",
        source_ref: "https://example.test/repo/blob/317d2795/design-packet.md",
        entity_version: 1,
      },
      links: [
        { link_kind: "decision", target_ref: "decision:87", authority_mode: "canonical" },
        { link_kind: "task", target_ref: "task:4381", authority_mode: "canonical" },
        {
          link_kind: "source_doc",
          target_ref: "https://example.test/doc",
          authority_mode: "canonical",
        },
        { link_kind: "owner_layer_ref", target_ref: "issue:308", authority_mode: "reference_only" },
      ],
    },
    task: {
      id: 4381,
      repo,
      title: taskTitle,
      description: null,
      status: "claimed",
      claimed_by: "actor-session-a",
      lease_expires_at: "2030-01-01T00:00:00.000Z",
      entity_version: 4,
      scope: {
        allowed_paths: ["src/**", "tests/**"],
        required_paths: ["src/**"],
        forbidden_paths: ["src/secrets/**"],
      },
    },
    contract: {
      task_id: 4381,
      repo,
      title: taskTitle,
      status: "claimed",
      done_contract: {
        entity_version: 1,
        contract: doneContract,
      },
      guardrails: {
        entity_version: 1,
        guardrails: taskGuardrails,
      },
    },
    decision: {
      decision: {
        id: 87,
        repo_scope: repo,
        state: "unblocked",
        outcome: "accepted",
        updated_at: "2026-07-31T17:05:19.450Z",
      },
      linked_tasks: [{ decision_id: 87, task_id: 4381, link_role: "post_adr_execution" }],
    },
    ...overrides,
  };
}

function fakeExec(data, options = {}) {
  const counts = { packet: 0, task: 0, contract: 0, decision: 0 };
  return async (_command, args) => {
    const kind = args[0] === "task" && args[1] === "contract" ? "contract" : args[0];
    options.events?.push(`read:${kind}:${counts[kind] + 1}`);
    const sequence = options[`${kind}Sequence`];
    const value = sequence?.[counts[kind]] ?? data[kind];
    counts[kind] += 1;
    if (value instanceof Error) throw value;
    return { stdout: JSON.stringify(value), stderr: "", code: 0 };
  };
}

function request(mode, extra = {}) {
  return {
    templateName: templateIdentity.templateName,
    templateIdentity,
    mode,
    repo,
    packetKey,
    taskId: 4381,
    decisionId: 87,
    objective,
    invokingActor: "actor-session-a",
    invokingSessionId: "actor-session-a",
    ...extra,
  };
}

async function proposal(data = fixtures(), extra = {}) {
  return executeD2ETransferWorkflow({
    request: request("proposal", extra),
    exec: fakeExec(data),
    activation: "disabled",
    now: () => Date.parse("2026-08-01T00:00:00Z"),
  });
}

function workflowOutput(scopeSha256, changedPaths = ["src/implementation.rs"], extra = {}) {
  return JSON.stringify({
    changed_paths: changedPaths,
    head_after: "head-after",
    head_before: "head-before",
    objective_sha256: hash(objective),
    outcome: "applied",
    schema: "D2E_WORKFLOW_RESULT_V1",
    task_id: 4381,
    task_intent_sha256: taskIntentSha256,
    task_scope_sha256: scopeSha256,
    ...extra,
  });
}

function appliedOptions(scopeSha256, overrides = {}) {
  const events = overrides.events ?? [];
  const settled = [];
  return {
    request: request("applied", {
      expectedTaskScopeSha256: scopeSha256,
      expectedTaskIntentSha256: taskIntentSha256,
      expectedTemplateVersion: templateIdentity.templateVersion,
      expectedTemplateContentSha256: templateIdentity.contentSha256,
      ...overrides.request,
    }),
    exec: overrides.exec ?? fakeExec(fixtures(), { events }),
    activation: overrides.activation ?? "enabled",
    workflowExecutor: overrides.workflowExecutor ?? {
      async execute() {
        events.push("workflow");
        return {
          mode: "chain",
          status: "done",
          steps: [
            {
              index: 0,
              agent: "builder",
              status: "done",
              displayOutput: workflowOutput(scopeSha256),
            },
          ],
          aggregatedOutput: "done",
        };
      },
    },
    workflowExecution: {
      activeTeam: "implement",
      model: "mock/model",
      cwd: repo,
      cognitiveToolContent: "controlled",
    },
    inspectRepository:
      overrides.inspectRepository ??
      (async (baselineHead) =>
        baselineHead
          ? { head: "head-after", worktreeClean: true, changedPaths: ["src/implementation.rs"] }
          : { head: "head-before", worktreeClean: true, changedPaths: [] }),
    claimPreparedTemplate:
      overrides.claimPreparedTemplate ??
      ((sealedText) => {
        events.push("claim");
        return {
          authorizationId: "authorization-1",
          sealedText,
          templateIdentity: { ...templateIdentity, governedMetadataSha256: hash("metadata") },
          settle(outcome) {
            settled.push(outcome);
          },
        };
      }),
    now: () => Date.parse("2026-08-01T00:00:00Z"),
    events,
    settled,
  };
}

async function assertCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof D2ETransferError);
    assert.equal(error.code, code);
    return true;
  });
}

async function assertFailure(promise, expected) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof D2ETransferError);
    assert.ok(error.failure, "typed failure envelope is required");
    assert.equal(error.failure.schema, "D2E_TRANSFER_FAILURE_V1");
    assert.equal(error.failure.status, "not_ready");
    assert.equal(error.failure.execution_phase, expected.phase);
    assert.equal(error.failure.effect.disposition, expected.effect);
    assert.equal(
      error.failure.transfer_materialization_authorization.disposition,
      expected.authorization,
    );
    assert.equal(
      error.failure.transfer_materialization_authorization.existed_at_dispatch,
      expected.existedAtDispatch,
    );
    if (expected.authorization === "authorized") {
      assert.equal(error.failure.transfer_materialization_authorization.readback?.granted, true);
    } else {
      assert.equal(error.failure.transfer_materialization_authorization.readback, undefined);
    }
    assert.equal(error.failure.required_packet.disposition, expected.packet);
    assert.equal(
      error.failure.downstream_implementation_authorization.disposition,
      "not_authorized",
    );
    if (expected.code) assert.equal(error.code, expected.code);
    if (expected.originalCause) {
      assert.deepEqual(error.originalCause, expected.originalCause);
      assert.deepEqual(error.failure.original_cause, expected.originalCause);
    } else {
      assert.equal(error.failure.original_cause, undefined);
    }
    return true;
  });
}

test("repository inspection proves descendant history and every touched path", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "d2e-repository-effects-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runGit = (args, input) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", input });
    assert.equal(result.status, 0, result.stderr || `git ${args[0]} failed`);
    return result.stdout.trim();
  };
  const exec = async (command, args, options) => {
    const result = spawnSync(command, args, { cwd: options.cwd, encoding: "utf8" });
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      code: result.status ?? 1,
    };
  };

  runGit(["init", "-b", "main"]);
  runGit(["config", "user.name", "D2E fixture"]);
  runGit(["config", "user.email", "d2e@example.test"]);
  fs.mkdirSync(path.join(root, "forbidden"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "forbidden", "secret.txt"), "baseline\n");
  fs.writeFileSync(path.join(root, "src", "base.txt"), "baseline\n");
  runGit(["add", "."]);
  runGit(["commit", "-m", "baseline"]);
  const baselineHead = runGit(["rev-parse", "HEAD"]);

  fs.writeFileSync(path.join(root, "forbidden", "secret.txt"), "transient forbidden effect\n");
  runGit(["add", "."]);
  runGit(["commit", "-m", "touch forbidden path"]);
  runGit(["checkout", baselineHead, "--", "forbidden/secret.txt"]);
  fs.writeFileSync(path.join(root, "src", "allowed.txt"), "allowed effect\n");
  runGit(["add", "."]);
  runGit(["commit", "-m", "restore forbidden endpoint"]);

  const historyState = await inspectD2ERepository({ repo: root, baselineHead, exec });
  assert.equal(historyState.worktreeClean, true);
  assert.deepEqual(historyState.changedPaths, ["forbidden/secret.txt", "src/allowed.txt"]);
  assert.throws(
    () =>
      validateChangedPaths(historyState.changedPaths, {
        allowed_paths: ["src/**"],
        required_paths: [],
        forbidden_paths: ["forbidden/**"],
      }),
    /outside exact task scope: forbidden\/secret\.txt/,
  );

  runGit(["checkout", "-b", "rename-fixture", baselineHead]);
  runGit(["mv", "forbidden/secret.txt", "src/renamed-secret.txt"]);
  runGit(["commit", "-m", "rename forbidden source into scope"]);
  const renameState = await inspectD2ERepository({ repo: root, baselineHead, exec });
  assert.deepEqual(renameState.changedPaths, ["forbidden/secret.txt", "src/renamed-secret.txt"]);

  const emptyTree = runGit(["mktree"], "");
  const unrelatedHead = runGit(["commit-tree", emptyTree, "-m", "unrelated root"]);
  runGit(["checkout", "--detach", unrelatedHead]);
  await assert.rejects(
    inspectD2ERepository({ repo: root, baselineHead, exec }),
    (error) => error instanceof D2ETransferError && error.code === "D2E_TRANSFER_POSTSTATE_INVALID",
  );
});

test("all three exact templates share the immutable D2E binding identity", async () => {
  assert.deepEqual(
    [...D2E_WORKFLOW_TEMPLATE_NAMES],
    [
      "layer12-040-direction-to-execution-ak-native",
      "repo-direction-to-execution",
      "execution-memory-transfer",
    ],
  );
  assert.ok(Object.isFrozen(D2E_WORKFLOW_TEMPLATE_NAMES));
  assert.ok(Object.isFrozen(D2E_WORKFLOW_TEMPLATE_OWNERS));
  assert.deepEqual(D2E_WORKFLOW_TEMPLATE_OWNERS, {
    "layer12-040-direction-to-execution-ak-native": "software",
    "repo-direction-to-execution": "holding",
    "execution-memory-transfer": "core",
  });
  await assertCode(
    proposal(fixtures(), {
      templateName: "direction-to-execution",
      templateIdentity: { ...templateIdentity, templateName: "direction-to-execution" },
    }),
    "D2E_TRANSFER_TEMPLATE_UNBOUND",
  );
});

test("core sequencer accepts only each template's exact owner and workflow metadata", async () => {
  for (const [templateName, ownerCompany] of Object.entries(D2E_WORKFLOW_TEMPLATE_OWNERS)) {
    const result = await proposal(fixtures(), {
      templateName,
      templateIdentity: { ...templateIdentity, templateName, ownerCompany },
    });
    assert.equal(result.receipt.template.ownerCompany, ownerCompany);
  }
  for (const mismatch of [
    { ownerCompany: "software" },
    { artifactKind: "cognitive" },
    { controlMode: "loop" },
    { formalizationLevel: "structured" },
  ]) {
    await assertCode(
      proposal(fixtures(), {
        templateIdentity: { ...templateIdentity, ...mismatch },
      }),
      "D2E_TRANSFER_TEMPLATE_IDENTITY_MISMATCH",
    );
  }
});

test("proposal is lawful read-only success and supplies exact apply digests while disabled", async () => {
  const omittedModeRequest = request("proposal");
  delete omittedModeRequest.mode;
  const omittedMode = await executeD2ETransferWorkflow({
    request: omittedModeRequest,
    exec: fakeExec(fixtures()),
    now: () => Date.parse("2026-08-01T00:00:00Z"),
  });
  assert.equal(omittedMode.receipt.caller_mode, "proposal");
  assert.equal(omittedMode.receipt.effect.disposition, "not_materialized");

  let workflowCalls = 0;
  const result = await executeD2ETransferWorkflow({
    request: request("proposal"),
    exec: fakeExec(fixtures()),
    activation: "disabled",
    workflowExecutor: {
      async execute() {
        workflowCalls += 1;
      },
    },
    now: () => Date.parse("2026-08-01T00:00:00Z"),
  });
  assert.equal(result.kind, "proposal");
  assert.equal(result.receipt.lawful_success, true);
  assert.equal(result.receipt.read_only, true);
  assert.equal(result.receipt.execution_performed, false);
  assert.equal(result.receipt.caller_mode, "proposal");
  assert.equal(result.receipt.status, "not_ready");
  assert.equal(result.receipt.effect.disposition, "not_materialized");
  assert.equal(result.receipt.schema_boundary.inner_workflow_output, "D2E_WORKFLOW_RESULT_V1");
  assert.equal(result.receipt.schema_boundary.outer_transfer_receipt, "D2E_TRANSFER_COMPLETE_V1");
  assert.equal(
    result.receipt.downstream_implementation_authorization.disposition,
    "not_authorized",
  );
  assert.equal(result.receipt.activation, "disabled");
  assert.equal(result.receipt.applied_ready, false);
  assert.equal(result.receipt.template.contentSha256, templateIdentity.contentSha256);
  assert.match(result.receipt.task_scope_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.receipt.task_intent_sha256, taskIntentSha256);
  assert.equal(workflowCalls, 0);

  const ready = await executeD2ETransferWorkflow({
    request: request("proposal"),
    exec: fakeExec(fixtures()),
    activation: "enabled",
    now: () => Date.parse("2026-08-01T00:00:00Z"),
  });
  assert.equal(ready.receipt.status, "ready");
  assert.equal(ready.receipt.transfer_materialization_authorization.disposition, "authorized");
  assert.equal(ready.receipt.downstream_implementation_authorization.disposition, "not_authorized");
  assert.equal(ready.receipt.effect.disposition, "not_materialized");
});

test("core sequencer defaults applied activation off with zero effect on omission", async () => {
  const receipt = (await proposal()).receipt;
  const events = [];
  const options = appliedOptions(receipt.task_scope_sha256, { events });
  delete options.activation;
  await assertCode(executeD2ETransferWorkflow(options), "D2E_TRANSFER_DISABLED");
  assert.deepEqual(events, []);
  assert.deepEqual(options.settled, []);
});

test("proposal binds canonical title, null-description fallback, done-contract, and guardrails", async () => {
  const receipt = (await proposal()).receipt;
  assert.equal(receipt.task_intent_sha256, taskIntentSha256);
  const described = fixtures();
  described.task = { ...described.task, description: "Exact immutable task description" };
  const describedReceipt = (await proposal(described)).receipt;
  assert.notEqual(describedReceipt.task_intent_sha256, receipt.task_intent_sha256);

  const wrongDigest = appliedOptions(receipt.task_scope_sha256, {
    request: { expectedTaskIntentSha256: "0".repeat(64) },
  });
  await assertCode(executeD2ETransferWorkflow(wrongDigest), "D2E_TRANSFER_TASK_INTENT_MISMATCH");

  let dispatchedObjective = "";
  const options = appliedOptions(receipt.task_scope_sha256, {
    workflowExecutor: {
      async execute(input) {
        dispatchedObjective = input.request.steps[0].objective;
        return {
          mode: "chain",
          status: "done",
          steps: [
            {
              index: 0,
              agent: "builder",
              status: "done",
              displayOutput: workflowOutput(receipt.task_scope_sha256),
            },
          ],
          aggregatedOutput: "done",
        };
      },
    },
  });
  await executeD2ETransferWorkflow(options);
  assert.match(dispatchedObjective, new RegExp(taskTitle));
  assert.match(dispatchedObjective, /Bind the exact D2E workflow gate/);
  assert.match(dispatchedObjective, /Task-native intent controls execution/);
  assert.match(dispatchedObjective, new RegExp(taskIntentSha256));
});

test("truly unrelated but in-scope caller objective is refused", async () => {
  const receipt = (await proposal()).receipt;
  const unrelatedObjective = "Reformat an unrelated in-scope source file";
  let workflowCalls = 0;
  const options = appliedOptions(receipt.task_scope_sha256, {
    request: { objective: unrelatedObjective },
    workflowExecutor: {
      async execute() {
        workflowCalls += 1;
        return {
          mode: "chain",
          status: "done",
          steps: [
            {
              index: 0,
              agent: "builder",
              status: "done",
              displayOutput: workflowOutput(receipt.task_scope_sha256, ["src/unrelated.rs"], {
                objective_sha256: hash(unrelatedObjective),
              }),
            },
          ],
          aggregatedOutput: "done",
        };
      },
    },
  });
  await assertCode(executeD2ETransferWorkflow(options), "D2E_TRANSFER_TASK_INTENT_MISMATCH");
  assert.equal(workflowCalls, 0);
  assert.deepEqual(options.settled, []);
});

test("applied mode binds the invoking actor and current session", async () => {
  const receipt = (await proposal()).receipt;
  await assertCode(
    executeD2ETransferWorkflow({
      ...appliedOptions(receipt.task_scope_sha256),
      request: request("applied", {
        invokingActor: "actor-b",
        expectedTaskScopeSha256: receipt.task_scope_sha256,
        expectedTaskIntentSha256: receipt.task_intent_sha256,
        expectedTemplateVersion: 7,
        expectedTemplateContentSha256: templateIdentity.contentSha256,
      }),
    }),
    "D2E_TRANSFER_AUTHORIZATION_REQUIRED",
  );
  await assertCode(
    executeD2ETransferWorkflow({
      ...appliedOptions(receipt.task_scope_sha256),
      request: request("applied", {
        invokingSessionId: "other-session",
        expectedTaskScopeSha256: receipt.task_scope_sha256,
        expectedTaskIntentSha256: receipt.task_intent_sha256,
        expectedTemplateVersion: 7,
        expectedTemplateContentSha256: templateIdentity.contentSha256,
      }),
    }),
    "D2E_TRANSFER_AUTHORIZATION_REQUIRED",
  );
  await assertCode(
    executeD2ETransferWorkflow({
      ...appliedOptions(receipt.task_scope_sha256),
      request: request("applied", {
        invokingSessionId: "",
        expectedTaskScopeSha256: receipt.task_scope_sha256,
        expectedTaskIntentSha256: receipt.task_intent_sha256,
        expectedTemplateVersion: 7,
        expectedTemplateContentSha256: templateIdentity.contentSha256,
      }),
    }),
    "D2E_TRANSFER_INPUT_INVALID",
  );
});

test("extra canonical task or decision links fail closed", async () => {
  const data = fixtures();
  data.packet.links.push({
    link_kind: "task",
    target_ref: "task:4382",
    authority_mode: "canonical",
  });
  await assertCode(proposal(data), "D2E_TRANSFER_PACKET_MISMATCH");
});

test("template identity, version, and content drift fail before dispatch", async () => {
  await assertCode(
    proposal(fixtures(), {
      templateIdentity: { ...templateIdentity, ownerCompany: "core" },
    }),
    "D2E_TRANSFER_TEMPLATE_IDENTITY_MISMATCH",
  );
  const receipt = (await proposal()).receipt;
  const options = appliedOptions(receipt.task_scope_sha256);
  options.request.expectedTemplateVersion = 6;
  await assertCode(executeD2ETransferWorkflow(options), "D2E_TRANSFER_TEMPLATE_IDENTITY_MISMATCH");
});

test("scope digest drift and out-of-scope effects fail closed", async () => {
  const receipt = (await proposal()).receipt;
  const wrongScope = appliedOptions("0".repeat(64));
  await assertCode(executeD2ETransferWorkflow(wrongScope), "D2E_TRANSFER_TASK_SCOPE_MISMATCH");
  const unrelated = appliedOptions(receipt.task_scope_sha256, {
    inspectRepository: async (baselineHead) =>
      baselineHead
        ? { head: "head-after", worktreeClean: true, changedPaths: ["README.md"] }
        : { head: "head-before", worktreeClean: true, changedPaths: [] },
  });
  await assertCode(executeD2ETransferWorkflow(unrelated), "D2E_TRANSFER_EFFECTS_INVALID");
  assert.deepEqual(unrelated.settled, ["failed"]);
});

test("another actor lease or deferral drift after preparation refuses before Vault claim", async () => {
  const receipt = (await proposal()).receipt;
  const base = fixtures();
  const otherActor = { ...base.task, claimed_by: "actor-b", entity_version: 5 };
  const deferred = { ...base.task, active_deferral: { state: "active" }, entity_version: 5 };
  const leaseDrift = {
    ...base.task,
    lease_expires_at: "2031-01-01T00:00:00Z",
    entity_version: 5,
  };
  for (const drifted of [otherActor, deferred, leaseDrift]) {
    const events = [];
    const options = appliedOptions(receipt.task_scope_sha256, {
      events,
      exec: fakeExec(base, { events, taskSequence: [base.task, drifted] }),
    });
    await assertCode(executeD2ETransferWorkflow(options), "D2E_TRANSFER_AUTHORIZATION_DRIFT");
    assert.equal(events.includes("claim"), false);
    assert.equal(events.includes("workflow"), false);
  }
});

test("task-native acceptance drift after preparation refuses before Vault claim", async () => {
  const receipt = (await proposal()).receipt;
  const base = fixtures();
  const driftedContract = {
    ...base.contract,
    done_contract: {
      ...base.contract.done_contract,
      entity_version: 2,
      contract: {
        ...base.contract.done_contract.contract,
        required_outcomes: ["Perform unrelated work"],
      },
    },
  };
  const events = [];
  const options = appliedOptions(receipt.task_scope_sha256, {
    events,
    exec: fakeExec(base, {
      events,
      contractSequence: [base.contract, driftedContract],
    }),
  });
  await assertCode(executeD2ETransferWorkflow(options), "D2E_TRANSFER_TASK_INTENT_MISMATCH");
  assert.equal(events.includes("claim"), false);
  assert.equal(events.includes("workflow"), false);
});

test("Vault claim is exact and occurs immediately before workflow dispatch", async () => {
  const receipt = (await proposal()).receipt;
  const events = [];
  const options = appliedOptions(receipt.task_scope_sha256, { events });
  const result = await executeD2ETransferWorkflow(options);
  assert.equal(result.kind, "complete");
  assert.deepEqual(events.slice(events.indexOf("claim")), [
    "claim",
    "workflow",
    "read:packet:3",
    "read:task:3",
    "read:contract:3",
    "read:decision:3",
  ]);
  assert.deepEqual(options.settled, ["handed_off"]);
});

test("forged Vault claim identity fails before workflow", async () => {
  const receipt = (await proposal()).receipt;
  let workflowCalls = 0;
  const options = appliedOptions(receipt.task_scope_sha256, {
    claimPreparedTemplate: (sealedText) => ({
      authorizationId: "forged",
      sealedText,
      templateIdentity: {
        ...templateIdentity,
        contentSha256: hash("other"),
        governedMetadataSha256: hash("metadata"),
      },
      settle() {},
    }),
    workflowExecutor: {
      async execute() {
        workflowCalls += 1;
      },
    },
  });
  await assertCode(executeD2ETransferWorkflow(options), "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED");
  assert.equal(workflowCalls, 0);
});

test("status done with no-op, prose, or unrelated objective output cannot complete", async () => {
  const receipt = (await proposal()).receipt;
  const noOp = appliedOptions(receipt.task_scope_sha256, {
    inspectRepository: async () => ({ head: "head-before", worktreeClean: true, changedPaths: [] }),
  });
  await assertCode(executeD2ETransferWorkflow(noOp), "D2E_TRANSFER_POSTSTATE_INVALID");

  for (const displayOutput of [
    "done",
    workflowOutput(receipt.task_scope_sha256, [], {
      objective_sha256: hash("unrelated objective"),
    }),
    workflowOutput(receipt.task_scope_sha256, ["src/implementation.rs"], {
      task_intent_sha256: hash("unrelated task intent"),
    }),
  ]) {
    const badOutput = appliedOptions(receipt.task_scope_sha256, {
      workflowExecutor: {
        async execute() {
          return {
            mode: "chain",
            status: "done",
            steps: [{ index: 0, agent: "builder", status: "done", displayOutput }],
            aggregatedOutput: "done",
          };
        },
      },
    });
    await assertCode(executeD2ETransferWorkflow(badOutput), "D2E_TRANSFER_OUTPUT_INVALID");
  }
});

test("initial required-packet blockage is typed not-authorized and not-materialized", async () => {
  const data = fixtures();
  await assertFailure(
    executeD2ETransferWorkflow({
      request: request("proposal"),
      exec: fakeExec(data, { packetSequence: [new Error("packet unavailable")] }),
      now: () => Date.parse("2026-08-01T00:00:00Z"),
    }),
    {
      phase: "initial_readback",
      effect: "not_materialized",
      authorization: "not_authorized",
      existedAtDispatch: false,
      packet: "blocked",
      code: "D2E_TRANSFER_PACKET_READBACK_FAILED",
    },
  );
});

test("pre-dispatch preparation failure is typed not-authorized and not-materialized", async () => {
  const receipt = (await proposal()).receipt;
  const events = [];
  const options = appliedOptions(receipt.task_scope_sha256, { events });
  delete options.workflowExecutor;
  delete options.workflowExecution;
  options.prepareWorkflow = async () => {
    throw new Error("preparation unavailable");
  };
  await assertFailure(executeD2ETransferWorkflow(options), {
    phase: "preparation",
    effect: "not_materialized",
    authorization: "not_authorized",
    existedAtDispatch: false,
    packet: "ready",
    code: "D2E_TRANSFER_WORKFLOW_INCOMPLETE",
  });
  assert.equal(events.includes("claim"), false);
  assert.equal(events.includes("workflow"), false);
});

test("every final AK boundary failure preserves dispatch authorization and indeterminate effect", async () => {
  const receipt = (await proposal()).receipt;
  const base = fixtures();
  const cases = [
    ["packet", "D2E_TRANSFER_PACKET_READBACK_FAILED", "blocked"],
    ["task", "D2E_TRANSFER_TASK_READBACK_FAILED", "ready"],
    ["contract", "D2E_TRANSFER_TASK_READBACK_FAILED", "ready"],
    ["decision", "D2E_TRANSFER_DECISION_READBACK_FAILED", "ready"],
  ];
  for (const [boundary, code, packet] of cases) {
    const events = [];
    const options = appliedOptions(receipt.task_scope_sha256, {
      events,
      exec: fakeExec(base, {
        events,
        [`${boundary}Sequence`]: [
          base[boundary],
          base[boundary],
          new Error(`final ${boundary} unavailable`),
        ],
      }),
    });
    await assertFailure(executeD2ETransferWorkflow(options), {
      phase: "final_readback",
      effect: "indeterminate",
      authorization: "authorized",
      existedAtDispatch: true,
      packet,
      code,
    });
    assert.equal(events.includes("workflow"), true);
    assert.deepEqual(options.settled, ["failed"]);
  }
});

test("combined final packet and failed Vault settlement preserves packet boundary and cause", async () => {
  const receipt = (await proposal()).receipt;
  const base = fixtures();
  const events = [];
  const options = appliedOptions(receipt.task_scope_sha256, {
    events,
    exec: fakeExec(base, {
      events,
      packetSequence: [base.packet, base.packet, new Error("final packet unavailable")],
    }),
    claimPreparedTemplate: (sealedText) => ({
      authorizationId: "authorization-combined-failure",
      sealedText,
      templateIdentity: { ...templateIdentity, governedMetadataSha256: hash("metadata") },
      settle(outcome) {
        events.push(`settle:${outcome}`);
        if (outcome === "failed") throw new Error("Vault failure settlement unavailable");
      },
    }),
  });
  await assertFailure(executeD2ETransferWorkflow(options), {
    phase: "vault_settlement",
    effect: "indeterminate",
    authorization: "authorized",
    existedAtDispatch: true,
    packet: "blocked",
    code: "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED",
    originalCause: {
      code: "D2E_TRANSFER_PACKET_READBACK_FAILED",
      message: "packet readback failed: final packet unavailable",
      failure_boundary: "required_packet",
    },
  });
  assert.equal(events.includes("workflow"), true);
  assert.deepEqual(
    events.filter((event) => event.startsWith("settle:")),
    ["settle:failed"],
  );
});

test("post-effect Vault settlement failure preserves authorization and indeterminate effect", async () => {
  const receipt = (await proposal()).receipt;
  const events = [];
  const options = appliedOptions(receipt.task_scope_sha256, {
    events,
    claimPreparedTemplate: (sealedText) => ({
      authorizationId: "authorization-settlement-failure",
      sealedText,
      templateIdentity: { ...templateIdentity, governedMetadataSha256: hash("metadata") },
      settle(outcome) {
        events.push(`settle:${outcome}`);
        if (outcome === "handed_off") throw new Error("Vault settlement unavailable");
      },
    }),
  });
  await assertFailure(executeD2ETransferWorkflow(options), {
    phase: "vault_settlement",
    effect: "indeterminate",
    authorization: "authorized",
    existedAtDispatch: true,
    packet: "ready",
    code: "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED",
  });
  assert.equal(events.includes("workflow"), true);
  assert.deepEqual(
    events.filter((event) => event.startsWith("settle:")),
    ["settle:handed_off"],
  );
});

test("AK post-state drift prevents completion after repository effects", async () => {
  const receipt = (await proposal()).receipt;
  const base = fixtures();
  const options = appliedOptions(receipt.task_scope_sha256, {
    exec: fakeExec(base, {
      taskSequence: [
        base.task,
        base.task,
        { ...base.task, lease_expires_at: "2031-01-01T00:00:00Z" },
      ],
    }),
  });
  await assertCode(executeD2ETransferWorkflow(options), "D2E_TRANSFER_POSTSTATE_INVALID");
  assert.deepEqual(options.settled, ["failed"]);
});

test("rollback disable blocks apply without preparing or claiming", async () => {
  const receipt = (await proposal()).receipt;
  const events = [];
  const options = appliedOptions(receipt.task_scope_sha256, {
    activation: "disabled",
    events,
  });
  await assertCode(executeD2ETransferWorkflow(options), "D2E_TRANSFER_DISABLED");
  assert.equal(events.includes("claim"), false);
  assert.equal(events.includes("workflow"), false);
});

test("complete constrained fixture emits exact effect and identity receipt", async () => {
  const proposalReceipt = (await proposal()).receipt;
  const options = appliedOptions(proposalReceipt.task_scope_sha256);
  const result = await executeD2ETransferWorkflow(options);
  assert.equal(result.kind, "complete");
  assert.equal(result.receipt.schema, D2E_TRANSFER_COMPLETE_SCHEMA);
  assert.equal(result.receipt.lawful_success, true);
  assert.equal(result.receipt.execution_performed, true);
  assert.equal(result.receipt.caller_mode, "applied");
  assert.equal(result.receipt.status, "complete");
  assert.equal(result.receipt.effect.disposition, "materialized");
  assert.equal(result.receipt.workflow.output_schema, "D2E_WORKFLOW_RESULT_V1");
  assert.equal(result.receipt.transfer_materialization_authorization.disposition, "authorized");
  assert.equal(
    result.receipt.downstream_implementation_authorization.disposition,
    "not_authorized",
  );
  assert.equal(result.receipt.authorization.invokingActor, "actor-session-a");
  assert.equal(result.receipt.authorization.invokingSessionId, "actor-session-a");
  assert.equal(result.receipt.task.scope_sha256, proposalReceipt.task_scope_sha256);
  assert.equal(result.receipt.task.intent_sha256, proposalReceipt.task_intent_sha256);
  assert.equal(result.receipt.effect.task_intent_sha256, proposalReceipt.task_intent_sha256);
  assert.equal(result.receipt.template.governedMetadataSha256, hash("metadata"));
  assert.deepEqual(result.receipt.effect.changed_paths, ["src/implementation.rs"]);
  assert.equal(result.receipt.effect.head_before, "head-before");
  assert.equal(result.receipt.effect.head_after, "head-after");
  assert.deepEqual(options.settled, ["handed_off"]);
});
