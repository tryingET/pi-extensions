/**
 * summary: "Contract tests for the frozen v3 positive-evidence treatment."
 * read_when:
 *   - "Changing the v3 treatment threshold, underfill behavior, or diagnostics."
 */

import assert from "node:assert/strict";
import test from "node:test";

import { metrics, selectArm } from "../../../src/source-selection-experiment-ranking.js";
import {
  POSITIVE_EVIDENCE_THRESHOLD,
  positiveEvidenceDiagnostics,
  selectPositiveEvidence,
} from "./ranking-treatment.mjs";

function row(path, pathScore, metadataScore) {
  return {
    path,
    pathScore,
    metadataScore,
    directEvidenceCount: 0,
    relatedEvidenceCount: 0,
    structuralKindCounts: {},
  };
}

test("threshold is frozen at one positive path-or-metadata evidence point", () => {
  assert.equal(POSITIVE_EVIDENCE_THRESHOLD, 1);
});

test("positive treatment preserves existing source-list ordering without zero-evidence backfill", () => {
  const rows = [
    row("src/zero-a.js", 0, 0),
    row("src/metadata.js", 0, 1),
    row("src/path.js", 2, 0),
    row("src/both.js", 2, 2),
    row("src/zero-b.js", 0, 0),
  ];
  const fullOrder = selectArm(rows, "source_list", rows.length);
  const expected = fullOrder.filter((path) => !path.includes("zero"));
  assert.deepEqual(selectPositiveEvidence(rows, 5), expected);
  assert.deepEqual(selectPositiveEvidence(rows, 2), expected.slice(0, 2));
});

test("positive treatment permits underfill and complete abstention", () => {
  const onePositive = [row("a.js", 0, 0), row("b.js", 0, 1), row("c.js", 0, 0)];
  assert.deepEqual(selectPositiveEvidence(onePositive, 3), ["b.js"]);
  assert.deepEqual(selectPositiveEvidence(onePositive, 0), []);
  assert.deepEqual(selectPositiveEvidence([row("a.js", 0, 0), row("b.js", 0, 0)], 2), []);
});

test("truth is applied only after selection and cannot change selected paths", () => {
  const rows = [row("src/a.js", 2, 0), row("src/b.js", 0, 1), row("src/c.js", 0, 0)];
  const selectedBeforeTruth = selectPositiveEvidence(rows, 3);
  const firstMetrics = metrics(selectedBeforeTruth, ["src/a.js"]);
  const secondMetrics = metrics(selectedBeforeTruth, ["src/b.js", "src/c.js"]);
  assert.deepEqual(firstMetrics.selected, selectedBeforeTruth);
  assert.deepEqual(secondMetrics.selected, selectedBeforeTruth);
  assert.deepEqual(selectPositiveEvidence(rows, 3), selectedBeforeTruth);
});

test("diagnostics expose underfill and reject zero-evidence selections", () => {
  const rows = [row("src/a.js", 2, 0), row("src/b.js", 0, 1), row("src/c.js", 0, 0)];
  const selected = selectPositiveEvidence(rows, 3);
  assert.deepEqual(positiveEvidenceDiagnostics(rows, selected, 3), {
    threshold: 1,
    candidateCount: 3,
    positiveEvidenceCandidateCount: 2,
    selectedCount: 2,
    unusedCapacity: 1,
    underfilled: true,
    abstained: false,
    zeroEvidenceSelectedCount: 0,
  });
  assert.equal(positiveEvidenceDiagnostics(rows, ["src/c.js"], 3).zeroEvidenceSelectedCount, 1);
});

test("treatment fails closed on malformed rows and out-of-universe selections", () => {
  assert.throws(() => selectPositiveEvidence([{ path: "x", pathScore: -1, metadataScore: 0 }], 1));
  assert.throws(() => selectPositiveEvidence([row("x", 1, 0), row("x", 0, 1)], 1));
  assert.throws(() => positiveEvidenceDiagnostics([row("x", 1, 0)], ["missing"], 1));
});
