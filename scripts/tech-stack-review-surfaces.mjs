#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");
const packagesRoot = path.join(repoRoot, "packages");

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function normalizeRelativePath(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

function walkPackageRoots(rootDir) {
  const results = [];

  function visit(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === "package.json")) {
      results.push(dirPath);
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules") continue;
      if (entry.name.startsWith(".")) continue;
      visit(path.join(dirPath, entry.name));
    }
  }

  if (fs.existsSync(rootDir)) {
    visit(rootDir);
  }

  return results.sort((a, b) => normalizeRelativePath(a).localeCompare(normalizeRelativePath(b)));
}

function inferReviewForm({ hasTechStackDoc, hasStackLanePolicy }) {
  if (hasTechStackDoc && hasStackLanePolicy) return "legacy-full";
  if (hasTechStackDoc) return "reduced-form";
  if (hasStackLanePolicy) return "policy-only";
  return "none";
}

function inferTopology(packagePath, allPackages) {
  const packageMeta = readJsonSafe(path.join(packagePath, "package.json"));
  const relPath = normalizeRelativePath(packagePath);
  const relWithSlash = `${relPath}/`;
  const hasChildPackage = allPackages.some((candidate) => {
    if (candidate === packagePath) return false;
    return normalizeRelativePath(candidate).startsWith(relWithSlash);
  });

  return {
    scaffoldMode: packageMeta?.["x-pi-template"]?.scaffoldMode ?? null,
    packageRole: hasChildPackage ? "package-group-root" : "package-root",
  };
}

function buildReport() {
  const packageRoots = walkPackageRoots(packagesRoot);
  const packages = packageRoots.map((packagePath) => {
    const relPath = normalizeRelativePath(packagePath);
    const hasTechStackDoc = exists(`${relPath}/docs/tech-stack.local.md`);
    const hasStackLanePolicy = exists(`${relPath}/policy/stack-lane.json`);
    const topology = inferTopology(packagePath, packageRoots);

    return {
      path: relPath,
      ...topology,
      hasTechStackDoc,
      hasStackLanePolicy,
      reviewForm: inferReviewForm({ hasTechStackDoc, hasStackLanePolicy }),
    };
  });

  const summary = {
    packageCount: packages.length,
    legacyFullCount: packages.filter((pkg) => pkg.reviewForm === "legacy-full").length,
    reducedFormCount: packages.filter((pkg) => pkg.reviewForm === "reduced-form").length,
    policyOnlyCount: packages.filter((pkg) => pkg.reviewForm === "policy-only").length,
    noLocalSurfaceCount: packages.filter((pkg) => pkg.reviewForm === "none").length,
  };

  return {
    root: {
      techStackDoc: exists("docs/tech-stack.local.md") ? "docs/tech-stack.local.md" : null,
      validator: exists("scripts/validate-tech-stack-contract.mjs")
        ? "scripts/validate-tech-stack-contract.mjs"
        : null,
    },
    packages,
    summary,
  };
}

function printText(report) {
  console.log("pi-extensions tech-stack review surfaces");
  console.log("");
  console.log("root-owned surfaces:");
  console.log(`- ${report.root.techStackDoc ?? "missing: docs/tech-stack.local.md"}`);
  console.log(`- ${report.root.validator ?? "missing: scripts/validate-tech-stack-contract.mjs"}`);
  console.log("");
  console.log("package-local surfaces:");

  for (const pkg of report.packages) {
    const tags = [pkg.packageRole];
    if (pkg.scaffoldMode) tags.push(`scaffold=${pkg.scaffoldMode}`);
    console.log(
      `- ${pkg.path} | review=${pkg.reviewForm} | docs=${pkg.hasTechStackDoc ? "yes" : "no"} | policy=${pkg.hasStackLanePolicy ? "yes" : "no"} | ${tags.join(" | ")}`,
    );
  }

  console.log("");
  console.log("summary:");
  console.log(`- packages: ${report.summary.packageCount}`);
  console.log(`- legacy-full: ${report.summary.legacyFullCount}`);
  console.log(`- reduced-form: ${report.summary.reducedFormCount}`);
  console.log(`- policy-only: ${report.summary.policyOnlyCount}`);
  console.log(`- no-local-surface: ${report.summary.noLocalSurfaceCount}`);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const report = buildReport();

  if (args.has("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printText(report);
}

main();
