#!/usr/bin/env node
// summary: materialize, verify, and canary the one-snapshot governed deep-review runtime.
// read_when:
//   - preparing the temporary governed-loop runtime or running its cross-package canary.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  collectGovernedRuntimePackageInputHashes,
  GOVERNED_RUNTIME_ASC_BUILD_RECEIPT_RELATIVE_PATHS,
  GOVERNED_RUNTIME_HOST_CACHE_TARBALLS,
  GOVERNED_RUNTIME_HOST_PEERS,
  GOVERNED_RUNTIME_LOCAL_EDGES,
  GOVERNED_RUNTIME_MANIFEST_RELATIVE_PATH,
  GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA,
  GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX,
  GOVERNED_RUNTIME_PACKAGES,
  GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH,
  GOVERNED_RUNTIME_QUARANTINE_RELATIVE_PATH,
  GOVERNED_RUNTIME_TYPEBOX_CONSUMERS,
  GOVERNED_RUNTIME_TYPEBOX_INTEGRITY,
  GOVERNED_RUNTIME_TYPEBOX_VERSION,
  governedRuntimeAscBuildEnvironment,
  governedRuntimeNpmEffectEnvironment,
  inspectGovernedRuntimeAscRuntime,
  inspectGovernedRuntimeCleanliness,
  inspectGovernedRuntimeLexicalNodeModules,
  inspectGovernedRuntimeNpmPolicy,
  resolveGovernedRuntimeGraph,
  verifyGovernedRuntimeAscRuntime,
  verifyGovernedRuntimeFileIntegrity,
  verifyGovernedRuntimeHostPeers,
  verifyGovernedRuntimeHostSource,
  verifyGovernedRuntimeMaterialization,
  verifyGovernedRuntimeNodeModulesLayout,
  verifyGovernedRuntimeNpmEffectReceipts,
  verifyGovernedRuntimeNpmExecutables,
  verifyGovernedRuntimePackageClosures,
  verifyGovernedRuntimeTypebox,
} from "../packages/pi-society-orchestrator/src/runtime/governed-runtime-materialization.ts";

const SCRIPT_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const TYPEBOX_VERSION = GOVERNED_RUNTIME_TYPEBOX_VERSION;
const TYPEBOX_INTEGRITY = GOVERNED_RUNTIME_TYPEBOX_INTEGRITY;
const MANIFEST_SCHEMA = GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA;
const MANIFEST_RELATIVE_PATH = GOVERNED_RUNTIME_MANIFEST_RELATIVE_PATH;
const PEER_LAYER_RELATIVE_PATH = GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH;

const PACKAGES = GOVERNED_RUNTIME_PACKAGES;
const TYPEBOX_CONSUMERS = GOVERNED_RUNTIME_TYPEBOX_CONSUMERS;
const LOCAL_EDGES = GOVERNED_RUNTIME_LOCAL_EDGES;
const LOCAL_OWNER_NAMES = new Set(LOCAL_EDGES.map(({ expectedOwnerName }) => expectedOwnerName));
const SHARED_PEER_NAMES = new Set([...Object.keys(GOVERNED_RUNTIME_HOST_PEERS), "typebox"]);
const QUARANTINE_RELATIVE_PATH = GOVERNED_RUNTIME_QUARANTINE_RELATIVE_PATH;

function parseArgs(argv) {
  const [action = "help", ...rest] = argv;
  const options = {
    action,
    sourceRoot: SCRIPT_ROOT,
    expectedCommit: undefined,
    verifiedHostCache: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--source-root") {
      const selected = rest[++index];
      if (!selected || selected.startsWith("--"))
        throw new Error("--source-root requires a value.");
      options.sourceRoot = resolve(selected);
    } else if (value === "--expected-commit") {
      const selected = rest[++index];
      if (!selected || selected.startsWith("--"))
        throw new Error("--expected-commit requires a value.");
      options.expectedCommit = selected;
    } else if (value === "--verified-host-cache") options.verifiedHostCache = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.stdio ?? "pipe",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${String(result.status)}): ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
  return (result.stdout ?? "").trim();
}

function git(sourceRoot, args) {
  return run("git", ["-C", sourceRoot, ...args]);
}

function collectTrackedInputHashes(sourceRoot) {
  return collectGovernedRuntimePackageInputHashes(sourceRoot);
}

