/**
summary: "Exercise context-packet assembly, safety boundaries, budgets, discovery, and formatting."
read_when:
  - "You change core packet behavior, docs intake, instruction loading, omissions, or measurements."
*/

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildContextPacket as buildContextPacketImpl,
  contextPacketToolResult,
  formatContextPacket,
} from "../src/context-pack.js";

const buildContextPacket = (input, env = {}) =>
  buildContextPacketImpl(input, { cwd: input.cwd, ...env });

const makeWorkspace = async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-context-pack-"));
  await mkdir(join(root, "docs", "project"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# AGENTS\n\nUse bounded read-only context.\n", "utf8");
  await writeFile(
    join(root, "docs", "project", "note.md"),
    "# Note\n\nThis is source-owned Markdown context.\n",
    "utf8",
  );
  return root;
};

const writeGitMarker = async (root) => {
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, ".git", "HEAD"), "ref: refs/heads/main\n", "utf8");
};

const fileExists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

test("context_pack assembles AGENTS and seeded Markdown without mutating providers", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Plan docs context for implementation",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off" },
  });

  assert.equal(result.ok, true);
  const byProvider = Object.fromEntries(
    result.packet.sections.map((section) => [section.provider, section]),
  );
  assert.equal(byProvider.agents.items.length, 1);
  assert.equal(byProvider.docs.items.length, 1);
  assert.match(byProvider.docs.items[0].content, /source-owned Markdown/);
  assert.ok(result.packet.nonAuthorizations.some((item) => item.includes("does not mutate")));
  assert.ok(result.packet.measurementReceipt.selectedItemCount >= 2);
  assert.ok(result.packet.measurementReceipt.estimatedToolCallsAvoided >= 2);
});

test("context_pack keeps Markdown-only path packets on docs without SCI omissions", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off", session: "off" },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.packet.sections.map((section) => section.provider),
    ["agents", "docs"],
  );
  assert.equal(
    result.packet.omissions.some((omission) => omission.provider === "sci"),
    false,
  );
});

test("context_pack omits contaminated Markdown path seeds without reading or leaking them", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "contaminated.md"),
    "# Contaminated\n\nMUST_NOT_READ_CONTAMINATED_SEED\n",
    "utf8",
  );
  const docsListScript = join(root, "docs-list-empty.mjs");
  await writeFile(
    docsListScript,
    "console.log(JSON.stringify({ ok: true, rankedItems: [] }));\n",
    "utf8",
  );

  const result = await buildContextPacket(
    {
      objective: "Read docs context",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "\ndocs/project/contaminated.md" }],
      providers: { agents: "off", docs: "required", git: "off", session: "off", sci: "off" },
    },
    { docsListScript },
  );

  assert.equal(result.ok, true);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "docs"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "docs" &&
        omission.reason === "unsafe_path" &&
        omission.detail.includes("control characters"),
    ),
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "no_results",
    ),
  );
  assert.equal(
    result.packet.omissions.some((omission) => omission.provider === "sci"),
    false,
  );

  const publicPacket = JSON.stringify({
    sections: result.packet.sections,
    omissions: result.packet.omissions,
    template: result.packet.dogfoodObservationTemplate,
  });
  assert.doesNotMatch(publicPacket, /contaminated\.md|MUST_NOT_READ_CONTAMINATED_SEED/);
});

