import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPERIMENT_PROTOCOL,
  evaluateSourceSelectionExperiment,
  experimentInternals,
  SCI_RECEIPT_PROTOCOL,
} from "../src/source-selection-experiment.js";

const COMMIT = "a".repeat(40);

function makeExperiment(overrides = {}) {
  const candidates = overrides.candidates ?? [
    { path: "src/alpha.js", summary: "ordinary implementation" },
    { path: "src/beta.js", summary: "secondary implementation" },
    { path: "src/zeta.js", summary: "alpha task owner" },
  ];
  const rankings =
    overrides.rankings ?? candidates.map(({ path }, index) => ({ path, rank: index }));
  const cases = Array.from({ length: overrides.caseCount ?? 10 }, (_, index) => {
    const id = `R${index + 1}`;
    const candidateSetHash = experimentInternals.candidateSetHash(candidates);
    const rankingHash = experimentInternals.rankingHash(rankings);
    return {
      id,
      repositoryId: "repo",
      repoCommit: COMMIT,
      question: "Change alpha behavior and focused tests.",
      maxItems: overrides.maxItems ?? 2,
      candidates: structuredClone(candidates),
      truth: overrides.truth ?? ["src/alpha.js"],
      eligibility: overrides.eligibility ?? { sourceList: true, sci: true },
      sci: {
        rankings: structuredClone(rankings),
        receipt: {
          protocol: SCI_RECEIPT_PROTOCOL,
          caseId: id,
          repoCommit: COMMIT,
          candidateSetHash,
          rankingHash,
          executable: "/usr/bin/sci",
          sandboxMode: "read-only",
          noIndex: true,
          ontologyStateBefore: "absent",
          ontologyStateAfter: "absent",
          cleanupCompleted: true,
        },
      },
    };
  });
  return {
    protocol: EXPERIMENT_PROTOCOL,
    repositories: [
      {
        id: "repo",
        metadataCoverage: overrides.metadataCoverage ?? 0.75,
        metadataStalenessSample: { sampledPaths: [candidates[0].path], stalePaths: [] },
      },
    ],
    cases,
  };
}

function reevaluateReceipt(caseDefinition) {
  caseDefinition.sci.receipt.caseId = caseDefinition.id;
  caseDefinition.sci.receipt.candidateSetHash = experimentInternals.candidateSetHash(
    caseDefinition.candidates,
  );
  caseDefinition.sci.receipt.rankingHash = experimentInternals.rankingHash(
    caseDefinition.sci.rankings,
  );
}

test("uses deterministic UTF-8 byte ordering and the explicit budget", () => {
  const experiment = makeExperiment({
    candidates: [{ path: "é.js", summary: "sampled metadata" }, { path: "z.js" }, { path: "a.js" }],
    rankings: [
      { path: "é.js", rank: 0 },
      { path: "z.js", rank: 0 },
      { path: "a.js", rank: 0 },
    ],
    truth: ["a.js"],
    maxItems: 2,
  });
  for (const item of experiment.cases) item.question = "unmatched question";

  const result = evaluateSourceSelectionExperiment(experiment);

  assert.deepEqual(result.cases[0].arms.paths.metrics.selected, ["a.js", "z.js"]);
  assert.equal(result.cases[0].arms.paths.metrics.selected.length, 2);
  assert.deepEqual(result.cases[0].arms.sci.metrics.selected, ["a.js", "z.js"]);
});

test("keeps truth out of all ranking arms", () => {
  const experiment = makeExperiment();
  const first = evaluateSourceSelectionExperiment(experiment);
  experiment.cases.forEach((item) => {
    item.truth = ["src/zeta.js"];
  });
  const second = evaluateSourceSelectionExperiment(experiment);

  for (const arm of ["paths", "source_list", "sci", "fusion"]) {
    assert.deepEqual(
      first.cases[0].arms[arm].metrics.selected,
      second.cases[0].arms[arm].metrics.selected,
    );
  }
  assert.notEqual(first.cases[0].arms.paths.metrics.hits, second.cases[0].arms.paths.metrics.hits);
});

