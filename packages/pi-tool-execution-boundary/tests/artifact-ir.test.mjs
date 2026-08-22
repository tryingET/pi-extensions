import test from "node:test";
import assert from "node:assert/strict";
import {
  completedReadDisposition,
  completedMutationDisposition,
  unknownMutationDisposition,
  cancelledPreEffectDisposition,
} from "../src/disposition.js";
import { createSourceSnapshot } from "../src/source-snapshot-ir.js";
import { createChangeSet } from "../src/change-set-ir.js";
import { createDataExposure } from "../src/data-exposure.js";

const sha = (char) => char.repeat(64);
const oid = (char) => char.repeat(40);

test("disposition constructors prevent contradictory states", () => {
  const read = completedReadDisposition({ workspaceGeneration: 1 });
  assert.equal(read.workspaceMutation, "none");
  assert.equal(read.retrySafety, "safe");
  assert.match(read.dispositionDigest, /^[a-f0-9]{64}$/);

  const mutation = completedMutationDisposition({
    processExit: "known",
    workspaceGenerationBefore: 1,
    workspaceGenerationAfter: 2,
  });
  assert.equal(mutation.workspaceMutation, "known");
  assert.equal(mutation.journal, "durable");
  assert.throws(() => completedMutationDisposition({ workspaceGenerationBefore: 1, workspaceGenerationAfter: 3 }), /exactly one/);

  assert.equal(unknownMutationDisposition({ workspaceGenerationBefore: 2 }).retrySafety, "operator-decision");
  assert.equal(cancelledPreEffectDisposition({ workspaceGeneration: 2 }).workspaceMutation, "none");
});

test("source snapshot is canonical, sorted, content-addressed, and rejects unsafe symlinks", () => {
  const snapshot = createSourceSnapshot({
    sourceRepositoryId: "repo-1",
    sourceCommitObjectId: oid("a"),
    sourceTreeObjectId: oid("b"),
    gitVersion: "git version 2.45",
    createdAtUnixMs: 1,
    entries: [
      { kind: "file", path: "z.txt", executable: false, gitBlobObjectId: oid("c"), contentSha256: sha("d"), contentLength: 1 },
      { kind: "file", path: "a.txt", executable: true, gitBlobObjectId: oid("e"), contentSha256: sha("f"), contentLength: 2 },
    ],
  });
  assert.deepEqual(snapshot.entries.map((entry) => entry.path), ["a.txt", "z.txt"]);
  assert.equal(snapshot.totalBytes, 3);
  assert.match(snapshot.manifestSha256, /^[a-f0-9]{64}$/);
  assert.throws(() => createSourceSnapshot({
    sourceRepositoryId: "repo", sourceCommitObjectId: oid("a"), sourceTreeObjectId: oid("b"), gitVersion: "git", createdAtUnixMs: 1,
    entries: [{ kind: "symlink", path: "x", target: "../secret", gitBlobObjectId: oid("c"), contentSha256: sha("d"), contentLength: 9 }],
  }), /Unsafe symlink/);
});

test("change sets are typed and never use patch text as authority", () => {
  const changeSet = createChangeSet({
    changeSetId: "changes-1",
    leaseId: "lease-1",
    sourceManifestSha256: sha("a"),
    sourceCommitObjectId: oid("b"),
    workspaceGeneration: 2,
    dispositionDigest: sha("c"),
    createdAtUnixMs: 1,
    entries: [
      { operation: "replace", path: "a.txt", baseSha256: sha("d"), contentSha256: sha("e"), contentLength: 3, executable: false },
      { operation: "delete", path: "b.txt", baseSha256: sha("f") },
    ],
  });
  assert.equal(changeSet.totalContentBytes, 3);
  assert.match(changeSet.manifestSha256, /^[a-f0-9]{64}$/);
  assert.equal("patch" in changeSet, false);
});

test("data exposure separates guest network from model and connector egress", () => {
  const exposure = createDataExposure({ modelProviderLocality: "remote", hostConnectorGrants: [{ packageDigest: sha("a"), tool: "GitHub", operation: "read", effect: "read", dataExposure: "content" }] });
  assert.equal(exposure.guestNetwork, "absent");
  assert.equal(exposure.modelProviderLocality, "remote");
  assert.equal(exposure.endToEndInformationFlowConfinement, false);
  assert.equal(exposure.rawToolOutputRetention.mode, "session");
});


test("change-set commit IDs and connector retention are validated", () => {
  assert.throws(() => createChangeSet({
    changeSetId: "changes-2",
    leaseId: "lease-1",
    sourceManifestSha256: sha("a"),
    sourceCommitObjectId: "not-an-object-id",
    workspaceGeneration: 2,
    dispositionDigest: sha("c"),
    createdAtUnixMs: 1,
    entries: [],
  }), /UTF-8 length|invalid format/);
  assert.throws(() => createDataExposure({
    rawToolOutputRetention: { mode: "bounded" },
  }), /requires maximumDays or maximumBytes/);
  assert.throws(() => createDataExposure({
    hostConnectorGrants: [{ packageDigest: sha("a"), tool: "GitHub", operation: "comment", effect: "external-write" }, { packageDigest: sha("a"), tool: "GitHub", operation: "comment", effect: "external-write" }],
  }), /Duplicate host connector grant/);
});
