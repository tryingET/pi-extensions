import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

export const MODE_SCHEMA_VERSION = 2 as const;
export const MODE_DEFINITION_MAX_BYTES = 256 * 1024;
export const MODE_PROMPT_MAX_BYTES = 128 * 1024;
export const MODE_DIRECTORY_MAX_FILES = 1024;
export type PromptStrategy = "append" | "replace_base" | "replace_final";
export type ModeScope = "builtin" | "global" | "project";

export interface ModeDefinition {
  schemaVersion: 1 | typeof MODE_SCHEMA_VERSION;
  key: string;
  label: string;
  description?: string;
  promptStrategy: PromptStrategy;
  systemPrompt: string;
  requires?: string[];
  conflictsWith?: string[];
  before?: string[];
  after?: string[];
}

export interface ResolvedMode extends ModeDefinition {
  scope: ModeScope;
  path?: string;
}

export interface ModeDiagnostic {
  path: string;
  message: string;
}

export interface LoadedModes {
  modes: ResolvedMode[];
  diagnostics: ModeDiagnostic[];
}

export interface DefinitionFingerprint {
  digest: string;
  scope: ModeScope;
  path: string | null;
}

export type DefinitionFingerprints = Record<string, DefinitionFingerprint>;

export const BUILTIN_MODES: ModeDefinition[] = [
  {
    schemaVersion: 2,
    key: "plan",
    label: "Plan",
    description: "Plan carefully without changing files until asked.",
    promptStrategy: "append",
    systemPrompt:
      "Make a concise implementation plan before changing files. Do not edit files unless the user asks you to proceed.",
  },
  {
    schemaVersion: 2,
    key: "review",
    label: "Review",
    description: "Prioritize correctness, risks, and missing verification.",
    promptStrategy: "append",
    systemPrompt:
      "Review the current work for correctness, risks, regressions, and missing tests before proposing changes.",
  },
  {
    schemaVersion: 2,
    key: "explain",
    label: "Explain",
    description: "Explain code and decisions before proposing changes.",
    promptStrategy: "append",
    systemPrompt: "Explain the relevant code and decisions clearly before proposing changes.",
  },
];

export function isValidModeKey(value: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}$/.test(value);
}

function stringBytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function validateDisplayText(name: string, value: unknown, maxLength: number): string {
  const rawText = typeof value === "string" ? value : "";
  const text = rawText.trim();
  if (!text) throw new Error(`${name} is required`);
  if (Array.from(rawText).length > maxLength) {
    throw new Error(`${name} must be at most ${maxLength} Unicode characters`);
  }
  if (/\p{Cc}/u.test(rawText)) throw new Error(`${name} must not contain control characters`);
  if (name === "label" && /[\r\n]/.test(rawText)) throw new Error("label must be one line");
  return text;
}

function parseKeyList(name: string, value: unknown, self: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 32) {
    throw new Error(`${name} must be an array of at most 32 mode keys`);
  }
  const keys = value.map((item) => {
    if (typeof item !== "string" || !isValidModeKey(item)) {
      throw new Error(`${name} must contain valid mode keys`);
    }
    return item;
  });
  if (new Set(keys).size !== keys.length) throw new Error(`${name} must not contain duplicates`);
  if (keys.includes(self)) throw new Error(`${name} must not reference the mode itself`);
  return keys.length > 0 ? keys : undefined;
}

