// summary: governed runtime materialization module (split from governed-runtime-materialization.ts).
// read_when:
//   - changing governed runtime peer-closure verification.

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
  GOVERNED_RUNTIME_ASC_REGISTRY_OWNER,
  GOVERNED_RUNTIME_HOST_CACHE_TARBALLS,
  GOVERNED_RUNTIME_HOST_VERSION,
  GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH,
  governedRuntimeCacheTarballName,
} from "./governed-runtime-constants.ts";
import {
  assertNoEscapingSymlinks,
  codingAgentShrinkwrapPackageName,
  digestDirectory,
  isExactCodingAgentShrinkwrapEntry,
  ownerPackageRoot,
  pathInside,
  readJsonNoFollow,
  readRegularFileNoFollow,
  sameJson,
  sha256,
  verifyGovernedRuntimeFileIntegrity,
} from "./governed-runtime-fs-integrity.ts";
import { resolveCurrentPiBinaryPath } from "./governed-runtime-npm-policy.ts";
import type {
  GovernedRuntimeCacheTarballProof,
  GovernedRuntimeHostPackageProof,
  GovernedRuntimeHostSourceProof,
  GovernedRuntimePeerClosureProof,
} from "./governed-runtime-proofs.ts";
import { GovernedRuntimeMaterializationError } from "./governed-runtime-proofs.ts";

export function verifyGovernedRuntimePeerClosure(
  sourceRoot: string,
): GovernedRuntimePeerClosureProof {
  const root = realpathSync(sourceRoot);
  const peerLayer = realpathSync(resolve(root, GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH));
  const packageManifestPath = resolve(peerLayer, "package.json");
  const packageLockPath = resolve(peerLayer, "package-lock.json");
  const nodeModulesRoot = resolve(peerLayer, "node_modules");
  const hiddenLockPath = resolve(nodeModulesRoot, ".package-lock.json");
  const packageManifestBytes = readRegularFileNoFollow(
    packageManifestPath,
    "materialization_closure_lock_invalid",
  );
  const packageLockBytes = readRegularFileNoFollow(
    packageLockPath,
    "materialization_closure_lock_invalid",
  );
  const hiddenLockBytes = readRegularFileNoFollow(
    hiddenLockPath,
    "materialization_closure_lock_invalid",
  );
  const nodeModulesStat = lstatSync(nodeModulesRoot);
  if (!nodeModulesStat.isDirectory() || nodeModulesStat.isSymbolicLink()) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_closure_root_invalid",
      "Governed runtime closure node_modules must be a real directory.",
    );
  }
  assertNoEscapingSymlinks(nodeModulesRoot);
  const hiddenLock = JSON.parse(hiddenLockBytes.toString("utf8")) as {
    lockfileVersion?: number;
    packages?: Record<
      string,
      { version?: string; integrity?: string; resolved?: string; link?: boolean }
    >;
  };
  if (hiddenLock.lockfileVersion !== 3) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_closure_lock_invalid",
      "Governed peer closure hidden lock must use lockfileVersion 3.",
    );
  }
  const installed = Object.entries(hiddenLock.packages ?? {}).filter(([key]) => Boolean(key));
  const lockedPackagePaths = installed
    .map(([key, value]) => {
      if (
        value.link ||
        !value.version ||
        (!value.integrity && !isExactCodingAgentShrinkwrapEntry(key, value))
      ) {
        throw new GovernedRuntimeMaterializationError(
          "materialization_closure_package_proof_missing",
          `Installed closure package lacks exact SRI or the one bounded Pi 0.84.3 coding-agent shrinkwrap identity: ${key}.`,
        );
      }
      return key;
    })
    .sort();
  const physicalPackagePaths: string[] = [];
  const inspectPhysicalPackages = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      const absolutePath = resolve(directory, entry.name);
      const relativePath = relative(nodeModulesRoot, absolutePath);
      const topLevel = relativePath.split(sep)[0];
      if (topLevel === ".bin" || topLevel.startsWith(".tryinget-")) continue;
      const packageManifestPath = resolve(absolutePath, "package.json");
      if (existsSync(packageManifestPath)) {
        const owner = readJsonNoFollow<{ name?: string; version?: string }>(
          packageManifestPath,
          "materialization_closure_package_manifest_invalid",
        );
        const lockPath = `node_modules/${relativePath.split(sep).join("/")}`;
        const locked = hiddenLock.packages?.[lockPath];
        if (locked && owner.version !== locked.version) {
          throw new GovernedRuntimeMaterializationError(
            "materialization_closure_package_manifest_invalid",
            `Installed closure manifest version does not match its hidden lock: ${lockPath}.`,
          );
        }
        if (
          locked &&
          !locked.integrity &&
          (!isExactCodingAgentShrinkwrapEntry(lockPath, locked) ||
            owner.name !== codingAgentShrinkwrapPackageName(lockPath))
        ) {
          throw new GovernedRuntimeMaterializationError(
            "materialization_closure_package_proof_missing",
            `Installed closure shrinkwrap owner drifted: ${lockPath}.`,
          );
        }
        physicalPackagePaths.push(lockPath);
        const nestedNodeModules = resolve(absolutePath, "node_modules");
        if (existsSync(nestedNodeModules)) {
          const nestedStat = lstatSync(nestedNodeModules);
          if (!nestedStat.isDirectory() || nestedStat.isSymbolicLink()) {
            throw new GovernedRuntimeMaterializationError(
              "materialization_closure_root_invalid",
              `Peer nested node_modules must be a physical directory: ${nestedNodeModules}.`,
            );
          }
          inspectPhysicalPackages(nestedNodeModules);
        }
      } else {
        inspectPhysicalPackages(absolutePath);
      }
    }
  };
  inspectPhysicalPackages(nodeModulesRoot);
  physicalPackagePaths.sort();
  if (!sameJson(lockedPackagePaths, physicalPackagePaths)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_closure_enumeration_mismatch",
      "Governed peer hidden lock does not exactly enumerate its physical package closure.",
    );
  }
  const symlinks: Array<{ path: string; target: string; mode: number }> = [];
  const inspectSymlinks = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        symlinks.push({
          path: relative(nodeModulesRoot, absolutePath).split(sep).join("/"),
          target: realpathSync(absolutePath),
          mode: lstatSync(absolutePath).mode & 0o7777,
        });
      } else if (entry.isDirectory()) {
        inspectSymlinks(absolutePath);
      }
    }
  };
  inspectSymlinks(nodeModulesRoot);
  symlinks.sort((left, right) => left.path.localeCompare(right.path));
  return {
    root: peerLayer,
    packageManifestDigest: sha256(packageManifestBytes),
    packageLockDigest: sha256(packageLockBytes),
    hiddenLockDigest: sha256(hiddenLockBytes),
    installedPackageCount: installed.length,
    nodeModulesMode: nodeModulesStat.mode & 0o7777,
    lockedPackagePaths,
    physicalPackagePaths,
    symlinks,
    treeDigest: digestDirectory(nodeModulesRoot),
  };
}

