import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDirectionControllerReadback,
  readDirectionController,
  registerDirectionControllerReadbackTool,
} from "../src/runtime/direction-controller-readback.ts";

const repo = "/tmp/direction-controller-target";
const authorityBoundary = {
  dspy_dspx_role: "proposal_and_empirical_evaluation_only",
  deterministic_authority: "ak_verifier_and_source_owner_receipts",
  apply_boundary: "explicit_authorization_required_for_mutation",
};
const nonAuthorizations = [
  "no_lifecycle_close_from_generic_proceed",
  "no_lifecycle_activation_from_generic_proceed",
  "no_owner_surface_mutation",
  "no_owner_route_dispatch_without_authorization",
  "no_learning_activation",
  "no_publication",
  "no_dspy_dspx_normative_authority",
  "no_apply_capable_mutation_from_cockpit",
];

function status() {
  return {
    surface: "ak.direction_controller.status",
    schema_version: 1,
    read_only: true,
    authority_boundary: { ...authorityBoundary },
    live_position: {
      repo,
      strategic_frame: { key: "SF-TEST" },
      implementation_wave: null,
      execution_task: null,
    },
    state_vector: { strategy_state: "active_frame" },
    derived_state: "strategy_active",
  };
}

function proposal(intent = "proceed") {
  return {
    surface: "ak.direction_controller.propose",
    schema_version: 1,
    read_only: true,
    apply_performed: false,
    repo,
    intent,
    proposal_role: "advisory_input_only",
    generated_by: "deterministic_ak_direction_controller_dry_run",
    transition: "inspect_status_before_proceeding",
    authority_boundary: { ...authorityBoundary },
  };
}

function transitionCheck(overrides = {}) {
  return {
    surface: "ak.direction_controller.transition_check",
    schema_version: 1,
    read_only: true,
    repo,
    requested_transition: "inspect_status_before_proceeding",
    availability: "legal_read_only",
    program_availability: "program_spec_missing",
    generated_program_dispatch_ready: false,
    legal: true,
    missing_preconditions: [],
    allowed_mutations: [],
    next_safe_command: "ak direction check --repo . --machine",
    authority_boundary: { ...authorityBoundary },
    non_authorizations: [...nonAuthorizations],
    ...overrides,
  };
}

function jsonResult(value) {
  return { stdout: JSON.stringify(value), stderr: "", code: 0, killed: false };
}

function sequenceExec(values, calls) {
  let index = 0;
  return async (command, args, options) => {
    calls.push({ command, args, options });
    const value = values[index];
    index += 1;
    return jsonResult(value);
  };
}

test("direction-controller readback calls only exact read-only AK controls", async () => {
  const calls = [];
  const readback = await readDirectionController({
    repo,
    intent: "proceed",
    exec: sequenceExec([status(), proposal(), transitionCheck()], calls),
  });

  assert.deepEqual(
    calls.map(({ command, args }) => ({ command, args })),
    [
      {
        command: "ak",
        args: ["direction-controller", "status", "--repo", repo, "-F", "json"],
      },
      {
        command: "ak",
        args: [
          "direction-controller",
          "propose",
          "--repo",
          repo,
          "--intent",
          "proceed",
          "-F",
          "json",
        ],
      },
      {
        command: "ak",
        args: [
          "direction-controller",
          "transition-check",
          "--repo",
          repo,
          "--transition",
          "inspect_status_before_proceeding",
          "-F",
          "json",
        ],
      },
    ],
  );
  assert.ok(calls.every((call) => call.options.cwd === repo));
  assert.ok(calls.every((call) => call.options.timeout === 30_000));
  assert.equal(
    calls.some((call) => call.command === "dspx"),
    false,
  );
  assert.equal(readback.schema_version, "pi.direction_controller.readback.v1");
  assert.equal(readback.proposed_transition, "inspect_status_before_proceeding");
  assert.equal(readback.program_availability, "program_spec_missing");
  assert.equal(readback.generated_program_dispatch_ready, false);
  assert.equal(readback.generated_program_attempted, false);
  assert.equal(readback.dspx_execution_claimed, false);
  assert.equal(readback.dispatch_performed, false);
  assert.equal(readback.apply_performed, false);
  assert.equal(readback.authorization_granted, false);
});