test("context_pack keeps provider query seeds scoped through mixed docs and SCI packets", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "example.js"), "export const target = 1;\n", "utf8");
  const sciReadFilePaths = [];
  const sciSymbolQueries = [];
  const fakeExec = async (_command, args) => {
    const workflow = args[1];
    const workflowArgs = JSON.parse(args[3]);
    if (workflow === "read_file") {
      sciReadFilePaths.push(workflowArgs.path);
      assert.equal(workflowArgs.path, "src/example.js");
      return {
        stdout: JSON.stringify({
          content: [
            { type: "text", text: JSON.stringify({ content: "export const target = 1;\n" }) },
          ],
          isError: false,
        }),
      };
    }
    assert.equal(workflow, "symbol_search");
    sciSymbolQueries.push(workflowArgs.query);
    assert.equal(workflowArgs.query, "target");
    return {
      stdout: JSON.stringify({
        content: [{ type: "text", text: JSON.stringify({ count: 1, symbols: [] }) }],
        isError: false,
      }),
    };
  };

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs and implementation code",
      cwd: root,
      repoRoot: root,
      seeds: [
        { kind: "path", value: "docs/project/note.md" },
        { kind: "path", value: "src/example.js" },
        { kind: "symbol", value: "target" },
      ],
      providers: { git: "off", session: "off", docs: "required", sci: "required" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );

  assert.equal(result.ok, true);
  const plans = Object.fromEntries(
    result.plan.providerPlans.map((providerPlan) => [providerPlan.provider, providerPlan]),
  );
  assert.deepEqual(plans.agents.proposedQueries[0].seeds, []);
  assert.deepEqual(plans.docs.proposedQueries[0].seeds, [
    { kind: "path", value: "docs/project/note.md" },
  ]);
  assert.deepEqual(plans.sci.proposedQueries[0].seeds, [
    { kind: "path", value: "src/example.js" },
    { kind: "symbol", value: "target" },
  ]);
  assert.deepEqual(sciReadFilePaths, ["src/example.js"]);
  assert.deepEqual(sciSymbolQueries, ["target"]);
  const routeByProvider = Object.fromEntries(
    result.packet.dogfoodObservationTemplate.packet.providerRoutes.map((route) => [
      route.provider,
      route,
    ]),
  );
  assert.equal(routeByProvider.docs.routeRole, "selected");
  assert.equal(routeByProvider.docs.queryCount, 1);
  assert.equal(routeByProvider.docs.followupQueryCount, 0);
  assert.deepEqual(routeByProvider.docs.seedCounts, { markdown: 1 });
  assert.equal(routeByProvider.sci.routeRole, "selected");
  assert.equal(routeByProvider.sci.queryCount, 1);
  assert.equal(routeByProvider.sci.followupQueryCount, 0);
  assert.deepEqual(routeByProvider.sci.seedCounts, { code: 1, symbol: 1 });
  assert.equal(routeByProvider.agents.seedCount, 0);
  assert.equal(routeByProvider.prompt_vault.routeRole, "followup");
  assert.equal(routeByProvider.prompt_vault.queryCount, 1);
  assert.equal(routeByProvider.prompt_vault.totalQueryCount, 1);
  assert.equal(routeByProvider.prompt_vault.followupQueryCount, 1);
  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["docs/project/note.md"],
  );
});

test("context_pack enforces the global packet budget across providers while preserving reserve", async () => {
  const root = await makeWorkspace();
  const body = "x".repeat(2400);
  await writeFile(join(root, "AGENTS.md"), body, "utf8");
  await writeFile(join(root, "docs", "project", "note.md"), body, "utf8");

  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    budget: { maxTokens: 1000 },
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off", sci: "off" },
  });

  assert.equal(result.ok, true);
  const usableTokens = result.packet.budget.maxTokens - result.packet.budget.reserveTokens;
  assert.ok(result.packet.totals.estimatedTokens <= usableTokens, result.packet);
  assert.ok(result.packet.totals.bytes <= result.packet.budget.maxBytes, result.packet);
  assert.equal(result.packet.totals.budgetAccounting, "selected_provider_content_only");
  assert.ok(result.packet.measurementReceipt.packetFillRatio <= 1, result.packet);
  assert.ok(result.packet.omissions.some((omission) => omission.reason === "budget"));
});

test("context_pack enforces cumulative per-provider budget across multiple items", async () => {
  const root = await makeWorkspace();
  await writeFile(join(root, "docs", "project", "a.md"), `# A\n${"a ".repeat(70)}`, "utf8");
  await writeFile(join(root, "docs", "project", "b.md"), `# B\n${"b ".repeat(70)}`, "utf8");

  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [
      { kind: "path", value: "docs/project/a.md" },
      { kind: "path", value: "docs/project/b.md" },
    ],
    providers: { agents: "off", git: "off", sci: "off" },
    budget: {
      maxTokens: 1000,
      reserveTokens: 1,
      perProviderMaxTokens: { docs: 50 },
    },
  });

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.ok(docs.estimatedTokens <= result.packet.budget.perProviderMaxTokens.docs, docs);
  assert.equal(docs.items.length, 1);
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "docs" &&
        omission.reason === "budget" &&
        omission.detail.includes("provider budget exhausted"),
    ),
  );
});

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

test("context_pack treats uppercase Markdown seeds as docs", async () => {
  const root = await makeWorkspace();
  await writeFile(join(root, "docs", "project", "README.MD"), "# Uppercase markdown\n", "utf8");

  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/README.MD" }],
    providers: { git: "off", sci: "off" },
  });

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(docs.items.length, 1);
  assert.equal(docs.items[0].kind, "doc");
  assert.match(docs.items[0].content, /Uppercase markdown/);
});

test("context_pack preserves repo-root-to-leaf AGENTS order", async () => {
  const root = await makeWorkspace();
  await writeGitMarker(root);
  await mkdir(join(root, "packages", "pkg"), { recursive: true });
  await writeFile(join(root, "packages", "pkg", "AGENTS.md"), "# Package AGENTS\n", "utf8");

  const result = await buildContextPacket({
    objective: "Read instruction context",
    cwd: join(root, "packages", "pkg"),
    repoRoot: root,
    providers: { git: "off", sci: "off", docs: "off" },
  });

  const agents = result.packet.sections.find((section) => section.provider === "agents");
  assert.deepEqual(
    agents.items.map((item) => item.provenance.path),
    ["AGENTS.md", "packages/pkg/AGENTS.md"],
  );
});

