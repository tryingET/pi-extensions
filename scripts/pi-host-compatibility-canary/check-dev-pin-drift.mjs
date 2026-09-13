#!/usr/bin/env node
// ---
// summary: "Fails closed when package manifests or locks drift from the canary Pi host contract."
// read_when:
//   - "Changing the Pi host contract drift rules or the canary drift-guard scenario."
// ---
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MANIFEST_PATH } from "./paths.mjs";
import { loadSnapshot, POLICY_PATH } from "./drift-snapshot.mjs";
import { loadWorktree } from "./drift-worktree.mjs";

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
  const options = { manifestPath: DEFAULT_MANIFEST_PATH, repoRoot: ROOT, packageRoots: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--manifest", "--repo-root", "--package", "--revision"].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      if (arg === "--manifest") {
        options.manifestPath = path.resolve(value);
        options.customManifest = true;
      } else if (arg === "--repo-root") options.repoRoot = path.resolve(value);
      else if (arg === "--package") options.packageRoots.push(value);
      else options.revision = value;
      continue;
    }
    if (arg === "--json") { options.json = true; continue; }
    if (arg === "--staged") { options.staged = true; continue; }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (options.staged && options.revision) throw new Error("cannot combine --staged and --revision");
  if ((options.staged || options.revision) && (options.customManifest || options.packageRoots.length)) {
    throw new Error("cannot combine --staged/--revision with --manifest or --package");
  }
  return options;
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
    if (rootSpec === undefined) {
      offenders.push(`${relLock}: missing packages[""].${pin.field}.${pin.packageName} (expected ${pin.declared})`);
    } else {
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

function reconcile(input) {
  const { expected, offenders, packageManifests, removedPackages = [] } = input;
  let checked = 0;
  for (const relManifest of packageManifests) {
    let packageJson;
    try {
      packageJson = input.readJson(relManifest);
      if (!packageJson || typeof packageJson !== "object" || Array.isArray(packageJson)) throw new SyntaxError();
    } catch (error) {
      offenders.push(`${relManifest}: unparseable package.json${error instanceof SyntaxError ? "" : ` (${error.message})`}`);
      continue;
    }
    const metadata = packageJson["x-pi-template"]?.piHostContract;
    if (metadata && Object.hasOwn(metadata, "devTestFloor")) {
      checked += 1;
      if (metadata.devTestFloor !== expected) {
        offenders.push(`${relManifest}: x-pi-template.piHostContract.devTestFloor=${metadata.devTestFloor} (expected ${expected})`);
      }
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
    const relLock = path.join(path.dirname(relManifest), "package-lock.json");
    if (!input.exists(relLock)) continue;
    let lock;
    try {
      lock = input.readJson(relLock);
      if (!lock || typeof lock !== "object" || Array.isArray(lock)) throw new SyntaxError();
    } catch (error) {
      offenders.push(`${relLock}: unparseable package-lock.json${error instanceof SyntaxError ? "" : ` (${error.message})`}`);
      continue;
    }
    checked += checkLockAlignment(relLock, pins, expected, lock, offenders);
  }
  if (input.fleetEmpty || (packageManifests.length === 0 && !input.skip && removedPackages.length === 0)) {
    offenders.push(`Pi host contract drift check found no package manifests under ${input.source.repoRoot}/packages; refusing to pass vacuously.`);
  }
  return {
    schemaVersion: 1, status: offenders.length ? "fail" : input.skip ? "skip" : "pass",
    source: input.source, removedPackages,
    scope: { ...input.scope, packages: packageManifests.map(name => path.dirname(name)) },
    baseline: { version: expected, path: input.source.manifestPath ?? POLICY_PATH,
      field: "profiles.current.host.version" },
    offenders, counts: { packages: packageManifests.length, checks: checked, offenders: offenders.length,
      removedPackages: removedPackages.length },
  };
}

function printReport(report, json) {
  if (json) { console.log(JSON.stringify(report, null, 2)); return; }
  const { offenders, baseline: { version: expected }, counts: { checks: checked } } = report;
  if (report.status === "skip") {
    console.log("skip: pi host contract pins (no changed packages in index-vs-HEAD; not a full fleet check)");
  } else if (offenders.length > 0) {
    if (report.counts.packages === 0) {
      for (const offender of offenders) console.error(offender);
      return;
    }
    console.error(
      `Pi host contract drift: ${offenders.length} pin(s) away from the canary current host version ${expected}:`,
    );
    for (const offender of offenders) console.error(`  - ${offender}`);
    console.error(
      "Align package dependencies/devDependencies/optionalDependencies and matching lock entries with policy/pi-host-compatibility-canary.json profiles.current.host.version.",
    );
  } else {
    if (report.counts.packages > 0) {
      console.log(`ok: pi host contract pins (${checked} declaration(s)/lock entries at ${expected})`);
    }
    if (report.removedPackages?.length) {
      const scope = report.scope.kind === "fleet" ? "surviving fleet checked" : "not a full fleet check";
      console.log(`ok: ${report.removedPackages.length} complete package removal(s) reviewed from index-vs-HEAD (${scope}): ${report.removedPackages.join(", ")}`);
    }
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    const input = args.staged || args.revision ? loadSnapshot(args) : loadWorktree(args);
    const report = reconcile(input);
    printReport(report, args.json);
    if (report.status === "fail") process.exitCode = 1;
  } catch (error) {
    const json = args?.json ?? process.argv.slice(2).includes("--json");
    printReport({ schemaVersion: 1, status: "fail",
      source: { kind: args?.staged ? "index" : args?.revision ? "revision" : "worktree",
        repoRoot: args?.repoRoot ?? ROOT },
      scope: { kind: "unresolved", packages: [] }, baseline: { version: null }, removedPackages: [],
      offenders: [error.message], counts: { packages: 0, checks: 0, offenders: 1, removedPackages: 0 },
    }, json);
    process.exitCode = 1;
  }
}

main();
