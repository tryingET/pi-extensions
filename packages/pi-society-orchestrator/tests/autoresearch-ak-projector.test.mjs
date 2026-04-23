import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendLedgerEvent,
  appendReceipt,
  buildAutoresearchRuntimeStatus,
  campaignEvents,
  createConfigReceipt,
  createLedgerEventEntry,
  createRunReceipt,
  projectAutoresearchLedger,
} from "../../pi-autoresearch/src/runtime.ts";
import {
  buildAutoresearchAkMilestoneCheckType,
  deriveAutoresearchAkMilestoneCandidate,
  projectAutoresearchAkMilestone,
} from "../src/runtime/autoresearch-ak-projector.ts";

function createRuntime(overrides = {}) {
  const cwd = Object.hasOwn(overrides, "cwd") ? overrides.cwd : "/tmp/campaign";
  const currentSegment = {
    configured: true,
    name: "widget-speed",
    metricName: "total_ms",
    metricUnit: "ms",
    direction: "lower",
    benchmarkCommand: "bash autoresearch.sh",
    checksCommand: "bash autoresearch.checks.sh",
    runCount: 0,
    successfulRunCount: 0,
    baselineMetric: null,
    bestMetric: null,
    lastRunStatus: null,
    lastRunMetric: null,
    ...(overrides.currentSegment ?? {}),
  };
  const runtimeProjection = {
    state: "ready",
    source: "ledger",
    ledgerPath: cwd ? path.join(cwd, "autoresearch.events.jsonl") : undefined,
    hasLedger: true,
    invalidLedgerLines: 0,
    eventCount: 1,
    replayedEventCount: 1,
    rejectedEvents: [],
    syncIssues: [],
    ...(overrides.runtimeProjection ?? {}),
  };

  return {
    receiptPath: cwd ? path.join(cwd, "autoresearch.jsonl") : undefined,
    ...overrides,
    cwd,
    currentSegment,
    runtimeProjection,
  };
}

function createLedger(overrides = {}) {
  return {
    context: {
      blockedReason: null,
      completionReason: null,
      ...(overrides.context ?? {}),
    },
    ...overrides,
  };
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

function escapeSql(value) {
  return value.replaceAll("'", "''");
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

function createAwaitingDecisionCampaign() {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "pi-orch-autoresearch-repo-"));
  const cwd = path.join(repoRoot, "campaigns", "widget-speed");
  mkdirSync(cwd, { recursive: true });

  const config = createConfigReceipt({
    name: "widget-speed",
    metricName: "total_ms",
    metricUnit: "ms",
    direction: "lower",
    createdAt: 1_000,
    benchmarkCommand: "bash autoresearch.sh",
    checksCommand: "bash autoresearch.checks.sh",
  });
  appendReceipt(cwd, config);
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.configureSegment({
        name: config.name,
        metricName: config.metricName,
        metricUnit: config.metricUnit,
        direction: config.direction,
        benchmarkCommand: config.benchmarkCommand,
        checksCommand: config.checksCommand,
      }),
      config.createdAt,
    ),
  );

  const run = createRunReceipt({
    status: "baseline",
    metric: 24.1,
    metrics: { total_ms: 24.1 },
    description: "seed baseline",
    timestamp: 2_000,
    benchmarkCommand: "bash autoresearch.sh",
    checksCommand: "bash autoresearch.checks.sh",
    checksPassed: true,
  });
  appendReceipt(cwd, run);
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.startRun({
        description: "seed baseline",
        benchmarkCommand: "bash autoresearch.sh",
        checksCommand: "bash autoresearch.checks.sh",
      }),
      run.timestamp,
    ),
  );
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.benchmarkSucceeded({ metric: run.metric, requiresChecks: true }),
      run.timestamp,
    ),
  );
  appendLedgerEvent(cwd, createLedgerEventEntry(campaignEvents.checksSucceeded(), run.timestamp));
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.receiptRecorded({ status: run.status, metric: run.metric }),
      run.timestamp,
    ),
  );

  const runtime = buildAutoresearchRuntimeStatus(cwd);
  const ledger = projectAutoresearchLedger(cwd);
  return {
    repoRoot,
    cwd,
    runtime,
    ledger: {
      context: {
        blockedReason: ledger.context.blockedReason,
        completionReason: ledger.context.completionReason,
      },
    },
  };
}

