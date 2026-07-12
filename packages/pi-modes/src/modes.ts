import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";

export const MODE_SCHEMA_VERSION = 1 as const;
export const MODE_STATE_TYPE = "pi-mode-state.v1";
export type PromptStrategy = "append" | "replace_base" | "replace_final";
export type ModeScope = "builtin" | "global" | "project";

export interface ModeDefinition {
  schemaVersion: typeof MODE_SCHEMA_VERSION;
  key: string;
  label: string;
  description?: string;
  promptStrategy: PromptStrategy;
  systemPrompt: string;
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

export interface ModeState {
  key: string | null;
}

export interface StartupModeSelection {
  configured: boolean;
  key: string | null;
  error?: string;
}

export interface InitialModeResolution {
  source: "environment" | "session";
  key: string | null;
  error?: string;
}

export const BUILTIN_MODES: ModeDefinition[] = [
  {
    schemaVersion: 1,
    key: "plan",
    label: "Plan",
    description: "Plan carefully without changing files until asked.",
    promptStrategy: "append",
    systemPrompt:
      "Make a concise implementation plan before changing files. Do not edit files unless the user asks you to proceed.",
  },
  {
    schemaVersion: 1,
    key: "review",
    label: "Review",
    description: "Prioritize correctness, risks, and missing verification.",
    promptStrategy: "append",
    systemPrompt:
      "Review the current work for correctness, risks, regressions, and missing tests before proposing changes.",
  },
  {
    schemaVersion: 1,
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

/** Resolve the explicit launch-time mode selector without reading arbitrary environment values. */
export function startupModeFromEnvironment(value: string | undefined): StartupModeSelection {
  if (value === undefined || value.trim() === "") return { configured: false, key: null };
  const key = value.trim().toLowerCase();
  if (key === "off" || key === "default" || key === "none") {
    return { configured: true, key: null };
  }
  if (!isValidModeKey(key)) {
    return {
      configured: true,
      key: null,
      error: "PI_MODE must name a valid mode key or use off",
    };
  }
  return { configured: true, key };
}

export function resolveInitialModeSelection(options: {
  applyEnvironment: boolean;
  environmentValue: string | undefined;
  sessionKey: string | null;
  availableKeys: readonly string[];
}): InitialModeResolution {
  if (!options.applyEnvironment) return { source: "session", key: options.sessionKey };
  const startup = startupModeFromEnvironment(options.environmentValue);
  if (!startup.configured) return { source: "session", key: options.sessionKey };
  if (startup.error) return { source: "environment", key: null, error: startup.error };
  if (startup.key && !options.availableKeys.includes(startup.key)) {
    return {
      source: "environment",
      key: null,
      error: `PI_MODE names an unavailable mode: ${startup.key}`,
    };
  }
  return { source: "environment", key: startup.key };
}

export function parseModeDefinition(raw: unknown): ModeDefinition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("mode must be a JSON object");
  }
  const value = raw as Record<string, unknown>;
  const schemaVersion = value.schemaVersion ?? MODE_SCHEMA_VERSION;
  if (schemaVersion !== MODE_SCHEMA_VERSION) {
    throw new Error(`unsupported schemaVersion: ${String(schemaVersion)}`);
  }
  const key = typeof value.key === "string" ? value.key.trim().toLowerCase() : "";
  if (!isValidModeKey(key)) {
    throw new Error(
      "key must start with a letter and contain only lowercase letters, digits, _ or - (max 64 characters)",
    );
  }
  const label = typeof value.label === "string" ? value.label.trim() : "";
  if (!label) throw new Error("label is required");
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const systemPrompt = typeof value.systemPrompt === "string" ? value.systemPrompt.trim() : "";
  if (!systemPrompt) throw new Error("systemPrompt is required");
  const promptStrategy = value.promptStrategy ?? "replace_base";
  if (!isPromptStrategy(promptStrategy)) {
    throw new Error("promptStrategy must be append, replace_base, or replace_final");
  }
  return {
    schemaVersion: MODE_SCHEMA_VERSION,
    key,
    label,
    ...(description ? { description } : {}),
    promptStrategy,
    systemPrompt,
  };
}

function isPromptStrategy(value: unknown): value is PromptStrategy {
  return value === "append" || value === "replace_base" || value === "replace_final";
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
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const path = join(dir, file);
    try {
      if (lstatSync(path).isSymbolicLink())
        throw new Error("mode file must not be a symbolic link");
      const mode = parseModeDefinition(JSON.parse(readFileSync(path, "utf8")));
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
  if (target !== base && !target.startsWith(`${base}${sep}`))
    throw new Error("mode path escapes mode directory");
  return target;
}

export function saveMode(dir: string, mode: ModeDefinition): string {
  const normalized = parseModeDefinition(mode);
  const target = modePath(dir, normalized.key);
  mkdirSync(dirname(target), { recursive: true });
  const symbolicLinkBoundary = findSymbolicLinkBoundary(dirname(target));
  if (symbolicLinkBoundary) {
    throw new Error(`mode path crosses symbolic-link boundary: ${symbolicLinkBoundary}`);
  }
  if (existsSync(target) && lstatSync(target).isSymbolicLink())
    throw new Error("mode file must not be a symbolic link");
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporary, target);
  return target;
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

export function composeModePrompt(
  mode: ModeDefinition,
  options: BuildSystemPromptOptions,
  assembledPrompt: string,
): string {
  if (mode.promptStrategy === "append") {
    return `${assembledPrompt}\n\n# Active prompt mode: ${mode.label}\n${mode.systemPrompt}`;
  }
  if (mode.promptStrategy === "replace_final") return mode.systemPrompt;
  return buildCustomBasePrompt(mode.systemPrompt, options);
}

/** Mirrors Pi's documented custom-base branch: custom base + append + context + skills + date/cwd. */
export function buildCustomBasePrompt(
  customPrompt: string,
  options: BuildSystemPromptOptions,
  now = new Date(),
): string {
  let prompt = customPrompt;
  if (options.appendSystemPrompt) prompt += `\n\n${options.appendSystemPrompt}`;
  if (options.contextFiles && options.contextFiles.length > 0) {
    prompt += "\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n";
    for (const file of options.contextFiles) {
      prompt += `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>\n\n`;
    }
    prompt += "</project_context>\n";
  }
  const readAvailable = !options.selectedTools || options.selectedTools.includes("read");
  const visibleSkills = readAvailable
    ? (options.skills ?? []).filter((skill) => !skill.disableModelInvocation)
    : [];
  if (visibleSkills.length > 0) prompt += formatSkills(visibleSkills);
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  prompt += `\nCurrent date: ${date}`;
  prompt += `\nCurrent working directory: ${options.cwd.replace(/\\/g, "/")}`;
  return prompt;
}

function formatSkills(skills: NonNullable<BuildSystemPromptOptions["skills"]>): string {
  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];
  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }
  lines.push("</available_skills>");
  return lines.join("\n");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function selectedModeFromEntries(entries: readonly unknown[]): ModeState {
  let key: string | null = null;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { type?: string; customType?: string; data?: { key?: unknown } };
    if (candidate.type !== "custom" || candidate.customType !== MODE_STATE_TYPE) continue;
    if (candidate.data?.key === null || typeof candidate.data?.key === "string")
      key = candidate.data.key;
  }
  return { key };
}
