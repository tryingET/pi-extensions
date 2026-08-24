// summary: verify the closed, immutable runtime graph used by governed deep-review preflight.
// read_when:
//   - changing governed runtime materialization, package-owner lineage, or production preflight.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA =
  "pi.governed-loop-runtime-materialization.v6" as const;
export const GOVERNED_RUNTIME_MANIFEST_RELATIVE_PATH =
  "packages/pi-society-orchestrator/node_modules/.tryinget-governed-runtime.json";
export const GOVERNED_RUNTIME_QUARANTINE_RELATIVE_PATH =
  "node_modules/.tryinget-governed-runtime-quarantine.json";
export const GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX = ".tryinget-governed-package-generation-";
export const GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH =
  "packages/pi-society-orchestrator/node_modules/.tryinget-governed-peer-layer";
export const GOVERNED_RUNTIME_TYPEBOX_VERSION = "1.3.7";
export const GOVERNED_RUNTIME_TYPEBOX_INTEGRITY =
  "sha512-meKuifc33Pccx0O6PdIzYMq3Og8zvP4TIi/a+Bw3AEMZMxOD0+RHGQvpglEe6Zdy3wZ8nqn/j95h8LUZLk/6Hg==";
export const GOVERNED_RUNTIME_HOST_VERSION = "0.84.2";
export const GOVERNED_RUNTIME_NPM_MIN_RELEASE_AGE_DAYS = 7;
// npm matches registry package names, not Git repository ownership. The owned public scope is the
// narrow exemption; dependencies of matching packages remain age-gated unless they also match.
export const GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS = ["@tryinget/*"] as const;
export const GOVERNED_RUNTIME_NPM_REGISTRY = "https://registry.npmjs.org/";
export const GOVERNED_RUNTIME_ASC_REGISTRY_OWNER = {
  consumer: "packages/pi-society-orchestrator",
  name: "@tryinget/pi-autonomous-session-control",
  version: "0.5.2",
  selector: "^0.5.0",
  url: "https://registry.npmjs.org/@tryinget/pi-autonomous-session-control/-/pi-autonomous-session-control-0.5.2.tgz",
  integrity:
    "sha512-y+RvaTMca0VoMDI66TwLx5RzdTQGvov4a7MbrGKFXWNaXa86Ml9n3O/b812s+5pFIJOibWF7WAbM4n5uPaV7Nw==",
  specifiers: [
    "@tryinget/pi-autonomous-session-control/execution",
    "@tryinget/pi-autonomous-session-control",
  ],
} as const;

export const GOVERNED_RUNTIME_ASC_COMPILER = {
  name: "@typescript/native-preview",
  version: "7.0.0-dev.20260417.1",
  url: "https://registry.npmjs.org/@typescript/native-preview/-/native-preview-7.0.0-dev.20260417.1.tgz",
  integrity:
    "sha512-uIsfMRxtjgMF83TbAcpvHe0rgWVhqDSwCU1EYQT17qQbnOR56NIULneywLjeGKFgOCpn3eszd01/EjzS0n/LkA==",
} as const;
export const GOVERNED_RUNTIME_HOST_PEERS = {
  "@earendil-works/pi-ai": {
    integrity:
      "sha512-6MzsrYIYNVlE7SfpbL2yYb67Qo58p/7Q+xWG1RZvoX1P80aRCHSod2/13aFpxkow1lPO2LEh3c495J0Gwmyjig==",
    consumers: [
      "packages/pi-little-helpers",
      "packages/pi-toolbox-discovery",
      "packages/pi-society-orchestrator",
      "packages/pi-vault-client",
      "packages/pi-autonomous-session-control",
      "packages/pi-peer-messaging",
      "packages/pi-autoresearch",
      "packages/pi-interaction/pi-interaction",
      "packages/pi-ontology-workflows",
      "packages/pi-prompt-template-accelerator",
    ],
  },
  "@earendil-works/pi-agent-core": {
    integrity:
      "sha512-8Pn3wSCxj0cfo5I6jxQYVB/3uuQRmHhAlEclyjqpOuMEdQMIODHizRogv56FLdbU+dTiGnybeHQ2N+sV1/L2YA==",
    consumers: [],
  },
  "@earendil-works/pi-coding-agent": {
    integrity:
      "sha512-l4E+B7hgXKWddRo8bC/eSue2aWZjEgJ9xIpf5p0Og+lq8a2TArCwJ0HCoCPCgaBP/tN4zbYH/wOwvx9pJpeLCA==",
    consumers: [
      "packages/pi-little-helpers",
      "packages/pi-toolbox-discovery",
      "packages/pi-society-orchestrator",
      "packages/pi-vault-client",
      "packages/pi-autonomous-session-control",
      "packages/pi-peer-messaging",
      "packages/pi-autoresearch",
      "packages/pi-interaction/pi-interaction",
      "packages/pi-interaction/pi-editor-registry",
      "packages/pi-ontology-workflows",
      "packages/pi-prompt-template-accelerator",
    ],
  },
  "@earendil-works/pi-tui": {
    integrity:
      "sha512-ds2TLihOnM5sLJB3VpXV6y0uR5efVuHf4MN7yDpsty6hA2DUO/EDVzjp/0od0G2JslzVLMjT8T8zavtxVb+qbg==",
    consumers: [
      "packages/pi-little-helpers",
      "packages/pi-society-orchestrator",
      "packages/pi-vault-client",
      "packages/pi-autonomous-session-control",
      "packages/pi-interaction/pi-interaction",
      "packages/pi-interaction/pi-editor-registry",
      "packages/pi-interaction/pi-interaction-kit",
    ],
  },
} as const;

const GOVERNED_RUNTIME_CODING_AGENT_SHRINKWRAP_PACKAGES = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-client",
  "@earendil-works/pi-protocol",
  "@earendil-works/pi-telemetry",
  "@earendil-works/pi-tui",
] as const;