export function parseModeDefinition(raw: unknown): ModeDefinition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("mode must be a JSON object");
  }
  const value = raw as Record<string, unknown>;
  const schemaVersion = value.schemaVersion ?? 1;
  if (schemaVersion !== 1 && schemaVersion !== MODE_SCHEMA_VERSION) {
    throw new Error(`unsupported schemaVersion: ${String(schemaVersion)}`);
  }
  const allowed = new Set([
    "schemaVersion",
    "key",
    "label",
    "description",
    "promptStrategy",
    "systemPrompt",
    ...(schemaVersion === 2 ? ["requires", "conflictsWith", "before", "after"] : []),
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`unknown field(s): ${unknown.join(", ")}`);

  const rawKey = typeof value.key === "string" ? value.key : "";
  if (schemaVersion === 2 && rawKey !== rawKey.trim().toLowerCase()) {
    throw new Error(
      "schemaVersion 2 key must already be canonical lowercase without surrounding whitespace",
    );
  }
  const key = schemaVersion === 1 ? rawKey.trim().toLowerCase() : rawKey;
  if (!isValidModeKey(key)) {
    throw new Error(
      "key must start with a letter and contain only lowercase letters, digits, _ or - (max 64 characters)",
    );
  }
  const label = validateDisplayText("label", value.label, 120);
  const description =
    value.description === undefined
      ? ""
      : validateDisplayText("description", value.description, 1000);
  const rawSystemPrompt = typeof value.systemPrompt === "string" ? value.systemPrompt : "";
  if (!rawSystemPrompt.trim()) throw new Error("systemPrompt is required");
  if (stringBytes(rawSystemPrompt) > MODE_PROMPT_MAX_BYTES) {
    throw new Error(`systemPrompt exceeds ${MODE_PROMPT_MAX_BYTES} UTF-8 bytes`);
  }
  if (schemaVersion === 2 && value.promptStrategy === undefined) {
    throw new Error("schemaVersion 2 requires promptStrategy");
  }
  const promptStrategy = value.promptStrategy ?? "replace_base";
  if (!isPromptStrategy(promptStrategy)) {
    throw new Error("promptStrategy must be append, replace_base, or replace_final");
  }
  const requires = parseKeyList("requires", value.requires, key);
  const conflictsWith = parseKeyList("conflictsWith", value.conflictsWith, key);
  const before = parseKeyList("before", value.before, key);
  const after = parseKeyList("after", value.after, key);
  if (promptStrategy !== "append" && (before || after)) {
    throw new Error("before and after are valid only for append overlays");
  }
  const overlap = requires?.filter((candidate) => conflictsWith?.includes(candidate)) ?? [];
  if (overlap.length > 0) {
    throw new Error(`requires and conflictsWith overlap: ${overlap.join(", ")}`);
  }
  const orderOverlap = before?.filter((candidate) => after?.includes(candidate)) ?? [];
  if (orderOverlap.length > 0) {
    throw new Error(`before and after overlap: ${orderOverlap.join(", ")}`);
  }
  return {
    schemaVersion,
    key,
    label,
    ...(description ? { description } : {}),
    promptStrategy,
    systemPrompt: promptStrategy === "replace_final" ? rawSystemPrompt : rawSystemPrompt.trim(),
    ...(requires ? { requires } : {}),
    ...(conflictsWith ? { conflictsWith } : {}),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
  };
}

function isPromptStrategy(value: unknown): value is PromptStrategy {
  return value === "append" || value === "replace_base" || value === "replace_final";
}

export function modeDefinitionFingerprint(mode: ResolvedMode): DefinitionFingerprint {
  const canonical = JSON.stringify({
    schemaVersion: mode.schemaVersion,
    key: mode.key,
    label: mode.label,
    description: mode.description ?? null,
    promptStrategy: mode.promptStrategy,
    systemPrompt: mode.systemPrompt,
    requires: [...(mode.requires ?? [])].sort(),
    conflictsWith: [...(mode.conflictsWith ?? [])].sort(),
    before: [...(mode.before ?? [])].sort(),
    after: [...(mode.after ?? [])].sort(),
    scope: mode.scope,
    path: mode.path ?? null,
  });
  return {
    digest: createHash("sha256").update(canonical).digest("hex"),
    scope: mode.scope,
    path: mode.path ?? null,
  };
}

export function fingerprintsForKeys(
  keys: readonly string[],
  modes: readonly ResolvedMode[],
): DefinitionFingerprints {
  const byKey = new Map(modes.map((mode) => [mode.key, mode]));
  return Object.fromEntries(
    keys.flatMap((key) => {
      const mode = byKey.get(key);
      return mode ? [[key, modeDefinitionFingerprint(mode)] as const] : [];
    }),
  );
}

