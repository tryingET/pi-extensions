// summary: governed runtime materialization module (split from governed-runtime-materialization.ts).
// read_when:
//   - changing governed runtime asc verification.

import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  GOVERNED_RUNTIME_ASC_BUILD_RECEIPT_RELATIVE_PATHS,
  GOVERNED_RUNTIME_ASC_COMPILER,
  GOVERNED_RUNTIME_ASC_RUNTIME_FILES,
} from "./governed-runtime-constants.ts";
import {
  digestDirectory,
  git,
  ownerPackageRoot,
  pathInside,
  readJsonNoFollow,
  readRegularFileNoFollow,
  sameJson,
  sha256,
} from "./governed-runtime-fs-integrity.ts";
import {
  governedRuntimeAscBuildEnvironment,
  inspectGovernedRuntimeExecutable,
} from "./governed-runtime-npm-policy.ts";
import type { GovernedRuntimePackageLock } from "./governed-runtime-peer-closure.ts";
import type {
  GovernedRuntimeAscBuildPassReceipt,
  GovernedRuntimeAscDerivationProof,
  GovernedRuntimeAscRuntimeProof,
  GovernedRuntimeCompilerProof,
  GovernedRuntimeExecutableProof,
  GovernedRuntimeNpmPolicyProof,
  GovernedRuntimeOutputEntry,
} from "./governed-runtime-proofs.ts";
import { GovernedRuntimeMaterializationError } from "./governed-runtime-proofs.ts";

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