export const GOVERNED_RUNTIME_HOST_CACHE_TARBALLS = {
  "@earendil-works/pi-ai": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-ai/-/pi-ai-0.84.2.tgz",
    integrity:
      "sha512-6MzsrYIYNVlE7SfpbL2yYb67Qo58p/7Q+xWG1RZvoX1P80aRCHSod2/13aFpxkow1lPO2LEh3c495J0Gwmyjig==",
  },
  "@earendil-works/pi-agent-core": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-agent-core/-/pi-agent-core-0.84.2.tgz",
    integrity:
      "sha512-8Pn3wSCxj0cfo5I6jxQYVB/3uuQRmHhAlEclyjqpOuMEdQMIODHizRogv56FLdbU+dTiGnybeHQ2N+sV1/L2YA==",
  },
  "@earendil-works/pi-coding-agent": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-0.84.2.tgz",
    integrity:
      "sha512-l4E+B7hgXKWddRo8bC/eSue2aWZjEgJ9xIpf5p0Og+lq8a2TArCwJ0HCoCPCgaBP/tN4zbYH/wOwvx9pJpeLCA==",
  },
  "@earendil-works/pi-tui": {
    version: GOVERNED_RUNTIME_HOST_VERSION,
    url: "https://registry.npmjs.org/@earendil-works/pi-tui/-/pi-tui-0.84.2.tgz",
    integrity:
      "sha512-ds2TLihOnM5sLJB3VpXV6y0uR5efVuHf4MN7yDpsty6hA2DUO/EDVzjp/0od0G2JslzVLMjT8T8zavtxVb+qbg==",
  },
} as const;

export function governedRuntimeCacheTarballName(packageName: string, version: string): string {
  return `${packageName.replace(/^@/u, "").replaceAll("/", "-")}-${version}.tgz`;
}

export const GOVERNED_RUNTIME_ASC_RUNTIME_FILES = [
  "execution.js",
  "execution.d.ts",
  "extensions/self/subagent-pi-json-filter.js",
  "extensions/self/subagent-pi-json-filter-v2.js",
  "extensions/self/subagent-protocol-v2.js",
] as const;
export const GOVERNED_RUNTIME_ASC_BUILD_RECEIPT_RELATIVE_PATHS = [
  "packages/pi-society-orchestrator/node_modules/.tryinget-governed-asc-build-receipts/pass-1.json",
  "packages/pi-society-orchestrator/node_modules/.tryinget-governed-asc-build-receipts/pass-2.json",
] as const;

export const GOVERNED_RUNTIME_PACKAGES = [
  "packages/pi-little-helpers",
  "packages/pi-toolbox-discovery",
  "packages/pi-society-orchestrator",
  "packages/pi-vault-client",
  "packages/pi-autonomous-session-control",
  "packages/pi-peer-messaging",
  "packages/pi-autoresearch",
  "packages/pi-interaction/pi-interaction",
  "packages/pi-interaction/pi-editor-registry",
  "packages/pi-interaction/pi-interaction-kit",
  "packages/pi-interaction/pi-runtime-registry",
  "packages/pi-interaction/pi-trigger-adapter",
  "packages/pi-ontology-workflows",
  "packages/pi-prompt-template-accelerator",
] as const;

export const GOVERNED_RUNTIME_TYPEBOX_CONSUMERS = [
  "packages/pi-little-helpers",
  "packages/pi-society-orchestrator",
  "packages/pi-vault-client",
  "packages/pi-autonomous-session-control",
  "packages/pi-autoresearch",
  "packages/pi-interaction/pi-interaction",
  "packages/pi-interaction/pi-editor-registry",
  "packages/pi-interaction/pi-trigger-adapter",
  "packages/pi-ontology-workflows",
  "packages/pi-prompt-template-accelerator",
] as const;

export const GOVERNED_RUNTIME_LOCAL_EDGES = [
  edge(
    "packages/pi-society-orchestrator",
    "@tryinget/pi-vault-client/dispatch-runtime",
    "@tryinget/pi-vault-client",
    "packages/pi-vault-client",
  ),
  edge(
    "packages/pi-society-orchestrator",
    "@tryinget/pi-vault-client/prompt-plane",
    "@tryinget/pi-vault-client",
    "packages/pi-vault-client",
  ),
  edge(
    "packages/pi-society-orchestrator",
    "@tryinget/pi-vault-client/dispatch-guard",
    "@tryinget/pi-vault-client",
    "packages/pi-vault-client",
  ),
  edge(
    "packages/pi-society-orchestrator",
    "@tryinget/pi-autoresearch/src/runtime.ts",
    "@tryinget/pi-autoresearch",
    "packages/pi-autoresearch",
  ),
  edge(
    "packages/pi-autoresearch",
    "@tryinget/pi-vault-client/dispatch-runtime",
    "@tryinget/pi-vault-client",
    "packages/pi-vault-client",
  ),
  edge(
    "packages/pi-autoresearch",
    "@tryinget/pi-trigger-adapter",
    "@tryinget/pi-trigger-adapter",
    "packages/pi-interaction/pi-trigger-adapter",
  ),
  edge(
    "packages/pi-vault-client",
    "@tryinget/pi-interaction-kit",
    "@tryinget/pi-interaction-kit",
    "packages/pi-interaction/pi-interaction-kit",
  ),
  edge(
    "packages/pi-vault-client",
    "@tryinget/pi-runtime-registry",
    "@tryinget/pi-runtime-registry",
    "packages/pi-interaction/pi-runtime-registry",
  ),
  edge(
    "packages/pi-vault-client",
    "@tryinget/pi-trigger-adapter",
    "@tryinget/pi-trigger-adapter",
    "packages/pi-interaction/pi-trigger-adapter",
  ),
  edge(
    "packages/pi-interaction/pi-trigger-adapter",
    "@tryinget/pi-interaction-kit",
    "@tryinget/pi-interaction-kit",
    "packages/pi-interaction/pi-interaction-kit",
  ),
  edge(
    "packages/pi-interaction/pi-interaction",
    "@tryinget/pi-editor-registry",
    "@tryinget/pi-editor-registry",
    "packages/pi-interaction/pi-editor-registry",
  ),
  edge(
    "packages/pi-interaction/pi-interaction",
    "@tryinget/pi-interaction-kit",
    "@tryinget/pi-interaction-kit",
    "packages/pi-interaction/pi-interaction-kit",
  ),
  edge(
    "packages/pi-interaction/pi-interaction",
    "@tryinget/pi-trigger-adapter",
    "@tryinget/pi-trigger-adapter",
    "packages/pi-interaction/pi-trigger-adapter",
  ),
  edge(
    "packages/pi-interaction/pi-editor-registry",
    "@tryinget/pi-trigger-adapter",
    "@tryinget/pi-trigger-adapter",
    "packages/pi-interaction/pi-trigger-adapter",
  ),
  edge(
    "packages/pi-ontology-workflows",
    "@tryinget/pi-editor-registry",
    "@tryinget/pi-editor-registry",
    "packages/pi-interaction/pi-editor-registry",
  ),
  edge(
    "packages/pi-ontology-workflows",
    "@tryinget/pi-trigger-adapter",
    "@tryinget/pi-trigger-adapter",
    "packages/pi-interaction/pi-trigger-adapter",
  ),
  edge(
    "packages/pi-prompt-template-accelerator",
    "@tryinget/pi-runtime-registry",
    "@tryinget/pi-runtime-registry",
    "packages/pi-interaction/pi-runtime-registry",
  ),
  edge(
    "packages/pi-prompt-template-accelerator",
    "@tryinget/pi-trigger-adapter",
    "@tryinget/pi-trigger-adapter",
    "packages/pi-interaction/pi-trigger-adapter",
  ),
  edge(
    "packages/pi-little-helpers",
    "@tryinget/pi-peer-messaging",
    "@tryinget/pi-peer-messaging",
    "packages/pi-peer-messaging",
  ),
] as const;

