/**
summary: "Context-packet package docs roots and nested package discovery; split from context-pack.test.js."
read_when:
  - "You change package docs roots and nested package discovery behavior."
*/
import assert from "node:assert/strict";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { buildContextPacket, makeWorkspace } from "./context-pack-helpers.js";

test("context_pack discovers package docs from a package subdirectory cwd", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "packages", "pkg", "src"), { recursive: true });
  await mkdir(join(root, "packages", "pkg", "docs", "project"), { recursive: true });
  await writeFile(join(root, "packages", "pkg", "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(
    join(root, "packages", "pkg", "docs", "project", "subdir-ranked.md"),
    "# Subdir ranked\n\nPackage subdir docs-list context.\n",
    "utf8",
  );
  const script = join(root, "docs-list-subdir-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      "if (!docsRoot.endsWith('/packages/pkg')) throw new Error('expected package root, got ' + docsRoot);",
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'packages/pkg/docs/project/subdir-ranked.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use package docs from a source subdirectory",
      cwd: join(root, "packages", "pkg", "src"),
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["packages/pkg/docs/project/subdir-ranked.md"],
  );
  assert.match(docs.items[0].content, /Package subdir docs-list context/);
});

test("context_pack prefers package roots over nested README docs-list markers", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "packages", "pkg", "src", "feature"), { recursive: true });
  await mkdir(join(root, "packages", "pkg", "docs", "project"), { recursive: true });
  await writeFile(join(root, "packages", "pkg", "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(
    join(root, "packages", "pkg", "src", "feature", "README.md"),
    "# Feature\n",
    "utf8",
  );
  await writeFile(
    join(root, "packages", "pkg", "docs", "project", "package-ranked.md"),
    "# Package ranked\n\nPackage-root docs should win over nested README.\n",
    "utf8",
  );
  const script = join(root, "docs-list-root-priority-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      "if (!docsRoot.endsWith('/packages/pkg')) throw new Error('expected package root, got ' + docsRoot);",
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'packages/pkg/docs/project/package-ranked.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use package docs from nested source docs",
      cwd: join(root, "packages", "pkg", "src", "feature"),
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["packages/pkg/docs/project/package-ranked.md"],
  );
  assert.match(docs.items[0].content, /Package-root docs should win/);
});

test("context_pack still runs docs-list when unsafe seeds were omitted and no safe docs seed exists", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "auto-after-unsafe.md"),
    "# Auto after unsafe\n\nRanked context still available.\n",
    "utf8",
  );
  const script = join(root, "docs-list-fake.mjs");
  await writeFile(
    script,
    "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'docs/project/auto-after-unsafe.md' }] }));\n",
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "../unsafe.md" }],
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(docs.items.length, 1);
  assert.equal(docs.items[0].provenance.path, "docs/project/auto-after-unsafe.md");
  assert.ok(result.packet.omissions.some((omission) => omission.reason === "unsafe_path"));
});

test("context_pack records an omission when structured docs-list returns no ranked Markdown", async () => {
  const root = await makeWorkspace();
  const script = join(root, "docs-list-empty-json-fake.mjs");
  await writeFile(script, "console.log(JSON.stringify({ ok: true, rankedItems: [] }));\n", "utf8");
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(docs, undefined);
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "no_results",
    ),
  );
});

test("context_pack reports docs-list ok=false JSON as provider failure", async () => {
  const root = await makeWorkspace();
  const script = join(root, "docs-list-ok-false-json-fake.mjs");
  await writeFile(
    script,
    "console.log(JSON.stringify({ ok: false, errors: ['index missing'] }));\n",
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  assert.equal(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "no_results",
    ),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "docs" &&
        omission.reason === "unavailable" &&
        omission.detail.includes("ok=false"),
    ),
  );
});

