/**
summary: "Defines, reads, normalizes, writes, and resolves project or global Better OpenAI configuration."
read_when:
  - "Changing fast-mode defaults, supported models, image settings, config precedence, or persistence behavior."
*/
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export { CONFIG_BASENAME } from "./identity.ts";

import { CONFIG_BASENAME } from "./identity.ts";

export const IMAGE_SAVE_MODES = ["none", "project", "global", "custom"] as const;
export const IMAGE_OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;
export const DEFAULT_SUPPORTED_MODELS = ["openai-codex/*"] as const;
export const DEFAULT_PRO_MODELS = ["openai-codex/gpt-5.6-sol", "openai/gpt-5.6-sol"] as const;

export type ImageSaveMode = (typeof IMAGE_SAVE_MODES)[number];
export type ImageOutputFormat = (typeof IMAGE_OUTPUT_FORMATS)[number];

export type ImageConfig = {
  enabled?: boolean;
  defaultModel?: string;
  defaultSave?: ImageSaveMode;
  outputFormat?: ImageOutputFormat;
  timeoutMs?: number;
};

export type ProConfig = {
  desiredActive?: boolean;
  supportedModels?: string[];
};

export interface ConfigFile {
  persistState?: boolean;
  active?: boolean;
  desiredActive?: boolean;
  supportedModels?: string[];
  pro?: ProConfig;
  image?: ImageConfig;
}

export interface SupportedModel {
  provider: string;
  id: string;
}

export interface ResolvedConfig {
  configPath: string;
  proConfigPath: string;
  projectConfigPath: string;
  globalConfigPath: string;
  projectConfigExists: boolean;
  globalConfigExists: boolean;
  persistState: boolean;
  proPersistState: boolean;
  active: boolean;
  desiredActive: boolean;
  supportedModels: SupportedModel[];
  pro: {
    desiredActive: boolean;
    supportedModels: SupportedModel[];
  };
  image: Required<ImageConfig>;
}

export const DEFAULT_IMAGE_CONFIG: Required<ImageConfig> = {
  enabled: true,
  defaultModel: "gpt-5.5",
  defaultSave: "project",
  outputFormat: "png",
  timeoutMs: 180_000,
};

export const DEFAULT_PRO_CONFIG: Required<ProConfig> = {
  desiredActive: false,
  supportedModels: [...DEFAULT_PRO_MODELS],
};

export const DEFAULT_CONFIG: ConfigFile = {
  persistState: true,
  active: false,
  desiredActive: false,
  supportedModels: [...DEFAULT_SUPPORTED_MODELS],
  pro: DEFAULT_PRO_CONFIG,
  image: DEFAULT_IMAGE_CONFIG,
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function configPaths(cwd: string, home = homedir()) {
  return {
    project: join(cwd, ".pi", "extensions", CONFIG_BASENAME),
    global: join(home, ".pi", "agent", "extensions", CONFIG_BASENAME),
  };
}

export function parseModelKey(value: string): SupportedModel | undefined {
  const key = value.trim();
  const slash = key.indexOf("/");
  if (slash <= 0 || slash === key.length - 1) return undefined;
  const provider = key.slice(0, slash).trim();
  const id = key.slice(slash + 1).trim();
  return provider && id ? { provider, id } : undefined;
}

export function normalizeModelKeys(value: unknown): string[] | undefined {
  if (value === undefined || !Array.isArray(value)) return undefined;
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => parseModelKey(entry))
    .filter((entry): entry is SupportedModel => entry !== undefined)
    .map((entry) => `${entry.provider}/${entry.id}`);
}

export function parseModels(value: unknown): SupportedModel[] | undefined {
  const keys = normalizeModelKeys(value);
  return keys
    ?.map((key) => parseModelKey(key))
    .filter((entry): entry is SupportedModel => entry !== undefined);
}

