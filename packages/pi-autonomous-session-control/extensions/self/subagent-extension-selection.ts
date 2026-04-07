import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { getCrossExtensionHarnessPaths } from "./cross-extension-harness.ts";

const DEFAULT_MULTI_PASS_EXTENSION = `${homedir()}/.pi/agent/git/github.com/hjanuschka/pi-multi-pass/extensions/multi-sub.ts`;
const DEFAULT_MULTI_PASS_NAMES = ["pi-multi-pass", "multi-pass"] as const;
const DEFAULT_VAULT_CLIENT_NAMES = ["vault-client", "pi-vault-client"] as const;
const NUMERIC_PROVIDER_ALIAS_PATTERN = /^.+-[1-9]\d*$/u;

export interface ResolvedSubagentExtensionSelection {
  extensions: string[];
  warnings: string[];
  missingRequired: string[];
}

export interface SubagentExtensionContext {
  cwd?: string;
  model?: {
    provider?: unknown;
  };
}

export function resolveSubagentExtensionSelection(params: {
  requestedExtensions?: string[];
  ctx?: SubagentExtensionContext;
}): ResolvedSubagentExtensionSelection {
  const requested = dedupe([
    ...parseExtensionEnv(process.env.PI_SUBAGENT_EXTENSIONS),
    ...(params.requestedExtensions ?? []),
  ]);
  const provider =
    typeof params.ctx?.model?.provider === "string" ? params.ctx.model.provider.trim() : "";
  const aliasRequiresMultiPass = NUMERIC_PROVIDER_ALIAS_PATTERN.test(provider);
  const extensions = new Set<string>();
  const warnings: string[] = [];
  const missingRequired: string[] = [];

  if (aliasRequiresMultiPass) {
    const resolved = resolveKnownExtensionSource("pi-multi-pass", params.ctx?.cwd);
    if (resolved) {
      extensions.add(resolved);
    } else {
      missingRequired.push(
        `Current model provider "${provider}" requires the pi-multi-pass extension in the child runtime, but ASC could not resolve its extension entry path. Set PI_MULTI_PASS_EXTENSION or PI_SUBAGENT_EXTENSIONS to a valid extension path.`,
      );
    }
  }

  for (const requestedExtension of requested) {
    const resolved = resolveKnownExtensionSource(requestedExtension, params.ctx?.cwd);
    if (resolved) {
      extensions.add(resolved);
      continue;
    }

    if (looksLikePath(requestedExtension)) {
      missingRequired.push(
        `Requested child extension path was not found: ${normalizePathSource(requestedExtension, params.ctx?.cwd)}`,
      );
      continue;
    }

    missingRequired.push(
      `Requested child extension "${requestedExtension}" was not recognized. Pass an absolute path, a relative path from cwd, or a supported alias such as "pi-multi-pass" or "vault-client".`,
    );
  }

  return {
    extensions: [...extensions],
    warnings,
    missingRequired,
  };
}

function parseExtensionEnv(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(/[\n,]/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function looksLikePath(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("~/") ||
    value.endsWith(".ts") ||
    value.endsWith(".js")
  );
}

function normalizePathSource(value: string, cwd: string | undefined): string {
  if (value.startsWith("~/")) {
    return `${homedir()}${value.slice(1)}`;
  }

  if (isAbsolute(value)) {
    return value;
  }

  return resolve(cwd || process.cwd(), value);
}

function resolveKnownExtensionSource(value: string, cwd: string | undefined): string | null {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  if (looksLikePath(normalized)) {
    const candidate = normalizePathSource(normalized, cwd);
    return existsSync(candidate) ? candidate : null;
  }

  if (DEFAULT_MULTI_PASS_NAMES.includes(normalized as (typeof DEFAULT_MULTI_PASS_NAMES)[number])) {
    const override = process.env.PI_MULTI_PASS_EXTENSION?.trim();
    const candidate = override || DEFAULT_MULTI_PASS_EXTENSION;
    return existsSync(candidate) ? candidate : null;
  }

  if (
    DEFAULT_VAULT_CLIENT_NAMES.includes(normalized as (typeof DEFAULT_VAULT_CLIENT_NAMES)[number])
  ) {
    const override = process.env.PI_VAULT_CLIENT_EXTENSION?.trim();
    const candidate = override || getCrossExtensionHarnessPaths().vaultClientEntryPath;
    return existsSync(candidate) ? candidate : null;
  }

  return null;
}