export const GOVERNED_RUNTIME_REGISTRY_EDGES = GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.specifiers.map(
  (specifier) => ({
    consumer: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.consumer,
    specifier,
    expectedOwnerName: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.name,
    expectedOwnerVersion: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.version,
    expectedSelector: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.selector,
    expectedUrl: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.url,
    expectedIntegrity: GOVERNED_RUNTIME_ASC_REGISTRY_OWNER.integrity,
  }),
);

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

function edge(
  consumer: string,
  specifier: string,
  expectedOwnerName: string,
  expectedOwnerPath: string,
) {
  return { consumer, specifier, expectedOwnerName, expectedOwnerPath } as const;
}

function parseTaggedGitPaths(output: string): Array<{ marker: string; path: string }> {
  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      if (record.length < 3 || record[1] !== " ") {
        throw new GovernedRuntimeMaterializationError(
          "materialization_git_inspection_failed",
          "Git returned a malformed tagged-path inventory.",
        );
      }
      return { marker: record[0], path: record.slice(2) };
    });
}

function inspectGovernedRuntimeIndexFlags(sourceRoot: string): string[] {
  const assumeUnchanged = parseTaggedGitPaths(gitRaw(sourceRoot, ["ls-files", "-v", "-z"]))
    .filter(({ marker }) => /^[a-z]$/u.test(marker))
    .map(({ path }) => `index-flag:assume-unchanged:${path}`);
  const skipWorktree = parseTaggedGitPaths(gitRaw(sourceRoot, ["ls-files", "-t", "-z"]))
    .filter(({ marker }) => marker === "S")
    .map(({ path }) => `index-flag:skip-worktree:${path}`);
  return [...assumeUnchanged, ...skipWorktree];
}

function inspectGovernedRuntimeTrackedBytes(sourceRoot: string): string[] {
  const scratch = mkdtempSync(resolve(tmpdir(), "governed-runtime-cleanliness-"));
  const indexPath = resolve(scratch, "head.index");
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    gitRaw(sourceRoot, ["read-tree", "HEAD"], env);
    const records = gitRaw(
      sourceRoot,
      ["diff", "--no-ext-diff", "--name-status", "-z", "HEAD", "--"],
      env,
    )
      .split("\0")
      .filter(Boolean);
    if (records.length % 2 !== 0) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_git_inspection_failed",
        "Git returned a malformed tracked-byte comparison.",
      );
    }
    const changes: string[] = [];
    for (let index = 0; index < records.length; index += 2) {
      changes.push(`tracked-byte-drift:${records[index]}:${records[index + 1]}`);
    }
    return changes;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function inspectGovernedRuntimeCleanliness(sourceRoot: string): GovernedRuntimeCleanliness {
  const root = realpathSync(sourceRoot);
  const trackedOutput = git(root, ["status", "--porcelain=v1", "--untracked-files=no"]);
  const untrackedOutput = git(root, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    ".",
    ":(exclude)node_modules",
    ":(exclude)node_modules/**",
    ":(exclude)**/node_modules",
    ":(exclude)**/node_modules/**",
  ]);
  const trackedChanges = [
    ...(trackedOutput ? trackedOutput.split("\n").filter(Boolean) : []),
    ...inspectGovernedRuntimeIndexFlags(root),
    ...inspectGovernedRuntimeTrackedBytes(root),
  ];
  const uniqueTrackedChanges = [...new Set(trackedChanges)];
  const untrackedSourcePaths = untrackedOutput
    ? untrackedOutput
        .split("\0")
        .filter(Boolean)
        .filter((path) => !path.split(/[\\/]/u).includes("node_modules"))
    : [];
  return {
    trackedChanges: uniqueTrackedChanges,
    untrackedSourcePaths,
    clean: uniqueTrackedChanges.length === 0 && untrackedSourcePaths.length === 0,
  };
}

export function inspectGovernedRuntimeLexicalNodeModules(sourceRoot: string): readonly string[] {
  const root = realpathSync(sourceRoot);
  const paths: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const absolutePath = resolve(directory, entry.name);
      const relativePath = relative(root, absolutePath).split(sep).join("/");
      if (entry.name === "node_modules") {
        paths.push(relativePath);
        continue;
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(absolutePath);
    }
  };
  visit(root);
  return paths.sort();
}

export function verifyGovernedRuntimeNodeModulesLayout(
  sourceRoot: string,
): GovernedRuntimeNodeModulesLayoutProof {
  const paths = inspectGovernedRuntimeLexicalNodeModules(sourceRoot);
  const expectedPaths = [
    "node_modules",
    ...GOVERNED_RUNTIME_PACKAGES.map((packagePath) => `${packagePath}/node_modules`),
  ].sort();
  const rawNodeModulesRoot = resolve(realpathSync(sourceRoot), "node_modules");
  const rootStat = lstatSync(rawNodeModulesRoot);
  const nodeModulesRoot = realpathSync(rawNodeModulesRoot);
  const rootEntries = readdirSync(nodeModulesRoot, { withFileTypes: true });
  const generationEntry = rootEntries[0];
  const generationId = generationEntry?.name.slice(
    GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX.length,
  );
  const generationRoot = generationEntry ? resolve(nodeModulesRoot, generationEntry.name) : "";
  const generationStat = generationRoot ? lstatSync(generationRoot) : undefined;
  if (
    !sameJson(paths, expectedPaths) ||
    nodeModulesRoot !== rawNodeModulesRoot ||
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    rootEntries.length !== 1 ||
    !generationEntry?.isDirectory() ||
    generationEntry.isSymbolicLink() ||
    !generationEntry.name.startsWith(GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      generationId ?? "",
    ) ||
    !generationStat?.isDirectory() ||
    generationStat.isSymbolicLink()
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_node_modules_layout_invalid",
      `Governed runtime must contain exactly one physical root generation and the 14 public node_modules links; observed lexical roots: ${paths.join(", ")}; root entries: ${rootEntries.map(({ name }) => name).join(", ")}.`,
    );
  }
  return {
    paths,
    root: nodeModulesRoot,
    rootMode: rootStat.mode & 0o7777,
    generation: {
      name: generationEntry.name,
      root: generationRoot,
      mode: generationStat.mode & 0o7777,
    },
  };
}

