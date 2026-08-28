// summary: governed runtime materialization module (split from governed-runtime-materialization.ts).
// read_when:
//   - changing governed runtime graph verification.

import { existsSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  GOVERNED_RUNTIME_ASC_REGISTRY_OWNER,
  GOVERNED_RUNTIME_HOST_PEERS,
  GOVERNED_RUNTIME_HOST_VERSION,
  GOVERNED_RUNTIME_LOCAL_EDGES,
  GOVERNED_RUNTIME_PACKAGES,
  GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH,
  GOVERNED_RUNTIME_REGISTRY_EDGES,
  GOVERNED_RUNTIME_TYPEBOX_CONSUMERS,
  GOVERNED_RUNTIME_TYPEBOX_INTEGRITY,
  GOVERNED_RUNTIME_TYPEBOX_VERSION,
} from "./governed-runtime-constants.ts";
import {
  digestDirectory,
  ownerPackageRoot,
  pathInside,
  readJsonNoFollow,
} from "./governed-runtime-fs-integrity.ts";
import type {
  GovernedRuntimePackageLock,
  GovernedRuntimePeerManifest,
} from "./governed-runtime-peer-closure.ts";
import { classifyGovernedRuntimeAscRegistryOwnerEvidence } from "./governed-runtime-peer-closure.ts";
import type {
  GovernedRuntimeGraphProof,
  GovernedRuntimeHostPeerProof,
  GovernedRuntimeHostSourceProof,
  GovernedRuntimeResolution,
  GovernedRuntimeTypeboxProof,
} from "./governed-runtime-proofs.ts";
import { GovernedRuntimeMaterializationError } from "./governed-runtime-proofs.ts";

export function resolveGovernedRuntimeGraph(sourceRoot: string): GovernedRuntimeGraphProof {
  const root = realpathSync(sourceRoot);
  const resolutions: Record<string, GovernedRuntimeResolution> = {};
  const registryRoots = new Set<string>();
  for (const definition of GOVERNED_RUNTIME_LOCAL_EDGES) {
    const consumerRoot = resolve(root, definition.consumer);
    const require = createRequire(resolve(consumerRoot, "package.json"));
    const resolvedPath = realpathSync(require.resolve(definition.specifier));
    const owner = ownerPackageRoot(resolvedPath);
    const expectedOwnerRoot = realpathSync(resolve(root, definition.expectedOwnerPath));
    if (
      owner.name !== definition.expectedOwnerName ||
      typeof owner.version !== "string" ||
      !owner.version ||
      owner.root !== expectedOwnerRoot ||
      !pathInside(root, resolvedPath)
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_resolution_owner_mismatch",
        `${definition.consumer} -> ${definition.specifier} resolved to ${owner.name}@${owner.version ?? "unknown"} at ${owner.root}; expected local source owner ${definition.expectedOwnerName} at ${expectedOwnerRoot}.`,
      );
    }
    const key = `${definition.consumer} -> ${definition.specifier}`;
    resolutions[key] = {
      consumer: definition.consumer,
      specifier: definition.specifier,
      resolvedPath,
      ownerName: owner.name,
      ownerVersion: owner.version,
      ownerRoot: owner.root,
      ownership: "local_source",
    };
    if (definition.expectedOwnerName === "@tryinget/pi-runtime-registry") {
      registryRoots.add(owner.root);
    }
  }

  const expectedExternalRoots = new Set<string>();
  for (const definition of GOVERNED_RUNTIME_REGISTRY_EDGES) {
    const consumerRoot = resolve(root, definition.consumer);
    const require = createRequire(resolve(consumerRoot, "package.json"));
    const resolvedPath = realpathSync(require.resolve(definition.specifier));
    const owner = ownerPackageRoot(resolvedPath);
    const expectedOwnerRoot = realpathSync(
      resolve(consumerRoot, "node_modules", definition.expectedOwnerName),
    );
    if (
      owner.name !== definition.expectedOwnerName ||
      owner.version !== definition.expectedOwnerVersion ||
      owner.root !== expectedOwnerRoot ||
      !pathInside(root, resolvedPath)
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_registry_owner_mismatch",
        `${definition.consumer} -> ${definition.specifier} resolved to ${owner.name}@${owner.version ?? "unknown"} at ${owner.root}; expected exact registry owner ${definition.expectedOwnerName}@${definition.expectedOwnerVersion} at ${expectedOwnerRoot}.`,
      );
    }
    const packageManifest = readJsonNoFollow<GovernedRuntimePeerManifest>(
      resolve(consumerRoot, "package.json"),
      "materialization_registry_owner_lock_mismatch",
    );
    const regularLock = readJsonNoFollow<GovernedRuntimePackageLock>(
      resolve(consumerRoot, "package-lock.json"),
      "materialization_registry_owner_lock_mismatch",
    );
    const hiddenLock = readJsonNoFollow<GovernedRuntimePackageLock>(
      resolve(consumerRoot, "node_modules/.package-lock.json"),
      "materialization_registry_owner_lock_mismatch",
    );
    classifyGovernedRuntimeAscRegistryOwnerEvidence(packageManifest, regularLock, hiddenLock);
    expectedExternalRoots.add(expectedOwnerRoot);
    const key = `${definition.consumer} -> ${definition.specifier}`;
    resolutions[key] = {
      consumer: definition.consumer,
      specifier: definition.specifier,
      resolvedPath,
      ownerName: owner.name,
      ownerVersion: definition.expectedOwnerVersion,
      ownerRoot: owner.root,
      ownership: "registry_external",
    };
  }

  const observedExternalRoots = collectPhysicalPackageOwnerRoots(
    root,
    GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name,
  );
  if (
    observedExternalRoots.size !== expectedExternalRoots.size ||
    [...observedExternalRoots].some((ownerRoot) => !expectedExternalRoots.has(ownerRoot))
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_registry_owner_multiplicity",
      `Governed runtime expected one physical ${GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name}@${GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.version} registry owner at ${[...expectedExternalRoots].join(", ")}; observed ${[...observedExternalRoots].join(", ") || "none"}.`,
    );
  }

  const expectedRegistryRoot = realpathSync(
    resolve(root, "packages/pi-interaction/pi-runtime-registry"),
  );
  if (registryRoots.size !== 1 || !registryRoots.has(expectedRegistryRoot)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_runtime_registry_not_singleton",
      `Closed runtime graph expected one pi-runtime-registry at ${expectedRegistryRoot}; observed ${[...registryRoots].join(", ") || "none"}.`,
    );
  }
  return { resolutions, runtimeRegistryRoot: expectedRegistryRoot };
}

