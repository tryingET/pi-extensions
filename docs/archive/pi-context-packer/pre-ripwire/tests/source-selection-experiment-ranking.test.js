import assert from "node:assert/strict";
import test from "node:test";

import { buildRankingRows, selectArm } from "../src/source-selection-experiment-ranking.js";

const emptyKinds = () => ({ definition: 0, reference: 0, match: 0, graph_node: 0, graph_edge: 0 });

test("structural tie-break uses context-packer's preregistered evidence-kind counts", () => {
  const repository = {
    records: [
      { path: "src/alpha.js", metadataStatus: "absent", readWhen: [] },
      { path: "src/beta.js", metadataStatus: "absent", readWhen: [] },
    ],
  };
  const alphaKinds = emptyKinds();
  alphaKinds.match = 1;
  const betaKinds = emptyKinds();
  betaKinds.definition = 1;
  const structuralEvidence = {
    stats: new Map([
      ["src/alpha.js", { directCount: 1, relatedCount: 0, kindCounts: alphaKinds }],
      ["src/beta.js", { directCount: 1, relatedCount: 0, kindCounts: betaKinds }],
    ]),
  };
  const rows = buildRankingRows({ question: "unmatched" }, repository, structuralEvidence);
  assert.deepEqual(selectArm(rows, "structural", 1), ["src/beta.js"]);
  assert.deepEqual(selectArm(rows, "fusion", 1), ["src/beta.js"]);
});
