import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import extension from "../../extensions/society-orchestrator.ts";
import { BUILT_IN_PLUGINS, registerLoopTools } from "../../src/loops/engine.ts";
import { resolveAgentForTeam, validateLoopAgentsForTeam } from "../../src/runtime/agent-routing.ts";

test("validateLoopAgentsForTeam surfaces incompatible loop phases before execution", () => {
  const failures = validateLoopAgentsForTeam({
    phases: BUILT_IN_PLUGINS.strategic.phases,
    agents: BUILT_IN_PLUGINS.strategic.agents,
    activeTeam: "implement",
  });

  assert.deepEqual(
    failures.map((entry) => entry.phase),
    ["mission", "intelligence"],
  );
  assert.match(failures[0].error, /does not allow agent 'researcher'/);
  assert.match(failures[1].error, /does not allow agent 'scout'/);
});

test("loop_execute reports loop/team mismatches before execution starts", async () => {
  const registeredTools = new Map();
  registerLoopTools(
    {
      registerTool(tool) {
        registeredTools.set(tool.name, tool);
      },
    },
    BUILT_IN_PLUGINS,
    "/tmp/nonexistent-vault",
    (agent, ctx) => {
      assert.equal(ctx.cwd, process.cwd());
      return resolveAgentForTeam(agent, "implement");
    },
  );

  const loopExecuteTool = registeredTools.get("loop_execute");
  assert.ok(loopExecuteTool, "expected loop_execute to register");
  const result = await loopExecuteTool.execute(
    "tool-call-id",
    { loop: "strategic", objective: "Plan the migration" },
    undefined,
    undefined,
    { cwd: process.cwd(), model: undefined },
  );

  assert.equal(result.details.ok, false);
  assert.equal(result.details.error, "loop-agent-team-mismatch");
  assert.match(result.content[0].text, /Loop 'strategic' is incompatible with the active team:/);
  assert.match(result.content[0].text, /mission: researcher/);
  assert.match(result.content[0].text, /intelligence: scout/);
});

