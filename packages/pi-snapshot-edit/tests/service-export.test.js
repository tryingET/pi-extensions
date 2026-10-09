// summary: "The snapshot service is importable by its public export, for hosts that are not Pi (polis)."
// read_when:
//   - "Changing package.json exports or the snapshot service's public surface."

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SnapshotEditService } from "@tryinget/pi-snapshot-edit/service";

test("the public service export reads a revision and edits against it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-snapshot-edit-export-"));
  try {
    await writeFile(join(directory, "a.txt"), "one\ntwo\ntwo\n");
    const service = new SnapshotEditService();
    const read = await service.read({ path: "a.txt" }, directory);
    const base = read.text.split("\n")[0].replace(/^revision:/, "");
    assert.match(read.text, /^revision:\S+\none\ntwo\ntwo\n/);
    await service.edit(
      {
        path: "a.txt",
        base,
        edits: [{ op: "replace", oldText: "two", occurrence: 2, newText: "three" }],
      },
      directory,
      undefined,
    );
    assert.equal(await readFile(join(directory, "a.txt"), "utf8"), "one\ntwo\nthree\n");
    // the same base is spent: a stale edit fails closed
    await assert.rejects(
      service.edit(
        { path: "a.txt", base, edits: [{ op: "replace", oldText: "one", newText: "zero" }] },
        directory,
        undefined,
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("only the service and package.json are exported", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(manifest.exports), ["./service", "./package.json"]);
  assert.equal(manifest.exports["./service"].default, "./src/snapshot-service.js");
});

test("the service export rebuilds a host transcript's revisions for a fresh service", async () => {
  const { revisionsFromMessages } = await import("@tryinget/pi-snapshot-edit/service");
  const directory = await mkdtemp(join(tmpdir(), "pi-snapshot-edit-export-"));
  try {
    await writeFile(join(directory, "a.txt"), "keep\n");
    const earlier = new SnapshotEditService();
    const read = await earlier.read({ path: "a.txt" }, directory);
    const transcript = [
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "t1", name: "snapshot_read", arguments: { path: "a.txt" } },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "t1",
        toolName: "snapshot_read",
        isError: false,
        details: read.details,
      },
    ];
    const later = new SnapshotEditService();
    later.restoreRevisions(revisionsFromMessages(transcript, directory));
    await later.edit(
      {
        path: "a.txt",
        base: read.details.revision,
        edits: [{ op: "replace", oldText: "keep", newText: "kept" }],
      },
      directory,
      undefined,
    );
    assert.equal(await readFile(join(directory, "a.txt"), "utf8"), "kept\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
