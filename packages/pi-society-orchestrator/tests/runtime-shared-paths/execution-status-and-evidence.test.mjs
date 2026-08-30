import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { finalizeExecutionEffects, recordEvidence } from "../../src/runtime/evidence.ts";
import { getExecutionStatus, isExecutionSuccess } from "../../src/runtime/execution-status.ts";

function repoResolveMachineResult(input, canonicalPath = null) {
  const registered = canonicalPath !== null;
  return {
    ok: true,
    stdout: JSON.stringify({
      surface: "repo.resolve",
      schema_version: 1,
      emitted_at: "2026-08-30T00:00:00Z",
      payload_kind: "repo_resolution",
      schema_locator: "ak machine schema repo-resolve",
      ok: true,
      payload: {
        input,
        canonical_path: canonicalPath,
        registered,
        repo: registered
          ? {
              path: canonicalPath,
              company: "softwareco",
              archetype: "project",
              layer: "L2",
              generated_from: null,
              copier_answers: null,
              ontology_ref: null,
              last_sync: "2026-08-30T00:00:00Z",
              created_at: "2026-03-06T00:00:00Z",
            }
          : null,
      },
      error: null,
    }),
    stderr: "",
  };
}

test("execution status classifier honors explicit transport/protocol precedence", () => {
  assert.equal(getExecutionStatus({ exitCode: 0 }), "done");
  assert.equal(getExecutionStatus({ exitCode: 0, timedOut: true }), "timed_out");
  assert.equal(getExecutionStatus({ exitCode: 0, aborted: true }), "aborted");
  assert.equal(getExecutionStatus({ exitCode: 1 }), "error");
  assert.equal(getExecutionStatus({ exitCode: 0, assistantStopReason: "stop" }), "done");
  assert.equal(getExecutionStatus({ exitCode: 0, assistantStopReason: "error" }), "error");
  assert.equal(getExecutionStatus({ exitCode: 0, assistantStopReason: "aborted" }), "aborted");
  assert.equal(getExecutionStatus({ exitCode: 0, assistantStopReason: "toolUse" }), "error");
  assert.equal(
    getExecutionStatus({
      exitCode: 0,
      executionState: {
        transport: { kind: "transport", exitCode: 17, aborted: false, timedOut: false },
        protocol: { kind: "assistant_protocol", stopReason: "stop" },
      },
    }),
    "done",
  );
  assert.equal(
    getExecutionStatus({
      exitCode: 0,
      executionState: {
        transport: { kind: "transport", exitCode: 0, aborted: false, timedOut: false },
        protocol: {
          kind: "assistant_protocol_parse_error",
          errorMessage: "bad frame",
        },
      },
    }),
    "error",
  );
  assert.equal(
    getExecutionStatus({
      exitCode: 124,
      timedOut: true,
      executionState: {
        transport: { kind: "transport", exitCode: 124, aborted: false, timedOut: true },
        protocol: { kind: "assistant_protocol", stopReason: "aborted" },
      },
    }),
    "aborted",
  );
  assert.equal(
    getExecutionStatus({
      exitCode: 99,
      aborted: true,
      assistantStopReason: "stop",
      executionState: {
        transport: { kind: "transport", exitCode: 0, aborted: false, timedOut: false },
        protocol: {
          kind: "assistant_protocol",
          stopReason: "aborted",
        },
      },
    }),
    "aborted",
  );
  assert.equal(isExecutionSuccess({ exitCode: 0 }), true);
  assert.equal(isExecutionSuccess({ exitCode: 0, timedOut: true }), false);
  assert.equal(isExecutionSuccess({ exitCode: 0, aborted: true }), false);
  assert.equal(isExecutionSuccess({ exitCode: 0, assistantStopReason: "error" }), false);
});

test("finalizeExecutionEffects skips evidence writes for aborted executions", async () => {
  let evidenceCalls = 0;

  const outcome = await finalizeExecutionEffects({
    result: { exitCode: 130, aborted: true },
    createEvidenceEntry: () => ({
      check_type: "validation:aborted",
      result: "fail",
    }),
    async recordEvidence() {
      evidenceCalls += 1;
      return { ok: true, via: "ak" };
    },
  });

  assert.equal(outcome.status, "aborted");
  assert.equal(outcome.success, false);
  assert.deepEqual(outcome.evidence, { ok: false, via: "skipped", reason: "aborted" });
  assert.equal(evidenceCalls, 0);
});

