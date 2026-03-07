import { readFile } from "node:fs/promises";
import { join } from "node:path";

const POLICY_VALUES = new Set(["allow", "block"]);
const FALLBACK_VALUES = new Set(["passthrough", "block"]);

export const DEFAULT_PTX_POLICY_CONFIG = Object.freeze({
  defaultPolicy: "allow",
  defaultFallback: "passthrough",
  allowlist: [],
  blocklist: [],
  templates: {},
});

function normalizeCommandName(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^\/+/, "");
}

function normalizeEnum(value, allowedValues, fallbackValue) {
  if (typeof value !== "string") return fallbackValue;
  const normalized = value.trim().toLowerCase();
  return allowedValues.has(normalized) ? normalized : fallbackValue;
}

function normalizeNameList(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const output = [];

  for (const item of value) {
    const normalized = normalizeCommandName(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function normalizeTemplateOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const entries = Object.entries(value);
  const normalized = {};

  for (const [key, rawOverride] of entries) {
    const commandName = normalizeCommandName(key);
    if (!commandName) continue;
    if (!rawOverride || typeof rawOverride !== "object" || Array.isArray(rawOverride)) continue;

    const policy =
      rawOverride.policy === undefined
        ? undefined
        : normalizeEnum(rawOverride.policy, POLICY_VALUES, DEFAULT_PTX_POLICY_CONFIG.defaultPolicy);

    const fallback =
      rawOverride.fallback === undefined
        ? undefined
        : normalizeEnum(rawOverride.fallback, FALLBACK_VALUES, DEFAULT_PTX_POLICY_CONFIG.defaultFallback);

    normalized[commandName] = {
      ...(policy ? { policy } : {}),
      ...(fallback ? { fallback } : {}),
    };
  }

  return normalized;
}

export function normalizePtxPolicyConfig(input) {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input : {};

  return {
    defaultPolicy: normalizeEnum(raw.defaultPolicy, POLICY_VALUES, DEFAULT_PTX_POLICY_CONFIG.defaultPolicy),
    defaultFallback: normalizeEnum(raw.defaultFallback, FALLBACK_VALUES, DEFAULT_PTX_POLICY_CONFIG.defaultFallback),
    allowlist: normalizeNameList(raw.allowlist),
    blocklist: normalizeNameList(raw.blocklist),
    templates: normalizeTemplateOverrides(raw.templates),
  };
}

export async function loadPtxPolicyConfig({ cwd }) {
  const baseDir = cwd || process.cwd();
  const configPath = join(baseDir, ".pi", "ptx-config.json");

  let rawText;
  try {
    rawText = await readFile(configPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        configPath,
        loadedFromFile: false,
        config: normalizePtxPolicyConfig(DEFAULT_PTX_POLICY_CONFIG),
      };
    }

    return {
      configPath,
      loadedFromFile: false,
      config: normalizePtxPolicyConfig(DEFAULT_PTX_POLICY_CONFIG),
      error,
    };
  }

  try {
    const parsed = JSON.parse(rawText);
    return {
      configPath,
      loadedFromFile: true,
      config: normalizePtxPolicyConfig(parsed),
    };
  } catch (error) {
    return {
      configPath,
      loadedFromFile: false,
      config: normalizePtxPolicyConfig(DEFAULT_PTX_POLICY_CONFIG),
      error,
    };
  }
}

export function resolveTemplatePolicy(commandName, configInput) {
  const normalizedName = normalizeCommandName(commandName);
  const config = normalizePtxPolicyConfig(configInput);
  const override = config.templates[normalizedName] || {};
  const fallback = override.fallback || config.defaultFallback;

  if (override.policy === "allow") {
    return {
      commandName: normalizedName,
      allowed: true,
      fallback,
      reason: "template-override-allow",
    };
  }

  if (override.policy === "block") {
    return {
      commandName: normalizedName,
      allowed: false,
      fallback,
      reason: "template-override-block",
    };
  }

  if (config.blocklist.includes(normalizedName)) {
    return {
      commandName: normalizedName,
      allowed: false,
      fallback,
      reason: "blocklist",
    };
  }

  if (config.allowlist.length > 0) {
    return {
      commandName: normalizedName,
      allowed: config.allowlist.includes(normalizedName),
      fallback,
      reason: config.allowlist.includes(normalizedName) ? "allowlist" : "not-in-allowlist",
    };
  }

  return {
    commandName: normalizedName,
    allowed: config.defaultPolicy !== "block",
    fallback,
    reason: config.defaultPolicy === "block" ? "default-policy-block" : "default-policy-allow",
  };
}
