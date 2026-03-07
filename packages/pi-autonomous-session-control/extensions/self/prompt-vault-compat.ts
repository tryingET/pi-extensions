import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIN_AUTONOMY_VERSION = "0.1.3";
const MIN_VAULT_CLIENT_VERSION = "1.2.0";
const EXPECTED_SCHEMA_VERSION = 1;

const DEFAULT_AUTONOMY_PACKAGE_PATH = fileURLToPath(new URL("../../package.json", import.meta.url));
const DEFAULT_VAULT_CLIENT_DIR = join(homedir(), ".pi", "agent", "extensions", "vault-client");
const DEFAULT_VAULT_DIR = join(homedir(), "ai-society", "core", "prompt-vault", "prompt-vault-db");

type CompatibilityStatus = "supported" | "limited" | "incompatible" | "unavailable";

interface RuntimeCompatibilityPaths {
  autonomyPackagePath: string;
  vaultClientDir: string;
  vaultDir: string;
}

interface RuntimeCompatibilityInput {
  autonomyVersion?: string;
  vaultClientVersion?: string;
  schemaVersion?: number;
  schemaError?: string;
  paths?: Partial<RuntimeCompatibilityPaths>;
}

interface RuntimeCompatibilityChecks {
  autonomyVersionOk?: boolean;
  vaultClientVersionOk?: boolean;
  schemaVersionOk?: boolean;
}

export interface PromptVaultCompatibilitySnapshot {
  status: CompatibilityStatus;
  autonomyVersion?: string;
  vaultClientVersion?: string;
  schemaVersion?: number;
  schemaError?: string;
  checks: RuntimeCompatibilityChecks;
  issues: string[];
  recommendations: string[];
  paths: RuntimeCompatibilityPaths;
}

function parseSemver(version: string | undefined): [number, number, number] | null {
  if (!version) return null;
  const normalized = version.trim().replace(/^v/, "");
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: string | undefined, b: string | undefined): number | null {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);

  if (!parsedA || !parsedB) return null;

  for (let i = 0; i < 3; i += 1) {
    if (parsedA[i] > parsedB[i]) return 1;
    if (parsedA[i] < parsedB[i]) return -1;
  }

  return 0;
}

function isGteSemver(value: string | undefined, minimum: string): boolean | undefined {
  const result = compareSemver(value, minimum);
  if (result === null) return undefined;
  return result >= 0;
}

function readVersionFromPackageJson(path: string): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

