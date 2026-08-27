// ---
// summary: engineering-core skill profile loading, skill-source resolution, and child skill-dir materialization.
// read_when:
//   - changing EC profile handling, extras resolution roots, or materialized skill directory layout.
// ---

import { existsSync, realpathSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const DEFAULT_EC_PROFILES_RELATIVE = "ai-society/core/engineering-core/skills/profiles.json";
export const EC_PROFILES_ENV = "PI_AGENT_REGISTRY_EC_PROFILES";
export const EC_PROFILE_SCHEMA = "engineering-core.skill-profiles/1";
const PROFILE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const ENVELOPE_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "generated",
  "profiles",
  "deprecated_aliases",
]);

export interface EcProfileSource {
  /** Absolute path of the loaded profiles.json. */
  path: string;
  /** Absolute engineering-core skills root (dirname of profiles.json). */
  skillsRoot: string;
  /** Loaded source contract (legacy is transition-read compatibility only). */
  schema: typeof EC_PROFILE_SCHEMA | "legacy-raw-map";
  /** Canonical profile name -> ordered member skill names. */
  profiles: Map<string, string[]>;
  /** Deprecated profile alias -> canonical profile name. */
  deprecatedAliases: Map<string, string>;
}

export class EcProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcProfileError";
  }
}

export function defaultEcProfilesPath(): string {
  const override = process.env[EC_PROFILES_ENV]?.trim();
  if (override) {
    return override.startsWith("~/") ? join(homedir(), override.slice(2)) : resolve(override);
  }
  return resolve(homedir(), DEFAULT_EC_PROFILES_RELATIVE);
}

