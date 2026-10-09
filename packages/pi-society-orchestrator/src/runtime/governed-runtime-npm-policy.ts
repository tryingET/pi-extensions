// summary: governed runtime materialization module (split from governed-runtime-materialization.ts).
// read_when:
//   - changing governed runtime npm-policy verification.

import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  GOVERNED_RUNTIME_HOST_CACHE_TARBALLS,
  GOVERNED_RUNTIME_NPM_MIN_RELEASE_AGE_DAYS,
  GOVERNED_RUNTIME_NPM_REGISTRY,
  GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS,
  GOVERNED_RUNTIME_PACKAGES,
  GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH,
} from "./governed-runtime-constants.ts";
import { sameJson, sha256 } from "./governed-runtime-fs-integrity.ts";
import type {
  GovernedRuntimeExecutableProof,
  GovernedRuntimeHostSourceProof,
  GovernedRuntimeNpmEffectReceipt,
  GovernedRuntimeNpmPolicyProof,
} from "./governed-runtime-proofs.ts";
import { GovernedRuntimeMaterializationError } from "./governed-runtime-proofs.ts";

export function resolveCurrentPiBinaryPath(): string {
  let selected: string;
  try {
    selected = execFileSync("sh", ["-lc", "command -v pi"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_active_pi_missing",
      error instanceof Error ? error.message : String(error),
    );
  }
  if (!selected) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_active_pi_missing",
      "The active Pi binary could not be resolved from PATH.",
    );
  }
  return realpathSync(selected);
}

const GOVERNED_NPM_OVERRIDE_KEYS = new Set([
  "npm_config_before",
  "npm_config_force",
  "npm_config_min_release_age",
  "npm_config_min_release_age_exclude",
  "npm_config_offline",
  "npm_config_prefer_offline",
  "npm_config_registry",
]);

function resolveCurrentNpmExecutable(): string {
  const selected = execFileSync("sh", ["-c", "command -v npm"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!selected) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_missing",
      "The npm executable could not be resolved from PATH.",
    );
  }
  return realpathSync(selected);
}

function npmText(nodeExecutable: string, npmExecutable: string, args: string[]): string {
  return execFileSync(nodeExecutable, [npmExecutable, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function npmStringList(nodeExecutable: string, npmExecutable: string, key: string): string[] {
  // npm renders array-valued config as one comma-joined line (and, depending
  // on source format, possibly several lines), so split on both separators.
  return npmText(nodeExecutable, npmExecutable, ["config", "get", key])
    .split(/[\r\n,]/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

function npmFalse(nodeExecutable: string, npmExecutable: string, key: string): false {
  const value = npmText(nodeExecutable, npmExecutable, ["config", "get", key]);
  if (value !== "false") {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_policy_mismatch",
      `The effective npm ${key} setting must remain false; observed ${value || "empty"}.`,
    );
  }
  return false;
}

function inspectNpmOverrideEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env)
      .filter(([key, value]) =>
        Boolean(value !== undefined && GOVERNED_NPM_OVERRIDE_KEYS.has(key.toLowerCase())),
      )
      .sort(([left], [right]) => left.localeCompare(right)) as Array<[string, string]>,
  );
}

export function inspectGovernedRuntimeExecutable(filePath: string): GovernedRuntimeExecutableProof {
  const canonicalPath = realpathSync(filePath);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(canonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    const mode = stat.mode & 0o7777;
    if (!stat.isFile() || (mode & 0o111) === 0) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_executable_invalid",
        `Governed executable must be a regular executable file: ${canonicalPath}.`,
      );
    }
    const bytes = readFileSync(descriptor);
    if (bytes.length !== stat.size) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_executable_invalid",
        `Governed executable size changed while it was inspected: ${canonicalPath}.`,
      );
    }
    return {
      realpath: canonicalPath,
      sha256: sha256(bytes),
      device: String(stat.dev),
      inode: String(stat.ino),
      byteLength: bytes.length,
      mode,
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function verifyGovernedRuntimeNpmExecutables(npm: GovernedRuntimeNpmPolicyProof): {
  nodeExecutable: GovernedRuntimeExecutableProof;
  npmExecutable: GovernedRuntimeExecutableProof;
} {
  const current = {
    nodeExecutable: inspectGovernedRuntimeExecutable(npm.nodeExecutable.realpath),
    npmExecutable: inspectGovernedRuntimeExecutable(npm.npmExecutable.realpath),
  };
  if (
    !sameJson(current.nodeExecutable, npm.nodeExecutable) ||
    !sameJson(current.npmExecutable, npm.npmExecutable)
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_executable_drift",
      "The captured Node or npm executable path, bytes, inode, size, or mode drifted.",
    );
  }
  return current;
}

