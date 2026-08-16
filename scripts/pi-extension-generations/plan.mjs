// ---
// summary: "Builds deterministic, commit-backed plans for the bounded Pi extension generation canary."
// read_when:
//   - "Changing supported package inputs, generation identity, or Git snapshot validation."
// ---
import { realpath } from "node:fs/promises";
import path from "node:path";
import {
  PLAN_SCHEMA,
  SUPPORTED_PACKAGE_NAME,
  SUPPORTED_PACKAGE_ROOT,
  assertAbsolute,
  assertObject,
  canonical,
  fail,
  isWithin,
  run,
  sha256,
} from "./common.mjs";

const FULL_COMMIT = /^[a-f0-9]{40}$/u;
const BUILD_SCRIPTS = new Set([
  "preinstall", "install", "postinstall", "prepare", "prepack", "postpack",
  "prepublish", "prepublishOnly", "build", "prebuild", "postbuild",
]);
const LOCAL_SPEC = /^(?:file:|link:|workspace:|\.\.?[/\\]|[/\\]|~[/\\])/u;
const GLOB = /[*?\[\]{}]/u;

async function git(repoRoot, args, options = {}) {
  return run("git", ["-C", repoRoot, ...args], options);
}

export async function resolveExactCommit(repoRoot, commit) {
  if (!FULL_COMMIT.test(commit ?? "")) fail("commit must be an exact lowercase 40-character Git commit");
  const result = await git(repoRoot, ["rev-parse", "--verify", `${commit}^{commit}`]);
  const resolved = result.stdout.toString("utf8").trim();
  if (resolved !== commit) fail("commit does not resolve to the exact supplied commit");
  return resolved;
}

export async function readCommitTree(repoRoot, commit, pathspec) {
  const args = ["ls-tree", "-r", "-z", "--full-tree", commit];
  if (pathspec) args.push("--", pathspec);
  const result = await git(repoRoot, args);
  const records = result.stdout.toString("utf8").split("\0").filter(Boolean);
  return records.map((record) => {
    const tab = record.indexOf("\t");
    if (tab < 0) fail("unexpected git ls-tree output");
    const [mode, type, oid] = record.slice(0, tab).split(" ");
    return { mode, type, oid, path: record.slice(tab + 1) };
  });
}

async function readBlob(repoRoot, oid) {
  return (await git(repoRoot, ["cat-file", "blob", oid])).stdout;
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function dependencyObject(value, label) {
  if (value === undefined) return {};
  const object = assertObject(value, label);
  for (const [name, spec] of Object.entries(object)) {
    if (typeof name !== "string" || !name || typeof spec !== "string" || !spec) fail(`${label} must contain non-empty string specifications`);
  }
  return object;
}

function validateManifest(manifest) {
  const value = assertObject(manifest, "package manifest");
  if (value.name !== SUPPORTED_PACKAGE_NAME) fail(`only ${SUPPORTED_PACKAGE_NAME} is supported in the first slice`);
  const scripts = dependencyObject(value.scripts, "package scripts");
  const unsupportedScript = Object.keys(scripts).find((name) => BUILD_SCRIPTS.has(name));
  if (unsupportedScript) fail(`unsupported lifecycle/build recipe: scripts.${unsupportedScript}`);
  const dependencies = dependencyObject(value.dependencies, "dependencies");
  const optionalDependencies = dependencyObject(value.optionalDependencies, "optionalDependencies");
  if (Object.keys(dependencies).length > 0 || Object.keys(optionalDependencies).length > 0) {
    fail("runtime and optional dependencies are unsupported in the first no-install slice");
  }
  if (value.bundledDependencies !== undefined || value.bundleDependencies !== undefined) {
    fail("bundled dependencies are unsupported in the first slice");
  }
  const peers = dependencyObject(value.peerDependencies, "peerDependencies");
  for (const [name, spec] of Object.entries(peers)) {
    if (name !== "@earendil-works/pi-coding-agent" || spec !== "*") fail(`unsupported peer dependency: ${name}@${spec}`);
  }
  const piManifest = assertObject(value.pi, "package pi manifest");
  if (!Array.isArray(piManifest.extensions) || piManifest.extensions.length === 0) fail("pi.extensions must declare at least one exact entrypoint");
  if (!piManifest.extensions.every((entry) => typeof entry === "string" && entry.length > 0 && !GLOB.test(entry))) {
    fail("pi.extensions entries must be exact non-glob strings");
  }
  return { manifest: value, peers, declaredEntrypoints: piManifest.extensions };
}

function validateLock(lock, manifest) {
  const value = assertObject(lock, "package lock");
  if (value.lockfileVersion !== 3) fail("only package-lock lockfileVersion 3 is supported");
  const packages = assertObject(value.packages, "package lock packages");
  const root = assertObject(packages[""], "package lock root");
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) {
    const expected = dependencyObject(manifest[field], `manifest ${field}`);
    const actual = dependencyObject(root[field], `lock root ${field}`);
    if (canonical(actual) !== canonical(expected)) fail(`package lock root ${field} does not match the commit manifest`);
  }
  for (const [key, itemValue] of Object.entries(packages)) {
    const item = assertObject(itemValue, `package lock entry ${key || "<root>"}`);
    if (key.startsWith("../") || (typeof item.resolved === "string" && LOCAL_SPEC.test(item.resolved))) {
      fail(`unsupported local dependency edge in package lock: ${key || item.resolved}`);
    }
  }
  return value;
}