function resolveCurrentPiBinaryPath(): string {
  let selected: string;
  try {
    selected = execFileSync("sh", ["-lc", "command -v pi"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_active_pi_missing",
      error instanceof Error ? error.message : String(error),
    );
  }
  if (!selected) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_active_pi_missing",
      "The active Pi binary could not be resolved from PATH.",
    );
  }
  return realpathSync(selected);
}

const GOVERNED_NPM_OVERRIDE_KEYS = new Set([
  "npm_config_before",
  "npm_config_force",
  "npm_config_min_release_age",
  "npm_config_min_release_age_exclude",
  "npm_config_offline",
  "npm_config_prefer_offline",
  "npm_config_registry",
]);

function resolveCurrentNpmExecutable(): string {
  const selected = execFileSync("sh", ["-c", "command -v npm"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!selected) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_missing",
      "The npm executable could not be resolved from PATH.",
    );
  }
  return realpathSync(selected);
}

function npmText(nodeExecutable: string, npmExecutable: string, args: string[]): string {
  return execFileSync(nodeExecutable, [npmExecutable, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function npmStringList(nodeExecutable: string, npmExecutable: string, key: string): string[] {
  return npmText(nodeExecutable, npmExecutable, ["config", "get", key])
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

function npmFalse(nodeExecutable: string, npmExecutable: string, key: string): false {
  const value = npmText(nodeExecutable, npmExecutable, ["config", "get", key]);
  if (value !== "false") {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_policy_mismatch",
      `The effective npm ${key} setting must remain false; observed ${value || "empty"}.`,
    );
  }
  return false;
}

function inspectNpmOverrideEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env)
      .filter(([key, value]) =>
        Boolean(value !== undefined && GOVERNED_NPM_OVERRIDE_KEYS.has(key.toLowerCase())),
      )
      .sort(([left], [right]) => left.localeCompare(right)) as Array<[string, string]>,
  );
}

export function inspectGovernedRuntimeExecutable(filePath: string): GovernedRuntimeExecutableProof {
  const canonicalPath = realpathSync(filePath);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(canonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    const mode = stat.mode & 0o7777;
    if (!stat.isFile() || (mode & 0o111) === 0) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_executable_invalid",
        `Governed executable must be a regular executable file: ${canonicalPath}.`,
      );
    }
    const bytes = readFileSync(descriptor);
    if (bytes.length !== stat.size) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_executable_invalid",
        `Governed executable size changed while it was inspected: ${canonicalPath}.`,
      );
    }
    return {
      realpath: canonicalPath,
      sha256: sha256(bytes),
      device: String(stat.dev),
      inode: String(stat.ino),
      byteLength: bytes.length,
      mode,
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function verifyGovernedRuntimeNpmExecutables(npm: GovernedRuntimeNpmPolicyProof): {
  nodeExecutable: GovernedRuntimeExecutableProof;
  npmExecutable: GovernedRuntimeExecutableProof;
} {
  const current = {
    nodeExecutable: inspectGovernedRuntimeExecutable(npm.nodeExecutable.realpath),
    npmExecutable: inspectGovernedRuntimeExecutable(npm.npmExecutable.realpath),
  };
  if (
    !sameJson(current.nodeExecutable, npm.nodeExecutable) ||
    !sameJson(current.npmExecutable, npm.npmExecutable)
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_executable_drift",
      "The captured Node or npm executable path, bytes, inode, size, or mode drifted.",
    );
  }
  return current;
}

function assertNpmPolicyShape(proof: GovernedRuntimeNpmPolicyProof): void {
  const observedAt = Date.parse(proof.observedAt);
  const effectiveBefore = Date.parse(proof.effectiveBefore);
  const expectedAgeMs = proof.minReleaseAgeDays * 24 * 60 * 60 * 1000;
  const observedAgeMs = observedAt - effectiveBefore;
  let executablesValid = false;
  let temporaryDirectoryValid = false;
  try {
    verifyGovernedRuntimeNpmExecutables(proof);
    executablesValid = true;
    temporaryDirectoryValid =
      realpathSync(proof.temporaryDirectoryRealpath) === proof.temporaryDirectoryRealpath;
  } catch {
    executablesValid = false;
  }
  if (
    !executablesValid ||
    !temporaryDirectoryValid ||
    !Number.isFinite(observedAt) ||
    !Number.isFinite(effectiveBefore) ||
    // Finite guard: a NaN minReleaseAgeDays would slip through every numeric
    // comparison below (NaN < x and NaN > y are both false).
    !Number.isFinite(proof.minReleaseAgeDays) ||
    proof.minReleaseAgeDays < GOVERNED_RUNTIME_NPM_MIN_RELEASE_AGE_DAYS ||
    !sameJson(proof.minReleaseAgeExclusions, [...GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS]) ||
    observedAgeMs < expectedAgeMs - 5 * 60 * 1000 ||
    observedAgeMs > expectedAgeMs + 5 * 60 * 1000 ||
    proof.registry !== GOVERNED_RUNTIME_NPM_REGISTRY ||
    proof.offline !== false ||
    proof.preferOffline !== false ||
    proof.force !== false ||
    Object.keys(proof.overrideEnvironment).length !== 0
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_policy_mismatch",
      "The effective npm policy does not preserve the required executable, release-age, registry, cache, temporary-directory, and override posture.",
    );
  }
}

