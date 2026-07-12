/**
 * summary: "tests skill-name normalization, lookup precedence, path rejection, content loading, and message resolution."
 * read_when:
 *   - "changing prompt skill discovery or skill-loaded message construction."
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  createSkillLoadedMessage,
  normalizeSkillName,
  readSkillContent,
  resolvePromptSkillMessage,
  resolveRegisteredSkillPath,
  resolveSkillPath,
} from "../src/skills.js";

const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptx-exec-skills-"));
  tempDirs.push(dir);
  return dir;
}

async function writeFileEnsured(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return filePath;
}

describe("prompt-template skill resolution", () => {
  it("normalizes skill names and resolves registered skill command paths first", () => {
    assert.equal(normalizeSkillName("skill:frontend-design"), "frontend-design");
    assert.equal(normalizeSkillName(" frontend-design "), "frontend-design");
    assert.equal(
      resolveRegisteredSkillPath("frontend-design", [
        { name: "other", source: "skill", sourceInfo: { path: "/skills/other/SKILL.md" } },
        {
          name: "skill:frontend-design",
          source: "skill",
          sourceInfo: { path: "/skills/frontend/SKILL.md" },
        },
      ]),
      "/skills/frontend/SKILL.md",
    );
  });

  it("resolves project .pi skills before ancestor .agents and global skills", async () => {
    const repo = await tempDir();
    const cwd = path.join(repo, "nested", "work");
    const homeDir = await tempDir();
    await mkdir(path.join(repo, ".git"), { recursive: true });
    await mkdir(cwd, { recursive: true });
    const projectSkill = await writeFileEnsured(
      path.join(cwd, ".pi", "skills", "reviewer", "SKILL.md"),
      "project skill",
    );
    await writeFileEnsured(
      path.join(repo, ".agents", "skills", "reviewer", "SKILL.md"),
      "ancestor skill",
    );
    await writeFileEnsured(
      path.join(homeDir, ".pi", "agent", "skills", "reviewer", "SKILL.md"),
      "global skill",
    );

    assert.equal(resolveSkillPath("reviewer", cwd, { homeDir }), projectSkill);
  });

  it("rejects path-shaped skill names for filesystem lookup", async () => {
    const cwd = await tempDir();
    assert.equal(resolveSkillPath("../secret", cwd), undefined);
    assert.equal(resolveSkillPath("nested/skill", cwd), undefined);
  });

  it("reads skill markdown without frontmatter and builds the skill-loaded message", async () => {
    const cwd = await tempDir();
    const skillPath = await writeFileEnsured(
      path.join(cwd, ".pi", "skills", "frontend-design", "SKILL.md"),
      "---\nname: frontend-design\n---\nDesign guidance",
    );

    assert.equal(readSkillContent(skillPath), "Design guidance");
    assert.deepEqual(
      createSkillLoadedMessage("skill:frontend-design", "Design guidance", skillPath),
      {
        customType: "skill-loaded",
        content: '<skill name="frontend-design">\nDesign guidance\n</skill>',
        display: true,
        details: {
          skillName: "frontend-design",
          skillContent: "Design guidance",
          skillPath,
        },
      },
    );
  });

  it("returns ready/error results for prompt skill messages", async () => {
    const cwd = await tempDir();
    const skillPath = await writeFileEnsured(
      path.join(cwd, ".pi", "skills", "reviewer", "SKILL.md"),
      "Review deeply",
    );

    assert.deepEqual(resolvePromptSkillMessage(undefined, cwd), { kind: "none" });
    assert.deepEqual(resolvePromptSkillMessage("missing", cwd), {
      kind: "error",
      error: 'Skill "missing" not found',
    });

    const ready = resolvePromptSkillMessage("reviewer", cwd);
    assert.equal(ready.kind, "ready");
    assert.equal(ready.message.details.skillPath, skillPath);
    assert.equal(ready.message.content, '<skill name="reviewer">\nReview deeply\n</skill>');
  });
});
