import assert from "node:assert/strict";
import test from "node:test";

import {
  findLatestAkTaskEvidence,
  readAkTaskEvidence,
  resolveAkRepo,
} from "../src/runtime/ak-machine.ts";

function machineResult({
  surface,
  payloadKind,
  payload,
  ok = true,
  error = null,
  schemaVersion = 1,
}) {
  return {
    ok: true,
    stdout: JSON.stringify({
      surface,
      schema_version: schemaVersion,
      emitted_at: "2026-08-30T00:00:00Z",
      payload_kind: payloadKind,
      schema_locator: `ak machine schema ${surface.replaceAll(".", "-")}`,
      ok,
      payload: ok ? payload : null,
      error: ok ? null : error,
    }),
    stderr: "",
  };
}

function repoDetail(path) {
  return {
    path,
    company: "softwareco",
    archetype: "project",
    layer: "L2",
    generated_from: null,
    copier_answers: null,
    ontology_ref: null,
    last_sync: "2026-08-30T00:00:00Z",
    created_at: "2026-03-06T00:00:00Z",
  };
}

test("resolveAkRepo accepts a registered canonical repo machine envelope", async () => {
  const calls = [];
  const requestedPath = "/workspace/repo/packages/demo";
  const canonicalPath = "/workspace/repo";
  const result = await resolveAkRepo(
    {
      akPath: "/opt/ak",
      societyDb: "/state/society.v2.db",
      cwd: requestedPath,
      maxStdoutBytes: 1234,
      async runAk(params) {
        calls.push(params);
        return machineResult({
          surface: "repo.resolve",
          payloadKind: "repo_resolution",
          payload: {
            input: requestedPath,
            canonical_path: canonicalPath,
            registered: true,
            repo: repoDetail(canonicalPath),
          },
        });
      },
    },
    requestedPath,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.registered, true);
    assert.equal(result.value.canonical_path, canonicalPath);
    assert.equal(result.value.repo?.company, "softwareco");
  }
  assert.deepEqual(calls[0].args, ["repo", "resolve", requestedPath, "--machine"]);
  assert.equal(calls[0].cwd, requestedPath);
  assert.equal(calls[0].maxStdoutBytes, 1234);
});

test("resolveAkRepo preserves the canonical unregistered outcome without inventing metadata", async () => {
  const requestedPath = "/workspace/unregistered";
  const result = await resolveAkRepo(
    {
      akPath: "ak",
      societyDb: "/state/society.v2.db",
      async runAk() {
        return machineResult({
          surface: "repo.resolve",
          payloadKind: "repo_resolution",
          payload: {
            input: requestedPath,
            canonical_path: null,
            registered: false,
            repo: null,
          },
        });
      },
    },
    requestedPath,
  );

  assert.deepEqual(result, {
    ok: true,
    value: {
      input: requestedPath,
      canonical_path: null,
      registered: false,
      repo: null,
    },
  });
});

test("resolveAkRepo fails closed on envelope surface, schema, and canonical-path drift", async () => {
  const cases = [
    machineResult({
      surface: "repo.show",
      payloadKind: "repo_resolution",
      payload: {},
    }),
    machineResult({
      surface: "repo.resolve",
      payloadKind: "repo_resolution",
      payload: {},
      schemaVersion: 2,
    }),
    machineResult({
      surface: "repo.resolve",
      payloadKind: "repo_resolution",
      payload: {
        input: "/workspace/repo",
        canonical_path: "/workspace/repo",
        registered: true,
        repo: repoDetail("/workspace/other"),
      },
    }),
    machineResult({
      surface: "repo.resolve",
      payloadKind: "repo_resolution",
      payload: {
        input: "/workspace/replayed",
        canonical_path: "/workspace/repo",
        registered: true,
        repo: repoDetail("/workspace/repo"),
      },
    }),
  ];

  for (const commandResult of cases) {
    const result = await resolveAkRepo(
      {
        akPath: "ak",
        societyDb: "/state/society.v2.db",
        async runAk() {
          return commandResult;
        },
      },
      "/workspace/repo",
    );
    assert.equal(result.ok, false);
  }
});

test("readAkTaskEvidence validates the machine collection and selects the newest projection", async () => {
  const result = await readAkTaskEvidence(
    {
      akPath: "ak",
      societyDb: "/state/society.v2.db",
      async runAk(params) {
        assert.deepEqual(params.args, ["evidence", "task", "5127", "--machine"]);
        return machineResult({
          surface: "evidence.task",
          payloadKind: "evidence_collection",
          payload: {
            task_id: 5127,
            count: 3,
            evidence: [
              {
                id: 8,
                task_id: 5127,
                check_type: "autoresearch:milestone:ready",
                result: "pass",
                details: { projection_key: "same" },
              },
              {
                id: 11,
                task_id: 5127,
                check_type: "autoresearch:milestone:ready",
                result: "pass",
                details: { projection_key: "same" },
              },
              {
                id: 12,
                task_id: 5127,
                check_type: "other",
                result: "pass",
                details: { projection_key: "same" },
              },
            ],
          },
        });
      },
    },
    5127,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(
      findLatestAkTaskEvidence(result.value, {
        checkType: "autoresearch:milestone:ready",
        projectionKey: "same",
      })?.id,
      11,
    );
    assert.equal(
      findLatestAkTaskEvidence(result.value, {
        checkType: "autoresearch:milestone:ready",
      })?.id,
      11,
    );
  }
});

test("readAkTaskEvidence fails closed on malformed rows and count drift", async () => {
  for (const payload of [
    {
      task_id: 5127,
      count: 2,
      evidence: [
        {
          id: 1,
          task_id: 5127,
          check_type: "validation",
          details: {},
        },
      ],
    },
    {
      task_id: 5127,
      count: 1,
      evidence: [
        {
          id: 1,
          task_id: 9999,
          check_type: "validation",
          details: {},
        },
      ],
    },
  ]) {
    const result = await readAkTaskEvidence(
      {
        akPath: "ak",
        societyDb: "/state/society.v2.db",
        async runAk() {
          return machineResult({
            surface: "evidence.task",
            payloadKind: "evidence_collection",
            payload,
          });
        },
      },
      5127,
    );
    assert.equal(result.ok, false);
  }
});

test("machine error envelopes remain failures even when the process emitted JSON", async () => {
  const result = await resolveAkRepo(
    {
      akPath: "ak",
      societyDb: "/state/society.v2.db",
      async runAk() {
        return machineResult({
          surface: "repo.resolve",
          payloadKind: "repo_resolution",
          payload: null,
          ok: false,
          error: { code: "validation_error", message: "path is empty" },
        });
      },
    },
    "/workspace/repo",
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /validation_error: path is empty/);
});