function sameObject(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pathEntryExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function assertSourceIdentity(sourceRoot, expectedCommit) {
  const root = realpathSync(sourceRoot);
  const commit = git(root, ["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/u.test(commit)) throw new Error("Source HEAD is not a full commit hash.");
  if (expectedCommit && commit !== expectedCommit) {
    throw new Error(`Source HEAD ${commit} does not match expected commit ${expectedCommit}.`);
  }
  if (!root.toLowerCase().includes(commit.slice(0, 8))) {
    throw new Error(
      `Runtime source path must include immutable commit prefix ${commit.slice(0, 8)}: ${root}`,
    );
  }
  const cleanliness = inspectGovernedRuntimeCleanliness(root);
  if (!cleanliness.clean) {
    throw new Error(
      `Runtime source is not immutable-clean (tracked=${cleanliness.trackedChanges.length}, untracked=${cleanliness.untrackedSourcePaths.length}).`,
    );
  }
  return { sourceRoot: root, sourceCommit: commit, cleanliness };
}

function fsyncDirectory(directory) {
  const descriptor = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function acquireMaterializationLock(sourceRoot) {
  const canonicalSourceRoot = realpathSync(sourceRoot);
  const lockRoot = resolve(dirname(canonicalSourceRoot), ".tryinget-governed-runtime-locks");
  mkdirSync(lockRoot, { recursive: true, mode: 0o700 });
  const lockName = createHash("sha256").update(canonicalSourceRoot).digest("hex");
  const lockPath = resolve(lockRoot, `${lockName}.lock`);
  let descriptor;
  try {
    descriptor = openSync(
      lockPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    writeFileSync(
      descriptor,
      `${JSON.stringify({ sourceRoot: realpathSync(sourceRoot), pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
      "utf8",
    );
    fsyncSync(descriptor);
    fsyncDirectory(lockRoot);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    throw new Error(
      `Could not acquire exclusive governed materialization lock ${lockPath}: ${error instanceof Error ? error.message : String(error)}.`,
      { cause: error },
    );
  }
  return {
    lockPath,
    release() {
      closeSync(descriptor);
      descriptor = undefined;
      unlinkSync(lockPath);
      fsyncDirectory(lockRoot);
    },
  };
}

export function runNpmEffect(npm, effect, args, cwd, receipts, options = {}) {
  const cwdBefore = realpathSync(cwd);
  const executables = verifyGovernedRuntimeNpmExecutables(npm);
  const environment = governedRuntimeNpmEffectEnvironment(npm);
  const environmentDigest = createHash("sha256").update(JSON.stringify(environment)).digest("hex");
  const startedAt = new Date().toISOString();
  const result = spawnSync(
    executables.nodeExecutable.realpath,
    [executables.npmExecutable.realpath, ...args],
    {
      cwd: cwdBefore,
      encoding: "utf8",
      env: environment,
      stdio: options.stdio ?? "pipe",
    },
  );
  verifyGovernedRuntimeNpmExecutables(npm);
  const finishedAt = new Date().toISOString();
  const cwdAfter = realpathSync(cwd);
  if (result.status !== 0) {
    throw new Error(
      `${executables.nodeExecutable.realpath} ${executables.npmExecutable.realpath} ${args.join(" ")} failed (${String(result.status)}): ${(result.stderr || result.stdout || result.error || "").toString().trim()}`,
    );
  }
  receipts.push({
    effect,
    nodeExecutable: executables.nodeExecutable,
    npmExecutable: executables.npmExecutable,
    argv: [...args],
    cwdBefore,
    cwdAfter,
    environment,
    environmentDigest,
    startedAt,
    finishedAt,
  });
  return (result.stdout ?? "").trim();
}

export function writeJsonDurably(finalPath, value) {
  const parent = dirname(finalPath);
  mkdirSync(parent, { recursive: true });
  if (pathEntryExists(finalPath))
    throw new Error(`Refusing to replace governed receipt: ${finalPath}.`);
  const temporaryPath = resolve(parent, `.tryinget-${process.pid}-${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporaryPath, finalPath);
    fsyncDirectory(parent);
    unlinkSync(temporaryPath);
    fsyncDirectory(parent);
    const stat = lstatSync(finalPath);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) {
      throw new Error(`Durable governed receipt publication failed for ${finalPath}.`);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporaryPath, { force: true });
  }
}

function assertFreshMaterializationRoot(sourceRoot) {
  const lexicalNodeModules = inspectGovernedRuntimeLexicalNodeModules(sourceRoot);
  if (lexicalNodeModules.length > 0) {
    throw new Error(
      `Production materialize rejects every pre-existing lexical node_modules root, including ignored nested roots: ${lexicalNodeModules.join(", ")}.`,
    );
  }
  const generatedTargets = [
    resolve(sourceRoot, "node_modules"),
    resolve(sourceRoot, "packages/pi-autonomous-session-control/dist"),
    ...PACKAGES.map((packagePath) => resolve(sourceRoot, packagePath, "node_modules")),
  ];
  const present = generatedTargets.filter((target) => pathEntryExists(target));
  if (present.length > 0) {
    throw new Error(
      `Production materialize is fresh-root/one-shot only; generated targets already exist: ${present.join(", ")}. Create a new commit-named standalone candidate instead of replacing or retrying this root.`,
    );
  }
}

function quarantineMaterialization(sourceRoot, sourceCommit, error) {
  const quarantinePath = resolve(sourceRoot, QUARANTINE_RELATIVE_PATH);
  if (pathEntryExists(quarantinePath)) return quarantinePath;
  writeJsonDurably(quarantinePath, {
    schema: "pi.governed-runtime-quarantine.v1",
    sourceRoot,
    sourceCommit,
    quarantinedAt: new Date().toISOString(),
    reason: error instanceof Error ? error.message : String(error),
    retryAllowed: false,
  });
  return quarantinePath;
}

function forceMaterializationFailureForTest(stage) {
  const selected = process.env.TRYINGET_GOVERNED_RUNTIME_TEST_FAIL_AT;
  if (selected === undefined) return;
  if (process.env.NODE_ENV !== "test" || selected !== stage) {
    throw new Error(
      "Governed materialization fault injection is available only with NODE_ENV=test and one exact internal stage.",
    );
  }
  throw new Error(`Forced governed materialization test failure at ${stage}.`);
}

function createInstallManifest(originalManifest, includeAscBuildDependencies) {
  const manifest = structuredClone(originalManifest);
  if (!includeAscBuildDependencies) delete manifest.devDependencies;
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "overrides",
    "peerDependencies",
  ]) {
    for (const [packageName, specifier] of Object.entries(manifest[field] ?? {})) {
      if (
        LOCAL_OWNER_NAMES.has(packageName) ||
        SHARED_PEER_NAMES.has(packageName) ||
        (typeof specifier === "string" && specifier.startsWith("file:"))
      ) {
        delete manifest[field][packageName];
      }
    }
    if (Object.keys(manifest[field] ?? {}).length === 0) delete manifest[field];
  }
  delete manifest.peerDependenciesMeta;
  return manifest;
}

function materializePackageRuntimes(sourceRoot, npm, npmEffects) {
  const generationParent = resolve(sourceRoot, "node_modules");
  mkdirSync(generationParent, { mode: 0o700 });
  fsyncDirectory(sourceRoot);
  const stagingRoot = resolve(
    generationParent,
    `${GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX}${randomUUID()}`,
  );
  mkdirSync(stagingRoot, { mode: 0o700 });
  fsyncDirectory(generationParent);
  const modulesByPackage = {};
  for (const packagePath of PACKAGES) {
    const packageRoot = resolve(sourceRoot, packagePath);
    const packageLockPath = resolve(packageRoot, "package-lock.json");
    if (!existsSync(packageLockPath)) {
      throw new Error(`Selected runtime package has no lockfile: ${packagePath}.`);
    }
    const stage = resolve(stagingRoot, packagePath);
    mkdirSync(stage, { recursive: true });
    const originalManifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
    const installManifest = createInstallManifest(
      originalManifest,
      packagePath === "packages/pi-autonomous-session-control",
    );
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "overrides"]) {
      for (const packageName of Object.keys(installManifest[field] ?? {})) {
        if (LOCAL_OWNER_NAMES.has(packageName)) {
          throw new Error(`Staged manifest retained local owner ${packageName}: ${packagePath}.`);
        }
      }
    }
    writeFileSync(
      resolve(stage, "package.json"),
      `${JSON.stringify(installManifest, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(resolve(stage, "package-lock.json"), readFileSync(packageLockPath));
    const omitDev = packagePath === "packages/pi-autonomous-session-control" ? [] : ["--omit=dev"];
    runNpmEffect(
      npm,
      `package_ci:${packagePath}`,
      ["ci", ...omitDev, "--omit=peer", "--ignore-scripts", "--no-audit", "--no-fund"],
      stage,
      npmEffects,
      { stdio: "inherit" },
    );
    const stagedModules = resolve(stage, "node_modules");
    if (!pathEntryExists(stagedModules)) mkdirSync(stagedModules, { recursive: true });
    const stagedStat = lstatSync(stagedModules);
    if (!stagedStat.isDirectory() || stagedStat.isSymbolicLink()) {
      throw new Error(`npm produced a non-directory staged node_modules: ${stagedModules}.`);
    }
    const hiddenLockPath = resolve(stagedModules, ".package-lock.json");
    if (!pathEntryExists(hiddenLockPath)) {
      writeFileSync(
        hiddenLockPath,
        `${JSON.stringify({
          name: originalManifest.name,
          version: originalManifest.version,
          lockfileVersion: 3,
          requires: true,
          packages: {},
        })}\n`,
        { encoding: "utf8", mode: 0o644 },
      );
    }
    modulesByPackage[packagePath] = stagedModules;
  }
  return { stagingRoot, modulesByPackage };
}

export function publishPackageRuntimes(sourceRoot, staged) {
  const root = realpathSync(sourceRoot);
  const generationParent = realpathSync(resolve(root, "node_modules"));
  const generationRoot = realpathSync(staged.stagingRoot);
  const generationName = basename(generationRoot);
  const generationId = generationName.slice(GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX.length);
  if (
    dirname(generationRoot) !== generationParent ||
    !generationName.startsWith(GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(generationId)
  ) {
    throw new Error(`Governed package generation root is invalid: ${generationRoot}.`);
  }
  const publicationTargets = {};
  for (const packagePath of PACKAGES) {
    const stagedModules = realpathSync(staged.modulesByPackage[packagePath]);
    const expectedModules = resolve(generationRoot, packagePath, "node_modules");
    const stagedStat = lstatSync(stagedModules);
    if (
      stagedModules !== expectedModules ||
      !stagedStat.isDirectory() ||
      stagedStat.isSymbolicLink()
    ) {
      throw new Error(`Governed package generation layout drifted: ${packagePath}.`);
    }
    publicationTargets[packagePath] = stagedModules;
  }
  for (const packagePath of PACKAGES) {
    const targetModules = resolve(root, packagePath, "node_modules");
    try {
      symlinkSync(publicationTargets[packagePath], targetModules, "dir");
      fsyncDirectory(dirname(targetModules));
    } catch (error) {
      throw new Error(
        `Creation-only governed package publication failed for ${targetModules}: ${error instanceof Error ? error.message : String(error)}.`,
        { cause: error },
      );
    }
  }
}

function assertMissingTypeboxFailureBeforePeerRepair(modulesByPackage) {
  const consumer = "packages/pi-interaction/pi-trigger-adapter";
  const parentManifest = resolve(modulesByPackage[consumer], ".tryinget-typebox-probe.cjs");
  const probe = spawnSync(
    process.execPath,
    [
      "-e",
      `const { createRequire } = require("node:module");
try {
  const resolvedPath = createRequire(process.argv[1]).resolve("typebox");
  console.log(JSON.stringify({ ok: true, resolvedPath }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, code: error?.code, message: error?.message }));
  process.exitCode = 42;
}`,
      parentManifest,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  let observed;
  try {
    observed = JSON.parse((probe.stdout ?? "").trim());
  } catch {
    throw new Error(
      `Missing-peer probe produced invalid output: ${(probe.stderr || probe.stdout || "").trim()}`,
    );
  }
  if (probe.status === 0 && observed.ok === true) {
    throw new Error(
      `Missing-peer reproduction failed: trigger-adapter unexpectedly resolved typebox at ${observed.resolvedPath}.`,
    );
  }
  if (
    probe.status !== 42 ||
    observed.ok !== false ||
    observed.code !== "MODULE_NOT_FOUND" ||
    typeof observed.message !== "string" ||
    !observed.message.includes("Cannot find module 'typebox'")
  ) {
    throw new Error(
      `Missing-peer probe failed for an unexpected reason: ${observed.code ?? "unknown"} ${observed.message ?? probe.stderr ?? ""}`,
    );
  }
  return {
    consumer,
    specifier: "typebox",
    code: "MODULE_NOT_FOUND",
    phase: "before_peer_repair",
  };
}

function removeLinkedPackageFromHiddenLock(nodeModulesRoot, packageName) {
  const hiddenLockPath = resolve(nodeModulesRoot, ".package-lock.json");
  const hiddenLock = JSON.parse(readFileSync(hiddenLockPath, "utf8"));
  const lockPath = `node_modules/${packageName}`;
  for (const candidate of Object.keys(hiddenLock.packages ?? {})) {
    if (candidate === lockPath || candidate.startsWith(`${lockPath}/node_modules/`)) {
      delete hiddenLock.packages[candidate];
    }
  }
  writeFileSync(hiddenLockPath, `${JSON.stringify(hiddenLock, null, 2)}\n`, "utf8");
}

function linkPackage(nodeModulesRoot, packageName, ownerRoot) {
  const parts = packageName.split("/");
  const linkPath = resolve(nodeModulesRoot, ...parts);
  mkdirSync(dirname(linkPath), { recursive: true });
  removeLinkedPackageFromHiddenLock(nodeModulesRoot, packageName);
  rmSync(linkPath, { recursive: true, force: true });
  symlinkSync(ownerRoot, linkPath, "dir");
}

function materializeVerifiedCacheTarballs(peerLayer, npm, npmEffects) {
  const tarballRoot = resolve(peerLayer, "tarballs");
  mkdirSync(tarballRoot, { recursive: true });
  const tarballs = {};
  for (const [packageName, expected] of Object.entries(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS)) {
    const packedName = runNpmEffect(
      npm,
      `cache_pack:${packageName}`,
      [
        "pack",
        "--offline",
        "--silent",
        "--ignore-scripts",
        "--pack-destination",
        tarballRoot,
        expected.url,
      ],
      peerLayer,
      npmEffects,
    );
    const filePath = realpathSync(resolve(tarballRoot, packedName));
    const verified = verifyGovernedRuntimeFileIntegrity(filePath, expected.integrity);
    tarballs[packageName] = {
      version: expected.version,
      url: expected.url,
      integrity: expected.integrity,
      filePath,
      byteLength: verified.byteLength,
    };
  }
  return tarballs;
}

function materializePeerLayer(sourceRoot, modulesByPackage, verifiedHostCache, npm, npmEffects) {
  const orchestratorModules = modulesByPackage["packages/pi-society-orchestrator"];
  const peerLayer = resolve(orchestratorModules, ".tryinget-governed-peer-layer");
  if (pathEntryExists(peerLayer)) throw new Error("Staged orchestrator peer layer already exists.");
  mkdirSync(peerLayer, { recursive: true });
  const tarballs = verifiedHostCache
    ? materializeVerifiedCacheTarballs(peerLayer, npm, npmEffects)
    : null;
  const hostDependencies = Object.fromEntries(
    Object.entries(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS).map(([packageName, expected]) => [
      packageName,
      tarballs ? `file:tarballs/${basename(tarballs[packageName].filePath)}` : expected.version,
    ]),
  );
  const hostOverrides = Object.fromEntries(
    ["@earendil-works/pi-ai", "@earendil-works/pi-agent-core", "@earendil-works/pi-tui"].map(
      (packageName) => [packageName, hostDependencies[packageName]],
    ),
  );
  writeFileSync(
    resolve(peerLayer, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        dependencies: {
          typebox: TYPEBOX_VERSION,
          ...hostDependencies,
        },
        overrides: hostOverrides,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  runNpmEffect(
    npm,
    "peer_install",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    peerLayer,
    npmEffects,
    { stdio: "inherit" },
  );
  const typeboxRoot = realpathSync(resolve(peerLayer, "node_modules/typebox"));
  const typeboxPackage = JSON.parse(readFileSync(resolve(typeboxRoot, "package.json"), "utf8"));
  if (typeboxPackage.version !== TYPEBOX_VERSION) {
    throw new Error(
      `Peer layer installed typebox ${typeboxPackage.version}, expected ${TYPEBOX_VERSION}.`,
    );
  }
  const hiddenLock = resolve(peerLayer, "node_modules/.package-lock.json");
  if (!existsSync(hiddenLock))
    throw new Error("Peer layer npm install produced no hidden lock evidence.");
  const lock = JSON.parse(readFileSync(hiddenLock, "utf8"));
  const locked = lock.packages?.["node_modules/typebox"];
  if (locked?.version !== TYPEBOX_VERSION || locked?.integrity !== TYPEBOX_INTEGRITY) {
    throw new Error(
      "Peer layer typebox version/integrity does not match the pinned runtime contract.",
    );
  }
  const finalPeerLayer = resolve(sourceRoot, PEER_LAYER_RELATIVE_PATH);
  const finalTypeboxRoot = resolve(finalPeerLayer, "node_modules/typebox");
  for (const consumer of TYPEBOX_CONSUMERS) {
    linkPackage(modulesByPackage[consumer], "typebox", finalTypeboxRoot);
  }
  for (const [packageName, contract] of Object.entries(GOVERNED_RUNTIME_HOST_PEERS)) {
    const finalPackageRoot = resolve(finalPeerLayer, "node_modules", ...packageName.split("/"));
    for (const consumer of contract.consumers) {
      linkPackage(modulesByPackage[consumer], packageName, finalPackageRoot);
    }
  }
}

function alignClosedLocalOwners(sourceRoot, modulesByPackage) {
  const seen = new Set();
  for (const definition of LOCAL_EDGES) {
    const key = `${definition.consumer}\0${definition.expectedOwnerName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    linkPackage(
      modulesByPackage[definition.consumer],
      definition.expectedOwnerName,
      resolve(sourceRoot, definition.expectedOwnerPath),
    );
  }
}

function materializeAscRuntime(sourceRoot, sourceCommit, npm) {
  const ascRoot = resolve(sourceRoot, "packages/pi-autonomous-session-control");
  const distRoot = resolve(ascRoot, "dist");
  if (pathEntryExists(distRoot)) throw new Error("Fresh ASC runtime output appeared before build.");
  const receipts = [];
  const environment = governedRuntimeAscBuildEnvironment(npm);
  const environmentDigest = createHash("sha256").update(JSON.stringify(environment)).digest("hex");
  for (const ordinal of [1, 2]) {
    const executables = verifyGovernedRuntimeNpmExecutables(npm);
    run(executables.nodeExecutable.realpath, ["scripts/build-runtime.mjs"], {
      cwd: ascRoot,
      env: environment,
      stdio: "inherit",
    });
    verifyGovernedRuntimeNpmExecutables(npm);
    const derivation = inspectGovernedRuntimeAscRuntime(sourceRoot);
    const receipt = {
      schema: "pi.governed-asc-build-pass.v1",
      ordinal,
      buildNonce: randomUUID(),
      sourceCommit,
      invocation: {
        executable: executables.nodeExecutable,
        argv: ["scripts/build-runtime.mjs"],
        cwdRole: "clean_output_rebuild",
        environment,
        environmentDigest,
      },
      inputHashes: derivation.inputHashes,
      inputDigest: derivation.inputDigest,
      compiler: derivation.compiler,
      outputEntries: derivation.outputEntries,
      treeDigest: derivation.treeDigest,
    };
    writeJsonDurably(
      resolve(sourceRoot, GOVERNED_RUNTIME_ASC_BUILD_RECEIPT_RELATIVE_PATHS[ordinal - 1]),
      receipt,
    );
    receipts.push(receipt);
    if (ordinal === 1) rmSync(distRoot, { recursive: true, force: false });
  }
  const comparable = ({ inputHashes, inputDigest, compiler, outputEntries, treeDigest }) => ({
    inputHashes,
    inputDigest,
    compiler,
    outputEntries,
    treeDigest,
  });
  if (!sameObject(comparable(receipts[0]), comparable(receipts[1]))) {
    throw new Error("ASC runtime build is not reproducible across two clean derivations.");
  }
  return verifyGovernedRuntimeAscRuntime(sourceRoot, receipts, npm);
}

function resolveRuntimeGraph(sourceRoot) {
  return resolveGovernedRuntimeGraph(sourceRoot);
}

function verifyTypebox(sourceRoot) {
  return verifyGovernedRuntimeTypebox(sourceRoot);
}

async function verifyAutoresearchTriggerSurface(sourceRoot) {
  const module = await import(
    pathToFileURL(
      resolve(sourceRoot, "packages/pi-autoresearch/extensions/pi-autoresearch/triggerPicker.ts"),
    ).href
  );
  const surface = await module.loadAutoresearchTriggerSurface();
  if (!surface || typeof surface.registerPickerInteraction !== "function") {
    throw new Error(
      "Autoresearch trigger surface is not functional after runtime materialization.",
    );
  }
}

function manifestPath(sourceRoot) {
  return resolve(sourceRoot, MANIFEST_RELATIVE_PATH);
}

function verifyCanaryProductionMaterialization(
  sourceRoot,
  selectedManifestPath = manifestPath(sourceRoot),
) {
  const sourceCommit = git(sourceRoot, ["rev-parse", "HEAD"]);
  return verifyGovernedRuntimeMaterialization(sourceRoot, sourceCommit, selectedManifestPath);
}

function requireExpectedCommit(options) {
  if (!/^[a-f0-9]{40}$/u.test(options.expectedCommit ?? "")) {
    throw new Error(
      "materialize/verify/canary requires --expected-commit with one full 40-character SHA.",
    );
  }
  return options.expectedCommit;
}

async function materialize(options) {
  const identity = assertSourceIdentity(options.sourceRoot, requireExpectedCommit(options));
  const lock = acquireMaterializationLock(identity.sourceRoot);
  let effectsStarted = false;
  let failure;
  let quarantinePath;
  let manifest;
  try {
    assertFreshMaterializationRoot(identity.sourceRoot);
    const npm = inspectGovernedRuntimeNpmPolicy();
    const npmEffects = [];
    const beforeHashes = collectTrackedInputHashes(identity.sourceRoot);
    effectsStarted = true;
    const staged = materializePackageRuntimes(identity.sourceRoot, npm, npmEffects);
    const missingTypeboxFailure = assertMissingTypeboxFailureBeforePeerRepair(
      staged.modulesByPackage,
    );
    alignClosedLocalOwners(identity.sourceRoot, staged.modulesByPackage);
    materializePeerLayer(
      identity.sourceRoot,
      staged.modulesByPackage,
      options.verifiedHostCache,
      npm,
      npmEffects,
    );
    publishPackageRuntimes(identity.sourceRoot, staged);
    const nodeModulesLayout = verifyGovernedRuntimeNodeModulesLayout(identity.sourceRoot);
    forceMaterializationFailureForTest("after_package_publish");
    const hostSource = verifyGovernedRuntimeHostSource(identity.sourceRoot);
    const verifiedNpmEffects = verifyGovernedRuntimeNpmEffectReceipts(
      identity.sourceRoot,
      npm,
      hostSource,
      npmEffects,
    );
    const ascRuntime = materializeAscRuntime(identity.sourceRoot, identity.sourceCommit, npm);
    const afterHashes = collectTrackedInputHashes(identity.sourceRoot);
    if (!sameObject(beforeHashes, afterHashes)) {
      throw new Error("Materialization changed a tracked package manifest or lockfile.");
    }
    const graph = resolveRuntimeGraph(identity.sourceRoot);
    const typebox = verifyTypebox(identity.sourceRoot);
    const hostPeers = verifyGovernedRuntimeHostPeers(identity.sourceRoot, hostSource);
    const packageClosures = verifyGovernedRuntimePackageClosures(identity.sourceRoot);
    await verifyAutoresearchTriggerSurface(identity.sourceRoot);
    assertSourceIdentity(identity.sourceRoot, identity.sourceCommit);
    manifest = {
      schema: MANIFEST_SCHEMA,
      sourceRoot: identity.sourceRoot,
      sourceCommit: identity.sourceCommit,
      cleanliness: identity.cleanliness,
      nodeModulesLayout,
      missingTypeboxFailure,
      packageInputs: afterHashes,
      packages: PACKAGES,
      npm,
      npmEffects: verifiedNpmEffects,
      packageClosures,
      typebox,
      hostSource,
      hostPeers,
      ascRuntime,
      resolutions: graph.resolutions,
      runtimeRegistryRoot: graph.runtimeRegistryRoot,
      materializedAt: new Date().toISOString(),
    };
    writeJsonDurably(manifestPath(identity.sourceRoot), manifest);
  } catch (error) {
    failure = error;
  }

  const quarantine = () => {
    if (!effectsStarted || quarantinePath !== undefined) return;
    quarantinePath = quarantineMaterialization(identity.sourceRoot, identity.sourceCommit, failure);
  };
  if (failure !== undefined && effectsStarted) {
    try {
      quarantine();
    } catch (quarantineError) {
      failure = new AggregateError(
        [failure, quarantineError],
        "Governed runtime materialization failed and quarantine publication also failed.",
      );
    }
  }
  try {
    lock.release();
  } catch (releaseError) {
    failure =
      failure === undefined
        ? releaseError
        : new AggregateError(
            [failure, releaseError],
            "Governed runtime materialization and lock release both failed.",
          );
  }
  if (failure !== undefined && effectsStarted && quarantinePath === undefined) {
    try {
      quarantine();
    } catch (quarantineError) {
      failure = new AggregateError(
        [failure, quarantineError],
        "Governed runtime failure could not be durably quarantined.",
      );
    }
  }
  if (failure !== undefined) {
    if (!effectsStarted) throw failure;
    if (quarantinePath === undefined) throw failure;
    throw new Error(
      `${failure instanceof Error ? failure.message : String(failure)} Candidate is quarantined and must not be retried in place: ${quarantinePath}.`,
      { cause: failure },
    );
  }
  console.log(JSON.stringify({ ok: true, action: "materialize", manifest }, null, 2));
}

async function verify(options) {
  const identity = assertSourceIdentity(options.sourceRoot, requireExpectedCommit(options));
  const manifest = verifyGovernedRuntimeMaterialization(
    identity.sourceRoot,
    identity.sourceCommit,
    manifestPath(identity.sourceRoot),
  );
  await verifyAutoresearchTriggerSurface(identity.sourceRoot);
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "verify",
        sourceRoot: identity.sourceRoot,
        sourceCommit: identity.sourceCommit,
        runtimeRegistryRoot: manifest.runtimeRegistryRoot,
        resolutionCount: Object.keys(manifest.resolutions).length,
      },
      null,
      2,
    ),
  );
}

