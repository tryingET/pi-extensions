import assert from "node:assert/strict";
import test from "node:test";
import { createDispatchPolicy, DEFAULT_DISPATCH_POLICY } from "../src/dispatchPosture.js";
import { createVaultDispatchRuntime } from "../src/dispatchRuntime.js";

function template(overrides = {}) {
  return {
    id: 1,
    version: 1,
    name: "text-template",
    description: "text",
    content: "exact bytes\n",
    artifact_kind: "procedure",
    control_mode: "one_shot",
    formalization_level: "structured",
    owner_company: "software",
    visibility_companies: ["software"],
    controlled_vocabulary: null,
    status: "active",
    export_to_pi: true,
    ...overrides,
  };
}

function realDoltRow(subject) {
  const row = { ...subject, export_to_pi: subject.export_to_pi ? 1 : 0 };
  if (row.controlled_vocabulary == null) delete row.controlled_vocabulary;
  return row;
}

function fakeRuntime(rows = []) {
  const queries = [];
  return {
    queries,
    resolveCurrentCompanyContext() {
      return { company: "software", source: "explicit:test" };
    },
    escapeSql(value) {
      return String(value).replaceAll("'", "''");
    },
    buildVisibilityPredicate() {
      return "TRUE";
    },
    queryVaultJsonDetailed(sql) {
      queries.push(sql);
      return { ok: true, value: { rows }, error: null };
    },
    parseTemplateRows() {
      return [];
    },
  };
}

function request(templates, overrides = {}) {
  return {
    templates,
    primaryTemplateName: templates[0]?.name || "missing",
    finalPreparedText: templates.map((item) => item.content).join("\n---\n"),
    surface: "prompt_plane_selection",
    currentCompany: "software",
    ...overrides,
  };
}

test("issues and atomically claims one text authorization against schema-v9 columns", () => {
  const subject = template();
  const deps = fakeRuntime([realDoltRow(subject)]);
  const runtime = createVaultDispatchRuntime({ runtime: deps });
  const authorization = runtime.authorizePreparedExecution(request([subject]));
  assert.equal(authorization.disposition, "text_ready");
  const first = runtime.claimPreparedExecution(authorization.authorizationId);
  const second = runtime.claimPreparedExecution(authorization.authorizationId);
  assert.equal(first.ok, true);
  assert.equal(first.value.sealedText, "exact bytes\n");
  assert.equal(second.ok, false);
  assert.equal(deps.queries.length, 1);
  assert.doesNotMatch(deps.queries[0], /\brender_engine\b/);
  assert.equal(runtime.settlePreparedExecution(authorization.authorizationId, "handed_off"), true);
  assert.equal(runtime.claimPreparedExecution(authorization.authorizationId).ok, false);
});

test("claim has one winner under reentrant database callbacks", () => {
  const subject = template();
  const deps = fakeRuntime([subject]);
  let runtime;
  let authorizationId = "";
  let nested;
  const baseQuery = deps.queryVaultJsonDetailed;
  deps.queryVaultJsonDetailed = (...args) => {
    if (!nested) nested = runtime.claimPreparedExecution(authorizationId);
    return baseQuery(...args);
  };
  runtime = createVaultDispatchRuntime({ runtime: deps });
  const authorization = runtime.authorizePreparedExecution(request([subject]));
  authorizationId = authorization.authorizationId;
  const outer = runtime.claimPreparedExecution(authorizationId);
  assert.equal(outer.ok, true);
  assert.equal(nested.ok, false);
  assert.equal(nested.reason, "invalid_authorization_state");
  assert.equal(runtime.claimPreparedExecution(authorizationId).ok, false);
});

test("denies forged authorization IDs", () => {
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime() });
  const result = runtime.claimPreparedExecution("00000000-0000-4000-8000-000000000000");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_authorization_state");
});

test("rejects forged policy snapshots and unsupported execution surfaces", () => {
  const freeze = (value) => {
    if (value && typeof value === "object") {
      for (const nested of Object.values(value)) freeze(nested);
      Object.freeze(value);
    }
    return value;
  };
  const clonedPolicy = freeze(structuredClone(DEFAULT_DISPATCH_POLICY));
  assert.throws(
    () => createVaultDispatchRuntime({ runtime: fakeRuntime(), policy: clonedPolicy }),
    /package-created policy/,
  );
  assert.throws(
    () =>
      createVaultDispatchRuntime({
        runtime: fakeRuntime(),
        policy: {
          ontologyContractVersion: "forged",
          registryId: "forged",
          bindings: {},
        },
      }),
    /package-created policy/,
  );
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime() });
  const result = runtime.authorizePreparedExecution(
    request([template()], { surface: "future_unsupported_surface" }),
  );
  assert.equal(result.disposition, "blocked");
  assert.equal(result.reason, "unsupported_surface");
});

