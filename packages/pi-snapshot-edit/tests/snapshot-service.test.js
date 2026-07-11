import assert from "node:assert/strict";
import { link, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SnapshotEditService } from "../src/snapshot-service.js";
import { digestBytes, SnapshotStore } from "../src/snapshot-store.js";
import { atomicReplace } from "../src/text-file.js";

async function fixture(name, contents) {
  const directory = await mkdtemp(join(tmpdir(), "pi-snapshot-edit-"));
  const path = join(directory, name);
  await writeFile(path, contents);
  return {
    directory,
    path,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

function createService(options = {}) {
  const queued = [];
  return {
    queued,
    service: new SnapshotEditService({
      store: options.store,
      mutationQueue: async (path, operation) => {
        queued.push(path);
        return operation();
      },
    }),
  };
}

test("edits one of several identical lines without copying unique oldText", async () => {
  const file = await fixture("duplicates.ts", "alpha\nrepeat\nrepeat\nomega\n");
  try {
    const { service, queued } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    assert.match(read.text, /^revision:amber/m);
    assert.match(read.text, /^2│repeat$/m);
    assert.match(read.text, /^3│repeat$/m);

    const edited = await service.edit(
      {
        path: file.path,
        base: read.details.revision,
        edits: [{ op: "replace", startLine: 3, endLine: 3, newText: "chosen" }],
      },
      file.directory,
    );

    assert.equal(await readFile(file.path, "utf8"), "alpha\nrepeat\nchosen\nomega\n");
    assert.equal(queued.length, 1);
    assert.notEqual(edited.details.revision, read.details.revision);
  } finally {
    await file.cleanup();
  }
});

test("fails closed when bytes changed after snapshot_read", async () => {
  const file = await fixture("stale.txt", "one\ntwo\n");
  try {
    const { service } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    await writeFile(file.path, "external\none\ntwo\n");

    await assert.rejects(
      service.edit(
        {
          path: file.path,
          base: read.details.revision,
          edits: [{ op: "replace", startLine: 2, endLine: 2, newText: "changed" }],
        },
        file.directory,
      ),
      /Stale revision/,
    );
    assert.equal(await readFile(file.path, "utf8"), "external\none\ntwo\n");
  } finally {
    await file.cleanup();
  }
});

test("applies batch coordinates against one immutable base", async () => {
  const file = await fixture("batch.txt", "a\nb\nc\nd\ne\n");
  try {
    const { service } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    await service.edit(
      {
        path: file.path,
        base: read.details.revision,
        edits: [
          { op: "replace", startLine: 2, endLine: 2, newText: "B1\nB2" },
          { op: "replace", startLine: 4, endLine: 4, newText: "D" },
        ],
      },
      file.directory,
    );
    assert.equal(await readFile(file.path, "utf8"), "a\nB1\nB2\nc\nD\ne\n");
  } finally {
    await file.cleanup();
  }
});

test("rejects overlapping ranges before writing", async () => {
  const file = await fixture("overlap.txt", "a\nb\nc\nd\n");
  try {
    const { service } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    await assert.rejects(
      service.edit(
        {
          path: file.path,
          base: read.details.revision,
          edits: [
            { op: "replace", startLine: 1, endLine: 2, newText: "x" },
            { op: "replace", startLine: 2, endLine: 3, newText: "y" },
          ],
        },
        file.directory,
      ),
      /overlap/,
    );
    assert.equal(await readFile(file.path, "utf8"), "a\nb\nc\nd\n");
  } finally {
    await file.cleanup();
  }
});

test("preserves UTF-8 BOM, CRLF outside replacement, final newline, and mode", async () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const file = await fixture("windows.txt", Buffer.concat([bom, Buffer.from("one\r\ntwo\r\n")]));
  try {
    const beforeMode = (await stat(file.path)).mode;
    const { service } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    await service.edit(
      {
        path: file.path,
        base: read.details.revision,
        edits: [{ op: "replace", startLine: 2, endLine: 2, newText: "second" }],
      },
      file.directory,
    );
    const bytes = await readFile(file.path);
    assert.equal(bytes.subarray(0, 3).equals(bom), true);
    assert.equal(bytes.subarray(3).toString("utf8"), "one\r\nsecond\r\n");
    assert.equal((await stat(file.path)).mode, beforeMode);
  } finally {
    await file.cleanup();
  }
});

test("rejects byte-identical inode replacement after snapshot_read", async () => {
  const file = await fixture("identity.txt", "same bytes\n");
  try {
    const { service } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    const replacement = join(file.directory, "replacement.txt");
    await writeFile(replacement, "same bytes\n");
    await rename(replacement, file.path);
    await assert.rejects(
      service.edit(
        {
          path: file.path,
          base: read.details.revision,
          edits: [{ op: "replace", startLine: 1, endLine: 1, newText: "changed" }],
        },
        file.directory,
      ),
      /file identity that has been replaced/,
    );
  } finally {
    await file.cleanup();
  }
});

test("commit recheck rejects a target that became hard-linked", async () => {
  const file = await fixture("linked.txt", "original\n");
  try {
    const fileStat = await stat(file.path);
    await link(file.path, join(file.directory, "alias.txt"));
    await assert.rejects(
      atomicReplace(
        file.path,
        Buffer.from("changed\n"),
        digestBytes(Buffer.from("original\n")),
        { dev: fileStat.dev, ino: fileStat.ino },
        digestBytes,
      ),
      /became hard-linked/,
    );
    assert.equal(await readFile(file.path, "utf8"), "original\n");
  } finally {
    await file.cleanup();
  }
});

test("atomic commit honors cancellation immediately before rename", async () => {
  const file = await fixture("cancelled.txt", "original\n");
  try {
    const fileStat = await stat(file.path);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      atomicReplace(
        file.path,
        Buffer.from("changed\n"),
        digestBytes(Buffer.from("original\n")),
        { dev: fileStat.dev, ino: fileStat.ino },
        digestBytes,
        controller.signal,
      ),
      /cancelled before atomic commit/,
    );
    assert.equal(await readFile(file.path, "utf8"), "original\n");
  } finally {
    await file.cleanup();
  }
});

