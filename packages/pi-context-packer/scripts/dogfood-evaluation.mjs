/** Exercise the installed evaluator contract; this is not the 30-case external run. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  literalReference,
  retrievalMetrics,
  summarizeStudy,
  validateStudy,
} from "../src/ripwire-evaluation.js";
export async function evaluationScenario() {
  const study = JSON.parse(
    await readFile(new URL("./fixtures/ripwire-study-v1.json", import.meta.url), "utf8"),
  );
  validateStudy(study);
  const records = study.cases.map((item) => ({
    id: item.id,
    literal_reference: { ok: true, paths: item.gold.map((g) => g.path), durationMs: 1 },
    ripwire: { ok: false, paths: item.gold.map((g) => g.path), durationMs: 1 },
  }));
  const result = summarizeStudy(study, records);
  assert.equal(
    result.aggregate.ripwire.strictAt10,
    0,
    "failed calls cannot contribute usable evidence",
  );
  assert.equal(result.aggregate.ripwire.executionErrors, 30);
  assert.equal(result.adoptionEligible, false, "retrieval metrics never prove agent-task adoption");
  assert.throws(() => summarizeStudy(study, records.slice(1)));
  const duplicate = structuredClone(study);
  duplicate.cases[1] = { ...duplicate.cases[0], id: duplicate.cases[1].id };
  assert.throws(() => validateStudy(duplicate));
  assert.deepEqual(retrievalMetrics(["a.js", "b.js", "a.js"], ["a.js", "b.js"]), {
    strict: true,
    any: true,
    recall: 1,
    reciprocalRank: 1,
  });
  assert.deepEqual(
    literalReference(
      [
        { path: "b.js", content: "cache read" },
        { path: "a.js", content: "cache read" },
      ],
      "cache read",
    ),
    ["a.js", "b.js"],
  );
  return {
    gate: "RW-08",
    assertions: 7,
    syntheticContractChecksOnly: true,
    modelTaskBenchmark: false,
    adoptionEligible: false,
  };
}
