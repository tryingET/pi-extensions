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
  const usesLocalFileDependency = normalizedAscSpec.startsWith("file:");

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

  if (!usesLocalFileDependency && !hasAscBundle) {
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

export function parsePublishedPackageVersionLookup(result) {
  if (result.status === 0) {
    const raw = String(result.stdout ?? "").trim();
    if (raw.length === 0) {
      return {
        ok: false,
        published: false,
        error: `npm view ${ASC_PACKAGE_NAME} returned empty output`,
      };
    }

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string" && parsed.trim().length > 0) {
        return {
          ok: true,
          published: true,
          version: parsed.trim(),
        };
      }
      return {
        ok: false,
        published: false,
        error: `npm view ${ASC_PACKAGE_NAME} returned unexpected JSON: ${raw}`,
      };
    } catch (error) {
      return {
        ok: false,
        published: false,
        error:
          error instanceof Error
            ? `Could not parse npm view ${ASC_PACKAGE_NAME} output: ${error.message}`
            : `Could not parse npm view ${ASC_PACKAGE_NAME} output`,
      };
    }
  }

  const combined = [result.stderr, result.stdout]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("\n");

  if (/\bE404\b|404 Not Found|could not be found|not found/i.test(combined)) {
    return { ok: true, published: false };
  }

  return {
    ok: false,
    published: false,
    error:
      combined.length > 0
        ? `Could not determine ASC registry state: ${combined.split(/\r?\n/).slice(-8).join(" | ")}`
        : `Could not determine ASC registry state (npm exited ${result.status ?? "unknown"})`,
  };
}

export function evaluateAscBridgeLifecycle({ pkg, publishedAscVersion }) {
  const classification = classifyAscBridgeLifecycle(pkg);
  const issues = [...classification.issues];

  if (classification.mode === "transitional-bundled-bridge" && publishedAscVersion) {
    issues.push(
      `${ASC_PACKAGE_NAME}@${publishedAscVersion} is visible on ${REPO_REGISTRY}, so the bundled bridge lifecycle review trigger has fired. Replace the local file dependency with the intended semver dependency and remove bundleDependencies before the next orchestrator release.`,
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

function lookupPublishedAscVersion() {
  const override = process.env.PI_ORCH_ASC_REGISTRY_VERSION;
  if (typeof override === "string") {
    const normalized = override.trim();
    if (normalized.length === 0 || normalized.toLowerCase() === "unpublished") {
      return { ok: true, published: false };
    }
    return { ok: true, published: true, version: normalized };
  }

  const result = spawnSync(
    "npm",
    ["view", ASC_PACKAGE_NAME, "version", "--json", "--registry", REPO_REGISTRY],
    {
      encoding: "utf8",
      env: process.env,
    },
  );
  return parsePublishedPackageVersionLookup(result);
}

export function formatAscBridgeLifecycleSummary(result, publishedAscVersion) {
  const modeLabel =
    result.classification.mode === "transitional-bundled-bridge"
      ? "transitional bundled bridge"
      : result.classification.mode === "registry-cutover"
        ? "registry-backed cutover"
        : "invalid";
  const publishedLabel = publishedAscVersion
    ? `${ASC_PACKAGE_NAME}@${publishedAscVersion} is published`
    : `${ASC_PACKAGE_NAME} is not yet published`;
  return `ASC bridge lifecycle OK (${modeLabel}; ${publishedLabel}).`;
}

function main() {
  const packageDir = process.cwd();
  const manifest = readManifest(packageDir);
  const publishedAsc = lookupPublishedAscVersion();
  if (!publishedAsc.ok) {
    console.error(publishedAsc.error);
    process.exit(1);
  }

  const evaluation = evaluateAscBridgeLifecycle({
    pkg: manifest,
    publishedAscVersion: publishedAsc.published ? publishedAsc.version : undefined,
  });

  if (!evaluation.ok) {
    for (const issue of evaluation.issues) {
      console.error(issue);
    }
    process.exit(1);
  }

  console.log(
    formatAscBridgeLifecycleSummary(
      evaluation,
      publishedAsc.published ? publishedAsc.version : undefined,
    ),
  );
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  main();
}