test("context_pack applies Pi instruction-file fallback and priority inside repoRoot", async () => {
  const root = await makeWorkspace();
  await writeGitMarker(root);
  await mkdir(join(root, "packages", "pkg"), { recursive: true });
  await writeFile(join(root, "CLAUDE.md"), "# Root CLAUDE should not win\n", "utf8");
  await writeFile(join(root, "packages", "AGENTS.MD"), "# Uppercase package agents\n", "utf8");
  await writeFile(join(root, "packages", "CLAUDE.md"), "# Package CLAUDE should not win\n", "utf8");
  await writeFile(join(root, "packages", "pkg", "CLAUDE.MD"), "# Leaf uppercase Claude\n", "utf8");

  const result = await buildContextPacket({
    objective: "Read instruction context",
    cwd: join(root, "packages", "pkg"),
    repoRoot: root,
    providers: { git: "off", sci: "off", docs: "off" },
  });

  const agents = result.packet.sections.find((section) => section.provider === "agents");
  assert.deepEqual(
    agents.items.map((item) => item.provenance.path),
    ["AGENTS.md", "packages/AGENTS.MD", "packages/pkg/CLAUDE.MD"],
  );
  assert.equal(
    agents.items.some((item) => item.provenance.path === "CLAUDE.md"),
    false,
  );
  assert.equal(
    agents.items.some((item) => item.provenance.path === "packages/CLAUDE.md"),
    false,
  );
});

test("context_pack dedupes selected fallback instruction files", async () => {
  const root = await makeWorkspace();
  await writeGitMarker(root);
  await mkdir(join(root, "packages", "pkg"), { recursive: true });
  const leafClaude = "# Leaf CLAUDE\n\nAlready loaded instruction context.\n";
  await writeFile(join(root, "packages", "pkg", "CLAUDE.md"), leafClaude, "utf8");

  const result = await buildContextPacket(
    {
      objective: "Read instruction context",
      cwd: join(root, "packages", "pkg"),
      repoRoot: root,
      providers: { git: "off", sci: "off", docs: "off" },
    },
    { systemPrompt: leafClaude },
  );

  const agents = result.packet.sections.find((section) => section.provider === "agents");
  const duplicate = agents.items.find((item) => item.provenance.path === "packages/pkg/CLAUDE.md");
  assert.equal(duplicate.contentMode, "metadata");
  assert.equal(duplicate.duplicateOf, "system_prompt");
  assert.match(duplicate.content, /already loaded in system_prompt/);
});

test("context_pack documents instruction context as a repo-bounded projection", async () => {
  const outer = await mkdtemp(join(tmpdir(), "pi-context-pack-outer-"));
  const root = join(outer, "repo");
  const packageCwd = join(root, "packages", "pkg");
  await mkdir(packageCwd, { recursive: true });
  await writeGitMarker(root);
  await writeFile(join(outer, "AGENTS.md"), "# Outer AGENTS\n\nMUST_NOT_PACKET_OUTER\n", "utf8");
  await writeFile(join(root, "AGENTS.md"), "# Repo AGENTS\n", "utf8");
  await writeFile(join(packageCwd, "CLAUDE.md"), "# Leaf CLAUDE\n", "utf8");

  const result = await buildContextPacket({
    objective: "Read instruction context",
    cwd: packageCwd,
    repoRoot: root,
    providers: { git: "off", sci: "off", docs: "off" },
  });

  const agents = result.packet.sections.find((section) => section.provider === "agents");
  assert.match(agents.authority, /Repo-bounded AGENTS\/CLAUDE instruction files/);
  assert.match(agents.authority, /global and above-repo Pi-loaded files/);
  assert.deepEqual(
    agents.items.map((item) => item.provenance.path),
    ["AGENTS.md", "packages/pkg/CLAUDE.md"],
  );
  assert.doesNotMatch(JSON.stringify(agents), /MUST_NOT_PACKET_OUTER/);
});

test("context_pack accepts a git-root ancestor repoRoot from a package cwd", async () => {
  const root = await makeWorkspace();
  const packageCwd = join(root, "packages", "pkg");
  await writeGitMarker(root);
  await mkdir(packageCwd, { recursive: true });
  await writeFile(join(packageCwd, "AGENTS.md"), "# Package AGENTS\n", "utf8");

  const result = await buildContextPacket(
    {
      objective: "Read monorepo package instruction context",
      cwd: packageCwd,
      repoRoot: root,
      providers: { git: "off", sci: "off", docs: "off" },
    },
    { cwd: packageCwd },
  );

  assert.equal(result.ok, true);
  assert.equal(result.packet.repoRoot, root);
  const agents = result.packet.sections.find((section) => section.provider === "agents");
  assert.deepEqual(
    agents.items.map((item) => item.provenance.path),
    ["AGENTS.md", "packages/pkg/AGENTS.md"],
  );
  assert.equal(
    result.packet.omissions.some((omission) => omission.detail.includes("packages/AGENTS.md")),
    false,
  );
});

