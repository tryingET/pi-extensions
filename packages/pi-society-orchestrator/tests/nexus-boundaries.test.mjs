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
  isReadOnlySql,
  querySqliteJson,
} from "../src/runtime/boundaries.ts";

test("isReadOnlySql accepts read-only statements and rejects mutating or stacked SQL", () => {
  assert.equal(isReadOnlySql("SELECT 1"), true);
  assert.equal(isReadOnlySql("-- comment\nSELECT 1"), true);
  assert.equal(isReadOnlySql("PRAGMA table_info('ontology')"), true);
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

test("buildLoopExecuteInvocation JSON-escapes loop objectives for editor insertion", () => {
  const objective = 'fix "quoted" edge\nnext line $(rm -rf /)';
  assert.equal(
    buildLoopExecuteInvocation("strategic", objective),
    `loop_execute({ loop: ${JSON.stringify("strategic")}, objective: ${JSON.stringify(objective)} })`,
  );
});
