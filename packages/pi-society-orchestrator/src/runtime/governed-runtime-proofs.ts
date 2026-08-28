// summary: governed runtime materialization module (split from governed-runtime-materialization.ts).
// read_when:
//   - changing governed runtime proofs verification.

import type {
  GOVERNED_RUNTIME_ASC_COMPILER,
  GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA,
} from "./governed-runtime-constants.ts";

export interface GovernedRuntimeCleanliness {
  trackedChanges: string[];
  untrackedSourcePaths: string[];
  clean: boolean;
}

export interface GovernedRuntimeNodeModulesLayoutProof {
  paths: readonly string[];
  root: string;
  rootMode: number;
  generation: {
    name: string;
    root: string;
    mode: number;
  };
}

export interface GovernedRuntimeResolution {
  consumer: string;
  specifier: string;
  resolvedPath: string;
  ownerName: string;
  ownerVersion: string;
  ownerRoot: string;
  ownership: "local_source" | "registry_external";
}

export interface GovernedRuntimeGraphProof {
  resolutions: Record<string, GovernedRuntimeResolution>;
  runtimeRegistryRoot: string;
}

export interface GovernedRuntimeTypeboxProof {
  version: string;
  integrity: string;
  root: string;
  consumers: readonly string[];
  treeDigest: string;
}

export interface GovernedRuntimeHostPackageProof {
  version: string;
  integrity: string;
  registryUrl: string;
  selector: string;
  regularResolved: string;
  hiddenResolved: string;
  root: string;
  treeDigest: string;
}

export interface GovernedRuntimeHostPeerProof extends GovernedRuntimeHostPackageProof {
  provenance: "registry_resolution" | "verified_cache_tarballs";
  consumers: readonly string[];
}

export interface GovernedRuntimePeerClosureProof {
  root: string;
  packageManifestDigest: string;
  packageLockDigest: string;
  hiddenLockDigest: string;
  installedPackageCount: number;
  nodeModulesMode: number;
  lockedPackagePaths: readonly string[];
  physicalPackagePaths: readonly string[];
  symlinks: readonly { path: string; target: string; mode: number }[];
  treeDigest: string;
}

export interface GovernedRuntimeCacheTarballProof {
  version: string;
  url: string;
  integrity: string;
  filePath: string;
  byteLength: number;
}

export type GovernedRuntimeHostSourceProof =
  | {
      kind: "registry_resolution";
      packages: Record<string, GovernedRuntimeHostPackageProof>;
      closure: GovernedRuntimePeerClosureProof;
    }
  | {
      kind: "verified_cache_tarballs";
      activePiBinaryPath: string;
      activePiVersion: string;
      tarballs: Record<string, GovernedRuntimeCacheTarballProof>;
      packages: Record<string, GovernedRuntimeHostPackageProof>;
      closure: GovernedRuntimePeerClosureProof;
    };

export interface GovernedRuntimeExecutableProof {
  realpath: string;
  sha256: string;
  device: string;
  inode: string;
  byteLength: number;
  mode: number;
}

export interface GovernedRuntimeNpmPolicyProof {
  nodeExecutable: GovernedRuntimeExecutableProof;
  npmExecutable: GovernedRuntimeExecutableProof;
  version: string;
  observedAt: string;
  effectiveBefore: string;
  minReleaseAgeDays: number;
  minReleaseAgeExclusions: string[];
  registry: string;
  cacheRealpath: string;
  temporaryDirectoryRealpath: string;
  offline: false;
  preferOffline: false;
  force: false;
  overrideEnvironment: Record<string, string>;
}

export interface GovernedRuntimeNpmEffectReceipt {
  effect: string;
  nodeExecutable: GovernedRuntimeExecutableProof;
  npmExecutable: GovernedRuntimeExecutableProof;
  argv: readonly string[];
  cwdBefore: string;
  cwdAfter: string;
  environment: {
    HOME: string;
    LANG: "C.UTF-8";
    LC_ALL: "C.UTF-8";
    PATH: string;
    TEMP: string;
    TMP: string;
    TMPDIR: string;
    npm_config_audit: "false";
    npm_config_before: string;
    npm_config_min_release_age_exclude: string;
    npm_config_cache: string;
    npm_config_force: "false";
    npm_config_fund: "false";
    npm_config_globalconfig: "/etc/npmrc";
    npm_config_ignore_scripts: "true";
    npm_config_offline: "false";
    npm_config_prefer_offline: "false";
    npm_config_registry: string;
    npm_config_userconfig: "/dev/null";
  };
  environmentDigest: string;
  startedAt: string;
  finishedAt: string;
}

