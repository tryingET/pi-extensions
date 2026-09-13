import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluationScenario } from "../scripts/dogfood-evaluation.mjs";
import { summarizeStudy, validateStudy } from "../src/ripwire-evaluation.js";

test(
  "evaluation rejects missing cases, duplicate gold and evidence from failed calls",
  evaluationScenario,
);
test("strong synthetic retrieval still does not authorize automatic adoption", async () => {
  const study = JSON.parse(
    await readFile(new URL("../scripts/fixtures/ripwire-study-v1.json", import.meta.url)),
  );
  const records = study.cases.map((item) => ({
    id: item.id,
    literal_reference: { ok: true, paths: [], durationMs: 2 },
    ripwire: { ok: true, paths: item.gold.map((g) => g.path), durationMs: 1 },
  }));
  const result = summarizeStudy(study, records);
  assert.equal(result.aggregate.ripwire.strictAt10, 1);
  assert.equal(result.adoptionEligible, false);
  assert.equal(result.modelPilot.status, "BLOCKED");
  const forged = structuredClone(study);
  forged.adoptionEligible = true;
  assert.throws(() => validateStudy(forged));
});