function collectPhysicalPackageOwnerRoots(sourceRoot: string, expectedName: string): Set<string> {
  const roots = new Set<string>();
  const visitedNodeModules = new Set<string>();
  const inspectNodeModules = (rawNodeModulesRoot: string): void => {
    const nodeModulesRoot = realpathSync(rawNodeModulesRoot);
    if (visitedNodeModules.has(nodeModulesRoot)) return;
    visitedNodeModules.add(nodeModulesRoot);
    for (const entry of readdirSync(nodeModulesRoot, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || !entry.isDirectory() || entry.name === ".bin") continue;
      const absolutePath = resolve(nodeModulesRoot, entry.name);
      if (entry.name.startsWith("@") && !existsSync(resolve(absolutePath, "package.json"))) {
        for (const scopedEntry of readdirSync(absolutePath, { withFileTypes: true })) {
          if (scopedEntry.isSymbolicLink() || !scopedEntry.isDirectory()) continue;
          inspectPackage(resolve(absolutePath, scopedEntry.name));
        }
      } else {
        inspectPackage(absolutePath);
      }
    }
  };
  const inspectPackage = (packageRoot: string): void => {
    const manifestPath = resolve(packageRoot, "package.json");
    if (!existsSync(manifestPath)) return;
    const owner = readJsonNoFollow<{ name?: string }>(
      manifestPath,
      "materialization_registry_owner_manifest_invalid",
    );
    if (owner.name === expectedName) roots.add(realpathSync(packageRoot));
    const nestedNodeModules = resolve(packageRoot, "node_modules");
    if (existsSync(nestedNodeModules)) inspectNodeModules(nestedNodeModules);
  };
  for (const packagePath of GOVERNED_RUNTIME_PACKAGES) {
    inspectNodeModules(resolve(sourceRoot, packagePath, "node_modules"));
  }
  return roots;
}

