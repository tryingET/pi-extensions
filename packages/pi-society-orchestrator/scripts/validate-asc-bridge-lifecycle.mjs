#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ASC_PACKAGE_NAME = "@tryinget/pi-autonomous-session-control";
export const ASC_MINIMUM_RELEASE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const OWNER_SCOPE_PREFIX = "@tryinget/";

export function isMinimumReleaseAgeExempt(packageName) {
  return typeof packageName === "string" && packageName.startsWith(OWNER_SCOPE_PREFIX);
}
const REPO_REGISTRY = "https://registry.npmjs.org/";
const ASC_LOCK_KEY = `node_modules/${ASC_PACKAGE_NAME}`;
const SLSA_PROVENANCE_V1 = "https://slsa.dev/provenance/v1";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNpmViewMultiFieldOutput(value) {
  // npm 11 emits the selected fields as an object; npm 12 wraps that same object
  // in a singleton array. No other array shape identifies one unambiguous result.
  if (isRecord(value)) return value;
  if (Array.isArray(value) && value.length === 1 && isRecord(value[0])) return value[0];
  return null;
}

function parseStrictSemver(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  return match
    ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
    : null;
}

function compareSemver(left, right) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

export function versionSatisfiesAscRange(version, ascSpec) {
  const parsedVersion = parseStrictSemver(version);
  if (!parsedVersion || typeof ascSpec !== "string") return false;

  const normalizedSpec = ascSpec.trim();
  const caretMatch = /^\^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(normalizedSpec);
  const exactMatch = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(normalizedSpec);
  const rangeMatch = caretMatch ?? exactMatch;
  if (!rangeMatch) return false;

  const lower = {
    major: Number(rangeMatch[1]),
    minor: Number(rangeMatch[2]),
    patch: Number(rangeMatch[3]),
  };
  if (!caretMatch) return compareSemver(parsedVersion, lower) === 0;

  const upper =
    lower.major > 0
      ? { major: lower.major + 1, minor: 0, patch: 0 }
      : lower.minor > 0
        ? { major: 0, minor: lower.minor + 1, patch: 0 }
        : { major: 0, minor: 0, patch: lower.patch + 1 };
  return compareSemver(parsedVersion, lower) >= 0 && compareSemver(parsedVersion, upper) < 0;
}

function isSupportedRegistrySemverSpec(ascSpec) {
  return /^(?:\^)?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(ascSpec);
}

function isLocalDependencySpec(ascSpec) {
  return (
    ascSpec.startsWith("file:") ||
    ascSpec.startsWith(".") ||
    ascSpec.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(ascSpec)
  );
}

export function collectBundledDependencies(pkg) {
  return [
    ...(Array.isArray(pkg.bundleDependencies) ? pkg.bundleDependencies : []).map(String),
    ...(Array.isArray(pkg.bundledDependencies) ? pkg.bundledDependencies : []).map(String),
  ];
}

export function classifyAscBridgeLifecycle(pkg) {
  const ascSpec = pkg?.dependencies?.[ASC_PACKAGE_NAME];
  const bundledDependencies = collectBundledDependencies(pkg);
  const hasAscBundle = bundledDependencies.includes(ASC_PACKAGE_NAME);
  const extraBundles = bundledDependencies.filter(
    (dependencyName) => dependencyName !== ASC_PACKAGE_NAME,
  );
  const issues = [];

  if (typeof ascSpec !== "string" || ascSpec.trim().length === 0) {
    issues.push(
      `package.json dependencies.${ASC_PACKAGE_NAME} is required for the orchestrator execution seam.`,
    );
    return {
      ok: false,
      mode: "invalid",
      ascSpec: typeof ascSpec === "string" ? ascSpec : null,
      bundledDependencies,
      extraBundles,
      issues,
    };
  }

  if (extraBundles.length > 0) {
    issues.push(
      `Unexpected bundled dependencies present: ${extraBundles.join(", ")}. The ASC bridge must stay narrow and package-specific.`,
    );
  }

  const normalizedAscSpec = ascSpec.trim();
  const usesLocalFileDependency = isLocalDependencySpec(normalizedAscSpec);
  const usesSupportedRegistrySemver = isSupportedRegistrySemverSpec(normalizedAscSpec);

  if (usesLocalFileDependency) {
    issues.push(
      `Local dependency ${ASC_PACKAGE_NAME}=${normalizedAscSpec} is forbidden after registry cutover; use the declared registry semver range and a registry-backed lock.`,
    );
  } else if (!usesSupportedRegistrySemver) {
    issues.push(
      `Dependency ${ASC_PACKAGE_NAME}=${normalizedAscSpec} is not a supported registry semver selector. Use an exact version or caret range; tags, URLs, aliases, and git specs cannot prove registry installability.`,
    );
  } else if (hasAscBundle) {
    issues.push(
      `Bundled ${ASC_PACKAGE_NAME} must remain retired for registry dependency ${normalizedAscSpec}.`,
    );
  } else {
    return {
      ok: issues.length === 0,
      mode: "registry-cutover",
      ascSpec: normalizedAscSpec,
      bundledDependencies,
      extraBundles,
      issues,
    };
  }

  return {
    ok: false,
    mode: "invalid",
    ascSpec: normalizedAscSpec,
    bundledDependencies,
    extraBundles,
    issues,
  };
}

