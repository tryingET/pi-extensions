/**
summary: "Context-packet docs-list structured discovery and trust; split from context-pack.test.js."
read_when:
  - "You change docs-list structured discovery and trust behavior."
*/
import assert from "node:assert/strict";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { buildContextPacket, fileExists, makeWorkspace } from "./context-pack-helpers.js";

test("context_pack discovers ranked Markdown docs through docs-list when available", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "auto.md"),
    "# Auto\n\nRanked docs-list context.\n",
    "utf8",
  );
  const script = join(root, "docs-list-fake.mjs");
  await writeFile(
    script,
    "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'docs/project/auto.md' }] }));\n",
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs for implementation",
      cwd: root,
      repoRoot: root,
      providers: { docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(docs.items.length, 1);
  assert.equal(docs.items[0].provenance.path, "docs/project/auto.md");
  assert.match(docs.items[0].content, /Ranked docs-list context/);
});

test("context_pack consumes structured docs-list JSON using repo-relative ranked items", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "packages", "pkg", "docs", "project"), { recursive: true });
  await writeFile(
    join(root, "packages", "pkg", "docs", "project", "ranked.md"),
    "# Ranked JSON\n\nStructured docs-list context.\n",
    "utf8",
  );
  const script = join(root, "docs-list-json-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      "if (!docsRoot.endsWith('/packages/pkg')) throw new Error('expected package docs root, got ' + docsRoot);",
      "if (process.cwd() !== docsRoot) throw new Error('expected cwd to match docs root, got ' + process.cwd());",
      "const payload = {",
      "  items: [{ path: 'docs/project/wrong.md', repoPath: 'docs/project/wrong.md' }],",
      "  rankedItems: [",
      "    { path: 'docs/project/local.md', repoPath: 'packages/pkg/docs/project/ranked.md' },",
      "    { path: 'docs/project/unsafe.md', repoPath: ' node_modules/pkg/README.md ' }",
      "  ],",
      "  ok: true",
      "};",
      "console.log(JSON.stringify(payload));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs for implementation",
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
  assert.match(docs.items[0].content, /Structured docs-list context/);
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.reason === "unsafe_path" && omission.detail.includes("surrounding whitespace"),
    ),
  );
});

test("context_pack accepts bounded docs-list JSON larger than the legacy buffer", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "large-workspace-ranked.md"),
    "# Large workspace ranked\n\nSelected from a bounded large docs-list payload.\n",
    "utf8",
  );
  const script = join(root, "docs-list-large-json-fake.mjs");
  await writeFile(
    script,
    [
      "const filler = 'x'.repeat(1_200_000);",
      "console.log(JSON.stringify({",
      "  ok: true,",
      "  items: [{ path: 'ignored.md', summary: filler }],",
      "  rankedItems: [{ repoPath: 'docs/project/large-workspace-ranked.md' }]",
      "}));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use ranked docs from a large monorepo inventory",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { docsListScript: script },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["docs/project/large-workspace-ranked.md"],
  );
  assert.match(docs.items[0].content, /bounded large docs-list payload/);
  assert.equal(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "unavailable",
    ),
    false,
  );
});

test("context_pack fails closed when docs-list output exceeds the bounded buffer", async () => {
  const root = await makeWorkspace();
  const script = join(root, "docs-list-oversized-json-fake.mjs");
  await writeFile(
    script,
    [
      "const secret = 'OVERSIZED_DOCS_SECRET_'.repeat(220_000);",
      "console.log(JSON.stringify({ ok: true, rankedItems: [], secret }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Reject an oversized docs-list inventory",
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
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "unavailable",
    ),
  );
  assert.equal(JSON.stringify(result.packet.omissions).includes("OVERSIZED_DOCS_SECRET"), false);
});

test("context_pack keeps JSON repoPath in the caller repo-root basis", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "packages", "pkg", "docs", "project"), { recursive: true });
  await writeFile(join(root, "packages", "pkg", "package.json"), '{"name":"pkg"}\n', "utf8");
  await writeFile(join(root, "docs", "project", "root-shadow.md"), "# Root shadow\n", "utf8");
  await writeFile(
    join(root, "packages", "pkg", "docs", "project", "local-ranked.md"),
    "# Local ranked\n\nRepo-root-relative repoPath context.\n",
    "utf8",
  );
  const script = join(root, "docs-list-repopath-basis-fake.mjs");
  await writeFile(
    script,
    [
      "const docsArgIndex = process.argv.indexOf('--docs') + 1;",
      "const docsRoot = process.argv[docsArgIndex];",
      "if (!docsRoot.endsWith('/packages/pkg')) throw new Error('expected package docs root, got ' + docsRoot);",
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ path: 'docs/project/root-shadow.md', repoPath: 'packages/pkg/docs/project/local-ranked.md' }] }));",
    ].join("\n"),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use repo-root-relative docs-list JSON repoPath",
      cwd: join(root, "packages", "pkg"),
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
  assert.match(docs.items[0].content, /Repo-root-relative repoPath context/);
  assert.doesNotMatch(docs.items[0].content, /Root shadow/);
});

