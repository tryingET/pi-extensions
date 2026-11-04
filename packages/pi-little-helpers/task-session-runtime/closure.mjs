// summary: Two-layer closure of the Pi task-session runtime: a committed lock for third-party and SDK packages, own tarballs packed at the exact commit, all installed with the network unshared.
// read_when:
//   - "Changing how the task-session host is installed, or how pack-proof builds its consumer."
//   - "An install refuses with a lock_*, own_package_* or closure_* code."
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
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
const EXACT = /^\d+\.\d+\.\d+$/;
// The only artifact a registry entry may name: its own tarball. Anything else is an alias in disguise.
const tarballUrl = (name, version) =>
  `${REGISTRY}${name}/-/${name.split("/").at(-1)}-${version}.tgz`;
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

/** Root dependencies and overrides are exact versions: no aliases, ranges, tags or local paths. */
export function assertRuntimeManifest(manifest) {
  for (const field of ["dependencies", "overrides"])
    for (const [name, spec] of Object.entries(manifest[field] ?? {}))
      if (typeof spec !== "string" || !EXACT.test(spec))
        refuse("runtime_spec_not_exact", `${field}.${name}@${spec}`);
}

/**
 * Git as the recorded commit stores it. No inherited `GIT_*` may point it at another repository, index
 * or configuration, and replacement refs would show another tree under HEAD's name.
 */
export const GIT_ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
  GIT_NO_REPLACE_OBJECTS: "1",
};
const git = (args, cwd) =>
  execFileSync("git", args, {
    cwd,
    env: GIT_ENV,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();

/**
 * npm sees only this configuration: no inherited `npm_config_*`, user or global npmrc, mirror, update
 * check, preload or module path. Without it an inherited registry moves the locked fetch, since npm
 * swaps the host of every registry.npmjs.org tarball URL for the configured one. A proxy or CA still
 * comes from HTTPS_PROXY and NODE_EXTRA_CA_CERTS.
 */
// npm reads NODE_ENV and PREFIX as configuration and Node reads NODE_OPTIONS and NODE_PATH before any
// code runs. A proxy would hide the real destination from the egress guard, so npm connects directly.
// npm lowercases every variable name, so they are compared in lower case.
const NPM_STRIPPED = new Set([
  "node_options",
  "node_path",
  "node_env",
  "prefix",
  "https_proxy",
  "http_proxy",
  "all_proxy",
  "no_proxy",
  "proxy",
]);
const EGRESS_GUARD = fileURLToPath(new URL("egress-guard.cjs", import.meta.url));
/** `online` preloads the egress guard, so npm connects only to the registry, redirects included. */
export function isolatedNpm(args, { online = false } = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^npm_config_/i.test(name) && !NPM_STRIPPED.has(name.toLowerCase()),
    ),
  );
  if (online) env.NODE_OPTIONS = `--require ${JSON.stringify(EGRESS_GUARD)}`;
  return {
    args: [
      ...args,
      `--registry=${REGISTRY}`,
      "--replace-registry-host=never",
      // Two paths, since npm refuses one file as both; nothing can exist below /dev/null.
      "--userconfig=/dev/null",
      "--globalconfig=/dev/null/npmrc",
      "--update-notifier=false",
      // npm runs git itself for a git dependency, outside the guard; the lock admits none, so fail it.
      "--git=/dev/null/git",
    ],
    env,
  };
}

