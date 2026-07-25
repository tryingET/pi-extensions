import assert from "node:assert/strict";
import test from "node:test";

import { evaluateSourceSelectionExperiment } from "../src/source-selection-experiment.js";
import {
  makeExperiment,
  rebuildQuestionIdentity,
} from "./source-selection-experiment-fixtures.test.js";

function replaceQuestion(experiment, index, question) {
  const item = experiment.cases[index];
  item.question = question;
  item.structuralEvidence.expectedRequest.question = question;
  item.structuralEvidence.receipt.request.question = question;
  rebuildQuestionIdentity(item, experiment.repositories[0]);
}

function replaceTruth(experiment, index, truth) {
  experiment.cases[index].truth = truth;
  rebuildQuestionIdentity(experiment.cases[index], experiment.repositories[0]);
}

test("rejects alphabetic-label clones that reuse one truth target", () => {
  const experiment = makeExperiment();
  const labels = [
    "alpha",
    "bravo",
    "charlie",
    "delta",
    "echo",
    "foxtrot",
    "golf",
    "hotel",
    "india",
    "juliet",
  ];
  for (const [index, label] of labels.entries()) {
    replaceQuestion(experiment, index, `Case ${label} inspect shared request behavior.`);
    replaceTruth(experiment, index, ["src/alpha.js"]);
  }
  assert.equal(new Set(experiment.cases.map(({ intentSignature }) => intentSignature)).size, 10);
  assert.equal(new Set(experiment.cases.map(({ targetBasisDigest }) => targetBasisDigest)).size, 1);
  assert.throws(
    () => evaluateSourceSelectionExperiment(experiment),
    /duplicate truth target basis/,
  );
});

test("rejects numeric-label and token-equivalent intent clones", () => {
  const numeric = makeExperiment();
  const original = numeric.cases[0].question;
  replaceQuestion(numeric, 1, `CASE 99 ${original} 123`);
  assert.throws(
    () => evaluateSourceSelectionExperiment(numeric),
    /duplicate normalized intent signature/,
  );

  const tokenEquivalent = makeExperiment();
  replaceQuestion(tokenEquivalent, 0, "Investigate alpha bravo maintenance behavior.");
  replaceQuestion(tokenEquivalent, 1, "BEHAVIOR, maintenance investigate BRAVO alpha alpha!");
  assert.throws(
    () => evaluateSourceSelectionExperiment(tokenEquivalent),
    /duplicate normalized intent signature/,
  );
});

test("rejects duplicate truth sets despite cosmetically distinct intents", () => {
  const experiment = makeExperiment();
  assert.notEqual(experiment.cases[0].intentSignature, experiment.cases[1].intentSignature);
  replaceTruth(experiment, 1, [...experiment.cases[0].truth]);
  assert.throws(
    () => evaluateSourceSelectionExperiment(experiment),
    /duplicate truth target basis/,
  );
});

test("canonicalizes truth ordering and rejects reordered identical target sets", () => {
  const experiment = makeExperiment();
  replaceTruth(experiment, 0, ["src/alpha.js", "src/beta.js"]);
  replaceTruth(experiment, 1, ["src/beta.js", "src/alpha.js"]);
  assert.equal(experiment.cases[0].targetBasisDigest, experiment.cases[1].targetBasisDigest);
  assert.throws(
    () => evaluateSourceSelectionExperiment(experiment),
    /duplicate truth target basis/,
  );
});

test("accepts ten cases with distinct intent signatures and truth targets", () => {
  const experiment = makeExperiment();
  assert.equal(
    experiment.cases.every(({ truth }) => truth.length === 1),
    true,
  );
  assert.equal(new Set(experiment.cases.flatMap(({ truth }) => truth)).size, 10);
  const result = evaluateSourceSelectionExperiment(experiment);
  assert.equal(result.cases.length, 10);
  assert.equal(new Set(result.cases.map(({ intentSignature }) => intentSignature)).size, 10);
  assert.equal(new Set(result.cases.map(({ targetBasisDigest }) => targetBasisDigest)).size, 10);
  assert.equal(new Set(result.cases.map(({ questionId }) => questionId)).size, 10);
});

test("target-basis digest binds truth changes", () => {
  const stale = makeExperiment();
  stale.cases[0].truth = ["src/security.js", "src/zeta.js"];
  assert.throws(() => evaluateSourceSelectionExperiment(stale), /targetBasisDigest mismatch/);

  const refreshed = makeExperiment();
  refreshed.cases[0].truth = ["src/security.js", "src/zeta.js"];
  rebuildQuestionIdentity(refreshed.cases[0], refreshed.repositories[0]);
  assert.doesNotThrow(() => evaluateSourceSelectionExperiment(refreshed));
});
