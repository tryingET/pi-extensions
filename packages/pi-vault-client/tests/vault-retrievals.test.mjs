import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createTranspiledModuleHarness } from "./helpers/transpiled-module-harness.mjs";

test("logRetrievalBatch writes retrieval_events rows to the SQLite sidecar and stays fail-open", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pi-vault-retrievals-"));

  const harness = await createTranspiledModuleHarness({
    prefix: "vault-retrievals-",
    files: [
      "src/vaultTypes.ts",
      "src/companyContext.ts",
      "src/vaultSchema.ts",
      "src/vaultMutations.ts",
      "src/vaultFeedback.ts",
      "src/vaultDb.ts",
      "src/vaultReceipts.ts",
      "src/dispatchPosture.ts",
      "src/dispatchRuntime.ts",
      "src/templateRenderer.js",
    ],
  });
  process.env.VAULT_DIR = dir;
  try {
    const module = await harness.importModule("src/vaultDb.js");
    const runtimeFactory =
      module.createVaultRuntime ??
      module.default ??
      Object.values(module).find(
        (value) => typeof value === "function" && value.name === "createVaultRuntime",
      );
    assert.equal(typeof runtimeFactory, "function", "vault runtime factory found");
    const runtime = runtimeFactory({ vaultDir: dir });

    runtime.logRetrievalBatch(
      [
        { templateId: 1, entityVersion: 1, rank: 1 },
        { templateId: 2, entityVersion: 2, rank: 2 },
      ],
      {
        tool: "vault_query",
        queryContext: { filters: { artifact_kind: ["cognitive"] }, limit: 20 },
        resultCount: 2,
        company: "core",
      },
    );

    // Sidecar contract: WAL mode, append-only events, no dolt involvement.
    const db = new DatabaseSync(path.join(dir, "analytics.db"), { readOnly: true });
    try {
      const journalMode = db.prepare("PRAGMA journal_mode;").get();
      assert.equal(journalMode.journal_mode, "wal");

      const rows = db
        .prepare(
          `SELECT entity_id, tool, query_context, selected_rank, result_count, company
           FROM retrieval_events ORDER BY id`,
        )
        .all();
      assert.equal(rows.length, 2);
      assert.deepEqual(
        rows.map((row) => [Number(row.entity_id), row.tool, Number(row.selected_rank)]),
        [
          [1, "vault_query", 1],
          [2, "vault_query", 2],
        ],
      );
      assert.equal(Number(rows[0].result_count), 2);
      assert.equal(rows[0].company, "core");

      const queryContext = JSON.parse(rows[0].query_context);
      assert.equal(queryContext.filters.artifact_kind[0], "cognitive");

      const tables = db
        .prepare(
          `SELECT count(*) AS n FROM sqlite_master
           WHERE name IN ('retrieval_events') AND type = 'table'`,
        )
        .get();
      assert.equal(Number(tables.n), 1);
    } finally {
      db.close();
    }

    // fail-open: invalid entries and a missing vault dir must never throw
    runtime.logRetrievalBatch([{ templateId: Number.NaN }], { tool: "vault_retrieve" });
    process.env.VAULT_DIR = path.join(dir, "does-not-exist");
    runtime.logRetrievalBatch([{ templateId: 1, rank: 1 }], { tool: "vault_query" });
    assert.ok(true, "no throw surfaced from fail-open logging");
  } finally {
    delete process.env.VAULT_DIR;
  }
});