test("finalizeExecutionEffects prepares fail evidence for timed-out executions", async () => {
  const entries = [];

  const outcome = await finalizeExecutionEffects({
    result: { exitCode: 124, timedOut: true },
    createEvidenceEntry: ({ status, success }) => ({
      check_type: `validation:${status}`,
      result: success ? "pass" : "fail",
      details: { status, success },
    }),
    async recordEvidence(entry) {
      entries.push(entry);
      return { ok: false, via: "failed", akError: "ak failed" };
    },
  });

  assert.equal(outcome.status, "timed_out");
  assert.equal(outcome.success, false);
  assert.equal(outcome.evidence.via, "failed");
  assert.deepEqual(entries, [
    {
      check_type: "validation:timed_out",
      result: "fail",
      details: { status: "timed_out", success: false },
    },
  ]);
});

test("recordEvidence uses ak when the current cwd is nested inside a registered repo root", async () => {
  const repoRoot = path.join(os.tmpdir(), `pi-orch-registered-root-${Date.now()}`);
  const cwd = path.join(repoRoot, "packages", "demo");
  const akCalls = [];

  const outcome = await recordEvidence(
    {
      check_type: "validation:registered-ancestor",
      result: "pass",
    },
    undefined,
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      cwd,
      async runAk(params) {
        akCalls.push(params);
        if (params.args[0] === "repo" && params.args[1] === "resolve") {
          return repoResolveMachineResult(cwd, repoRoot);
        }
        return { ok: true, stdout: "ak-ok", stderr: "" };
      },
    },
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.via, "ak");
  assert.equal(akCalls.length, 2);
  assert.equal(akCalls[0].cwd, cwd);
  assert.deepEqual(akCalls[0].args, ["repo", "resolve", cwd, "--machine"]);
  assert.deepEqual(akCalls[1].args.slice(0, 2), ["evidence", "record"]);
});

test("recordEvidence bootstraps a missing repo registration through ak before writing evidence", async () => {
  const repoRoot = path.join(os.tmpdir(), `pi-orch-bootstrap-root-${Date.now()}`);
  const cwd = path.join(repoRoot, "packages", "demo");
  const bootstrapCalls = [];
  const akCalls = [];

  const outcome = await recordEvidence(
    {
      check_type: "validation:bootstrap-register",
      result: "pass",
    },
    undefined,
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      cwd,
      async runRepoBootstrap(params) {
        bootstrapCalls.push(params);
        return {
          ok: true,
          stdout: "",
          stderr: "",
          report: {
            requested_path: path.resolve(cwd),
            resolved_repo_root: repoRoot,
            classification: "auto_safe",
            outcome: "registered",
            reason: "safe leaf repo",
            guidance: "Registered canonical repo root.",
            registered_repo: {
              path: repoRoot,
              company: "softwareco",
              archetype: "project",
              layer: "L2",
              generated_from: null,
              copier_answers: null,
              ontology_ref: null,
              last_sync: "2026-04-01T00:00:00Z",
              created_at: "2026-04-01T00:00:00Z",
            },
            mutation_performed: true,
            evidence_id: 1,
            governance_receipt_id: 2,
          },
        };
      },
      async runAk(params) {
        akCalls.push(params);
        if (params.args[0] === "repo" && params.args[1] === "resolve") {
          return repoResolveMachineResult(cwd);
        }
        return { ok: true, stdout: "ak-ok", stderr: "" };
      },
    },
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.via, "ak");
  assert.equal(bootstrapCalls.length, 1);
  assert.equal(bootstrapCalls[0].requestedPath, path.resolve(cwd));
  assert.equal(akCalls.length, 2);
  assert.deepEqual(akCalls[0].args, ["repo", "resolve", path.resolve(cwd), "--machine"]);
  assert.equal(akCalls[1].cwd, path.resolve(cwd));
});

