import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  buildPromptCommandDescription,
  loadPromptTemplates,
  parseMarkdownFrontmatter,
} from "../src/loader.js";

const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptx-exec-loader-"));
  tempDirs.push(dir);
  return dir;
}

async function writePrompt(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

describe("markdown frontmatter parsing", () => {
  it("parses simple key-value frontmatter and body", () => {
    const parsed = parseMarkdownFrontmatter("---\nmodel: zai/glm-5.1\nrestore: false\n---\nBody");
    assert.deepEqual(parsed.frontmatter, { model: "zai/glm-5.1", restore: false });
    assert.equal(parsed.body, "Body");
  });

  it("parses docs-list metadata arrays without invalidating prompt ownership frontmatter", () => {
    const parsed = parseMarkdownFrontmatter(
      '---\nsummary: "Commit"\nread_when:\n  - "Committing changes"\ndescription: Commit changes\nmodel: zai/glm-5.1\n---\nBody',
    );
    assert.deepEqual(parsed.frontmatter, {
      summary: "Commit",
      read_when: ["Committing changes"],
      description: "Commit changes",
      model: "zai/glm-5.1",
    });
    assert.equal(parsed.body, "Body");
  });

  it("treats markdown without frontmatter as an empty frontmatter object", () => {
    assert.deepEqual(parseMarkdownFrontmatter("Plain body"), {
      frontmatter: {},
      body: "Plain body",
    });
  });
});

describe("prompt-template execution loader", () => {
  it("claims /commit because model frontmatter exists", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    const commitPath = await writePrompt(
      globalDir,
      "commit.md",
      "---\ndescription: Commit changes\nmodel: zai/glm-5.1\n---\nCommit $ARGUMENTS",
    );

    const result = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir });
    const prompt = result.prompts.get("commit");

    assert.ok(prompt);
    assert.equal(prompt.filePath, commitPath);
    assert.equal(prompt.source, "user");
    assert.deepEqual(prompt.models, ["zai/glm-5.1"]);
    assert.equal(prompt.description, "Commit changes");
    assert.equal(buildPromptCommandDescription(prompt), "Commit changes [glm-5.1] (user)");
  });

  it("ignores description-only templates to avoid duplicate Pi-core command ownership", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(globalDir, "plain.md", "---\ndescription: Plain prompt\n---\nBody");

    const result = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir });
    assert.equal(result.prompts.has("plain"), false);
    assert.deepEqual(result.diagnostics, []);
  });

  it("lets project prompts override global prompts by name", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(globalDir, "commit.md", "---\nmodel: anthropic/claude-haiku\n---\nGlobal");
    const projectPath = await writePrompt(
      projectDir,
      "commit.md",
      "---\nmodel: zai/glm-5.1\n---\nProject",
    );

    const result = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir });
    assert.equal(result.prompts.get("commit").filePath, projectPath);
    assert.equal(result.prompts.get("commit").content, "Project");
  });

  it("skips duplicate same-source names with diagnostics", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(globalDir, "review.md", "---\nmodel: anthropic/claude-haiku\n---\nTop");
    await writeFile(path.join(globalDir, "nested"), "", "utf8").catch(() => undefined);
    await rm(path.join(globalDir, "nested"), { force: true });
    await import("node:fs/promises").then((fs) => fs.mkdir(path.join(globalDir, "nested")));
    await writePrompt(
      path.join(globalDir, "nested"),
      "review.md",
      "---\nmodel: anthropic/claude-sonnet\n---\nNested",
    );

    const result = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir });
    assert.equal(result.prompts.get("review").content, "Nested");
    assert.equal(result.diagnostics[0].code, "duplicate-command-name");
  });

  it("rejects invalid model frontmatter and reserved command names", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(globalDir, "bad.md", "---\nmodel: anthropic/*\n---\nBad");
    await writePrompt(globalDir, "compact.md", "---\nmodel: anthropic/claude-haiku\n---\nReserved");

    const result = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir });
    assert.equal(result.prompts.size, 0);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      ["invalid-model-spec", "reserved-command-name"],
    );
  });

  it("skips chain/loop/subagent ownership instead of cloning orchestrator or ASC runtime", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(
      globalDir,
      "workflow.md",
      "---\nmodel: anthropic/claude-haiku\nchain: a -> b\n---\nBody",
    );
    await writePrompt(
      globalDir,
      "delegate.md",
      "---\nmodel: anthropic/claude-haiku\nsubagent: reviewer\n---\nBody",
    );

    const result = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir });
    assert.equal(result.prompts.size, 0);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      ["deferred-orchestrator-or-asc-feature", "deferred-orchestrator-or-asc-feature"],
    );
  });

  it("skips invalid frontmatter object/list cases", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(globalDir, "list.md", "---\n- model: anthropic/claude\n---\nBody");

    const result = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir });
    assert.equal(result.prompts.size, 0);
    assert.equal(result.diagnostics[0].code, "invalid-frontmatter");
  });
});
