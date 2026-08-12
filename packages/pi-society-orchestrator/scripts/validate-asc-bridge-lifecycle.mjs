#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ASC_PACKAGE_NAME = "@tryinget/pi-autonomous-session-control";
const REPO_REGISTRY = "https://registry.npmjs.org/";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  if (!usesLocalFileDependency && !usesSupportedRegistrySemver) {
    issues.push(
      `Dependency ${ASC_PACKAGE_NAME}=${normalizedAscSpec} is not a supported registry semver selector. Use an exact version or caret range; local paths, tags, URLs, aliases, and git specs cannot prove registry installability.`,
    );
    return {
      ok: false,
      mode: "invalid",
      ascSpec: normalizedAscSpec,
      bundledDependencies,
      extraBundles,
      issues,
    };
  }

  if (usesLocalFileDependency && hasAscBundle) {
    return {
      ok: issues.length === 0,
      mode: "transitional-bundled-bridge",
      ascSpec: normalizedAscSpec,
      bundledDependencies,
      extraBundles,
      issues,
    };
  }

  if (usesSupportedRegistrySemver && !hasAscBundle) {
    return {
      ok: issues.length === 0,
      mode: "registry-cutover",
      ascSpec: normalizedAscSpec,
      bundledDependencies,
      extraBundles,
      issues,
    };
  }

  if (usesLocalFileDependency && !hasAscBundle) {
    issues.push(
      `Local dependency ${ASC_PACKAGE_NAME}=${normalizedAscSpec} must keep bundleDependencies aligned until the registry-backed cutover is complete.`,
    );
  } else if (!usesLocalFileDependency && hasAscBundle) {
    issues.push(
      `Bundled ${ASC_PACKAGE_NAME} must be removed once orchestrator consumes it as a normal dependency (${normalizedAscSpec}).`,
    );
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

export function parsePublishedPackageVersionLookup(
  result,
  registrySelector = ASC_PACKAGE_NAME,
  ascSpec,
) {
  if (result.status === 0) {
    const raw = String(result.stdout ?? "").trim();
    if (raw.length === 0) {
      return {
        ok: false,
        versions: [],
        error: `npm view ${registrySelector} returned empty output; the declared ASC range is not proven installable.`,
      };
    }

    try {
      const parsed = JSON.parse(raw);
      const candidates = typeof parsed === "string" ? [parsed] : parsed;
      if (!Array.isArray(candidates)) {
        return {
          ok: false,
          versions: [],
          error: `npm view ${registrySelector} returned unexpected JSON: ${raw}`,
        };
      }
      const versions = candidates.map((value) => (typeof value === "string" ? value.trim() : ""));
      if (versions.length === 0 || versions.some((version) => !parseStrictSemver(version))) {
        return {
          ok: false,
          versions: [],
          error: `npm view ${registrySelector} returned no usable strict-semver published versions.`,
        };
      }
      if (
        typeof ascSpec === "string" &&
        versions.some((version) => !versionSatisfiesAscRange(version, ascSpec))
      ) {
        return {
          ok: false,
          versions: [],
          error: `npm view ${registrySelector} returned a version that does not satisfy the declared ASC range ${ascSpec}.`,
        };
      }
      return { ok: true, versions: [...new Set(versions)] };
    } catch (error) {
      return {
        ok: false,
        versions: [],
        error:
          error instanceof Error
            ? `Could not parse npm view ${registrySelector} output: ${error.message}`
            : `Could not parse npm view ${registrySelector} output`,
      };
    }
  }

  const combined = [result.stderr, result.stdout]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");

  if (/\bE404\b|404 Not Found|could not be found|not found/i.test(combined)) {
    return {
      ok: false,
      versions: [],
      error: `No published ${ASC_PACKAGE_NAME} version satisfies the declared selector ${registrySelector} (npm E404).`,
    };
  }
  if (/\bETARGET\b|No matching version found/i.test(combined)) {
    return {
      ok: false,
      versions: [],
      error: `No published ${ASC_PACKAGE_NAME} version satisfies the declared selector ${registrySelector} (npm ETARGET).`,
    };
  }

  return {
    ok: false,
    versions: [],
    error:
      combined.length > 0
        ? `Could not determine ASC registry state for ${registrySelector}: ${combined.split(/\r?\n/).slice(-8).join(" | ")}`
        : `Could not determine ASC registry state for ${registrySelector} (npm exited ${result.status ?? "unknown"})`,
  };
}

export function ascRegistrySelector(ascSpec) {
  return typeof ascSpec === "string" && !ascSpec.trim().startsWith("file:")
    ? `${ASC_PACKAGE_NAME}@${ascSpec.trim()}`
    : ASC_PACKAGE_NAME;
}

export function lookupPublishedAscVersions(ascSpec, spawn = spawnSync) {
  const registrySelector = ascRegistrySelector(ascSpec);
  const result = spawn(
    "npm",
    ["view", registrySelector, "version", "--json", "--registry", REPO_REGISTRY],
    {
      encoding: "utf8",
      env: process.env,
    },
  );
  return {
    registrySelector,
    ...parsePublishedPackageVersionLookup(result, registrySelector, ascSpec),
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

  if (classification.mode === "transitional-bundled-bridge" && publishedAscVersions.length > 0) {
    issues.push(
      `${ASC_PACKAGE_NAME}@${publishedAscVersions.join(", ")} is visible on ${REPO_REGISTRY}, so the bundled bridge lifecycle review trigger has fired. Replace the local file dependency with the intended semver dependency and remove bundleDependencies before the next orchestrator release.`,
    );
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

export function formatAscBridgeLifecycleSummary(result, publishedAscVersions) {
  const modeLabel =
    result.classification.mode === "transitional-bundled-bridge"
      ? "transitional bundled bridge"
      : result.classification.mode === "registry-cutover"
        ? "registry-backed cutover"
        : "invalid";
  return `ASC bridge lifecycle OK (${modeLabel}; ${ASC_PACKAGE_NAME}@${publishedAscVersions.join(", ")} satisfies ${result.classification.ascSpec}).`;
}

function main() {
  const packageDir = process.cwd();
  const manifest = readManifest(packageDir);
  const classification = classifyAscBridgeLifecycle(manifest);
  if (!classification.ok) {
    for (const issue of classification.issues) console.error(issue);
    process.exit(1);
  }

  const publishedAsc = lookupPublishedAscVersions(classification.ascSpec);
  if (!publishedAsc.ok) {
    console.error(publishedAsc.error);
    process.exit(1);
  }

  const evaluation = evaluateAscBridgeLifecycle({
    pkg: manifest,
    publishedAscVersions: publishedAsc.versions,
  });

  if (!evaluation.ok) {
    for (const issue of evaluation.issues) console.error(issue);
    process.exit(1);
  }

  console.log(formatAscBridgeLifecycleSummary(evaluation, publishedAsc.versions));
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  main();
}