function createVaultFixture(root) {
  run("dolt", ["init", "-b", "main"], { cwd: root });
  const sql = [
    "CREATE TABLE schema_version (version INT PRIMARY KEY);",
    "INSERT INTO schema_version VALUES (9);",
    "CREATE TABLE executions (id INT PRIMARY KEY, entity_type VARCHAR(64), entity_id INT, entity_version INT, input_context TEXT, model VARCHAR(255), output_capture_mode VARCHAR(64), output_text TEXT, success BOOLEAN);",
    "CREATE TABLE feedback (execution_id INT, rating INT, notes TEXT, issues JSON);",
    "CREATE TABLE prompt_templates (",
    "id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, description TEXT, content TEXT,",
    "artifact_kind VARCHAR(32) NOT NULL, control_mode VARCHAR(32) NOT NULL,",
    "formalization_level VARCHAR(32) NOT NULL, owner_company VARCHAR(32) NOT NULL,",
    "visibility_companies JSON NOT NULL, controlled_vocabulary JSON,",
    "status VARCHAR(16) NOT NULL, export_to_pi BOOLEAN NOT NULL, version INT NOT NULL,",
    "UNIQUE KEY prompt_templates_name (name));",
    "INSERT INTO prompt_templates VALUES",
    "(1,'deep-review','Deep review','INERT DETERMINISTIC REVIEWER CANARY BYTES','cognitive','one_shot','workflow','core','[\"core\",\"software\"]',NULL,'active',true,2);",
  ].join(" ");
  run("dolt", ["sql", "-q", sql], { cwd: root });
}

