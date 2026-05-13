import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildLoopExecuteInvocation,
  buildLoopTreeSnapshotFromStatusRecords,
  formatVaultExecuteTemplateResultLabel,
  parseLoopStatusRecord,
  parseTranscendentIterationPreviewInput,
  renderLoopTreeSnapshotText,
  resolveTranscendentIterationObjective,
} from "../src/loops/engine.ts";
import {
  buildSqlContainsExpression,
  execFileText,
  execFileTextAsync,
  getBoundaryTelemetryStats,
  isReadOnlySql,
  listBoundaryTelemetry,
  querySqliteJson,
  querySqliteJsonAsync,
  resetBoundaryTelemetry,
  summarizeBoundaryTelemetry,
} from "../src/runtime/boundaries.ts";

test("isReadOnlySql accepts read-only statements and rejects mutating or stacked SQL", () => {
  assert.equal(isReadOnlySql("SELECT 1"), true);
  assert.equal(isReadOnlySql("-- comment\nSELECT 1"), true);
  assert.equal(isReadOnlySql("WITH x AS (SELECT 1 AS n) SELECT * FROM x"), true);
  assert.equal(
    isReadOnlySql(
      "WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt LIMIT 3) SELECT * FROM cnt",
    ),
    true,
  );
  assert.equal(isReadOnlySql("WITH x AS (SELECT 1) DELETE FROM evidence"), false);
  assert.equal(isReadOnlySql("PRAGMA table_info('ontology')"), true);
  assert.equal(isReadOnlySql("PRAGMA main.table_info('ontology')"), true);
  assert.equal(isReadOnlySql("PRAGMA user_version = 7"), false);
  assert.equal(isReadOnlySql("INSERT INTO evidence VALUES (1)"), false);
  assert.equal(isReadOnlySql("SELECT 1; DROP TABLE evidence"), false);
});