export function inspectGovernedRuntimeNpmPolicy(): GovernedRuntimeNpmPolicyProof {
  const nodeExecutable = inspectGovernedRuntimeExecutable(process.execPath);
  const npmExecutable = inspectGovernedRuntimeExecutable(resolveCurrentNpmExecutable());
  const selectedTemporaryDirectory = process.env.TMPDIR?.trim();
  if (!selectedTemporaryDirectory) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_policy_mismatch",
      "Governed materialization requires an explicit managed TMPDIR.",
    );
  }
  const temporaryDirectoryRealpath = realpathSync(selectedTemporaryDirectory);
  const observedAtMs = Date.now();
  const observedAt = new Date(observedAtMs).toISOString();
  // npm keeps the declared `min-release-age` value in config while deriving a
  // runtime-only flat `before` option for install resolution. `npm config get
  // before` reads the raw key, not that derived flat option, so it legitimately
  // returns null when only the relative policy is configured. Prove the declared
  // relative policy directly and derive the exact cutoff used by the governed npm
  // effects. Retain an explicit-before fallback for older/operator-controlled
  // environments, but reject simultaneous raw values because their precedence is
  // easy to misread and can silently relax the intended age gate.
  const configuredMinReleaseAgeText = npmText(nodeExecutable.realpath, npmExecutable.realpath, [
    "config",
    "get",
    "min-release-age",
  ]);
  const configuredMinReleaseAge =
    configuredMinReleaseAgeText && configuredMinReleaseAgeText !== "null"
      ? Number(configuredMinReleaseAgeText)
      : Number.NaN;
  const configuredBeforeText = npmText(nodeExecutable.realpath, npmExecutable.realpath, [
    "config",
    "get",
    "before",
  ]);
  const configuredBeforeMs = Date.parse(configuredBeforeText);
  let minReleaseAgeDays: number;
  let effectiveBeforeMs: number;
  if (Number.isFinite(configuredMinReleaseAge)) {
    if (configuredMinReleaseAge < 0 || Number.isFinite(configuredBeforeMs)) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_npm_policy_mismatch",
        "Governed npm policy requires one non-negative min-release-age value and no simultaneous explicit before cutoff.",
      );
    }
    minReleaseAgeDays = configuredMinReleaseAge;
    effectiveBeforeMs = observedAtMs - configuredMinReleaseAge * 86_400_000;
  } else if (Number.isFinite(configuredBeforeMs)) {
    effectiveBeforeMs = configuredBeforeMs;
    minReleaseAgeDays = Math.round((observedAtMs - effectiveBeforeMs) / 86_400_000);
  } else {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_policy_mismatch",
      "Governed npm policy requires min-release-age (preferred) or one explicit before cutoff equivalent to at least seven days.",
    );
  }
  const effectiveBefore = new Date(effectiveBeforeMs).toISOString();
  const minReleaseAgeExclusions = npmStringList(
    nodeExecutable.realpath,
    npmExecutable.realpath,
    "min-release-age-exclude",
  );
  const proof: GovernedRuntimeNpmPolicyProof = {
    nodeExecutable,
    npmExecutable,
    version: npmText(nodeExecutable.realpath, npmExecutable.realpath, ["--version"]),
    observedAt,
    effectiveBefore,
    minReleaseAgeDays,
    minReleaseAgeExclusions,
    registry: npmText(nodeExecutable.realpath, npmExecutable.realpath, [
      "config",
      "get",
      "registry",
    ]),
    cacheRealpath: realpathSync(
      npmText(nodeExecutable.realpath, npmExecutable.realpath, ["config", "get", "cache"]),
    ),
    temporaryDirectoryRealpath,
    offline: npmFalse(nodeExecutable.realpath, npmExecutable.realpath, "offline"),
    preferOffline: npmFalse(nodeExecutable.realpath, npmExecutable.realpath, "prefer-offline"),
    force: npmFalse(nodeExecutable.realpath, npmExecutable.realpath, "force"),
    overrideEnvironment: inspectNpmOverrideEnvironment(),
  };
  assertNpmPolicyShape(proof);
  return proof;
}

export function verifyGovernedRuntimeNpmPolicy(
  candidate: GovernedRuntimeNpmPolicyProof,
): GovernedRuntimeNpmPolicyProof {
  assertNpmPolicyShape(candidate);
  const current = inspectGovernedRuntimeNpmPolicy();
  const stableCandidate = {
    nodeExecutable: candidate.nodeExecutable,
    npmExecutable: candidate.npmExecutable,
    version: candidate.version,
    minReleaseAgeDays: candidate.minReleaseAgeDays,
    minReleaseAgeExclusions: candidate.minReleaseAgeExclusions,
    registry: candidate.registry,
    cacheRealpath: candidate.cacheRealpath,
    temporaryDirectoryRealpath: candidate.temporaryDirectoryRealpath,
    offline: candidate.offline,
    preferOffline: candidate.preferOffline,
    force: candidate.force,
    overrideEnvironment: candidate.overrideEnvironment,
  };
  const stableCurrent = {
    nodeExecutable: current.nodeExecutable,
    npmExecutable: current.npmExecutable,
    version: current.version,
    minReleaseAgeDays: current.minReleaseAgeDays,
    minReleaseAgeExclusions: current.minReleaseAgeExclusions,
    registry: current.registry,
    cacheRealpath: current.cacheRealpath,
    temporaryDirectoryRealpath: current.temporaryDirectoryRealpath,
    offline: current.offline,
    preferOffline: current.preferOffline,
    force: current.force,
    overrideEnvironment: current.overrideEnvironment,
  };
  if (!sameJson(stableCandidate, stableCurrent)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_runtime_drift",
      "The npm executable or effective supply-chain policy drifted after materialization.",
    );
  }
  return candidate;
}

export function governedRuntimeNpmEffectEnvironment(
  npm: GovernedRuntimeNpmPolicyProof,
): GovernedRuntimeNpmEffectReceipt["environment"] {
  return {
    HOME: dirname(npm.cacheRealpath),
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    PATH: dirname(npm.nodeExecutable.realpath),
    TEMP: npm.temporaryDirectoryRealpath,
    TMP: npm.temporaryDirectoryRealpath,
    TMPDIR: npm.temporaryDirectoryRealpath,
    npm_config_audit: "false",
    npm_config_before: npm.effectiveBefore,
    npm_config_min_release_age_exclude: npm.minReleaseAgeExclusions.join("\n"),
    npm_config_cache: npm.cacheRealpath,
    npm_config_force: "false",
    npm_config_fund: "false",
    npm_config_globalconfig: "/etc/npmrc",
    npm_config_ignore_scripts: "true",
    npm_config_offline: "false",
    npm_config_prefer_offline: "false",
    npm_config_registry: npm.registry,
    npm_config_userconfig: "/dev/null",
  };
}

export function governedRuntimeAscBuildEnvironment(
  npm: GovernedRuntimeNpmPolicyProof,
): Record<string, string> {
  const environment = governedRuntimeNpmEffectEnvironment(npm);
  return {
    HOME: environment.HOME,
    LANG: environment.LANG,
    LC_ALL: environment.LC_ALL,
    PATH: environment.PATH,
    TEMP: environment.TEMP,
    TMP: environment.TMP,
    TMPDIR: environment.TMPDIR,
  };
}