function assertNpmPolicyShape(proof: GovernedRuntimeNpmPolicyProof): void {
  const observedAt = Date.parse(proof.observedAt);
  const effectiveBefore = Date.parse(proof.effectiveBefore);
  const expectedAgeMs = proof.minReleaseAgeDays * 24 * 60 * 60 * 1000;
  const observedAgeMs = observedAt - effectiveBefore;
  let executablesValid = false;
  let temporaryDirectoryValid = false;
  try {
    verifyGovernedRuntimeNpmExecutables(proof);
    executablesValid = true;
    temporaryDirectoryValid =
      realpathSync(proof.temporaryDirectoryRealpath) === proof.temporaryDirectoryRealpath;
  } catch {
    executablesValid = false;
  }
  if (
    !executablesValid ||
    !temporaryDirectoryValid ||
    !Number.isFinite(observedAt) ||
    !Number.isFinite(effectiveBefore) ||
    // Finite guard: a NaN minReleaseAgeDays would slip through every numeric
    // comparison below (NaN < x and NaN > y are both false).
    !Number.isFinite(proof.minReleaseAgeDays) ||
    proof.minReleaseAgeDays < GOVERNED_RUNTIME_NPM_MIN_RELEASE_AGE_DAYS ||
    !sameJson(proof.minReleaseAgeExclusions, [...GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS]) ||
    observedAgeMs < expectedAgeMs - 5 * 60 * 1000 ||
    observedAgeMs > expectedAgeMs + 5 * 60 * 1000 ||
    proof.registry !== GOVERNED_RUNTIME_NPM_REGISTRY ||
    proof.offline !== false ||
    proof.preferOffline !== false ||
    proof.force !== false ||
    Object.keys(proof.overrideEnvironment).length !== 0
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_policy_mismatch",
      "The effective npm policy does not preserve the required executable, release-age, registry, cache, temporary-directory, and override posture.",
    );
  }
}

export function inspectGovernedRuntimeNpmPolicy(): GovernedRuntimeNpmPolicyProof {
  const nodeExecutable = inspectGovernedRuntimeExecutable(process.execPath);
  const npmExecutable = inspectGovernedRuntimeExecutable(resolveCurrentNpmExecutable());
  const selectedTemporaryDirectory = process.env.TMPDIR?.trim();
  if (!selectedTemporaryDirectory) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_policy_mismatch",
      "Governed materialization requires an explicit managed TMPDIR.",
    );
  }
  const temporaryDirectoryRealpath = realpathSync(selectedTemporaryDirectory);
  const observedAtMs = Date.now();
  const observedAt = new Date(observedAtMs).toISOString();
  // npm keeps the declared `min-release-age` value in config while deriving a
  // runtime-only flat `before` option for install resolution. `npm config get
  // before` reads the raw key, not that derived flat option, so it legitimately
  // returns null when only the relative policy is configured. Prove the declared
  // relative policy directly and derive the exact cutoff used by the governed npm
  // effects. Retain an explicit-before fallback for older/operator-controlled
  // environments, but reject simultaneous raw values because their precedence is
  // easy to misread and can silently relax the intended age gate.
  const configuredMinReleaseAgeText = npmText(nodeExecutable.realpath, npmExecutable.realpath, [
    "config",
    "get",
    "min-release-age",
  ]);
  const configuredMinReleaseAge =
    configuredMinReleaseAgeText && configuredMinReleaseAgeText !== "null"
      ? Number(configuredMinReleaseAgeText)
      : Number.NaN;
  const configuredBeforeText = npmText(nodeExecutable.realpath, npmExecutable.realpath, [
    "config",
    "get",
    "before",
  ]);
  const configuredBeforeMs = Date.parse(configuredBeforeText);
  let minReleaseAgeDays: number;
  let effectiveBeforeMs: number;
  if (Number.isFinite(configuredMinReleaseAge)) {
    if (configuredMinReleaseAge < 0 || Number.isFinite(configuredBeforeMs)) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_npm_policy_mismatch",
        "Governed npm policy requires one non-negative min-release-age value and no simultaneous explicit before cutoff.",
      );
    }
    minReleaseAgeDays = configuredMinReleaseAge;
    effectiveBeforeMs = observedAtMs - configuredMinReleaseAge * 86_400_000;
  } else if (Number.isFinite(configuredBeforeMs)) {
    effectiveBeforeMs = configuredBeforeMs;
    minReleaseAgeDays = Math.round((observedAtMs - effectiveBeforeMs) / 86_400_000);
  } else {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_policy_mismatch",
      "Governed npm policy requires min-release-age (preferred) or one explicit before cutoff equivalent to at least seven days.",
    );
  }
  const effectiveBefore = new Date(effectiveBeforeMs).toISOString();
  const minReleaseAgeExclusions = npmStringList(
    nodeExecutable.realpath,
    npmExecutable.realpath,
    "min-release-age-exclude",
  );
  const proof: GovernedRuntimeNpmPolicyProof = {
    nodeExecutable,
    npmExecutable,
    version: npmText(nodeExecutable.realpath, npmExecutable.realpath, ["--version"]),
    observedAt,
    effectiveBefore,
    minReleaseAgeDays,
    minReleaseAgeExclusions,
    registry: npmText(nodeExecutable.realpath, npmExecutable.realpath, [
      "config",
      "get",
      "registry",
    ]),
    cacheRealpath: realpathSync(
      npmText(nodeExecutable.realpath, npmExecutable.realpath, ["config", "get", "cache"]),
    ),
    temporaryDirectoryRealpath,
    offline: npmFalse(nodeExecutable.realpath, npmExecutable.realpath, "offline"),
    preferOffline: npmFalse(nodeExecutable.realpath, npmExecutable.realpath, "prefer-offline"),
    force: npmFalse(nodeExecutable.realpath, npmExecutable.realpath, "force"),
    overrideEnvironment: inspectNpmOverrideEnvironment(),
  };
  assertNpmPolicyShape(proof);
  return proof;
}

