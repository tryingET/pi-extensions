// ---
// summary: fail-closed agent.json manifest loading and validation for the ai-society.agent/1 schema.
// read_when:
//   - changing the manifest schema, validation rules, or path-containment policy.
// ---

import { constants, type Stats } from "node:fs";
import { lstat, open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const AGENT_MANIFEST_SCHEMA = "ai-society.agent/1";
export const AGENT_MANIFEST_FILENAME = "agent.json";

export type AgentThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const MANIFEST_MAX_BYTES = 64 * 1024;
const SYSTEM_PROMPT_MAX_BYTES = 512 * 1024;
const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]*$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
export const AGENT_CREATION_TASK_PATTERN = /^AK-[1-9][0-9]*$/u;
const TOOL_NAME_PATTERN = /^[a-z0-9_]+$/u;
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const EXTENSION_NAME_PATTERN = /^[A-Za-z0-9@.][A-Za-z0-9@/._-]*$/u;
const THINKING_LEVELS: ReadonlySet<string> = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
const RESERVED_AGENT_NAMES: ReadonlySet<string> = new Set([
  "custom",
  "explorer",
  "reviewer",
  "tester",
  "researcher",
  "minimal",
]);
export const AGENT_MANIFEST_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "name",
  "version",
  "display_name",
  "role",
  "creation_task",
  "system_prompt_file",
  "skills",
  "tools",
  "extensions",
  "defaults",
  "scope",
  "activities",
]);

function decodeStrictUtf8(bytes: Buffer, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not strict UTF-8`);
  }
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function containsUnpairedSurrogate(value: unknown): boolean {
  if (typeof value === "string") return hasUnpairedSurrogate(value);
  if (Array.isArray(value)) return value.some(containsUnpairedSurrogate);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, entry]) => hasUnpairedSurrogate(key) || containsUnpairedSurrogate(entry),
  );
}

export class AgentManifestError extends Error {
  readonly manifestPath: string;

  constructor(message: string, manifestPath: string) {
    super(`${manifestPath}: ${message}`);
    this.name = "AgentManifestError";
    this.manifestPath = manifestPath;
  }
}

export interface AgentManifestSkills {
  profile?: string;
  extra?: string[];
}

export interface AgentManifestDefaults {
  model: string | null;
  thinking: AgentThinkingLevel;
}

export interface AgentManifestScope {
  repos?: string[];
  forbidden?: string[];
  /** Operator note rendered into the composed system prompt scope section. */
  note?: string;
}

export interface AgentManifest {
  schema: string;
  name: string;
  version?: string;
  display_name?: string;
  /** Canonical human-readable role-card name; required by v2 fleet lint. */
  role?: string;
  /** Exact AK creation-task provenance reference; required by v2 fleet lint. */
  creation_task?: string;
  system_prompt_file: string;
  skills?: AgentManifestSkills;
  tools: string[];
  extensions: string[];
  defaults: AgentManifestDefaults;
  scope?: AgentManifestScope;
  activities: string[];
  /** Absolute path of the agent repo root containing this manifest. */
  root: string;
  /** Absolute path of the agent.json file. */
  manifestPath: string;
}

export interface LoadAgentManifestOptions {
  /**
   * Known engineering-core skill profiles (from skills/profiles.json).
   * Required to fail closed on unknown `skills.profile` at load time.
   */
  ecProfiles?: ReadonlyMap<string, readonly string[]>;
}

export async function loadAgentManifest(
  agentRoot: string,
  options?: LoadAgentManifestOptions,
): Promise<AgentManifest> {
  const root = resolve(agentRoot);
  const manifestPath = resolve(root, AGENT_MANIFEST_FILENAME);
  let rawText: string;
  try {
    const initialStat = await lstat(manifestPath);
    if (!initialStat.isFile() || initialStat.isSymbolicLink()) {
      throw new AgentManifestError("agent.json is not a non-symlink regular file", manifestPath);
    }
    if (initialStat.size > MANIFEST_MAX_BYTES) {
      throw new AgentManifestError(`agent.json exceeds ${MANIFEST_MAX_BYTES} bytes`, manifestPath);
    }
    const handle = await open(manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const openedStat = await handle.stat();
      if (
        !openedStat.isFile() ||
        openedStat.dev !== initialStat.dev ||
        openedStat.ino !== initialStat.ino ||
        openedStat.size !== initialStat.size
      ) {
        throw new AgentManifestError("agent.json identity changed while opening", manifestPath);
      }
      const rawBytes = await handle.readFile();
      rawText = decodeStrictUtf8(rawBytes, "agent.json");
      const finalStat = await handle.stat();
      if (
        finalStat.dev !== openedStat.dev ||
        finalStat.ino !== openedStat.ino ||
        finalStat.size !== openedStat.size
      ) {
        throw new AgentManifestError("agent.json identity changed while reading", manifestPath);
      }
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof AgentManifestError) throw error;
    throw new AgentManifestError(
      `agent.json could not be read: ${error instanceof Error ? error.message : String(error)}`,
      manifestPath,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new AgentManifestError(
      `agent.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      manifestPath,
    );
  }

  return validateAgentManifest(parsed, root, manifestPath, options);
}

