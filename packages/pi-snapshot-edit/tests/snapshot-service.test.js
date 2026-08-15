// summary: "Exercises snapshot reads, exact-selector edits, atomic replacement guards, pagination, and byte preservation."
// read_when:
//   - "Changing snapshot service semantics, selector validation, file safety, or output limits."

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
  return { directory, path, cleanup: () => rm(directory, { recursive: true, force: true }) };
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

async function editFixture(contents, edits, name = "fixture.txt") {
  const file = await fixture(name, contents);
  const { service } = createService();
  const snapshot = await service.read({ path: file.path }, file.directory);
  await service.edit({ path: file.path, base: snapshot.details.revision, edits }, file.directory);
  return { file, text: await readFile(file.path, "utf8") };
}

test("read is token-lean raw text with one revision header and no gutters", async () => {
  const file = await fixture("raw.txt", "alpha\nrepeat\nomega\n");
  try {
    const { service } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    assert.equal(read.text, "revision:amber\nalpha\nrepeat\nomega\n");
    assert.doesNotMatch(read.text, /\d+│/u);
  } finally {
    await file.cleanup();
  }
});

test("pagination stays raw, retains full-file binding, and fails explicitly on unsplittable lines", async () => {
  const file = await fixture("pages.txt", "one\ntwo\nthree\n");
  const oversized = await fixture("oversized.txt", `${"x".repeat(51 * 1024)}\n`);
  try {
    const { service } = createService();
    const first = await service.read({ path: file.path, limit: 2 }, file.directory);
    assert.match(first.text, /^revision:amber\none\ntwo\n\[Snapshot read truncated/u);
    assert.equal(first.details.lineCount, 3);
    const continued = await service.read({ path: file.path, offset: 3 }, file.directory);
    assert.equal(continued.text, "revision:apple\nthree\n");
    await assert.rejects(
      service.read({ path: oversized.path }, oversized.directory),
      /Line 1 exceeds.*50KB.*cannot split a line/,
    );
  } finally {
    await file.cleanup();
    await oversized.cleanup();
  }
});

test("read output includes all framing within the strict 50KB byte cap", async () => {
  const cap = 50 * 1024;
  const headerBytes = Buffer.byteLength("revision:amber\n");
  const cases = [
    ["lf.txt", `${"x".repeat(cap - headerBytes - 1)}\n`],
    ["crlf.txt", `${"x".repeat(cap - headerBytes - 2)}\r\n`],
    ["multibyte.txt", `${"界".repeat(15_000)}\n${"界".repeat(1_000)}\n${"界".repeat(2_000)}\n`],
    ["notice.txt", `${"x".repeat(cap - headerBytes - 500)}\n${"y".repeat(1_000)}\n`],
  ];
  for (const [name, contents] of cases) {
    const file = await fixture(name, contents);
    try {
      const { service } = createService();
      const result = await service.read({ path: file.path }, file.directory);
      assert.ok(Buffer.byteLength(result.text, "utf8") <= cap, name);
      if (name === "lf.txt" || name === "crlf.txt") {
        assert.equal(Buffer.byteLength(result.text, "utf8"), cap, name);
      } else {
        assert.equal(result.details.truncated, true, name);
        assert.match(result.text, /Snapshot read truncated/u, name);
      }
    } finally {
      await file.cleanup();
    }
  }
});

test("read rejects a first line that cannot share the safe page with truncation framing", async () => {
  const file = await fixture("framing.txt", `${"x".repeat(50 * 1024 - 20)}\nnext\n`);
  try {
    const { service } = createService();
    await assert.rejects(
      service.read({ path: file.path }, file.directory),
      /Line 1 exceeds.*safe-page.*cannot split a line/,
    );
    assert.equal(await readFile(file.path, "utf8"), `${"x".repeat(50 * 1024 - 20)}\nnext\n`);
  } finally {
    await file.cleanup();
  }
});

test("unique selector omits occurrence and supports partial-line replacement", async () => {
  const result = await editFixture("const status = 'old';\n", [
    { op: "replace", oldText: "'old'", newText: "'new'" },
  ]);
  try {
    assert.equal(result.text, "const status = 'new';\n");
  } finally {
    await result.file.cleanup();
  }
});

test("duplicate selector requires a 1-indexed occurrence", async () => {
  const file = await fixture("duplicates.txt", "repeat\nrepeat\n");
  try {
    const { service } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    const baseCall = { path: file.path, base: read.details.revision };
    await assert.rejects(
      service.edit(
        { ...baseCall, edits: [{ op: "replace", oldText: "repeat", newText: "chosen" }] },
        file.directory,
      ),
      /matches 2 occurrences; occurrence is required and 1-indexed/,
    );
    await service.edit(
      {
        ...baseCall,
        edits: [{ op: "replace", oldText: "repeat", occurrence: 2, newText: "chosen" }],
      },
      file.directory,
    );
    assert.equal(await readFile(file.path, "utf8"), "repeat\nchosen\n");
  } finally {
    await file.cleanup();
  }
});

test("overlapping exact matches count as distinct occurrences", async () => {
  const result = await editFixture("aaa\n", [
    { op: "replace", oldText: "aa", occurrence: 2, newText: "Z" },
  ]);
  try {
    assert.equal(result.text, "aZ\n");
  } finally {
    await result.file.cleanup();
  }
});

test("multi-line selector and anchored insertion preserve exact surrounding bytes", async () => {
  const result = await editFixture("head\nalpha\nbeta\ntail\n", [
    { op: "replace", oldText: "alpha\nbeta", newText: "A\nB" },
    { op: "insert_after", anchorText: "tail", newText: "!" },
  ]);
  try {
    assert.equal(result.text, "head\nA\nB\ntail!\n");
  } finally {
    await result.file.cleanup();
  }
});

test("batch selectors resolve against one immutable base", async () => {
  const result = await editFixture("a b c d\n", [
    { op: "replace", oldText: "a", newText: "alphabet" },
    { op: "replace", oldText: "d", newText: "D" },
  ]);
  try {
    assert.equal(result.text, "alphabet b c D\n");
  } finally {
    await result.file.cleanup();
  }
});

test("rejects overlaps, shared insertion points, and insertion on replacement boundary", async () => {
  const cases = [
    [
      { op: "replace", oldText: "bc", newText: "X" },
      { op: "replace", oldText: "cde", newText: "Y" },
    ],
    [
      { op: "insert_after", anchorText: "bc", newText: "X" },
      { op: "insert_after", anchorText: "bc", newText: "Y" },
    ],
    [
      { op: "replace", oldText: "bc", newText: "X" },
      { op: "insert_after", anchorText: "bc", newText: "Y" },
    ],
  ];
  for (const edits of cases) {
    const file = await fixture("overlap.txt", "abcdef\n");
    try {
      const { service } = createService();
      const read = await service.read({ path: file.path }, file.directory);
      await assert.rejects(
        service.edit({ path: file.path, base: read.details.revision, edits }, file.directory),
        /overlap/,
      );
      assert.equal(await readFile(file.path, "utf8"), "abcdef\n");
    } finally {
      await file.cleanup();
    }
  }
});

test("invalid selectors and occurrences fail closed", async () => {
  const file = await fixture("invalid.txt", "one one\n");
  try {
    const { service } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    for (const [operation, pattern] of [
      [{ op: "replace", oldText: "missing", newText: "x" }, /no exact match/],
      [{ op: "replace", oldText: "one", occurrence: 0, newText: "x" }, /positive 1-indexed/],
      [{ op: "replace", oldText: "one", occurrence: 3, newText: "x" }, /out of range/],
      [{ op: "replace", oldText: "one", occurrence: 1, newText: "one" }, /makes no change/],
    ]) {
      await assert.rejects(
        service.edit(
          { path: file.path, base: read.details.revision, edits: [operation] },
          file.directory,
        ),
        pattern,
      );
    }
    assert.equal(await readFile(file.path, "utf8"), "one one\n");
  } finally {
    await file.cleanup();
  }
});

test("normalizes selector and newText EOL while preserving CRLF, BOM, and mode", async () => {
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
        edits: [{ op: "replace", oldText: "one\ntwo", newText: "first\nsecond" }],
      },
      file.directory,
    );
    const bytes = await readFile(file.path);
    assert.equal(bytes.subarray(0, 3).equals(bom), true);
    assert.equal(bytes.subarray(3).toString("utf8"), "first\r\nsecond\r\n");
    assert.equal((await stat(file.path)).mode, beforeMode);
  } finally {
    await file.cleanup();
  }
});