export function readRawConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readConfig(path: string): ConfigFile | undefined {
  if (!existsSync(path)) return undefined;
  const parsed = readRawConfig(path);
  const config: ConfigFile = {};
  if (typeof parsed.persistState === "boolean") config.persistState = parsed.persistState;
  if (typeof parsed.active === "boolean") config.active = parsed.active;
  if (typeof parsed.desiredActive === "boolean") config.desiredActive = parsed.desiredActive;
  const supportedModels = normalizeModelKeys(parsed.supportedModels);
  if (supportedModels !== undefined) config.supportedModels = supportedModels;
  if (isRecord(parsed.pro)) {
    config.pro = {};
    if (typeof parsed.pro.desiredActive === "boolean") {
      config.pro.desiredActive = parsed.pro.desiredActive;
    }
    const proSupportedModels = normalizeModelKeys(parsed.pro.supportedModels);
    if (proSupportedModels !== undefined) config.pro.supportedModels = proSupportedModels;
  }
  if (isRecord(parsed.image)) {
    config.image = {};
    if (typeof parsed.image.enabled === "boolean") config.image.enabled = parsed.image.enabled;
    if (typeof parsed.image.defaultModel === "string" && parsed.image.defaultModel.trim()) {
      config.image.defaultModel = parsed.image.defaultModel.trim();
    }
    if (
      typeof parsed.image.defaultSave === "string" &&
      (IMAGE_SAVE_MODES as readonly string[]).includes(parsed.image.defaultSave)
    ) {
      config.image.defaultSave = parsed.image.defaultSave as ImageSaveMode;
    }
    if (
      typeof parsed.image.outputFormat === "string" &&
      (IMAGE_OUTPUT_FORMATS as readonly string[]).includes(parsed.image.outputFormat)
    ) {
      config.image.outputFormat = parsed.image.outputFormat as ImageOutputFormat;
    }
    if (typeof parsed.image.timeoutMs === "number") config.image.timeoutMs = parsed.image.timeoutMs;
  }
  return config;
}

export function writeConfig(path: string, config: ConfigFile | Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function ensureConfigFile(projectConfigPath: string, globalConfigPath: string): void {
  if (existsSync(projectConfigPath) || existsSync(globalConfigPath)) return;
  writeConfig(globalConfigPath, DEFAULT_CONFIG);
}

export function resolveConfig(
  cwd: string,
  options: { allowProjectPro?: boolean; home?: string } = {},
): ResolvedConfig {
  const paths = configPaths(cwd, options.home);
  ensureConfigFile(paths.project, paths.global);
  const projectConfigExists = existsSync(paths.project);
  const globalConfigExists = existsSync(paths.global);
  const globalConfig = readConfig(paths.global) ?? {};
  const projectConfig = readConfig(paths.project) ?? {};
  const merged = { ...DEFAULT_CONFIG, ...globalConfig, ...projectConfig };
  const desiredActive = merged.desiredActive ?? merged.active ?? false;
  const allowProjectPro = options.allowProjectPro ?? true;
  const globalPersistState = globalConfig.persistState ?? DEFAULT_CONFIG.persistState ?? true;
  const proPersistState = allowProjectPro
    ? (projectConfig.persistState ?? globalPersistState)
    : globalPersistState;
  const pro = {
    ...DEFAULT_PRO_CONFIG,
    ...globalConfig.pro,
    ...(allowProjectPro ? projectConfig.pro : undefined),
  };
  return {
    configPath: projectConfigExists ? paths.project : paths.global,
    proConfigPath: allowProjectPro && projectConfigExists ? paths.project : paths.global,
    projectConfigPath: paths.project,
    globalConfigPath: paths.global,
    projectConfigExists,
    globalConfigExists,
    persistState: merged.persistState ?? true,
    proPersistState,
    active: merged.active ?? desiredActive,
    desiredActive,
    supportedModels:
      parseModels(merged.supportedModels) ?? parseModels(DEFAULT_SUPPORTED_MODELS) ?? [],
    pro: {
      desiredActive: pro.desiredActive,
      supportedModels: parseModels(pro.supportedModels) ?? parseModels(DEFAULT_PRO_MODELS) ?? [],
    },
    image: {
      ...DEFAULT_IMAGE_CONFIG,
      ...globalConfig.image,
      ...projectConfig.image,
      timeoutMs: Math.max(
        30_000,
        Math.min(
          5 * 60_000,
          projectConfig.image?.timeoutMs ??
            globalConfig.image?.timeoutMs ??
            DEFAULT_IMAGE_CONFIG.timeoutMs,
        ),
      ),
    },
  };
}