test("context_pack infers git-root ancestor from package cwd when repoRoot is omitted", async () => {
  const root = await makeWorkspace();
  const packageCwd = join(root, "packages", "pkg");
  await writeGitMarker(root);
  await mkdir(packageCwd, { recursive: true });
  await writeFile(join(packageCwd, "AGENTS.md"), "# Package AGENTS\n", "utf8");

  const result = await buildContextPacket(
    {
      objective: "Read monorepo package instruction context",
      cwd: packageCwd,
      providers: { git: "off", sci: "off", docs: "off" },
    },
    { cwd: packageCwd },
  );

  assert.equal(result.ok, true);
  assert.equal(result.packet.repoRoot, root);
  const agents = result.packet.sections.find((section) => section.provider === "agents");
  assert.deepEqual(
    agents.items.map((item) => item.provenance.path),
    ["AGENTS.md", "packages/pkg/AGENTS.md"],
  );
});

test("context_pack rebases cwd-relative docs seeds after repoRoot inference", async () => {
  const root = await makeWorkspace();
  const packageCwd = join(root, "packages", "pkg");
  await writeGitMarker(root);
  await mkdir(join(packageCwd, "docs", "project"), { recursive: true });
  await writeFile(join(packageCwd, "docs", "project", "vision.md"), "# Package Vision\n", "utf8");

  const result = await buildContextPacket(
    {
      objective: "Read package-local docs",
      cwd: packageCwd,
      seeds: [{ kind: "path", value: "docs/project/vision.md" }],
      providers: { agents: "off", git: "off", sci: "off", docs: "required" },
    },
    { cwd: packageCwd },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(result.packet.repoRoot, root);
  assert.equal(docs.items[0].provenance.path, "packages/pkg/docs/project/vision.md");
  assert.match(docs.items[0].content, /Package Vision/);
});

test("context_pack preserves repo-root-relative docs seeds when package cwd has a shadowing file", async () => {
  const root = await makeWorkspace();
  const packageCwd = join(root, "packages", "pkg");
  await writeGitMarker(root);
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(packageCwd, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "README.md"), "# Root Docs\n", "utf8");
  await writeFile(join(packageCwd, "docs", "README.md"), "# Package Docs\n", "utf8");

  const result = await buildContextPacket(
    {
      objective: "Read repo docs",
      cwd: packageCwd,
      seeds: [{ kind: "path", value: "docs/README.md" }],
      providers: { agents: "off", git: "off", sci: "off", docs: "required" },
    },
    { cwd: packageCwd },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(result.packet.repoRoot, root);
  assert.equal(docs.items[0].provenance.path, "docs/README.md");
  assert.match(docs.items[0].content, /Root Docs/);
  assert.doesNotMatch(docs.items[0].content, /Package Docs/);
});

test("context_pack runs git status at repoRoot after package-cwd inference", async () => {
  const root = await makeWorkspace();
  const packageCwd = join(root, "packages", "pkg");
  await writeGitMarker(root);
  await mkdir(packageCwd, { recursive: true });
  const calls = [];
  const fakeExec = async (_command, _args, options) => {
    calls.push(options.cwd);
    return { stdout: " M packages/pkg/file.js\n" };
  };

  const result = await buildContextPacket(
    {
      objective: "Check git status before implementation",
      cwd: packageCwd,
      providers: { agents: "off", docs: "off", sci: "off", git: "required" },
    },
    { cwd: packageCwd, execFileAsync: fakeExec },
  );

  const git = result.packet.sections.find((section) => section.provider === "git");
  assert.deepEqual(calls, [root]);
  assert.match(git.items[0].content, /packages\/pkg\/file\.js/);
  assert.doesNotMatch(git.items[0].content, /\.\.\//);
});

test("context_pack records planned provider omissions and owner routes for selected unwired providers", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Use SCI and FCOS context for code coordination",
    cwd: root,
    repoRoot: root,
    providers: { git: "off" },
  });

  const omittedProviders = result.packet.omissions.map((omission) => omission.provider);
  assert.ok(omittedProviders.includes("sci"));
  assert.ok(omittedProviders.includes("fcos"));
  assert.ok(
    result.packet.ownerSurfaceRecommendations.some((recommendation) =>
      recommendation.surface.includes("FCOS"),
    ),
  );
  assert.ok(
    result.packet.nextToolSuggestions.some(
      (suggestion) =>
        suggestion.tool.includes("FCOS") && suggestion.nonAuthorization.includes("did not execute"),
    ),
  );
});

test("context_pack degrades missing workspace roots instead of echoing false repoRoot authority", async () => {
  const root = await makeWorkspace();
  const missingRoot = join(root, "missing-root");
  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: missingRoot,
    repoRoot: missingRoot,
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.packet.cwd, process.cwd());
  assert.equal(result.packet.repoRoot, process.cwd());
  assert.ok(result.plan.risks.some((risk) => risk.message.includes("cwd does not exist")));
  assert.ok(result.plan.risks.some((risk) => risk.message.includes("repoRoot does not exist")));
});

