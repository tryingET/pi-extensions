// summary: Two-layer closure of the Pi task-session runtime: a committed lock for third-party and SDK packages, own tarballs packed at the exact commit, all installed with the network unshared.
// read_when:
//   - "Changing how the task-session host is installed, or how pack-proof builds its consumer."
//   - "An install refuses with a lock_*, own_package_* or closure_* code."
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SDK_VERSION = "1.4.0";
export const SDK_PACKAGES = ["pi-agent-core", "pi-ai", "pi-coding-agent", "pi-tui"].map(
  (name) => `@earendil-works/${name}`,
);
export const OWN_ROOTS = ["@tryinget/pi-little-helpers", "@tryinget/pi-society-orchestrator"];
export const LOCK_DIR = fileURLToPath(new URL(".", import.meta.url));
const REGISTRY = "https://registry.npmjs.org/";
const COMMAND_TIMEOUT_MS = 300_000;
const OWN_SCOPE = "@tryinget/";
const SDK_SCOPE = "@earendil-works/";

export function refuse(code, detail) {
  throw new Error(detail === undefined ? code : `${code}: ${detail}`);
}
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const nameOf = (lockPath) => lockPath.slice(lockPath.lastIndexOf("node_modules/") + 13);
const sha512 = (path) =>
  `sha512-${createHash("sha512").update(readFileSync(path)).digest("base64")}`;

export const readLock = (lockDir = LOCK_DIR) => readJson(join(lockDir, "runtime.lock"));
export const readRuntimeManifest = (lockDir = LOCK_DIR) =>
  readJson(join(lockDir, "runtime-package.json"));

const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Npm and every prepack run on PATH's node, so it must be the pin too, not only this process. */
export function nodeRefusal({ pinned, running, onPath }) {
  if (running !== pinned) return `install_node_not_pinned: running ${running}, pin ${pinned}`;
  if (onPath !== `v${pinned}`) return `install_node_mixed: PATH has ${onPath}, pin ${pinned}`;
  return undefined;
}

/** Packing rewrites manifests during prepack, which must never happen under live Pi sessions. */
export function assertPackEnvironment(dir) {
  const repo = git(["rev-parse", "--show-toplevel"], dir);
  if (
    realpathSync(git(["rev-parse", "--absolute-git-dir"], repo)) ===
    realpathSync(resolve(repo, git(["rev-parse", "--git-common-dir"], repo)))
  )
    refuse("install_from_canonical_checkout", "run this in a linked worktree");
  const refusal = nodeRefusal({
    pinned: readJson(join(repo, "policy/ci-toolchain-lock.json")).nodeVersion,
    running: process.versions.node,
    onPath: execFileSync("node", ["--version"], { encoding: "utf8" }).trim(),
  });
  if (refusal) refuse(refusal);
}

/** Layer one holds third-party and SDK packages only, each bound to the registry by integrity. */
export function assertLayerOneLock(lock, sdkVersion = SDK_VERSION) {
  if (lock?.lockfileVersion !== 3 || !lock.packages?.[""]) refuse("lock_format_unsupported");
  for (const sdk of SDK_PACKAGES)
    if (lock.packages[""].dependencies?.[sdk] !== sdkVersion) refuse("lock_sdk_not_exact", sdk);
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === "") continue;
    const name = nameOf(path);
    if (name.startsWith(OWN_SCOPE)) refuse("lock_own_package_forbidden", path);
    if (entry.link || !entry.resolved?.startsWith(REGISTRY))
      refuse("lock_entry_not_registry", path);
    if (!entry.integrity?.startsWith("sha512-")) refuse("lock_entry_without_integrity", path);
    if (name.startsWith(SDK_SCOPE) && entry.version !== sdkVersion)
      refuse("lock_companion_drift", `${path}@${entry.version}`);
  }
}

const older = (left, right) => {
  const [a, b] = [left, right].map((version) => version.split(".").map(Number));
  const at = a.findIndex((part, index) => part !== b[index]);
  return at !== -1 && a[at] < b[at];
};

/** An override holds a version down as well as up: refuse one a package's exact pin has moved past. */
export function assertOverridesCurrent(lock, manifest) {
  for (const [name, version] of Object.entries(manifest.overrides ?? {}))
    for (const [path, entry] of Object.entries(lock.packages)) {
      const pin = entry.dependencies?.[name];
      if (/^\d+\.\d+\.\d+$/.test(pin ?? "") && older(version, pin))
        refuse("lock_override_stale", `${name}@${version} is below ${path || "root"} pin ${pin}`);
    }
}

function ownManifests(packagesRoot) {
  const manifests = new Map();
  const visit = (dir) => {
    const path = join(dir, "package.json");
    if (!existsSync(path)) return;
    const manifest = readJson(path);
    if (manifest.name?.startsWith(OWN_SCOPE)) manifests.set(manifest.name, { dir, manifest });
  };
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesRoot, entry.name);
    visit(dir);
    for (const child of readdirSync(dir, { withFileTypes: true }))
      if (child.isDirectory() && child.name !== "node_modules") visit(join(dir, child.name));
  }
  return manifests;
}