test("execFileText passes argv literally without shell interpolation", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-boundary-"));
  const touchedFile = path.join(tempDir, "shell-owned.txt");
  const payload = `$(node -e "require('node:fs').writeFileSync(${JSON.stringify(touchedFile)}, 'owned')")`;

  try {
    const result = execFileText(process.execPath, ["-e", "console.log(process.argv[1])", payload]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.value, /\$\(/);
    }
    assert.equal(fs.existsSync(touchedFile), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("execFileTextAsync stays non-blocking for runtime boundary calls", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-boundary-async-"));
  const scriptPath = path.join(tempDir, "slow-print.sh");

  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/env bash
sleep 0.2
printf 'async-ok'
`,
  );
  fs.chmodSync(scriptPath, 0o755);

  try {
    let timerFired = false;
    const timer = new Promise((resolve) => {
      setTimeout(() => {
        timerFired = true;
        resolve(undefined);
      }, 20);
    });

    const resultPromise = execFileTextAsync(scriptPath, []);
    await timer;
    assert.equal(timerFired, true);

    const result = await resultPromise;
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value, "async-ok");
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("buildSqlContainsExpression neutralizes hostile LIKE input without dropping tables", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-sqlite-"));
  const dbPath = path.join(tempDir, "ontology.db");
  const hostile = "x%' ; DROP TABLE ontology; --";

  try {
    execFileSync(
      "sqlite3",
      [
        dbPath,
        "CREATE TABLE ontology(concept text, definition text, layer text); INSERT INTO ontology VALUES ('safe', 'definition', 'layer');",
      ],
      { encoding: "utf-8" },
    );

    const result = querySqliteJson(
      dbPath,
      `SELECT concept FROM ontology WHERE ${buildSqlContainsExpression("concept", hostile)} LIMIT 10`,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value, []);
    }

    const tables = execFileSync("sqlite3", [dbPath, ".tables"], { encoding: "utf-8" });
    assert.match(tables, /\bontology\b/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("querySqliteJsonAsync keeps runtime society reads off the blocking path", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-sqlite-async-"));
  const dbPath = path.join(tempDir, "ontology.db");

  try {
    execFileSync(
      "sqlite3",
      [dbPath, "CREATE TABLE ontology(concept text); INSERT INTO ontology VALUES ('safe');"],
      { encoding: "utf-8" },
    );

    const result = await querySqliteJsonAsync(dbPath, "SELECT concept FROM ontology LIMIT 1");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value, [{ concept: "safe" }]);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("boundary telemetry summarizes lower-plane command usage", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-boundary-telemetry-"));
  const dbPath = path.join(tempDir, "ontology.db");

  try {
    resetBoundaryTelemetry();
    execFileSync(
      "sqlite3",
      [dbPath, "CREATE TABLE ontology(concept text); INSERT INTO ontology VALUES ('safe');"],
      { encoding: "utf-8" },
    );

    const success = querySqliteJson(dbPath, "SELECT concept FROM ontology LIMIT 1");
    assert.equal(success.ok, true);

    const failure = execFileText(process.execPath, ["-e", "process.exit(7)"]);
    assert.equal(failure.ok, false);

    const stats = getBoundaryTelemetryStats();
    assert.equal(stats.totalCalls, 2);
    assert.equal(stats.successCount, 1);
    assert.equal(stats.failureCount, 1);
    assert.equal(stats.commandCounts["sqlite3:select"], 1);
    assert.equal(stats.commandCounts.node, 1);

    const recent = listBoundaryTelemetry(5);
    assert.equal(recent.length, 2);
    assert.equal(recent.at(-1)?.exitCode, 7);

    const summary = summarizeBoundaryTelemetry();
    assert.match(summary, /# Orchestrator Boundary Telemetry/);
    assert.match(summary, /command_mix: .*sqlite3:select=1/);
    assert.match(summary, /command_mix: .*node=1/);
    assert.match(summary, /failure_count: 1/);
    assert.match(summary, /latest_failure:/);
  } finally {
    resetBoundaryTelemetry();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("buildLoopExecuteInvocation JSON-escapes loop objectives for editor insertion", () => {
  const objective = 'fix "quoted" edge\nnext line $(rm -rf /)';
  assert.equal(
    buildLoopExecuteInvocation("strategic", objective),
    `loop_execute({ loop: ${JSON.stringify("strategic")}, objective: ${JSON.stringify(objective)} })`,
  );
});

test("resolveTranscendentIterationObjective uses explicit objectives unchanged", () => {
  const result = resolveTranscendentIterationObjective("rebuild this boundary", []);
  assert.equal(result.ok, true);
  assert.equal(result.objective, "rebuild this boundary");
  assert.equal(result.inferred, false);
});

test("resolveTranscendentIterationObjective treats empty and above-like args as previous assistant output", () => {
  const entries = [
    { type: "message", message: { role: "user", content: [{ type: "text", text: "question" }] } },
    {
      type: "message",
      message: { role: "assistant", content: [{ type: "text", text: "answer to improve" }] },
    },
  ];

  for (const args of ["", "above", "the above", "that", "last output"]) {
    const result = resolveTranscendentIterationObjective(args, entries);
    assert.equal(result.ok, true);
    assert.equal(result.inferred, true);
    assert.match(result.objective, /immediately preceding assistant output/);
    assert.match(result.objective, /answer to improve/);
  }
});

test("resolveTranscendentIterationObjective fails clearly when no assistant output exists", () => {
  const result = resolveTranscendentIterationObjective("the above", [
    { type: "message", message: { role: "user", content: "only user" } },
  ]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /No previous assistant output/);
});

test("parseTranscendentIterationPreviewInput recognizes compact preview syntax", () => {
  assert.equal(parseTranscendentIterationPreviewInput("$$/transcendent-iteration"), "");
  assert.equal(parseTranscendentIterationPreviewInput("$$/transcendent-iteration above"), "above");
  assert.equal(
    parseTranscendentIterationPreviewInput("$$/transcendent-iteration improve the answer"),
    "improve the answer",
  );
  assert.equal(parseTranscendentIterationPreviewInput("$$ /transcendent-iteration"), null);
  assert.equal(parseTranscendentIterationPreviewInput("/transcendent-iteration"), null);
});

test("formatVaultExecuteTemplateResultLabel shows progress instead of blocked for updates", () => {
  assert.equal(
    formatVaultExecuteTemplateResultLabel({
      content: [{ type: "text", text: "Starting transcendent.diagnose" }],
      details: { status: "phase_start" },
    }),
    "Starting transcendent.diagnose",
  );
  assert.equal(
    formatVaultExecuteTemplateResultLabel({
      content: [{ type: "text", text: "" }],
      details: { ok: false, error: "vault-dispatch-check-failed" },
    }),
    "vault-dispatch-check-failed",
  );
});

test("parseLoopStatusRecord extracts loop run identity from hidden phase status files", () => {
  const record = parseLoopStatusRecord(
    "/tmp/scout-first-principles-4.status.json",
    JSON.stringify({
      status: "running",
      sessionName: "scout-first-principles-4",
      objective:
        "# Loop: TRANSCENDENT\n## Phase: diagnose\n## Session: transcendent-123\n\n## Objective\nImprove the last answer\n\n## Phase Protocol\nDiagnose",
      createdAt: "2026-05-10T06:23:10.000Z",
      updatedAt: "2026-05-10T06:24:32.000Z",
      resultPreview: "diagnosis",
    }),
  );

  assert.equal(record?.loop, "transcendent");
  assert.equal(record?.phase, "diagnose");
  assert.equal(record?.loopSessionId, "transcendent-123");
  assert.equal(record?.objective, "Improve the last answer");
  assert.equal(record?.sessionName, "scout-first-principles-4");
});

test("buildLoopTreeSnapshotFromStatusRecords groups phases and fills pending loop phases", () => {
  const records = [
    parseLoopStatusRecord(
      "/tmp/scout.status.json",
      JSON.stringify({
        status: "done",
        sessionName: "scout-first-principles-4",
        objective:
          "# Loop: TRANSCENDENT\n## Phase: diagnose\n## Session: transcendent-123\n\n## Objective\nImprove the last answer",
        createdAt: "2026-05-10T06:23:10.000Z",
        updatedAt: "2026-05-10T06:24:32.000Z",
      }),
    ),
    parseLoopStatusRecord(
      "/tmp/builder.status.json",
      JSON.stringify({
        status: "running",
        sessionName: "builder-nexus-9",
        objective:
          "# Loop: TRANSCENDENT\n## Phase: first-100x\n## Session: transcendent-123\n\n## Objective\nImprove the last answer",
        updatedAt: "2026-05-10T06:29:13.000Z",
      }),
    ),
  ].filter(Boolean);

  const snapshot = buildLoopTreeSnapshotFromStatusRecords(records, "/tmp/loops");
  assert.equal(snapshot.runs.length, 1);
  assert.equal(snapshot.runs[0].sessionId, "transcendent-123");
  assert.equal(snapshot.runs[0].status, "running");
  assert.equal(snapshot.runs[0].currentPhase, "first-100x");
  assert.equal(snapshot.runs[0].startedAt, "2026-05-10T06:23:10.000Z");
  assert.equal(snapshot.runs[0].phases[0].phase, "diagnose");
  assert.equal(snapshot.runs[0].phases[0].status, "done");
  assert.equal(snapshot.runs[0].phases.at(-1).phase, "closure-gate");
  assert.equal(snapshot.runs[0].phases.at(-1).status, "pending");
});

test("renderLoopTreeSnapshotText provides a safe non-interactive loop-runs fallback", () => {
  const snapshot = buildLoopTreeSnapshotFromStatusRecords(
    [
      parseLoopStatusRecord(
        "/tmp/scout.status.json",
        JSON.stringify({
          status: "done",
          sessionName: "scout-first-principles-4",
          objective:
            "# Loop: TRANSCENDENT\n## Phase: diagnose\n## Session: transcendent-123\n\n## Objective\nImprove the last answer",
          elapsed: 1200,
          createdAt: "2026-05-10T06:23:10.000Z",
          updatedAt: "2026-05-10T06:24:32.000Z",
        }),
      ),
    ].filter(Boolean),
    "/tmp/loops",
  );

  const text = renderLoopTreeSnapshotText(snapshot);
  assert.match(text, /# Loop Runs/);
  assert.match(text, /TRANSCENDENT transcendent-123/);
  assert.match(text, /started: 2026-05-10 06:23:10Z/);
  assert.match(text, /✓ diagnose: done\s+scout-first-principles-4\s+1s/);
  assert.match(text, /○ closure-gate: pending/);
});
