import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { BUILTIN_MODES } from "./builtin-modes.ts";
import {
  hasPromptFile,
  MODE_PROMPT_MAX_BYTES,
  promptFilePath,
  promptFileText,
  readPromptFile,
  writeFileAtomically,
} from "./mode-prompt-file.ts";

export { BUILTIN_MODES, MODE_PROMPT_MAX_BYTES };

export const MODE_SCHEMA_VERSION = 2 as const;
export const MODE_DEFINITION_MAX_BYTES = 256 * 1024;
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
  // A project mode that took over a key defined earlier: built-in, global, or an outer project
  // directory (`shadowedPath`). Not part of the fingerprint.
  shadows?: ModeScope;
  shadowedPath?: string;
  // The sibling <key>.md its prompt was read from, when it lives there. Not part of the fingerprint:
  // moving an identical prompt into the file is not a change.
  promptPath?: string;
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

/**
 * Validates a mode definition. `promptFromFile` is the content of a sibling <key>.md when there is
 * one: it is then the prompt, and the JSON must not also carry `systemPrompt`.
 */
export function parseModeDefinition(raw: unknown, promptFromFile?: string): ModeDefinition {
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
  if (promptFromFile !== undefined) {
    if (schemaVersion !== MODE_SCHEMA_VERSION) {
      throw new Error(`a ${key}.md prompt file needs schemaVersion 2`);
    }
    if (value.systemPrompt !== undefined) {
      throw new Error(`systemPrompt is set and ${key}.md exists; keep the prompt in one of them`);
    }
  }
  const rawSystemPrompt =
    promptFromFile ?? (typeof value.systemPrompt === "string" ? value.systemPrompt : "");
  if (!rawSystemPrompt.trim()) {
    throw new Error(
      promptFromFile === undefined
        ? `systemPrompt is required, inline or in ${key}.md`
        : `${key}.md is empty`,
    );
  }
  if (schemaVersion === 2 && value.promptStrategy === undefined) {
    throw new Error("schemaVersion 2 requires promptStrategy");
  }
  const promptStrategy = value.promptStrategy ?? "replace_base";
  if (!isPromptStrategy(promptStrategy)) {
    throw new Error("promptStrategy must be append, replace_base, or replace_final");
  }
  // A prompt file's own trailing newline is not part of the prompt it holds.
  const measured =
    promptFromFile !== undefined && promptStrategy !== "replace_final"
      ? rawSystemPrompt.trim()
      : rawSystemPrompt;
  if (stringBytes(measured) > MODE_PROMPT_MAX_BYTES) {
    throw new Error(`systemPrompt exceeds ${MODE_PROMPT_MAX_BYTES} UTF-8 bytes`);
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

/**
 * Reads one mode definition file and the prompt file beside it, as the loader and the linter both do.
 * The filename is checked against a valid declared key before any prompt file is looked up, so a
 * prompt-file error always names the file really read; an invalid key is left to the parser, which
 * reports it precisely.
 */
export function readModeFile(path: string): { definition: ModeDefinition; promptPath?: string } {
  if (lstatSync(path).isSymbolicLink()) throw new Error("mode file must not be a symbolic link");
  if (statSync(path).size > MODE_DEFINITION_MAX_BYTES) {
    throw new Error(`mode file exceeds ${MODE_DEFINITION_MAX_BYTES} bytes`);
  }
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const declaredKey =
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    typeof (raw as { key?: unknown }).key === "string"
      ? (raw as { key: string }).key.trim().toLowerCase()
      : "";
  if (!isValidModeKey(declaredKey)) return { definition: parseModeDefinition(raw) };
  if (basename(path) !== `${declaredKey}.json`) {
    throw new Error(`filename must be ${declaredKey}.json`);
  }
  const promptPath = promptFilePath(path);
  const promptText = readPromptFile(promptPath);
  return {
    definition: parseModeDefinition(raw, promptText),
    ...(promptText === undefined ? {} : { promptPath }),
  };
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
      const { definition, promptPath } = readModeFile(path);
      modes.push({ ...definition, scope, path, ...(promptPath ? { promptPath } : {}) });
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
      for (const mode of project.modes) {
        const previous = byKey.get(mode.key);
        byKey.set(
          mode.key,
          previous
            ? {
                ...mode,
                shadows: previous.scope,
                ...(previous.path ? { shadowedPath: previous.path } : {}),
              }
            : mode,
        );
      }
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

/**
 * Saves a definition. When its prompt was loaded from a sibling <key>.md (`promptFrom` names that
 * file), the prompt is written back there and never added to the JSON beside it. A <key>.md the
 * prompt did not come from is never overwritten: the save is refused instead.
 */
export function saveMode(
  dir: string,
  mode: ModeDefinition,
  options: { promptFrom?: string } = {},
): string {
  const normalized = parseModeDefinition(mode);
  const target = modePath(dir, normalized.key);
  const inPromptFile = hasPromptFile(target);
  if (
    inPromptFile &&
    (!options.promptFrom || resolve(options.promptFrom) !== promptFilePath(target))
  ) {
    throw new Error(
      `${normalized.key}.md already holds this mode's prompt; edit it with /mode-edit, or move it away first`,
    );
  }
  const { systemPrompt, ...withoutPrompt } = normalized;
  const serialized = {
    ...(inPromptFile ? withoutPrompt : normalized),
    schemaVersion: MODE_SCHEMA_VERSION,
  };
  mkdirSync(dirname(target), { recursive: true });
  const symbolicLinkBoundary = findSymbolicLinkBoundary(dirname(target));
  if (symbolicLinkBoundary) {
    throw new Error(`mode path crosses symbolic-link boundary: ${symbolicLinkBoundary}`);
  }
  if (inPromptFile) {
    // The prompt first: a failure after it leaves the old JSON with the new prompt, both valid.
    writeFileAtomically(
      promptFilePath(target),
      promptFileText(systemPrompt, normalized.promptStrategy === "replace_final"),
    );
  }
  writeFileAtomically(target, `${JSON.stringify(serialized, null, 2)}\n`);
  return target;
}

/**
 * Deletes a mode file and, when its prompt was loaded from it (`promptFrom`), its prompt file first,
 * so a failure there leaves the mode whole rather than half deleted.
 */
export function deleteMode(
  path: string,
  expectedDir: string,
  options: { promptFrom?: string } = {},
): void {
  const base = resolve(expectedDir);
  const target = resolve(path);
  if (!target.startsWith(`${base}${sep}`) || !target.endsWith(".json")) {
    throw new Error("refusing to delete outside the selected mode directory");
  }
  const symbolicLinkBoundary = findSymbolicLinkBoundary(target);
  if (symbolicLinkBoundary) {
    throw new Error(`mode path crosses symbolic-link boundary: ${symbolicLinkBoundary}`);
  }
  const promptPath = promptFilePath(target);
  if (options.promptFrom && resolve(options.promptFrom) === promptPath) {
    rmSync(promptPath, { force: true });
  }
  rmSync(target);
}
