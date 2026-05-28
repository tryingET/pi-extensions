import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PROMPT_SOURCE = "vault-client-live";
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const VAULT_CLIENT_RUNTIME_MODULES = ["typebox", "@earendil-works/pi-tui"];

function getLegacyVaultClientDir(): string {
  return join(homedir(), ".pi", "agent", "extensions", "vault-client");
}

function getSiblingVaultClientDir(): string {
  return join(MODULE_DIR, "..", "..", "..", "pi-vault-client");
}

function getDefaultVaultDir(): string {
  return join(homedir(), "ai-society", "core", "prompt-vault", "prompt-vault-db");
}

function dedupePaths(paths: string[]): string[] {
  return [...new Set(paths.filter((path) => path.trim().length > 0))];
}

function getVaultClientEntryCandidates(vaultClientDir: string): string[] {
  const candidates = [
    join(vaultClientDir, "index.ts"),
    join(vaultClientDir, "extensions", "vault.ts"),
    join(vaultClientDir, "extensions", "index.ts"),
  ];

  const packageJsonPath = join(vaultClientDir, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const extensionPath = parsed?.pi?.extensions?.[0];
      if (typeof extensionPath === "string" && extensionPath.trim().length > 0) {
        const normalized = extensionPath.replace(/^\.\//, "");
        candidates.unshift(join(vaultClientDir, normalized));
      }
    } catch {
      // Ignore package parsing issues; fallback candidates still apply.
    }
  }

  return dedupePaths(candidates);
}

function resolveVaultClientEntryPath(vaultClientDir: string): string {
  const candidates = getVaultClientEntryCandidates(vaultClientDir);
  const firstExisting = candidates.find((candidate) => existsSync(candidate));
  return firstExisting || candidates[0] || join(vaultClientDir, "index.ts");
}

export interface CrossExtensionHarnessPaths {
  vaultClientDir: string;
  vaultClientEntryPath: string;
  vaultDir: string;
}

export interface CrossExtensionHarnessReadiness {
  ready: boolean;
  reasons: string[];
  paths: CrossExtensionHarnessPaths;
}

export interface RetrievedTemplateEnvelope {
  prompt_name: string;
  prompt_content: string;
  prompt_tags?: string[];
  prompt_source: string;
}

export interface CrossExtensionHarnessPathOverrides
  extends Partial<Pick<CrossExtensionHarnessPaths, "vaultClientDir" | "vaultDir">> {
  defaultVaultClientDirCandidates?: string[];
}

function resolveDefaultVaultClientDir(defaultCandidates?: string[]): string {
  const candidates = defaultCandidates || [getLegacyVaultClientDir(), getSiblingVaultClientDir()];
  const firstWithEntry = candidates.find((candidate) =>
    existsSync(resolveVaultClientEntryPath(candidate)),
  );

  if (firstWithEntry) {
    return firstWithEntry;
  }

  return (
    candidates.find((candidate) => existsSync(candidate)) ||
    candidates[0] ||
    getLegacyVaultClientDir()
  );
}

export function getCrossExtensionHarnessPaths(
  overrides: CrossExtensionHarnessPathOverrides = {},
): CrossExtensionHarnessPaths {
  const vaultClientDir =
    overrides.vaultClientDir ||
    process.env.PI_VAULT_CLIENT_DIR ||
    process.env.VAULT_CLIENT_DIR ||
    resolveDefaultVaultClientDir(overrides.defaultVaultClientDirCandidates);
  const vaultDir = overrides.vaultDir || process.env.VAULT_DIR || getDefaultVaultDir();

  return {
    vaultClientDir,
    vaultClientEntryPath: resolveVaultClientEntryPath(vaultClientDir),
    vaultDir,
  };
}

function hasDolt(): boolean {
  try {
    execFileSync("dolt", ["version"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function getMissingVaultClientDependencies(vaultClientEntryPath: string): string[] {
  try {
    const requireFromVaultClient = createRequire(vaultClientEntryPath);
    return VAULT_CLIENT_RUNTIME_MODULES.filter((moduleName) => {
      try {
        requireFromVaultClient.resolve(moduleName);
        return false;
      } catch {
        return true;
      }
    });
  } catch {
    return VAULT_CLIENT_RUNTIME_MODULES;
  }
}

export function getCrossExtensionHarnessReadiness(
  overrides: CrossExtensionHarnessPathOverrides = {},
): CrossExtensionHarnessReadiness {
  const paths = getCrossExtensionHarnessPaths(overrides);
  const reasons: string[] = [];

  if (!existsSync(paths.vaultClientDir)) {
    reasons.push(`vault-client directory not found: ${paths.vaultClientDir}`);
  }

  if (!existsSync(paths.vaultClientEntryPath)) {
    const candidates = getVaultClientEntryCandidates(paths.vaultClientDir);
    reasons.push(
      `vault-client entry file not found: ${paths.vaultClientEntryPath} (candidates: ${candidates.join(", ")})`,
    );
  }

  if (!existsSync(paths.vaultDir)) {
    reasons.push(`prompt-vault db not found: ${paths.vaultDir}`);
  }

  if (!hasDolt()) {
    reasons.push("dolt command unavailable in PATH");
  }

  if (existsSync(paths.vaultClientEntryPath)) {
    const missingModules = getMissingVaultClientDependencies(paths.vaultClientEntryPath);
    if (missingModules.length > 0) {
      reasons.push(
        `vault-client runtime deps missing from module resolution path: ${missingModules.join(", ")}`,
      );
    }
  }

  return {
    ready: reasons.length === 0,
    reasons,
    paths,
  };
}

export function extractFirstTemplateNameFromVaultQueryOutput(output: string): string | null {
  if (typeof output !== "string" || output.trim().length === 0) {
    return null;
  }

  const normalized = output.replace(/\r\n/g, "\n");
  const match = normalized.match(/^##\s+([^\n]+?)\s*$/m);
  if (!match) {
    return null;
  }

  return match[1].trim() || null;
}

function parseTags(line: string | undefined): string[] | undefined {
  if (!line) {
    return undefined;
  }

  const tags = line
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  return tags.length > 0 ? tags : undefined;
}

export function extractSingleRetrievedTemplateEnvelope(
  output: string,
): RetrievedTemplateEnvelope | null {
  if (typeof output !== "string" || output.trim().length === 0) {
    return null;
  }

  const normalized = output.replace(/\r\n/g, "\n");
  const prompt_name = extractFirstTemplateNameFromVaultQueryOutput(normalized);
  if (!prompt_name) {
    return null;
  }

  const tagsMatch = normalized.match(/^Tags:\s*([^\n]+)$/m);
  const prompt_tags = parseTags(tagsMatch?.[1]);

  const contentStart = normalized.indexOf("\n---\n");

  if (contentStart === -1) {
    return null;
  }

  const rawContent = normalized.slice(contentStart + "\n---\n".length);
  const prompt_content = rawContent.replace(/\n---\s*$/, "").trim();
  if (prompt_content.length === 0) {
    return null;
  }

  return {
    prompt_name,
    prompt_content,
    prompt_tags,
    prompt_source: DEFAULT_PROMPT_SOURCE,
  };
}
