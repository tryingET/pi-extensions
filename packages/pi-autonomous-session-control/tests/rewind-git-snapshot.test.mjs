// summary: "Tests rewind Git tree snapshots, deduplication, and keepalive reachability."
// read_when:
//   - "Changing rewind snapshot creation or store-ref retention."

import assert from "node:assert/strict";
import test from "node:test";
import {
  commitExists,
  ensureSnapshotForCurrentWorktree,
  getCommitTreeSha,
  getStoreHead,
  REWIND_STORE_REF,
} from "../extensions/self/rewind/index.ts";
import { createRewindGitHarness, gitStdout } from "./rewind-harness.mjs";

test("rewind snapshot core captures exact trees, deduplicates identical states, and keeps snapshots reachable", async () => {
  const harness = await createRewindGitHarness();

  try {
    await harness.writeRepoFile(".gitignore", "ignored.txt\n");
    await harness.writeRepoFile("src/demo.txt", "version-1\n");
    await harness.writeRepoFile("notes/local.md", "note-1\n");
    await harness.writeRepoFile("ignored.txt", "ignored-baseline\n");

    const first = await ensureSnapshotForCurrentWorktree(harness.git);
    assert.equal(first.reused, false);
    assert.equal(await commitExists(harness.git, first.snapshot.commitSha), true);
    assert.equal(
      await getCommitTreeSha(harness.git, first.snapshot.commitSha),
      first.snapshot.treeSha,
    );

    const firstStoreHead = await getStoreHead(harness.git);
    assert.ok(firstStoreHead, "expected the keepalive ref to exist after first snapshot");
    assert.equal(
      await gitStdout(harness.repoRoot, ["rev-parse", "--verify", REWIND_STORE_REF]),
      firstStoreHead,
    );

    const repeated = await ensureSnapshotForCurrentWorktree(harness.git, {
      lastExact: first.snapshot,
    });
    assert.equal(repeated.reused, true);
    assert.equal(repeated.snapshot.commitSha, first.snapshot.commitSha);
    assert.equal(await getStoreHead(harness.git), firstStoreHead);

    await harness.writeRepoFile("src/demo.txt", "version-2\n");
    const second = await ensureSnapshotForCurrentWorktree(harness.git, {
      lastExact: first.snapshot,
    });
    assert.equal(second.reused, false);
    assert.notEqual(second.snapshot.commitSha, first.snapshot.commitSha);
    assert.equal(await commitExists(harness.git, second.snapshot.commitSha), true);

    const secondStoreHead = await getStoreHead(harness.git);
    assert.ok(secondStoreHead, "expected keepalive ref to remain present");
    assert.notEqual(secondStoreHead, firstStoreHead);
  } finally {
    await harness.cleanup();
  }
});
