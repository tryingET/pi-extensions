import { randomUUID } from "node:crypto";
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
import { isValidModeKey, type ModeScope } from "./mode-definitions.ts";
import { type ModeSelection, normalizeModeSelection } from "./mode-state.ts";

export const MODE_PRESET_SCHEMA_VERSION = 1 as const;
export const MODE_PRESET_MAX_BYTES = 64 * 1024;
export const MODE_PRESET_DIRECTORY_MAX_FILES = 1024;

export interface ModePreset {
  schemaVersion: typeof MODE_PRESET_SCHEMA_VERSION;
  key: string;
  label: string;
  description?: string;
  selection: ModeSelection;
}

export interface ResolvedModePreset extends ModePreset {
  scope: Exclude<ModeScope, "builtin">;
  path: string;
}

export interface LoadedModePresets {
  presets: ResolvedModePreset[];
  diagnostics: Array<{ path: string; message: string }>;
}

export function parseModePreset(raw: unknown): ModePreset {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("preset must be a JSON object");
  }
  const value = raw as Record<string, unknown>;
  const allowed = new Set(["schemaVersion", "key", "label", "description", "selection"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`unknown preset field(s): ${unknown.join(", ")}`);
  if (value.schemaVersion !== MODE_PRESET_SCHEMA_VERSION) {
    throw new Error(`unsupported preset schemaVersion: ${String(value.schemaVersion)}`);
  }
  const key = typeof value.key === "string" ? value.key : "";
  if (!isValidModeKey(key)) throw new Error("preset key must be a canonical mode key");
  const rawLabel = typeof value.label === "string" ? value.label : "";
  const label = rawLabel.trim();
  if (
    !label ||
    Array.from(rawLabel).length > 120 ||
    /\p{Cc}/u.test(rawLabel) ||
    /[\r\n]/.test(rawLabel)
  ) {
    throw new Error("preset label must be one non-control line of at most 120 Unicode characters");
  }
  let description = "";
  if (value.description !== undefined) {
    if (typeof value.description !== "string") {
      throw new Error("preset description must be a string when provided");
    }
    description = value.description.trim();
    if (
      !description ||
      Array.from(value.description).length > 1000 ||
      /\p{Cc}/u.test(value.description)
    ) {
      throw new Error(
        "preset description must be nonblank and at most 1000 Unicode characters without controls",
      );
    }
  }
  if (!value.selection || typeof value.selection !== "object" || Array.isArray(value.selection)) {
    throw new Error("preset selection is required");
  }
  const selectionValue = value.selection as Record<string, unknown>;
  if (Object.keys(selectionValue).some((name) => name !== "baseKey" && name !== "overlayKeys")) {
    throw new Error("preset selection contains unknown fields");
  }
  let selection: ModeSelection;
  try {
    selection = normalizeModeSelection(selectionValue);
  } catch (error) {
    throw new Error(
      `invalid preset selection: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    schemaVersion: 1,
    key,
    label,
    ...(description ? { description } : {}),
    selection,
  };
}

export function ancestorPresetDirectories(cwd: string, configDirName = ".pi"): string[] {
  const directories: string[] = [];
  let current = resolve(cwd);
  while (true) {
    directories.push(join(current, configDirName, "mode-presets"));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return directories.reverse();
}

function symlinkBoundary(path: string): string | undefined {
  let current = resolve(path);
  while (true) {
    try {
      if (lstatSync(current).isSymbolicLink()) return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function loadDirectory(dir: string, scope: Exclude<ModeScope, "builtin">): LoadedModePresets {
  const presets: ResolvedModePreset[] = [];
  const diagnostics: LoadedModePresets["diagnostics"] = [];
  let files: string[];
  try {
    const boundary = symlinkBoundary(dir);
    if (boundary) {
      return {
        presets,
        diagnostics: [
          { path: dir, message: `preset path crosses symbolic-link boundary: ${boundary}` },
        ],
      };
    }
    if (!existsSync(dir)) return { presets, diagnostics };
    if (!lstatSync(dir).isDirectory()) {
      return {
        presets,
        diagnostics: [{ path: dir, message: "preset directory path is not a directory" }],
      };
    }
    files = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    return {
      presets,
      diagnostics: [
        {
          path: dir,
          message: `unable to read preset directory: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
  if (files.length > MODE_PRESET_DIRECTORY_MAX_FILES) {
    diagnostics.push({
      path: dir,
      message: `preset directory has ${files.length} JSON files; only the first ${MODE_PRESET_DIRECTORY_MAX_FILES} are loaded`,
    });
  }
  for (const file of files.slice(0, MODE_PRESET_DIRECTORY_MAX_FILES)) {
    const path = join(dir, file);
    try {
      if (lstatSync(path).isSymbolicLink())
        throw new Error("preset file must not be a symbolic link");
      if (statSync(path).size > MODE_PRESET_MAX_BYTES) throw new Error("preset file is too large");
      const preset = parseModePreset(JSON.parse(readFileSync(path, "utf8")));
      if (file !== `${preset.key}.json`) throw new Error(`filename must be ${preset.key}.json`);
      presets.push({ ...preset, scope, path });
    } catch (error) {
      diagnostics.push({ path, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { presets, diagnostics };
}

export function loadModePresets(options: {
  globalDir: string;
  projectDirs: readonly string[];
  projectTrusted: boolean;
}): LoadedModePresets {
  const byKey = new Map<string, ResolvedModePreset>();
  const diagnostics: LoadedModePresets["diagnostics"] = [];
  const global = loadDirectory(options.globalDir, "global");
  diagnostics.push(...global.diagnostics);
  for (const preset of global.presets) byKey.set(preset.key, preset);
  if (options.projectTrusted) {
    for (const dir of options.projectDirs) {
      const loaded = loadDirectory(dir, "project");
      diagnostics.push(...loaded.diagnostics);
      for (const preset of loaded.presets) byKey.set(preset.key, preset);
    }
  }
  return {
    presets: [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
    diagnostics,
  };
}

export function presetPath(dir: string, key: string): string {
  if (!isValidModeKey(key)) throw new Error("invalid preset key");
  const base = resolve(dir);
  const target = resolve(base, `${key}.json`);
  if (!target.startsWith(`${base}${sep}`)) throw new Error("preset path escapes preset directory");
  return target;
}

export function saveModePreset(dir: string, preset: ModePreset): string {
  const normalized = parseModePreset(preset);
  const target = presetPath(dir, normalized.key);
  mkdirSync(dirname(target), { recursive: true });
  const boundary = symlinkBoundary(dirname(target));
  if (boundary) throw new Error(`preset path crosses symbolic-link boundary: ${boundary}`);
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
    throw new Error("preset file must not be a symbolic link");
  }
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, {
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

export function presetExportText(preset: ModePreset): string {
  const portable = parseModePreset({
    schemaVersion: preset.schemaVersion,
    key: preset.key,
    label: preset.label,
    ...(preset.description ? { description: preset.description } : {}),
    selection: preset.selection,
  });
  return JSON.stringify(portable, null, 2);
}

export function encodePreset(preset: ModePreset): string {
  return Buffer.from(presetExportText(preset), "utf8").toString("base64url");
}

export function decodePreset(encoded: string): ModePreset {
  if (!encoded || encoded.length > MODE_PRESET_MAX_BYTES * 2)
    throw new Error("preset import payload is invalid");
  return parseModePreset(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
}
