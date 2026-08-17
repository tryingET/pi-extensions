/**
summary: "Tests bounded P1 packet assembly and managed-block priority."
read_when:
  - "Changing final compaction packet budgeting or required P1 blocks."
*/
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildManagedBlock } from "../extensions/session-compaction/managed-block-codec.js";
import {
  repairAndValidateSummary,
  validateCompactionSummary,
} from "../extensions/session-compaction/summary-validator.js";

const BODY = [
  "## Self-contained continuation snapshot",
  "- Current objective and verified state.",
  "",
  "## Next action",
  "1. Expand E:latest when exact history is needed.",
].join("\n");

function block(type, heading, text, required, priority) {
  const built = buildManagedBlock({
    type,
    heading,
    records: [{ id: `${type}-1`, text, timestamp: 1, priority: 100, pinned: required }],
    maxItems: 1,
    maxChars: 8_000,
    maxRecordChars: 6_000,
  });
  return { ...built, required, priority };
}

describe("P1 bounded summary assembly", () => {
  it("keeps orientation plus required continuity and evidence blocks ahead of optional bulk", () => {
    const result = repairAndValidateSummary({
      modelBody: BODY,
      fallbackBody: BODY,
      maxChars: 2_500,
      managedBlocks: [
        block("file-activity", "## Observed file activity", "x".repeat(2_000), false, 10),
        block(
          "evidence-anchors",
          "## Evidence anchors",
          "ref=E:latest | exact current intent",
          true,
          115,
        ),
        block(
          "continuity-state",
          "## Structured continuity state",
          "status=current | intent=finish P1",
          true,
          120,
        ),
      ],
    });
    assert.equal(result.validation.ok, true, result.validation.errors.join("; "));
    assert.ok(result.summary.length <= 2_500);
    assert.match(result.summary, /Self-contained continuation snapshot/u);
    assert.match(result.summary, /Next action/u);
    assert.deepEqual(result.selectedManagedBlocks.slice(0, 2), [
      "continuity-state",
      "evidence-anchors",
    ]);
    assert.ok(result.omittedManagedBlocks.includes("file-activity"));
  });

  it("repairs an invalid model body with the deterministic body and preserves the hard cap", () => {
    const result = repairAndValidateSummary({
      modelBody: "not a valid continuation packet",
      fallbackBody: BODY,
      maxChars: 1_800,
      managedBlocks: [
        block(
          "continuity-state",
          "## Structured continuity state",
          "status=current | intent=continue",
          true,
          120,
        ),
      ],
    });
    assert.equal(result.validation.ok, true, result.validation.errors.join("; "));
    assert.ok(result.summary.length <= 1_800);
    assert.notEqual(result.mode, "model");
    assert.equal(validateCompactionSummary(result.summary, { maxChars: 1_800 }).ok, true);
  });
});