/** Every own package the roots reach through runtime dependencies, in a stable order. */
export function ownClosure(packagesRoot, roots = OWN_ROOTS) {
  const manifests = ownManifests(packagesRoot);
  const seen = new Map();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    const own = manifests.get(name);
    if (!own) refuse("own_package_not_in_checkout", name);
    seen.set(name, own);
    for (const dependency of Object.keys(own.manifest.dependencies ?? {}))
      if (dependency.startsWith(OWN_SCOPE)) queue.push(dependency);
  }
  return [...seen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, own]) => ({ name, version: own.manifest.version, dir: own.dir }));
}

const NO_SCRIPTS = "--ignore-scripts";
const offlineNpm = (args, cwd, cache) =>
  execFileSync(
    "unshare",
    ["-rn", "npm", ...args, "--offline", "--no-audit", "--no-fund", "--cache", cache],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: COMMAND_TIMEOUT_MS },
  );

function layDownLock(lockDir, dir) {
  copyFileSync(join(lockDir, "runtime-package.json"), join(dir, "package.json"));
  copyFileSync(join(lockDir, "runtime.lock"), join(dir, "package-lock.json"));
}

/** The one network step: npm fills the private cache from the lock and checks every integrity. */
export function fetchLockedClosure({ lockDir = LOCK_DIR, directory, cache }) {
  layDownLock(lockDir, directory);
  execFileSync(
    "npm",
    ["ci", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund", "--cache", cache],
    {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: COMMAND_TIMEOUT_MS,
    },
  );
}

/** Pack own packages with no network. `prepack` must run: it builds what goes in the tarball. */
export function packOwn(closure, destination, cache) {
  assertPackEnvironment(closure[0].dir);
  // Ignored build output is invisible to the clean check, so nothing stale may reach prepack.
  for (const { dir } of closure)
    rmSync(join(dir, "dist/task-session"), { recursive: true, force: true });
  return closure.map(({ name, version, dir }) => {
    const output = offlineNpm(["pack", "--json", "--pack-destination", destination], dir, cache);
    // npm 11 keys `pack --json` by package; older npm returned an array. Accept both.
    const [result] = Object.values(JSON.parse(output));
    if (result.name !== name || result.version !== version)
      refuse("own_package_pack_mismatch", `${name}@${version}`);
    const tarball = join(destination, result.filename);
    return { name, version, tarball, integrity: sha512(tarball), files: result.files };
  });
}

/** Both layers go in with the network unshared, so a missing tarball fails instead of fetching. */
export function installClosure({ lockDir = LOCK_DIR, staging, cache, packed }) {
  layDownLock(lockDir, staging);
  offlineNpm(["ci", "--omit=dev", NO_SCRIPTS], staging, cache);
  const tarballs = packed.map((own) => own.tarball);
  offlineNpm(["install", "--omit=dev", NO_SCRIPTS, ...tarballs], staging, cache);
  return readJson(join(staging, "node_modules/.package-lock.json")).packages;
}

/**
 * What npm recorded as installed must be exactly the committed lock plus the tarballs packed for this
 * install. npm checks integrity as it extracts; this compares its record, not the files on disk.
 */
export function verifyInstalled(installed, lock, packed) {
  const own = new Map(packed.map((entry) => [entry.name, entry]));
  const rows = [];
  const seen = new Set();
  for (const [path, entry] of Object.entries(installed)) {
    if (path === "") continue;
    const name = nameOf(path);
    seen.add(path);
    if (name.startsWith(OWN_SCOPE)) {
      const expected = own.get(name);
      if (!expected) refuse("own_package_unpacked", path);
      if (!entry.resolved?.startsWith("file:")) refuse("own_package_from_registry", path);
      if (entry.version !== expected.version || entry.integrity !== expected.integrity)
        refuse("own_package_mismatch", path);
    } else {
      const pin = lock.packages[path];
      if (!pin) refuse("closure_entry_unlocked", path);
      if (pin.version !== entry.version || pin.integrity !== entry.integrity)
        refuse("closure_entry_mismatch", `${path}@${entry.version}`);
    }
    rows.push(`${path}\0${entry.version}\0${entry.integrity}`);
  }
  for (const [path, pin] of Object.entries(lock.packages))
    if (path !== "" && !pin.dev && !pin.optional && !seen.has(path))
      refuse("closure_entry_missing", path);
  for (const name of own.keys())
    if (!seen.has(`node_modules/${name}`)) refuse("own_package_missing", name);
  const digest = createHash("sha256").update(rows.sort().join("\n")).digest("hex");
  return { digest, packages: rows.length };
}

export function writeClosureRecord(directory, record) {
  writeFileSync(join(directory, "closure.json"), `${JSON.stringify(record, null, 2)}\n`);
}