test("vault_execute_template dispatches known loop and D2E workflow bindings through exact gates", async () => {
  const tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-vault-dispatch-"));
  const previousVaultDir = process.env.VAULT_DIR;
  const previousPiCompany = process.env.PI_COMPANY;
  const previousD2eMode = process.env.PI_ORCH_D2E_TRANSFER_MODE;
  const previousExecutionMemoryMode = process.env.PI_ORCH_D2E_EXECUTION_MEMORY_MODE;
  const previousExecutionMemoryBin = process.env.PI_ORCH_D2E_AK_BIN;
  const previousExecutionMemorySha = process.env.PI_ORCH_D2E_AK_SHA256;

  try {
    execFileSync(
      "dolt",
      [
        "init",
        "--name=pi-society-orchestrator-tests",
        "--email=pi-society-orchestrator-tests@example.invalid",
        "-b",
        "main",
      ],
      { cwd: tempVaultDir, stdio: "ignore" },
    );
    execFileSync(
      "dolt",
      [
        "sql",
        "-q",
        [
          "CREATE TABLE prompt_templates (",
          "id INT PRIMARY KEY,",
          "name VARCHAR(64) NOT NULL,",
          "description TEXT,",
          "content TEXT,",
          "artifact_kind VARCHAR(32) NOT NULL,",
          "control_mode VARCHAR(32) NOT NULL,",
          "formalization_level VARCHAR(32) NOT NULL,",
          "owner_company VARCHAR(32) NOT NULL,",
          "visibility_companies JSON NOT NULL,",
          "controlled_vocabulary JSON,",
          "status VARCHAR(16) NOT NULL,",
          "export_to_pi BOOLEAN NOT NULL,",
          "version INT NOT NULL,",
          "UNIQUE KEY prompt_templates_name (name)",
          ");",
          "INSERT INTO prompt_templates VALUES",
          "(1,'transcendent-iteration','Transcendent loop','body','procedure','loop','workflow','core','[\"core\",\"software\"]',NULL,'active',true,4),",
          "(2,'workflow-procedure','Workflow procedure','body','procedure','one_shot','workflow','core','[\"core\",\"software\"]',NULL,'active',true,1),",
          "(3,'pi-autoresearch-setup','Autoresearch setup','body','procedure','one_shot','workflow','software','[\"software\"]',NULL,'active',true,1),",
          "(4,'layer12-040-direction-to-execution-ak-native','D2E','body','procedure','one_shot','workflow','software','[\"software\"]',NULL,'active',true,4),",
          "(5,'deep-review','Deep review','GOVERNED DEEP REVIEW BODY','cognitive','one_shot','workflow','core','[\"core\",\"software\"]',NULL,'active',true,2),",
          "(6,'repo-direction-to-execution','Repo D2E','body','procedure','one_shot','workflow','holding','[\"holding\",\"software\"]',NULL,'active',true,2),",
          "(7,'execution-memory-transfer','Memory transfer','body','procedure','one_shot','workflow','core','[\"core\",\"software\"]',NULL,'active',true,1);",
        ].join(" "),
      ],
      { cwd: tempVaultDir, stdio: "ignore" },
    );
    process.env.VAULT_DIR = tempVaultDir;
    process.env.PI_COMPANY = "software";
    process.env.PI_ORCH_D2E_TRANSFER_MODE = "enabled";

    const executionMemoryBinary = path.join(tempVaultDir, "ak-bin");
    fs.writeFileSync(executionMemoryBinary, "immutable-ak-fixture\n", { mode: 0o555 });
    process.env.PI_ORCH_D2E_AK_BIN = executionMemoryBinary;
    process.env.PI_ORCH_D2E_AK_SHA256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(executionMemoryBinary))
      .digest("hex");
    delete process.env.PI_ORCH_D2E_EXECUTION_MEMORY_MODE;
    let executionMemoryCalls = 0;
    const executionMemoryPacketSource = `https://github.com/tryingET/agent-kernel/blob/${"a".repeat(40)}/docs/packet.md`;
    const executionMemoryParams = {
      template_name: "execution-memory-transfer",
      objective: "Observe Decision 100 execution memory without authorization inference",
      repo: process.cwd(),
      packet_id: 74,
      packet_key: "decision-100-packet",
      packet_source: executionMemoryPacketSource,
      packet_source_sha256: "b".repeat(64),
      expected_task_ids: [4427],
      expected_dependencies: ["4427:none"],
      decision_id: 100,
    };
    const executionMemoryEnvelope = {
      surface: "decision.execution_memory_check",
      schema_version: 1,
      emitted_at: "2026-08-01T22:00:00.000000000Z",
      payload_kind: "d2e_execution_memory_check",
      schema_locator: "ak machine schema decision-execution-memory-check",
      ok: true,
      error: null,
      payload: {
        profile: "d2e-transfer-v1",
        profile_schema_version: 1,
        read_only: true,
        evaluated_at: "2026-08-01T22:00:00.000000000Z",
        database: {
          canonical_path: "/disposable/society.v2.db",
          schema_version: 41,
          supported_schema_min: 41,
          supported_schema_max: 41,
          open_mode: "existing_runtime_query_only",
          transaction_mode: "deferred_single_snapshot",
          capability_checks: [
            "repo_registration_v1",
            "decision_post_adr_v1",
            "layer12_packet_identity_v1",
            "task_execution_memory_v1",
            "task_admission_v1",
            "task_closeout_v1",
            "fcos_metadata_boundary_v1",
          ].map((id) => ({ id, present: true })),
        },
        capabilities: {
          coherent_read_transaction: true,
          packet_identity_check: true,
          task_memory_check: true,
          negative_authorization_gate_proof: true,
          positive_authorization_proof: false,
          closeout_projection: true,
        },
        request: {
          decision_id: 100,
          repo_scope: process.cwd(),
          packet_id: 74,
          packet_key: "decision-100-packet",
          packet_source: executionMemoryPacketSource,
          packet_source_sha256: "b".repeat(64),
          expect_task_ids: [4427],
          expect_dependencies: [{ task_id: 4427, depends_on: [] }],
          authorization_block_ref: null,
        },
        decision_lifecycle: {
          ready: true,
          decision: {
            id: 100,
            repo_scope: process.cwd(),
            significance_tier: "architecture",
            state: "unblocked",
            outcome: "accepted",
            adr_ref: "docs/adr/0032.md",
          },
          current_implementation_plan: null,
          current_validation_rollout_rollback: null,
          active_post_adr_task_ids: [4427],
          post_adr_execution_history: [],
          missing_codes: [],
        },
        packet_identity: {
          ready: true,
          packet: null,
          source_matches: true,
          source_verification: null,
          links: [],
          relations: [],
          graph_issues: [],
          missing_codes: [],
        },
        execution_task_memory: {
          ready: true,
          expected_set_matches_active_post_adr_set: true,
          tasks: [],
          missing_codes: [],
        },
        task_admission: { state: "clear", tasks: [] },
        authorization: {
          capability: "negative_gate_only",
          positive_proof_supported: false,
          state: "unproven",
          block_ref: null,
          verified_block: null,
          finding_codes: [],
        },
        closeout: { state: "not_ready", ready: false, tasks: [] },
        profile_health: { state: "healthy", issues: [] },
        pre_execution_memory_ready: true,
        result_state: "memory_ready_authorization_unproven",
        missing_codes: [],
        warnings: [],
      },
    };

    let capturedWorkflowRequest;
    const preflightReceipt = {
      nonce: "test-preflight-nonce",
      receiptDigest: "test-preflight-digest",
      registryId: "test-preflight-registry",
    };
    const preflightSettlements = [];
    let preflightSettlementSucceeds = true;

    const registeredTools = new Map();
    registerLoopTools(
      {
        registerTool(tool) {
          registeredTools.set(tool.name, tool);
        },
        async exec(_command, args) {
          const repo = process.cwd();
          if (args[0] === "decision" && args[1] === "execution-memory-check") {
            executionMemoryCalls += 1;
            return {
              stdout: JSON.stringify(executionMemoryEnvelope),
              stderr: "",
              code: 0,
            };
          }
          if (args[0] === "packet") {
            return {
              stdout: JSON.stringify({
                packet: {
                  id: 74,
                  repo_scope: repo,
                  packet_key: "decision-87-packet",
                  lifecycle_state: "assessed",
                  source_ref: "https://example.test/packet",
                  entity_version: 1,
                },
                links: [
                  { link_kind: "task", target_ref: "task:4381", authority_mode: "canonical" },
                  { link_kind: "decision", target_ref: "decision:87", authority_mode: "canonical" },
                ],
              }),
              stderr: "",
              code: 0,
            };
          }
          if (args[0] === "task" && args[1] === "contract") {
            return {
              stdout: JSON.stringify({
                task_id: 4381,
                repo,
                title: "Find the next lawful DSPx execution boundary",
                status: "claimed",
                done_contract: {
                  entity_version: 1,
                  contract: {
                    completion_kind: "orchestrator_binding",
                    required_outcomes: ["Preserve the lawful D2E boundary"],
                    required_validation: ["Run the exact gate checks"],
                    required_evidence_classes: ["test_receipts"],
                    review_questions: ["Is applied execution still authorization-bound?"],
                  },
                },
                guardrails: {
                  entity_version: 1,
                  guardrails: {
                    invariants: ["Do not infer authorization"],
                    anti_goals: ["Do not implement deferred Decision 87 work"],
                    constraints: ["Read-only proposal only"],
                    rollback_boundaries: ["Disable the D2E controller"],
                  },
                },
              }),
              stderr: "",
              code: 0,
            };
          }
          if (args[0] === "task") {
            return {
              stdout: JSON.stringify({
                id: 4381,
                repo,
                title: "Find the next lawful DSPx execution boundary",
                description: null,
                status: "claimed",
                claimed_by: "actor-session-a",
                lease_expires_at: "2030-01-01T00:00:00Z",
                entity_version: 1,
                scope: {
                  allowed_paths: ["packages/pi-society-orchestrator/src/**"],
                  required_paths: [],
                  forbidden_paths: [],
                },
                active_deferral: { state: "active" },
              }),
              stderr: "",
              code: 0,
            };
          }
          return {
            stdout: JSON.stringify({
              decision: {
                id: 87,
                repo_scope: repo,
                state: "unblocked",
                outcome: "accepted",
                updated_at: "2026-07-31T17:05:19Z",
              },
              linked_tasks: [{ decision_id: 87, task_id: 4381, link_role: "post_adr_execution" }],
            }),
            stderr: "",
            code: 0,
          };
        },
      },
      BUILT_IN_PLUGINS,
      tempVaultDir,
      (agent) => ({
        ok: false,
        agent,
        team: "implement",
        allowedAgents: ["builder"],
        error: `test resolver blocked ${agent}`,
      }),
      {
        dispatchReceiptPath: path.join(tempVaultDir, "dispatch-handoffs.jsonl"),
        governedDeepReviewPreflight: {
          ownerModuleUrl: "file:///test/governed-preflight.ts",
          verifyReceipt() {
            return true;
          },
          async prepare() {
            throw new Error("not used by loop tool test");
          },
          bindToolCall() {
            return true;
          },
          claimForExecution({ templateName }) {
            return templateName === "deep-review"
              ? { ok: true, receipt: preflightReceipt }
              : { ok: true, receipt: null };
          },
          settleExecution(nonce, outcome) {
            preflightSettlements.push({ nonce, outcome });
            return preflightSettlementSucceeds;
          },
          cancel() {
            return false;
          },
        },
        async executeVaultWorkflow(request) {
          capturedWorkflowRequest = request;
          return {
            accepted: true,
            handoffId: request.handoffId,
            runId: "workflow-run-deep-review",
            status: "done",
            output: "governed review complete",
            details: { stepCount: 1 },
          };
        },
      },
    );

    const vaultExecuteTool = registeredTools.get("vault_execute_template");
    assert.ok(vaultExecuteTool, "expected vault_execute_template to register");
    const result = await vaultExecuteTool.execute(
      "tool-call-id",
      { template_name: "transcendent-iteration", objective: "Improve the runtime gate" },
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined },
    );

    assert.equal(result.details.ok, false);
    assert.equal(result.details.error, "loop-agent-team-mismatch");
    assert.match(
      result.content[0].text,
      /Loop 'transcendent' is incompatible with the active team:/,
    );

    const deepReviewResult = await vaultExecuteTool.execute(
      "tool-call-id-deep-review",
      { template_name: "deep-review", objective: "Review the current implementation" },
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined },
    );
    assert.equal(deepReviewResult.details.ok, true, JSON.stringify(deepReviewResult.details));
    assert.equal(deepReviewResult.details.templateName, "deep-review");
    assert.equal(deepReviewResult.details.executionSurface, "workflow_execute");
    assert.equal(deepReviewResult.details.status, "done");
    assert.equal(deepReviewResult.details.runId, "workflow-run-deep-review");
    assert.equal(deepReviewResult.details.preflightNonce, preflightReceipt.nonce);
    assert.equal(deepReviewResult.details.preflightReceiptDigest, preflightReceipt.receiptDigest);
    assert.equal(deepReviewResult.details.preflightRegistryId, preflightReceipt.registryId);
    assert.deepEqual(preflightSettlements, [{ nonce: preflightReceipt.nonce, outcome: "done" }]);
    assert.match(deepReviewResult.content[0].text, /governed review complete/);
    assert.equal(capturedWorkflowRequest.templateName, "deep-review");
    assert.equal(capturedWorkflowRequest.objective, "Review the current implementation");
    assert.match(capturedWorkflowRequest.sealedText, /GOVERNED DEEP REVIEW BODY/);
    assert.match(capturedWorkflowRequest.sealedText, /Review the current implementation/);
    assert.equal(capturedWorkflowRequest.executionArgs.workflow_id, "deep-review.v1");
    assert.ok(capturedWorkflowRequest.handoffId);
    assert.ok(fs.existsSync(path.join(tempVaultDir, "dispatch-handoffs.jsonl")));

    preflightSettlementSucceeds = false;
    const unsettledDeepReview = await vaultExecuteTool.execute(
      "tool-call-id-deep-review-unsettled",
      { template_name: "deep-review", objective: "Exercise settlement failure" },
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined },
    );
    assert.equal(unsettledDeepReview.details.ok, false);
    assert.equal(
      unsettledDeepReview.details.error,
      "governed-deep-review-preflight-settlement-failed",
    );
    assert.match(unsettledDeepReview.content[0].text, /preflight settlement failed/);
    preflightSettlementSucceeds = true;

    const workflowResult = await vaultExecuteTool.execute(
      "tool-call-id-2",
      { template_name: "workflow-procedure", objective: "Try to execute workflow" },
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined },
    );
    assert.equal(workflowResult.details.ok, false);
    assert.equal(workflowResult.details.error, "vault-template-workflow-owner-route-required");
    assert.equal(workflowResult.details.dispatchCheck.status, "blocked");
    assert.equal(
      workflowResult.details.dispatchCheck.results[0].posture,
      "orchestrator_workflow_gate_required",
    );
    assert.match(
      workflowResult.details.dispatchCheck.results[0].reason,
      /formalization_level=workflow.*no concrete workflow executor binding is verified/i,
    );
    assert.match(workflowResult.content[0].text, /workflow-grade but has no executable binding/);
    assert.match(workflowResult.content[0].text, /No owner-specific route is registered/);

    const autoresearchSetupResult = await vaultExecuteTool.execute(
      "tool-call-id-3",
      {
        template_name: "pi-autoresearch-setup",
        objective: "Reduce lane-op startup latency through a manifest campaign",
      },
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined },
    );
    assert.equal(autoresearchSetupResult.details.ok, false);
    assert.equal(
      autoresearchSetupResult.details.error,
      "vault-template-workflow-owner-route-required",
    );
    assert.equal(autoresearchSetupResult.details.dispatchCheck.status, "blocked");
    assert.equal(
      autoresearchSetupResult.details.dispatchCheck.results[0].posture,
      "orchestrator_workflow_gate_required",
    );
    assert.match(
      autoresearchSetupResult.details.dispatchCheck.results[0].reason,
      /formalization_level=workflow.*no concrete workflow executor binding is verified/i,
    );
    assert.match(autoresearchSetupResult.content[0].text, /Owner-specific lawful route/);
    assert.match(autoresearchSetupResult.content[0].text, /autoresearch_runtime_status/);
    assert.match(autoresearchSetupResult.content[0].text, /loop back to discovery\/design/);

    const d2eResult = await vaultExecuteTool.execute(
      "tool-call-id-4",
      {
        template_name: "layer12-040-direction-to-execution-ak-native",
        objective: "Find the next lawful DSPx execution boundary",
        transfer_mode: "proposal",
        repo: process.cwd(),
        packet_key: "decision-87-packet",
        task_id: 4381,
        decision_id: 87,
        actor: "actor-session-a",
      },
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined, sessionId: "actor-session-a" },
    );
    assert.equal(d2eResult.details.ok, true);
    assert.equal(d2eResult.details.kind, "proposal");
    assert.equal(d2eResult.details.status, "not_ready");
    assert.equal(d2eResult.details.receipt.schema, "D2E_TRANSFER_PROPOSAL_V1");
    assert.equal(d2eResult.details.receipt.lawful_success, true);
    assert.equal(d2eResult.details.receipt.read_only, true);
    assert.equal(d2eResult.details.receipt.execution_performed, false);
    assert.equal(d2eResult.details.receipt.applied, false);
    assert.equal(d2eResult.details.receipt.caller_mode, "proposal");
    assert.equal(d2eResult.details.receipt.status, "not_ready");
    assert.equal(d2eResult.details.receipt.effect.disposition, "not_materialized");
    assert.equal(
      d2eResult.details.receipt.downstream_implementation_authorization.disposition,
      "not_authorized",
    );

    assert.equal(
      d2eResult.details.receipt.schema_boundary.inner_workflow_output,
      "D2E_WORKFLOW_RESULT_V1",
    );
    assert.equal(d2eResult.details.receipt.template.artifactKind, "procedure");
    assert.equal(d2eResult.details.receipt.template.ownerCompany, "software");
    assert.equal(d2eResult.details.receipt.template.templateVersion, 4);
    assert.match(d2eResult.details.receipt.template.contentSha256, /^[a-f0-9]{64}$/);
    assert.match(d2eResult.details.receipt.task_intent_sha256, /^[a-f0-9]{64}$/);
    assert.equal(d2eResult.details.receipt.authorization.blocker, "active_task_deferral");

    const defaultProposalResult = await vaultExecuteTool.execute(
      "tool-call-id-4-default-proposal",
      {
        template_name: "layer12-040-direction-to-execution-ak-native",
        objective: "Find the next lawful DSPx execution boundary",
        repo: process.cwd(),
        packet_key: "decision-87-packet",
        task_id: 4381,
        decision_id: 87,
        actor: "actor-session-a",
      },
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined, sessionId: "actor-session-a" },
    );
    assert.equal(defaultProposalResult.details.ok, true);
    assert.equal(defaultProposalResult.details.receipt.caller_mode, "proposal");

    for (const [templateName, expectedOwner] of [["repo-direction-to-execution", "holding"]]) {
      const crossOwnerProposal = await vaultExecuteTool.execute(
        `tool-call-${templateName}`,
        {
          template_name: templateName,
          objective: "Find the next lawful DSPx execution boundary",
          repo: process.cwd(),
          packet_key: "decision-87-packet",
          task_id: 4381,
          decision_id: 87,
          actor: "actor-session-a",
        },
        undefined,
        undefined,
        { cwd: process.cwd(), model: undefined, sessionId: "actor-session-a" },
      );
      assert.equal(crossOwnerProposal.details.ok, true, JSON.stringify(crossOwnerProposal.details));
      assert.equal(crossOwnerProposal.details.receipt.template.ownerCompany, expectedOwner);
      assert.equal(crossOwnerProposal.details.receipt.caller_mode, "proposal");
    }

    const disabledExecutionMemory = await vaultExecuteTool.execute(
      "tool-call-execution-memory-disabled",
      executionMemoryParams,
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined, sessionId: "actor-session-a" },
    );
    assert.equal(disabledExecutionMemory.details.ok, false);
    assert.equal(disabledExecutionMemory.details.error, "D2E_EXECUTION_MEMORY_DISABLED");
    assert.equal(disabledExecutionMemory.details.effect.disposition, "not_materialized");
    assert.equal(
      disabledExecutionMemory.details.downstream_implementation_authorization.disposition,
      "not_authorized",
    );

    assert.equal(executionMemoryCalls, 0);
    process.env.PI_ORCH_D2E_EXECUTION_MEMORY_MODE = "enabled";
    const enabledExecutionMemory = await vaultExecuteTool.execute(
      "tool-call-execution-memory-enabled",
      executionMemoryParams,
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined, sessionId: "actor-session-a" },
    );
    assert.equal(
      enabledExecutionMemory.details.ok,
      true,
      JSON.stringify(enabledExecutionMemory.details),
    );
    assert.equal(enabledExecutionMemory.details.kind, "observation");
    assert.equal(
      enabledExecutionMemory.details.receipt.schema,
      "D2E_EXECUTION_MEMORY_OBSERVATION_V1",
    );
    assert.equal(enabledExecutionMemory.details.receipt.applied_ready, false);
    assert.equal(enabledExecutionMemory.details.receipt.execution_performed, false);
    assert.equal(
      enabledExecutionMemory.details.receipt.transfer_materialization_authorization.disposition,
      "not_authorized",
    );
    assert.equal(executionMemoryCalls, 1);

    const blockedPacketResult = await vaultExecuteTool.execute(
      "tool-call-id-4-blocked-packet",
      {
        template_name: "layer12-040-direction-to-execution-ak-native",
        objective: "Find the next lawful DSPx execution boundary",
        repo: process.cwd(),
        packet_key: "missing-required-packet",
        task_id: 4381,
        decision_id: 87,
        actor: "actor-session-a",
      },
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined, sessionId: "actor-session-a" },
    );
    assert.equal(blockedPacketResult.details.ok, false);
    assert.equal(blockedPacketResult.details.status, "not_ready");
    assert.equal(blockedPacketResult.details.error, "D2E_TRANSFER_PACKET_MISMATCH");
    assert.equal(blockedPacketResult.details.caller_mode, "proposal");
    assert.equal(blockedPacketResult.details.required_packet.disposition, "blocked");
    assert.equal(blockedPacketResult.details.execution_phase, "initial_readback");
    assert.equal(
      blockedPacketResult.details.transfer_materialization_authorization.disposition,
      "not_authorized",
    );
    assert.equal(
      blockedPacketResult.details.transfer_materialization_authorization.existed_at_dispatch,
      false,
    );
    assert.equal(blockedPacketResult.details.effect.disposition, "not_materialized");
    assert.equal(blockedPacketResult.details.failure.schema, "D2E_TRANSFER_FAILURE_V1");
    assert.equal(
      blockedPacketResult.details.downstream_implementation_authorization.disposition,
      "not_authorized",
    );

    const appliedD2eResult = await vaultExecuteTool.execute(
      "tool-call-id-5",
      {
        template_name: "layer12-040-direction-to-execution-ak-native",
        objective: "Find the next lawful DSPx execution boundary",
        transfer_mode: "applied",
        repo: process.cwd(),
        packet_key: "decision-87-packet",
        task_id: 4381,
        decision_id: 87,
        actor: "actor-session-a",
        task_scope_sha256: d2eResult.details.receipt.task_scope_sha256,
        task_intent_sha256: d2eResult.details.receipt.task_intent_sha256,
        template_version: d2eResult.details.receipt.template.templateVersion,
        template_content_sha256: d2eResult.details.receipt.template.contentSha256,
      },
      undefined,
      undefined,
      { cwd: process.cwd(), model: undefined, sessionId: "actor-session-a" },
    );
    assert.equal(appliedD2eResult.details.ok, false);
    assert.equal(appliedD2eResult.details.error, "D2E_TRANSFER_AUTHORIZATION_REQUIRED");
    assert.match(appliedD2eResult.content[0].text, /active_task_deferral/);
  } finally {
    if (previousVaultDir === undefined) {
      delete process.env.VAULT_DIR;
    } else {
      process.env.VAULT_DIR = previousVaultDir;
    }
    if (previousPiCompany === undefined) {
      delete process.env.PI_COMPANY;
    } else {
      process.env.PI_COMPANY = previousPiCompany;
    }
    if (previousD2eMode === undefined) {
      delete process.env.PI_ORCH_D2E_TRANSFER_MODE;
    } else {
      process.env.PI_ORCH_D2E_TRANSFER_MODE = previousD2eMode;
    }
    for (const [name, value] of [
      ["PI_ORCH_D2E_EXECUTION_MEMORY_MODE", previousExecutionMemoryMode],
      ["PI_ORCH_D2E_AK_BIN", previousExecutionMemoryBin],
      ["PI_ORCH_D2E_AK_SHA256", previousExecutionMemorySha],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(tempVaultDir, { recursive: true, force: true });
  }
});

