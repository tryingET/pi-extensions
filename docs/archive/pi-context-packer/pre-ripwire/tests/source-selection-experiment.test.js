import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSourceSelectionExperiment,
  experimentInternals,
} from "../src/source-selection-experiment.js";
import {
  ARMS,
  makeCases,
  makeExperiment,
  makeRepository,
  rebuildQuestionIdentity,
  refreshExecutionObservation,
  resignObservation,
  resignReceipt,
} from "./source-selection-experiment-fixtures.test.js";

function assertStructuralFailed(experiment, message = "failure") {
  const arms = evaluateSourceSelectionExperiment(experiment).cases[0].arms;
  assert.equal(arms.structural.available, false, message);
  assert.equal(arms.fusion.available, false, message);
  assert.equal(arms.structural.metrics, null, message);
  assert.equal(arms.fusion.metrics, null, message);
  assert.equal(arms.source_list.available, true, message);
}

test("uses one raw owner artifact and explicit budget for every arm", () => {
  const experiment = makeExperiment({ maxItems: 1, evidencePaths: ["src/beta.js"] });
  const result = evaluateSourceSelectionExperiment(experiment);
  assert.equal(result.rankingOwner, "pi-context-packer");
  assert.equal(result.structuralEvidenceOrderSemantics, "none");
  assert.equal(result.standingDecision, "REJECT_AUTOMATIC_SOURCE_LIST_ADOPTION");
  assert.equal(
    result.candidateUniversePolicy,
    "validated_raw_source_list_v1_artifact_shared_by_all_arms",
  );
  for (const arm of ARMS) {
    assert.equal(result.cases[0].arms[arm].maxItems, 1);
    assert.equal(result.cases[0].arms[arm].candidateCount, 12);
    assert.equal(
      result.cases[0].arms[arm].sourceListArtifactSha256,
      result.repositories[0].rawSourceListArtifactSha256,
    );
  }
  assert.deepEqual(result.cases[0].arms.structural.metrics.selected, ["src/beta.js"]);
  assert.deepEqual(result.cases[0].arms.fusion.metrics.selected, ["src/beta.js"]);
  assert.equal(result.repositories[0].rawEvidenceRetainedInPreparedInput, true);
  assert.equal(result.cases[0].structuralEvidence.rawEvidenceRetainedInPreparedInput, true);
});

test("truth is metrics-only and receipt order has no relevance semantics", () => {
  const experiment = makeExperiment({ evidencePaths: ["src/beta.js", "src/alpha.js"] });
  const first = evaluateSourceSelectionExperiment(experiment);
  experiment.cases[0].truth = ["src/security.js", "src/zeta.js"];
  rebuildQuestionIdentity(experiment.cases[0], experiment.repositories[0]);
  for (const item of experiment.cases) {
    item.structuralEvidence.receipt.evidence.reverse();
    resignReceipt(item.structuralEvidence.receipt);
    refreshExecutionObservation(item);
  }
  const second = evaluateSourceSelectionExperiment(experiment);
  for (const arm of ARMS) {
    assert.deepEqual(
      first.cases[0].arms[arm].metrics.selected,
      second.cases[0].arms[arm].metrics.selected,
    );
  }
  assert.notEqual(first.cases[0].arms.paths.metrics.hits, second.cases[0].arms.paths.metrics.hits);
  assert.deepEqual(
    first.cases[0].structuralEvidence.candidateIds,
    second.cases[0].structuralEvidence.candidateIds,
  );
});

