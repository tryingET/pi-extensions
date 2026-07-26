// summary: verify the closed, immutable runtime graph used by governed deep-review preflight.
// read_when:
//   - changing governed runtime materialization, package-owner lineage, or production preflight.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA =
  "pi.governed-loop-runtime-materialization.v3" as const;
export const GOVERNED_RUNTIME_MANIFEST_RELATIVE_PATH =
  "packages/pi-society-orchestrator/node_modules/.tryinget-governed-runtime.json";
export const GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH =
  "packages/pi-society-orchestrator/node_modules/.tryinget-governed-peer-layer";
export const GOVERNED_RUNTIME_TYPEBOX_VERSION = "1.1.38";
export const GOVERNED_RUNTIME_TYPEBOX_INTEGRITY =
  "sha512-pZ0aQPmMmXoUvSbeuWf/Hzsc+avNw/Zd6VeE8CFgkVGWyuHPJvqeJJDeJqLve+K70LvjYIoleGcoJHPT17cWoA==";
export const GOVERNED_RUNTIME_HOST_VERSION = "0.80.6";
export const GOVERNED_RUNTIME_HOST_PEERS = {
  "@earendil-works/pi-ai": {
    integrity:
      "sha512-7xfLk8sANBp+bpPEbjoOZTbPxsa+++b1JXAoSJsNa3vbs9AHHEclmvg54XLQcxH+fuwaeti/g2jeIfJ+mVYLpA==",
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
  "@earendil-works/pi-coding-agent": {
    integrity:
      "sha512-vcfD6tOk402isLl3Cm/qbn2O10TvgroMp1+/fEGM24ZdvETFCdOYv5VZ7m59EI5fPsjfSJh+CpQ5bhBrhfOg7g==",
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
      "sha512-bSuzS4EVSqEPj/Qr/p9eqCESfKsGuDNbl77EGci8Iaqqt/C/XCBZL1MjXaxSWW1NsT5afjp/Cb0NTPzOLv/aPA==",
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
    "@tryinget/pi-autonomous-session-control/execution",
    "@tryinget/pi-autonomous-session-control",
    "packages/pi-autonomous-session-control",
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

export interface GovernedRuntimeCleanliness {
  trackedChanges: string[];
  untrackedSourcePaths: string[];
  clean: boolean;
}

export interface GovernedRuntimeResolution {
  consumer: string;
  specifier: string;
  resolvedPath: string;
  ownerName: string;
  ownerRoot: string;
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

export interface GovernedRuntimeHostPeerProof {
  version: string;
  integrity: string;
  root: string;
  consumers: readonly string[];
  treeDigest: string;
}

export interface GovernedRuntimeMaterializationManifest {
  schema: typeof GOVERNED_RUNTIME_MATERIALIZATION_SCHEMA;
  sourceRoot: string;
  sourceCommit: string;
  cleanliness: GovernedRuntimeCleanliness;
  missingTypeboxFailure: {
    consumer: "packages/pi-interaction/pi-trigger-adapter";
    specifier: "typebox";
    code: "MODULE_NOT_FOUND";
    phase: "before_peer_repair";
  };
  packageInputs: Record<string, string>;
  packages: readonly string[];
  typebox: GovernedRuntimeTypeboxProof;
  hostPeers: Record<string, GovernedRuntimeHostPeerProof>;
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

export function inspectGovernedRuntimeCleanliness(sourceRoot: string): GovernedRuntimeCleanliness {
  const root = realpathSync(sourceRoot);
  const trackedOutput = git(root, ["status", "--porcelain=v1", "--untracked-files=no"]);
  const untrackedOutput = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const trackedChanges = trackedOutput ? trackedOutput.split("\n").filter(Boolean) : [];
  const untrackedSourcePaths = untrackedOutput
    ? untrackedOutput
        .split("\0")
        .filter(Boolean)
        .filter((path) => !path.split(/[\\/]/u).includes("node_modules"))
    : [];
  return {
    trackedChanges,
    untrackedSourcePaths,
    clean: trackedChanges.length === 0 && untrackedSourcePaths.length === 0,
  };
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
      const stat = lstatSync(absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new GovernedRuntimeMaterializationError(
          "materialization_package_input_invalid",
          `Governed runtime package input must be a regular non-symlink file: ${relativePath}.`,
        );
      }
      hashes[relativePath] = sha256(readFileSync(absolutePath));
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
      owner.root !== expectedOwnerRoot ||
      !pathInside(root, resolvedPath)
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_resolution_owner_mismatch",
        `${definition.consumer} -> ${definition.specifier} resolved to ${owner.name} at ${owner.root}; expected ${definition.expectedOwnerName} at ${expectedOwnerRoot}.`,
      );
    }
    const key = `${definition.consumer} -> ${definition.specifier}`;
    resolutions[key] = {
      consumer: definition.consumer,
      specifier: definition.specifier,
      resolvedPath,
      ownerName: owner.name,
      ownerRoot: owner.root,
    };
    if (definition.expectedOwnerName === "@tryinget/pi-runtime-registry") {
      registryRoots.add(owner.root);
    }
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
  const hiddenLockStat = lstatSync(hiddenLockPath);
  if (!hiddenLockStat.isFile() || hiddenLockStat.isSymbolicLink()) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_typebox_lock_invalid",
      "Pinned Typebox hidden lock must be a regular non-symlink file.",
    );
  }
  const hiddenLock = JSON.parse(readFileSync(hiddenLockPath, "utf8")) as {
    packages?: Record<string, { version?: string; integrity?: string }>;
  };
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
): Record<string, GovernedRuntimeHostPeerProof> {
  const root = realpathSync(sourceRoot);
  const peerLayer = resolve(root, GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH);
  const hiddenLock = JSON.parse(
    readFileSync(resolve(peerLayer, "node_modules/.package-lock.json"), "utf8"),
  ) as { packages?: Record<string, { version?: string; integrity?: string }> };
  const proof: Record<string, GovernedRuntimeHostPeerProof> = {};
  for (const [packageName, expected] of Object.entries(GOVERNED_RUNTIME_HOST_PEERS)) {
    const packageRoot = realpathSync(resolve(peerLayer, "node_modules", ...packageName.split("/")));
    const owner = ownerPackageRoot(resolve(packageRoot, "package.json"));
    const locked = hiddenLock.packages?.[`node_modules/${packageName}`];
    if (
      owner.name !== packageName ||
      owner.version !== GOVERNED_RUNTIME_HOST_VERSION ||
      locked?.version !== GOVERNED_RUNTIME_HOST_VERSION ||
      locked.integrity !== expected.integrity
    ) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_host_peer_identity_mismatch",
        `${packageName} does not match the pinned ${GOVERNED_RUNTIME_HOST_VERSION} host peer identity.`,
      );
    }
    if (!pathInside(root, packageRoot)) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_host_peer_root_mismatch",
        `${packageName} resolves outside the selected runtime root: ${packageRoot}.`,
      );
    }
    const observedRoots = new Set<string>();
    for (const consumer of expected.consumers) {
      const require = createRequire(resolve(root, consumer, "package.json"));
      const resolvedOwner = ownerPackageRoot(realpathSync(require.resolve(packageName)));
      if (
        resolvedOwner.name !== packageName ||
        resolvedOwner.version !== GOVERNED_RUNTIME_HOST_VERSION
      ) {
        throw new GovernedRuntimeMaterializationError(
          "materialization_host_peer_consumer_mismatch",
          `${consumer} resolves ${resolvedOwner.name}@${resolvedOwner.version ?? "unknown"} instead of ${packageName}@${GOVERNED_RUNTIME_HOST_VERSION}.`,
        );
      }
      observedRoots.add(resolvedOwner.root);
    }
    if (observedRoots.size !== 1 || !observedRoots.has(packageRoot)) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_host_peer_not_singleton",
        `${packageName} consumers do not share the pinned peer layer: ${[...observedRoots].join(", ")}.`,
      );
    }
    proof[packageName] = {
      version: GOVERNED_RUNTIME_HOST_VERSION,
      integrity: expected.integrity,
      root: packageRoot,
      consumers: [...expected.consumers],
      treeDigest: digestDirectory(packageRoot),
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
  if (!existsSync(manifestPath)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_manifest_missing",
      `Governed runtime materialization manifest is missing at ${manifestPath}.`,
    );
  }
  const stat = lstatSync(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_manifest_invalid",
      "Governed runtime materialization manifest must be a regular non-symlink file.",
    );
  }
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as GovernedRuntimeMaterializationManifest;
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
  const hostPeers = verifyGovernedRuntimeHostPeers(root);
  if (!sameJson(manifest.hostPeers, hostPeers)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_host_peer_proof_drift",
      "Governed runtime host peer proof drifted.",
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

function git(sourceRoot: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", sourceRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_git_inspection_failed",
      error instanceof Error ? error.message : String(error),
    );
  }
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
      const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        name?: string;
        version?: string;
      };
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

function digestDirectory(root: string): string {
  const hash = createHash("sha256");
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const absolutePath = resolve(directory, entry.name);
      const relativePath = relative(root, absolutePath);
      if (entry.isSymbolicLink()) {
        hash.update(`link\0${relativePath}\0${readlinkSync(absolutePath)}\0`);
      } else if (entry.isDirectory()) {
        hash.update(`dir\0${relativePath}\0`);
        visit(absolutePath);
      } else if (entry.isFile()) {
        hash.update(`file\0${relativePath}\0`);
        hash.update(readFileSync(absolutePath));
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
