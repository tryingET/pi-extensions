#!/usr/bin/env node
// ---
// summary: "Fails closed when any package dev-pins a Pi host contract package away from the canary's current host version."
// read_when:
//   - "Changing the Pi host contract drift rules or the canary drift-guard scenario."
// ---
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest, validateManifest } from "./manifest.mjs";
import { DEFAULT_MANIFEST_PATH } from "./paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// The governed Pi host contract set: the canary host package, its companions,
// and the fourth governed-closure member pinned by the orchestrator's
// governed runtime constants. Other @earendil-works libraries follow their
// own release cadences and are deliberately not enforced here.
const CONTRACT_PACKAGES = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
];

function parseArgs(argv) {
  const options = { manifestPath: DEFAULT_MANIFEST_PATH, repoRoot: ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest" || arg === "--repo-root") {
      const value = argv[++index];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === "--manifest") options.manifestPath = path.resolve(value);
      else options.repoRoot = path.resolve(value);
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function listPackageManifests(repoRoot) {
  const packageParents = ["packages", "packages/pi-interaction"];
  const found = [];
  for (const packageParent of packageParents) {
    const parent = path.join(repoRoot, packageParent);
    if (!fs.existsSync(parent)) continue;
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(parent, entry.name, "package.json");
      if (fs.existsSync(manifestPath)) found.push(manifestPath);
    }
  }
  return found.sort();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = validateManifest(loadManifest(args.manifestPath));
  const expected = manifest.profiles.current.host.version;
  const offenders = [];
  let checked = 0;
  const packageManifests = listPackageManifests(args.repoRoot);
  for (const manifestPath of packageManifests) {
    let packageJson;
    try {
      packageJson = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      offenders.push(`${path.relative(args.repoRoot, manifestPath)}: unparseable package.json`);
      continue;
    }
    const devDependencies = packageJson.devDependencies ?? {};
    for (const packageName of CONTRACT_PACKAGES) {
      const declared = devDependencies[packageName];
      if (declared === undefined) continue;
      checked += 1;
      if (declared !== expected) {
        offenders.push(
          `${path.relative(args.repoRoot, manifestPath)}: ${packageName}=${declared} (expected ${expected})`,
        );
      }
    }
  }
  if (packageManifests.length === 0) {
    console.error(
      `Pi host contract drift check found no package manifests under ${args.repoRoot}/packages; refusing to pass vacuously.`,
    );
    process.exit(1);
  }
  if (offenders.length > 0) {
    console.error(
      `Pi host contract drift: ${offenders.length} dev pin(s) away from the canary current host version ${expected}:`,
    );
    for (const offender of offenders) console.error(`  - ${offender}`);
    console.error(
      "Align package devDependencies with policy/pi-host-compatibility-canary.json profiles.current.host.version.",
    );
    process.exit(1);
  }
  console.log(`ok: pi host contract dev pins (${checked} declaration(s) at ${expected})`);
}

main();