export interface GovernedRuntimePackageClosureProof {
  root: string;
  publication: {
    path: string;
    target: string;
    generationRoot: string;
    mode: number;
    targetMode: number;
    generationMode: number;
  };
  hiddenLockDigest: string;
  localMetadataPaths: readonly { path: string; name: string; version: string }[];
  lockedPackagePaths: readonly string[];
  physicalPackagePaths: readonly string[];
  symlinks: readonly { path: string; target: string; mode: number }[];
  treeDigest: string;
}

export interface GovernedRuntimeCompilerProof {
  name: typeof GOVERNED_RUNTIME_ASC_COMPILER.name;
  version: string;
  integrity: string;
  regularResolved: string;
  hiddenResolved: string;
  root: string;
  treeDigest: string;
}

export interface GovernedRuntimeOutputEntry {
  path: string;
  type: "directory" | "file";
  mode: number;
  byteLength?: number;
  sha256?: string;
}

export interface GovernedRuntimeAscDerivationProof {
  root: string;
  files: readonly string[];
  inputHashes: Record<string, string>;
  inputDigest: string;
  compiler: GovernedRuntimeCompilerProof;
  outputEntries: readonly GovernedRuntimeOutputEntry[];
  treeDigest: string;
}

export interface GovernedRuntimeAscBuildPassReceipt {
  schema: "pi.governed-asc-build-pass.v1";
  ordinal: 1 | 2;
  buildNonce: string;
  sourceCommit: string;
  invocation: {
    executable: GovernedRuntimeExecutableProof;
    argv: readonly ["scripts/build-runtime.mjs"];
    cwdRole: "clean_output_rebuild";
    environment: Record<string, string>;
    environmentDigest: string;
  };
  inputHashes: Record<string, string>;
  inputDigest: string;
  compiler: GovernedRuntimeCompilerProof;
  outputEntries: readonly GovernedRuntimeOutputEntry[];
  treeDigest: string;
}

export interface GovernedRuntimeAscRuntimeProof extends GovernedRuntimeAscDerivationProof {
  buildPasses: readonly [GovernedRuntimeAscBuildPassReceipt, GovernedRuntimeAscBuildPassReceipt];
}

export interface GovernedRuntimeMaterializationManifest {
  schema: typeof GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA;
  sourceRoot: string;
  sourceCommit: string;
  cleanliness: GovernedRuntimeCleanliness;
  nodeModulesLayout: GovernedRuntimeNodeModulesLayoutProof;
  missingTypeboxFailure: {
    consumer: "packages/pi-interaction/pi-trigger-adapter";
    specifier: "typebox";
    code: "MODULE_NOT_FOUND";
    phase: "before_peer_repair";
  };
  packageInputs: Record<string, string>;
  packages: readonly string[];
  npm: GovernedRuntimeNpmPolicyProof;
  npmEffects: readonly GovernedRuntimeNpmEffectReceipt[];
  packageClosures: Record<string, GovernedRuntimePackageClosureProof>;
  typebox: GovernedRuntimeTypeboxProof;
  hostSource: GovernedRuntimeHostSourceProof;
  hostPeers: Record<string, GovernedRuntimeHostPeerProof>;
  ascRuntime: GovernedRuntimeAscRuntimeProof;
  resolutions: Record<string, GovernedRuntimeResolution>;
  runtimeRegistryRoot: string;
  materializedAt: string;
}

export class GovernedRuntimeMaterializationError extends Error {
  readonly failureClass: string;

  constructor(failureClass: string, message: string) {
    super(message);
    this.failureClass = failureClass;
  }
}