export function validateAgentManifest(
  candidate: unknown,
  root: string,
  manifestPath: string,
  options?: LoadAgentManifestOptions,
): AgentManifest {
  const fail = (message: string): AgentManifestError =>
    new AgentManifestError(message, manifestPath);

  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw fail("agent.json must be a JSON object");
  }
  const record = candidate as Record<string, unknown>;

  if (containsUnpairedSurrogate(candidate)) {
    throw fail("agent.json contains an unpaired Unicode surrogate");
  }

  if (record.schema !== AGENT_MANIFEST_SCHEMA) {
    throw fail(
      `schema must be "${AGENT_MANIFEST_SCHEMA}" (got ${JSON.stringify(record.schema ?? null)})`,
    );
  }

  const name = requireString(record.name, "name", fail);
  if (!AGENT_NAME_PATTERN.test(name) || name.length > 64) {
    throw fail(
      `name must match ${AGENT_NAME_PATTERN.source} and be at most 64 characters (got ${JSON.stringify(name)})`,
    );
  }
  if (RESERVED_AGENT_NAMES.has(name)) {
    throw fail(`name is reserved by ASC subagent profiles: ${name}`);
  }

  let version: string | undefined;
  if (record.version !== undefined) {
    version = requireString(record.version, "version", fail);
    if (!VERSION_PATTERN.test(version)) {
      throw fail(`version must be a semantic version string (got ${JSON.stringify(version)})`);
    }
  }

  let display_name: string | undefined;
  if (record.display_name !== undefined) {
    display_name = requireString(record.display_name, "display_name", fail);
  }

  let role: string | undefined;
  if (record.role !== undefined) {
    role = requireString(record.role, "role", fail);
  }

  let creation_task: string | undefined;
  if (record.creation_task !== undefined) {
    creation_task = requireString(record.creation_task, "creation_task", fail);
    if (!AGENT_CREATION_TASK_PATTERN.test(creation_task)) {
      throw fail("creation_task must match AK-<positive integer>");
    }
  }

  const system_prompt_file = requireString(record.system_prompt_file, "system_prompt_file", fail);
  if (isAbsolute(system_prompt_file) || hasParentSegment(system_prompt_file)) {
    throw fail(
      `system_prompt_file must be a relative path inside the agent repo (got ${JSON.stringify(system_prompt_file)})`,
    );
  }
  resolveWithinRoot(root, system_prompt_file, "system_prompt_file", fail);

  let skills: AgentManifestSkills | undefined;
  if (record.skills !== undefined) {
    if (
      typeof record.skills !== "object" ||
      record.skills === null ||
      Array.isArray(record.skills)
    ) {
      throw fail("skills must be an object");
    }
    const skillsRecord = record.skills as Record<string, unknown>;
    let profile: string | undefined;
    if (skillsRecord.profile !== undefined && skillsRecord.profile !== null) {
      profile = requireString(skillsRecord.profile, "skills.profile", fail);
      if (options?.ecProfiles && !options.ecProfiles.has(profile)) {
        throw fail(
          `skills.profile "${profile}" is not a known engineering-core profile (known: ${[...options.ecProfiles.keys()].sort().join(", ") || "none"})`,
        );
      }
    }
    let extra: string[] | undefined;
    if (skillsRecord.extra !== undefined) {
      if (!Array.isArray(skillsRecord.extra)) {
        throw fail("skills.extra must be an array of skill names");
      }
      extra = skillsRecord.extra.map((entry, index) => {
        if (typeof entry !== "string" || !SKILL_NAME_PATTERN.test(entry)) {
          throw fail(`skills.extra[${index}] must be a skill name string`);
        }
        return entry;
      });
      if (new Set(extra).size !== extra.length) {
        throw fail("skills.extra contains duplicate entries");
      }
    }
    if (profile !== undefined || extra !== undefined) {
      skills = { ...(profile ? { profile } : {}), ...(extra ? { extra } : {}) };
    }
  }

  if (!Array.isArray(record.tools)) {
    throw fail("tools must be an array (empty array declares a read-only agent)");
  }
  const tools = record.tools.map((entry, index) => {
    if (typeof entry !== "string" || !TOOL_NAME_PATTERN.test(entry)) {
      throw fail(`tools[${index}] must be a tool name matching ${TOOL_NAME_PATTERN.source}`);
    }
    return entry;
  });
  if (new Set(tools).size !== tools.length) {
    throw fail("tools contains duplicate entries");
  }

  let extensions: string[] = [];
  if (record.extensions !== undefined) {
    if (!Array.isArray(record.extensions)) {
      throw fail("extensions must be an array");
    }
    extensions = record.extensions.map((entry, index) => {
      if (
        typeof entry !== "string" ||
        !EXTENSION_NAME_PATTERN.test(entry) ||
        entry.length === 0 ||
        isAbsolute(entry) ||
        hasParentSegment(entry)
      ) {
        throw fail(`extensions[${index}] must be an extension name or a contained ./ path`);
      }
      if (entry.includes("/") && !entry.startsWith("./") && !entry.startsWith("@")) {
        throw fail(
          `extensions[${index}] filesystem paths must start with ./ and stay inside the agent repo`,
        );
      }
      if (entry.startsWith("./")) {
        resolveWithinRoot(root, entry, `extensions[${index}]`, fail);
      }
      return entry;
    });
    if (new Set(extensions).size !== extensions.length) {
      throw fail("extensions contains duplicate entries");
    }
  }

  let defaults: AgentManifestDefaults = { model: null, thinking: "medium" };
  if (record.defaults !== undefined) {
    if (typeof record.defaults !== "object" || record.defaults === null) {
      throw fail("defaults must be an object");
    }
    const defaultsRecord = record.defaults as Record<string, unknown>;
    let model: string | null = null;
    if (defaultsRecord.model !== undefined && defaultsRecord.model !== null) {
      if (typeof defaultsRecord.model !== "string" || defaultsRecord.model.trim().length === 0) {
        throw fail("defaults.model must be a non-empty provider/model string or null");
      }
      model = defaultsRecord.model.trim();
    }
    let thinking: AgentThinkingLevel = "medium";
    if (defaultsRecord.thinking !== undefined) {
      if (
        typeof defaultsRecord.thinking !== "string" ||
        !THINKING_LEVELS.has(defaultsRecord.thinking)
      ) {
        throw fail(
          `defaults.thinking must be one of off, minimal, low, medium, high, xhigh, max (got ${JSON.stringify(defaultsRecord.thinking)})`,
        );
      }
      thinking = defaultsRecord.thinking as AgentThinkingLevel;
    }
    defaults = { model, thinking };
  }

  let scope: AgentManifestScope | undefined;
  if (record.scope !== undefined) {
    if (typeof record.scope !== "object" || record.scope === null) {
      throw fail("scope must be an object");
    }
    const scopeRecord = record.scope as Record<string, unknown>;
    const scopeOut: AgentManifestScope = {};
    if (scopeRecord.repos !== undefined) {
      scopeOut.repos = requireStringArray(scopeRecord.repos, "scope.repos", fail);
    }
    if (scopeRecord.forbidden !== undefined) {
      scopeOut.forbidden = requireStringArray(scopeRecord.forbidden, "scope.forbidden", fail);
    }
    if (scopeRecord.note !== undefined) {
      if (typeof scopeRecord.note !== "string") {
        throw fail("scope.note must be a string");
      }
      const note = scopeRecord.note.trim();
      if (note) scopeOut.note = note;
    }
    if (
      scopeOut.repos !== undefined ||
      scopeOut.forbidden !== undefined ||
      scopeOut.note !== undefined
    ) {
      scope = scopeOut;
    }
  }

  let activities: string[] = [];
  if (record.activities !== undefined) {
    if (!Array.isArray(record.activities)) {
      throw fail("activities must be an array of relative file paths");
    }
    activities = record.activities.map((entry, index) => {
      if (typeof entry !== "string" || isAbsolute(entry) || hasParentSegment(entry)) {
        throw fail(`activities[${index}] must be a relative path inside the agent repo`);
      }
      if (isActivityGlob(dirname(entry))) {
        throw fail(`activities[${index}] may use glob metacharacters only in the file name`);
      }
      return entry;
    });
    if (new Set(activities).size !== activities.length) {
      throw fail("activities contains duplicate entries");
    }
  }

  return {
    schema: AGENT_MANIFEST_SCHEMA,
    name,
    ...(version ? { version } : {}),
    ...(display_name ? { display_name } : {}),
    ...(role ? { role } : {}),
    ...(creation_task ? { creation_task } : {}),
    system_prompt_file,
    ...(skills ? { skills } : {}),
    tools,
    extensions,
    defaults,
    ...(scope ? { scope } : {}),
    activities,
    root,
    manifestPath,
  };
}

