/**
summary: "Context-packet package fixture narrowing and path rebasing; split from context-pack.test.js."
read_when:
  - "You change package fixture narrowing and path rebasing behavior."
*/
import assert from "node:assert/strict";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { buildContextPacket, makeWorkspace } from "./context-pack-helpers.js";

test("context_pack resolves relative docs-list scripts before switching to package docs roots", async () => {
  const root = await makeWorkspace();
  const packageRoot = join(root, "packages", "pkg");
  await mkdir(join(packageRoot, "docs", "project"), { recursive: true });
  await writeFile(join(packageRoot, "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(
    join(packageRoot, "docs", "project", "relative-script-ranked.md"),
    "# Relative script ranked\n\nRelative docsListScript survives package-root cwd switching.\n",
    "utf8",
  );
  await writeFile(
    join(root, "docs-list-relative-fake.mjs"),
    "console.log(JSON.stringify({ ok: true, rankedItems: [{ path: 'docs/project/relative-script-ranked.md' }] }));\n",
    "utf8",
  );

  const result = await buildContextPacket(
    {
      objective: "Use relative docs-list script from package cwd",
      cwd: packageRoot,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: "docs-list-relative-fake.mjs" },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["packages/pkg/docs/project/relative-script-ranked.md"],
  );
  assert.match(docs.items[0].content, /Relative docsListScript survives/);
});

test("context_pack rebases package-root repoPath only when provider repoRoot declares that basis", async () => {
  const root = await makeWorkspace();
  const packageRoot = join(root, "packages", "pkg");
  await mkdir(join(packageRoot, "docs", "project"), { recursive: true });
  await writeFile(join(packageRoot, "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(
    join(packageRoot, "docs", "project", "local-ranked.md"),
    "# Local ranked\n\nProvider-root-relative repoPath context.\n",
    "utf8",
  );
  const script = join(root, "docs-list-local-repopath-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      `if (docsRoot !== ${JSON.stringify(packageRoot)}) throw new Error('expected package docs root, got ' + docsRoot);`,
      "console.log(JSON.stringify({ ok: true, repoRoot: docsRoot, rankedItems: [{ repoPath: 'docs/project/local-ranked.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use provider-root-relative docs-list JSON repoPath",
      cwd: packageRoot,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["packages/pkg/docs/project/local-ranked.md"],
  );
  assert.match(docs.items[0].content, /Provider-root-relative repoPath context/);
});

test("context_pack fails closed on package-root repoPath without explicit JSON repoRoot", async () => {
  const root = await makeWorkspace();
  const packageRoot = join(root, "packages", "pkg");
  await mkdir(join(root, "docs", "project"), { recursive: true });
  await mkdir(join(packageRoot, "docs", "project"), { recursive: true });
  await writeFile(join(packageRoot, "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(join(root, "docs", "project", "ranked.md"), "# Root shadow\n", "utf8");
  await writeFile(
    join(packageRoot, "docs", "project", "ranked.md"),
    "# Package ranked\n\nAmbiguous package docs-list repoPath context.\n",
    "utf8",
  );
  const script = join(root, "docs-list-ambiguous-repopath-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      `if (docsRoot !== ${JSON.stringify(packageRoot)}) throw new Error('expected package docs root, got ' + docsRoot);`,
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'docs/project/ranked.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Do not trust ambiguous package docs-list repoPath",
      cwd: packageRoot,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(docs, undefined);
  const serialized = JSON.stringify(result.packet.omissions);
  assert.match(serialized, /repoPath was ambiguous for package-root discovery/);
  assert.match(serialized, /include JSON repoRoot or item\.path/);
  assert.doesNotMatch(serialized, /Root shadow|Ambiguous package docs-list repoPath context/);
  assert.doesNotMatch(serialized, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("context_pack uses package-root path fallback when repoPath basis is ambiguous", async () => {
  const root = await makeWorkspace();
  const packageRoot = join(root, "packages", "pkg");
  await mkdir(join(root, "docs", "project"), { recursive: true });
  await mkdir(join(packageRoot, "docs", "project"), { recursive: true });
  await writeFile(join(packageRoot, "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(join(root, "docs", "project", "ranked.md"), "# Root shadow\n", "utf8");
  await writeFile(
    join(packageRoot, "docs", "project", "ranked.md"),
    "# Package ranked\n\nFallback package docs-list path context.\n",
    "utf8",
  );
  const script = join(root, "docs-list-ambiguous-repopath-with-path-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      `if (docsRoot !== ${JSON.stringify(packageRoot)}) throw new Error('expected package docs root, got ' + docsRoot);`,
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'docs/project/ranked.md', path: 'docs/project/ranked.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use package docs-list path fallback for ambiguous repoPath",
      cwd: packageRoot,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["packages/pkg/docs/project/ranked.md"],
  );
  assert.match(docs.items[0].content, /Fallback package docs-list path context/);
  assert.doesNotMatch(docs.items[0].content, /Root shadow/);
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "docs" &&
        omission.reason === "schema_mismatch" &&
        omission.detail.includes("item.path fallback was attempted"),
    ),
  );
});

test("context_pack screens unsafe path fallback after ambiguous package repoPath", async () => {
  const root = await makeWorkspace();
  const packageRoot = join(root, "packages", "pkg");
  await mkdir(join(root, "docs", "project"), { recursive: true });
  await mkdir(join(packageRoot, "docs", "project"), { recursive: true });
  await writeFile(join(packageRoot, "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(join(root, "docs", "project", "ranked.md"), "# Root shadow\n", "utf8");
  await writeFile(
    join(packageRoot, "docs", "project", "ranked.md"),
    "# Package ranked\n\nUnsafe fallback should not read this content.\n",
    "utf8",
  );
  const script = join(root, "docs-list-ambiguous-repopath-unsafe-path-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      `if (docsRoot !== ${JSON.stringify(packageRoot)}) throw new Error('expected package docs root, got ' + docsRoot);`,
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'docs/project/ranked.md', path: '../secret.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Reject unsafe path fallback for ambiguous repoPath",
      cwd: packageRoot,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(docs, undefined);
  const serialized = JSON.stringify(result.packet.omissions);
  assert.match(serialized, /repoPath was ambiguous for package-root discovery/);
  assert.match(serialized, /parent-traversing path seed omitted/);
  assert.doesNotMatch(serialized, /Root shadow|Unsafe fallback should not read this content/);
  assert.doesNotMatch(serialized, /secret\.md/);
});

test("context_pack consumes JSON items fallback without rankedItems", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "items-only.md"),
    "# Items only\n\nItems fallback context.\n",
    "utf8",
  );
  const script = join(root, "docs-list-items-only-json-fake.mjs");
  await writeFile(
    script,
    "console.log(JSON.stringify({ ok: true, items: [{ repoPath: 'docs/project/items-only.md' }] }));\n",
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use items-only docs-list JSON",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["docs/project/items-only.md"],
  );
  assert.match(docs.items[0].content, /Items fallback context/);
});

test("context_pack preserves valid JSON items while reporting unsupported item shapes", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "valid-mixed.md"),
    "# Valid mixed\n\nMixed JSON item context.\n",
    "utf8",
  );
  const script = join(root, "docs-list-mixed-item-shapes-json-fake.mjs");
  await writeFile(
    script,
    "console.log(JSON.stringify({ ok: true, rankedItems: ['bad-shape', { repoPath: 'docs/project/valid-mixed.md' }] }));\n",
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use mixed docs-list JSON items",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["docs/project/valid-mixed.md"],
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "schema_mismatch",
    ),
  );
});

test("context_pack screens package-local docs-list item.path whitespace before rebasing", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "packages", "pkg", "docs", "project"), { recursive: true });
  await writeFile(join(root, "packages", "pkg", "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(
    join(root, "packages", "pkg", "docs", "project", "ranked.md"),
    "# Package ranked\n",
    "utf8",
  );
  const script = join(root, "docs-list-path-whitespace-json-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      "if (!docsRoot.endsWith('/packages/pkg')) throw new Error('expected package docs root, got ' + docsRoot);",
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ path: ' docs/project/ranked.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use package docs from unsafe path-only docs-list JSON",
      cwd: join(root, "packages", "pkg"),
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  assert.equal(
    result.packet.sections.some((section) => section.provider === "docs"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "docs" &&
        omission.reason === "unsafe_path" &&
        omission.detail.includes("surrounding whitespace"),
    ),
  );
});

test("context_pack screens unsafe package-local JSON path fallbacks before rebasing", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "packages", "pkg", "docs", "project"), { recursive: true });
  await writeFile(join(root, "packages", "pkg", "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(join(root, "packages", "pkg", "docs", "project", "safe.md"), "# Safe\n", "utf8");
  const script = join(root, "docs-list-unsafe-path-fallbacks-json-fake.mjs");
  await writeFile(
    script,
    [
      "console.log(JSON.stringify({ ok: true, rankedItems: [",
      "  { path: '../secret.md' },",
      "  { path: '/tmp/secret.md' },",
      "  { path: 'file:///tmp/secret.md' },",
      "  { path: 'docs/project/safe.md' }",
      "] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use docs with unsafe path fallbacks",
      cwd: join(root, "packages", "pkg"),
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["packages/pkg/docs/project/safe.md"],
  );
  assert.equal(
    result.packet.omissions.filter(
      (omission) => omission.provider === "docs" && omission.reason === "unsafe_path",
    ).length,
    3,
  );
});

test("context_pack screens docs-list discovered paths with the shared path policy", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
  await writeFile(join(root, "node_modules", "pkg", "README.md"), "# Vendor\n", "utf8");
  const script = join(root, "docs-list-fake.mjs");
  await writeFile(
    script,
    "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'node_modules/pkg/README.md' }] }));\n",
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs",
      cwd: root,
      repoRoot: root,
      providers: { docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(docs, undefined);
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.reason === "unsafe_path" && omission.detail.includes("generated/vendor"),
    ),
  );
});

test("context_pack screens docs-list control-character paths without dropping safe discoveries", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "safe-after-control.md"),
    "# Safe after control\n",
    "utf8",
  );
  const script = join(root, "docs-list-fake.mjs");
  await writeFile(
    script,
    [
      "console.log(JSON.stringify({ ok: true, rankedItems: [",
      "  { repoPath: '\\u000bdocs/project/leading-control.md' },",
      "  { repoPath: 'docs/project/bad\\u007fname.md' },",
      "  { repoPath: 'docs/project/trailing-control.md\\u0085' },",
      "  { repoPath: 'docs/project/safe-after-control.md' }",
      "] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs",
      cwd: root,
      repoRoot: root,
      providers: { docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["docs/project/safe-after-control.md"],
  );
  assert.equal(
    result.packet.omissions.filter(
      (omission) =>
        omission.provider === "docs" &&
        omission.reason === "unsafe_path" &&
        omission.detail.includes("control characters"),
    ).length,
    3,
  );
});