export function parseAscRegistryReleaseStateLookup(result) {
  if (result.status !== 0) {
    const combined = [result.stderr, result.stdout]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join("\n");
    return {
      ok: false,
      versions: [],
      time: {},
      error:
        combined.length > 0
          ? `Could not read ASC registry release state: ${combined.split(/\r?\n/).slice(-8).join(" | ")}`
          : `Could not read ASC registry release state (npm exited ${result.status ?? "unknown"})`,
    };
  }

  try {
    const parsed = JSON.parse(String(result.stdout ?? ""));
    const metadata = normalizeNpmViewMultiFieldOutput(parsed);
    if (!metadata) {
      return {
        ok: false,
        versions: [],
        time: {},
        error: "ASC registry release state has an unsupported npm view --json shape.",
      };
    }
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
    const time = isRecord(metadata.time) ? metadata.time : {};
    if (
      versions.length === 0 ||
      versions.some((version) => typeof version !== "string" || !parseStrictSemver(version)) ||
      versions.some((version) => typeof time[version] !== "string")
    ) {
      return {
        ok: false,
        versions: [],
        time: {},
        error: "ASC registry release state is missing strict-semver versions or publication times.",
      };
    }
    return { ok: true, versions: [...new Set(versions)], time };
  } catch (error) {
    return {
      ok: false,
      versions: [],
      time: {},
      error:
        error instanceof Error
          ? `Could not parse ASC registry release state: ${error.message}`
          : "Could not parse ASC registry release state.",
    };
  }
}

export function lookupAscRegistryReleaseState(spawn = spawnSync) {
  const result = spawn(
    "npm",
    ["view", ASC_PACKAGE_NAME, "versions", "time", "--json", "--registry", REPO_REGISTRY],
    { encoding: "utf8", env: process.env },
  );
  return parseAscRegistryReleaseStateLookup(result);
}