function createPiHarness() {
  const tools = new Map();
  const commands = new Map();
  const events = new Map();
  const userMessages = [];
  let activeTools = ["read", "toolbox", "vault_dispatch_check", "dispatch_subagent"];
  let extensionPath = null;
  const pi = {
    registerTool(definition) {
      tools.set(definition.name, {
        ...definition,
        sourceInfo: {
          path: extensionPath,
          source: "extension",
          scope: "temporary",
          origin: "top-level",
        },
      });
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
    on(name, handler) {
      const handlers = events.get(name) ?? [];
      handlers.push(handler);
      events.set(name, handlers);
    },
    getAllTools() {
      return [...tools.values()].map(({ execute: _execute, ...metadata }) => metadata);
    },
    getActiveTools() {
      return [...activeTools];
    },
    setActiveTools(next) {
      const registered = new Set(tools.keys());
      activeTools = [...new Set(next)].filter((name) => registered.has(name) || name === "read");
    },
    sendUserMessage(message, options) {
      userMessages.push({ message, options });
    },
  };
  return {
    pi,
    tools,
    commands,
    events,
    userMessages,
    activeTools: () => [...activeTools],
    load(path, extension, options) {
      extensionPath = realpathSync(path);
      try {
        extension(pi, options);
      } finally {
        extensionPath = null;
      }
    },
  };
}

function deterministicWorkflowExecutorFactory() {
  return {
    async execute(input) {
      assert.equal(input.request.mode, "chain");
      assert.equal(input.request.steps.length, 1);
      assert.equal(input.request.steps[0].agent, "reviewer");
      assert.match(input.cognitiveToolContent, /INERT DETERMINISTIC REVIEWER CANARY BYTES/);
      assert.match(input.contextBody, /Vault handoff:/);
      return {
        runId: "governed-canary-workflow-run",
        mode: "chain",
        status: "done",
        steps: [{ index: 0, agent: "reviewer", status: "done" }],
        groups: [],
        aggregatedOutput: "deterministic reviewer canary completed",
        worktreeSummary: null,
      };
    },
  };
}

async function runGovernedDeepReviewHarness(options, { action, requireMaterializationManifest }) {
  if (!existsSync(run("sh", ["-lc", "command -v dolt"]))) {
    throw new Error("dolt is required for the governed deep-review canary.");
  }
  const sourceRoot = realpathSync(options.sourceRoot);
  const scratchParent = process.env.TMPDIR?.trim() || join(homedir(), ".local/state/pi-quests/tmp");
  mkdirSync(scratchParent, { recursive: true });
  const scratch = mkdtempSync(join(scratchParent, "governed-deep-review-canary-"));
  const vaultDir = resolve(scratch, "vault");
  const stateHome = resolve(scratch, "state");
  mkdirSync(vaultDir, { recursive: true });
  mkdirSync(stateHome, { recursive: true });
  const previous = {
    VAULT_DIR: process.env.VAULT_DIR,
    PI_COMPANY: process.env.PI_COMPANY,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
  };
  try {
    createVaultFixture(vaultDir);
    process.env.VAULT_DIR = vaultDir;
    process.env.PI_COMPANY = "software";
    process.env.XDG_STATE_HOME = stateHome;

    const harness = createPiHarness();
    const vaultExtensionPath = resolve(sourceRoot, "packages/pi-vault-client/extensions/vault.js");
    const ascExtensionPath = resolve(
      sourceRoot,
      "packages/pi-autonomous-session-control/extensions/self.ts",
    );
    const orchestratorExtensionPath = resolve(
      sourceRoot,
      "packages/pi-society-orchestrator/extensions/society-orchestrator.ts",
    );
    const toolboxExtensionPath = resolve(
      sourceRoot,
      "packages/pi-toolbox-discovery/extensions/toolbox.ts",
    );
    const vaultExtension = (await import(pathToFileURL(vaultExtensionPath).href)).default;
    const ascExtension = (await import(pathToFileURL(ascExtensionPath).href)).default;
    const orchestratorExtension = (await import(pathToFileURL(orchestratorExtensionPath).href))
      .default;
    const toolboxExtension = (await import(pathToFileURL(toolboxExtensionPath).href)).default;
    harness.load(vaultExtensionPath, vaultExtension);
    harness.load(ascExtensionPath, ascExtension);
    harness.load(orchestratorExtensionPath, orchestratorExtension, {
      workflowExecutorFactory: deterministicWorkflowExecutorFactory,
      governedDeepReviewPreflight: {
        requireMaterializationManifest,
        dispatchReceiptPath: resolve(scratch, "dispatch-handoffs.jsonl"),
      },
    });
    harness.load(toolboxExtensionPath, toolboxExtension);

    const toolbox = harness.tools.get("toolbox");
    assert.ok(toolbox, "real Toolbox owner tool did not register");
    const activation = await toolbox.execute(
      "canary-toolbox",
      {
        action: "activate",
        bundle: "orchestrator",
        profile: "orchestrator-gated",
        riskAcknowledged: true,
        riskJustification: "AK-4267 inert governed deep-review cross-package canary",
        autoContinue: false,
        pin: true,
      },
      undefined,
      undefined,
      { cwd: sourceRoot },
    );
    assert.equal(
      activation.details.ok,
      true,
      `${activation.content?.[0]?.text}\n${JSON.stringify(activation.details, null, 2)}`,
    );
    assert.ok(harness.activeTools().includes("vault_execute_template"));

    const visible = await import(
      pathToFileURL(resolve(sourceRoot, "packages/pi-little-helpers/src/visibleLoop.ts")).href
    );
    visible.resetVisibleLoopRuntimeForRecoveryTest();
    const executionBinding = {
      mode: "operator_objective",
      objective: "AK-4267 inert governed deep-review cross-package canary",
    };
    const config = visible.createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: sourceRoot,
      reportBack: "manual",
      commandName: "nexus-loop",
      runId: `ak-4267-canary-${Date.now().toString(36)}`,
      prompts: [visible.GOVERNED_DEEP_REVIEW_PROMPT, "nexus release canary"],
      executionBinding,
    });
    const configPath = visible.writeVisibleLoopRunConfig(config, process.env);
    const notifications = [];
    const ctx = {
      cwd: sourceRoot,
      model: { provider: "test", id: "deterministic" },
      ui: {
        notify(message, type) {
          notifications.push({ message, type });
        },
        setStatus() {},
        setWidget() {},
      },
      sessionManager: {
        getSessionId: () => "ak-4267-canary-session",
        getSessionFile: () => resolve(scratch, "session.jsonl"),
        getSessionName: () => "ak-4267-canary",
        getCwd: () => sourceRoot,
        getBranch: () => [],
      },
      hasPendingMessages: () => false,
    };

    await visible.startVisibleLoopChildRunner(configPath, harness.pi, ctx, process.env);
    assert.equal(harness.userMessages.length, 1, JSON.stringify(notifications));
    assert.match(harness.userMessages[0].message, /^EXECUTION BINDING — FAIL CLOSED/u);
    assert.match(harness.userMessages[0].message, /AK-4267 inert governed deep-review/u);
    assert.ok(harness.userMessages[0].message.endsWith(visible.GOVERNED_DEEP_REVIEW_PROMPT));
    visible.handleVisibleLoopMessageStart(
      { message: { role: "user", content: harness.userMessages[0].message } },
      harness.pi,
      ctx,
      process.env,
    );
    const objective = visible.GOVERNED_DEEP_REVIEW_OBJECTIVE;
    const tool = harness.tools.get("vault_execute_template");
    assert.ok(tool, "real orchestrator vault_execute_template tool did not register");
    visible.handleVisibleLoopToolExecutionStart(
      {
        toolCallId: "ak-4267-real-owner-call",
        toolName: "vault_execute_template",
        args: { template_name: "deep-review", objective },
      },
      harness.pi,
      ctx,
      process.env,
    );
    const result = await tool.execute(
      "ak-4267-real-owner-call",
      { template_name: "deep-review", objective },
      undefined,
      undefined,
      { cwd: sourceRoot, model: ctx.model },
    );
    assert.equal(result.details.ok, true, result.content?.[0]?.text);
    assert.equal(result.details.executionSurface, "workflow_execute");
    assert.equal(result.details.status, "done");
    assert.ok(result.details.handoffId);
    assert.ok(result.details.preflightNonce);
    assert.ok(result.details.preflightReceiptDigest);
    visible.handleVisibleLoopToolExecutionEnd(
      {
        toolCallId: "ak-4267-real-owner-call",
        toolName: "vault_execute_template",
        isError: false,
        result,
      },
      harness.pi,
      ctx,
      process.env,
    );
    visible.handleVisibleLoopAgentSettled(harness.pi, ctx, process.env);
    assert.equal(harness.userMessages.length, 2, "Nexus frontier must release exactly once");
    assert.match(harness.userMessages[1].message, /^EXECUTION BINDING — FAIL CLOSED/u);
    assert.ok(harness.userMessages[1].message.endsWith("nexus release canary"));
    visible.handleVisibleLoopAgentSettled(harness.pi, ctx, process.env);
    assert.equal(
      harness.userMessages.length,
      2,
      "duplicate settlement must not release Nexus twice",
    );

    const status = readFileSync(visible.getVisibleLoopStatusPath(config, process.env), "utf8");
    const preflightIndex = status.indexOf("governed_deep_review_preflight_succeeded");
    const childIndex = status.indexOf('"event":"child_started"');
    const promptIndex = status.indexOf('"event":"prompt_submitted"');
    assert.ok(preflightIndex >= 0 && childIndex > preflightIndex && promptIndex > childIndex);
    assert.match(status, /governed_deep_review_succeeded/);
    return {
      ok: true,
      action,
      ownerExecution: true,
      syntheticToolReceipt: false,
      productionMaterializationManifestEnforced: requireMaterializationManifest,
      handoffId: result.details.handoffId,
      preflightNonce: result.details.preflightNonce,
      registryId: result.details.preflightRegistryId,
      nexusReleaseCount: 1,
    };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function canary(options) {
  const sourceRoot = realpathSync(options.sourceRoot);
  assertSourceIdentity(sourceRoot, requireExpectedCommit(options));
  verifyCanaryProductionMaterialization(sourceRoot);
  let result;
  let harnessError;
  let postVerifyError;
  try {
    result = await runGovernedDeepReviewHarness(options, {
      action: "canary",
      requireMaterializationManifest: true,
    });
  } catch (error) {
    harnessError = error;
  } finally {
    try {
      verifyCanaryProductionMaterialization(sourceRoot);
    } catch (error) {
      postVerifyError = error;
    }
  }
  if (harnessError && postVerifyError) {
    throw new AggregateError(
      [harnessError, postVerifyError],
      "Governed canary and mandatory post-canary verification both failed.",
    );
  }
  if (harnessError) throw harnessError;
  if (postVerifyError) throw postVerifyError;
  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function test(options) {
  assert.equal(PACKAGES.length, 14);
  assert.equal(TYPEBOX_CONSUMERS.includes("packages/pi-interaction/pi-trigger-adapter"), true);
  assert.equal(run(process.execPath, ["-e", ""], { stdio: "inherit" }), "");
  assert.equal(
    LOCAL_EDGES.some(
      ({ consumer, specifier }) =>
        consumer === "packages/pi-society-orchestrator" &&
        specifier === "@tryinget/pi-vault-client/dispatch-runtime",
    ),
    true,
  );
  const missingManifestPath = resolve(
    process.env.TMPDIR?.trim() || join(homedir(), ".local/state/pi-quests/tmp"),
    `missing-governed-runtime-${process.pid}-${Date.now()}.json`,
  );
  assert.throws(
    () =>
      verifyCanaryProductionMaterialization(realpathSync(options.sourceRoot), missingManifestPath),
    (error) => error?.failureClass === "materialization_manifest_missing",
  );
  const result = await runGovernedDeepReviewHarness(options, {
    action: "development-test",
    requireMaterializationManifest: false,
  });
  console.log(JSON.stringify(result, null, 2));
}

function help() {
  console.log(`Usage:
  node scripts/governed-deep-review-canary.mjs materialize --source-root <clean-immutable-worktree> --expected-commit <full-sha> [--verified-host-cache]
  node scripts/governed-deep-review-canary.mjs verify --source-root <materialized-worktree> --expected-commit <full-sha>
  node scripts/governed-deep-review-canary.mjs canary --source-root <materialized-worktree> --expected-commit <full-sha>
  node scripts/governed-deep-review-canary.mjs test [--source-root <root>]

materialize is fresh-root/one-shot and never runs pi install, edits Pi settings, reloads Pi, or cleans another worktree; verify/canary are runtime-read-only.`);
}

const invokedAsMain =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedAsMain) {
  const options = parseArgs(process.argv.slice(2));
  try {
    if (options.action === "materialize") await materialize(options);
    else if (options.action === "verify") await verify(options);
    else if (options.action === "canary") await canary(options);
    else if (options.action === "test") await test(options);
    else help();
  } catch (error) {
    console.error(
      `governed-deep-review-canary: ${error instanceof Error ? error.stack || error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