test("issues dispatch_required only for a verified binding", () => {
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime() });
  const loop = template({
    id: 2,
    name: "ooda",
    control_mode: "loop",
    formalization_level: "workflow",
  });
  const result = runtime.authorizePreparedExecution(request([loop]));
  assert.equal(result.disposition, "dispatch_required");
  assert.deepEqual(result.binding.execution_args, { loop: "ooda" });
});

test("issues dispatch_required for the verified deep-review workflow binding", () => {
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime() });
  const workflow = template({
    id: 3,
    name: "deep-review",
    control_mode: "one_shot",
    formalization_level: "workflow",
  });
  const result = runtime.authorizePreparedExecution(request([workflow]));
  assert.equal(result.disposition, "dispatch_required");
  assert.equal(result.binding.execution_surface, "workflow_execute");
  assert.equal(result.binding.execution_args.workflow_id, "deep-review.v1");
  assert.equal(result.binding.execution_args.request.steps[0].objective, "$OBJECTIVE");
  assert.equal("prepared_text" in result, false);
});

test("issues dispatch_required for each immutable per-owner D2E workflow binding", () => {
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime() });
  const expected = [
    ["layer12-040-direction-to-execution-ak-native", "software"],
    ["repo-direction-to-execution", "holding"],
    ["execution-memory-transfer", "core"],
  ];
  for (const [name, owner] of expected) {
    const workflow = template({
      id: 87,
      name,
      control_mode: "one_shot",
      formalization_level: "workflow",
      owner_company: owner,
      visibility_companies: [owner, "software"],
    });
    const result = runtime.authorizePreparedExecution(request([workflow]));
    assert.equal(result.disposition, "dispatch_required");
    assert.equal(result.binding.execution_surface, "workflow_execute");
    assert.deepEqual(result.binding.execution_args, {
      workflow_gate: "D2E_TRANSFER_COMPLETE_V1",
      template_artifact_kind: "procedure",
      template_control_mode: "one_shot",
      template_formalization_level: "workflow",
      template_owner_company: owner,
    });
  }
});

test("public authorization rejects D2E kind, workflow metadata, and owner mismatch", () => {
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime() });
  for (const mismatch of [
    { artifact_kind: "cognitive" },
    { control_mode: "loop" },
    { formalization_level: "structured" },
    { owner_company: "software" },
  ]) {
    const workflow = template({
      id: 87,
      name: "repo-direction-to-execution",
      control_mode: "one_shot",
      formalization_level: "workflow",
      owner_company: "holding",
      visibility_companies: ["holding", "software"],
      ...mismatch,
    });
    const result = runtime.authorizePreparedExecution(request([workflow]));
    assert.equal(result.disposition, "blocked");
    assert.equal(result.reason, "identity_drift");
  }
});
test("blocks unbound workflow and unknown governed values", () => {
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime() });
  const workflow = runtime.authorizePreparedExecution(
    request([template({ name: "workflow", formalization_level: "workflow" })]),
  );
  assert.equal(workflow.disposition, "blocked");
  assert.equal(workflow.reason, "missing_binding");

  const unknown = runtime.authorizePreparedExecution(
    request([template({ name: "future", control_mode: "future_mode" })]),
  );
  assert.equal(unknown.disposition, "blocked");
  assert.equal(unknown.reason, "unknown_governed_value");
});

test("blocks mixed composites and incompatible bindings", () => {
  const mixedRuntime = createVaultDispatchRuntime({ runtime: fakeRuntime() });
  const mixed = mixedRuntime.authorizePreparedExecution(
    request(
      [
        template(),
        template({ id: 2, name: "ooda", control_mode: "loop", formalization_level: "workflow" }),
      ],
      { compositionKind: "grounding" },
    ),
  );
  assert.equal(mixed.disposition, "blocked");
  assert.equal(mixed.reason, "mixed_disposition");

  const policy = createDispatchPolicy({
    ontologyContractVersion: "test",
    bindings: {
      a: {
        execution_required: true,
        execution_surface: "loop_execute",
        execution_args: { loop: "a" },
        on_missing_binding: "fail_closed",
        compositeCapable: true,
      },
      b: {
        execution_required: true,
        execution_surface: "loop_execute",
        execution_args: { loop: "b" },
        on_missing_binding: "fail_closed",
        compositeCapable: true,
      },
    },
  });
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime(), policy });
  const incompatible = runtime.authorizePreparedExecution(
    request(
      [
        template({ name: "a", control_mode: "loop" }),
        template({ id: 2, name: "b", control_mode: "loop" }),
      ],
      { compositionKind: "batch" },
    ),
  );
  assert.equal(incompatible.disposition, "blocked");
  assert.equal(incompatible.reason, "incompatible_bindings");
});

