#!/usr/bin/env node
// Shared exact local dependency packer. Keep byte-identical with the pi-vault-client copy.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runtimeDependencyFields = ["dependencies", "optionalDependencies"];
const projectedDependencyFields = [...runtimeDependencyFields, "devDependencies"];
const args = process.argv.slice(2);

function fail(message) {
  throw new Error(message);
}

process.on("uncaughtException", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function getFlagValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value`);
  return value;
}

const packDir = getFlagValue("--pack-dir");
const output = getFlagValue("--output") ?? "json";

function loadManifest(dir) {
  const manifestPath = path.join(dir, "package.json");
  if (!fs.existsSync(manifestPath)) fail(`Missing package.json in ${dir}`);
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function collectLocalDependencies(dir, seen = new Set(), visiting = new Set(), collected = []) {
  const resolvedDir = fs.realpathSync(path.resolve(dir));
  if (visiting.has(resolvedDir)) {
    fail(`Local dependency cycle detected at ${resolvedDir}`);
  }
  visiting.add(resolvedDir);
  const manifest = loadManifest(resolvedDir);
  for (const field of runtimeDependencyFields) {
    const dependencies = manifest[field];
    if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) continue;
    for (const [dependencyName, spec] of Object.entries(dependencies)) {
      if (typeof spec !== "string" || !spec.startsWith("file:")) continue;
      const dependencyDir = fs.realpathSync(path.resolve(resolvedDir, spec.slice("file:".length)));
      const dependencyManifest = loadManifest(dependencyDir);
      if (dependencyManifest.name !== dependencyName) {
        fail(
          `${manifest.name} ${field}.${dependencyName} points to ${spec}, but resolved package is ${dependencyManifest.name ?? "<missing>"}`,
        );
      }
      collectLocalDependencies(dependencyDir, seen, visiting, collected);
      if (seen.has(dependencyDir)) continue;
      seen.add(dependencyDir);
      collected.push({
        name: dependencyManifest.name,
        version: dependencyManifest.version,
        dir: dependencyDir,
      });
    }
  }
  visiting.delete(resolvedDir);
  return collected;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function commonAncestor(paths) {
  let current = fs.realpathSync(path.resolve(paths[0]));
  while (!paths.every((candidate) => isInside(current, fs.realpathSync(path.resolve(candidate))))) {
    const parent = path.dirname(current);
    if (parent === current) fail("Could not derive a bounded local dependency source root");
    current = parent;
  }
  return current;
}

function gitContext(packageDir, dependencyDirs) {
  const rootResult = spawnSync("git", ["-C", packageDir, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });
  if (rootResult.status !== 0) return null;
  const root = fs.realpathSync(rootResult.stdout.trim());
  if (![packageDir, ...dependencyDirs].every((candidate) => isInside(root, candidate))) return null;
  return { root };
}

function copySource(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    filter(candidate) {
      const basename = path.basename(candidate);
      if (["node_modules", ".git", ".tmp", ".npmrc"].includes(basename)) return false;
      if (basename.endsWith(".tgz")) return false;
      if (basename.startsWith(".package.json.")) return false;
      if (fs.lstatSync(candidate).isSymbolicLink()) {
        fail(`Symlink is not allowed in release dependency source: ${candidate}`);
      }
      return true;
    },
  });
}

function createScratchContext(packageDir, dependencies) {
  const dependencyDirs = dependencies.map((dependency) => dependency.dir);
  const git = gitContext(packageDir, dependencyDirs);
  const sourceRoot = git?.root ?? commonAncestor([packageDir, ...dependencyDirs]);
  let workspaceRoot;
  let npmHome;
  try {
    workspaceRoot = fs.mkdtempSync(path.join(packDir, ".source-workspace."));
    npmHome = fs.mkdtempSync(path.join(packDir, ".npm-home."));
    fs.mkdirSync(path.join(npmHome, ".config"), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(npmHome, ".cache"), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(npmHome, "user.npmrc"), "", { mode: 0o600 });
    fs.writeFileSync(path.join(npmHome, "global.npmrc"), "", { mode: 0o600 });
    if (git) {
      const scratchGitRoot = path.join(workspaceRoot, ".git-context");
      const clone = spawnSync(
        "git",
        ["clone", "--shared", "--no-checkout", "--quiet", sourceRoot, scratchGitRoot],
        {
          encoding: "utf8",
          env: { PATH: process.env.PATH, HOME: npmHome, TMPDIR: process.env.TMPDIR },
        },
      );
      if (clone.status !== 0) {
        fail(`Could not create isolated release Git context: ${clone.stderr.trim()}`);
      }
      git.gitDir = path.join(scratchGitRoot, ".git");
    }
    return { sourceRoot, workspaceRoot, npmHome, git };
  } catch (error) {
    if (workspaceRoot) fs.rmSync(workspaceRoot, { recursive: true, force: true });
    if (npmHome) fs.rmSync(npmHome, { recursive: true, force: true });
    throw error;
  }
}

function prepareWorkspace(context, dependencies) {
  const { sourceRoot, workspaceRoot } = context;
  const projected = new Set();
  const projectDirectory = (sourceDir) => {
    const resolved = fs.realpathSync(path.resolve(sourceDir));
    const relative = path.relative(sourceRoot, resolved);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      fail(`Local dependency escaped scratch projection: ${resolved}`);
    }
    const scratchDir = path.join(workspaceRoot, relative);
    if (!projected.has(resolved)) {
      fs.mkdirSync(path.dirname(scratchDir), { recursive: true });
      copySource(resolved, scratchDir);
      projected.add(resolved);
      const manifest = loadManifest(resolved);
      for (const field of projectedDependencyFields) {
        for (const spec of Object.values(manifest[field] ?? {})) {
          if (typeof spec === "string" && spec.startsWith("file:")) {
            projectDirectory(path.resolve(resolved, spec.slice("file:".length)));
          }
        }
      }
    }
    return scratchDir;
  };
  for (const dependency of dependencies) {
    dependency.scratchDir = projectDirectory(dependency.dir);
  }

  // Local package prepack scripts share the interaction-group manifest helper without
  // declaring the private group root as a runtime dependency.
  const interactionScripts = path.join(sourceRoot, "packages", "pi-interaction", "scripts");
  if (fs.existsSync(interactionScripts)) {
    const target = path.join(workspaceRoot, "packages", "pi-interaction", "scripts");
    if (!fs.existsSync(target)) copySource(interactionScripts, target);
  }
}

function npmEnv(context) {
  const tmpDir = process.env.TMPDIR;
  if (!tmpDir || !fs.existsSync(tmpDir)) fail("TMPDIR is required for local dependency packing");
  const preservedPolicy = {};
  for (const key of [
    "NPM_CONFIG_BEFORE",
    "npm_config_before",
    "NPM_CONFIG_MIN_RELEASE_AGE",
    "npm_config_min_release_age",
    "NPM_CONFIG_MIN_RELEASE_AGE_EXCLUDE",
    "npm_config_min_release_age_exclude",
  ]) {
    if (typeof process.env[key] === "string" && process.env[key]) {
      preservedPolicy[key] = process.env[key];
    }
  }
  return {
    PATH: process.env.PATH,
    HOME: context.npmHome,
    TMPDIR: tmpDir,
    TMP: tmpDir,
    TEMP: tmpDir,
    XDG_CONFIG_HOME: path.join(context.npmHome, ".config"),
    XDG_CACHE_HOME: path.join(context.npmHome, ".cache"),
    NPM_CONFIG_USERCONFIG: path.join(context.npmHome, "user.npmrc"),
    npm_config_userconfig: path.join(context.npmHome, "user.npmrc"),
    NPM_CONFIG_GLOBALCONFIG: path.join(context.npmHome, "global.npmrc"),
    npm_config_globalconfig: path.join(context.npmHome, "global.npmrc"),
    NPM_CONFIG_CACHE: path.join(context.npmHome, ".npm-cache"),
    npm_config_cache: path.join(context.npmHome, ".npm-cache"),
    NPM_CONFIG_IGNORE_SCRIPTS: "false",
    npm_config_ignore_scripts: "false",
    ...preservedPolicy,
    ...(context.git ? { GIT_DIR: context.git.gitDir, GIT_WORK_TREE: context.workspaceRoot } : {}),
  };
}

function runNpm(dependency, npmArgs, context, phase) {
  const result = spawnSync("npm", npmArgs, {
    cwd: dependency.scratchDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: npmEnv(context),
  });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    fail(
      `npm ${phase} failed for ${dependency.name} (${dependency.dir}) with exit code ${result.status ?? "unknown"}`,
    );
  }
  return result;
}

function packDependency(dependency, context) {
  if (!fs.existsSync(path.join(dependency.scratchDir, "package-lock.json"))) {
    fail(`Locked dev dependency preparation is required for ${dependency.name}`);
  }
  runNpm(
    dependency,
    ["ci", "--include=dev", "--ignore-scripts", "--no-audit", "--fund=false"],
    context,
    "dependency preparation",
  );
  const result = runNpm(
    dependency,
    ["pack", "--ignore-scripts=false", "--silent", "--pack-destination", packDir],
    context,
    "pack",
  );
  const tarballName = `${result.stdout ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!tarballName) fail(`Could not determine tarball name for ${dependency.name}`);
  return path.join(packDir, tarballName);
}