test("deriveAutoresearchAkMilestoneCandidate maps each projectable milestone to AK evidence payload", () => {
  const cases = [
    {
      milestone: "configured",
      result: "pass",
      runtime: createRuntime(),
      ledger: createLedger(),
      summary: /configured and ready/,
    },
    {
      milestone: "decision-required",
      result: "pass",
      runtime: createRuntime({
        currentSegment: {
          runCount: 3,
          successfulRunCount: 2,
          baselineMetric: 24.1,
          bestMetric: 18.4,
          lastRunStatus: "keep",
          lastRunMetric: 18.4,
        },
        runtimeProjection: {
          state: "awaiting_decision",
          eventCount: 11,
          replayedEventCount: 11,
        },
      }),
      ledger: createLedger(),
      summary: /awaiting next bounded decision/,
    },
    {
      milestone: "rebaseline-needed",
      result: "skip",
      runtime: createRuntime({
        currentSegment: {
          runCount: 2,
          successfulRunCount: 2,
          baselineMetric: 10,
          bestMetric: 9,
          lastRunStatus: "candidate",
          lastRunMetric: 9,
        },
        runtimeProjection: {
          state: "rebaseline_needed",
          eventCount: 8,
          replayedEventCount: 8,
        },
      }),
      ledger: createLedger(),
      summary: /needs rebaseline/,
    },
    {
      milestone: "finalize-candidate",
      result: "pass",
      runtime: createRuntime({
        currentSegment: {
          runCount: 4,
          successfulRunCount: 3,
          baselineMetric: 120,
          bestMetric: 91,
          lastRunStatus: "keep",
          lastRunMetric: 91,
        },
        runtimeProjection: {
          state: "finalize_candidate",
          eventCount: 14,
          replayedEventCount: 14,
        },
      }),
      ledger: createLedger(),
      summary: /ready for finalization/,
    },
    {
      milestone: "blocked",
      result: "fail",
      runtime: createRuntime({
        currentSegment: {
          runCount: 1,
          successfulRunCount: 1,
          baselineMetric: 20,
          bestMetric: 20,
          lastRunStatus: "baseline",
          lastRunMetric: 20,
        },
        runtimeProjection: {
          state: "blocked",
          eventCount: 5,
          replayedEventCount: 5,
        },
      }),
      ledger: createLedger({
        context: {
          blockedReason: "waiting for operator review",
        },
      }),
      summary: /waiting for operator review/,
    },
    {
      milestone: "completed",
      result: "pass",
      runtime: createRuntime({
        currentSegment: {
          runCount: 5,
          successfulRunCount: 4,
          baselineMetric: 32,
          bestMetric: 14,
          lastRunStatus: "keep",
          lastRunMetric: 14,
        },
        runtimeProjection: {
          state: "completed",
          eventCount: 16,
          replayedEventCount: 16,
        },
      }),
      ledger: createLedger({
        context: {
          completionReason: "ship the fastest candidate",
        },
      }),
      summary: /ship the fastest candidate/,
    },
  ];

  for (const entry of cases) {
    const candidate = deriveAutoresearchAkMilestoneCandidate({
      runtime: entry.runtime,
      ledger: entry.ledger,
    });

    assert.equal(candidate.kind, "projectable");
    assert.equal(
      candidate.payload.checkType,
      buildAutoresearchAkMilestoneCheckType(entry.milestone),
    );
    assert.equal(candidate.payload.result, entry.result);
    assert.equal(candidate.payload.details.contract_version, 1);
    assert.equal(candidate.payload.details.milestone, entry.milestone);
    assert.equal(candidate.payload.details.projection_key, candidate.snapshot.projectionKey);
    assert.deepEqual(candidate.payload.details.segment, {
      name: "widget-speed",
      metric_name: "total_ms",
      metric_unit: "ms",
      direction: "lower",
    });
    assert.equal(candidate.payload.details.runtime.state, candidate.snapshot.runtimeState);
    assert.equal(candidate.payload.details.ledger.path, "/tmp/campaign/autoresearch.events.jsonl");
    assert.equal(candidate.payload.details.receipts.path, "/tmp/campaign/autoresearch.jsonl");
    assert.match(candidate.payload.details.summary, entry.summary);
  }
});