test("oversized or invalid desired snapshots fail before mutation", async () => {
  const file = await fixture("budget.txt", "small\n");
  try {
    const { service } = createService();
    const first = await service.read({ path: file.path }, file.directory);
    await assert.rejects(
      service.edit(
        {
          path: file.path,
          base: first.details.revision,
          edits: [{ op: "replace", oldText: "small", newText: "x".repeat(32 * 1024 * 1024 + 1) }],
        },
        file.directory,
      ),
      /exceeds snapshot byte budget/,
    );
    assert.equal(await readFile(file.path, "utf8"), "small\n");

    await assert.rejects(
      service.edit(
        {
          path: file.path,
          base: first.details.revision,
          edits: [{ op: "replace", oldText: "small", newText: "bad\0text" }],
        },
        file.directory,
      ),
      /Binary file is not supported/,
    );
    assert.equal(await readFile(file.path, "utf8"), "small\n");
  } finally {
    await file.cleanup();
  }
});

test("an over-cap first preview line commits and returns a bounded success result", async () => {
  const file = await fixture("preview.txt", "small\nsecond\n");
  try {
    const { service } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    const longLine = "p".repeat(9 * 1024);
    const result = await service.edit(
      {
        path: file.path,
        base: read.details.revision,
        edits: [{ op: "replace", oldText: "small", newText: longLine }],
      },
      file.directory,
    );
    assert.match(result.text, /^Applied 1 snapshot edit/u);
    assert.match(result.text, /Edit preview omitted/u);
    assert.ok(Buffer.byteLength(result.text, "utf8") < 1024);
    assert.equal(await readFile(file.path, "utf8"), `${longLine}\nsecond\n`);
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
          edits: [{ op: "replace", oldText: "two", newText: "changed" }],
        },
        file.directory,
      ),
      /Stale revision/,
    );
  } finally {
    await file.cleanup();
  }
});

