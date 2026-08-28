// summary: verify the closed, immutable runtime graph used by governed deep-review preflight.
// read_when:
//   - changing governed runtime materialization, package-owner lineage, or production preflight.

// This module owns the top-level materialization verification and is the compatibility
// barrel for the split verification modules:
//   ./governed-runtime-constants.ts
//   ./governed-runtime-proofs.ts
//   ./governed-runtime-cleanliness.ts
//   ./governed-runtime-npm-policy.ts
//   ./governed-runtime-fs-integrity.ts
//   ./governed-runtime-peer-closure.ts
//   ./governed-runtime-asc.ts
//   ./governed-runtime-package-closures.ts
//   ./governed-runtime-graph.ts

import { existsSync, lstatSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { verifyGovernedRuntimeAscRuntime } from "./governed-runtime-asc.ts";
import {
  inspectGovernedRuntimeCleanliness,
  verifyGovernedRuntimeNodeModulesLayout,
} from "./governed-runtime-cleanliness.ts";
import {
  GOVERNED_RUNTIME_MANIFEST_RELATIVE_PATH,
  GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA,
  GOVERNED_RUNTIME_PACKAGES,
  GOVERNED_RUNTIME_QUARANTINE_RELATIVE_PATH,
} from "./governed-runtime-constants.ts";
import { readJsonNoFollow, sameJson } from "./governed-runtime-fs-integrity.ts";
import {
  resolveGovernedRuntimeGraph,
  verifyGovernedRuntimeHostPeers,
  verifyGovernedRuntimeTypebox,
} from "./governed-runtime-graph.ts";
import {
  verifyGovernedRuntimeNpmEffectReceipts,
  verifyGovernedRuntimeNpmPolicy,
} from "./governed-runtime-npm-policy.ts";
import {
  collectGovernedRuntimePackageInputHashes,
  verifyGovernedRuntimePackageClosures,
} from "./governed-runtime-package-closures.ts";
import { verifyGovernedRuntimeHostSource } from "./governed-runtime-peer-closure.ts";
import type { GovernedRuntimeMaterializationManifest } from "./governed-runtime-proofs.ts";
import { GovernedRuntimeMaterializationError } from "./governed-runtime-proofs.ts";

export function verifyGovernedRuntimeMaterialization(
  sourceRoot: string,
  sourceCommit: string,
  manifestPath = resolve(sourceRoot, GOVERNED_RUNTIME_MANIFEST_RELATIVE_PATH),
): GovernedRuntimeMaterializationManifest {
  const root = realpathSync(sourceRoot);
  const quarantinePath = resolve(root, GOVERNED_RUNTIME_QUARANTINE_RELATIVE_PATH);
  if (existsSync(quarantinePath)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_candidate_quarantined",
      `Governed runtime candidate is quarantined and cannot be verified: ${quarantinePath}.`,
    );
  }
  if (!existsSync(manifestPath)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_manifest_missing",
      `Governed runtime materialization manifest is missing at ${manifestPath}.`,
    );
  }
  const stat = lstatSync(manifestPath);
  if ((stat.mode & 0o777) !== 0o600) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_manifest_mode_invalid",
      "Governed runtime materialization manifest mode must be 0600.",
    );
  }
  const manifest = readJsonNoFollow<GovernedRuntimeMaterializationManifest>(
    manifestPath,
    "materialization_manifest_invalid",
  );
  if (
    manifest.schema !== GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA ||
    manifest.sourceRoot !== root ||
    manifest.sourceCommit !== sourceCommit
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_manifest_identity_mismatch",
      "Governed runtime materialization manifest does not match the loaded source root and commit.",
    );
  }
  const cleanliness = inspectGovernedRuntimeCleanliness(root);
  if (!cleanliness.clean || !sameJson(manifest.cleanliness, cleanliness)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_source_not_clean",
      `Governed runtime source is not immutable-clean (tracked=${cleanliness.trackedChanges.length}, untracked=${cleanliness.untrackedSourcePaths.length}).`,
    );
  }
  const nodeModulesLayout = verifyGovernedRuntimeNodeModulesLayout(root);
  if (!sameJson(manifest.nodeModulesLayout, nodeModulesLayout)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_node_modules_layout_drift",
      "Governed runtime lexical node_modules layout drifted.",
    );
  }
  if (
    manifest.missingTypeboxFailure?.consumer !== "packages/pi-interaction/pi-trigger-adapter" ||
    manifest.missingTypeboxFailure.specifier !== "typebox" ||
    manifest.missingTypeboxFailure.code !== "MODULE_NOT_FOUND" ||
    manifest.missingTypeboxFailure.phase !== "before_peer_repair"
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_typebox_probe_invalid",
      "Materialization manifest lacks the exact pre-repair Typebox MODULE_NOT_FOUND evidence.",
    );
  }
  if (!sameJson(manifest.packages, GOVERNED_RUNTIME_PACKAGES)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_package_set_mismatch",
      "Materialization package set differs from the governed closed list.",
    );
  }
  const npm = verifyGovernedRuntimeNpmPolicy(manifest.npm);
  if (!sameJson(manifest.npm, npm)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_proof_drift",
      "Governed runtime npm executable or policy receipt drifted.",
    );
  }
  const packageInputs = collectGovernedRuntimePackageInputHashes(root);
  if (!sameJson(manifest.packageInputs, packageInputs)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_package_input_drift",
      "Governed runtime package manifest or lock hashes drifted.",
    );
  }
  const graph = resolveGovernedRuntimeGraph(root);
  if (
    !sameJson(manifest.resolutions, graph.resolutions) ||
    manifest.runtimeRegistryRoot !== graph.runtimeRegistryRoot
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_resolution_inventory_drift",
      "Governed runtime resolution inventory or registry root drifted.",
    );
  }
  const typebox = verifyGovernedRuntimeTypebox(root);
  if (!sameJson(manifest.typebox, typebox)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_typebox_proof_drift",
      "Governed runtime Typebox proof drifted.",
    );
  }
  if (
    manifest.hostSource?.kind !== "registry_resolution" &&
    manifest.hostSource?.kind !== "verified_cache_tarballs"
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_host_source_invalid",
      "Governed runtime host source proof is missing or unsupported.",
    );
  }
  const hostSource = verifyGovernedRuntimeHostSource(root);
  if (!sameJson(manifest.hostSource, hostSource)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_host_source_proof_drift",
      "Governed runtime host source or complete dependency closure drifted.",
    );
  }
  const npmEffects = verifyGovernedRuntimeNpmEffectReceipts(
    root,
    npm,
    hostSource,
    manifest.npmEffects,
  );
  if (!sameJson(manifest.npmEffects, npmEffects)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_effect_proof_drift",
      "Governed runtime npm effect receipts drifted.",
    );
  }
  const hostPeers = verifyGovernedRuntimeHostPeers(root, hostSource);
  if (!sameJson(manifest.hostPeers, hostPeers)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_host_peer_proof_drift",
      "Governed runtime host peer proof drifted.",
    );
  }
  const ascRuntime = verifyGovernedRuntimeAscRuntime(root, manifest.ascRuntime.buildPasses, npm);
  if (!sameJson(manifest.ascRuntime, ascRuntime)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_asc_runtime_proof_drift",
      "Governed ASC public execution derivation or output proof drifted.",
    );
  }
  const packageClosures = verifyGovernedRuntimePackageClosures(root);
  if (!sameJson(manifest.packageClosures, packageClosures)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_package_closure_proof_drift",
      "Governed published package closure proof drifted.",
    );
  }
  if (typeof manifest.materializedAt !== "string" || !manifest.materializedAt.trim()) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_timestamp_invalid",
      "Governed runtime materialization timestamp is missing.",
    );
  }
  return manifest;
}

