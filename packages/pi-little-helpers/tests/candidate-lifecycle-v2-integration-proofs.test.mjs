import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import test from "node:test";
import {
  assertIntegrationProofCoversDisposition,
  verifyAdditiveContentCoverageProof,
  verifyPatchEquivalenceProof,
} from "../src/candidatePeerLifecycleV2.ts";
import { git, setupLinkedWorktree, withTempDir } from "./candidate-lifecycle-v2-fixtures.mjs";

test("v2 patch-equivalence proof binds distinct candidate and target OIDs", async () => {
  await withTempDir((root) => {
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    writeFileSync(`${worktreePath}/equivalent.txt`, "same accepted bytes\n");
    git(worktreePath, "add", "equivalent.txt");
    git(worktreePath, "commit", "-m", "candidate implementation");
    const candidateHeadOid = git(worktreePath, "rev-parse", "HEAD");
    const patchPath = `${root}/candidate.patch`;
    writeFileSync(patchPath, execFileSync("git", ["-C", repoRoot, "diff", "main..candidate/test"]));
    execFileSync("git", ["-C", repoRoot, "apply", patchPath]);
    git(repoRoot, "add", "equivalent.txt");
    git(repoRoot, "commit", "-m", "integrated equivalent implementation");
    const targetOid = git(repoRoot, "rev-parse", "HEAD");

    const proof = verifyPatchEquivalenceProof({
      actor: "owner:test",
      issuedAt: new Date().toISOString(),
      candidateRepoRoot: repoRoot,
      candidateHeadOid,
      targetRepoRoot: repoRoot,
      targetOid,
      validationRefs: ["synthetic patch-equivalence canary"],
    });
    assert.equal(proof.form, "patch_equivalence");
    assert.deepEqual(proof.selectedCommits, [candidateHeadOid]);
    assert.equal(proof.patchIds.length, 1);
    assert.match(proof.proofDigest, /^[0-9a-f]{64}$/);
    assert.throws(
      () =>
        assertIntegrationProofCoversDisposition(
          { disposition: "accepted", selectedCommits: [targetOid] },
          { repoRoot, headOid: candidateHeadOid },
          {
            form: "commit_inclusion",
            candidateRepoRoot: repoRoot,
            candidateHeadOid,
            selectedCommits: [targetOid],
          },
        ),
      /not contained in reviewed candidate HEAD/,
    );
  });
});

test("content coverage binds exact selected-path tree state through the target OID", async () => {
  await withTempDir((root) => {
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    writeFileSync(`${worktreePath}/ordered.txt`, "alpha\nbeta\n");
    git(worktreePath, "add", "ordered.txt");
    git(worktreePath, "commit", "-m", "candidate ordered content");
    const candidateHeadOid = git(worktreePath, "rev-parse", "HEAD");

    writeFileSync(`${repoRoot}/ordered.txt`, "alpha\nbeta\n");
    git(repoRoot, "add", "ordered.txt");
    git(repoRoot, "commit", "-m", "integrate ordered content");
    const targetOid = git(repoRoot, "rev-parse", "HEAD");

    const proof = verifyAdditiveContentCoverageProof({
      actor: "owner:test",
      issuedAt: new Date().toISOString(),
      candidateRepoRoot: repoRoot,
      candidateCommitOid: candidateHeadOid,
      targetRepoRoot: repoRoot,
      targetIntegrationCommitOid: targetOid,
      targetOid,
      selectedPaths: ["ordered.txt"],
      validationRefs: ["exact tree coverage canary"],
    });
    assert.equal(proof.form, "content_coverage");
    assert.equal(proof.candidateHeadOid, candidateHeadOid);
    assert.deepEqual(proof.selectedCommits, []);
    assert.deepEqual(proof.selectedPaths, ["ordered.txt"]);
    assert.match(proof.coverageDigest, /^[0-9a-f]{64}$/);
  });
});

test("content coverage rejects reordered lines that share an addition multiset", async () => {
  await withTempDir((root) => {
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    writeFileSync(`${worktreePath}/ordered.txt`, "alpha\nbeta\n");
    git(worktreePath, "add", "ordered.txt");
    git(worktreePath, "commit", "-m", "candidate order");
    const candidateHeadOid = git(worktreePath, "rev-parse", "HEAD");

    writeFileSync(`${repoRoot}/ordered.txt`, "beta\nalpha\n");
    git(repoRoot, "add", "ordered.txt");
    git(repoRoot, "commit", "-m", "wrong integration order");
    const targetOid = git(repoRoot, "rev-parse", "HEAD");

    assert.throws(
      () =>
        verifyAdditiveContentCoverageProof({
          actor: "owner:test",
          issuedAt: new Date().toISOString(),
          candidateRepoRoot: repoRoot,
          candidateCommitOid: candidateHeadOid,
          targetRepoRoot: repoRoot,
          targetIntegrationCommitOid: targetOid,
          targetOid,
          selectedPaths: ["ordered.txt"],
          validationRefs: ["adversarial reordered content"],
        }),
      /do not exactly preserve reviewed candidate path content/,
    );
  });
});

test("content coverage cannot omit selected content from an earlier candidate commit", async () => {
  await withTempDir((root) => {
    const { repoRoot, worktreePath } = setupLinkedWorktree(root);
    writeFileSync(`${worktreePath}/earlier.txt`, "accepted earlier bytes\n");
    git(worktreePath, "add", "earlier.txt");
    git(worktreePath, "commit", "-m", "candidate earlier content");
    writeFileSync(`${worktreePath}/tip.txt`, "accepted tip bytes\n");
    git(worktreePath, "add", "tip.txt");
    git(worktreePath, "commit", "-m", "candidate tip content");
    const candidateHeadOid = git(worktreePath, "rev-parse", "HEAD");

    writeFileSync(`${repoRoot}/tip.txt`, "accepted tip bytes\n");
    git(repoRoot, "add", "tip.txt");
    git(repoRoot, "commit", "-m", "incomplete integration");
    const targetOid = git(repoRoot, "rev-parse", "HEAD");

    assert.throws(
      () =>
        verifyAdditiveContentCoverageProof({
          actor: "owner:test",
          issuedAt: new Date().toISOString(),
          candidateRepoRoot: repoRoot,
          candidateCommitOid: candidateHeadOid,
          targetRepoRoot: repoRoot,
          targetIntegrationCommitOid: targetOid,
          targetOid,
          selectedPaths: ["earlier.txt", "tip.txt"],
          validationRefs: ["adversarial omitted earlier content"],
        }),
      /selected path must identify one extant tree entry: earlier.txt/,
    );
  });
});

test("integration proof cannot substitute an unrelated selected commit", () => {
  const selected = "a".repeat(40);
  const unrelated = "b".repeat(40);
  const disposition = {
    disposition: "accepted",
    selectedCommits: [selected],
  };
  const snapshot = { headOid: selected };
  const proof = {
    form: "commit_inclusion",
    selectedCommits: [unrelated],
  };
  assert.throws(
    () => assertIntegrationProofCoversDisposition(disposition, snapshot, proof),
    /exact accepted disposition selection/,
  );
});
