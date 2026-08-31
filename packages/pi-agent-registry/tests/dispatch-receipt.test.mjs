// ---
// summary: verifies write-once receipt mechanics, canonical digests, and tamper detection.
// read_when:
//   - changing receipt publication or verification semantics.
// ---

import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  attemptIndexFromReceiptFileName,
  canonicalJsonString,
  computeDispatchReceiptSha256,
  dispatchReceiptFileName,
  readDispatchAttemptLedger,
  readDispatchReceipt,
  sha256Hex,
  writeImmutableDispatchReceipt,
} from "../src/dispatch-receipt.ts";

function sampleReceipt() {
  return {
    schema: "pi-agent-registry.dispatch-receipt/1",
    phase: "fleet_phase_2",
    agent: {
      name: "agent-fixture",
      tools: ["read"],
      thinking: "medium",
      model: null,
      loadedSkills: [],
      manifestSha256: "a".repeat(64),
      manifestBlobOid: "b".repeat(40),
      systemPromptSha256: "c".repeat(64),
      agentRepo: {
        commit: "d".repeat(40),
        treeOid: "e".repeat(40),
        status: "clean_observed",
        statusSha256: "f".repeat(64),
        revisionStable: true,
      },
    },
    task: {
      id: 5132,
      repo: "/repo",
      title: "t",
      status: "claimed",
      claimedBy: "claimer",
      leaseExpiresAt: "2999-01-01T00:00:00.000000000+00:00",
    },
    dispatch: {
      attemptIndex: 1,
      settlement: "settled",
      objective: "o",
      objectiveSha256: sha256Hex("o"),
      mutationPolicy: "read_only",
      allowedPaths: [],
      forbiddenPaths: [],
      effectCorrelationId: "corr",
      executionTimeoutSeconds: 1,
      startupTimeoutSeconds: 1,
      asc: {
        dispatchId: "d1",
        attemptId: "a1",
        sessionName: "s1",
        sessionFile: "f1",
        status: "done",
        effectDisposition: "settled",
      },
      outputSha256: sha256Hex("out"),
      outputChars: 3,
    },
    observation: {
      parentRepoRoot: "/repo",
      parentHead: "1".repeat(40),
      preStatusSha256: "2".repeat(64),
      postStatusSha256: "2".repeat(64),
      headStable: true,
      noMutationObserved: true,
      boundary: "bounded",
    },
    recordedAt: "2026-08-31T00:00:00.000Z",
  };
}