test("workflow_execute fails closed on session-team disallowed agents before execution starts", async () => {
  const commands = new Map();
  const tools = new Map();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-workflow-team-"));

  try {
    extension({
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand(name, command) {
        commands.set(name, command);
      },
      on() {},
    });

    const command = commands.get("agents-team");
    const workflowTool = tools.get("workflow_execute");
    assert.ok(command, "expected agents-team command to register");
    assert.ok(workflowTool, "expected workflow_execute tool to register");

    await command.handler("", {
      hasUI: true,
      sessionKey: "workflow-team-session",
      cwd: tempDir,
      ui: {
        async select() {
          return "quality — reviewer, researcher";
        },
        notify() {},
      },
    });

    const result = await workflowTool.execute(
      "workflow-tool-call-id",
      {
        request: {
          mode: "chain",
          steps: [{ kind: "step", agent: "builder", objective: "Implement a fix" }],
        },
      },
      undefined,
      undefined,
      { cwd: tempDir, sessionKey: "workflow-team-session", model: undefined },
    );

    assert.equal(result.details.ok, false);
    assert.equal(result.details.errorCode, "workflow_validation_failed");
    assert.deepEqual(
      result.details.issues.map((issue) => issue.code),
      ["team_disallows_agent"],
    );
    assert.match(result.content[0].text, /Workflow execution failed:/);
    assert.match(result.content[0].text, /does not allow agent 'builder'/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loop_execute fails closed when PI_ORCH_KES_ROOT is invalid", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-tool-"));
  const badRootParent = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-loop-bad-root-"));
  const badRoot = path.join(badRootParent, "not-a-dir");
  fs.writeFileSync(badRoot, "not a directory", "utf8");
  const previousKesRoot = process.env.PI_ORCH_KES_ROOT;

  try {
    process.env.PI_ORCH_KES_ROOT = badRoot;

    const registeredTools = new Map();
    registerLoopTools(
      {
        registerTool(tool) {
          registeredTools.set(tool.name, tool);
        },
      },
      BUILT_IN_PLUGINS,
      "/tmp/nonexistent-vault",
    );

    const loopExecuteTool = registeredTools.get("loop_execute");
    assert.ok(loopExecuteTool, "expected loop_execute to register");
    const result = await loopExecuteTool.execute(
      "tool-call-id",
      { loop: "kaizen", objective: "Verify invalid KES root handling" },
      undefined,
      undefined,
      { cwd: tempDir, model: undefined },
    );

    assert.equal(result.details.ok, false);
    assert.equal(result.details.error, "loop-kes-root-invalid");
    assert.equal(result.details.failureKind, "kes_root_invalid");
    assert.equal(result.details.kesRootSource, "env");
    assert.match(
      result.content[0].text,
      /configured KES root is invalid or not writable\. Check PI_ORCH_KES_ROOT or package write permissions\./,
    );
    assert.equal(result.content[0].text.includes(badRoot), false);
  } finally {
    if (previousKesRoot === undefined) {
      delete process.env.PI_ORCH_KES_ROOT;
    } else {
      process.env.PI_ORCH_KES_ROOT = previousKesRoot;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(badRootParent, { recursive: true, force: true });
  }
});