interface GovernedRuntimePackageLockEntry {
  name?: string;
  version?: string;
  integrity?: string;
  resolved?: string;
  link?: boolean;
}

export interface GovernedRuntimePackageLock {
  lockfileVersion?: number;
  packages?: Record<
    string,
    GovernedRuntimePackageLockEntry & { dependencies?: Record<string, string> }
  >;
}

export interface GovernedRuntimePeerManifest {
  dependencies?: Record<string, string>;
}

export function classifyGovernedRuntimeAscRegistryOwnerEvidence(
  packageManifest: GovernedRuntimePeerManifest,
  regularLock: GovernedRuntimePackageLock,
  hiddenLock: GovernedRuntimePackageLock,
): {
  name: typeof GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name;
  version: typeof GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.version;
  selector: typeof GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.selector;
  url: typeof GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.url;
  integrity: typeof GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.integrity;
} {
  const expected = GOVERNED_RUNTIME_ASC_REGISTRY_OWNER;
  const lockPath = `node_modules/${expected.name}`;
  const regularRoot = regularLock.packages?.[""];
  const regular = regularLock.packages?.[lockPath];
  const hidden = hiddenLock.packages?.[lockPath];
  if (
    regularLock.lockfileVersion !== 3 ||
    hiddenLock.lockfileVersion !== 3 ||
    packageManifest.dependencies?.[expected.name] !== expected.selector ||
    regularRoot?.dependencies?.[expected.name] !== expected.selector ||
    regular?.link === true ||
    hidden?.link === true ||
    regular?.version !== expected.version ||
    hidden?.version !== expected.version ||
    regular.resolved !== expected.url ||
    hidden.resolved !== expected.url ||
    regular.integrity !== expected.integrity ||
    hidden.integrity !== expected.integrity
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_registry_owner_lock_mismatch",
      `ASC registry handoff must remain atomic: ${expected.name}=${expected.selector} must resolve as exact ${expected.version} with one registry URL/SRI in the manifest plus regular and hidden locks. Coordinate any movement with AK #4883.`,
    );
  }
  return {
    name: expected.name,
    version: expected.version,
    selector: expected.selector,
    url: expected.url,
    integrity: expected.integrity,
  };
}