export function verifyGovernedRuntimeNpmEffectReceipts(
  sourceRoot: string,
  npm: GovernedRuntimeNpmPolicyProof,
  hostSource: GovernedRuntimeHostSourceProof,
  receipts: readonly GovernedRuntimeNpmEffectReceipt[],
): readonly GovernedRuntimeNpmEffectReceipt[] {
  const root = realpathSync(sourceRoot);
  const peerCwd = realpathSync(resolve(root, GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH));
  const expectedEffects = [
    ...GOVERNED_RUNTIME_PACKAGES.map((packagePath) => `package_ci:${packagePath}`),
    ...(hostSource.kind === "verified_cache_tarballs"
      ? Object.keys(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS).map(
          (packageName) => `cache_pack:${packageName}`,
        )
      : []),
    "peer_install",
  ];
  if (
    !sameJson(
      receipts.map(({ effect }) => effect),
      expectedEffects,
    )
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_effect_inventory_mismatch",
      "Governed npm effect receipt inventory is incomplete, duplicated, or out of order.",
    );
  }
  const environment = governedRuntimeNpmEffectEnvironment(npm);
  const environmentDigest = sha256(JSON.stringify(environment));
  for (const receipt of receipts) {
    const startedAt = Date.parse(receipt.startedAt);
    const finishedAt = Date.parse(receipt.finishedAt);
    let canonicalCwd = "";
    try {
      canonicalCwd = realpathSync(receipt.cwdBefore);
    } catch {
      canonicalCwd = "";
    }
    if (
      !sameJson(receipt.nodeExecutable, npm.nodeExecutable) ||
      !sameJson(receipt.npmExecutable, npm.npmExecutable) ||
      !sameJson(receipt.environment, environment) ||
      receipt.environmentDigest !== environmentDigest ||
      receipt.cwdBefore !== receipt.cwdAfter ||
      canonicalCwd !== receipt.cwdBefore ||
      !Number.isFinite(startedAt) ||
      !Number.isFinite(finishedAt) ||
      finishedAt < startedAt
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_npm_effect_receipt_invalid",
        `Governed npm effect receipt drifted for ${receipt.effect}.`,
      );
    }
    if (receipt.effect.startsWith("package_ci:")) {
      const packagePath = receipt.effect.slice("package_ci:".length);
      const expectedArgs = [
        "ci",
        ...(packagePath === "packages/pi-autonomous-session-control" ? [] : ["--omit=dev"]),
        "--omit=peer",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
      ];
      const expectedCwd = dirname(realpathSync(resolve(root, packagePath, "node_modules")));
      if (!sameJson(receipt.argv, expectedArgs) || receipt.cwdBefore !== expectedCwd) {
        throw new GovernedRuntimeMaterializationError(
          "materialization_npm_effect_receipt_invalid",
          `Governed npm package install receipt drifted for ${packagePath}.`,
        );
      }
    } else if (receipt.effect.startsWith("cache_pack:")) {
      const packageName = receipt.effect.slice("cache_pack:".length);
      const expected =
        GOVERNED_RUNTIME_HOST_CACHE_TARBALLS[
          packageName as keyof typeof GOVERNED_RUNTIME_HOST_CACHE_TARBALLS
        ];
      if (
        !expected ||
        receipt.cwdBefore !== peerCwd ||
        !sameJson(receipt.argv, [
          "pack",
          "--offline",
          "--silent",
          "--ignore-scripts",
          "--pack-destination",
          resolve(peerCwd, "tarballs"),
          expected.url,
        ])
      ) {
        throw new GovernedRuntimeMaterializationError(
          "materialization_npm_effect_receipt_invalid",
          `Governed npm cache-pack receipt drifted for ${packageName}.`,
        );
      }
    } else if (
      receipt.effect === "peer_install" &&
      (!sameJson(receipt.argv, ["install", "--ignore-scripts", "--no-audit", "--no-fund"]) ||
        receipt.cwdBefore !== peerCwd)
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_npm_effect_receipt_invalid",
        "Governed npm peer-install receipt drifted.",
      );
    }
  }
  return receipts;
}

