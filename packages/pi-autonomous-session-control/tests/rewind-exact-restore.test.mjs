import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureSnapshotForCurrentWorktree,
  restoreCommitExactly,
} from "../extensions/self/rewind/index.ts";
import { createRewindGitHarness } from "./rewind-harness.mjs";

test("rewind exact restore restores tracked and untracked files while leaving ignored files alone", async () => {
  const harness = await createRewindGitHarness();

  try {
    await harness.writeRepoFile(".gitignore", "ignored.txt\n");
    await harness.writeRepoFile("tracked.txt", "tracked-v1\n");
    await harness.writeRepoFile("notes/local.md", "note-v1\n");
    await harness.writeRepoFile("ignored.txt", "ignored-baseline\n");

    const initialSnapshot = await ensureSnapshotForCurrentWorktree(harness.git);

    await harness.writeRepoFile("tracked.txt", "tracked-v2\n");
    await harness.writeRepoFile("notes/local.md", "note-v2\n");
    await harness.writeRepoFile("extra.txt", "extra-current\n");
    await harness.writeRepoFile("ignored.txt", "ignored-current\n");

    const restored = await restoreCommitExactly(harness.git, initialSnapshot.snapshot.commitSha, {
      lastExact: initialSnapshot.snapshot,
    });

    assert.equal(restored.changed, true);
    assert.ok(restored.undoCommitSha, "expected undo snapshot to be created");
    assert.equal(await harness.readRepoFile("tracked.txt"), "tracked-v1\n");
    assert.equal(await harness.readRepoFile("notes/local.md"), "note-v1\n");
    assert.equal(await harness.exists("extra.txt"), false);
    assert.equal(await harness.readRepoFile("ignored.txt"), "ignored-current\n");

    const undoRestore = await restoreCommitExactly(harness.git, restored.undoCommitSha);

    assert.equal(undoRestore.changed, true);
    assert.equal(await harness.readRepoFile("tracked.txt"), "tracked-v2\n");
    assert.equal(await harness.readRepoFile("notes/local.md"), "note-v2\n");
    assert.equal(await harness.readRepoFile("extra.txt"), "extra-current\n");
    assert.equal(await harness.readRepoFile("ignored.txt"), "ignored-current\n");
  } finally {
    await harness.cleanup();
  }
});