test("recordEvidence fails closed when guarded bootstrap excludes the current cwd", async () => {
  const cwd = path.join(os.tmpdir(), `pi-orch-excluded-${Date.now()}`);
  let bootstrapCalls = 0;
  let akCalls = 0;

  const outcome = await recordEvidence(
    {
      check_type: "validation:unregistered-repo",
      result: "pass",
      details: { repo: cwd },
    },
    undefined,
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      cwd,
      async runRepoBootstrap() {
        bootstrapCalls += 1;
        return {
          ok: true,
          stdout: "",
          stderr: "",
          report: {
            requested_path: path.resolve(cwd),
            resolved_repo_root: path.resolve(cwd),
            classification: "excluded",
            outcome: "excluded",
            reason: "outside bounded workspace",
            guidance: "No mutation was performed.",
            registered_repo: null,
            mutation_performed: false,
            evidence_id: 1,
            governance_receipt_id: 2,
          },
        };
      },
      async runAk(params) {
        akCalls += 1;
        assert.deepEqual(params.args, ["repo", "resolve", path.resolve(cwd), "--machine"]);
        return repoResolveMachineResult(path.resolve(cwd));
      },
    },
  );

  assert.equal(outcome.ok, false);
  assert.equal(outcome.via, "failed");
  assert.equal(bootstrapCalls, 1);
  assert.equal(akCalls, 1);
  assert.match(outcome.akError || "", /excluded the current cwd/i);
});

test("recordEvidence caches excluded guarded-bootstrap failures for the same cwd", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-bootstrap-cache-"));
  let bootstrapCalls = 0;
  let akCalls = 0;

  try {
    const config = {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      cwd,
      async runAk(params) {
        akCalls += 1;
        assert.deepEqual(params.args, ["repo", "resolve", path.resolve(cwd), "--machine"]);
        return repoResolveMachineResult(path.resolve(cwd));
      },
      async runRepoBootstrap() {
        bootstrapCalls += 1;
        return {
          ok: true,
          stdout: "",
          stderr: "",
          report: {
            requested_path: path.resolve(cwd),
            resolved_repo_root: path.resolve(cwd),
            classification: "excluded",
            outcome: "excluded",
            reason: "not inside a canonical repo",
            guidance: "No mutation was performed.",
            registered_repo: null,
            mutation_performed: false,
            evidence_id: 1,
            governance_receipt_id: 2,
          },
        };
      },
    };

    const first = await recordEvidence(
      {
        check_type: "validation:bootstrap-cache-first",
        result: "pass",
      },
      undefined,
      config,
    );
    const second = await recordEvidence(
      {
        check_type: "validation:bootstrap-cache-second",
        result: "pass",
      },
      undefined,
      config,
    );

    assert.equal(first.via, "failed");
    assert.equal(second.via, "failed");
    assert.equal(bootstrapCalls, 1);
    assert.equal(akCalls, 2);
    assert.match(first.akError || "", /excluded/i);
    assert.match(second.akError || "", /excluded/i);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("recordEvidence fails closed after guarded bootstrap times out", async () => {
  let akCalls = 0;

  const outcome = await recordEvidence(
    {
      check_type: "validation:bootstrap-timeout",
      result: "fail",
    },
    undefined,
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      cwd: "/tmp/pi-orch-bootstrap-timeout",
      async runRepoBootstrap() {
        return {
          ok: false,
          stdout: "",
          stderr: "bootstrap timed out",
          timedOut: true,
        };
      },
      async runAk(params) {
        akCalls += 1;
        return repoResolveMachineResult(params.cwd);
      },
    },
  );

  assert.equal(outcome.ok, false);
  assert.equal(outcome.via, "failed");
  assert.equal(akCalls, 1);
  assert.match(outcome.akError || "", /bootstrap timed out/);
});

test("recordEvidence fails closed after non-timeout ak failure", async () => {
  const outcome = await recordEvidence(
    {
      check_type: "validation:fallback",
      result: "fail",
      details: { reason: "ak-down" },
    },
    undefined,
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      async runAk() {
        return {
          ok: false,
          stdout: "",
          stderr: "ak unavailable",
        };
      },
    },
  );

  assert.equal(outcome.ok, false);
  assert.equal(outcome.via, "failed");
  assert.match(outcome.akError || "", /ak unavailable/);
});

test("recordEvidence fails closed after ak timeout", async () => {
  const outcome = await recordEvidence(
    {
      check_type: "validation:timeout",
      result: "fail",
    },
    undefined,
    {
      akPath: "/tmp/fake-ak",
      societyDb: "/tmp/fake.db",
      async runAk() {
        return {
          ok: false,
          stdout: "",
          stderr: "ak timed out",
          timedOut: true,
        };
      },
    },
  );

  assert.equal(outcome.ok, false);
  assert.equal(outcome.via, "failed");
  assert.match(outcome.akError || "", /ak timed out/);
});