function readRegularFileNoFollow(
  filePath: string,
  failureClass = "materialization_regular_file_invalid",
): Buffer {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) {
      throw new GovernedRuntimeMaterializationError(
        failureClass,
        `Governed input must be a regular non-symlink file: ${filePath}.`,
      );
    }
    return readFileSync(descriptor);
  } catch (error) {
    if (error instanceof GovernedRuntimeMaterializationError) throw error;
    throw new GovernedRuntimeMaterializationError(
      failureClass,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readJsonNoFollow<T>(filePath: string, failureClass: string): T {
  try {
    return JSON.parse(readRegularFileNoFollow(filePath, failureClass).toString("utf8")) as T;
  } catch (error) {
    if (error instanceof GovernedRuntimeMaterializationError) throw error;
    throw new GovernedRuntimeMaterializationError(
      failureClass,
      `Governed JSON input is invalid at ${filePath}: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

export function verifyGovernedRuntimeFileIntegrity(
  filePath: string,
  integrity: string,
): { integrity: string; byteLength: number } {
  const separator = integrity.indexOf("-");
  const algorithm = separator > 0 ? integrity.slice(0, separator) : "";
  const expected = separator > 0 ? integrity.slice(separator + 1) : "";
  if (algorithm !== "sha512" || !expected) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_tarball_integrity_invalid",
      `Unsupported governed tarball integrity: ${integrity}.`,
    );
  }
  const bytes = readRegularFileNoFollow(filePath, "materialization_tarball_file_invalid");
  const observed = createHash(algorithm).update(bytes).digest("base64");
  if (observed !== expected) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_tarball_integrity_mismatch",
      `Governed tarball bytes do not match ${integrity}: ${filePath}.`,
    );
  }
  return { integrity, byteLength: bytes.length };
}

function assertNoEscapingSymlinks(root: string): void {
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = realpathSync(absolutePath);
        if (!pathInside(root, target)) {
          throw new GovernedRuntimeMaterializationError(
            "materialization_closure_symlink_escape",
            `Governed runtime closure symlink escapes its root: ${absolutePath} -> ${target}.`,
          );
        }
      } else if (entry.isDirectory()) {
        visit(absolutePath);
      }
    }
  };
  visit(root);
}

function codingAgentShrinkwrapPackageName(lockPath: string): string | undefined {
  const prefix = "node_modules/@earendil-works/pi-coding-agent/node_modules/";
  if (!lockPath.startsWith(prefix)) return undefined;
  const packageName = lockPath.slice(prefix.length);
  return GOVERNED_RUNTIME_CODING_AGENT_SHRINKWRAP_PACKAGES.find(
    (candidate) => candidate === packageName,
  );
}

function isExactCodingAgentShrinkwrapEntry(
  lockPath: string,
  entry: { version?: string; resolved?: string },
): boolean {
  const packageName = codingAgentShrinkwrapPackageName(lockPath);
  if (!packageName || entry.version !== GOVERNED_RUNTIME_HOST_VERSION) return false;
  const tarballName = packageName.slice(packageName.indexOf("/") + 1);
  return (
    entry.resolved ===
    `https://registry.npmjs.org/${packageName}/-/${tarballName}-${GOVERNED_RUNTIME_HOST_VERSION}.tgz`
  );
}

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
          `Installed closure package lacks exact SRI or the one bounded Pi 0.84.2 coding-agent shrinkwrap identity: ${key}.`,
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

interface GovernedRuntimePackageLock {
  lockfileVersion?: number;
  packages?: Record<
    string,
    GovernedRuntimePackageLockEntry & { dependencies?: Record<string, string> }
  >;
}

interface GovernedRuntimePeerManifest {
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

function collectAscRuntimeInputHashes(sourceRoot: string): Record<string, string> {
  const root = realpathSync(sourceRoot);
  const ascRoot = resolve(root, "packages/pi-autonomous-session-control");
  const relativeFiles = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.runtime.json",
    "scripts/build-runtime.mjs",
    "execution.ts",
  ];
  const hashes: Record<string, string> = {};
  for (const relativePath of relativeFiles) {
    hashes[relativePath] = sha256(
      readRegularFileNoFollow(resolve(ascRoot, relativePath), "materialization_asc_input_invalid"),
    );
  }
  hashes["extensions/self/**"] = digestDirectory(resolve(ascRoot, "extensions/self"));
  return hashes;
}

function collectOutputEntries(root: string): GovernedRuntimeOutputEntry[] {
  const entries: GovernedRuntimeOutputEntry[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const absolutePath = resolve(directory, entry.name);
      const relativePath = relative(root, absolutePath);
      const stat = lstatSync(absolutePath);
      const mode = stat.mode & 0o7777;
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        entries.push({ path: relativePath, type: "directory", mode });
        visit(absolutePath);
      } else if (entry.isFile() && !entry.isSymbolicLink()) {
        const bytes = readRegularFileNoFollow(
          absolutePath,
          "materialization_asc_runtime_file_invalid",
        );
        entries.push({
          path: relativePath,
          type: "file",
          mode,
          byteLength: bytes.length,
          sha256: sha256(bytes),
        });
      } else {
        throw new GovernedRuntimeMaterializationError(
          "materialization_asc_runtime_entry_invalid",
          `ASC runtime output contains a symlink or unsupported entry: ${absolutePath}.`,
        );
      }
    }
  };
  visit(root);
  return entries;
}

function inspectAscCompiler(ascRoot: string): GovernedRuntimeCompilerProof {
  const nodeModulesRoot = realpathSync(resolve(ascRoot, "node_modules"));
  const rawCompilerRoot = resolve(ascRoot, "node_modules/@typescript/native-preview");
  const stat = lstatSync(rawCompilerRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_asc_compiler_invalid",
      "ASC runtime compiler must be a physical @typescript/native-preview directory.",
    );
  }
  const compilerRoot = realpathSync(rawCompilerRoot);
  const compiler = ownerPackageRoot(resolve(compilerRoot, "package.json"));
  const regularLock = readJsonNoFollow<GovernedRuntimePackageLock>(
    resolve(ascRoot, "package-lock.json"),
    "materialization_asc_compiler_lock_invalid",
  );
  const hiddenLock = readJsonNoFollow<GovernedRuntimePackageLock>(
    resolve(ascRoot, "node_modules/.package-lock.json"),
    "materialization_asc_compiler_lock_invalid",
  );
  const lockKey = `node_modules/${GOVERNED_RUNTIME_ASC_COMPILER.name}`;
  const regular = regularLock.packages?.[lockKey];
  const hidden = hiddenLock.packages?.[lockKey];
  if (
    compilerRoot !== resolve(nodeModulesRoot, "@typescript/native-preview") ||
    compiler.root !== compilerRoot ||
    compiler.name !== GOVERNED_RUNTIME_ASC_COMPILER.name ||
    compiler.version !== GOVERNED_RUNTIME_ASC_COMPILER.version ||
    regular?.version !== GOVERNED_RUNTIME_ASC_COMPILER.version ||
    hidden?.version !== GOVERNED_RUNTIME_ASC_COMPILER.version ||
    regular.integrity !== GOVERNED_RUNTIME_ASC_COMPILER.integrity ||
    hidden.integrity !== GOVERNED_RUNTIME_ASC_COMPILER.integrity ||
    regular.resolved !== GOVERNED_RUNTIME_ASC_COMPILER.url ||
    hidden.resolved !== GOVERNED_RUNTIME_ASC_COMPILER.url
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_asc_compiler_identity_mismatch",
      "ASC compiler physical owner, version, SRI, or lock resolution drifted.",
    );
  }
  return {
    name: GOVERNED_RUNTIME_ASC_COMPILER.name,
    version: GOVERNED_RUNTIME_ASC_COMPILER.version,
    integrity: GOVERNED_RUNTIME_ASC_COMPILER.integrity,
    regularResolved: GOVERNED_RUNTIME_ASC_COMPILER.url,
    hiddenResolved: GOVERNED_RUNTIME_ASC_COMPILER.url,
    root: compilerRoot,
    treeDigest: digestDirectory(compilerRoot),
  };
}

export function inspectGovernedRuntimeAscRuntime(
  sourceRoot: string,
): GovernedRuntimeAscDerivationProof {
  const root = realpathSync(sourceRoot);
  const ascRoot = resolve(root, "packages/pi-autonomous-session-control");
  const rawDistRoot = resolve(ascRoot, "dist");
  const distStat = lstatSync(rawDistRoot);
  if (!distStat.isDirectory() || distStat.isSymbolicLink()) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_asc_runtime_root_invalid",
      "ASC runtime dist root must be a real directory inside the selected source root.",
    );
  }
  const distRoot = realpathSync(rawDistRoot);
  if (!pathInside(root, distRoot) || distRoot !== rawDistRoot) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_asc_runtime_root_mismatch",
      `ASC runtime resolves outside the selected source root: ${distRoot}.`,
    );
  }
  for (const relativePath of GOVERNED_RUNTIME_ASC_RUNTIME_FILES) {
    readRegularFileNoFollow(
      resolve(distRoot, relativePath),
      "materialization_asc_runtime_file_invalid",
    );
  }
  const inputHashes = collectAscRuntimeInputHashes(root);
  return {
    root: distRoot,
    files: [...GOVERNED_RUNTIME_ASC_RUNTIME_FILES],
    inputHashes,
    inputDigest: sha256(JSON.stringify(inputHashes)),
    compiler: inspectAscCompiler(ascRoot),
    outputEntries: collectOutputEntries(distRoot),
    treeDigest: digestDirectory(distRoot),
  };
}

