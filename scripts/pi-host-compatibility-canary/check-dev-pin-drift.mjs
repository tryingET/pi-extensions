#!/usr/bin/env node
// ---
// summary: "Fails closed when package manifests or locks drift from the canary Pi host contract."
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
const PIN_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

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
  const found = [];
  const packagesRoot = path.join(repoRoot, "packages");
  walkPackageDirs(packagesRoot, found);
  return found.sort();
}

function walkPackageDirs(dir, found) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const next = path.join(dir, entry.name);
    const manifestPath = path.join(next, "package.json");
    if (fs.existsSync(manifestPath)) found.push(manifestPath);
    walkPackageDirs(next, found);
  }
}

function contractLockRole(lockKey, packageName) {
  const suffix = `node_modules/${packageName}`;
  if (lockKey === suffix) return "direct";
  if (!lockKey.endsWith(`/${suffix}`)) return undefined;
  const prefix = lockKey.slice(0, -suffix.length - 1);
  if (prefix.startsWith("..")) return undefined;
  if (prefix.startsWith("node_modules/@earendil-works/")) return undefined;
  if (prefix.startsWith("node_modules/")) return "nested-float";
  return undefined;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectDeclaredPins(packageJson) {
  const pins = [];
  for (const field of PIN_FIELDS) {
    const block = packageJson[field];
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    for (const packageName of CONTRACT_PACKAGES) {
      if (!Object.hasOwn(block, packageName)) continue;
      pins.push({ field, packageName, declared: block[packageName] });
    }
  }
  return pins;
}

function checkLockAlignment(relLock, pins, expected, lock, offenders) {
  const root = lock.packages?.[""];
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    offenders.push(`${relLock}: missing packages[""] toolchain record`);
    return 0;
  }
  let checked = 0;
  for (const pin of pins) {
    const rootSpec = root[pin.field]?.[pin.packageName];
    if (rootSpec !== undefined) {
      checked += 1;
      if (rootSpec !== pin.declared) {
        offenders.push(
          `${relLock}: packages[""].${pin.field}.${pin.packageName}=${rootSpec} (expected ${pin.declared})`,
        );
      }
    }
    const direct = lock.packages?.[`node_modules/${pin.packageName}`];
    const resolved = direct?.version;
    if (resolved === undefined) {
      offenders.push(
        `${relLock}: missing node_modules/${pin.packageName} for ${pin.field} pin ${pin.declared}`,
      );
      continue;
    }
    checked += 1;
    if (resolved !== pin.declared) {
      offenders.push(
        `${relLock}: node_modules/${pin.packageName}=${resolved} (expected ${pin.declared})`,
      );
    }
  }
  for (const [lockKey, meta] of Object.entries(lock.packages ?? {})) {
    for (const packageName of CONTRACT_PACKAGES) {
      if (contractLockRole(lockKey, packageName) !== "nested-float") continue;
      checked += 1;
      const version = meta?.version;
      if (version !== expected) {
        offenders.push(`${relLock}: ${lockKey}=${version} (expected ${expected})`);
      }
    }
  }
  return checked;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = validateManifest(loadManifest(args.manifestPath));
  const expected = manifest.profiles.current.host.version;
  const offenders = [];
  let checked = 0;
  const packageManifests = listPackageManifests(args.repoRoot);
  for (const manifestPath of packageManifests) {
    const relManifest = path.relative(args.repoRoot, manifestPath);
    let packageJson;
    try {
      packageJson = readJson(manifestPath);
    } catch {
      offenders.push(`${relManifest}: unparseable package.json`);
      continue;
    }
    const pins = collectDeclaredPins(packageJson);
    for (const pin of pins) {
      checked += 1;
      if (pin.declared !== expected || !EXACT_VERSION.test(String(pin.declared))) {
        offenders.push(
          `${relManifest}: ${pin.field}.${pin.packageName}=${pin.declared} (expected ${expected})`,
        );
      }
    }
    const lockPath = path.join(path.dirname(manifestPath), "package-lock.json");
    if (!fs.existsSync(lockPath)) continue;
    const relLock = path.relative(args.repoRoot, lockPath);
    let lock;
    try {
      lock = readJson(lockPath);
    } catch {
      offenders.push(`${relLock}: unparseable package-lock.json`);
      continue;
    }
    checked += checkLockAlignment(relLock, pins, expected, lock, offenders);
  }
  if (packageManifests.length === 0) {
    console.error(
      `Pi host contract drift check found no package manifests under ${args.repoRoot}/packages; refusing to pass vacuously.`,
    );
    process.exit(1);
  }
  if (offenders.length > 0) {
    console.error(
      `Pi host contract drift: ${offenders.length} pin(s) away from the canary current host version ${expected}:`,
    );
    for (const offender of offenders) console.error(`  - ${offender}`);
    console.error(
      "Align package dependencies/devDependencies/optionalDependencies and matching lock entries with policy/pi-host-compatibility-canary.json profiles.current.host.version.",
    );
    process.exit(1);
  }
  console.log(`ok: pi host contract pins (${checked} declaration(s)/lock entries at ${expected})`);
}

main();