/** Load and return the system prompt file contents (fail-closed). */
export async function readAgentSystemPrompt(manifest: AgentManifest): Promise<string> {
  const systemPromptPath = resolveWithinRoot(
    manifest.root,
    manifest.system_prompt_file,
    "system_prompt_file",
    (message) => new AgentManifestError(message, manifest.manifestPath),
  );
  try {
    const { path: realSystemPromptPath, fileStat } = await assertExistingPathWithinRoot(
      manifest.root,
      systemPromptPath,
      `system_prompt_file ${JSON.stringify(manifest.system_prompt_file)}`,
      manifest,
      "file",
    );
    if (fileStat.size > SYSTEM_PROMPT_MAX_BYTES) {
      throw new AgentManifestError(
        `system_prompt_file exceeds ${SYSTEM_PROMPT_MAX_BYTES} bytes: ${manifest.system_prompt_file}`,
        manifest.manifestPath,
      );
    }
    const bytes = await readFile(realSystemPromptPath);
    try {
      return decodeStrictUtf8(bytes, "system_prompt_file");
    } catch {
      throw new AgentManifestError("system_prompt_file is not strict UTF-8", manifest.manifestPath);
    }
  } catch (error) {
    if (error instanceof AgentManifestError) throw error;
    throw new AgentManifestError(
      `system_prompt_file could not be read: ${manifest.system_prompt_file}`,
      manifest.manifestPath,
    );
  }
}