export function verifyGovernedRuntimeNpmPolicy(
  candidate: GovernedRuntimeNpmPolicyProof,
): GovernedRuntimeNpmPolicyProof {
  assertNpmPolicyShape(candidate);
  const current = inspectGovernedRuntimeNpmPolicy();
  const stableCandidate = {
    nodeExecutable: candidate.nodeExecutable,
    npmExecutable: candidate.npmExecutable,
    version: candidate.version,
    minReleaseAgeDays: candidate.minReleaseAgeDays,
    minReleaseAgeExclusions: candidate.minReleaseAgeExclusions,
    registry: candidate.registry,
    cacheRealpath: candidate.cacheRealpath,
    temporaryDirectoryRealpath: candidate.temporaryDirectoryRealpath,
    offline: candidate.offline,
    preferOffline: candidate.preferOffline,
    force: candidate.force,
    overrideEnvironment: candidate.overrideEnvironment,
  };
  const stableCurrent = {
    nodeExecutable: current.nodeExecutable,
    npmExecutable: current.npmExecutable,
    version: current.version,
    minReleaseAgeDays: current.minReleaseAgeDays,
    minReleaseAgeExclusions: current.minReleaseAgeExclusions,
    registry: current.registry,
    cacheRealpath: current.cacheRealpath,
    temporaryDirectoryRealpath: current.temporaryDirectoryRealpath,
    offline: current.offline,
    preferOffline: current.preferOffline,
    force: current.force,
    overrideEnvironment: current.overrideEnvironment,
  };
  if (!sameJson(stableCandidate, stableCurrent)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_runtime_drift",
      "The npm executable or effective supply-chain policy drifted after materialization.",
    );
  }
  return candidate;
}

export function governedRuntimeNpmEffectEnvironment(
  npm: GovernedRuntimeNpmPolicyProof,
): GovernedRuntimeNpmEffectReceipt["environment"] {
  return {
    HOME: dirname(npm.cacheRealpath),
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    PATH: dirname(npm.nodeExecutable.realpath),
    TEMP: npm.temporaryDirectoryRealpath,
    TMP: npm.temporaryDirectoryRealpath,
    TMPDIR: npm.temporaryDirectoryRealpath,
    npm_config_audit: "false",
    npm_config_before: npm.effectiveBefore,
    // npm parses list-valued environment config as comma-separated.
    npm_config_min_release_age_exclude: npm.minReleaseAgeExclusions.join(","),
    npm_config_cache: npm.cacheRealpath,
    npm_config_force: "false",
    npm_config_fund: "false",
    npm_config_globalconfig: "/etc/npmrc",
    npm_config_ignore_scripts: "true",
    npm_config_offline: "false",
    npm_config_prefer_offline: "false",
    npm_config_registry: npm.registry,
    npm_config_userconfig: "/dev/null",
  };
}