test("context_pack fails closed on unsafe path seeds", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "../secret.md" }],
    providers: { docs: "off", git: "off" },
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "docs"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.reason === "unsafe_path" && omission.detail.includes("parent"),
    ),
  );
});

test("context_pack reports unsafe code path seeds as SCI path omissions", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Read code context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "../src/secret.js" }],
    providers: { agents: "off", docs: "off", git: "off", sci: "required" },
  });

  assert.equal(result.ok, true);
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "sci" &&
        omission.reason === "unsafe_path" &&
        omission.detail.includes("parent"),
    ),
  );
});

test("context_pack reports unsafe symbol seeds as SCI symbol omissions", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Find code symbol context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "symbol", value: "target\n## forged" }],
    providers: { agents: "off", docs: "off", git: "off", sci: "required" },
  });

  assert.equal(result.ok, true);
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "sci" &&
        omission.reason === "unsafe_symbol" &&
        omission.detail.includes("control characters"),
    ),
  );
});

test("context_pack blocks symlink path escapes before packet content is read", async () => {
  const root = await makeWorkspace();
  const outside = await mkdtemp(join(tmpdir(), "pi-context-pack-secret-"));
  await writeFile(join(outside, "secret.md"), "# Secret\n\nDo not packetize.\n", "utf8");
  await symlink(join(outside, "secret.md"), join(root, "docs", "project", "secret-link.md"));

  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/secret-link.md" }],
    providers: { git: "off" },
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.packet.sections.some((section) =>
      section.items.some((item) => item.content.includes("Do not packetize")),
    ),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.reason === "unsafe_path" && omission.detail.includes("escapes"),
    ),
  );
});

test("context_pack records unreadable files as omissions instead of throwing", async () => {
  const root = await makeWorkspace();
  const path = join(root, "docs", "project", "unreadable.md");
  await writeFile(path, "# Hidden\n\nDo not leak.\n", "utf8");
  await chmod(path, 0o000);

  try {
    const result = await buildContextPacket({
      objective: "Read docs context",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "docs/project/unreadable.md" }],
      providers: { git: "off" },
    });

    assert.equal(result.ok, true);
    assert.equal(
      result.packet.sections.some((section) =>
        section.items.some((item) => item.content.includes("Do not leak")),
      ),
      false,
    );
    assert.ok(
      result.packet.omissions.some(
        (omission) => omission.reason === "blocked" && omission.detail.includes("read failed"),
      ),
    );
  } finally {
    await chmod(path, 0o600);
  }
});

