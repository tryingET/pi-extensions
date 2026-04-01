import assert from "node:assert/strict";
import test from "node:test";
import {
  listExecutionSeamCaseIds,
  loadExecutionSeamCase,
} from "../../../governance/execution-seam-cases/index.mjs";

test("execution seam casebook files are loadable and minimally well-shaped", () => {
  const caseIds = listExecutionSeamCaseIds();

  assert.ok(caseIds.length > 0, "expected at least one execution seam case");

  for (const caseId of caseIds) {
    const seamCase = loadExecutionSeamCase(caseId);

    assert.equal(seamCase.id, caseId);
    assert.equal(typeof seamCase.title, "string");
    assert.ok(seamCase.title.length > 0, `case '${caseId}' missing title`);
    assert.ok(
      seamCase.kind === "runtime-result" || seamCase.kind === "packaging",
      `case '${caseId}' has unsupported kind '${String(seamCase.kind)}'`,
    );

    if (seamCase.kind === "runtime-result") {
      assert.equal(typeof seamCase.dispatchResult?.ok, "boolean");
      assert.equal(typeof seamCase.dispatchResult?.text, "string");
      assert.equal(typeof seamCase.dispatchResult?.details?.status, "string");
      assert.equal(typeof seamCase.dispatchResult?.details?.failureKind, "string");
      assert.equal(typeof seamCase.dispatchResult?.details?.exitCode, "number");
      assert.equal(typeof seamCase.dispatchResult?.details?.elapsed, "number");
      assert.equal(
        seamCase.dispatchResult?.details?.executionState?.transport?.kind,
        "transport",
        `case '${caseId}' missing transport execution state`,
      );
      assert.equal(typeof seamCase.dispatchResult?.details?.displayOutput, "string");
      assert.equal(typeof seamCase.expected?.executionLikeOutput, "string");
      assert.equal(typeof seamCase.expected?.executionLikeStatus, "string");
      assert.equal(typeof seamCase.expected?.failureKind, "string");
      assert.equal(
        seamCase.dispatchResult?.details?.displayOutput,
        seamCase.expected?.executionLikeOutput,
      );
      continue;
    }

    assert.ok(
      Array.isArray(seamCase.expectedBundledDependencies),
      `case '${caseId}' missing expectedBundledDependencies`,
    );
    assert.ok(
      Array.isArray(seamCase.expectedImportFiles),
      `case '${caseId}' missing expectedImportFiles`,
    );
    assert.ok(
      seamCase.expectedBundledDependencies.length > 0,
      `case '${caseId}' expectedBundledDependencies should not be empty`,
    );
    assert.ok(
      seamCase.expectedImportFiles.length > 0,
      `case '${caseId}' expectedImportFiles should not be empty`,
    );
  }
});