export function verifyGovernedRuntimeTypebox(sourceRoot: string): GovernedRuntimeTypeboxProof {
  const root = realpathSync(sourceRoot);
  const peerLayer = resolve(root, GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH);
  const expectedTypeboxRoot = realpathSync(resolve(peerLayer, "node_modules/typebox"));
  if (!pathInside(root, expectedTypeboxRoot)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_typebox_root_mismatch",
      `Pinned Typebox resolves outside the selected runtime root: ${expectedTypeboxRoot}.`,
    );
  }
  const owner = ownerPackageRoot(resolve(expectedTypeboxRoot, "package.json"));
  if (owner.name !== "typebox" || owner.version !== GOVERNED_RUNTIME_TYPEBOX_VERSION) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_typebox_identity_mismatch",
      `Pinned Typebox owner is ${owner.name}@${owner.version ?? "unknown"}.`,
    );
  }
  const hiddenLockPath = resolve(peerLayer, "node_modules/.package-lock.json");
  const hiddenLock = readJsonNoFollow<{
    packages?: Record<string, { version?: string; integrity?: string }>;
  }>(hiddenLockPath, "materialization_typebox_lock_invalid");
  const locked = hiddenLock.packages?.["node_modules/typebox"];
  if (
    locked?.version !== GOVERNED_RUNTIME_TYPEBOX_VERSION ||
    locked.integrity !== GOVERNED_RUNTIME_TYPEBOX_INTEGRITY
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_typebox_integrity_mismatch",
      "Pinned Typebox hidden-lock version or integrity drifted.",
    );
  }
  const observedRoots = new Set<string>();
  for (const consumer of GOVERNED_RUNTIME_TYPEBOX_CONSUMERS) {
    const require = createRequire(resolve(root, consumer, "package.json"));
    const resolvedPath = realpathSync(require.resolve("typebox"));
    const resolvedOwner = ownerPackageRoot(resolvedPath);
    if (
      resolvedOwner.name !== "typebox" ||
      resolvedOwner.version !== GOVERNED_RUNTIME_TYPEBOX_VERSION
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_typebox_consumer_mismatch",
        `${consumer} resolves ${resolvedOwner.name}@${resolvedOwner.version ?? "unknown"} instead of pinned Typebox.`,
      );
    }
    observedRoots.add(resolvedOwner.root);
  }
  if (observedRoots.size !== 1 || !observedRoots.has(expectedTypeboxRoot)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_typebox_not_singleton",
      `Typebox consumers do not share the pinned peer layer: ${[...observedRoots].join(", ")}.`,
    );
  }
  return {
    version: GOVERNED_RUNTIME_TYPEBOX_VERSION,
    integrity: GOVERNED_RUNTIME_TYPEBOX_INTEGRITY,
    root: expectedTypeboxRoot,
    consumers: [...GOVERNED_RUNTIME_TYPEBOX_CONSUMERS],
    treeDigest: digestDirectory(expectedTypeboxRoot),
  };
}

export function verifyGovernedRuntimeHostPeers(
  sourceRoot: string,
  hostSource: GovernedRuntimeHostSourceProof,
): Record<string, GovernedRuntimeHostPeerProof> {
  const root = realpathSync(sourceRoot);
  const proof: Record<string, GovernedRuntimeHostPeerProof> = {};
  for (const [packageName, expected] of Object.entries(GOVERNED_RUNTIME_HOST_PEERS)) {
    const packageProof = hostSource.packages[packageName];
    if (!packageProof) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_host_peer_identity_mismatch",
        `Governed host source lacks the explicit physical proof for ${packageName}.`,
      );
    }
    const packageRoot = packageProof.root;
    if (!pathInside(root, packageRoot)) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_host_peer_root_mismatch",
        `${packageName} resolves outside the selected runtime root: ${packageRoot}.`,
      );
    }
    const observedRoots = new Set<string>();
    for (const consumer of expected.consumers) {
      const linkedRoot = realpathSync(
        resolve(root, consumer, "node_modules", ...packageName.split("/")),
      );
      const resolvedOwner = ownerPackageRoot(resolve(linkedRoot, "package.json"));
      if (
        resolvedOwner.name !== packageName ||
        resolvedOwner.version !== GOVERNED_RUNTIME_HOST_VERSION ||
        linkedRoot !== packageRoot
      ) {
        throw new GovernedRuntimeMaterializationError(
          "materialization_host_peer_consumer_mismatch",
          `${consumer} links ${resolvedOwner.name}@${resolvedOwner.version ?? "unknown"} at ${linkedRoot} instead of ${packageName}@${GOVERNED_RUNTIME_HOST_VERSION} at ${packageRoot}.`,
        );
      }
      observedRoots.add(resolvedOwner.root);
    }
    if (
      expected.consumers.length > 0 &&
      (observedRoots.size !== 1 || !observedRoots.has(packageRoot))
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_host_peer_not_singleton",
        `${packageName} consumers do not share the pinned peer layer: ${[...observedRoots].join(", ")}.`,
      );
    }
    proof[packageName] = {
      ...packageProof,
      provenance: hostSource.kind,
      consumers: [...expected.consumers],
    };
  }
  return proof;
}
