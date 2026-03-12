import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildLoopExecuteInvocation } from "../src/loops/engine.ts";
import {
  buildSqlContainsExpression,
  execFileText,
  execFileTextAsync,
  isReadOnlySql,
  querySqliteJson,
  querySqliteJsonAsync,
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

test("buildLoopExecuteInvocation JSON-escapes loop objectives for editor insertion", () => {
  const objective = 'fix "quoted" edge\nnext line $(rm -rf /)';
  assert.equal(
    buildLoopExecuteInvocation("strategic", objective),
    `loop_execute({ loop: ${JSON.stringify("strategic")}, objective: ${JSON.stringify(objective)} })`,
  );
});