test("blocks invalid identity, inactive, and export-ineligible templates", () => {
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime() });
  assert.equal(
    runtime.authorizePreparedExecution(request([template({ id: 0 })])).reason,
    "invalid_identity",
  );
  assert.equal(
    runtime.authorizePreparedExecution(request([template({ status: "draft" })])).reason,
    "inactive_template",
  );
  assert.equal(
    runtime.authorizePreparedExecution(request([template({ export_to_pi: false })])).reason,
    "export_ineligible",
  );
});

test("rejects unknown or incomplete router controlled vocabulary", () => {
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime() });
  const router = template({
    name: "router",
    control_mode: "router",
    controlled_vocabulary: {
      routing_context: "analysis_followup",
      activity_phase: "post_analysis",
      input_artifact: "analysis_output",
      transition_target_type: "framework_mode",
      selection_principles: ["evidence_based"],
      output_commitment: "future_unsafe_value",
    },
  });
  const result = runtime.authorizePreparedExecution(request([router]));
  assert.equal(result.disposition, "blocked");
  assert.equal(result.reason, "unknown_governed_value");
});

test("claim revalidates exact DB identity and permanently blocks drift", () => {
  const subject = template();
  const rows = [subject];
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime(rows) });
  const authorization = runtime.authorizePreparedExecution(request([subject]));
  rows[0] = { ...subject, content: "changed after authorization" };
  const claimed = runtime.claimPreparedExecution(authorization.authorizationId);
  assert.equal(claimed.ok, false);
  assert.equal(claimed.reason, "identity_drift");
  rows[0] = subject;
  assert.equal(runtime.claimPreparedExecution(authorization.authorizationId).ok, false);
});

test("claim detects render frontmatter drift through canonical content identity", () => {
  const subject = template({ content: "---\nrender_engine: none\n---\nBody" });
  const rows = [subject];
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime(rows) });
  const authorization = runtime.authorizePreparedExecution(
    request([subject], { renderer: "none", finalPreparedText: "Body" }),
  );
  rows[0] = {
    ...subject,
    content: "---\nrender_engine: nunjucks\n---\nBody",
  };
  const claimed = runtime.claimPreparedExecution(authorization.authorizationId);
  assert.equal(claimed.ok, false);
  assert.equal(claimed.reason, "identity_drift");
});

test("non-schema render fields cannot alter governed DB identity", () => {
  const runtime = createVaultDispatchRuntime({ runtime: fakeRuntime() });
  const plain = runtime.authorizePreparedExecution(
    request([template()], { renderer: "package-owned" }),
  );
  const extraField = runtime.authorizePreparedExecution(
    request([template({ render_engine: "non-schema-value" })], { renderer: "package-owned" }),
  );
  assert.equal(plain.disposition, "text_ready");
  assert.equal(extraField.disposition, "text_ready");
  assert.equal(
    plain.aggregate.primary.governedMetadataSha256,
    extraField.aggregate.primary.governedMetadataSha256,
  );
  assert.equal(plain.aggregate.preparation.renderer, "package-owned");
  assert.equal(extraField.aggregate.preparation.renderer, "package-owned");
});

test("policy construction rejects non-canonical mutable values", () => {
  const binding = {
    execution_required: true,
    execution_surface: "loop_execute",
    execution_args: {},
    on_missing_binding: "fail_closed",
  };
  Object.defineProperty(binding.execution_args, "secret", {
    get() {
      return "x";
    },
    enumerable: true,
  });
  assert.throws(
    () => createDispatchPolicy({ ontologyContractVersion: "test", bindings: { bad: binding } }),
    /accessors/,
  );
  assert.throws(
    () =>
      createDispatchPolicy({
        ontologyContractVersion: "test",
        bindings: { bad: { ...binding, execution_args: { n: Number.NaN } } },
      }),
    /finite/,
  );
});