test("context_pack fails closed when docs-list JSON repoRoot is outside caller repoRoot", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "outside-root.md"),
    "# Outside root shadow\n",
    "utf8",
  );
  const script = join(root, "docs-list-outside-reporoot-json-fake.mjs");
  await writeFile(
    script,
    [
      "console.log(JSON.stringify({",
      "  ok: true,",
      "  repoRoot: '/tmp/outside-context-packer-root',",
      "  rankedItems: [{ repoPath: 'docs/project/outside-root.md' }]",
      "}));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use docs-list output with mismatched root",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  assert.equal(
    result.packet.sections.some((section) => section.provider === "docs"),
    false,
  );
  assert.equal(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "no_results",
    ),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "docs" &&
        omission.reason === "schema_mismatch" &&
        omission.detail.includes("outside the caller repoRoot"),
    ),
  );
});

test("context_pack reports docs-list JSON schema drift without text fallback", async () => {
  const root = await makeWorkspace();
  const script = join(root, "docs-list-schema-drift-json-fake.mjs");
  await writeFile(
    script,
    "console.log(JSON.stringify({ ok: true, results: [{ repoPath: 'docs/project/note.md' }] }));\n",
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  assert.equal(
    result.packet.sections.some((section) => section.provider === "docs"),
    false,
  );
  assert.equal(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "no_results",
    ),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "schema_mismatch",
    ),
  );
});

test("context_pack reports unsupported docs-list JSON item shapes as schema drift", async () => {
  const root = await makeWorkspace();
  const script = join(root, "docs-list-item-shape-drift-json-fake.mjs");
  await writeFile(
    script,
    "console.log(JSON.stringify({ ok: true, rankedItems: ['docs/project/note.md'] }));\n",
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  assert.equal(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "no_results",
    ),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "schema_mismatch",
    ),
  );
});

test("context_pack reports empty docs-list JSON path values as unsafe provider output", async () => {
  const root = await makeWorkspace();
  const script = join(root, "docs-list-empty-path-json-fake.mjs");
  await writeFile(
    script,
    "console.log(JSON.stringify({ ok: true, rankedItems: [{ path: '' }] }));\n",
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  assert.equal(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "no_results",
    ),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "docs" &&
        omission.reason === "unsafe_path" &&
        omission.detail.includes("path is empty"),
    ),
  );
});

test("context_pack avoids silently narrowing docs discovery to nested package fixtures", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "packages", "pkg", "src", "fixtures", "sample"), {
    recursive: true,
  });
  await mkdir(join(root, "packages", "pkg", "docs", "project"), { recursive: true });
  await writeFile(join(root, "packages", "pkg", "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(
    join(root, "packages", "pkg", "src", "fixtures", "sample", "package.json"),
    '{"name":"fixture"}\n',
    "utf8",
  );
  await writeFile(
    join(root, "packages", "pkg", "docs", "project", "fixture-parent.md"),
    "# Fixture parent\n\nParent package docs should remain discoverable.\n",
    "utf8",
  );
  const script = join(root, "docs-list-nested-package-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      "if (!docsRoot.endsWith('/packages/pkg')) throw new Error('expected parent package docs root, got ' + docsRoot);",
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'packages/pkg/docs/project/fixture-parent.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use package docs from a nested fixture package",
      cwd: join(root, "packages", "pkg", "src", "fixtures", "sample"),
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["packages/pkg/docs/project/fixture-parent.md"],
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "ambiguous_root",
    ),
  );
});

test("context_pack avoids narrowing non-package repo docs to nested fixture packages", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "fixtures", "sample"), { recursive: true });
  await writeFile(join(root, "fixtures", "sample", "package.json"), '{"name":"fixture"}\n', "utf8");
  await writeFile(
    join(root, "docs", "project", "repo-root.md"),
    "# Repo root docs\n\nNon-package repo docs should remain discoverable.\n",
    "utf8",
  );
  const script = join(root, "docs-list-non-package-fixture-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      `if (docsRoot !== ${JSON.stringify(root)}) throw new Error('expected repo root, got ' + docsRoot);`,
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'docs/project/repo-root.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use repo docs from a nested fixture package",
      cwd: join(root, "fixtures", "sample"),
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["docs/project/repo-root.md"],
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "ambiguous_root",
    ),
  );
});

