/**
 * summary: "resolves prompt skills across registered commands and project or global skill directories."
 * read_when:
 *   - "changing prompt skill lookup precedence, markdown loading, or queued skill messages."
 */
/**
 * Pure skill-resolution helpers for prompt-template execution.
 *
 * These helpers mirror the prompt-template-model skill lookup order without
 * registering skill commands or mutating the Pi host. A future live extension can
 * queue the returned message for Pi's before_agent_start hook.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { parseMarkdownFrontmatter } from "./loader.js";

export const SKILL_LOADED_MESSAGE_TYPE = "skill-loaded";

function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeSkillName(skillName) {
  const normalized = normalizeText(skillName);
  if (!normalized) return undefined;
  return normalized.startsWith("skill:") ? normalized.slice("skill:".length) : normalized;
}

function isPathResolvableSkillName(skillName) {
  if (skillName === "." || skillName === "..") return false;
  if (skillName.includes("/") || skillName.includes("\\")) return false;
  return true;
}

function getSkillCandidates(baseDir, skillName) {
  return [join(baseDir, skillName, "SKILL.md"), join(baseDir, `${skillName}.md`)];
}

function* walkAncestors(startDir, stopDir) {
  let current = startDir;
  while (true) {
    yield current;
    if (stopDir && current === stopDir) return;
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function findRepoRoot(startDir) {
  for (const dir of walkAncestors(startDir)) {
    if (existsSync(join(dir, ".git"))) return dir;
  }
  return undefined;
}

function findFirstExisting(paths) {
  return paths.find((candidate) => existsSync(candidate));
}

export function resolveRegisteredSkillPath(skillName, commands = []) {
  const normalizedSkillName = normalizeSkillName(skillName);
  if (!normalizedSkillName) return undefined;
  const candidates = new Set([normalizedSkillName, `skill:${normalizedSkillName}`]);

  for (const command of Array.isArray(commands) ? commands : []) {
    if (command?.source !== "skill") continue;
    const sourceInfo = "sourceInfo" in command ? command.sourceInfo : undefined;
    if (!sourceInfo?.path) continue;
    if (!candidates.has(command.name)) continue;
    return sourceInfo.path;
  }

  return undefined;
}

export function resolveSkillPath(skillName, cwd = process.cwd(), options = {}) {
  const normalizedSkillName = normalizeSkillName(skillName);
  if (!normalizedSkillName || !isPathResolvableSkillName(normalizedSkillName)) return undefined;

  const projectDir = resolve(cwd);
  const homeDir = options.homeDir ?? homedir();

  const projectPiSkill = findFirstExisting(
    getSkillCandidates(resolve(projectDir, ".pi", "skills"), normalizedSkillName),
  );
  if (projectPiSkill) return projectPiSkill;

  const repoRoot = findRepoRoot(projectDir);
  for (const dir of walkAncestors(projectDir, repoRoot)) {
    const projectAgentsSkill = findFirstExisting(
      getSkillCandidates(join(dir, ".agents", "skills"), normalizedSkillName),
    );
    if (projectAgentsSkill) return projectAgentsSkill;
  }

  const globalPiSkill = findFirstExisting(
    getSkillCandidates(join(homeDir, ".pi", "agent", "skills"), normalizedSkillName),
  );
  if (globalPiSkill) return globalPiSkill;

  return findFirstExisting(
    getSkillCandidates(join(homeDir, ".agents", "skills"), normalizedSkillName),
  );
}

export function readSkillContent(skillPath) {
  const raw = readFileSync(skillPath, "utf8");
  return parseMarkdownFrontmatter(raw).body;
}

export function createSkillLoadedMessage(skillName, skillContent, skillPath) {
  const normalizedSkillName = normalizeSkillName(skillName);
  if (!normalizedSkillName) throw new Error(`Skill "${skillName}" not found`);
  return {
    customType: SKILL_LOADED_MESSAGE_TYPE,
    content: `<skill name="${normalizedSkillName}">\n${skillContent}\n</skill>`,
    display: true,
    details: { skillName: normalizedSkillName, skillContent, skillPath },
  };
}

export function resolvePromptSkillMessage(skillName, cwd = process.cwd(), options = {}) {
  const normalizedSkillName = normalizeSkillName(skillName);
  if (!normalizedSkillName) return { kind: "none" };

  const skillPath =
    resolveRegisteredSkillPath(normalizedSkillName, options.commands) ??
    resolveSkillPath(normalizedSkillName, cwd, options);
  if (!skillPath) return { kind: "error", error: `Skill "${skillName}" not found` };

  try {
    return {
      kind: "ready",
      message: createSkillLoadedMessage(
        normalizedSkillName,
        readSkillContent(skillPath),
        skillPath,
      ),
    };
  } catch (error) {
    return {
      kind: "error",
      error: `Failed to read skill "${skillName}": ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