test("SCI rank has precedence and fusion uses metadata/path only as a tie-break", () => {
  const experiment = makeExperiment({
    rankings: [
      { path: "src/alpha.js", rank: 1 },
      { path: "src/beta.js", rank: 0 },
      { path: "src/zeta.js", rank: 0 },
    ],
  });

  const result = evaluateSourceSelectionExperiment(experiment);

  assert.deepEqual(result.cases[0].arms.sci.metrics.selected, ["src/beta.js", "src/zeta.js"]);
  assert.deepEqual(result.cases[0].arms.fusion.metrics.selected, ["src/zeta.js", "src/beta.js"]);
  assert.equal(result.cases[0].arms.fusion.metrics.selected.includes("src/alpha.js"), false);
});

test("fails SCI and fusion closed for every unsafe receipt condition", () => {
  const mutations = {
    protocol_mismatch(receipt) {
      receipt.protocol = "wrong";
    },
    case_id_mismatch(receipt) {
      receipt.caseId = "wrong";
    },
    repo_commit_mismatch(receipt) {
      receipt.repoCommit = "b".repeat(40);
    },
    candidate_set_hash_mismatch(receipt) {
      receipt.candidateSetHash = "0".repeat(64);
    },
    ranking_hash_mismatch(receipt) {
      receipt.rankingHash = "0".repeat(64);
    },
    untrusted_executable(receipt) {
      receipt.executable = "/tmp/sci";
    },
    sandbox_not_read_only(receipt) {
      receipt.sandboxMode = "writable";
    },
    indexing_not_disabled(receipt) {
      receipt.noIndex = false;
    },
    ontology_absence_not_proven(receipt) {
      receipt.ontologyStateAfter = "present";
    },
    cleanup_not_completed(receipt) {
      receipt.cleanupCompleted = false;
    },
  };

  for (const [failure, mutate] of Object.entries(mutations)) {
    const experiment = makeExperiment();
    mutate(experiment.cases[0].sci.receipt);
    const arm = evaluateSourceSelectionExperiment(experiment).cases[0].arms;
    assert.equal(arm.sci.available, false, failure);
    assert.equal(arm.fusion.available, false, failure);
    assert.equal(arm.sci.metrics, null, failure);
    assert.equal(arm.fusion.metrics, null, failure);
    assert.ok(arm.sci.failures.includes(failure), failure);
    assert.equal(arm.source_list.available, true, failure);
  }
});

test("rejects malformed or non-canonical owner rankings without inferring SCI semantics", () => {
  const experiment = makeExperiment();
  experiment.cases[0].sci.rankings.pop();
  experiment.cases[0].sci.receipt.rankingHash = experimentInternals.rankingHash(
    experiment.cases[0].sci.rankings,
  );

  const arms = evaluateSourceSelectionExperiment(experiment).cases[0].arms;

  assert.equal(arms.sci.available, false);
  assert.ok(arms.sci.failures.includes("rankings_not_canonical_candidate_set"));
  assert.equal(arms.fusion.available, false);
});

test("fails closed rather than throwing for structurally malformed rankings", () => {
  const experiment = makeExperiment();
  experiment.cases[0].sci.rankings[0] = null;

  const arms = evaluateSourceSelectionExperiment(experiment).cases[0].arms;

  assert.equal(arms.sci.available, false);
  assert.ok(arms.sci.failures.includes("rankings_malformed"));
  assert.equal(arms.fusion.available, false);
});

test("reports eligible availability denominators and aggregates paired available cases only", () => {
  const experiment = makeExperiment({ caseCount: 11 });
  experiment.cases[0].sci.receipt.cleanupCompleted = false;
  experiment.cases[1].eligibility = { sourceList: false, sci: true };

  const result = evaluateSourceSelectionExperiment(experiment);

  assert.deepEqual(result.availability.source_list, { eligible: 10, available: 10 });
  assert.deepEqual(result.availability.sci, { eligible: 11, available: 10 });
  assert.deepEqual(result.availability.fusion, { eligible: 10, available: 9 });
  assert.equal(result.paired.source_list.pairedCaseCount, 10);
  assert.equal(result.paired.sci.pairedCaseCount, 10);
  assert.equal(result.paired.fusion.pairedCaseCount, 9);
  assert.equal(result.paired.allFourCaseIds.length, 9);
  assert.equal(result.repositories[0].caseCount, 11);
  assert.deepEqual(result.repositories[0].eligibleCases, {
    sourceList: 10,
    sci: 11,
    fusion: 10,
  });
});