export function verifyGovernedRuntimeAscBuildPassReceipts(
  derivation: GovernedRuntimeAscDerivationProof,
  receipts: readonly [GovernedRuntimeAscBuildPassReceipt, GovernedRuntimeAscBuildPassReceipt],
  sourceCommit: string,
  execution: {
    nodeExecutable: GovernedRuntimeExecutableProof;
    environment: Record<string, string>;
  } = {
    nodeExecutable: inspectGovernedRuntimeExecutable(process.execPath),
    environment: receipts[0].invocation.environment,
  },
): void {
  const environmentDigest = sha256(JSON.stringify(execution.environment));
  if (receipts[0].buildNonce === receipts[1].buildNonce) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_asc_build_receipt_invalid",
      "ASC clean-output build receipts must carry distinct nonces.",
    );
  }
  for (const [index, receipt] of receipts.entries()) {
    if (
      receipt.schema !== "pi.governed-asc-build-pass.v1" ||
      receipt.ordinal !== index + 1 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        receipt.buildNonce,
      ) ||
      receipt.sourceCommit !== sourceCommit ||
      !sameJson(receipt.invocation.executable, execution.nodeExecutable) ||
      !sameJson(receipt.invocation.argv, ["scripts/build-runtime.mjs"]) ||
      receipt.invocation.cwdRole !== "clean_output_rebuild" ||
      !sameJson(receipt.invocation.environment, execution.environment) ||
      receipt.invocation.environmentDigest !== environmentDigest ||
      !sameJson(receipt.inputHashes, derivation.inputHashes) ||
      receipt.inputDigest !== derivation.inputDigest ||
      !sameJson(receipt.compiler, derivation.compiler) ||
      !sameJson(receipt.outputEntries, derivation.outputEntries) ||
      receipt.treeDigest !== derivation.treeDigest
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_asc_build_receipt_drift",
        `ASC clean-output build receipt ${index + 1} does not match the reconstructed derivation.`,
      );
    }
  }
}

export function verifyGovernedRuntimeAscRuntime(
  sourceRoot: string,
  candidateBuildPasses?: readonly [
    GovernedRuntimeAscBuildPassReceipt,
    GovernedRuntimeAscBuildPassReceipt,
  ],
  npm?: GovernedRuntimeNpmPolicyProof,
): GovernedRuntimeAscRuntimeProof {
  const root = realpathSync(sourceRoot);
  const derivation = inspectGovernedRuntimeAscRuntime(root);
  const buildPasses = GOVERNED_RUNTIME_ASC_BUILD_RECEIPT_RELATIVE_PATHS.map((relativePath) => {
    const absolutePath = resolve(root, relativePath);
    const stat = lstatSync(absolutePath);
    if ((stat.mode & 0o777) !== 0o600) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_asc_build_receipt_mode_invalid",
        `ASC build receipt mode must be 0600: ${relativePath}.`,
      );
    }
    return readJsonNoFollow<GovernedRuntimeAscBuildPassReceipt>(
      absolutePath,
      "materialization_asc_build_receipt_invalid",
    );
  }) as [GovernedRuntimeAscBuildPassReceipt, GovernedRuntimeAscBuildPassReceipt];
  if (candidateBuildPasses && !sameJson(candidateBuildPasses, buildPasses)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_asc_build_receipt_inventory_drift",
      "Manifest ASC build receipts differ from the retained immutable receipt files.",
    );
  }
  verifyGovernedRuntimeAscBuildPassReceipts(
    derivation,
    buildPasses,
    git(root, ["rev-parse", "HEAD"]),
    npm
      ? {
          nodeExecutable: npm.nodeExecutable,
          environment: governedRuntimeAscBuildEnvironment(npm),
        }
      : undefined,
  );
  return { ...derivation, buildPasses };
}

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

function gitRaw(sourceRoot: string, args: string[], env: Record<string, string> = {}): string {
  try {
    return execFileSync("git", ["-C", sourceRoot, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_git_inspection_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function git(sourceRoot: string, args: string[]): string {
  return gitRaw(sourceRoot, args).trim();
}

function ownerPackageRoot(modulePath: string): {
  root: string;
  name: string;
  version?: string;
} {
  let cursor = lstatSync(modulePath).isDirectory()
    ? realpathSync(modulePath)
    : dirname(realpathSync(modulePath));
  for (;;) {
    const manifestPath = resolve(cursor, "package.json");
    if (existsSync(manifestPath)) {
      const parsed = readJsonNoFollow<{ name?: string; version?: string }>(
        manifestPath,
        "materialization_owner_manifest_invalid",
      );
      if (typeof parsed.name === "string" && parsed.name) {
        return { root: realpathSync(cursor), name: parsed.name, version: parsed.version };
      }
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_owner_not_found",
        `Cannot find owning package for ${modulePath}.`,
      );
    }
    cursor = parent;
  }
}

function digestDirectory(root: string, excludedRelativePaths = new Set<string>()): string {
  const hash = createHash("sha256");
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const absolutePath = resolve(directory, entry.name);
      const relativePath = relative(root, absolutePath);
      if (excludedRelativePaths.has(relativePath.split(sep).join("/"))) continue;
      const stat = lstatSync(absolutePath);
      const mode = (stat.mode & 0o7777).toString(8);
      if (entry.isSymbolicLink()) {
        hash.update(`link\0${relativePath}\0${mode}\0${readlinkSync(absolutePath)}\0`);
      } else if (entry.isDirectory()) {
        hash.update(`dir\0${relativePath}\0${mode}\0`);
        visit(absolutePath);
      } else if (entry.isFile()) {
        hash.update(`file\0${relativePath}\0${mode}\0`);
        hash.update(
          readRegularFileNoFollow(absolutePath, "materialization_runtime_tree_file_invalid"),
        );
        hash.update("\0");
      } else {
        throw new GovernedRuntimeMaterializationError(
          "materialization_typebox_tree_invalid",
          `Unsupported filesystem entry in pinned Typebox tree: ${absolutePath}.`,
        );
      }
    }
  };
  visit(root);
  return hash.digest("hex");
}

function pathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return (
    rel === "" ||
    (Boolean(rel) && !rel.startsWith("..") && !rel.includes(`..${sep}`) && !isAbsolute(rel))
  );
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