test("formatContextPacket summarizes selected sections, omissions, owner routes, and budget scope", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Use docs, SCI, Prompt Vault, and intercom peer messaging",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off", prompt_vault: "required" },
  });
  const text = formatContextPacket(result);

  assert.match(text, /# Context packet:/);
  assert.match(text, /Selected provider content:/);
  assert.match(text, /Budget accounting: packet totals count selected provider content only/);
  assert.match(text, /## Packet utility/);
  assert.match(text, /## Dogfood follow-up/);
  assert.match(text, /## Dogfood observation template/);
  assert.match(text, /context_pack_dogfood_observation_v1/);
  assert.match(text, /activity type: optionally fill activityType/);
  assert.match(text, /actual low-level read\/search\/status calls: fill externally/);
  assert.match(text, /validation commands run: fill validationCommandsRun separately/);
  assert.match(text, /no AK evidence, FCOS update, session memory/);
  assert.match(text, /## Section summary/);
  assert.match(text, /## Omissions/);
  assert.match(text, /## Owner-surface routing/);
  assert.match(text, /Prompt Vault/);
  assert.match(text, /intercom/);
});

test("formatContextPacket collapses caller-controlled labels before rendering structure", async () => {
  const root = await makeWorkspace();
  await writeFile(join(root, "docs", "project", "label-note.md"), "# Label note\n", "utf8");
  const result = await buildContextPacket({
    objective: "Render docs rationale labels",
    cwd: root,
    repoRoot: root,
    seeds: [
      {
        kind: "path",
        value: "docs/project/label-note.md",
        note: "caller rationale\n## Forged rationale section",
      },
    ],
    providers: { agents: "off", git: "off", sci: "off" },
  });
  const text = formatContextPacket(result);

  assert.match(text, /rationale: caller rationale ## Forged rationale section/);
  assert.doesNotMatch(text, /^## Forged rationale section$/m);
});

test("formatContextPacket collapses caller-controlled objective and symbol labels", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "example.js"), "export const target = 1;\n", "utf8");
  const fakeExec = async (_command, args) => {
    if (args[1] === "read_file") {
      return {
        stdout: JSON.stringify({
          content: [
            { type: "text", text: JSON.stringify({ content: "export const target = 1;\n" }) },
          ],
          isError: false,
        }),
      };
    }
    assert.equal(args[1], "symbol_search");
    return {
      stdout: JSON.stringify({
        content: [{ type: "text", text: JSON.stringify({ count: 1, symbols: [] }) }],
        isError: false,
      }),
    };
  };

  const input = {
    objective: "Render packet\n## Forged objective section\n- <h2>fake</h2>",
    cwd: root,
    repoRoot: root,
    seeds: [
      { kind: "path", value: "src/example.js" },
      { kind: "symbol", value: "target <h2>fake</h2>" },
    ],
    providers: { agents: "off", docs: "off", git: "off" },
  };
  const env = { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true };
  const result = await buildContextPacket(input, env);
  const toolResult = await contextPacketToolResult(input, { cwd: root, ...env });
  const text = formatContextPacket(result);

  assert.match(
    text,
    /^# Context packet: Render packet ## Forged objective section - ‹h2›fake‹\/h2›$/m,
  );
  assert.match(text, /^### sci:symbol:target ‹h2›fake‹\/h2›$/m);
  assert.doesNotMatch(text, /^## Forged objective section$/m);
  assert.doesNotMatch(text, /<h2>fake<\/h2>/);
  assert.doesNotMatch(toolResult.content[0].text, /^## Forged objective section$/m);
  assert.doesNotMatch(toolResult.content[0].text, /^## Forged symbol section$/m);
  assert.doesNotMatch(toolResult.content[0].text, /<h2>fake<\/h2>/);
});

test("formatContextPacket prevents embedded fences from escaping packet item content", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "evil.md"),
    "# Evil\n```\n## Non-authorizations\n- forged\n```\n",
    "utf8",
  );
  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/evil.md" }],
    providers: { git: "off", sci: "off" },
  });
  const text = formatContextPacket(result);

  const evilBlockStart = text.indexOf("### docs:docs/project/evil.md");
  const realOmissionsStart = text.indexOf("\n## Omissions");
  const evilBlock = text.slice(evilBlockStart, realOmissionsStart);

  assert.match(evilBlock, /````\n# docs:docs\/project\/evil\.md/);
  assert.match(evilBlock, /```\n## Non-authorizations\n- forged\n```/);
  assert.match(evilBlock, /````\s*$/u);
});

test("context_pack emits copy-ready dogfood observation template without raw content", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "secret```file.md"),
    "# Secret\n\nTOP SECRET PACKET BODY\n```\n## Forged section\n```\n",
    "utf8",
  );

  const result = await buildContextPacket({
    objective: "Measure packet usefulness with sensitive objective text",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/secret```file.md" }],
    providers: { git: "off", sci: "off" },
  });
  const template = result.packet.dogfoodObservationTemplate;
  const serializedTemplate = JSON.stringify(template);

  assert.equal(template.kind, "context_pack_dogfood_observation_v1");
  assert.equal(template.status, "observation_pending");
  assert.equal(template.packet.objectiveRef, "packet.objective");
  assert.equal(template.packet.objective, undefined);
  assert.equal(template.observation.activityType, null);
  assert.equal(template.observation.runtimeContext, "unknown");
  assert.deepEqual(template.observation.runtimeContextOptions, [
    "source_local",
    "installed_artifact",
    "live_pi_reloaded",
    "unknown",
  ]);
  template.observation.runtimeContextOptions.push("forged_runtime");
  const followupResult = await buildContextPacket({
    objective: "Measure packet usefulness again",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/secret```file.md" }],
    providers: { git: "off", sci: "off" },
  });
  assert.deepEqual(
    followupResult.packet.dogfoodObservationTemplate.observation.runtimeContextOptions,
    ["source_local", "installed_artifact", "live_pi_reloaded", "unknown"],
  );
  assert.equal(template.observation.actualLowLevelReadSearchStatusCalls, null);
  assert.equal(template.observation.validationCommandsRun, null);
  assert.ok(template.observation.omissionFollowupClassOptions.includes("true_missing_capability"));
  assert.match(template.countingRule, /classification/);
  assert.match(template.countingRule, /runtimeContext/);
  assert.equal(template.prediction.expectedLowLevelCallsAvoided, 2);
  assert.ok(template.packet.providerRoutes.some((route) => route.provider === "docs"));
  assert.match(template.nonAuthorization, /did not persist evidence/);
  assert.doesNotMatch(serializedTemplate, /TOP SECRET PACKET BODY/);
  assert.doesNotMatch(serializedTemplate, /secret```file/);
  assert.doesNotMatch(serializedTemplate, /"id"|"path"|"provenance"/);

  const text = formatContextPacket(result);
  const templateStart = text.indexOf("## Dogfood observation template");
  const nonAuthorizationsStart = text.indexOf("\n## Non-authorizations");
  const templateBlock = text.slice(templateStart, nonAuthorizationsStart);

  assert.match(templateBlock, /```+\n# dogfood-observation-template\.json/);
  assert.match(templateBlock, /context_pack_dogfood_observation_v1/);
  assert.match(templateBlock, /omissionFollowupClassOptions/);
  assert.match(templateBlock, /runtimeContextOptions/);
  assert.doesNotMatch(templateBlock, /TOP SECRET PACKET BODY/);
  assert.doesNotMatch(templateBlock, /secret```file/);
});

test("context_pack redacts omission details and does not call wired provider outages unwired", async () => {
  const root = await makeWorkspace();
  const script = join(root, "docs-list-fails.mjs");
  await writeFile(
    script,
    "console.error('SECRET LOCAL PATH /tmp/customer-acme'); process.exit(2);\n",
    "utf8",
  );
  await chmod(script, 0o755);
  const input = {
    objective: "Use architecture docs",
    cwd: root,
    repoRoot: root,
    providers: { docs: "required", git: "off", sci: "off" },
  };
  const env = { docsListScript: script };

  const result = await buildContextPacket(input, env);
  const formatted = formatContextPacket(result);
  const toolResult = await contextPacketToolResult(input, { cwd: root, ...env });
  const serializedTemplate = JSON.stringify(result.packet.dogfoodObservationTemplate);
  const serializedDetails = JSON.stringify(toolResult.details);
  const serializedSuggestions = JSON.stringify(result.packet.nextToolSuggestions);

  assert.ok(result.packet.omissions.some((omission) => omission.detail.includes("docs-list")));
  assert.equal(result.packet.measurementReceipt.unwiredProviderOmissions.includes("docs"), false);
  assert.doesNotMatch(
    JSON.stringify(result.packet.omissions),
    /SECRET LOCAL PATH|customer-acme|\/tmp\//,
  );
  assert.doesNotMatch(formatted, /SECRET LOCAL PATH|customer-acme|\/tmp\//);
  assert.doesNotMatch(serializedDetails, /SECRET LOCAL PATH|customer-acme/);
  assert.doesNotMatch(
    JSON.stringify(toolResult.details.omissions),
    /SECRET LOCAL PATH|customer-acme|\/tmp\//,
  );
  assert.doesNotMatch(serializedSuggestions, /SECRET LOCAL PATH|customer-acme|\/tmp\//);
  assert.doesNotMatch(
    serializedTemplate,
    /SECRET LOCAL PATH|customer-acme|docs-list failed|\/tmp\//,
  );
  assert.match(serializedTemplate, /detailRef/);
});

test("context_pack reports rendered Markdown overhead separately from selected content budget", async () => {
  const root = await makeWorkspace();
  const input = {
    objective: "Tiny docs packet",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { agents: "off", git: "off", sci: "off", session: "off" },
    budget: { maxTokens: 1000, reserveTokens: 999 },
  };

  const toolResult = await contextPacketToolResult(input, { cwd: root });

  assert.equal(toolResult.details.totals.budgetAccounting, "selected_provider_content_only");
  assert.ok(
    toolResult.details.renderedMarkdown.estimatedTokens > toolResult.details.totals.estimatedTokens,
  );
  assert.equal(
    toolResult.details.renderedMarkdown.estimatedTokens,
    Math.ceil(toolResult.details.renderedMarkdown.bytes / 4),
  );
  assert.match(
    toolResult.details.renderedMarkdown.budgetAccounting,
    /rendered Markdown includes packet scaffolding/,
  );
  assert.match(toolResult.content[0].text, /Budget accounting: packet totals count selected/);
});

test("context_pack estimates rendered Markdown tokens from bytes for multibyte content", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "unicode.md"),
    "# Unicode\n\nContext with emoji 🚀 and kana カタカナ.\n",
    "utf8",
  );
  const input = {
    objective: "Unicode context 🚀 カタカナ",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/unicode.md" }],
    providers: { agents: "off", git: "off", sci: "off", session: "off" },
  };

  const toolResult = await contextPacketToolResult(input, { cwd: root });

  assert.equal(
    toolResult.details.renderedMarkdown.estimatedTokens,
    Math.ceil(toolResult.details.renderedMarkdown.bytes / 4),
  );
});

test("context_pack emits measurement receipt for packet usefulness", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Measure docs context packet",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off" },
  });

  assert.equal(result.packet.measurementReceipt.wiredProviders.includes("agents"), true);
  assert.equal(result.packet.measurementReceipt.wiredProviders.includes("docs"), true);
  assert.equal(typeof result.packet.measurementReceipt.packetFillRatio, "number");
  assert.equal(result.packet.measurementReceipt.freshItemCount, 2);
  assert.equal(result.packet.measurementReceipt.packetUtilityRecommendation.status, "use_packet");
  assert.equal(
    result.packet.measurementReceipt.dogfoodFollowupReceipt.status,
    "observation_pending",
  );
  assert.equal(
    result.packet.measurementReceipt.dogfoodFollowupReceipt.expectedLowLevelCallsAvoided,
    result.packet.measurementReceipt.estimatedToolCallsAvoided,
  );
  assert.equal(result.packet.measurementReceipt.dogfoodFollowupReceipt.activityType, null);
  assert.equal(
    result.packet.measurementReceipt.dogfoodFollowupReceipt.actualLowLevelReadSearchStatusCalls,
    null,
  );
  assert.equal(result.packet.measurementReceipt.dogfoodFollowupReceipt.validationCommandsRun, null);
  assert.match(formatContextPacket(result), /omission follow-ups: optionally use objects/);
  assert.match(
    result.packet.measurementReceipt.dogfoodFollowupReceipt.nonAuthorization,
    /not task-completion proof/,
  );
  assert.ok(result.packet.measurementHints.some((hint) => hint.metric === "tool_calls_avoided"));
  assert.ok(result.packet.measurementHints.some((hint) => hint.metric === "dogfood_followup"));
});

test("context_pack deduplicates content already loaded in the system prompt", async () => {
  const root = await makeWorkspace();
  const loadedAgents = "# AGENTS\n\nUse bounded read-only context.\n";
  const result = await buildContextPacket(
    {
      objective: "Plan with already-loaded instructions",
      cwd: root,
      repoRoot: root,
      providers: { git: "off" },
    },
    { systemPrompt: `prefix\n${loadedAgents}\nsuffix` },
  );

  const agents = result.packet.sections.find((section) => section.provider === "agents");
  assert.equal(agents.items[0].contentMode, "metadata");
  assert.equal(agents.items[0].duplicateOf, "system_prompt");
  assert.equal(result.packet.measurementReceipt.alreadyLoadedItems, 1);
  assert.equal(result.packet.measurementReceipt.freshItemCount, 0);
  assert.equal(result.packet.measurementReceipt.estimatedToolCallsAvoided, 0);
  assert.equal(
    result.packet.measurementReceipt.packetUtilityRecommendation.status,
    "no_packet_needed",
  );
  assert.ok(result.packet.measurementReceipt.duplicateTokensAvoided > 0);
});

test("context_pack recommends reviewing omissions when no fresh packet content is selected", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "../secret.md" }],
    providers: { agents: "off", docs: "off", git: "off", sci: "off" },
  });

  assert.equal(result.packet.measurementReceipt.freshItemCount, 0);
  assert.equal(
    result.packet.measurementReceipt.packetUtilityRecommendation.status,
    "review_omissions",
  );
  assert.match(
    result.packet.measurementReceipt.packetUtilityRecommendation.nextAction,
    /Review omissions/,
  );
});

test("context_pack includes compact session environment metadata when selected", async () => {
  const root = await makeWorkspace();
  const input = {
    objective: "Plan current context window environment",
    cwd: root,
    repoRoot: root,
    providers: { session: "required", git: "off" },
  };
  const env = {
    systemPrompt: "loaded prompt",
    contextUsage: {
      tokens: 1234,
      contextWindow: 2000,
      rawPrompt: "SECRET SESSION PROMPT",
      path: "/tmp/customer-acme/session.json",
      nested: { token: "abc123" },
    },
    modelLabel: "test/model",
  };

  const result = await buildContextPacket(input, env);
  const toolResult = await contextPacketToolResult(input, { cwd: root, ...env });
  const session = result.packet.sections.find((section) => section.provider === "session");
  const serializedDetails = JSON.stringify(result.packet.measurementReceipt.sessionAwareness);
  const serializedToolDetails = JSON.stringify(
    toolResult.details.measurementReceipt.sessionAwareness,
  );
  assert.equal(session.items.length, 1);
  assert.match(session.items[0].content, /systemPromptEstimatedTokens/);
  assert.match(session.items[0].content, /rawUsageOmitted/);
  assert.match(session.items[0].content, /test\/model/);
  assert.match(session.items[0].content, /1234/);
  assert.doesNotMatch(session.items[0].content, /SECRET SESSION PROMPT|customer-acme|abc123/);
  assert.doesNotMatch(toolResult.content[0].text, /SECRET SESSION PROMPT|customer-acme|abc123/);
  assert.doesNotMatch(serializedDetails, /SECRET SESSION PROMPT|customer-acme|abc123/);
  assert.doesNotMatch(serializedToolDetails, /SECRET SESSION PROMPT|customer-acme|abc123/);
});

test("context_pack reports session visibility only when session section is selected", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket(
    {
      objective: "Plan current context window environment",
      cwd: root,
      repoRoot: root,
      providers: { agents: "off", docs: "off", git: "off", sci: "off", session: "required" },
      budget: { maxTokens: 10, reserveTokens: 1, maxBytes: 100 },
    },
    { contextUsage: { tokens: 9, contextWindow: 10 } },
  );

  assert.equal(
    result.packet.sections.some((section) => section.provider === "session"),
    false,
  );
  assert.equal(result.packet.measurementReceipt.sessionAwareness.visibleSessionSection, false);
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "session" && omission.reason === "budget",
    ),
  );
});