function readVaultSchemaVersion(vaultDir: string): {
  schemaVersion?: number;
  schemaError?: string;
} {
  if (!existsSync(vaultDir)) {
    return { schemaError: `Vault DB not found at ${vaultDir}` };
  }

  try {
    const raw = execFileSync(
      "dolt",
      ["sql", "-r", "json", "-q", "SELECT version FROM schema_version ORDER BY id DESC LIMIT 1"],
      {
        cwd: vaultDir,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      },
    );

    const parsed = JSON.parse(raw);
    const row = parsed?.rows?.[0];
    if (!row) {
      return { schemaError: "No schema_version rows found" };
    }

    const numeric = Number(row.version);
    if (!Number.isFinite(numeric)) {
      return { schemaError: "schema_version row has non-numeric version" };
    }

    return { schemaVersion: numeric };
  } catch (error) {
    return {
      schemaError: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveCompatibilityPaths(
  overrides: Partial<RuntimeCompatibilityPaths> = {},
): RuntimeCompatibilityPaths {
  return {
    autonomyPackagePath:
      overrides.autonomyPackagePath ||
      process.env.PI_AUTONOMY_PACKAGE_JSON ||
      DEFAULT_AUTONOMY_PACKAGE_PATH,
    vaultClientDir:
      overrides.vaultClientDir ||
      process.env.PI_VAULT_CLIENT_DIR ||
      process.env.VAULT_CLIENT_DIR ||
      DEFAULT_VAULT_CLIENT_DIR,
    vaultDir: overrides.vaultDir || process.env.VAULT_DIR || DEFAULT_VAULT_DIR,
  };
}

export function evaluatePromptVaultCompatibility(
  input: RuntimeCompatibilityInput,
): PromptVaultCompatibilitySnapshot {
  const paths = resolveCompatibilityPaths(input.paths);
  const checks: RuntimeCompatibilityChecks = {
    autonomyVersionOk: isGteSemver(input.autonomyVersion, MIN_AUTONOMY_VERSION),
    vaultClientVersionOk: isGteSemver(input.vaultClientVersion, MIN_VAULT_CLIENT_VERSION),
    schemaVersionOk:
      typeof input.schemaVersion === "number"
        ? input.schemaVersion === EXPECTED_SCHEMA_VERSION
        : undefined,
  };

  const issues: string[] = [];
  const recommendations: string[] = [];

  if (!input.autonomyVersion) {
    issues.push("Autonomy package version is unavailable.");
    recommendations.push(
      "Ensure PI_AUTONOMY_PACKAGE_JSON points to a readable package.json for this extension.",
    );
  } else if (checks.autonomyVersionOk === false) {
    issues.push(
      `Autonomy package version ${input.autonomyVersion} is below recommended ${MIN_AUTONOMY_VERSION}.`,
    );
    recommendations.push(
      "Upgrade pi-autonomous-session-control to a prompt-envelope-compatible release.",
    );
  } else if (checks.autonomyVersionOk === undefined) {
    issues.push(`Autonomy package version '${input.autonomyVersion}' is not semver-parseable.`);
    recommendations.push("Use semantic versioning (x.y.z) for autonomy package releases.");
  }

  if (!input.vaultClientVersion) {
    issues.push("Vault-client version is unavailable.");
    recommendations.push(
      "Set PI_VAULT_CLIENT_DIR (or VAULT_CLIENT_DIR) to a valid vault-client extension directory.",
    );
  } else if (checks.vaultClientVersionOk === false) {
    issues.push(
      `Vault-client version ${input.vaultClientVersion} is below recommended ${MIN_VAULT_CLIENT_VERSION}.`,
    );
    recommendations.push("Upgrade vault-client to align tool/contract expectations.");
  } else if (checks.vaultClientVersionOk === undefined) {
    issues.push(`Vault-client version '${input.vaultClientVersion}' is not semver-parseable.`);
    recommendations.push("Use semantic versioning (x.y.z) for vault-client releases.");
  }

  if (typeof input.schemaVersion !== "number") {
    issues.push(
      `Prompt-vault schema version is unavailable${input.schemaError ? `: ${input.schemaError}` : "."}`,
    );
    recommendations.push(
      "Set VAULT_DIR to a readable prompt-vault DB directory and ensure dolt is installed.",
    );
  } else if (checks.schemaVersionOk === false) {
    issues.push(
      `Prompt-vault schema version ${input.schemaVersion} differs from expected ${EXPECTED_SCHEMA_VERSION}.`,
    );

    if (input.schemaVersion > EXPECTED_SCHEMA_VERSION) {
      recommendations.push(
        "Upgrade autonomy and vault-client to versions that support the newer prompt-vault schema.",
      );
    } else {
      recommendations.push("Migrate prompt-vault DB to schema_version = 1.");
    }
  }

  const hasDataGap =
    !input.autonomyVersion || !input.vaultClientVersion || typeof input.schemaVersion !== "number";
  const schemaAhead =
    typeof input.schemaVersion === "number" && input.schemaVersion > EXPECTED_SCHEMA_VERSION;

  const status: CompatibilityStatus = schemaAhead
    ? "incompatible"
    : !hasDataGap &&
        checks.autonomyVersionOk === true &&
        checks.vaultClientVersionOk === true &&
        checks.schemaVersionOk === true
      ? "supported"
      : hasDataGap
        ? "unavailable"
        : "limited";

  if (status === "supported") {
    recommendations.push(
      "Compatibility matrix is healthy. Proceed with prompt-envelope orchestration.",
    );
  }

  return {
    status,
    autonomyVersion: input.autonomyVersion,
    vaultClientVersion: input.vaultClientVersion,
    schemaVersion: input.schemaVersion,
    schemaError: input.schemaError,
    checks,
    issues,
    recommendations,
    paths,
  };
}

export function getPromptVaultCompatibilitySnapshot(
  overrides: Partial<RuntimeCompatibilityPaths> = {},
): PromptVaultCompatibilitySnapshot {
  const paths = resolveCompatibilityPaths(overrides);

  const autonomyVersion = readVersionFromPackageJson(paths.autonomyPackagePath);
  const vaultClientVersion = readVersionFromPackageJson(join(paths.vaultClientDir, "package.json"));
  const schemaProbe = readVaultSchemaVersion(paths.vaultDir);

  return evaluatePromptVaultCompatibility({
    autonomyVersion,
    vaultClientVersion,
    schemaVersion: schemaProbe.schemaVersion,
    schemaError: schemaProbe.schemaError,
    paths,
  });
}

function renderCheckLabel(value: boolean | undefined): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

export function formatPromptVaultCompatibilityReport(
  snapshot: PromptVaultCompatibilitySnapshot,
): string {
  const lines = [
    "# Prompt-vault Compatibility Check",
    "",
    `- status: ${snapshot.status.toUpperCase()}`,
    `- autonomy_version: ${snapshot.autonomyVersion || "unknown"}`,
    `- vault_client_version: ${snapshot.vaultClientVersion || "unknown"}`,
    `- schema_version: ${typeof snapshot.schemaVersion === "number" ? snapshot.schemaVersion : "unknown"}`,
    "",
    "## Matrix checks",
    `- autonomy >= ${MIN_AUTONOMY_VERSION}: ${renderCheckLabel(snapshot.checks.autonomyVersionOk)}`,
    `- vault-client >= ${MIN_VAULT_CLIENT_VERSION}: ${renderCheckLabel(snapshot.checks.vaultClientVersionOk)}`,
    `- schema_version == ${EXPECTED_SCHEMA_VERSION}: ${renderCheckLabel(snapshot.checks.schemaVersionOk)}`,
    "",
    "## Paths",
    `- autonomy_package_json: ${snapshot.paths.autonomyPackagePath}`,
    `- vault_client_dir: ${snapshot.paths.vaultClientDir}`,
    `- vault_dir: ${snapshot.paths.vaultDir}`,
    "",
    "## Issues",
  ];

  if (snapshot.issues.length === 0) {
    lines.push("- none");
  } else {
    for (const issue of snapshot.issues) {
      lines.push(`- ${issue}`);
    }
  }

  lines.push("", "## Recommended actions");

  if (snapshot.recommendations.length === 0) {
    lines.push("- none");
  } else {
    for (const recommendation of snapshot.recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  return lines.join("\n");
}