test("context_pack treats invalid docs-list JSON as schema mismatch without text fallback", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "invalid-json-fallback.md"),
    "# Invalid JSON fallback\n\nThis must not be selected from malformed JSON.\n",
    "utf8",
  );
  const script = join(root, "docs-list-invalid-json-fake.mjs");
  await writeFile(
    script,
    ["console.log('docs/project/invalid-json-fallback.md');", "console.log('{ not json');"].join(
      String.fromCharCode(10),
    ),
    "utf8",
  );
  await chmod(script, 0o755);

  const result = await buildContextPacket(
    {
      objective: "Use docs from invalid JSON output",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    },
    { cwd: root, docsListScript: script },
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
        omission.detail.includes("JSON output was invalid"),
    ),
  );
});

test("context_pack honors DOCS_LIST_SCRIPT only with explicit trusted override", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "env-ranked.md"),
    "# Env ranked\n\nDOCS_LIST_SCRIPT context.\n",
    "utf8",
  );
  const script = join(root, "docs-list-env-fake.mjs");
  await writeFile(
    script,
    "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'docs/project/env-ranked.md' }] }));\n",
    "utf8",
  );
  await chmod(script, 0o755);
  const previous = process.env.DOCS_LIST_SCRIPT;
  const previousTrust = process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST;

  try {
    process.env.DOCS_LIST_SCRIPT = script;
    process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST = "1";
    const result = await buildContextPacket({
      objective: "Use docs-list env configuration",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "required", git: "off", sci: "off" },
    });

    const docs = result.packet.sections.find((section) => section.provider === "docs");
    assert.deepEqual(
      docs.items.map((item) => item.provenance.path),
      ["docs/project/env-ranked.md"],
    );
    assert.match(docs.items[0].content, /DOCS_LIST_SCRIPT context/);
  } finally {
    if (previous === undefined) delete process.env.DOCS_LIST_SCRIPT;
    else process.env.DOCS_LIST_SCRIPT = previous;
    if (previousTrust === undefined) delete process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST;
    else process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST = previousTrust;
  }
});

