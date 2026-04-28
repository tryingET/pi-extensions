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
  formatDispatchPosture,
  formatProjectionFreshness,
  getKnownLoopBindings,
  isOrchestratorGateRequired,
  isTextOk,
  registerLoopBinding,
} from "../src/dispatchPosture.ts";

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
    assert.ok(result.reason.includes("no known execution binding"));
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
  it("returns known bindings as a copy", () => {
    const bindings = getKnownLoopBindings();
    assert.ok(bindings["transcendent-iteration"]);
    assert.ok(bindings["ooda"]);

    // Mutating the returned object should not affect the registry
    const before = Object.keys(bindings).length;
    bindings["test-entry"] = {
      execution_required: true,
      execution_surface: "loop_execute",
      execution_args: { loop: "test" },
      on_missing_binding: "fail_closed",
    };
    const after = getKnownLoopBindings();
    assert.equal(Object.keys(after).length, before);
  });

  it("allows registering new bindings at runtime", () => {
    registerLoopBinding("test-loop-binding", {
      execution_required: true,
      execution_surface: "loop_execute",
      execution_args: { loop: "test-loop" },
      on_missing_binding: "fail_closed",
    });
    const result = classifyDispatchPosture({
      name: "test-loop-binding",
      control_mode: "loop",
      formalization_level: "workflow",
    });
    assert.equal(result.posture, "orchestrator_loop_required");
    assert.equal(result.binding.execution_args.loop, "test-loop");

    // Clean up
    const bindings2 = getKnownLoopBindings();
    delete bindings2["test-loop-binding"];
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
  it("transcendent-iteration and ooda both have bindings", () => {
    const bindings = getKnownLoopBindings();
    assert.ok(bindings["transcendent-iteration"], "transcendent-iteration must have a binding");
    assert.ok(bindings["ooda"], "ooda must have a binding");

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