export {
  inspectGovernedRuntimeAscRuntime,
  verifyGovernedRuntimeAscBuildPassReceipts,
  verifyGovernedRuntimeAscRuntime,
} from "./governed-runtime-asc.ts";
export {
  inspectGovernedRuntimeCleanliness,
  inspectGovernedRuntimeLexicalNodeModules,
  verifyGovernedRuntimeNodeModulesLayout,
} from "./governed-runtime-cleanliness.ts";
export {
  GOVERNED_RUNTIME_ASC_BUILD_RECEIPT_RELATIVE_PATHS,
  GOVERNED_RUNTIME_ASC_COMPILER,
  GOVERNED_RUNTIME_ASC_REGISTRY_OWNER,
  GOVERNED_RUNTIME_ASC_RUNTIME_FILES,
  GOVERNED_RUNTIME_HOST_CACHE_TARBALLS,
  GOVERNED_RUNTIME_HOST_PEERS,
  GOVERNED_RUNTIME_HOST_VERSION,
  GOVERNED_RUNTIME_LOCAL_EDGES,
  GOVERNED_RUNTIME_MANIFEST_RELATIVE_PATH,
  GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA,
  GOVERNED_RUNTIME_NPM_MIN_RELEASE_AGE_DAYS,
  GOVERNED_RUNTIME_NPM_REGISTRY,
  GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS,
  GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX,
  GOVERNED_RUNTIME_PACKAGES,
  GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH,
  GOVERNED_RUNTIME_QUARANTINE_RELATIVE_PATH,
  GOVERNED_RUNTIME_REGISTRY_EDGES,
  GOVERNED_RUNTIME_TYPEBOX_CONSUMERS,
  GOVERNED_RUNTIME_TYPEBOX_INTEGRITY,
  GOVERNED_RUNTIME_TYPEBOX_VERSION,
  governedRuntimeCacheTarballName,
} from "./governed-runtime-constants.ts";
export { verifyGovernedRuntimeFileIntegrity } from "./governed-runtime-fs-integrity.ts";
export {
  resolveGovernedRuntimeGraph,
  verifyGovernedRuntimeHostPeers,
  verifyGovernedRuntimeTypebox,
} from "./governed-runtime-graph.ts";
export {
  governedRuntimeAscBuildEnvironment,
  governedRuntimeNpmEffectEnvironment,
  inspectGovernedRuntimeExecutable,
  inspectGovernedRuntimeNpmPolicy,
  verifyGovernedRuntimeNpmEffectReceipts,
  verifyGovernedRuntimeNpmExecutables,
  verifyGovernedRuntimeNpmPolicy,
} from "./governed-runtime-npm-policy.ts";
export {
  collectGovernedRuntimePackageInputHashes,
  verifyGovernedRuntimePackageClosures,
} from "./governed-runtime-package-closures.ts";
export {
  classifyGovernedRuntimeAscRegistryOwnerEvidence,
  classifyGovernedRuntimeHostLockEvidence,
  verifyGovernedRuntimeHostSource,
  verifyGovernedRuntimePeerClosure,
} from "./governed-runtime-peer-closure.ts";
export type {
  GovernedRuntimeAscBuildPassReceipt,
  GovernedRuntimeAscDerivationProof,
  GovernedRuntimeAscRuntimeProof,
  GovernedRuntimeCacheTarballProof,
  GovernedRuntimeCleanliness,
  GovernedRuntimeCompilerProof,
  GovernedRuntimeExecutableProof,
  GovernedRuntimeGraphProof,
  GovernedRuntimeHostPackageProof,
  GovernedRuntimeHostPeerProof,
  GovernedRuntimeHostSourceProof,
  GovernedRuntimeMaterializationManifest,
  GovernedRuntimeNodeModulesLayoutProof,
  GovernedRuntimeNpmEffectReceipt,
  GovernedRuntimeNpmPolicyProof,
  GovernedRuntimeOutputEntry,
  GovernedRuntimePackageClosureProof,
  GovernedRuntimePeerClosureProof,
  GovernedRuntimeResolution,
  GovernedRuntimeTypeboxProof,
} from "./governed-runtime-proofs.ts";
export { GovernedRuntimeMaterializationError } from "./governed-runtime-proofs.ts";
