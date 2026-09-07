#!/usr/bin/env node
/** Recompute derived classification fields without invoking either producer or ranking. */

import { readFile, rename, writeFile } from "node:fs/promises";

import { OBSERVATIONS, RESULT } from "./experiment-config.mjs";
import { exists, fail, rawDigest, stableJson } from "./experiment-process.mjs";

if (!(await exists(OBSERVATIONS))) fail(`missing observation artifact: ${OBSERVATIONS}`);
if (await exists(RESULT)) fail(`ranking result must remain absent: ${RESULT}`);
const value = JSON.parse(await readFile(OBSERVATIONS, "utf8"));
if (value.schema !== "pi-context-packer.source_list_cost_observations.v3") {
  fail("unexpected observation schema");
}
let falseDecisionCount = 0;
for (const repository of value.repositories) {
  if (!Array.isArray(repository.pairs) || repository.pairs.length !== 5) {
    fail(`${repository.id}: expected exactly five retained pairs`);
  }
  for (const pair of repository.pairs) {
    const decision = pair.probe?.probeClassification?.decision;
    if (!new Set(["eligible", "ineligible", "unknown"]).has(decision)) {
      fail(`${repository.id}: invalid probe decision`);
    }
    pair.classificationCorrect = decision === "unknown" ? null : decision === pair.groundTruth;
    if (pair.classificationCorrect === false) falseDecisionCount += 1;
  }
  repository.statistics.allClassificationsCorrect = repository.pairs.every(
    ({ classificationCorrect }) => classificationCorrect !== false,
  );
  repository.statistics.conclusive = repository.pairs.every(
    ({ probe }) => probe.probeClassification.decision !== "unknown",
  );
  repository.statistics.firstRunPair = repository.pairs[0];
}
value.aggregates.falseDecisionCount = falseDecisionCount;
value.aggregates.allProbeDecisionsConclusive = value.repositories.every(
  ({ statistics }) => statistics.conclusive,
);
value.aggregates.gates.zeroFalseDecisions = falseDecisionCount === 0;
value.aggregates.gates.allDeclaredRepositoriesConclusive =
  value.aggregates.allProbeDecisionsConclusive;
value.derivationCorrection = {
  applied: true,
  scope:
    "Unknown probe classifications are inconclusive, not false-eligible or false-ineligible decisions.",
  producerReinvoked: false,
  rankingExecuted: false,
};
const output = stableJson(value);
const temporary = `${OBSERVATIONS}.derived.tmp`;
await writeFile(temporary, output, { flag: "wx", mode: 0o644 });
await rename(temporary, OBSERVATIONS);
process.stdout.write(
  stableJson({
    status: "derived-fields-recomputed",
    falseDecisionCount,
    allProbeDecisionsConclusive: value.aggregates.allProbeDecisionsConclusive,
    producerReinvoked: false,
    rankingExecuted: false,
    sha256: rawDigest(output),
  }),
);
