#!/usr/bin/env node
import { mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectAutoresearchAkMilestone } from "../src/runtime/autoresearch-ak-projector.ts";

function machineEnvelope(surface, payloadKind, payload) {
  return {
    ok: true,
    stdout: JSON.stringify({
      surface,
      schema_version: 1,
      emitted_at: "2026-08-30T00:00:00Z",
      payload_kind: payloadKind,
      schema_locator: `ak machine schema ${surface.replaceAll(".", "-")}`,
      ok: true,
      payload,
      error: null,
    }),
    stderr: "",
  };
}

function createRuntime(cwd) {
  return {
    cwd,
    receiptPath: path.join(cwd, "autoresearch.jsonl"),
    currentSegment: {
      configured: true,
      name: "projection-hardening",
      metricName: "total_ms",
      metricUnit: "ms",
      direction: "lower",
      benchmarkCommand: "bash bench.sh",
      checksCommand: "bash check.sh",
      runCount: 3,
      successfulRunCount: 2,
      baselineMetric: 50,
      bestMetric: 42,
      lastRunStatus: "keep",
      lastRunMetric: 42,
    },
    runtimeProjection: {
      state: "awaiting_decision",
      source: "ledger",
      ledgerPath: path.join(cwd, "autoresearch.events.jsonl"),
      hasLedger: true,
      invalidLedgerLines: 0,
      eventCount: 11,
      replayedEventCount: 11,
      rejectedEvents: [],
      syncIssues: [],
    },
  };
}

const blockers = [];
const repoRoot = mkdtempSync(path.join(os.tmpdir(), "orchestrator-projection-hardening-"));
const cwd = path.join(repoRoot, "campaigns", "projection-hardening");
mkdirSync(cwd, { recursive: true });
const taskId = 9101;
const runtime = createRuntime(cwd);
const ledger = { context: { blockedReason: null, completionReason: null } };
const akCalls = [];
const evidence = [];

function insertEvidence({ taskId: rowTaskId, checkType, result, details }) {
  evidence.push({
    id: evidence.length + 1,
    task_id: rowTaskId,
    task_ref: rowTaskId,
    repo: repoRoot,
    repo_scope: repoRoot,
    check_type: checkType,
    result,
    details,
    checked_at: "2026-08-30T00:00:00Z",
    checked_by: "dogfood",
  });
}

const runAk = async (params) => {
  akCalls.push(params.args.join(" "));
  if (params.args[0] === "task" && params.args[1] === "show") {
    return {
      ok: true,
      stdout: JSON.stringify({
        id: taskId,
        repo: repoRoot,
        title: "Projection hardening dogfood",
        status: "claimed",
        entity_version: 3,
      }),
      stderr: "",
    };
  }

  if (params.args[0] === "evidence" && params.args[1] === "task") {
    const rows = evidence.filter((row) => row.task_id === taskId);
    return machineEnvelope("evidence.task", "evidence_collection", {
      task_id: taskId,
      count: rows.length,
      evidence: rows,
    });
  }

  if (params.args[0] === "repo" && params.args[1] === "resolve") {
    const input = params.args[2];
    return machineEnvelope("repo.resolve", "repo_resolution", {
      input,
      canonical_path: repoRoot,
      registered: true,
      repo: {
        path: repoRoot,
        company: "softwareco",
        archetype: "project",
        layer: "L2",
        generated_from: null,
        copier_answers: null,
        ontology_ref: null,
        last_sync: "2026-08-30T00:00:00Z",
        created_at: "2026-03-06T00:00:00Z",
      },
    });
  }

  if (params.args[0] === "evidence" && params.args[1] === "record") {
    insertEvidence({
      taskId: Number(params.args[params.args.indexOf("--task") + 1]),
      checkType: params.args[params.args.indexOf("--check-type") + 1],
      result: params.args[params.args.indexOf("--result") + 1],
      details: JSON.parse(params.args[params.args.indexOf("--details") + 1]),
    });
    return { ok: true, stdout: "ak-ok", stderr: "" };
  }

  throw new Error(`Unexpected ak args: ${params.args.join(" ")}`);
};

const runProjection = () =>
  projectAutoresearchAkMilestone({
    taskId,
    akPath: "/tmp/fake-ak",
    societyDb: "/tmp/society.v2.db",
    runtime,
    ledger,
    runAk,
  });

const first = await runProjection();
if (first.action !== "recorded") {
  blockers.push(`first_projection_not_recorded:${first.action}`);
}

if (evidence[0]?.details?.task_anchor?.id !== taskId) {
  blockers.push("recorded_projection_missing_task_anchor_id");
}
if (evidence[0]?.details?.task_anchor?.repo !== repoRoot) {
  blockers.push("recorded_projection_missing_task_anchor_repo");
}
if (evidence[0]?.details?.task_anchor?.entity_version !== 3) {
  blockers.push("recorded_projection_missing_task_anchor_entity_version");
}

insertEvidence({
  taskId,
  checkType: first.candidate.payload.checkType,
  result: "pass",
  details: {
    ...first.candidate.payload.details,
    projection_key: `${first.candidate.payload.details.projection_key}:later`,
  },
});

const second = await runProjection();
if (second.action !== "already-projected" || second.existingEvidenceId !== 1) {
  blockers.push(
    `projection_key_dedupe_failed:${second.action}:${second.existingEvidenceId ?? "none"}`,
  );
}

const evidenceWrites = akCalls.filter((args) => args.startsWith("evidence record"));
if (evidenceWrites.length !== 1) {
  blockers.push(`unexpected_evidence_write_count:${evidenceWrites.length}`);
}
if (evidence.length !== 2) {
  blockers.push(`unexpected_evidence_row_count:${evidence.length}`);
}
for (const expectedRead of [`evidence task ${taskId} --machine`, `repo resolve ${cwd} --machine`]) {
  if (!akCalls.includes(expectedRead)) blockers.push(`missing_machine_read:${expectedRead}`);
}
if (akCalls.some((args) => args.includes("sqlite"))) {
  blockers.push("stock_sqlite_boundary_observed");
}

console.log(`METRIC unresolved_evidence_projection_hardening_blockers=${blockers.length}`);
console.log(
  JSON.stringify(
    {
      cwd,
      blockers,
      unresolved: blockers.length,
      first: {
        action: first.action,
        projectionKey: first.candidate.payload?.details.projection_key,
      },
      second: { action: second.action, existingEvidenceId: second.existingEvidenceId ?? null },
      evidenceWrites: evidenceWrites.length,
      machineReads: akCalls.filter(
        (args) => args.includes(" --machine") || args.startsWith("evidence task "),
      ),
    },
    null,
    2,
  ),
);

if (blockers.length > 0) process.exitCode = 1;