/** Mirror Pi's ancestor discovery order: filesystem root to the active cwd. */
export function ancestorModeDirectories(cwd: string, configDirName = ".pi"): string[] {
  const directories: string[] = [];
  let current = resolve(cwd);
  while (true) {
    directories.push(join(current, configDirName, "modes"));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return directories.reverse();
}

function findSymbolicLinkBoundary(path: string): string | undefined {
  let current = resolve(path);
  while (true) {
    try {
      if (lstatSync(current).isSymbolicLink()) return current;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function loadModeDirectory(dir: string, scope: Exclude<ModeScope, "builtin">): LoadedModes {
  const modes: ResolvedMode[] = [];
  const diagnostics: ModeDiagnostic[] = [];
  let files: string[];
  try {
    const symbolicLinkBoundary = findSymbolicLinkBoundary(dir);
    if (symbolicLinkBoundary) {
      return {
        modes,
        diagnostics: [
          {
            path: dir,
            message: `mode path crosses symbolic-link boundary: ${symbolicLinkBoundary}`,
          },
        ],
      };
    }
    if (!existsSync(dir)) return { modes, diagnostics };
    if (!lstatSync(dir).isDirectory()) {
      return {
        modes,
        diagnostics: [{ path: dir, message: "mode directory path is not a directory" }],
      };
    }
    files = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    return {
      modes,
      diagnostics: [
        {
          path: dir,
          message: `unable to read mode directory: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
  if (files.length > MODE_DIRECTORY_MAX_FILES) {
    diagnostics.push({
      path: dir,
      message: `mode directory has ${files.length} JSON files; only the first ${MODE_DIRECTORY_MAX_FILES} are loaded`,
    });
  }
  for (const file of files.slice(0, MODE_DIRECTORY_MAX_FILES)) {
    const path = join(dir, file);
    try {
      if (lstatSync(path).isSymbolicLink())
        throw new Error("mode file must not be a symbolic link");
      if (statSync(path).size > MODE_DEFINITION_MAX_BYTES) {
        throw new Error(`mode file exceeds ${MODE_DEFINITION_MAX_BYTES} bytes`);
      }
      const mode = parseModeDefinition(JSON.parse(readFileSync(path, "utf8")));
      if (file !== `${mode.key}.json`) throw new Error(`filename must be ${mode.key}.json`);
      modes.push({ ...mode, scope, path });
    } catch (error) {
      diagnostics.push({ path, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { modes, diagnostics };
}

export function loadModes(options: {
  globalDir: string;
  projectDir?: string;
  projectDirs?: readonly string[];
  projectTrusted: boolean;
}): LoadedModes {
  const byKey = new Map<string, ResolvedMode>(
    BUILTIN_MODES.map((mode) => [mode.key, { ...mode, scope: "builtin" }]),
  );
  const diagnostics: ModeDiagnostic[] = [];
  const global = loadModeDirectory(options.globalDir, "global");
  diagnostics.push(...global.diagnostics);
  for (const mode of global.modes) byKey.set(mode.key, mode);
  if (options.projectTrusted) {
    const projectDirs = options.projectDirs ?? (options.projectDir ? [options.projectDir] : []);
    for (const projectDir of projectDirs) {
      const project = loadModeDirectory(projectDir, "project");
      diagnostics.push(...project.diagnostics);
      for (const mode of project.modes) byKey.set(mode.key, mode);
    }
  }
  return {
    modes: [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
    diagnostics,
  };
}

export function modePath(dir: string, key: string): string {
  if (!isValidModeKey(key)) throw new Error("invalid mode key");
  const base = resolve(dir);
  const target = resolve(base, `${key}.json`);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw new Error("mode path escapes mode directory");
  }
  return target;
}

export function saveMode(dir: string, mode: ModeDefinition): string {
  const normalized = parseModeDefinition(mode);
  const serialized: ModeDefinition = { ...normalized, schemaVersion: MODE_SCHEMA_VERSION };
  const target = modePath(dir, normalized.key);
  mkdirSync(dirname(target), { recursive: true });
  const symbolicLinkBoundary = findSymbolicLinkBoundary(dirname(target));
  if (symbolicLinkBoundary) {
    throw new Error(`mode path crosses symbolic-link boundary: ${symbolicLinkBoundary}`);
  }
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
    throw new Error("mode file must not be a symbolic link");
  }
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(serialized, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, target);
    return target;
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function deleteMode(path: string, expectedDir: string): void {
  const base = resolve(expectedDir);
  const target = resolve(path);
  if (!target.startsWith(`${base}${sep}`) || !target.endsWith(".json")) {
    throw new Error("refusing to delete outside the selected mode directory");
  }
  const symbolicLinkBoundary = findSymbolicLinkBoundary(target);
  if (symbolicLinkBoundary) {
    throw new Error(`mode path crosses symbolic-link boundary: ${symbolicLinkBoundary}`);
  }
  rmSync(target);
}
