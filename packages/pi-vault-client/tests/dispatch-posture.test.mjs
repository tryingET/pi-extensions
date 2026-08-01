/**
 * Tests for dispatch posture classification and projection freshness checks.
 *
 * Run with: node --test tests/dispatch-posture.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkProjectionFreshness,
  classifyDispatchPosture,
  createDispatchPolicy,
  D2E_EXECUTION_MEMORY_TEMPLATE_NAME,
  D2E_EXECUTION_MEMORY_TEMPLATE_OWNER,
  D2E_WORKFLOW_TEMPLATE_NAMES,
  D2E_WORKFLOW_TEMPLATE_OWNERS,
  formatDispatchPosture,
  formatProjectionFreshness,
  getKnownLoopBindings,
  isOrchestratorGateRequired,
  isTextOk,
  registerLoopBinding,
} from "../src/dispatchPosture.js";
import { createVaultDispatchRuntime } from "../src/dispatchRuntime.js";

// ---------------------------------------------------------------------------
// classifyDispatchPosture
// ---------------------------------------------------------------------------

describe("classifyDispatchPosture", () => {
  it("classifies control_mode=loop with known binding as orchestrator_loop_required", () => {
    const result = classifyDispatchPosture({
      name: "transcendent-iteration",
      control_mode: "loop",
      formalization_level: "workflow",
    });
    assert.equal(result.posture, "orchestrator_loop_required");
    assert.equal(result.template_name, "transcendent-iteration");
    assert.ok(result.binding);
    assert.equal(result.binding.execution_required, true);
    assert.equal(result.binding.execution_surface, "loop_execute");
    assert.deepEqual(result.binding.execution_args, { loop: "transcendent" });
    assert.equal(result.binding.on_missing_binding, "fail_closed");
    assert.ok(result.reason.includes("loop_execute"));
    assert.ok(result.reason.includes("transcendent"));
  });

  it("classifies ooda as orchestrator_loop_required", () => {
    const result = classifyDispatchPosture({
      name: "ooda",
      control_mode: "loop",
      formalization_level: "workflow",
    });
    assert.equal(result.posture, "orchestrator_loop_required");
    assert.equal(result.binding.execution_surface, "loop_execute");
    assert.deepEqual(result.binding.execution_args, { loop: "ooda" });
  });

  it("classifies control_mode=loop without known binding as missing_execution_binding_fail_closed", () => {
    const result = classifyDispatchPosture({
      name: "unknown-loop-template",
      control_mode: "loop",
      formalization_level: "structured",
    });
    assert.equal(result.posture, "missing_execution_binding_fail_closed");
    assert.equal(result.binding, null);
    assert.ok(result.reason.includes("no verified loop_execute binding"));
    assert.ok(result.reason.includes("fail closed"));
  });

  it("classifies formalization_level=workflow (non-loop) as orchestrator_workflow_gate_required", () => {
    const result = classifyDispatchPosture({
      name: "some-workflow-procedure",
      control_mode: "one_shot",
      formalization_level: "workflow",
    });
    assert.equal(result.posture, "orchestrator_workflow_gate_required");
    assert.equal(result.binding, null);
    assert.ok(result.reason.includes("workflow"));
    assert.ok(result.reason.includes("dispatch gating"));
  });

  it("classifies formalization_level=workflow router as orchestrator_workflow_gate_required", () => {
    const result = classifyDispatchPosture({
      name: "analysis-router",
      control_mode: "router",
      formalization_level: "workflow",
    });
    assert.equal(result.posture, "orchestrator_workflow_gate_required");
  });

  it("classifies deep-review with its verified workflow_execute binding", () => {
    const result = classifyDispatchPosture({
      name: "deep-review",
      control_mode: "one_shot",
      formalization_level: "workflow",
    });
    assert.equal(result.posture, "orchestrator_workflow_gate_required");
    assert.equal(result.binding.execution_surface, "workflow_execute");
    assert.equal(result.binding.execution_args.workflow_id, "deep-review.v1");
    assert.deepEqual(result.binding.execution_args.request, {
      mode: "chain",
      steps: [{ kind: "step", agent: "reviewer", objective: "$OBJECTIVE" }],
    });
    assert.match(result.reason, /verified workflow_execute binding/);
    assert.match(result.reason, /raw text execution is not lawful/);
  });

  it("classifies plain one_shot/structured as text_ok", () => {
    const result = classifyDispatchPosture({
      name: "inversion",
      control_mode: "one_shot",
      formalization_level: "structured",
    });
    assert.equal(result.posture, "text_ok");
    assert.equal(result.binding, null);
    assert.ok(result.reason.includes("Text-only"));
    assert.ok(result.reason.includes("lawful"));
  });

  it("classifies plain router/structured as text_ok", () => {
    const result = classifyDispatchPosture({
      name: "analysis-router",
      control_mode: "router",
      formalization_level: "structured",
    });
    assert.equal(result.posture, "text_ok");
  });

  it("classifies one_shot/napkin as text_ok", () => {
    const result = classifyDispatchPosture({
      name: "quick-note",
      control_mode: "one_shot",
      formalization_level: "napkin",
    });
    assert.equal(result.posture, "text_ok");
  });

  it("loop takes precedence over workflow formalization", () => {
    // A loop template should ALWAYS get loop posture, even with workflow formalization
    const result = classifyDispatchPosture({
      name: "transcendent-iteration",
      control_mode: "loop",
      formalization_level: "workflow",
    });
    assert.equal(result.posture, "orchestrator_loop_required");
    assert.ok(result.binding);
  });
});

// ---------------------------------------------------------------------------
// Helper predicates
// ---------------------------------------------------------------------------

describe("isTextOk", () => {
  it("returns true for text_ok", () => {
    assert.equal(isTextOk("text_ok"), true);
  });
  it("returns false for all gated postures", () => {
    assert.equal(isTextOk("orchestrator_loop_required"), false);
    assert.equal(isTextOk("orchestrator_workflow_gate_required"), false);
    assert.equal(isTextOk("missing_execution_binding_fail_closed"), false);
  });
});

describe("isOrchestratorGateRequired", () => {
  it("returns true for all gated postures", () => {
    assert.equal(isOrchestratorGateRequired("orchestrator_loop_required"), true);
    assert.equal(isOrchestratorGateRequired("orchestrator_workflow_gate_required"), true);
    assert.equal(isOrchestratorGateRequired("missing_execution_binding_fail_closed"), true);
  });
  it("returns false for text_ok", () => {
    assert.equal(isOrchestratorGateRequired("text_ok"), false);
  });
});

// ---------------------------------------------------------------------------
// formatDispatchPosture
// ---------------------------------------------------------------------------

describe("formatDispatchPosture", () => {
  it("includes posture and reason in output", () => {
    const result = classifyDispatchPosture({
      name: "transcendent-iteration",
      control_mode: "loop",
      formalization_level: "workflow",
    });
    const formatted = formatDispatchPosture(result);
    assert.ok(formatted.includes("orchestrator_loop_required"));
    assert.ok(formatted.includes("transcendent-iteration"));
    assert.ok(formatted.includes("loop_execute"));
  });

  it("includes execution args for bound templates", () => {
    const result = classifyDispatchPosture({
      name: "ooda",
      control_mode: "loop",
      formalization_level: "workflow",
    });
    const formatted = formatDispatchPosture(result);
    assert.ok(formatted.includes('"loop":"ooda"'));
  });
});

// ---------------------------------------------------------------------------
// Registry management
// ---------------------------------------------------------------------------

describe("loop binding registry", () => {
  it("separates the negative-only execution-memory consumer from legacy D2E applied bindings", () => {
    assert.deepEqual(
      [...D2E_WORKFLOW_TEMPLATE_NAMES],
      ["layer12-040-direction-to-execution-ak-native", "repo-direction-to-execution"],
    );
    const bindings = getKnownLoopBindings();
    assert.equal(bindings["direction-to-execution"], undefined);
    assert.equal(
      classifyDispatchPosture({
        name: "direction-to-execution",
        control_mode: "one_shot",
        formalization_level: "workflow",
      }).posture,
      "orchestrator_workflow_gate_required",
    );
    for (const name of D2E_WORKFLOW_TEMPLATE_NAMES) {
      const binding = bindings[name];
      assert.ok(binding, `${name} must have a verified workflow binding`);
      assert.equal(binding.execution_surface, "workflow_execute");
      assert.deepEqual(binding.execution_args, {
        workflow_gate: "D2E_TRANSFER_COMPLETE_V1",
        template_artifact_kind: "procedure",
        template_control_mode: "one_shot",
        template_formalization_level: "workflow",
        template_owner_company: D2E_WORKFLOW_TEMPLATE_OWNERS[name],
      });
      assert.ok(Object.isFrozen(binding));
      assert.ok(Object.isFrozen(binding.execution_args));
      const posture = classifyDispatchPosture({
        name,
        control_mode: "one_shot",
        formalization_level: "workflow",
      });
      assert.equal(posture.posture, "orchestrator_workflow_gate_required");
      assert.equal(posture.binding, binding);
    }
    const executionMemory = bindings[D2E_EXECUTION_MEMORY_TEMPLATE_NAME];
    assert.equal(D2E_EXECUTION_MEMORY_TEMPLATE_OWNER, "core");
    assert.deepEqual(executionMemory.execution_args, {
      workflow_gate: "D2E_EXECUTION_MEMORY_V1",
      template_artifact_kind: "procedure",
      template_control_mode: "one_shot",
      template_formalization_level: "workflow",
      template_owner_company: "core",
    });
    assert.equal(
      classifyDispatchPosture({
        name: D2E_EXECUTION_MEMORY_TEMPLATE_NAME,
        control_mode: "one_shot",
        formalization_level: "workflow",
      }).binding,
      executionMemory,
    );
  });

  it("returns deeply frozen bindings", () => {
    const bindings = getKnownLoopBindings();
    assert.ok(Object.isFrozen(bindings));
    assert.ok(Object.isFrozen(bindings["transcendent-iteration"]));
    assert.ok(Object.isFrozen(bindings["transcendent-iteration"].execution_args));
    assert.throws(() => {
      bindings["transcendent-iteration"].execution_args.loop = "mutated";
    }, TypeError);
    assert.equal(
      getKnownLoopBindings()["transcendent-iteration"].execution_args.loop,
      "transcendent",
    );
  });

  it("rejects runtime registration and supports immutable constructed policies", () => {
    assert.throws(() => registerLoopBinding("test-loop-binding", {}), /immutable/);
    const input = {
      custom: {
        execution_required: true,
        execution_surface: "loop_execute",
        execution_args: { loop: "custom" },
        on_missing_binding: "fail_closed",
      },
    };
    const policy = createDispatchPolicy({ ontologyContractVersion: "test-v1", bindings: input });
    input.custom.execution_args.loop = "mutated";
    const result = classifyDispatchPosture(
      { name: "custom", control_mode: "loop", formalization_level: "structured" },
      policy,
    );
    assert.equal(result.binding.execution_args.loop, "custom");
    assert.ok(Object.isFrozen(result.binding));
  });
});

// ---------------------------------------------------------------------------
// checkProjectionFreshness
// ---------------------------------------------------------------------------

describe("checkProjectionFreshness", () => {
  it("returns not_exported for non-exported templates", () => {
    const result = checkProjectionFreshness({
      name: "internal-template",
      content: "some content",
      export_to_pi: false,
      version: 1,
      status: "active",
    });
    assert.equal(result.status, "not_exported");
    assert.equal(result.db_content_sha256, null);
  });

  it("returns not_exported for inactive templates", () => {
    const result = checkProjectionFreshness({
      name: "draft-template",
      content: "some content",
      export_to_pi: true,
      version: 1,
      status: "draft",
    });
    assert.equal(result.status, "not_exported");
  });

  it("returns not_exported when export_to_pi is undefined", () => {
    const result = checkProjectionFreshness({
      name: "unknown-export",
      content: "some content",
      version: 1,
      status: "active",
    });
    assert.equal(result.status, "not_exported");
  });
});

// ---------------------------------------------------------------------------
// formatProjectionFreshness
// ---------------------------------------------------------------------------

describe("formatProjectionFreshness", () => {
  it("formats not_exported status", () => {
    const result = checkProjectionFreshness({
      name: "test",
      content: "x",
      export_to_pi: false,
      version: 1,
      status: "active",
    });
    const formatted = formatProjectionFreshness(result);
    assert.ok(formatted.includes("NOT EXPORTED"));
    assert.ok(formatted.includes("test"));
  });
});

// ---------------------------------------------------------------------------
// Integration-level invariant: all known loop templates must have bindings
// ---------------------------------------------------------------------------

describe("known loop template bindings completeness", () => {
  it("known loop and workflow templates have bindings", () => {
    const bindings = getKnownLoopBindings();
    assert.ok(bindings["transcendent-iteration"], "transcendent-iteration must have a binding");
    assert.ok(bindings.ooda, "ooda must have a binding");
    assert.ok(bindings["deep-review"], "deep-review must have a binding");

    for (const [name, binding] of Object.entries(bindings)) {
      assert.equal(binding.execution_required, true, `${name} must have execution_required=true`);
      assert.equal(
        binding.on_missing_binding,
        "fail_closed",
        `${name} must have on_missing_binding=fail_closed`,
      );
      assert.ok(
        binding.execution_surface === "loop_execute" ||
          binding.execution_surface === "workflow_execute",
        `${name} must use a valid execution surface`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// createVaultDispatchRuntime
// ---------------------------------------------------------------------------

describe("createVaultDispatchRuntime", () => {
  function createFakeRuntime(rows) {
    return {
      resolveCurrentCompanyContext() {
        return { company: "software", source: "explicit:test" };
      },
      escapeSql(value) {
        return String(value).replaceAll("'", "''");
      },
      buildVisibilityPredicate(company) {
        assert.equal(company, "software");
        return "visibility_companies contains software";
      },
      queryVaultJsonDetailed(sql) {
        assert.match(sql, /status = 'active'/);
        assert.match(sql, /export_to_pi = true/);
        return { ok: true, value: { rows }, error: null };
      },
      parseTemplateRows(result) {
        return result.rows.map((row) => ({
          name: row.name,
          description: row.description || "",
          content: row.content || "",
          artifact_kind: row.artifact_kind,
          control_mode: row.control_mode,
          formalization_level: row.formalization_level,
          owner_company: row.owner_company,
          visibility_companies: row.visibility_companies,
          controlled_vocabulary: null,
          status: row.status,
          export_to_pi: row.export_to_pi,
          version: row.version,
          id: row.id,
        }));
      },
    };
  }

  it("checks only active visible export-eligible templates", async () => {
    const runtime = createVaultDispatchRuntime({
      runtime: createFakeRuntime([
        {
          id: 1,
          name: "ooda",
          description: "OODA",
          content: "OODA content",
          render_engine: "none",
          artifact_kind: "procedure",
          control_mode: "loop",
          formalization_level: "workflow",
          owner_company: "core",
          visibility_companies: ["core", "software"],
          controlled_vocabulary: null,
          status: "active",
          export_to_pi: true,
          version: 1,
        },
      ]),
    });

    const result = await runtime.checkTemplates(["ooda"], { currentCompany: "software" });
    assert.equal(result.ok, true);
    assert.equal(result.status, "ready");
    assert.deepEqual(result.missing, []);
    assert.equal(result.results[0].posture, "orchestrator_loop_required");
    assert.deepEqual(result.results[0].binding.execution_args, { loop: "ooda" });
    assert.equal(result.templates.length, 1);
    assert.equal(result.templates[0].id, 1);
    assert.equal(result.templates[0].version, 1);
    assert.equal(result.templates[0].content, "OODA content");
    assert.equal(result.templates[0].artifact_kind, "procedure");
    assert.equal(result.templates[0].owner_company, "core");
  });

  it("fails closed without explicit company context", async () => {
    const runtime = createVaultDispatchRuntime({
      runtime: {
        ...createFakeRuntime([]),
        resolveCurrentCompanyContext() {
          return { company: "core", source: "contract-default" };
        },
      },
    });

    const result = await runtime.checkTemplates(["ooda"], {});
    assert.equal(result.ok, false);
    assert.equal(result.status, "blocked");
    assert.match(result.blocking_reason, /Explicit company context is required/);
  });
});