export async function loadEcProfiles(path?: string): Promise<EcProfileSource> {
  const resolvedPath = resolve(path ?? defaultEcProfilesPath());
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(resolvedPath, "utf8"));
  } catch (error) {
    throw new EcProfileError(
      `engineering-core skill profiles could not be read from ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new EcProfileError(
      `engineering-core skill profiles must be a JSON object: ${resolvedPath}`,
    );
  }

  const isEnvelope = Object.hasOwn(parsed, "schema");
  let schema: EcProfileSource["schema"] = "legacy-raw-map";
  let profilePayload: Record<string, unknown> = parsed;
  const deprecatedAliases = new Map<string, string>();

  if (isEnvelope) {
    const unknownKeys = Object.keys(parsed).filter((key) => !ENVELOPE_KEYS.has(key));
    if (unknownKeys.length > 0) {
      throw new EcProfileError(
        `unknown engineering-core skill profile envelope keys: ${unknownKeys.sort().join(", ")}`,
      );
    }
    if (parsed.schema !== EC_PROFILE_SCHEMA) {
      throw new EcProfileError(
        `engineering-core skill profile schema mismatch: expected ${EC_PROFILE_SCHEMA}, got ${JSON.stringify(parsed.schema)}`,
      );
    }
    if (!isRecord(parsed.profiles)) {
      throw new EcProfileError(
        `engineering-core skill profile envelope must contain a profiles object: ${resolvedPath}`,
      );
    }
    if (!isRecord(parsed.deprecated_aliases)) {
      throw new EcProfileError(
        `engineering-core skill profile envelope must contain a deprecated_aliases object: ${resolvedPath}`,
      );
    }
    schema = EC_PROFILE_SCHEMA;
    profilePayload = parsed.profiles;
    for (const [alias, target] of Object.entries(parsed.deprecated_aliases)) {
      if (
        !PROFILE_NAME_PATTERN.test(alias) ||
        typeof target !== "string" ||
        !PROFILE_NAME_PATTERN.test(target)
      ) {
        throw new EcProfileError(
          `deprecated_aliases must map valid alias names to canonical profile names`,
        );
      }
      deprecatedAliases.set(alias, target);
    }
  }

  const profiles = parseProfileMap(profilePayload, resolvedPath);
  for (const [alias, target] of deprecatedAliases) {
    if (profiles.has(alias)) {
      throw new EcProfileError(
        `deprecated profile alias "${alias}" collides with a canonical profile name`,
      );
    }
    if (!profiles.has(target)) {
      throw new EcProfileError(
        `deprecated profile alias "${alias}" references unknown canonical profile "${target}"`,
      );
    }
  }

  return {
    path: resolvedPath,
    skillsRoot: dirname(resolvedPath),
    schema,
    profiles,
    deprecatedAliases,
  };
}

/** Canonical profiles plus transition aliases, for manifest load-time validation. */
export function knownEcProfiles(ec: EcProfileSource): Map<string, readonly string[]> {
  const known = new Map<string, readonly string[]>(ec.profiles);
  for (const [alias, target] of ec.deprecatedAliases) {
    const members = ec.profiles.get(target);
    if (members) known.set(alias, members);
  }
  return known;
}

function parseProfileMap(
  payload: Record<string, unknown>,
  resolvedPath: string,
): Map<string, string[]> {
  const profiles = new Map<string, string[]>();
  for (const [profile, members] of Object.entries(payload)) {
    if (!PROFILE_NAME_PATTERN.test(profile)) {
      throw new EcProfileError(`invalid profile key "${profile}" in ${resolvedPath}`);
    }
    if (
      !Array.isArray(members) ||
      members.some((entry) => typeof entry !== "string" || !SKILL_NAME_PATTERN.test(entry))
    ) {
      throw new EcProfileError(`profile "${profile}" must map to an array of valid skill names`);
    }
    if (new Set(members).size !== members.length) {
      throw new EcProfileError(`profile "${profile}" contains duplicate skill names`);
    }
    profiles.set(profile, [...(members as string[])]);
  }
  return profiles;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface SkillSourceRoots {
  ecSkillsRoot: string;
  manifestRoot: string;
  userSkillsRoot: string;
}

export interface SkillSelection {
  /** EC profile name when the manifest declared one. */
  profile?: string;
  /** Profile member skill names. */
  profileMembers: string[];
  /** Extra skill names declared by the manifest. */
  extras: string[];
  /** Deduplicated member + extra names in stable order. */
  selected: string[];
  /** Skill name -> absolute SKILL.md source path. */
  sources: Map<string, string>;
}

export function resolveSkillSourcePath(name: string, roots: SkillSourceRoots): string | undefined {
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new EcProfileError(`invalid skill name: ${JSON.stringify(name)}`);
  }
  const candidates = [
    { root: roots.ecSkillsRoot, path: join(roots.ecSkillsRoot, name, "SKILL.md") },
    {
      root: join(roots.manifestRoot, ".pi", "skills"),
      path: join(roots.manifestRoot, ".pi", "skills", name, "SKILL.md"),
    },
    { root: roots.userSkillsRoot, path: join(roots.userSkillsRoot, name, "SKILL.md") },
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) continue;
    const realRoot = realpathSync(candidate.root);
    const realCandidate = realpathSync(candidate.path);
    assertPathWithinRoot(realCandidate, realRoot, `skill ${name}`);
    if (!statSync(realCandidate).isFile()) {
      throw new EcProfileError(`skill source is not a regular file: ${realCandidate}`);
    }
    return realCandidate;
  }
  return undefined;
}

export function planSkillSelection(params: {
  profile?: string;
  extra?: string[];
  ec: EcProfileSource;
  manifestRoot: string;
  userSkillsRoot: string;
}): SkillSelection {
  const roots: SkillSourceRoots = {
    ecSkillsRoot: params.ec.skillsRoot,
    manifestRoot: params.manifestRoot,
    userSkillsRoot: params.userSkillsRoot,
  };

  let profileMembers: string[] = [];
  if (params.profile !== undefined) {
    const canonicalProfile = params.ec.deprecatedAliases.get(params.profile) ?? params.profile;
    const members = params.ec.profiles.get(canonicalProfile);
    if (!members) {
      throw new EcProfileError(
        `unknown engineering-core skill profile: ${params.profile} (known: ${[...knownEcProfiles(params.ec).keys()].sort().join(", ") || "none"})`,
      );
    }
    const missing = members.filter((name) => resolveSkillSourcePath(name, roots) === undefined);
    if (missing.length > 0) {
      throw new EcProfileError(
        `engineering-core profile "${params.profile}" references missing skills: ${missing.join(", ")}`,
      );
    }
    profileMembers = [...members];
  }

  const extras = params.extra ?? [];
  const sources = new Map<string, string>();
  for (const name of [...profileMembers, ...extras]) {
    if (!sources.has(name)) {
      const source = resolveSkillSourcePath(name, roots);
      if (source === undefined) {
        throw new EcProfileError(
          `skill "${name}" not found in engineering-core skills root, agent repo .pi/skills, or the user skills root`,
        );
      }
      sources.set(name, source);
    }
  }

  return {
    ...(params.profile !== undefined ? { profile: params.profile } : {}),
    profileMembers,
    extras: [...extras],
    selected: [...sources.keys()],
    sources,
  };
}

export interface MaterializedSkillDirs {
  dir: string;
  skills: string[];
  cleanup: () => Promise<void>;
}

/**
 * Materialize selected skills into a temp directory laid out as
 * `<dir>/<skill-name>/SKILL.md`, matching ASC's materialized skill layout.
 * `disable-model-invocation: true` frontmatter is stripped so the child can
 * invoke the skills (parity with ASC visible-skill materialization).
 */
export async function materializeSkillDirs(
  selection: SkillSelection,
  label: string,
): Promise<MaterializedSkillDirs> {
  const safeLabel = label.replace(/[^a-z0-9-]/giu, "-").slice(0, 48) || "agent";
  const dir = await mkdtemp(join(tmpdir(), `pi-agent-registry-${safeLabel}-`));
  try {
    for (const name of selection.selected) {
      const source = selection.sources.get(name);
      if (!source) {
        throw new EcProfileError(`skill source missing during materialization: ${name}`);
      }
      const sourceStat = await stat(source).catch(() => undefined);
      if (!sourceStat?.isFile()) {
        throw new EcProfileError(`skill source is not a regular file: ${source}`);
      }
      const text = await readFile(source, "utf8");
      const destinationDir = join(dir, name);
      assertPathWithinRoot(destinationDir, dir, `materialized skill ${name}`);
      await mkdir(destinationDir, { recursive: true });
      await writeFile(join(destinationDir, "SKILL.md"), removeDisableModelInvocation(text), "utf8");
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    dir,
    skills: [...selection.selected],
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

function removeDisableModelInvocation(text: string): string {
  return text.replace(/\ndisable-model-invocation:\s*true\s*\n/u, "\n");
}

/** Assert a candidate skill path stays within its owning root (defense in depth). */
export function assertPathWithinRoot(candidate: string, root: string, label: string): void {
  const rel = relative(resolve(root), resolve(candidate));
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new EcProfileError(`${label} resolves outside its allowed root: ${candidate}`);
  }
}