test("rejects bare-CR and mixed-EOL files instead of normalizing unrelated bytes", async () => {
  const bare = await fixture("bare-cr.txt", "one\rtwo\r");
  const mixed = await fixture("mixed.txt", "one\r\ntwo\n");
  try {
    const { service } = createService();
    await assert.rejects(service.read({ path: bare.path }, bare.directory), /Bare-CR/);
    await assert.rejects(service.read({ path: mixed.path }, mixed.directory), /Mixed CRLF\/LF/);
  } finally {
    await bare.cleanup();
    await mixed.cleanup();
  }
});

test("supports insertion at file start and deletion by empty replacement", async () => {
  const file = await fixture("operations.txt", "one\ntwo\nthree\n");
  try {
    const { service } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    await service.edit(
      {
        path: file.path,
        base: read.details.revision,
        edits: [
          { op: "insert_after", startLine: 0, newText: "zero" },
          { op: "replace", startLine: 2, endLine: 2, newText: "" },
        ],
      },
      file.directory,
    );
    assert.equal(await readFile(file.path, "utf8"), "zero\none\nthree\n");
  } finally {
    await file.cleanup();
  }
});

test("evicts old word aliases under configured snapshot count", async () => {
  const first = await fixture("first.txt", "first\n");
  const second = await fixture("second.txt", "second\n");
  try {
    const store = new SnapshotStore({ maxSnapshots: 1, words: ["banana", "cedar"] });
    const { service } = createService({ store });
    const one = await service.read({ path: first.path }, first.directory);
    const two = await service.read({ path: second.path }, second.directory);
    assert.equal(one.details.revision, "banana");
    assert.equal(two.details.revision, "cedar");
    assert.equal(store.get("banana"), undefined);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});