const packageDir = process.cwd();
const packageManifest = loadManifest(packageDir);
const localDependencies = collectLocalDependencies(packageDir);

if (packDir) {
  fs.mkdirSync(packDir, { recursive: true, mode: 0o700 });
  const invocationLock = path.join(packDir, ".release-local-dependencies.lock");
  let lockOwned = false;
  let context;
  try {
    try {
      fs.mkdirSync(invocationLock);
      lockOwned = true;
    } catch (error) {
      if (error?.code === "EEXIST") {
        fail(`Local dependency pack directory is already active: ${packDir}`);
      }
      throw error;
    }
    context = createScratchContext(packageDir, localDependencies);
    prepareWorkspace(context, localDependencies);
    for (const dependency of localDependencies) {
      dependency.tarballPath = packDependency(dependency, context);
    }
  } finally {
    for (const dependency of localDependencies) delete dependency.scratchDir;
    if (context) {
      fs.rmSync(context.workspaceRoot, { recursive: true, force: true });
      fs.rmSync(context.npmHome, { recursive: true, force: true });
    }
    if (lockOwned) fs.rmSync(invocationLock, { recursive: true, force: true });
  }
}

switch (output) {
  case "json":
    process.stdout.write(
      `${JSON.stringify({ package: { name: packageManifest.name, version: packageManifest.version, dir: packageDir }, localDependencies }, null, 2)}\n`,
    );
    break;
  case "dirs":
    for (const dependency of localDependencies) process.stdout.write(`${dependency.dir}\n`);
    break;
  case "tarballs":
    if (!packDir) fail("--output tarballs requires --pack-dir");
    for (const dependency of localDependencies) process.stdout.write(`${dependency.tarballPath}\n`);
    break;
  default:
    fail(`Unsupported --output value: ${output}`);
}
