/**
summary: "Context-packet instruction files and repoRoot inference; split from context-pack.test.js."
read_when:
  - "You change instruction files and repoRoot inference behavior."
*/
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildContextPacket, makeWorkspace, writeGitMarker } from "./context-pack-helpers.js";

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
