#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectAutoresearchAkMilestone } from "../src/runtime/autoresearch-ak-projector.ts";

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
}

function createSqliteDb(repoRoot) {
  const dbPath = path.join(repoRoot, "society.db");
  execFileSync(
    "sqlite3",
    [
      dbPath,
      [
        "CREATE TABLE repos (path TEXT NOT NULL);",
        `INSERT INTO repos(path) VALUES('${escapeSql(repoRoot)}');`,
        [
          "CREATE TABLE evidence (",
          "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
          "  task_id INTEGER,",
          "  repo TEXT,",
          "  check_type TEXT NOT NULL,",
          "  result TEXT NOT NULL,",
          "  details JSON,",
          "  checked_at TEXT DEFAULT CURRENT_TIMESTAMP,",
          "  checked_by TEXT",
          ");",
        ].join("\n"),
      ].join("\n"),
    ],
    { encoding: "utf8" },
  );
  return dbPath;
}

function queryRows(dbPath, sql) {
  const output = execFileSync("sqlite3", [dbPath, "-json", sql], { encoding: "utf8" });
  return output.trim().length > 0 ? JSON.parse(output) : [];
}

function insertEvidenceRow(dbPath, { taskId, checkType, result, details }) {
  execFileSync(
    "sqlite3",
    [
      dbPath,
      [
        "INSERT INTO evidence (task_id, check_type, result, details)",
        `VALUES (${taskId}, '${escapeSql(checkType)}', '${escapeSql(result)}', '${escapeSql(JSON.stringify(details))}');`,
      ].join(" "),
    ],
    { encoding: "utf8" },
  );
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
const dbPath = createSqliteDb(repoRoot);
const taskId = 9101;
const runtime = createRuntime(cwd);
const ledger = { context: { blockedReason: null, completionReason: null } };
const akCalls = [];

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

  if (params.args[0] === "evidence" && params.args[1] === "record") {
    insertEvidenceRow(dbPath, {
      taskId: Number(params.args[params.args.indexOf("--task") + 1]),
      checkType: params.args[params.args.indexOf("--check-type") + 1],
      result: params.args[params.args.indexOf("--result") + 1],
      details: JSON.parse(params.args[params.args.indexOf("--details") + 1]),
    });
    return { ok: true, stdout: "ak-ok", stderr: "" };
  }

  throw new Error(`Unexpected ak args: ${params.args.join(" ")}`);
};

const first = await projectAutoresearchAkMilestone({
  taskId,
  akPath: "/tmp/fake-ak",
  societyDb: dbPath,
  runtime,
  ledger,
  runAk,
});

if (first.action !== "recorded") {
  blockers.push(`first_projection_not_recorded:${first.action}`);
}

const rowsAfterFirst = queryRows(
  dbPath,
  [
    "SELECT id,",
    "json_extract(details, '$.projection_key') AS projection_key,",
    "json_extract(details, '$.task_anchor.id') AS task_anchor_id,",
    "json_extract(details, '$.task_anchor.repo') AS task_anchor_repo,",
    "json_extract(details, '$.task_anchor.entity_version') AS task_anchor_entity_version",
    "FROM evidence ORDER BY id",
  ].join(" "),
);

if (rowsAfterFirst[0]?.task_anchor_id !== taskId) {
  blockers.push("recorded_projection_missing_task_anchor_id");
}
if (rowsAfterFirst[0]?.task_anchor_repo !== repoRoot) {
  blockers.push("recorded_projection_missing_task_anchor_repo");
}
if (rowsAfterFirst[0]?.task_anchor_entity_version !== 3) {
  blockers.push("recorded_projection_missing_task_anchor_entity_version");
}

insertEvidenceRow(dbPath, {
  taskId,
  checkType: first.candidate.payload.checkType,
  result: "pass",
  details: {
    ...first.candidate.payload.details,
    projection_key: `${first.candidate.payload.details.projection_key}:later`,
  },
});

const second = await projectAutoresearchAkMilestone({
  taskId,
  akPath: "/tmp/fake-ak",
  societyDb: dbPath,
  runtime,
  ledger,
  runAk,
});

if (second.action !== "already-projected" || second.existingEvidenceId !== 1) {
  blockers.push(
    `projection_key_dedupe_failed:${second.action}:${second.existingEvidenceId ?? "none"}`,
  );
}

const evidenceWrites = akCalls.filter((args) => args.startsWith("evidence record"));
if (evidenceWrites.length !== 1) {
  blockers.push(`unexpected_evidence_write_count:${evidenceWrites.length}`);
}

const rowsAfterSecond = queryRows(dbPath, "SELECT id FROM evidence ORDER BY id");
if (rowsAfterSecond.length !== 2) {
  blockers.push(`unexpected_evidence_row_count:${rowsAfterSecond.length}`);
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
    },
    null,
    2,
  ),
);

if (blockers.length > 0) {
  process.exitCode = 1;
}