test("context_pack avoids narrowing standalone package docs to nested fixture packages", async () => {
  const root = await makeWorkspace();
  await writeFile(join(root, "package.json"), '{"name":"standalone-pkg"}\n', "utf8");
  await mkdir(join(root, "fixtures", "sample"), { recursive: true });
  await writeFile(join(root, "fixtures", "sample", "package.json"), '{"name":"fixture"}\n', "utf8");
  await writeFile(
    join(root, "docs", "project", "standalone.md"),
    "# Standalone package\n\nRoot package docs should remain discoverable.\n",
    "utf8",
  );
  const script = join(root, "docs-list-standalone-fixture-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      "if (docsRoot !== process.cwd()) throw new Error('expected cwd to match docs root');",
      `if (docsRoot !== ${JSON.stringify(root)}) throw new Error('expected standalone package root, got ' + docsRoot);`,
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'docs/project/standalone.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use package docs from a standalone fixture package",
      cwd: join(root, "fixtures", "sample"),
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["docs/project/standalone.md"],
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "ambiguous_root",
    ),
  );
});

test("context_pack does not treat sample package names as fixture aliases", async () => {
  const root = await makeWorkspace();
  await writeFile(join(root, "package.json"), '{"name":"monorepo"}\n', "utf8");
  await mkdir(join(root, "packages", "sample", "docs", "project"), { recursive: true });
  await writeFile(join(root, "packages", "sample", "package.json"), '{"name":"sample"}\n', "utf8");
  await writeFile(
    join(root, "packages", "sample", "docs", "project", "pkg.md"),
    "# Sample package\n\nLegitimate sample package docs.\n",
    "utf8",
  );
  await writeFile(join(root, "docs", "project", "root-shadow.md"), "# Root shadow\n", "utf8");
  const script = join(root, "docs-list-sample-package-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      "if (!docsRoot.endsWith('/packages/sample')) throw new Error('expected sample package docs root, got ' + docsRoot);",
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'packages/sample/docs/project/pkg.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use sample package docs",
      cwd: join(root, "packages", "sample"),
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["packages/sample/docs/project/pkg.md"],
  );
  assert.match(docs.items[0].content, /Legitimate sample package docs/);
  assert.doesNotMatch(docs.items[0].content, /Root shadow/);
});

test("context_pack does not treat tests path packages as fixture aliases", async () => {
  const root = await makeWorkspace();
  await writeFile(join(root, "package.json"), '{"name":"standalone-pkg"}\n', "utf8");
  await mkdir(join(root, "tests", "sample-package", "docs", "project"), { recursive: true });
  await writeFile(
    join(root, "tests", "sample-package", "package.json"),
    '{"name":"sample-package"}\n',
    "utf8",
  );
  await writeFile(
    join(root, "tests", "sample-package", "docs", "project", "nested.md"),
    "# Tests package\n\nTests-path package docs should stay nearest-package scoped.\n",
    "utf8",
  );
  const script = join(root, "docs-list-tests-path-package-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      "if (!docsRoot.endsWith('/tests/sample-package')) throw new Error('expected tests-path package docs root, got ' + docsRoot);",
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'tests/sample-package/docs/project/nested.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use docs from a tests-path nested package",
      cwd: join(root, "tests", "sample-package"),
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["tests/sample-package/docs/project/nested.md"],
  );
});