/** True when an activities entry uses glob metacharacters (expanded at resolution). */
export function isActivityGlob(entry: string): boolean {
  return /[*?[]/u.test(entry);
}

/**
 * Expand declared activities into concrete file paths (fail-closed).
 * Literal entries must exist; glob entries must match at least one file.
 */
export async function expandAgentActivities(manifest: AgentManifest): Promise<string[]> {
  const expanded: string[] = [];
  for (const activity of manifest.activities) {
    const activityPath = resolveWithinRoot(
      manifest.root,
      activity,
      `activities entry ${JSON.stringify(activity)}`,
      (message) => new AgentManifestError(message, manifest.manifestPath),
    );
    if (isActivityGlob(activity)) {
      const pattern = globToRegExp(activity);
      const baseRelative = dirname(activity).split(sep).join("/");
      const basePath = resolve(manifest.root, baseRelative);
      const { path: realBasePath } = await assertExistingPathWithinRoot(
        manifest.root,
        basePath,
        `activities glob base ${JSON.stringify(baseRelative)}`,
        manifest,
        "directory",
      );
      const entries = await readdir(realBasePath, { withFileTypes: true });
      const matches = entries
        .filter((entry) => entry.isFile())
        .map((entry) => (baseRelative === "." ? entry.name : `${baseRelative}/${entry.name}`))
        .filter((relativeEntry) => pattern.test(relativeEntry))
        .sort();
      if (matches.length === 0) {
        throw new AgentManifestError(
          `activities glob matched no files: ${activity}`,
          manifest.manifestPath,
        );
      }
      for (const match of matches) {
        await assertExistingPathWithinRoot(
          manifest.root,
          resolve(manifest.root, match),
          `activities match ${JSON.stringify(match)}`,
          manifest,
          "file",
        );
      }
      expanded.push(...matches);
      continue;
    }
    await assertExistingPathWithinRoot(
      manifest.root,
      activityPath,
      `activities entry ${JSON.stringify(activity)}`,
      manifest,
      "file",
    );
    expanded.push(activity);
  }
  return expanded;
}

/** Minimal leaf-file glob: `*` and `?` never cross a path separator. */
export function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += char.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
  }
  return new RegExp(`^${source}$`, "u");
}

