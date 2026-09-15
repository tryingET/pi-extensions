/** Regression controls for the current-main compatibility review. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildContextPacket, formatContextPacket } from "../src/context-pack.js";
import { cachedRipwireText } from "../src/ripwire-cache.js";
import { fileExists } from "./context-pack-helpers.js";

const providers = { agents: "off", docs: "off", git: "off", session: "off", ripwire: "off" };

test("dot-prefixed child names cannot bypass cache/source containment", async () => {
  const root = await mkdtemp(join(tmpdir(), "cache-dot-"));
  try {
    for (const [sourceRoot, cacheRoot] of [
      [join(root, "source"), join(root, "source", "..cache")],
      [join(root, "parent", "..source"), join(root, "parent")],
    ]) {
      await mkdir(sourceRoot, { recursive: true, mode: 0o700 });
      const before = await readdir(sourceRoot);
      let calls = 0;
      await assert.rejects(
        cachedRipwireText({
          sourceRoot,
          cacheRoot,
          identity: {},
          compute: async () => {
            calls++;
            return "{}";
          },
          parse: JSON.parse,
        }),
        /invalid_cache_root/,
      );
      assert.equal(calls, 0);
      assert.deepEqual(await readdir(sourceRoot), before);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mutation probes distinguish existing files from absent files", async () => {
  const root = await mkdtemp(join(tmpdir(), "probe-positive-"));
  try {
    const path = join(root, "mutation");
    assert.equal(await fileExists(path), false);
    await writeFile(path, "sentinel");
    assert.equal(await fileExists(path), true);
    await rm(path);
    assert.equal(await fileExists(path), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function selectionPacket(root, selection) {
  const result = await buildContextPacket({ objective: "Inspect code", providers }, { cwd: root });
  const content = `${selection.path}:${selection.line}\nbool operator<(const Item& other) const`;
  result.packet.sections = [
    {
      id: "ripwire",
      provider: "ripwire",
      title: "Code",
      authority: "Source evidence",
      items: [
        {
          id: "symbol",
          kind: "symbol",
          contentMode: "signature",
          content,
          bytes: Buffer.byteLength(content),
          estimatedTokens: 50,
          rationale: "test",
          provenance: { provider: "ripwire", ...selection, symbol: selection.name },
        },
      ],
    },
  ];
  return formatContextPacket(result);
}

test("visible code selection preserves operator characters and long paths losslessly", async () => {
  const root = await mkdtemp(join(tmpdir(), "selection-json-"));
  try {
    const selection = {
      path: `${"segment/".repeat(36)}<compare>.cpp`,
      name: "operator<",
      line: 17,
      contentSha256: "a".repeat(64),
    };
    const text = await selectionPacket(root, selection);
    assert.match(text, /- symbol: operator‹/);
    const encoded = /\n# code\.selection\.json\n([^\n]+)\n/u.exec(text)?.[1];
    assert.ok(encoded, "A display label is not a lossless expansion contract");
    assert.deepEqual(JSON.parse(encoded), selection);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unrepresentable upstream selectors advertise native read instead of invalid JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "selection-unsupported-"));
  try {
    const text = await selectionPacket(root, {
      path: "compare.cpp",
      name: "operator,",
      line: 1,
      contentSha256: "a".repeat(64),
    });
    assert.doesNotMatch(text, /# code\.selection\.json/);
    assert.match(text, /Exact expansion selector unavailable; use ordinary Pi read\/search/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function markdownPacket(root) {
  return buildContextPacket(
    {
      objective: "Read note",
      seeds: [{ kind: "path", value: "note.md" }],
      providers: { ...providers, docs: "required" },
    },
    { cwd: root, docsListScript: join(root, "absent-docs-list.mjs") },
  );
}

test("Markdown acquisition does not use an unbounded readFile allocation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bounded-doc-"));
  try {
    const path = join(root, "note.md");
    await writeFile(path, "# Note\nBounded source content.\n");
    const handle = await open(path);
    const proto = Object.getPrototypeOf(handle);
    await handle.close();
    t.mock.method(proto, "readFile", () => {
      throw new Error("unbounded readFile prohibited");
    });
    const result = await markdownPacket(root);
    assert.ok(result.packet.sections.some((s) => s.provider === "docs" && s.items.length === 1));
  } finally {
    t.mock.restoreAll();
    await rm(root, { recursive: true, force: true });
  }
});

test("same-length Markdown changes during a read are rejected", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "changed-doc-"));
  try {
    const path = join(root, "note.md");
    await writeFile(path, "old\n");
    const handle = await open(path);
    const proto = Object.getPrototypeOf(handle);
    const original = proto.stat;
    await handle.close();
    let calls = 0;
    t.mock.method(proto, "stat", async function (...args) {
      if (++calls === 2) {
        await writeFile(path, "new\n");
        await utimes(path, 1, 1);
      }
      return original.apply(this, args);
    });
    const result = await markdownPacket(root);
    assert.equal(calls, 2);
    assert.equal(
      result.packet.sections.some((s) => s.provider === "docs" && s.items.length),
      false,
    );
    assert.ok(result.packet.omissions.some((o) => o.provider === "docs" && o.reason === "blocked"));
  } finally {
    t.mock.restoreAll();
    await rm(root, { recursive: true, force: true });
  }
});