export function governedRuntimeAscBuildEnvironment(
  npm: GovernedRuntimeNpmPolicyProof,
): Record<string, string> {
  const environment = governedRuntimeNpmEffectEnvironment(npm);
  return {
    HOME: environment.HOME,
    LANG: environment.LANG,
    LC_ALL: environment.LC_ALL,
    PATH: environment.PATH,
    TEMP: environment.TEMP,
    TMP: environment.TMP,
    TMPDIR: environment.TMPDIR,
  };
}

export function verifyGovernedRuntimeNpmEffectReceipts(
  sourceRoot: string,
  npm: GovernedRuntimeNpmPolicyProof,
  hostSource: GovernedRuntimeHostSourceProof,
  receipts: readonly GovernedRuntimeNpmEffectReceipt[],
): readonly GovernedRuntimeNpmEffectReceipt[] {
  const root = realpathSync(sourceRoot);
  const peerCwd = realpathSync(resolve(root, GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH));
  const expectedEffects = [
    ...GOVERNED_RUNTIME_PACKAGES.map((packagePath) => `package_ci:${packagePath}`),
    ...(hostSource.kind === "verified_cache_tarballs"
      ? Object.keys(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS).map(
          (packageName) => `cache_pack:${packageName}`,
        )
      : []),
    "peer_install",
  ];
  if (
    !sameJson(
      receipts.map(({ effect }) => effect),
      expectedEffects,
    )
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_effect_inventory_mismatch",
      "Governed npm effect receipt inventory is incomplete, duplicated, or out of order.",
    );
  }
  const environment = governedRuntimeNpmEffectEnvironment(npm);
  const environmentDigest = sha256(JSON.stringify(environment));
  for (const receipt of receipts) {
    const startedAt = Date.parse(receipt.startedAt);
    const finishedAt = Date.parse(receipt.finishedAt);
    let canonicalCwd = "";
    try {
      canonicalCwd = realpathSync(receipt.cwdBefore);
    } catch {
      canonicalCwd = "";
    }
    if (
      !sameJson(receipt.nodeExecutable, npm.nodeExecutable) ||
      !sameJson(receipt.npmExecutable, npm.npmExecutable) ||
      !sameJson(receipt.environment, environment) ||
      receipt.environmentDigest !== environmentDigest ||
      receipt.cwdBefore !== receipt.cwdAfter ||
      canonicalCwd !== receipt.cwdBefore ||
      !Number.isFinite(startedAt) ||
      !Number.isFinite(finishedAt) ||
      finishedAt < startedAt
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_npm_effect_receipt_invalid",
        `Governed npm effect receipt drifted for ${receipt.effect}.`,
      );
    }
    if (receipt.effect.startsWith("package_ci:")) {
      const packagePath = receipt.effect.slice("package_ci:".length);
      const expectedArgs = [
        "ci",
        ...(packagePath === "packages/pi-autonomous-session-control" ? [] : ["--omit=dev"]),
        "--omit=peer",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
      ];
      const expectedCwd = dirname(realpathSync(resolve(root, packagePath, "node_modules")));
      if (!sameJson(receipt.argv, expectedArgs) || receipt.cwdBefore !== expectedCwd) {
        throw new GovernedRuntimeMaterializationError(
          "materialization_npm_effect_receipt_invalid",
          `Governed npm package install receipt drifted for ${packagePath}.`,
        );
      }
    } else if (receipt.effect.startsWith("cache_pack:")) {
      const packageName = receipt.effect.slice("cache_pack:".length);
      const expected =
        GOVERNED_RUNTIME_HOST_CACHE_TARBALLS[
          packageName as keyof typeof GOVERNED_RUNTIME_HOST_CACHE_TARBALLS
        ];
      if (
        !expected ||
        receipt.cwdBefore !== peerCwd ||
        !sameJson(receipt.argv, [
          "pack",
          "--offline",
          "--silent",
          "--ignore-scripts",
          "--pack-destination",
          resolve(peerCwd, "tarballs"),
          expected.url,
        ])
      ) {
        throw new GovernedRuntimeMaterializationError(
          "materialization_npm_effect_receipt_invalid",
          `Governed npm cache-pack receipt drifted for ${packageName}.`,
        );
      }
    } else if (
      receipt.effect === "peer_install" &&
      (!sameJson(receipt.argv, ["install", "--ignore-scripts", "--no-audit", "--no-fund"]) ||
        receipt.cwdBefore !== peerCwd)
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_npm_effect_receipt_invalid",
        "Governed npm peer-install receipt drifted.",
      );
    }
  }
  return receipts;
}