export function parseAscRegistryArtifactLookup(result, selectedVersion) {
  if (result.status !== 0) {
    const combined = [result.stderr, result.stdout]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join("\n");
    return {
      ok: false,
      error:
        combined.length > 0
          ? `Could not read ${ASC_PACKAGE_NAME}@${selectedVersion} artifact metadata: ${combined.split(/\r?\n/).slice(-8).join(" | ")}`
          : `Could not read ${ASC_PACKAGE_NAME}@${selectedVersion} artifact metadata.`,
    };
  }

  try {
    const parsed = JSON.parse(String(result.stdout ?? ""));
    const artifact = normalizeNpmViewMultiFieldOutput(parsed);
    if (!artifact) {
      return {
        ok: false,
        error: `Registry artifact metadata for ${ASC_PACKAGE_NAME}@${selectedVersion} has an unsupported npm view --json shape.`,
      };
    }
    if (artifact.version !== selectedVersion || !isRecord(artifact.dist)) {
      return {
        ok: false,
        error: `Registry artifact metadata did not identify ${ASC_PACKAGE_NAME}@${selectedVersion}.`,
      };
    }
    return { ok: true, artifact };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Could not parse ${ASC_PACKAGE_NAME}@${selectedVersion} artifact metadata: ${error.message}`
          : `Could not parse ${ASC_PACKAGE_NAME}@${selectedVersion} artifact metadata.`,
    };
  }
}

export function lookupAscRegistryArtifact(selectedVersion, spawn = spawnSync) {
  const result = spawn(
    "npm",
    [
      "view",
      `${ASC_PACKAGE_NAME}@${selectedVersion}`,
      "version",
      "dist",
      "--json",
      "--registry",
      REPO_REGISTRY,
    ],
    { encoding: "utf8", env: process.env },
  );
  return parseAscRegistryArtifactLookup(result, selectedVersion);
}

function canonicalAscTarballUrl(version) {
  return `${REPO_REGISTRY}@tryinget/pi-autonomous-session-control/-/pi-autonomous-session-control-${version}.tgz`;
}

export function evaluateAscRegistryLock({
  pkg,
  lock,
  registryReleaseState,
  registryArtifact,
  packageName = ASC_PACKAGE_NAME,
  now = Date.now(),
  minimumReleaseAgeMs = ASC_MINIMUM_RELEASE_AGE_MS,
}) {
  const issues = [];
  const ascSpec = pkg?.dependencies?.[ASC_PACKAGE_NAME];
  const rootAscSpec = lock?.packages?.[""]?.dependencies?.[ASC_PACKAGE_NAME];
  const lockEntry = lock?.packages?.[ASC_LOCK_KEY];

  if (typeof ascSpec !== "string" || !isSupportedRegistrySemverSpec(ascSpec.trim())) {
    issues.push(
      `Cannot validate an ASC registry lock for unsupported selector ${String(ascSpec)}.`,
    );
  }
  if (rootAscSpec !== ascSpec) {
    issues.push(
      `package-lock root selector ${String(rootAscSpec)} does not match package.json ${String(ascSpec)}.`,
    );
  }
  if (!isRecord(lockEntry)) {
    issues.push(`package-lock.json is missing ${ASC_LOCK_KEY}.`);
  }

  const selectedVersion = isRecord(lockEntry) ? lockEntry.version : null;
  const resolved = isRecord(lockEntry) ? lockEntry.resolved : null;
  const integrity = isRecord(lockEntry) ? lockEntry.integrity : null;
  if (isRecord(lockEntry) && lockEntry.link === true) {
    issues.push("ASC package-lock entry is a local link; registry artifact proof is required.");
  }
  if (typeof selectedVersion !== "string" || !parseStrictSemver(selectedVersion)) {
    issues.push("ASC package-lock entry is missing a strict-semver version.");
  } else if (typeof ascSpec === "string" && !versionSatisfiesAscRange(selectedVersion, ascSpec)) {
    issues.push(`Locked ASC ${selectedVersion} does not satisfy ${ascSpec}.`);
  }
  if (typeof selectedVersion === "string" && resolved !== canonicalAscTarballUrl(selectedVersion)) {
    issues.push(
      `Locked ASC resolved value is not the canonical npm registry tarball for ${selectedVersion}.`,
    );
  }
  if (typeof integrity !== "string" || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) {
    issues.push("Locked ASC artifact is missing a sha512 integrity value.");
  }

  const strayAscEntries = isRecord(lock?.packages)
    ? Object.keys(lock.packages).filter(
        (key) => key !== ASC_LOCK_KEY && key.includes("pi-autonomous-session-control"),
      )
    : [];
  if (strayAscEntries.length > 0) {
    issues.push(
      `ASC package-lock contains non-registry/local entries: ${strayAscEntries.join(", ")}.`,
    );
  }

  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const cutoffMs = nowMs - minimumReleaseAgeMs;
  const ageExempt = isMinimumReleaseAgeExempt(packageName);
  const eligibleVersions = registryReleaseState?.versions
    ?.filter((version) => {
      if (typeof ascSpec !== "string" || !versionSatisfiesAscRange(version, ascSpec)) {
        return false;
      }
      if (!Number.isFinite(Date.parse(registryReleaseState.time?.[version]))) {
        return false;
      }
      return ageExempt || Date.parse(registryReleaseState.time[version]) <= cutoffMs;
    })
    .sort((left, right) => compareSemver(parseStrictSemver(left), parseStrictSemver(right)));
  const latestEligibleVersion = eligibleVersions?.at(-1) ?? null;
  if (!latestEligibleVersion) {
    issues.push(
      ageExempt
        ? `No ${ascSpec} ASC release is published.`
        : `No ${ascSpec} ASC release is eligible under the seven-day minimum-release-age floor.`,
    );
  } else if (selectedVersion !== latestEligibleVersion) {
    issues.push(
      ageExempt
        ? `Locked ASC ${String(selectedVersion)} is not the latest published ${ascSpec} release (${latestEligibleVersion}).`
        : `Locked ASC ${String(selectedVersion)} is not the latest seven-day-eligible ${ascSpec} release (${latestEligibleVersion}).`,
    );
  }

  const publishedAt =
    typeof selectedVersion === "string" ? registryReleaseState?.time?.[selectedVersion] : null;
  if (!Number.isFinite(Date.parse(publishedAt))) {
    issues.push(`Registry publication time is missing for locked ASC ${String(selectedVersion)}.`);
  } else if (!ageExempt && Date.parse(publishedAt) > cutoffMs) {
    issues.push(
      `Locked ASC ${selectedVersion} was published ${publishedAt}, inside the seven-day minimum-release-age floor.`,
    );
  }

  const artifactDist = registryArtifact?.dist;
  if (registryArtifact?.version !== selectedVersion || !isRecord(artifactDist)) {
    issues.push(`Registry metadata does not prove locked ASC ${String(selectedVersion)}.`);
  } else {
    if (artifactDist.tarball !== resolved) {
      issues.push("Locked ASC tarball URL does not match registry metadata.");
    }
    if (artifactDist.integrity !== integrity) {
      issues.push("Locked ASC integrity does not match registry metadata.");
    }
    if (
      artifactDist.attestations?.provenance?.predicateType !== SLSA_PROVENANCE_V1 ||
      typeof artifactDist.attestations?.url !== "string"
    ) {
      issues.push("Registry ASC artifact is missing npm SLSA provenance metadata.");
    }
    if (!Array.isArray(artifactDist.signatures) || artifactDist.signatures.length === 0) {
      issues.push("Registry ASC artifact is missing npm registry signatures.");
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    selectedVersion,
    latestEligibleVersion,
    publishedAt,
    ageExempt,
    cutoff: Number.isFinite(cutoffMs) ? new Date(cutoffMs).toISOString() : null,
    resolved,
    integrity,
  };
}

export function evaluateAscBridgeLifecycle({ pkg, publishedAscVersions = [] }) {
  const classification = classifyAscBridgeLifecycle(pkg);
  const issues = [...classification.issues];

  if (classification.mode === "registry-cutover") {
    if (publishedAscVersions.length === 0) {
      issues.push(
        `Registry dependency ${ASC_PACKAGE_NAME}=${classification.ascSpec} has no proven satisfying published version. Local links and unrelated registry versions do not establish release installability.`,
      );
    } else if (
      publishedAscVersions.some(
        (version) => !versionSatisfiesAscRange(version, classification.ascSpec),
      )
    ) {
      issues.push(
        `Registry lookup returned a version that does not satisfy ${ASC_PACKAGE_NAME}=${classification.ascSpec}; release installability is not proven.`,
      );
    }
  }

  return {
    ok: classification.ok && issues.length === 0,
    classification,
    issues,
  };
}

function readManifest(packageDir) {
  const packageJsonPath = path.join(packageDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Missing package.json in ${packageDir}`);
  }

  const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (!isRecord(manifest)) {
    throw new Error(`Invalid package.json in ${packageDir}`);
  }
  return manifest;
}

