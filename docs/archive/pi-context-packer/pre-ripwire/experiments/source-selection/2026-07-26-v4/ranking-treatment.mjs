/**
 * summary: "Frozen v3 positive-evidence source-list selection treatment."
 * read_when:
 *   - "Reviewing the sole primary ranking revision in the v3 source-selection experiment."
 */

import { selectArm } from "../../../src/source-selection-experiment-ranking.js";

export const POSITIVE_EVIDENCE_THRESHOLD = 1;

function assertRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError("ranking rows must be an array");
  const paths = new Set();
  for (const [index, row] of rows.entries()) {
    if (typeof row?.path !== "string" || row.path.length === 0) {
      throw new TypeError(`ranking row ${index} requires a non-empty path`);
    }
    if (paths.has(row.path)) throw new TypeError(`duplicate ranking path: ${row.path}`);
    paths.add(row.path);
    for (const field of ["pathScore", "metadataScore"]) {
      if (!Number.isInteger(row[field]) || row[field] < 0) {
        throw new TypeError(`ranking row ${index} ${field} must be a non-negative integer`);
      }
    }
  }
}

function assertMaxItems(maxItems) {
  if (!Number.isSafeInteger(maxItems) || maxItems < 0) {
    throw new TypeError("maxItems must be a non-negative safe integer");
  }
}

export function positiveEvidence(row) {
  return row.pathScore + row.metadataScore;
}

export function selectPositiveEvidence(rows, maxItems) {
  assertRows(rows);
  assertMaxItems(maxItems);
  if (maxItems === 0 || rows.length === 0) return [];

  const rowsByPath = new Map(rows.map((row) => [row.path, row]));
  return selectArm(rows, "source_list", rows.length)
    .filter((path) => positiveEvidence(rowsByPath.get(path)) >= POSITIVE_EVIDENCE_THRESHOLD)
    .slice(0, maxItems);
}

export function positiveEvidenceDiagnostics(rows, selected, maxItems) {
  assertRows(rows);
  assertMaxItems(maxItems);
  if (!Array.isArray(selected) || selected.some((path) => typeof path !== "string")) {
    throw new TypeError("selected paths must be an array of strings");
  }
  const rowsByPath = new Map(rows.map((row) => [row.path, row]));
  for (const path of selected) {
    if (!rowsByPath.has(path))
      throw new TypeError(`selected path is outside the universe: ${path}`);
  }
  const positiveEvidenceCandidateCount = rows.filter(
    (row) => positiveEvidence(row) >= POSITIVE_EVIDENCE_THRESHOLD,
  ).length;
  const zeroEvidenceSelectedCount = selected.filter(
    (path) => positiveEvidence(rowsByPath.get(path)) < POSITIVE_EVIDENCE_THRESHOLD,
  ).length;
  return {
    threshold: POSITIVE_EVIDENCE_THRESHOLD,
    candidateCount: rows.length,
    positiveEvidenceCandidateCount,
    selectedCount: selected.length,
    unusedCapacity: Math.max(0, maxItems - selected.length),
    underfilled: selected.length < Math.min(maxItems, rows.length),
    abstained: selected.length === 0,
    zeroEvidenceSelectedCount,
  };
}