test("does not mutate prepared artifacts", () => {
  const experiment = makeExperiment();
  const before = structuredClone(experiment);

  evaluateSourceSelectionExperiment(experiment);

  assert.deepEqual(experiment, before);
});

test("enforces preregistered eligibility, question count, coverage, and budget invariants", () => {
  const tooFew = makeExperiment();
  tooFew.cases.pop();
  assert.throws(() => evaluateSourceSelectionExperiment(tooFew), /at least 10 questions/);

  const lowCoverage = makeExperiment({ metadataCoverage: 0.59 });
  assert.throws(() => evaluateSourceSelectionExperiment(lowCoverage), />=60%/);

  const badBudget = makeExperiment();
  badBudget.cases[0].maxItems = 4;
  assert.throws(() => evaluateSourceSelectionExperiment(badBudget), /maxItems/);

  const mixedEligibility = makeExperiment();
  mixedEligibility.cases[0].eligibility = { sourceList: true, sci: false };
  mixedEligibility.cases.slice(1).forEach((item) => {
    item.eligibility = { sourceList: false, sci: true };
  });
  assert.throws(
    () => evaluateSourceSelectionExperiment(mixedEligibility),
    /sourceList eligibility requires at least 10/,
  );

  const unrelatedStaleness = makeExperiment();
  unrelatedStaleness.repositories[0].metadataStalenessSample.sampledPaths = ["src/unrelated.js"];
  assert.throws(
    () => evaluateSourceSelectionExperiment(unrelatedStaleness),
    /metadata-bearing candidates/,
  );

  const duplicateStaleness = makeExperiment();
  duplicateStaleness.repositories[0].metadataStalenessSample.sampledPaths = [
    "src/alpha.js",
    "src/alpha.js",
  ];
  assert.throws(
    () => evaluateSourceSelectionExperiment(duplicateStaleness),
    /sampledPaths must be unique/,
  );
});

test("rejects non-canonical and cross-platform-ambiguous repository paths", () => {
  for (const candidatePath of [
    "..\\escape",
    "C:\\Windows\\win.ini",
    "C:/Windows/win.ini",
    "C:relative.js",
    "C:",
    "z:src/a.js",
    "./src/a.js",
    "src//a.js",
    "src/a.js/",
    "src/./a.js",
    "src/../a.js",
  ]) {
    const experiment = makeExperiment();
    experiment.cases[0].candidates[0].path = candidatePath;
    assert.throws(
      () => evaluateSourceSelectionExperiment(experiment),
      /candidate path must be canonical and repository-relative/,
      candidatePath,
    );
  }
});

test("rejects declared repositories that contribute no question cohort", () => {
  const experiment = makeExperiment();
  experiment.repositories.push({
    id: "unused",
    metadataCoverage: 0.9,
    metadataStalenessSample: { sampledPaths: ["src/alpha.js"], stalePaths: [] },
  });
  assert.throws(
    () => evaluateSourceSelectionExperiment(experiment),
    /unused: every declared repository requires at least 10 questions/,
  );
});

test("binds the receipt to case, commit, canonical candidate set, protocol, and owner ranking", () => {
  const experiment = makeExperiment();
  experiment.cases[0].candidates[0].path = "src/renamed.js";
  experiment.cases[0].truth = ["src/renamed.js"];
  experiment.cases[0].sci.rankings[0].path = "src/renamed.js";
  reevaluateReceipt(experiment.cases[0]);

  const result = evaluateSourceSelectionExperiment(experiment);

  assert.equal(result.cases[0].arms.sci.available, true);
  assert.equal(result.cases[0].candidateSetHash, experiment.cases[0].sci.receipt.candidateSetHash);
});