test("best-effort pre-rename check rejects an adversarial non-cooperating write", async () => {
  const file = await fixture("raced.txt", "original\n");
  try {
    const fileStat = await stat(file.path);
    const commit = atomicReplace(
      file.path,
      Buffer.from(`${"d".repeat(8 * 1024 * 1024)}\n`),
      digestBytes(Buffer.from("original\n")),
      { dev: fileStat.dev, ino: fileStat.ino },
      digestBytes,
    );
    const rejected = assert.rejects(commit, /File changed/u);
    await new Promise((resolve) => setImmediate(resolve));
    await writeFile(file.path, "adversary\n");
    await rejected;
    assert.equal(await readFile(file.path, "utf8"), "adversary\n");
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
          edits: [{ op: "replace", oldText: "same", newText: "changed" }],
        },
        file.directory,
      ),
      /file identity that has been replaced/,
    );
  } finally {
    await file.cleanup();
  }
});

test("hard-link, cancellation, and unsupported-EOL guards remain active", async () => {
  const file = await fixture("linked.txt", "original\n");
  const bare = await fixture("bare.txt", "one\rtwo\r");
  const mixed = await fixture("mixed.txt", "one\r\ntwo\n");
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
    const controller = new AbortController();
    controller.abort();
    await rm(join(file.directory, "alias.txt"));
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
    const { service } = createService();
    await assert.rejects(service.read({ path: bare.path }, bare.directory), /Bare-CR/);
    await assert.rejects(service.read({ path: mixed.path }, mixed.directory), /Mixed CRLF\/LF/);
  } finally {
    await file.cleanup();
    await bare.cleanup();
    await mixed.cleanup();
  }
});

test("evicts old aliases under configured snapshot count", async () => {
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

test("edit accepts revision-header-prefixed and whitespace-wrapped base aliases", async () => {
  const file = await fixture("prefixed.txt", "alpha\nbeta\n");
  try {
    const { service } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    const alias = read.details.revision;
    const edit = await service.edit(
      {
        path: file.path,
        base: `revision:${alias}`,
        edits: [{ op: "replace", oldText: "beta", newText: "omega" }],
      },
      file.directory,
    );
    assert.equal(edit.details.baseRevision, alias);
    assert.equal(await readFile(file.path, "utf8"), "alpha\nomega\n");

    const second = await service.read({ path: file.path }, file.directory);
    await service.edit(
      {
        path: file.path,
        base: `  ${second.details.revision}  `,
        edits: [{ op: "replace", oldText: "omega", newText: "beta" }],
      },
      file.directory,
    );
    assert.equal(await readFile(file.path, "utf8"), "alpha\nbeta\n");
  } finally {
    await file.cleanup();
  }
});

test("unknown prefixed base reports bare-alias guidance and still-held revisions", async () => {
  const file = await fixture("diagnostic.txt", "alpha\n");
  try {
    const { service } = createService();
    const read = await service.read({ path: file.path }, file.directory);
    const held = read.details.revision;
    await assert.rejects(
      service.edit(
        {
          path: file.path,
          base: "revision:zebra22",
          edits: [{ op: "replace", oldText: "a", newText: "b" }],
        },
        file.directory,
      ),
      new RegExp(
        `Unknown or expired revision 'zebra22'.*still holds revision\\(s\\): ${held}.*bare alias word.*revision:`,
      ),
    );
    await assert.rejects(
      service.edit(
        {
          path: file.path,
          base: "zebra22",
          edits: [{ op: "replace", oldText: "a", newText: "b" }],
        },
        file.directory,
      ),
      (error) =>
        error.message.includes("Unknown or expired revision 'zebra22'") &&
        !error.message.includes("bare alias word"),
    );
  } finally {
    await file.cleanup();
  }
});

test("recentAliases lists newest aliases first for diagnostics", () => {
  const store = new SnapshotStore({ maxSnapshots: 8, words: ["a1", "b2", "c3", "d4"] });
  const bytes = (text) => Buffer.from(text, "utf8");
  store.add({ bytes: bytes("1"), text: "1", lines: [] });
  store.add({ bytes: bytes("2"), text: "2", lines: [] });
  store.add({ bytes: bytes("3"), text: "3", lines: [] });
  assert.deepEqual(store.recentAliases(2), ["c3", "b2"]);
});