/** Resolve extension entries: contained ./ paths become manifest-root-relative absolute paths. */
export function resolveAgentExtensions(manifest: AgentManifest): string[] {
  return manifest.extensions.map((entry) =>
    entry.startsWith("./") ? resolve(manifest.root, entry) : entry,
  );
}

/** Verify filesystem-backed extension entries exist and remain inside the agent repo. */
export async function assertAgentExtensionsExist(manifest: AgentManifest): Promise<void> {
  for (const entry of manifest.extensions) {
    if (!entry.startsWith("./")) continue;
    await assertExistingPathWithinRoot(
      manifest.root,
      resolve(manifest.root, entry),
      `extension ${JSON.stringify(entry)}`,
      manifest,
      "file",
    );
  }
}

export function resolveWithinRoot(
  root: string,
  relativePath: string,
  label: string,
  fail: (message: string) => AgentManifestError,
): string {
  const resolved = resolve(root, relativePath);
  const rel = relative(resolve(root), resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw fail(`${label} escapes the agent repo root: ${relativePath}`);
  }
  return resolved;
}

async function assertExistingPathWithinRoot(
  root: string,
  candidate: string,
  label: string,
  manifest: AgentManifest,
  kind: "file" | "directory",
): Promise<{ path: string; fileStat: Stats }> {
  try {
    const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
    const rel = relative(realRoot, realCandidate);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new AgentManifestError(
        `${label} resolves outside the agent repo root: ${candidate}`,
        manifest.manifestPath,
      );
    }
    const fileStat = await stat(realCandidate);
    const validKind = kind === "file" ? fileStat.isFile() : fileStat.isDirectory();
    if (!validKind) {
      throw new AgentManifestError(
        `${label} is not a regular ${kind}: ${candidate}`,
        manifest.manifestPath,
      );
    }
    return { path: realCandidate, fileStat };
  } catch (error) {
    if (error instanceof AgentManifestError) throw error;
    throw new AgentManifestError(
      `${label} does not exist or cannot be resolved inside the agent repo`,
      manifest.manifestPath,
    );
  }
}

function hasParentSegment(value: string): boolean {
  return value.split(/[\\/]/u).includes("..");
}

function requireString(
  value: unknown,
  label: string,
  fail: (message: string) => AgentManifestError,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw fail(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireStringArray(
  value: unknown,
  label: string,
  fail: (message: string) => AgentManifestError,
): string[] {
  if (!Array.isArray(value)) {
    throw fail(`${label} must be an array of non-empty strings`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw fail(`${label}[${index}] must be a non-empty string`);
    }
    return entry.trim();
  });
}

/** Default user-level skills root used for `skills.extra` resolution. */
export function defaultUserSkillsRoot(): string {
  const override = process.env.PI_AGENT_REGISTRY_USER_SKILLS?.trim();
  if (override) {
    return override.startsWith("~/") ? join(homedir(), override.slice(2)) : resolve(override);
  }
  return resolve(homedir(), ".pi", "agent", "skills");
}