test("canonical JSON is key-order deterministic and unicode-safe", () => {
  assert.equal(canonicalJsonString({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(
    canonicalJsonString({ a: { z: 1, y: [3, { d: null, c: true }] } }),
    '{"a":{"y":[3,{"c":true,"d":null}],"z":1}}',
  );
  assert.equal(canonicalJsonString({ k: "\u00e9\u4e2d" }), '{"k":"é中"}');
  assert.equal(canonicalJsonString({ u: undefined, v: 1 }), '{"v":1}');
});

test("receipt digest excludes the digest field and detects any mutation", () => {
  const receipt = sampleReceipt();
  const digest = computeDispatchReceiptSha256(receipt);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(
    computeDispatchReceiptSha256({ ...receipt, receiptSha256: digest }),
    digest,
    "digest is independent of its own value",
  );
  const mutated = { ...receipt, task: { ...receipt.task, claimedBy: "other" } };
  assert.notEqual(computeDispatchReceiptSha256(mutated), digest);
});

test("write-once publication lands at 0o400 and verifies on re-read", async () => {
  const dir = mkdtempSync(join(tmpdir(), "receipts-"));
  try {
    const written = await writeImmutableDispatchReceipt(sampleReceipt(), { dir });
    const expectedPath = join(dir, dispatchReceiptFileName("agent-fixture", 5132, 1));
    assert.equal(written.receiptPath, expectedPath);
    assert.ok(existsSync(expectedPath));
    assert.equal(statSync(expectedPath).mode & 0o777, 0o400);
    assert.equal(written.receipt.receiptSha256, written.receiptSha256);
    const readBack = await readDispatchReceipt(expectedPath);
    assert.equal(readBack?.receiptSha256, written.receiptSha256);
    const ledger = await readDispatchAttemptLedger("agent-fixture", 5132, { dir });
    assert.equal(ledger.attempts.length, 1);
    assert.equal(ledger.settled?.receiptPath, expectedPath);
    assert.equal(ledger.nextAttemptIndex, 2);
    const empty = await readDispatchAttemptLedger("agent-fixture", 9999, { dir });
    assert.equal(empty.attempts.length, 0);
    assert.equal(empty.settled, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a published attempt receipt can never be overwritten, even byte-identically", async () => {
  const dir = mkdtempSync(join(tmpdir(), "receipts-"));
  try {
    await writeImmutableDispatchReceipt(sampleReceipt(), { dir });
    await assert.rejects(
      writeImmutableDispatchReceipt(sampleReceipt(), { dir }),
      /dispatch receipt already recorded/,
    );
    const altered = sampleReceipt();
    altered.task.title = "different";
    await assert.rejects(
      writeImmutableDispatchReceipt(altered, { dir }),
      /dispatch receipt already recorded|dispatch receipt collision/,
    );
    // a later attempt index is a new immutable record, not an overwrite
    const second = {
      ...sampleReceipt(),
      dispatch: { ...sampleReceipt().dispatch, attemptIndex: 2, settlement: "not_settled" },
    };
    const written = await writeImmutableDispatchReceipt(second, { dir });
    assert.match(written.receiptPath, /\.02\.dispatch-receipt\.json$/);
    const ledger = await readDispatchAttemptLedger("agent-fixture", 5132, { dir });
    assert.equal(ledger.attempts.length, 2);
    assert.equal(ledger.nextAttemptIndex, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tampered receipts fail verification", async () => {
  const dir = mkdtempSync(join(tmpdir(), "receipts-"));
  const { writeFileSync } = await import("node:fs");
  try {
    const written = await writeImmutableDispatchReceipt(sampleReceipt(), { dir });
    chmodSync(written.receiptPath, 0o644);
    const raw = JSON.parse(readFileSync(written.receiptPath, "utf8"));
    // content mutated but the original digest kept -> digest mismatch
    writeFileSync(
      join(dir, "digest-tampered.json"),
      JSON.stringify({ ...raw, task: { ...raw.task, title: "tampered" } }, null, 2),
    );
    assert.equal(await readDispatchReceipt(join(dir, "digest-tampered.json")), undefined);
    // foreign schema
    writeFileSync(
      join(dir, "schema-tampered.json"),
      JSON.stringify({ ...raw, schema: "other.schema/9" }, null, 2),
    );
    assert.equal(await readDispatchReceipt(join(dir, "schema-tampered.json")), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("renamed attempt receipts fail closed with a ledger-integrity error", async () => {
  const dir = mkdtempSync(join(tmpdir(), "receipts-"));
  const { renameSync } = await import("node:fs");
  try {
    const first = await writeImmutableDispatchReceipt(sampleReceipt(), { dir });
    renameSync(first.receiptPath, join(dir, dispatchReceiptFileName("agent-fixture", 5132, 3)));
    await assert.rejects(
      readDispatchAttemptLedger("agent-fixture", 5132, { dir }),
      /disagrees with its recorded attempt index/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrent publication of one attempt yields exactly one winner", async () => {
  const dir = mkdtempSync(join(tmpdir(), "receipts-"));
  try {
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () => writeImmutableDispatchReceipt(sampleReceipt(), { dir })),
    );
    const fulfilled = attempts.filter((entry) => entry.status === "fulfilled");
    const rejected = attempts.filter((entry) => entry.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 5);
    for (const entry of rejected) {
      assert.match(String(entry.reason), /dispatch receipt already recorded/);
    }
    const ledger = await readDispatchAttemptLedger("agent-fixture", 5132, { dir });
    assert.equal(ledger.attempts.length, 1);
    assert.equal(fulfilled[0].value.receiptSha256, ledger.attempts[0].receipt.receiptSha256);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a receipt file whose contents claim a foreign pair fails the ledger closed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "receipts-"));
  const { renameSync, writeFileSync: writeRaw } = await import("node:fs");
  try {
    const first = await writeImmutableDispatchReceipt(sampleReceipt(), { dir });
    // digest-valid receipt for another pair, renamed into this pair's name space
    const foreign = sampleReceipt();
    foreign.agent.name = "agent-other";
    const { receiptSha256: _drop, ...rest } = foreign;
    void _drop;
    const { computeDispatchReceiptSha256: recompute } = await import("../src/dispatch-receipt.ts");
    const sealed = { ...rest, receiptSha256: recompute(rest) };
    writeRaw(
      join(dir, "ak-5132.agent-fixture.02.dispatch-receipt.json"),
      JSON.stringify(sealed, null, 2),
    );
    void renameSync;
    await assert.rejects(
      readDispatchAttemptLedger("agent-fixture", 5132, { dir }),
      /different \(agent, task\) pair/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unsafe receipt identities fail closed", () => {
  assert.doesNotMatch(dispatchReceiptFileName("agent-ok", 5132, 1), /\//);
  assert.equal(
    dispatchReceiptFileName("agent-ok", 5132, 1),
    "ak-5132.agent-ok.01.dispatch-receipt.json",
  );
  assert.throws(() => dispatchReceiptFileName("agent-ok", 5132, 0), /1\.\.99/);
  assert.throws(() => dispatchReceiptFileName("agent-ok", 5132, 100), /1\.\.99/);
  assert.equal(attemptIndexFromReceiptFileName("ak-5132.agent-ok.01.dispatch-receipt.json"), 1);
  assert.equal(
    attemptIndexFromReceiptFileName("ak-5132.agent-ok.dispatch-receipt.json"),
    undefined,
  );
  assert.equal(attemptIndexFromReceiptFileName("ak-5132.agent-ok.99.dispatch-receipt.json"), 99);
});