test("context_pack preserves nested package ambiguity when docs-list is unavailable", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "fixtures", "sample"), { recursive: true });
  await writeFile(join(root, "fixtures", "sample", "package.json"), '{"name":"fixture"}\n', "utf8");
  const previousHome = process.env.HOME;
  const previousDocsListScript = process.env.DOCS_LIST_SCRIPT;
  const previousContextPackerDocsList = process.env.PI_CONTEXT_PACKER_DOCS_LIST;

  try {
    process.env.HOME = "";
    delete process.env.DOCS_LIST_SCRIPT;
    delete process.env.PI_CONTEXT_PACKER_DOCS_LIST;
    const result = await buildContextPacket(
      {
        objective: "Use repo docs from nested fixture package without docs-list",
        cwd: join(root, "fixtures", "sample"),
        repoRoot: root,
        providers: { agents: "off", docs: "required", git: "off", sci: "off" },
      },
      {
        cwd: root,
        docsListScript: join(root, "missing-docs-list.mjs"),
        disableDefaultDocsListScript: true,
      },
    );

    assert.ok(
      result.packet.omissions.some(
        (omission) => omission.provider === "docs" && omission.reason === "ambiguous_root",
      ),
    );
    assert.ok(
      result.packet.omissions.some(
        (omission) => omission.provider === "docs" && omission.reason === "unavailable",
      ),
    );
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousDocsListScript === undefined) delete process.env.DOCS_LIST_SCRIPT;
    else process.env.DOCS_LIST_SCRIPT = previousDocsListScript;
    if (previousContextPackerDocsList === undefined) delete process.env.PI_CONTEXT_PACKER_DOCS_LIST;
    else process.env.PI_CONTEXT_PACKER_DOCS_LIST = previousContextPackerDocsList;
  }
});

test("context_pack preserves nested package ambiguity when docs-list fails", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "packages", "pkg", "fixtures", "sample"), { recursive: true });
  await writeFile(join(root, "packages", "pkg", "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(
    join(root, "packages", "pkg", "fixtures", "sample", "package.json"),
    '{"name":"fixture"}\n',
    "utf8",
  );
  const script = join(root, "docs-list-failing-nested-package-fake.mjs");
  await writeFile(script, "process.exit(2);\n", "utf8");
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use package docs from a nested fixture package",
      cwd: join(root, "packages", "pkg", "fixtures", "sample"),
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "ambiguous_root",
    ),
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "unavailable",
    ),
  );
});

test("context_pack keeps legitimate nested package docs rooted at nearest package", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "packages", "group", "pkg", "src"), { recursive: true });
  await mkdir(join(root, "packages", "group", "pkg", "docs", "project"), { recursive: true });
  await writeFile(join(root, "packages", "group", "package.json"), '{"name":"group"}\n', "utf8");
  await writeFile(
    join(root, "packages", "group", "pkg", "package.json"),
    '{"name":"pkg"}\n',
    "utf8",
  );
  await writeFile(
    join(root, "packages", "group", "pkg", "docs", "project", "nested.md"),
    "# Nested package\n\nNearest package docs should remain discoverable.\n",
    "utf8",
  );
  const script = join(root, "docs-list-legitimate-nested-package-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      "if (!docsRoot.endsWith('/packages/group/pkg')) throw new Error('expected nearest package docs root, got ' + docsRoot);",
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'packages/group/pkg/docs/project/nested.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use docs from a legitimate nested package",
      cwd: join(root, "packages", "group", "pkg", "src"),
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["packages/group/pkg/docs/project/nested.md"],
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "ambiguous_root",
    ),
  );
});

test("context_pack rebases docs-list item.path fallback from package roots", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "packages", "pkg", "docs", "project"), { recursive: true });
  await writeFile(join(root, "packages", "pkg", "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(join(root, "docs", "project", "ranked.md"), "# Root shadow\n", "utf8");
  await writeFile(
    join(root, "packages", "pkg", "docs", "project", "ranked.md"),
    "# Package ranked\n\nPackage-local docs-list path fallback.\n",
    "utf8",
  );
  const script = join(root, "docs-list-path-only-json-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      "if (!docsRoot.endsWith('/packages/pkg')) throw new Error('expected package docs root, got ' + docsRoot);",
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ path: 'docs/project/ranked.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use package docs from path-only docs-list JSON",
      cwd: join(root, "packages", "pkg"),
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
  assert.match(docs.items[0].content, /Package-local docs-list path fallback/);
  assert.doesNotMatch(docs.items[0].content, /Root shadow/);
});