test("context_pack ignores process docs-list env overrides unless trusted override is explicit", async () => {
  for (const envName of ["DOCS_LIST_SCRIPT", "PI_CONTEXT_PACKER_DOCS_LIST"]) {
    const root = await makeWorkspace();
    const script = join(root, `docs-list-mutating-${envName}.mjs`);
    const mutationPath = join(root, "MUTATED.txt");
    await writeFile(
      script,
      [
        "import { writeFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        "writeFileSync(join(process.cwd(), 'MUTATED.txt'), 'mutated');",
        "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'docs/project/note.md' }] }));",
      ].join(String.fromCharCode(10)),
      "utf8",
    );
    await chmod(script, 0o755);
    const previousHome = process.env.HOME;
    const previousDocsListScript = process.env.DOCS_LIST_SCRIPT;
    const previousContextDocsList = process.env.PI_CONTEXT_PACKER_DOCS_LIST;
    const previousTrust = process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST;

    try {
      process.env.HOME = "";
      delete process.env.DOCS_LIST_SCRIPT;
      delete process.env.PI_CONTEXT_PACKER_DOCS_LIST;
      process.env[envName] = script;
      delete process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST;
      const result = await buildContextPacket(
        {
          objective: `Do not execute untrusted ${envName} docs-list override`,
          cwd: root,
          repoRoot: root,
          providers: { agents: "off", docs: "required", git: "off", sci: "off" },
        },
        { disableDefaultDocsListScript: true },
      );

      assert.equal(await fileExists(mutationPath), false);
      assert.equal(
        result.packet.sections.some((section) => section.provider === "docs"),
        false,
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
      if (previousContextDocsList === undefined) delete process.env.PI_CONTEXT_PACKER_DOCS_LIST;
      else process.env.PI_CONTEXT_PACKER_DOCS_LIST = previousContextDocsList;
      if (previousTrust === undefined) delete process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST;
      else process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST = previousTrust;
    }
  }
});

test("context_pack trusts host docsListScript without noisy process override omissions", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "trusted-host.md"),
    "# Trusted host docs-list\n",
    "utf8",
  );
  const trustedScript = join(root, "trusted-docs-list.mjs");
  const processOverrideScript = join(root, "ignored-process-docs-list.mjs");
  const mutationPath = join(root, "MUTATED_BY_PROCESS_OVERRIDE.txt");
  await writeFile(
    trustedScript,
    "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'docs/project/trusted-host.md' }] }));\n",
    "utf8",
  );
  await writeFile(
    processOverrideScript,
    [
      "import { writeFileSync } from 'node:fs';",
      "import { join } from 'node:path';",
      "writeFileSync(join(process.cwd(), 'MUTATED_BY_PROCESS_OVERRIDE.txt'), 'mutated');",
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'docs/project/note.md' }] }));",
    ].join(String.fromCharCode(10)),
    "utf8",
  );
  const previousDocsListScript = process.env.DOCS_LIST_SCRIPT;
  const previousContextDocsList = process.env.PI_CONTEXT_PACKER_DOCS_LIST;
  const previousTrust = process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST;

  try {
    process.env.DOCS_LIST_SCRIPT = processOverrideScript;
    delete process.env.PI_CONTEXT_PACKER_DOCS_LIST;
    delete process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST;
    const result = await buildContextPacket(
      {
        objective: "Use trusted host docs-list script without process override noise",
        cwd: root,
        repoRoot: root,
        providers: { agents: "off", docs: "required", git: "off", sci: "off" },
      },
      { docsListScript: trustedScript, disableDefaultDocsListScript: true },
    );

    const docs = result.packet.sections.find((section) => section.provider === "docs");
    assert.deepEqual(
      docs.items.map((item) => item.provenance.path),
      ["docs/project/trusted-host.md"],
    );
    assert.equal(await fileExists(mutationPath), false);
    assert.equal(
      result.packet.omissions.some((omission) => omission.detail.includes("override ignored")),
      false,
    );
  } finally {
    if (previousDocsListScript === undefined) delete process.env.DOCS_LIST_SCRIPT;
    else process.env.DOCS_LIST_SCRIPT = previousDocsListScript;
    if (previousContextDocsList === undefined) delete process.env.PI_CONTEXT_PACKER_DOCS_LIST;
    else process.env.PI_CONTEXT_PACKER_DOCS_LIST = previousContextDocsList;
    if (previousTrust === undefined) delete process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST;
    else process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST = previousTrust;
  }
});

test("context_pack does not derive docs-list executable identity from HOME", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "docs", "project"), { recursive: true });
  await writeFile(join(root, "docs", "project", "note.md"), "# Safe note\n", "utf8");
  const evilHome = join(root, "evil-home");
  const evilScriptDir = join(evilHome, "ai-society", "core", "agent-scripts", "scripts");
  const mutationPath = join(root, "MUTATED_BY_HOME.txt");
  await mkdir(evilScriptDir, { recursive: true });
  await writeFile(
    join(evilScriptDir, "docs-list.mjs"),
    [
      "import { writeFileSync } from 'node:fs';",
      "import { join } from 'node:path';",
      "writeFileSync(join(process.cwd(), 'MUTATED_BY_HOME.txt'), 'mutated');",
      "console.log(JSON.stringify({ ok: true, rankedItems: [{ repoPath: 'docs/project/note.md' }] }));",
    ].join(String.fromCharCode(10)),
    "utf8",
  );
  const previousHome = process.env.HOME;
  const previousDocsListScript = process.env.DOCS_LIST_SCRIPT;
  const previousContextDocsList = process.env.PI_CONTEXT_PACKER_DOCS_LIST;
  const previousTrust = process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST;

  try {
    process.env.HOME = evilHome;
    delete process.env.DOCS_LIST_SCRIPT;
    delete process.env.PI_CONTEXT_PACKER_DOCS_LIST;
    delete process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST;
    await buildContextPacket(
      {
        objective: "Do not execute HOME-derived docs-list scripts",
        cwd: root,
        repoRoot: root,
        providers: { agents: "off", docs: "required", git: "off", sci: "off" },
      },
      { disableDefaultDocsListScript: true },
    );

    assert.equal(await fileExists(mutationPath), false);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousDocsListScript === undefined) delete process.env.DOCS_LIST_SCRIPT;
    else process.env.DOCS_LIST_SCRIPT = previousDocsListScript;
    if (previousContextDocsList === undefined) delete process.env.PI_CONTEXT_PACKER_DOCS_LIST;
    else process.env.PI_CONTEXT_PACKER_DOCS_LIST = previousContextDocsList;
    if (previousTrust === undefined) delete process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST;
    else process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_DOCS_LIST = previousTrust;
  }
});
