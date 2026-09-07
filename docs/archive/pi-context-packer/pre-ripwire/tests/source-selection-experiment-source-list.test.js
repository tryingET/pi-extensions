import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSourceSelectionExperiment,
  experimentInternals,
} from "../src/source-selection-experiment.js";
import { makeExperiment, resignPreparation } from "./source-selection-experiment-fixtures.test.js";

function replacePayload(repository, mutate) {
  const payload = JSON.parse(repository.sourceListArtifact.rawJson);
  mutate(payload);
  const rawJson = `${JSON.stringify(payload, null, 2)}\n`;
  repository.sourceListArtifact.rawJson = rawJson;
  repository.sourceListArtifact.rawSha256 = experimentInternals.sha256Raw(rawJson);
}

test("validates exact raw source-list v1 full-list artifact and preparation evidence", () => {
  const experiment = makeExperiment();
  const result = evaluateSourceSelectionExperiment(experiment);
  const repository = result.repositories[0];
  assert.equal(repository.sourceListContractVersion, "source-list.v1");
  assert.equal(repository.candidateCount, 12);
  assert.equal(repository.trackedPathCount, 12);
  assert.equal(repository.metadataPresentCount, 12);
  assert.equal(repository.metadataCoverage, 1);
  assert.equal(repository.rawEvidenceRetainedInPreparedInput, true);
  assert.equal(
    repository.rawSourceListArtifactSha256,
    experiment.repositories[0].sourceListArtifact.rawSha256,
  );
});

test("rejects raw source-list digest mismatch before using projected content", () => {
  const experiment = makeExperiment();
  experiment.repositories[0].sourceListArtifact.rawJson += " ";
  assert.throws(
    () => evaluateSourceSelectionExperiment(experiment),
    /raw artifact digest mismatch/,
  );
});

test("rejects source-list contract, full-list, count, status, and metadata grammar gaps", () => {
  const mutations = [
    (payload) => {
      payload.contractVersion = "source-list.v2";
    },
    (payload) => {
      payload.ok = false;
    },
    (payload) => {
      payload.mode = "lint";
    },
    (payload) => {
      payload.truncated = true;
    },
    (payload) => {
      payload.returnedCount -= 1;
    },
    (payload) => {
      payload.totalPages = 2;
    },
    (payload) => {
      payload.items[0].metadataStatus = "absent";
    },
    (payload) => {
      payload.items[0].summary = "   ";
    },
    (payload) => {
      payload.items[0].readWhen = ["x".repeat(241)];
    },
    (payload) => {
      payload.items[0].summary = "bad\u001bmetadata";
    },
    (payload) => {
      payload.items[1].path = payload.items[0].path;
    },
    (payload) => {
      payload.items[0].path = "C:relative.js";
    },
    (payload) => {
      payload.items[0].path = "..\\escape.js";
    },
    (payload) => {
      payload.items[0].path = "C:\\Windows\\win.js";
    },
    (payload) => {
      payload.items[0].path = "C:/Windows/win.js";
    },
    (payload) => {
      payload.items[0].path = "C:";
    },
    (payload) => {
      payload.items[0].path = "z:src/a.js";
    },
    (payload) => {
      payload.items[0].path = "./src/a.js";
    },
    (payload) => {
      payload.items[0].path = "src//a.js";
    },
    (payload) => {
      payload.items[0].path = "src/a.js/";
    },
    (payload) => {
      payload.items[0].path = "src/./a.js";
    },
    (payload) => {
      payload.items[0].path = "src/../a.js";
    },
    (payload) => {
      payload.items[0].path = " src/a.js";
    },
    (payload) => {
      payload.items[0].path = "src/a.js ";
    },
    (payload) => {
      payload.items[0].path = "src/bad\u0085name.js";
    },
    (payload) => {
      payload.items[0].path = "src/bad\u001bname.js";
    },
    (payload) => {
      payload.items[0].path = `${"é".repeat(2050)}.js`;
    },
    (payload) => {
      payload.supportedExtensions.pop();
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const experiment = makeExperiment();
    replacePayload(experiment.repositories[0], mutate);
    assert.throws(
      () => evaluateSourceSelectionExperiment(experiment),
      undefined,
      `source-list mutation ${index}`,
    );
  }
});

test("rejects source-list preparation command, pin, clean-state, and tracked-path gaps", () => {
  const mutations = [
    (preparation) => {
      preparation.command = [preparation.sourceListExecutable.nodePath, "--version"];
      preparation.commandDigest = experimentInternals.sha256Digest(preparation.command);
    },
    (preparation) => {
      preparation.sourceListExecutable.revision = "not-a-commit";
    },
    (preparation) => {
      preparation.sourceListExecutable.artifactSha256 = "unrelated";
    },
    (preparation) => {
      preparation.exitCode = 1;
    },
    (preparation) => {
      preparation.targetState.statusAfter = " M source.js";
      preparation.targetState.cleanAfter = false;
    },
    (preparation) => {
      preparation.trackedPathInventory.command = ["git", "--version"];
      preparation.trackedPathInventory.commandDigest = experimentInternals.sha256Digest(
        preparation.trackedPathInventory.command,
      );
    },
    (preparation) => {
      const bytes = Buffer.from(preparation.trackedPathInventory.stdoutBase64, "base64");
      const extra = Buffer.from(`100644 ${"d".repeat(40)} 0\tsrc/extra.js\0`, "utf8");
      const combined = Buffer.concat([bytes, extra]);
      preparation.trackedPathInventory.stdoutBase64 = combined.toString("base64");
      preparation.trackedPathInventory.stdoutSha256 = experimentInternals.sha256Raw(combined);
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const experiment = makeExperiment();
    const preparation = experiment.repositories[0].sourceListPreparation;
    mutate(preparation);
    resignPreparation(preparation);
    assert.throws(
      () => evaluateSourceSelectionExperiment(experiment),
      undefined,
      `preparation mutation ${index}`,
    );
  }
});

test("binds staleness sample to commit, raw owner artifact, method, and sample digest", () => {
  const mutations = [
    (sample) => {
      sample.commit = "b".repeat(40);
    },
    (sample) => {
      sample.rawArtifactSha256 = `sha256:${"0".repeat(64)}`;
    },
    (sample) => {
      sample.method = "   ";
    },
    (sample) => {
      sample.sampledPaths.push(sample.sampledPaths[0]);
    },
    (sample) => {
      sample.sampleDigest = `sha256:${"0".repeat(64)}`;
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const experiment = makeExperiment();
    mutate(experiment.repositories[0].metadataStalenessSample);
    assert.throws(
      () => evaluateSourceSelectionExperiment(experiment),
      undefined,
      `staleness mutation ${index}`,
    );
  }
});
