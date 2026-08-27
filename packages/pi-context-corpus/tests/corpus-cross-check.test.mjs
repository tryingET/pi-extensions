// ---
// summary: "Cross-package integration: replay a synthetic session through the real overlay replayer and index the artifact it produced."
// read_when:
//   - "Changing the corpus↔overlay IR tie or when the overlay strata.json shape changes."
// ---
// This is the executable tie between the two packages. If the overlay changes strata.json
// (renames a field, alters classification inputs), this test fails — fixture-pinned corpus
// tests alone cannot detect IR drift because they test hand-authored files.
//
// The corpus never parses session JSONL: this test *generates* a known benign synthetic
// session, shells out to the real overlay replay (the same path batch mode uses), and
// consumes only its artifacts. Skipped when the overlay package is absent from the checkout.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PKG = fileURLToPath(new URL("..", import.meta.url));
const BIN = join(PKG, "bin", "corpus.mjs");
const REPLAY = join(PKG, "..", "pi-context-overlay", "scripts", "context-strata-replay.mjs");

// Minimal valid session: header + user + one measured assistant request (mirrors the
// overlay's own linear fixture shape, with benign synthetic content only).
const syntheticSession = [
  JSON.stringify({ type: "session", id: "root", parentId: null }),
  JSON.stringify({
    type: "message",
    id: "u1",
    parentId: "root",
    timestamp: "2026-01-01T00:00:00Z",
    message: { role: "user", content: [{ type: "text", text: "synthetic probe" }] },
  }),
  JSON.stringify({
    type: "message",
    id: "a1",
    parentId: "u1",
    timestamp: "2026-01-01T00:01:00Z",
    message: {
      role: "assistant",
      model: "synthetic/model",
      content: [{ type: "text", text: "ok" }],
      usage: { input: 500, cacheRead: 0, output: 5, cost: { total: 0.01 } },
    },
  }),
].join("\n");

test("corpus consumes real overlay replay output; IR carries schemaVersion + estimator", (t) => {
  if (!existsSync(REPLAY)) {
    t.skip("pi-context-overlay replay not present in this checkout");
    return;
  }
  const root = mkdtempSync(join(tmpdir(), "pi-context-corpus-xcheck-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "probe.jsonl"), `${syntheticSession}\n`);

  const out = execFileSync(
    process.execPath,
    [BIN, "index", root, "--sessions", join(root, "probe.jsonl"), "--replay-script", REPLAY],
    { encoding: "utf8" },
  );
  assert.match(out, /sessions \(ok=1 empty=0 failed=0 unsupported=0\)/);

  // The IR self-describes (overlay-side contract): identity travels with the artifact.
  const strata = JSON.parse(readFileSync(join(root, "probe", "strata.json"), "utf8"));
  assert.equal(typeof strata.meta.schemaVersion, "number", "IR must declare schemaVersion");
  assert.equal(strata.meta.schemaVersion, 1);
  assert.equal(typeof strata.meta.estimator, "string");
  assert.ok(strata.meta.estimator.length > 0);

  // The corpus index classifies the real artifact end-to-end.
  const index = JSON.parse(readFileSync(join(root, "corpus", "index.json"), "utf8"));
  assert.equal(index.sessions.length, 1);
  const entry = index.sessions[0];
  assert.equal(entry.id, "probe");
  assert.equal(entry.replayStatus, "ok");
  assert.equal(entry.sourceSession, join(root, "probe.jsonl"));
  assert.equal(entry.requests, 1);
  assert.equal(entry.onChainCostUsd, 0.01);
  assert.deepEqual(entry.models, ["synthetic/model"]);
});

test("corpus tolerates pre-versioning strata artifacts (absent schemaVersion stays readable)", (t) => {
  const root = mkdtempSync(join(tmpdir(), "pi-context-corpus-legacy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "legacy"), { recursive: true });
  // A legacy artifact: valid ledger, no schemaVersion/estimator (pre-IR-contract output).
  writeFileSync(
    join(root, "legacy", "strata.json"),
    JSON.stringify({
      meta: {
        file: "legacy.jsonl",
        requests: 1,
        turns: 1,
        costTotal: 0.02,
        cacheHit: 0.5,
        faults: [],
        runway: { residentLast: 10, contextWindow: 100, requestsRemaining: 90 },
        warmthAgreement: { n: 1, mae: 0 },
        forks: { count: 0 },
        modelChanges: [{ r: 0, model: "legacy/model" }],
        tokenTurns: 10,
        wasteRatio: 0,
      },
      requests: [{}],
      items: [],
    }),
  );
  const out = execFileSync(process.execPath, [BIN, "index", root], { encoding: "utf8" });
  assert.match(out, /sessions \(ok=1/);
  const index = JSON.parse(readFileSync(join(root, "corpus", "index.json"), "utf8"));
  assert.equal(index.sessions[0].replayStatus, "ok");
});
