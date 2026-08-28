// summary: governed runtime materialization module (split from governed-runtime-materialization.ts).
// read_when:
//   - changing governed runtime package-closures verification.

import { existsSync, lstatSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
  GOVERNED_RUNTIME_LOCAL_EDGES,
  GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX,
  GOVERNED_RUNTIME_PACKAGES,
} from "./governed-runtime-constants.ts";
import {
  digestDirectory,
  pathInside,
  readJsonNoFollow,
  readRegularFileNoFollow,
  sameJson,
  sha256,
} from "./governed-runtime-fs-integrity.ts";
import type { GovernedRuntimePackageLock } from "./governed-runtime-peer-closure.ts";
import type { GovernedRuntimePackageClosureProof } from "./governed-runtime-proofs.ts";
import { GovernedRuntimeMaterializationError } from "./governed-runtime-proofs.ts";

export function verifyGovernedRuntimePackageClosures(
  sourceRoot: string,
): Record<string, GovernedRuntimePackageClosureProof> {
  const root = realpathSync(sourceRoot);
  const localOwnerNames = new Set(
    GOVERNED_RUNTIME_LOCAL_EDGES.map(({ expectedOwnerName }) => expectedOwnerName),
  );
  const proofs: Record<string, GovernedRuntimePackageClosureProof> = {};
  const generationParentPath = resolve(root, "node_modules");
  const generationParentStat = lstatSync(generationParentPath);
  if (!generationParentStat.isDirectory() || generationParentStat.isSymbolicLink()) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_package_generation_root_invalid",
      "Governed package generation parent must be a physical root node_modules directory.",
    );
  }
  const generationParent = realpathSync(generationParentPath);
  let selectedGenerationRoot: string | undefined;
  for (const packagePath of GOVERNED_RUNTIME_PACKAGES) {
    const rawNodeModulesRoot = resolve(root, packagePath, "node_modules");
    const publicationStat = lstatSync(rawNodeModulesRoot);
    if (!publicationStat.isSymbolicLink()) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_package_publication_invalid",
        `Published package node_modules must be a creation-only symlink: ${packagePath}.`,
      );
    }
    const publicationTarget = readlinkSync(rawNodeModulesRoot);
    const nodeModulesRoot = realpathSync(rawNodeModulesRoot);
    const nodeModulesStat = lstatSync(nodeModulesRoot);
    const generationRelativeParts = relative(generationParent, nodeModulesRoot).split(sep);
    const [generationName, ...packageRelativeParts] = generationRelativeParts;
    const generationId = generationName?.slice(GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX.length);
    const expectedPackageRelativeParts = [...packagePath.split("/"), "node_modules"];
    if (
      publicationTarget !== nodeModulesRoot ||
      !nodeModulesStat.isDirectory() ||
      nodeModulesStat.isSymbolicLink() ||
      !pathInside(generationParent, nodeModulesRoot) ||
      !generationName?.startsWith(GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        generationId ?? "",
      ) ||
      !sameJson(packageRelativeParts, expectedPackageRelativeParts)
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_package_publication_invalid",
        `Published package node_modules does not bind the retained governed generation: ${packagePath}.`,
      );
    }
    const generationRoot = resolve(generationParent, generationName);
    if (selectedGenerationRoot !== undefined && selectedGenerationRoot !== generationRoot) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_package_generation_mixed",
        "Published package node_modules links span more than one governed generation.",
      );
    }
    selectedGenerationRoot = generationRoot;
    const generationStat = lstatSync(generationRoot);
    if (!generationStat.isDirectory() || generationStat.isSymbolicLink()) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_package_generation_root_invalid",
        `Governed package generation must be a physical directory: ${generationRoot}.`,
      );
    }
    const hiddenLockPath = resolve(nodeModulesRoot, ".package-lock.json");
    const hiddenLockBytes = readRegularFileNoFollow(
      hiddenLockPath,
      "materialization_package_closure_lock_invalid",
    );
    const hiddenLock = JSON.parse(hiddenLockBytes.toString("utf8")) as GovernedRuntimePackageLock;
    if (hiddenLock.lockfileVersion !== 3) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_package_closure_lock_invalid",
        `Published package hidden lock must use lockfileVersion 3: ${packagePath}.`,
      );
    }
    const localMetadataPaths: Array<{ path: string; name: string; version: string }> = [];
    const lockedPackagePaths = Object.entries(hiddenLock.packages ?? {})
      .filter(([lockPath]) => Boolean(lockPath))
      .flatMap(([lockPath, locked]) => {
        if (!lockPath.startsWith("node_modules/")) {
          if (
            lockPath.startsWith("../") &&
            locked.name &&
            localOwnerNames.has(locked.name) &&
            locked.version
          ) {
            localMetadataPaths.push({ path: lockPath, name: locked.name, version: locked.version });
            return [];
          }
          throw new GovernedRuntimeMaterializationError(
            "materialization_package_closure_lock_invalid",
            `Published package hidden lock has unsupported non-physical metadata: ${packagePath}:${lockPath}.`,
          );
        }
        if (locked.link || !locked.version || !locked.integrity) {
          throw new GovernedRuntimeMaterializationError(
            "materialization_package_closure_lock_invalid",
            `Published package hidden lock lacks physical version/SRI evidence: ${packagePath}:${lockPath}.`,
          );
        }
        return [lockPath];
      })
      .sort();
    localMetadataPaths.sort((left, right) => left.path.localeCompare(right.path));
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
          const owner = readJsonNoFollow<{ name?: string }>(
            packageManifestPath,
            "materialization_package_closure_owner_invalid",
          );
          if (owner.name && localOwnerNames.has(owner.name)) {
            throw new GovernedRuntimeMaterializationError(
              "materialization_nested_local_owner_copy",
              `Published package contains a physical nested local owner copy: ${packagePath}:${relativePath}:${owner.name}.`,
            );
          }
          physicalPackagePaths.push(`node_modules/${relativePath.split(sep).join("/")}`);
          const nestedNodeModules = resolve(absolutePath, "node_modules");
          if (existsSync(nestedNodeModules)) {
            const nestedStat = lstatSync(nestedNodeModules);
            if (!nestedStat.isDirectory() || nestedStat.isSymbolicLink()) {
              throw new GovernedRuntimeMaterializationError(
                "materialization_package_closure_root_invalid",
                `Nested node_modules must be a physical directory: ${nestedNodeModules}.`,
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
        "materialization_package_closure_enumeration_mismatch",
        `Published package hidden lock does not exactly enumerate its physical closure: ${packagePath}.`,
      );
    }
    const symlinks: Array<{ path: string; target: string; mode: number }> = [];
    const inspectSymlinks = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = resolve(directory, entry.name);
        if (entry.isSymbolicLink()) {
          const target = realpathSync(absolutePath);
          if (!pathInside(root, target)) {
            throw new GovernedRuntimeMaterializationError(
              "materialization_package_closure_symlink_escape",
              `Published package closure symlink escapes the selected source root: ${absolutePath} -> ${target}.`,
            );
          }
          symlinks.push({
            path: relative(nodeModulesRoot, absolutePath).split(sep).join("/"),
            target,
            mode: lstatSync(absolutePath).mode & 0o7777,
          });
        } else if (entry.isDirectory()) {
          const packageManifestPath = resolve(absolutePath, "package.json");
          if (existsSync(packageManifestPath)) {
            const owner = readJsonNoFollow<{ name?: string }>(
              packageManifestPath,
              "materialization_package_closure_owner_invalid",
            );
            if (owner.name && localOwnerNames.has(owner.name)) {
              throw new GovernedRuntimeMaterializationError(
                "materialization_nested_local_owner_copy",
                `Published package contains a physical nested local owner copy: ${packagePath}:${relative(nodeModulesRoot, absolutePath)}:${owner.name}.`,
              );
            }
          }
          inspectSymlinks(absolutePath);
        }
      }
    };
    inspectSymlinks(nodeModulesRoot);
    symlinks.sort((left, right) => left.path.localeCompare(right.path));
    proofs[packagePath] = {
      root: nodeModulesRoot,
      publication: {
        path: rawNodeModulesRoot,
        target: publicationTarget,
        generationRoot,
        mode: publicationStat.mode & 0o7777,
        targetMode: nodeModulesStat.mode & 0o7777,
        generationMode: generationStat.mode & 0o7777,
      },
      hiddenLockDigest: sha256(hiddenLockBytes),
      localMetadataPaths,
      lockedPackagePaths,
      physicalPackagePaths,
      symlinks,
      treeDigest: digestDirectory(nodeModulesRoot, new Set([".tryinget-governed-runtime.json"])),
    };
  }
  return proofs;
}

export function collectGovernedRuntimePackageInputHashes(
  sourceRoot: string,
): Record<string, string> {
  const root = realpathSync(sourceRoot);
  const hashes: Record<string, string> = {};
  for (const packagePath of GOVERNED_RUNTIME_PACKAGES) {
    for (const name of ["package.json", "package-lock.json"] as const) {
      const relativePath = `${packagePath}/${name}`;
      const absolutePath = resolve(root, relativePath);
      if (!existsSync(absolutePath)) {
        throw new GovernedRuntimeMaterializationError(
          "materialization_package_input_missing",
          `Governed runtime package input is missing: ${relativePath}.`,
        );
      }
      hashes[relativePath] = sha256(
        readRegularFileNoFollow(absolutePath, "materialization_package_input_invalid"),
      );
    }
  }
  return hashes;
}
