// summary: "A revision is valid exactly while its file holds the bytes it names: evicted and restored aliases rehydrate, changed bytes stay stale with lineage."
// read_when:
//   - "Changing the alias ledger, rehydration, restore, or stale/wrong-file messages."

import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SnapshotEditService } from "../src/snapshot-service.js";
import { SnapshotStore } from "../src/snapshot-store.js";

async function workspace(files) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "pi-snapshot-ca-")));
  for (const [name, text] of Object.entries(files)) await writeFile(join(directory, name), text);
  return { directory, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

const replace = (oldText, newText, extra = {}) => ({ op: "replace", oldText, newText, ...extra });

test("an evicted alias rehydrates while its file still holds the same bytes", async () => {
  const space = await workspace({ "a.txt": "alpha\n", "b.txt": "bravo\n" });
  try {
    const service = new SnapshotEditService({
      store: new SnapshotStore({ maxSnapshots: 1, maxLedger: 8 }),
    });
    const first = await service.read({ path: "a.txt" }, space.directory);
    await service.read({ path: "b.txt" }, space.directory); // evicts a.txt's bytes
    assert.equal(service.store.get(first.details.revision), undefined);
    const edited = await service.edit(
      { path: "a.txt", base: first.details.revision, edits: [replace("alpha", "ALPHA")] },
      space.directory,
    );
    assert.match(edited.text, /^Applied 1 snapshot edit/u);
    assert.equal(await readFile(join(space.directory, "a.txt"), "utf8"), "ALPHA\n");
  } finally {
    await space.cleanup();
  }
});

test("a restored alias from an earlier process rehydrates, and new aliases never reuse it", async () => {
  const space = await workspace({ "a.txt": "one\ntwo\n" });
  try {
    const earlier = new SnapshotEditService();
    const read = await earlier.read({ path: "a.txt" }, space.directory);
    const record = {
      alias: read.details.revision,
      path: read.details.path,
      digest: read.details.digest,
    };

    const later = new SnapshotEditService(); // a reload: nothing held
    later.restoreRevisions([record]);
    const fresh = await later.read({ path: "a.txt" }, space.directory);
    assert.notEqual(fresh.details.revision, record.alias, "a restored alias is never issued again");
    const edited = await later.edit(
      { path: "a.txt", base: record.alias, edits: [replace("two", "TWO")] },
      space.directory,
    );
    assert.equal(edited.details.baseRevision, record.alias);
    assert.equal(await readFile(join(space.directory, "a.txt"), "utf8"), "one\nTWO\n");
  } finally {
    await space.cleanup();
  }
});

test("a restored alias whose bytes changed is stale, never rehydrated from other bytes", async () => {
  const space = await workspace({ "a.txt": "one\n" });
  try {
    const earlier = new SnapshotEditService();
    const read = await earlier.read({ path: "a.txt" }, space.directory);
    await writeFile(join(space.directory, "a.txt"), "changed elsewhere\n");
    const later = new SnapshotEditService();
    later.restoreRevisions([
      { alias: read.details.revision, path: read.details.path, digest: read.details.digest },
    ]);
    await assert.rejects(
      later.edit(
        { path: "a.txt", base: read.details.revision, edits: [replace("one", "1")] },
        space.directory,
      ),
      /Stale revision .*Reread before retrying/u,
    );
    assert.equal(await readFile(join(space.directory, "a.txt"), "utf8"), "changed elsewhere\n");
    assert.throws(
      () =>
        later.store.rehydrate(read.details.revision, {
          path: read.details.path,
          bytes: Buffer.from("changed elsewhere\n"),
          text: "changed elsewhere\n",
          hasBom: false,
          lines: [],
          preferredEol: "\n",
          mode: 0o644,
          identity: { dev: 0, ino: 0 },
        }),
      /cannot be rehydrated from different bytes/u,
    );
  } finally {
    await space.cleanup();
  }
});

test("reusing a base after your own edit names the revision the file holds now", async () => {
  const space = await workspace({ "a.txt": "one\ntwo\n" });
  try {
    const service = new SnapshotEditService();
    const read = await service.read({ path: "a.txt" }, space.directory);
    const edited = await service.edit(
      { path: "a.txt", base: read.details.revision, edits: [replace("one", "ONE")] },
      space.directory,
    );
    await assert.rejects(
      service.edit(
        { path: "a.txt", base: read.details.revision, edits: [replace("two", "TWO")] },
        space.directory,
      ),
      new RegExp(
        `Stale revision '${read.details.revision}'.*holds exactly revision '${edited.details.revision}'`,
        "u",
      ),
    );
  } finally {
    await space.cleanup();
  }
});

test("a revision of another file names the newest revision of the file asked for", async () => {
  const space = await workspace({ "a.txt": "alpha\n", "b.txt": "bravo\n" });
  try {
    const service = new SnapshotEditService();
    const a = await service.read({ path: "a.txt" }, space.directory);
    const b = await service.read({ path: "b.txt" }, space.directory);
    await assert.rejects(
      service.edit(
        { path: "b.txt", base: a.details.revision, edits: [replace("bravo", "x")] },
        space.directory,
      ),
      new RegExp(
        `belongs to a different file .*newest revision of .*b\\.txt in this session is '${b.details.revision}'`,
        "u",
      ),
    );
  } finally {
    await space.cleanup();
  }
});

test("read and edit details carry the canonical path that restores a revision", async () => {
  const space = await workspace({ "a.txt": "alpha\n" });
  try {
    const service = new SnapshotEditService();
    const read = await service.read({ path: "./a.txt" }, space.directory);
    assert.equal(read.details.path, join(space.directory, "a.txt"));
    const edited = await service.edit(
      { path: "a.txt", base: read.details.revision, edits: [replace("alpha", "beta")] },
      space.directory,
    );
    assert.equal(edited.details.path, join(space.directory, "a.txt"));
    assert.deepEqual(service.store.lookup(edited.details.revision), {
      alias: edited.details.revision,
      path: edited.details.path,
      digest: edited.details.digest,
    });
  } finally {
    await space.cleanup();
  }
});