test("deriveAutoresearchAkMilestoneCandidate returns noop for transient states and blocked for integrity failures", () => {
  const monitoring = deriveAutoresearchAkMilestoneCandidate({
    runtime: createRuntime({
      currentSegment: {
        runCount: 1,
        successfulRunCount: 1,
        baselineMetric: 10,
        bestMetric: 10,
        lastRunStatus: "baseline",
        lastRunMetric: 10,
      },
      runtimeProjection: {
        state: "ready",
        eventCount: 4,
        replayedEventCount: 4,
      },
    }),
  });

  assert.equal(monitoring.kind, "noop");
  assert.equal(monitoring.payload, null);
  assert.match(monitoring.reason, /no new coarse milestone is ready yet/i);

  const blocked = deriveAutoresearchAkMilestoneCandidate({
    runtime: createRuntime({
      currentSegment: {
        runCount: 1,
        successfulRunCount: 1,
        baselineMetric: 10,
        bestMetric: 10,
        lastRunStatus: "baseline",
        lastRunMetric: 10,
      },
      runtimeProjection: {
        state: "awaiting_decision",
        invalidLedgerLines: 2,
        eventCount: 4,
        replayedEventCount: 2,
      },
    }),
  });

  assert.equal(blocked.kind, "blocked");
  assert.equal(blocked.payload, null);
  assert.equal(blocked.reason, "event ledger has 2 invalid line(s)");
});

test("projectAutoresearchAkMilestone fails closed when the anchored AK task is unavailable", async () => {
  const runtime = createRuntime({
    currentSegment: {
      runCount: 1,
      successfulRunCount: 1,
      baselineMetric: 24.1,
      bestMetric: 18.4,
      lastRunStatus: "keep",
      lastRunMetric: 18.4,
    },
    runtimeProjection: {
      state: "awaiting_decision",
      eventCount: 11,
      replayedEventCount: 11,
    },
  });

  let akCalls = 0;
  const result = await projectAutoresearchAkMilestone({
    taskId: 7001,
    akPath: "/tmp/fake-ak",
    societyDb: "/tmp/fake.db",
    runtime,
    ledger: createLedger(),
    async runAk() {
      akCalls += 1;
      return {
        ok: false,
        stdout: "",
        stderr: "task not found",
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.action, "blocked");
  assert.equal(result.error, "task not found");
  assert.equal(akCalls, 1);
});

test("projectAutoresearchAkMilestone records one durable row and deduplicates unchanged projections", async () => {
  const { repoRoot, runtime, ledger } = createAwaitingDecisionCampaign();
  const dbPath = createSqliteDb(repoRoot);
  const taskId = 4201;
  const akCalls = [];

  const runAk = async (params) => {
    akCalls.push(params.args.join(" "));
    if (params.args[0] === "task" && params.args[1] === "show") {
      return {
        ok: true,
        stdout: JSON.stringify({
          id: taskId,
          repo: repoRoot,
          title: "Autoresearch projection anchor",
          status: "claimed",
          entity_version: 7,
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
      return {
        ok: true,
        stdout: "ak-ok",
        stderr: "",
      };
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

  assert.equal(first.ok, true);
  assert.equal(first.action, "recorded");
  assert.equal(first.evidence?.via, "ak");
  assert.equal(first.task?.repo, repoRoot);

  const rowsAfterFirst = queryRows(
    dbPath,
    [
      "SELECT id, task_id, check_type, result,",
      "json_extract(details, '$.projection_key') AS projection_key,",
      "json_extract(details, '$.summary') AS summary",
      "FROM evidence ORDER BY id",
    ].join(" "),
  );
  assert.equal(rowsAfterFirst.length, 1);
  assert.equal(rowsAfterFirst[0].task_id, taskId);
  assert.equal(rowsAfterFirst[0].check_type, "autoresearch:milestone:decision-required");
  assert.equal(rowsAfterFirst[0].result, "pass");
  assert.match(rowsAfterFirst[0].summary, /awaiting next bounded decision/);
  assert.equal(rowsAfterFirst[0].projection_key, first.candidate.payload.details.projection_key);

  const second = await projectAutoresearchAkMilestone({
    taskId,
    akPath: "/tmp/fake-ak",
    societyDb: dbPath,
    runtime,
    ledger,
    runAk,
  });

  assert.equal(second.ok, true);
  assert.equal(second.action, "already-projected");
  assert.equal(second.existingEvidenceId, 1);

  const rowsAfterSecond = queryRows(dbPath, "SELECT id FROM evidence ORDER BY id");
  assert.deepEqual(rowsAfterSecond, [{ id: 1 }]);
  assert.deepEqual(akCalls, [
    `task show ${taskId} -F json`,
    `evidence record --check-type autoresearch:milestone:decision-required --result pass --task 4201 --details ${JSON.stringify(first.candidate.payload.details)}`,
    `task show ${taskId} -F json`,
  ]);
});