export function classifyGovernedRuntimeHostLockEvidence(
  packageManifest: GovernedRuntimePeerManifest,
  regularLock: GovernedRuntimePackageLock,
  hiddenLock: GovernedRuntimePackageLock,
): {
  kind: "registry_resolution" | "verified_cache_tarballs";
  packages: Record<string, { selector: string; regularResolved: string; hiddenResolved: string }>;
} {
  if (regularLock.lockfileVersion !== 3 || hiddenLock.lockfileVersion !== 3) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_host_lock_invalid",
      "Governed host regular and hidden locks must both use lockfileVersion 3.",
    );
  }
  const modes = new Set<"registry_resolution" | "verified_cache_tarballs">();
  const packages: Record<
    string,
    { selector: string; regularResolved: string; hiddenResolved: string }
  > = {};
  for (const [packageName, expected] of Object.entries(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS)) {
    const lockKey = `node_modules/${packageName}`;
    for (const key of new Set([
      ...Object.keys(regularLock.packages ?? {}),
      ...Object.keys(hiddenLock.packages ?? {}),
    ])) {
      if (key !== lockKey && key.endsWith(`/node_modules/${packageName}`)) {
        const regularDuplicate = regularLock.packages?.[key];
        const hiddenDuplicate = hiddenLock.packages?.[key];
        if (
          regularDuplicate?.link ||
          hiddenDuplicate?.link ||
          regularDuplicate?.version !== expected.version ||
          hiddenDuplicate?.version !== expected.version ||
          regularDuplicate.resolved !== expected.url ||
          hiddenDuplicate.resolved !== expected.url ||
          (regularDuplicate.integrity !== undefined &&
            regularDuplicate.integrity !== expected.integrity) ||
          (hiddenDuplicate.integrity !== undefined &&
            hiddenDuplicate.integrity !== expected.integrity)
        ) {
          throw new GovernedRuntimeMaterializationError(
            "materialization_host_lock_duplicate",
            `Governed host lock contains a non-identical nested duplicate for ${packageName}: ${key}.`,
          );
        }
      }
    }
    const selector = packageManifest.dependencies?.[packageName];
    const rootSelector = regularLock.packages?.[""]?.dependencies?.[packageName];
    const regular = regularLock.packages?.[lockKey];
    const hidden = hiddenLock.packages?.[lockKey];
    if (
      !selector ||
      rootSelector !== selector ||
      regular?.link ||
      hidden?.link ||
      regular?.version !== expected.version ||
      hidden?.version !== expected.version ||
      regular.integrity !== expected.integrity ||
      hidden.integrity !== expected.integrity ||
      !regular.resolved ||
      !hidden.resolved
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_host_lock_identity_mismatch",
        `Governed host lock identity drifted for ${packageName}.`,
      );
    }
    const tarballName = governedRuntimeCacheTarballName(packageName, expected.version);
    const cacheSelector = `file:tarballs/${tarballName}`;
    let mode: "registry_resolution" | "verified_cache_tarballs";
    if (
      selector === expected.version &&
      regular.resolved === expected.url &&
      hidden.resolved === expected.url
    ) {
      mode = "registry_resolution";
    } else if (
      selector === cacheSelector &&
      regular.resolved === cacheSelector &&
      hidden.resolved === cacheSelector
    ) {
      mode = "verified_cache_tarballs";
    } else {
      throw new GovernedRuntimeMaterializationError(
        "materialization_host_lock_resolution_mismatch",
        `Governed host lock resolution is neither exact registry nor exact verified-cache form for ${packageName}.`,
      );
    }
    modes.add(mode);
    packages[packageName] = {
      selector,
      regularResolved: regular.resolved,
      hiddenResolved: hidden.resolved,
    };
  }
  if (modes.size !== 1) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_host_lock_mixed_provenance",
      "Governed host lock mixes registry and cache provenance across the four Pi packages.",
    );
  }
  const [kind] = [...modes];
  if (!kind) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_host_lock_empty",
      "Governed host lock contains no pinned Pi packages.",
    );
  }
  return { kind, packages };
}