test("fails structural and fusion closed for adversarial SCI v1 receipt gaps", () => {
  const mutations = [
    (item) => {
      item.structuralEvidence.receipt.schema = "invented";
      resignReceipt(item.structuralEvidence.receipt);
    },
    (item) => {
      item.structuralEvidence.receipt.unknown = true;
      resignReceipt(item.structuralEvidence.receipt);
    },
    (item) => {
      item.structuralEvidence.receipt.request.question = "Different question";
      resignReceipt(item.structuralEvidence.receipt, true);
    },
    (item) => {
      item.structuralEvidence.receipt.receiptDigest = `sha256:${"0".repeat(64)}`;
    },
    (item) => {
      item.structuralEvidence.receipt.evidence[0].id = `candidate:sha256:${"0".repeat(64)}`;
      resignReceipt(item.structuralEvidence.receipt);
    },
    (item) => {
      item.structuralEvidence.receipt.evidence[0].provenance.backend = "other";
      resignReceipt(item.structuralEvidence.receipt);
    },
    (item) => {
      item.structuralEvidence.receipt.summary.returnedCount = 2;
      resignReceipt(item.structuralEvidence.receipt);
    },
    (item) => {
      item.structuralEvidence.receipt.summary.totalObservedCount = 2;
      item.structuralEvidence.receipt.summary.capped = true;
      item.structuralEvidence.receipt.summary.complete = false;
      resignReceipt(item.structuralEvidence.receipt);
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const experiment = makeExperiment();
    mutate(experiment.cases[0]);
    assertStructuralFailed(experiment, `receipt mutation ${index}`);
  }
});

test("requires exact expected request and complete external execution observation", () => {
  const request = makeExperiment();
  request.cases[0].structuralEvidence.expectedRequest.seeds[1].value = "$OTHER";
  request.cases[0].structuralEvidence.expectedRequestDigest = experimentInternals.sha256Digest(
    request.cases[0].structuralEvidence.expectedRequest,
  );
  assertStructuralFailed(request, "expected request mismatch");

  const mutations = [
    (observation) => {
      observation.receiptDigest = `sha256:${"0".repeat(64)}`;
    },
    (observation) => {
      observation.sciArtifact.sha256 = "bad";
    },
    (observation) => {
      observation.targetState.cleanAfter = false;
    },
    (observation) => {
      observation.targetState.noIndex = false;
    },
    (observation) => {
      observation.process.processGroupTerminationConfirmed = false;
    },
    (observation) => {
      observation.cleanup.temporaryRootsRemoved = false;
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const experiment = makeExperiment();
    const observation = experiment.cases[0].structuralEvidence.executionObservation;
    mutate(observation);
    resignObservation(observation);
    assertStructuralFailed(experiment, `observation mutation ${index}`);
  }
  const missing = makeExperiment();
  missing.cases[0].structuralEvidence.executionObservation = null;
  assertStructuralFailed(missing, "missing observation");
});

test("derives coverage only from source-list status and rejects projected coverage", () => {
  const asserted = makeExperiment();
  asserted.repositories[0].metadataCoverage = 1;
  assert.throws(() => evaluateSourceSelectionExperiment(asserted), /metadataCoverage is unknown/);
  const low = makeExperiment({
    records: [
      { path: "a.js", status: "present", summary: "alpha" },
      { path: "b.js", status: "absent" },
      { path: "c.js", status: "absent" },
      { path: "d.js", status: "absent" },
    ],
    truths: [
      ["a.js"],
      ["b.js"],
      ["c.js"],
      ["d.js"],
      ["a.js", "b.js"],
      ["a.js", "c.js"],
      ["a.js", "d.js"],
      ["b.js", "c.js"],
      ["b.js", "d.js"],
      ["c.js", "d.js"],
    ],
    evidencePaths: ["a.js"],
  });
  const result = evaluateSourceSelectionExperiment(low);
  assert.equal(result.repositories[0].metadataCoverage, 1 / 4);
  assert.equal(result.cases[0].arms.source_list.eligible, false);
  assert.equal(result.cases[0].arms.fusion.metrics, null);
});

test("rejects mixed source artifacts, stale question identity, case metadata, and too few cases", () => {
  for (const [field, value] of [
    ["repositoryCommit", "b".repeat(40)],
    ["sourceListArtifactSha256", `sha256:${"0".repeat(64)}`],
  ]) {
    const experiment = makeExperiment();
    experiment.cases[0][field] = value;
    assert.throws(() => evaluateSourceSelectionExperiment(experiment), /mixed/);
  }
  for (const field of ["questionId", "intentSignature", "targetBasisDigest"]) {
    const experiment = makeExperiment();
    experiment.cases[0][field] = `sha256:${"0".repeat(64)}`;
    assert.throws(() => evaluateSourceSelectionExperiment(experiment), new RegExp(field));
  }
  const metadata = makeExperiment();
  metadata.cases[0].candidates = [];
  assert.throws(() => evaluateSourceSelectionExperiment(metadata), /candidates is unknown/);
  assert.throws(
    () => evaluateSourceSelectionExperiment(makeExperiment({ caseCount: 9 })),
    /at least 10 cases with distinct intents and truth targets/,
  );
});

test("rejects every declared repository without a complete question cohort", () => {
  const experiment = makeExperiment();
  experiment.repositories.push(makeRepository("unused"));
  assert.throws(
    () => evaluateSourceSelectionExperiment(experiment),
    /unused: eligibility requires at least 10 cases with distinct intents and truth targets/,
  );
});

test("reports true all-four populations, per-repo math, and equal-repository macro", () => {
  const repositoryA = makeRepository("repo-a");
  const repositoryB = makeRepository("repo-b");
  const paths = [
    "src/alpha.js",
    "src/beta.js",
    "src/cache.js",
    "src/config.js",
    "src/exporter.js",
    "src/graph.js",
    "src/parser.js",
    "src/ranking.js",
    "src/receipt.js",
    "src/runner.js",
  ];
  const misses = [
    ["src/security.js"],
    ["src/security.js", "src/zeta.js"],
    ["src/beta.js", "src/security.js"],
    ["src/cache.js", "src/security.js"],
    ["src/config.js", "src/security.js"],
    ["src/exporter.js", "src/security.js"],
    ["src/graph.js", "src/security.js"],
    ["src/parser.js", "src/security.js"],
    ["src/ranking.js", "src/security.js"],
    ["src/receipt.js", "src/security.js"],
  ];
  const experiment = {
    protocol: "pi-context-packer-source-selection-ablation/v2",
    repositories: [repositoryA, repositoryB],
    cases: [
      ...makeCases(repositoryA, 10, {
        maxItems: 1,
        truths: paths.map((itemPath, index) =>
          index === 0 ? ["src/alpha.js"] : ["src/alpha.js", itemPath],
        ),
      }),
      ...makeCases(repositoryB, 10, {
        maxItems: 1,
        truths: misses,
      }),
    ],
  };
  experiment.cases[0].structuralEvidence.executionObservation.cleanup.completed = false;
  resignObservation(experiment.cases[0].structuralEvidence.executionObservation);
  const result = evaluateSourceSelectionExperiment(experiment);
  assert.deepEqual(result.availability.structural, { eligible: 20, available: 19, unavailable: 1 });
  assert.equal(result.pairwise.source_list.denominators.availableCaseCount, 20);
  assert.equal(result.pairwise.structural.denominators.availableCaseCount, 19);
  assert.equal(result.allFour.denominators.availableCaseCount, 19);
  assert.equal(result.allFour.perRepository["repo-a"].caseCount, 9);
  assert.equal(result.allFour.perRepository["repo-b"].caseCount, 10);
  assert.equal(result.allFour.equalRepositoryMacro.arms.paths.macroPrecision, 0.5);
  assert.equal(result.allFour.deltasFromPaths.structural.macroPrecision, 0);
});

test("does not mutate the prepared artifact", () => {
  const experiment = makeExperiment();
  const before = structuredClone(experiment);
  evaluateSourceSelectionExperiment(experiment);
  assert.deepEqual(experiment, before);
});