export function formatAscBridgeLifecycleSummary(result, publishedAscVersions, lockResult = null) {
  const modeLabel =
    result.classification.mode === "registry-cutover" ? "registry-backed cutover" : "invalid";
  const lockLabel = lockResult
    ? `; locked ${lockResult.selectedVersion} published ${lockResult.publishedAt}${lockResult.ageExempt ? "; @tryinget/* age-floor exempt" : ` (eligibility cutoff ${lockResult.cutoff})`}`
    : "";
  return `ASC bridge lifecycle OK (${modeLabel}; ${ASC_PACKAGE_NAME}@${publishedAscVersions.join(", ")} satisfies ${result.classification.ascSpec}${lockLabel}).`;
}

function main() {
  const packageDir = process.cwd();
  const manifest = readManifest(packageDir);
  const classification = classifyAscBridgeLifecycle(manifest);
  if (!classification.ok) {
    for (const issue of classification.issues) console.error(issue);
    process.exit(1);
  }

  const registryReleaseState = lookupAscRegistryReleaseState();
  if (!registryReleaseState.ok) {
    console.error(registryReleaseState.error);
    process.exit(1);
  }

  const matchingVersions = registryReleaseState.versions.filter((version) =>
    versionSatisfiesAscRange(version, classification.ascSpec),
  );
  const evaluation = evaluateAscBridgeLifecycle({
    pkg: manifest,
    publishedAscVersions: matchingVersions,
  });
  if (!evaluation.ok) {
    for (const issue of evaluation.issues) console.error(issue);
    process.exit(1);
  }

  let lockResult = null;
  if (classification.mode === "registry-cutover") {
    const lock = JSON.parse(fs.readFileSync(path.join(packageDir, "package-lock.json"), "utf8"));
    const lockEntry = lock?.packages?.[ASC_LOCK_KEY];
    const selectedVersion = lockEntry?.version;
    if (typeof selectedVersion !== "string") {
      console.error(`package-lock.json is missing a versioned ${ASC_LOCK_KEY} registry entry.`);
      process.exit(1);
    }
    const artifactLookup = lookupAscRegistryArtifact(selectedVersion);
    if (!artifactLookup.ok) {
      console.error(artifactLookup.error);
      process.exit(1);
    }
    lockResult = evaluateAscRegistryLock({
      pkg: manifest,
      lock,
      registryReleaseState,
      registryArtifact: artifactLookup.artifact,
    });
    if (!lockResult.ok) {
      for (const issue of lockResult.issues) console.error(issue);
      process.exit(1);
    }
  }

  console.log(formatAscBridgeLifecycleSummary(evaluation, matchingVersions, lockResult));
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  main();
}