test("blocked transitions remain successful authoritative readbacks", async () => {
  const calls = [];
  const readback = await readDirectionController({
    repo,
    intent: "open a decision",
    exec: sequenceExec(
      [
        status(),
        { ...proposal("open a decision"), transition: "open_decision" },
        transitionCheck({
          requested_transition: "open_decision",
          availability: "blocked",
          legal: false,
          missing_preconditions: ["explicit decision authorization"],
        }),
      ],
      calls,
    ),
  });

  assert.equal(readback.legal, false);
  assert.equal(readback.availability, "blocked");
  assert.deepEqual(readback.missing_preconditions, ["explicit decision authorization"]);
  assert.match(formatDirectionControllerReadback(readback), /authorization granted: false/);
  assert.match(formatDirectionControllerReadback(readback), /explicit decision authorization/);
});

test("dispatch-ready generated programs are reported but never invoked", async () => {
  const calls = [];
  const readback = await readDirectionController({
    repo,
    intent: "continue",
    exec: sequenceExec(
      [
        status(),
        proposal("continue"),
        transitionCheck({
          program_availability: "conformant_fixed_family_available",
          generated_program_dispatch_ready: true,
        }),
      ],
      calls,
    ),
  });

  assert.equal(readback.generated_program_dispatch_ready, true);
  assert.equal(readback.generated_program_attempted, false);
  assert.equal(calls.length, 3);
  assert.match(formatDirectionControllerReadback(readback), /dispatch-ready but not invoked/);
});

test("transition-check authority and command drift fail closed", async () => {
  const driftCases = [
    [{ legal: "true" }, /authority fields drifted/],
    [{ generated_program_dispatch_ready: "true" }, /authority fields drifted/],
    [{ non_authorizations: nonAuthorizations.slice(1) }, /non_authorizations contract drifted/],
    [{ next_safe_command: "rm -rf /" }, /next_safe_command is not allowlisted/],
    [{ allowed_mutations: "ak_task:complete" }, /allowed_mutations is malformed/],
    [{ legal: true, availability: "blocked" }, /legality is inconsistent/],
  ];

  for (const [overrides, expected] of driftCases) {
    await assert.rejects(
      readDirectionController({
        repo,
        intent: "proceed",
        exec: sequenceExec([status(), proposal(), transitionCheck(overrides)], []),
      }),
      expected,
    );
  }

  await assert.rejects(
    readDirectionController({
      repo,
      intent: "proceed",
      exec: sequenceExec([status(), proposal("different intent"), transitionCheck()], []),
    }),
    /proposal contract drifted/,
  );
});

test("contract drift and command failures fail closed", async () => {
  await assert.rejects(
    readDirectionController({
      repo,
      intent: "proceed",
      exec: sequenceExec(
        [status(), { ...proposal(), apply_performed: true }, transitionCheck()],
        [],
      ),
    }),
    /proposal contract drifted/,
  );

  await assert.rejects(
    readDirectionController({
      repo,
      intent: "proceed",
      exec: async () => ({ stdout: "", stderr: "missing", code: 127 }),
    }),
    /failed \(127\): missing/,
  );

  await assert.rejects(
    readDirectionController({
      repo,
      intent: "proceed",
      exec: async () => ({ stdout: "not json", stderr: "", code: 0 }),
    }),
    /did not emit JSON/,
  );
});

test("registered tool defaults repo to cwd and returns the closed readback envelope", async () => {
  const tools = new Map();
  const calls = [];
  registerDirectionControllerReadbackTool({
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    exec: sequenceExec([status(), proposal(), transitionCheck()], calls),
  });

  const tool = tools.get("direction_controller_readback");
  assert.ok(tool);
  const result = await tool.execute("call-id", { intent: "proceed" }, undefined, undefined, {
    cwd: repo,
  });

  assert.equal(result.details.ok, true);
  assert.equal(result.details.readback.repo, repo);
  assert.match(result.content[0].text, /Direction-to-execution controller readback/);
  assert.match(result.content[0].text, /DSPx execution attempted: false/);
});
