import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSourceSelectionExperiment,
  experimentInternals,
} from "../src/source-selection-experiment.js";
import { validateReceipt } from "../src/source-selection-experiment-receipt.js";
import {
  makeExperiment,
  makeReceipt,
  refreshExecutionObservation,
  resignObservation,
  resignReceipt,
} from "./source-selection-experiment-fixtures.test.js";

function assertUnavailable(experiment, label) {
  const result = evaluateSourceSelectionExperiment(experiment).cases[0];
  assert.equal(result.arms.structural.available, false, label);
  assert.equal(result.arms.structural.metrics, null, label);
  assert.equal(result.arms.fusion.available, false, label);
}

test("retains and binds raw structural request, receipt, stdout, transcript, process, and state", () => {
  const experiment = makeExperiment();
  const result = evaluateSourceSelectionExperiment(experiment).cases[0].structuralEvidence;
  const raw = experiment.cases[0].structuralEvidence.executionObservation.rawEvidence;
  assert.equal(result.rawEvidenceRetainedInPreparedInput, true);
  assert.equal(result.rawRequestSha256, raw.requestSha256);
  assert.equal(result.rawReceiptSha256, raw.receiptSha256);
  assert.equal(result.transcriptSha256, raw.transcriptSha256);
});

test("rejects arbitrary exporter argv and unrelated request or raw evidence hashes", () => {
  const mutations = [
    (observation) => {
      observation.command = [observation.sciArtifact.path, "--version"];
      observation.commandDigest = experimentInternals.sha256Digest(observation.command);
    },
    (observation) => {
      observation.requestArtifact.sha256 = experimentInternals.sha256Raw("unrelated request");
    },
    (observation) => {
      observation.rawEvidence.requestSha256 = experimentInternals.sha256Raw("unrelated request");
    },
    (observation) => {
      observation.rawEvidence.receiptSha256 = experimentInternals.sha256Raw("unrelated receipt");
    },
    (observation) => {
      observation.rawEvidence.stdout = "{}\n";
      observation.rawEvidence.stdoutSha256 = experimentInternals.sha256Raw("{}\n");
    },
    (observation) => {
      observation.rawEvidence.transcriptSha256 =
        experimentInternals.sha256Raw("unrelated transcript");
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const experiment = makeExperiment();
    const observation = experiment.cases[0].structuralEvidence.executionObservation;
    mutate(observation);
    resignObservation(observation);
    assertUnavailable(experiment, `raw hash/command mutation ${index}`);
  }
});

test("rejects retained raw parsed values that disagree with structured process or state", () => {
  const mutations = [
    (observation) => {
      const value = { ...observation.process, receiptCount: 2 };
      observation.rawEvidence.processJson = `${JSON.stringify(value)}\n`;
      observation.rawEvidence.processSha256 = experimentInternals.sha256Raw(
        observation.rawEvidence.processJson,
      );
    },
    (observation) => {
      const value = { ...observation.targetState, cleanBefore: false };
      observation.rawEvidence.stateJson = `${JSON.stringify(value)}\n`;
      observation.rawEvidence.stateSha256 = experimentInternals.sha256Raw(
        observation.rawEvidence.stateJson,
      );
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const experiment = makeExperiment();
    const observation = experiment.cases[0].structuralEvidence.executionObservation;
    mutate(observation);
    resignObservation(observation);
    assertUnavailable(experiment, `raw parsed-value mutation ${index}`);
  }
});

test("enforces the exact SCI Phase-B operation and seed producer grammar", () => {
  const mutations = [
    (request) => {
      request.operations = ["find_definition"];
    },
    (request) => {
      request.seeds.push({ id: "seed:extra", kind: "text", value: "extra" });
    },
    (request) => {
      request.seeds.push({ id: "seed:symbol", kind: "symbol", value: "Alpha" });
    },
    (request) => {
      request.seeds.find(({ id }) => id === "seed:language").kind = "path";
    },
    (request) => {
      request.seeds = request.seeds.filter(({ id }) => id !== "seed:pattern");
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const experiment = makeExperiment();
    const bundle = experiment.cases[0].structuralEvidence;
    mutate(bundle.expectedRequest);
    bundle.expectedRequestDigest = experimentInternals.sha256Digest(bundle.expectedRequest);
    assertUnavailable(experiment, `Phase-B grammar mutation ${index}`);
  }
});

test("matches SCI stableAcrossExecution cross-field behavior on differential fixtures", () => {
  const rejected = makeReceipt("Stable differential question");
  rejected.repository.observedFingerprint = `git:${"b".repeat(40)}`;
  rejected.summary.complete = false;
  resignReceipt(rejected);
  assert.throws(
    () => validateReceipt(rejected),
    /stableAcrossExecution requires matching base and observed fingerprints/,
  );

  const accepted = makeReceipt("Drift differential question");
  accepted.repository.stableAcrossExecution = false;
  accepted.summary.complete = false;
  resignReceipt(accepted);
  assert.equal(validateReceipt(accepted), accepted);
});

test("rejects graph self-edges so repeated self evidence cannot inflate ranking", () => {
  const receipt = makeReceipt("Graph self-edge question");
  receipt.request.operations = ["graph_expand"];
  receipt.requestDigest = experimentInternals.sha256Digest(receipt.request);
  const identity = {
    path: "src/alpha.js",
    kind: "graph_edge",
    symbol: "Alpha",
    relatedPath: "src/alpha.js",
    relatedSymbol: "Alpha",
    edgeType: "semantic",
  };
  receipt.evidence = [
    {
      id: `candidate:${experimentInternals.sha256Digest(identity)}`,
      identity,
      operation: "graph_expand",
      snippet: "self",
      byteCount: 4,
      provenance: { backend: "ast-grep", workflow: "structural-evidence-export-v1" },
    },
  ];
  receipt.summary.returnedCount = 1;
  receipt.summary.totalObservedCount = 1;
  receipt.summary.evidenceBytes = 4;
  resignReceipt(receipt);
  assert.throws(() => validateReceipt(receipt), /graph self-edges are rejected/);

  const experiment = makeExperiment();
  experiment.cases[0].structuralEvidence.receipt = receipt;
  refreshExecutionObservation(experiment.cases[0]);
  assertUnavailable(experiment, "self edge cannot enter ranking");
});