export function verifyGovernedRuntimeHostSource(
  sourceRoot: string,
): GovernedRuntimeHostSourceProof {
  const root = realpathSync(sourceRoot);
  const peerLayer = realpathSync(resolve(root, GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH));
  const packageManifest = readJsonNoFollow<GovernedRuntimePeerManifest>(
    resolve(peerLayer, "package.json"),
    "materialization_host_lock_invalid",
  );
  const regularLock = readJsonNoFollow<GovernedRuntimePackageLock>(
    resolve(peerLayer, "package-lock.json"),
    "materialization_host_lock_invalid",
  );
  const hiddenLock = readJsonNoFollow<GovernedRuntimePackageLock>(
    resolve(peerLayer, "node_modules/.package-lock.json"),
    "materialization_host_lock_invalid",
  );
  const lockEvidence = classifyGovernedRuntimeHostLockEvidence(
    packageManifest,
    regularLock,
    hiddenLock,
  );
  const packages: Record<string, GovernedRuntimeHostPackageProof> = {};
  for (const [packageName, expected] of Object.entries(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS)) {
    const rawPackageRoot = resolve(peerLayer, "node_modules", ...packageName.split("/"));
    const stat = lstatSync(rawPackageRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_host_package_root_invalid",
        `Governed host package must be a physical directory: ${packageName}.`,
      );
    }
    const packageRoot = realpathSync(rawPackageRoot);
    const owner = ownerPackageRoot(resolve(packageRoot, "package.json"));
    if (
      packageRoot !== rawPackageRoot ||
      owner.root !== packageRoot ||
      owner.name !== packageName ||
      owner.version !== expected.version
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_host_package_identity_mismatch",
        `Governed host physical package identity drifted for ${packageName}.`,
      );
    }
    const locked = lockEvidence.packages[packageName];
    packages[packageName] = {
      version: expected.version,
      integrity: expected.integrity,
      registryUrl: expected.url,
      selector: locked.selector,
      regularResolved: locked.regularResolved,
      hiddenResolved: locked.hiddenResolved,
      root: packageRoot,
      treeDigest: digestDirectory(packageRoot),
    };
  }
  const closure = verifyGovernedRuntimePeerClosure(root);
  if (lockEvidence.kind === "registry_resolution") {
    return { kind: "registry_resolution", packages, closure };
  }
  const activePiBinaryPath = resolveCurrentPiBinaryPath();
  const activePiVersion = execFileSync(activePiBinaryPath, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (activePiVersion !== GOVERNED_RUNTIME_HOST_VERSION) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_active_pi_version_mismatch",
      `Cache-backed materialization requires active Pi ${GOVERNED_RUNTIME_HOST_VERSION}; observed ${activePiVersion || "unknown"}.`,
    );
  }
  const rawTarballRoot = resolve(peerLayer, "tarballs");
  const tarballRootStat = lstatSync(rawTarballRoot);
  if (!tarballRootStat.isDirectory() || tarballRootStat.isSymbolicLink()) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_cache_tarball_root_mismatch",
      "Cache-backed host tarballs must live in one physical peer-layer directory.",
    );
  }
  const tarballRoot = realpathSync(rawTarballRoot);
  const tarballs: Record<string, GovernedRuntimeCacheTarballProof> = {};
  for (const [packageName, expected] of Object.entries(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS)) {
    const tarballName = governedRuntimeCacheTarballName(packageName, expected.version);
    const rawFilePath = resolve(tarballRoot, tarballName);
    const verified = verifyGovernedRuntimeFileIntegrity(rawFilePath, expected.integrity);
    const filePath = realpathSync(rawFilePath);
    if (!pathInside(tarballRoot, filePath) || filePath !== rawFilePath) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_cache_tarball_root_mismatch",
        `Cache-backed host tarball is not a physical child of its closure: ${rawFilePath}.`,
      );
    }
    tarballs[packageName] = {
      version: expected.version,
      url: expected.url,
      integrity: expected.integrity,
      filePath,
      byteLength: verified.byteLength,
    };
  }
  return {
    kind: "verified_cache_tarballs",
    activePiBinaryPath,
    activePiVersion,
    tarballs,
    packages,
    closure,
  };
}
