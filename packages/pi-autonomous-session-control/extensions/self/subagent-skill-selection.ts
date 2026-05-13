import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { SessionScopedContext } from "./session-context.ts";

const REGISTRY_RELATIVE_PATH = ".pi/skills/skill-librarian/references/skills-registry.json";
const DEFAULT_PROFILE_LIBRARY_SKILLS: Record<string, string[]> = {
  minimal: [],
  ak: ["source-owner-boundary-router"],
  governance: ["ak-exact-task-execution", "dspx-skill-feedback-loop"],
  "dspx-skill-authoring": ["source-owner-boundary-router"],
};

export interface SkillRegistryEntry {
  name: string;
  path: string;
  visibility?: string;
  profile_fit?: string[];
}

export interface SkillRegistryPayload {
  schema_version?: string;
  library_root?: string;
  skills?: SkillRegistryEntry[];
}

export interface ResolvedSubagentSkillSelection {
  noSkills: boolean;
  skillSources: string[];
  skillProfile?: string;
  loadedSkills: string[];
  librarySkills: string[];
  skillWarnings: string[];
  skillRegistry?: string;
}

export interface SubagentSkillSelectionOptions {
  requestedSkillProfile?: string;
  requestedSkills?: string[];
  requestedNoSkills?: boolean;
  ctx: SessionScopedContext & { cwd: string };
}

export class SubagentSkillSelectionError extends Error {
  readonly reason = "skill_profile_failed";

  constructor(message: string) {
    super(message);
    this.name = "SubagentSkillSelectionError";
  }
}

export async function resolveSubagentSkillSelection(
  options: SubagentSkillSelectionOptions,
): Promise<ResolvedSubagentSkillSelection> {
  const profile = options.requestedSkillProfile?.trim();
  const requestedSkills = options.requestedSkills ?? [];
  const requestedNoSkills = options.requestedNoSkills === true;

  if (!profile && requestedSkills.length === 0 && !requestedNoSkills) {
    return {
      noSkills: false,
      skillSources: [],
      loadedSkills: [],
      librarySkills: [],
      skillWarnings: [],
    };
  }

  if (requestedSkills.length > 0) {
    throw new SubagentSkillSelectionError(
      "DispatchSubagentRequest.skills is not enabled yet; use a named skillProfile so ASC can resolve skills through an allowlisted registry.",
    );
  }

  if (!profile) {
    return {
      noSkills: requestedNoSkills,
      skillSources: [],
      loadedSkills: [],
      librarySkills: [],
      skillWarnings: [],
    };
  }

  const registryPath = await findSkillRegistryPath(options.ctx.cwd);
  if (!registryPath) {
    throw new SubagentSkillSelectionError(
      `skillProfile=${profile} requested, but no ai-society skill registry was found from cwd ${options.ctx.cwd}.`,
    );
  }

  const registry = await readSkillRegistry(registryPath);
  const libraryRoot = await resolveLibraryRoot(registryPath, registry);
  const byName = new Map((registry.skills ?? []).map((entry) => [entry.name, entry]));
  const visibleSkills = selectVisibleSkills(profile, registry);
  if (visibleSkills.length === 0) {
    throw new SubagentSkillSelectionError(
      `Unknown or empty skillProfile: ${profile}. Available profiles are inferred from registry profile_fit values.`,
    );
  }

  const librarySkills = DEFAULT_PROFILE_LIBRARY_SKILLS[profile] ?? [];
  const selected = [...new Set([...visibleSkills, ...librarySkills])];
  const outDir = await mkdtemp(join(tmpdir(), `asc-skill-profile-${profile}-`));

  for (const name of selected) {
    const entry = byName.get(name);
    if (!entry) {
      throw new SubagentSkillSelectionError(
        `skillProfile=${profile} references missing registry skill: ${name}.`,
      );
    }
    const sourcePath = await resolveRegistrySkillPath(libraryRoot, entry.path);
    await assertPathWithinRoot(sourcePath, libraryRoot, name);
    const text = await readFile(sourcePath, "utf8");
    const visible = visibleSkills.includes(name);
    const materializedText = visible
      ? removeDisableModelInvocation(text)
      : ensureDisableModelInvocation(text);
    const destination = join(outDir, name, "SKILL.md");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, materializedText, "utf8");
  }

  return {
    noSkills: true,
    skillSources: [outDir],
    skillProfile: profile,
    loadedSkills: visibleSkills,
    librarySkills,
    skillWarnings: [],
    skillRegistry: registryPath,
  };
}

async function findSkillRegistryPath(cwd: string): Promise<string | undefined> {
  const explicit = process.env.ASC_SKILL_REGISTRY_PATH?.trim();
  if (explicit) {
    return resolve(explicit);
  }

  let current = resolve(cwd || process.cwd());
  while (true) {
    const candidate = join(current, REGISTRY_RELATIVE_PATH);
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // Keep walking ancestors.
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function readSkillRegistry(path: string): Promise<SkillRegistryPayload> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("registry payload must be a JSON object");
    }
    return parsed as SkillRegistryPayload;
  } catch (error) {
    throw new SubagentSkillSelectionError(
      `Failed to read skill registry ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function resolveLibraryRoot(
  registryPath: string,
  registry: SkillRegistryPayload,
): Promise<string> {
  const declared = registry.library_root?.trim();
  const candidate = declared
    ? isAbsolute(declared)
      ? declared
      : resolve(dirname(registryPath), declared)
    : resolve(dirname(registryPath), "../..");
  return realpath(candidate);
}

function selectVisibleSkills(profile: string, registry: SkillRegistryPayload): string[] {
  if (profile === "minimal") {
    return ["skill-librarian"];
  }
  return (registry.skills ?? [])
    .filter((entry) => entry.name === "skill-librarian" || entry.profile_fit?.includes(profile))
    .map((entry) => entry.name);
}

async function resolveRegistrySkillPath(libraryRoot: string, entryPath: string): Promise<string> {
  const candidate = isAbsolute(entryPath) ? entryPath : resolve(libraryRoot, entryPath);
  return realpath(candidate);
}

async function assertPathWithinRoot(path: string, root: string, skillName: string): Promise<void> {
  const realRoot = await realpath(root);
  const rel = relative(realRoot, path);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new SubagentSkillSelectionError(
      `Registry skill ${skillName} resolves outside the allowlisted skill library root.`,
    );
  }
}

function removeDisableModelInvocation(text: string): string {
  return text.replace(/\ndisable-model-invocation:\s*true\s*\n/u, "\n");
}

function ensureDisableModelInvocation(text: string): string {
  const parts = text.split("---");
  if (parts.length < 3) {
    return text;
  }
  if (/\ndisable-model-invocation:\s*true\s*\n/u.test(parts[1])) {
    return text;
  }
  return `---${parts[1].replace(/\s*$/u, "")}\ndisable-model-invocation: true\n---${parts.slice(2).join("---")}`;
}