/** Npm and every prepack run on PATH's node, so it must be the pin too, not only this process. */
export function nodeRefusal({ pinned, running, onPath, pinnedNpm, npm }) {
  if (running !== pinned) return `install_node_not_pinned: running ${running}, pin ${pinned}`;
  if (onPath !== `v${pinned}`) return `install_node_mixed: PATH has ${onPath}, pin ${pinned}`;
  if (pinnedNpm !== undefined && npm !== pinnedNpm)
    return `install_npm_not_pinned: PATH has npm ${npm}, pin ${pinnedNpm}`;
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
  const toolchain = readJson(join(repo, "policy/ci-toolchain-lock.json"));
  const refusal = nodeRefusal({
    pinned: toolchain.nodeVersion,
    running: process.versions.node,
    onPath: execFileSync("node", ["--version"], { encoding: "utf8" }).trim(),
    pinnedNpm: toolchain.npmVersion,
    npm: execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(),
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
    if (entry.name !== undefined && entry.name !== name)
      refuse("lock_alias_forbidden", `${path} installs ${entry.name}`);
    if (entry.link || entry.resolved !== tarballUrl(name, entry.version))
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
export function assertOverridesCurrent(lock, manifest, own = []) {
  // `own` holds [name, manifest] for the packed packages, whose pins the lock never records.
  const holders = [...Object.entries(lock.packages), ...own];
  for (const [name, version] of Object.entries(manifest.overrides ?? {}))
    for (const [path, entry] of holders)
      for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
        const pin = entry[field]?.[name];
        if (EXACT.test(pin ?? "") && older(version, pin))
          refuse(
            "lock_override_stale",
            `${name}@${version} is below ${path || "root"} ${field} ${pin}`,
          );
      }
  for (const [name, version] of Object.entries(manifest.overrides ?? {})) {
    const copies = Object.entries(lock.packages).filter(([path]) => path && nameOf(path) === name);
    if (!copies.length) refuse("lock_override_not_applied", `${name}@${version} is not installed`);
    for (const [path, entry] of copies)
      if (entry.version !== version)
        refuse("lock_override_not_applied", `${path}@${entry.version}, override ${version}`);
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
    .map(([name, own]) => ({
      name,
      version: own.manifest.version,
      dir: own.dir,
      manifest: own.manifest,
    }));
}

const NO_SCRIPTS = "--ignore-scripts";
const offlineNpm = (args, cwd, cache) => {
  const npm = isolatedNpm([...args, "--offline", "--no-audit", "--no-fund", "--cache", cache]);
  return execFileSync("unshare", ["-rn", "npm", ...npm.args], {
    cwd,
    env: npm.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: COMMAND_TIMEOUT_MS,
  });
};

function layDownLock(lockDir, dir) {
  copyFileSync(join(lockDir, "runtime-package.json"), join(dir, "package.json"));
  copyFileSync(join(lockDir, "runtime.lock"), join(dir, "package-lock.json"));
}

/** The one network step: npm fills the private cache from the lock and checks every integrity. */
export function fetchLockedClosure({ lockDir = LOCK_DIR, directory, cache }) {
  layDownLock(lockDir, directory);
  const npm = isolatedNpm(
    ["ci", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund", "--cache", cache],
    { online: true },
  );
  execFileSync("npm", npm.args, {
    cwd: directory,
    env: npm.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: COMMAND_TIMEOUT_MS,
  });
}

/**
 * Tracked files under paths whose bytes, type or executable bit differ from HEAD. It hashes the files
 * itself, not through the index or git's filters, so an edit hidden by --assume-unchanged,
 * --skip-worktree or an end-of-line conversion still counts.
 */
export function headMismatches(repo, paths, commit = "HEAD") {
  const format = git(["rev-parse", "--show-object-format"], repo);
  const blobId = (bytes) =>
    createHash(format).update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  const changed = [];
  for (const row of git(["ls-tree", "-r", "-z", commit, "--", ...paths], repo).split("\0")) {
    const tab = row.indexOf("\t");
    const [mode, type, blob] = row.slice(0, tab).split(" ");
    const file = row.slice(tab + 1);
    if (type !== "blob") continue;
    let stat;
    try {
      stat = lstatSync(join(repo, file));
    } catch {
      changed.push(file);
      continue;
    }
    const link = mode === "120000";
    if (link ? !stat.isSymbolicLink() : !stat.isFile()) {
      changed.push(file);
      continue;
    }
    const bytes = link
      ? readlinkSync(join(repo, file), { encoding: "buffer" })
      : readFileSync(join(repo, file));
    // The mode npm packs: tar's portable mode adds owner read-write and drops group and other write.
    // Setuid, setgid and sticky bits survive into the tarball too, so they count.
    const packed = (stat.mode | 0o600) & ~0o22 & 0o7777;
    const modeDiffers = !link && packed !== (mode === "100755" ? 0o755 : 0o644);
    if (blobId(bytes) !== blob || modeDiffers) changed.push(file);
  }
  return changed;
}

/** Files a tarball carries that are neither tracked at the commit nor rebuilt `dist/` output. */
export const untrackedPackedFiles = (files, tracked) =>
  files.filter((file) => !tracked.has(file) && !file.startsWith("dist/"));

/** Ignored paths a build could read: all but installs, rebuilt `dist/` and test scratch (`.tmp*`). */
export const ignoredInputs = (paths) =>
  paths.filter(
    (path) =>
      !path.startsWith("node_modules/") && !path.startsWith("dist/") && !path.startsWith(".tmp"),
  );

/** Pack own packages with no network. `prepack` and `prepare` must run: they build `dist/`. */
export function packOwn(closure, destination, cache) {
  assertPackEnvironment(closure[0].dir);
  // The clean check cannot see ignored files, and a build may read them: refuse before any effect.
  for (const { name, dir } of closure) {
    const ignored = git(
      ["ls-files", "-z", "-o", "-i", "--exclude-standard", "--directory", "--", "."],
      dir,
    )
      .split("\0")
      .filter(Boolean);
    const inputs = ignoredInputs(ignored);
    if (inputs.length)
      refuse("own_package_ignored_input", `${name}: ${inputs.slice(0, 5).join(", ")}`);
  }
  return closure.map(({ name, version, dir }) => {
    // `dist/` may only come from this build; cleared per package so a refusal strands no other.
    rmSync(join(dir, "dist"), { recursive: true, force: true });
    const output = offlineNpm(["pack", "--json", "--pack-destination", destination], dir, cache);
    // npm 11 keys `pack --json` by package; older npm returned an array. Accept both.
    const [result] = Object.values(JSON.parse(output));
    if (result.name !== name || result.version !== version)
      refuse("own_package_pack_mismatch", `${name}@${version}`);
    const tracked = new Set(git(["ls-files", "-z", "--", "."], dir).split("\0").filter(Boolean));
    const stray = untrackedPackedFiles(
      result.files.map((file) => file.path),
      tracked,
    );
    if (stray.length)
      refuse("own_package_untracked_file", `${name}: ${stray.slice(0, 5).join(", ")}`);
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
    if (entry.name !== undefined && entry.name !== name)
      refuse("closure_entry_alias", `${path} installs ${entry.name}`);
    if (name.startsWith(OWN_SCOPE)) {
      const expected = own.get(name);
      if (!expected) refuse("own_package_unpacked", path);
      if (!entry.resolved?.startsWith("file:")) refuse("own_package_from_registry", path);
      if (entry.version !== expected.version || entry.integrity !== expected.integrity)
        refuse("own_package_mismatch", path);
    } else {
      const pin = lock.packages[path];
      if (!pin) refuse("closure_entry_unlocked", path);
      if (
        pin.version !== entry.version ||
        pin.integrity !== entry.integrity ||
        pin.resolved !== entry.resolved
      )
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

/** Every file's bytes, every link's target and every entry name under root, in a stable order. */
export function treeDigest(root) {
  const rows = [];
  const walk = (dir, prefix) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const path = join(dir, entry.name);
      const key = `${prefix}${entry.name}`;
      const mode = (lstatSync(path).mode & 0o7777).toString(8);
      if (entry.isSymbolicLink()) rows.push(`l\0${key}\0${readlinkSync(path)}`);
      else if (entry.isDirectory()) {
        rows.push(`d\0${key}\0${mode}`);
        walk(path, `${key}/`);
      } else if (entry.isFile()) {
        const bytes = createHash("sha256").update(readFileSync(path)).digest("hex");
        rows.push(`f\0${key}\0${mode}\0${bytes}`);
      } else rows.push(`o\0${key}\0${mode}`);
    }
  };
  walk(root, "");
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

export function writeClosureRecord(directory, record) {
  writeFileSync(join(directory, "closure.json"), `${JSON.stringify(record, null, 2)}\n`);
}