function normalizeEntrypoint(packageRoot, entrypoint) {
  const withoutDot = entrypoint.startsWith("./") ? entrypoint.slice(2) : entrypoint;
  const normalized = path.posix.normalize(withoutDot);
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    fail(`entrypoint escapes the selected package: ${entrypoint}`);
  }
  return `${packageRoot}/${normalized}`;
}

export function planDigestPreimage(plan) {
  return {
    schema: plan.schema,
    builder: plan.builder,
    sourceCommit: plan.source.commit,
    selection: plan.selection,
    closure: plan.closure,
  };
}

export function recomputePlanIdentity(plan) {
  const inputDigest = sha256(canonical(planDigestPreimage(plan)));
  return { inputDigest, generationId: `${plan.source.commit}-${inputDigest.slice("sha256:".length)}` };
}

export async function validateCommitTree(repoRoot, commit) {
  const entries = await readCommitTree(repoRoot, commit);
  for (const entry of entries) {
    if (entry.mode === "160000" || entry.type === "commit") fail(`gitlinks are unsupported: ${entry.path}`);
    if (entry.mode !== "120000") continue;
    const target = (await readBlob(repoRoot, entry.oid)).toString("utf8");
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), target));
    if (path.posix.isAbsolute(target) || resolved === ".." || resolved.startsWith("../")) {
      fail(`tracked symlink escapes the exported repository: ${entry.path} -> ${target}`);
    }
  }
  return entries;
}

export async function planGeneration({ repoRoot, commit, packageRoot, stateRoot }) {
  assertAbsolute(repoRoot, "repo root");
  assertAbsolute(stateRoot, "state root");
  const canonicalRepo = await realpath(repoRoot);
  if (canonicalRepo !== repoRoot) fail("repo root must use its canonical path");
  const gitTopLevel = (await git(repoRoot, ["rev-parse", "--show-toplevel"])).stdout.toString("utf8").trim();
  if (gitTopLevel !== repoRoot) fail("repo root must equal the canonical Git top-level checkout");
  if (packageRoot !== SUPPORTED_PACKAGE_ROOT) fail(`only ${SUPPORTED_PACKAGE_ROOT} is supported in the first slice`);
  if (isWithin(repoRoot, stateRoot) || isWithin(stateRoot, repoRoot)) fail("generation state root must be outside the source repository");
  await resolveExactCommit(repoRoot, commit);

  const tree = await readCommitTree(repoRoot, commit, packageRoot);
  if (tree.length === 0) fail("selected package is absent from the commit");
  const byPath = new Map(tree.map((entry) => [entry.path, entry]));
  const manifestPath = `${packageRoot}/package.json`;
  const lockPath = `${packageRoot}/package-lock.json`;
  const manifestEntry = byPath.get(manifestPath);
  const lockEntry = byPath.get(lockPath);
  if (!manifestEntry || manifestEntry.mode === "120000" || manifestEntry.type !== "blob") fail("package manifest must be a tracked regular file");
  if (!lockEntry || lockEntry.mode === "120000" || lockEntry.type !== "blob") fail("package lock must be a tracked regular file");
  if (tree.some((entry) => entry.mode === "120000")) fail("selected package symlinks are unsupported in the first slice");

  const manifestBytes = await readBlob(repoRoot, manifestEntry.oid);
  const lockBytes = await readBlob(repoRoot, lockEntry.oid);
  const validated = validateManifest(parseJson(manifestBytes, "package manifest"));
  validateLock(parseJson(lockBytes, "package lock"), validated.manifest);

  const packageFiles = [];
  for (const entry of tree) {
    if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) fail(`unsupported tracked package input: ${entry.path}`);
    const bytes = await readBlob(repoRoot, entry.oid);
    packageFiles.push({ path: entry.path, mode: entry.mode, sha256: sha256(bytes) });
  }
  packageFiles.sort((left, right) => left.path.localeCompare(right.path));
  const entrypoints = validated.declaredEntrypoints.map((declared) => {
    const entryPath = normalizeEntrypoint(packageRoot, declared);
    const file = packageFiles.find((item) => item.path === entryPath);
    if (!file) fail(`extension entrypoint is not a tracked regular file: ${declared}`);
    return { declared, path: entryPath, sha256: file.sha256 };
  });

  const builder = {
    schemaVersion: 1,
    nodeVersion: process.version,
    installPolicy: "no-install",
  };
  const selection = {
    packageRoot,
    packageName: validated.manifest.name,
    manifest: { path: manifestPath, sha256: sha256(manifestBytes) },
    lock: { path: lockPath, sha256: sha256(lockBytes) },
    entrypoints,
    packageFiles,
    packageDigest: sha256(canonical(packageFiles)),
  };
  const closure = {
    runtimeDependencies: [],
    optionalDependencies: [],
    peerDependencies: Object.entries(validated.peers).sort(([left], [right]) => left.localeCompare(right)),
    install: "no-install",
  };
  const partial = { schema: PLAN_SCHEMA, builder, source: { repoRoot, commit }, selection, closure };
  const identity = recomputePlanIdentity(partial);
  const generationDir = path.join(stateRoot, "generations", identity.generationId);
  return {
    ...partial,
    ...identity,
    paths: {
      stateRoot,
      generationDir,
      repoDir: path.join(generationDir, "repo"),
      packageDir: path.join(generationDir, "repo", packageRoot),
      marker: path.join(generationDir, "generation.json"),
    },
  };
}
