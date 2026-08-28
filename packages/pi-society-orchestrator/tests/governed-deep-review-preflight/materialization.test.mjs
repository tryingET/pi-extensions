/**
 * summary: "Governed deep-review preflight coverage (materialization proofs); split from governed-deep-review-preflight.test.mjs."
 * read_when:
 *   - "changing materialization proofs governed preflight verification."
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  acquireMaterializationLock,
  publishPackageRuntimes,
} from "../../../../scripts/governed-deep-review-canary.mjs";
import {
  GOVERNED_RUNTIME_ASC_COMPILER,
  GOVERNED_RUNTIME_ASC_RUNTIME_FILES,
  GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX,
  GOVERNED_RUNTIME_PACKAGES,
  inspectGovernedRuntimeAscRuntime,
  inspectGovernedRuntimeCleanliness,
  inspectGovernedRuntimeExecutable,
  inspectGovernedRuntimeLexicalNodeModules,
  verifyGovernedRuntimeAscBuildPassReceipts,
  verifyGovernedRuntimeNodeModulesLayout,
  verifyGovernedRuntimePackageClosures,
} from "../../src/runtime/governed-runtime-materialization.ts";
import { createPackageGenerationFixture, SOURCE_ROOT } from "./helpers.mjs";

test("governed materialization lock is process-external, exclusive, and TMPDIR-independent", () => {
  const container = mkdtempSync(`${tmpdir()}/governed-materialization-lock-`);
  const root = resolve(container, "source");
  const firstTmpdir = resolve(container, "tmp-a");
  const secondTmpdir = resolve(container, "tmp-b");
  mkdirSync(root);
  mkdirSync(firstTmpdir);
  mkdirSync(secondTmpdir);
  const previousTmpdir = process.env.TMPDIR;
  process.env.TMPDIR = firstTmpdir;
  let first;
  try {
    first = acquireMaterializationLock(root);
    assert.throws(
      () => acquireMaterializationLock(root),
      /Could not acquire exclusive governed materialization lock/u,
    );
    const scriptUrl = pathToFileURL(
      resolve(SOURCE_ROOT, "scripts/governed-deep-review-canary.mjs"),
    ).href;
    const childProgram = `import { acquireMaterializationLock } from ${JSON.stringify(scriptUrl)}; acquireMaterializationLock(${JSON.stringify(root)}).release();`;
    const blockedChild = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", childProgram],
      {
        encoding: "utf8",
        env: { ...process.env, TMPDIR: secondTmpdir },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    assert.notEqual(blockedChild.status, 0);
    assert.match(blockedChild.stderr, /Could not acquire exclusive governed materialization lock/u);

    first.release();
    first = undefined;
    const releasedChild = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", childProgram],
      {
        encoding: "utf8",
        env: { ...process.env, TMPDIR: secondTmpdir },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    assert.equal(releasedChild.status, 0, releasedChild.stderr);
  } finally {
    first?.release();
    if (previousTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previousTmpdir;
    rmSync(container, { recursive: true, force: true });
  }
});

test("published package closures bind locks, filesystem entries, symlinks, and local-owner absence", () => {
  const root = mkdtempSync(`${tmpdir()}/governed-package-closures-`);
  const outside = mkdtempSync(`${tmpdir()}/governed-package-closure-outside-`);
  try {
    const staged = createPackageGenerationFixture(root);
    publishPackageRuntimes(root, staged);
    const firstPackage = GOVERNED_RUNTIME_PACKAGES[0];
    const nodeModulesLayout = verifyGovernedRuntimeNodeModulesLayout(root);
    assert.equal(nodeModulesLayout.paths.length, GOVERNED_RUNTIME_PACKAGES.length + 1);
    assert.equal(nodeModulesLayout.generation.root, realpathSync(staged.stagingRoot));
    const originalRootMode = nodeModulesLayout.rootMode;
    chmodSync(nodeModulesLayout.root, 0o700);
    assert.notEqual(verifyGovernedRuntimeNodeModulesLayout(root).rootMode, originalRootMode);
    chmodSync(nodeModulesLayout.root, originalRootMode);

    const rogueRootEntry = resolve(nodeModulesLayout.root, "rogue-dependency");
    mkdirSync(rogueRootEntry);
    assert.throws(
      () => verifyGovernedRuntimeNodeModulesLayout(root),
      (error) => error?.failureClass === "materialization_node_modules_layout_invalid",
    );
    rmSync(rogueRootEntry, { recursive: true, force: true });

    const secondGeneration = resolve(
      nodeModulesLayout.root,
      `${GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX}00000000-0000-4000-8000-000000000003`,
    );
    mkdirSync(secondGeneration);
    assert.throws(
      () => verifyGovernedRuntimeNodeModulesLayout(root),
      (error) => error?.failureClass === "materialization_node_modules_layout_invalid",
    );
    rmSync(secondGeneration, { recursive: true, force: true });

    const escapingRootEntry = resolve(nodeModulesLayout.root, "escaping-root-entry");
    symlinkSync(outside, escapingRootEntry, "dir");
    assert.throws(
      () => verifyGovernedRuntimeNodeModulesLayout(root),
      (error) => error?.failureClass === "materialization_node_modules_layout_invalid",
    );
    rmSync(escapingRootEntry, { force: true });
    const firstModules = staged.modulesByPackage[firstPackage];
    const example = resolve(firstModules, "example");
    mkdirSync(example);
    writeFileSync(resolve(example, "package.json"), '{"name":"example","version":"1.0.0"}\n');
    writeFileSync(resolve(example, "index.js"), "export {};\n");
    writeFileSync(
      resolve(firstModules, ".package-lock.json"),
      `${JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "../pi-vault-client": {
            name: "@tryinget/pi-vault-client",
            version: "0.4.0",
          },
          "node_modules/example": {
            version: "1.0.0",
            integrity: "sha512-example",
          },
        },
      })}\n`,
    );
    const proof = verifyGovernedRuntimePackageClosures(root);
    assert.equal(Object.keys(proof).length, GOVERNED_RUNTIME_PACKAGES.length);
    assert.deepEqual(proof[firstPackage].lockedPackagePaths, ["node_modules/example"]);
    assert.deepEqual(proof[firstPackage].physicalPackagePaths, ["node_modules/example"]);
    assert.deepEqual(proof[firstPackage].localMetadataPaths, [
      {
        path: "../pi-vault-client",
        name: "@tryinget/pi-vault-client",
        version: "0.4.0",
      },
    ]);
    assert.equal(proof[firstPackage].publication.path, resolve(root, firstPackage, "node_modules"));
    assert.equal(proof[firstPackage].publication.target, realpathSync(firstModules));
    assert.equal(proof[firstPackage].publication.generationRoot, realpathSync(staged.stagingRoot));
    const originalTargetMode = proof[firstPackage].publication.targetMode;
    chmodSync(firstModules, 0o700);
    assert.notEqual(
      verifyGovernedRuntimePackageClosures(root)[firstPackage].publication.targetMode,
      originalTargetMode,
    );
    chmodSync(firstModules, originalTargetMode);

    const rogueNodeModules = resolve(
      root,
      "packages/pi-society-orchestrator/extensions/node_modules",
    );
    mkdirSync(rogueNodeModules, { recursive: true });
    assert.ok(
      inspectGovernedRuntimeLexicalNodeModules(root).includes(
        "packages/pi-society-orchestrator/extensions/node_modules",
      ),
    );
    assert.throws(
      () => verifyGovernedRuntimeNodeModulesLayout(root),
      (error) => error?.failureClass === "materialization_node_modules_layout_invalid",
    );
    rmSync(rogueNodeModules, { recursive: true, force: true });

    const nestedLocal = resolve(firstModules, "nested-local-owner");
    mkdirSync(nestedLocal);
    writeFileSync(
      resolve(nestedLocal, "package.json"),
      '{"name":"@tryinget/pi-vault-client","version":"0.4.0"}\n',
    );
    assert.throws(
      () => verifyGovernedRuntimePackageClosures(root),
      (error) => error?.failureClass === "materialization_nested_local_owner_copy",
    );
    rmSync(nestedLocal, { recursive: true, force: true });

    const secondModules = staged.modulesByPackage[GOVERNED_RUNTIME_PACKAGES[1]];
    symlinkSync(outside, resolve(secondModules, "escape"), "dir");
    assert.throws(
      () => verifyGovernedRuntimePackageClosures(root),
      (error) => error?.failureClass === "materialization_package_closure_symlink_escape",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("ASC runtime proof requires two retained complete derivation receipts", () => {
  const root = mkdtempSync(`${tmpdir()}/governed-asc-runtime-`);
  try {
    const ascRoot = resolve(root, "packages/pi-autonomous-session-control");
    const inputFiles = [
      "package.json",
      "tsconfig.json",
      "tsconfig.runtime.json",
      "scripts/build-runtime.mjs",
      "execution.ts",
      "extensions/self/runtime.ts",
    ];
    for (const relativePath of inputFiles) {
      const filePath = resolve(ascRoot, relativePath);
      mkdirSync(resolve(filePath, ".."), { recursive: true });
      const content =
        relativePath === "package.json"
          ? '{"name":"@tryinget/pi-autonomous-session-control","version":"0.3.0"}\n'
          : `${relativePath}\n`;
      writeFileSync(filePath, content);
    }
    const compilerLockEntry = {
      version: GOVERNED_RUNTIME_ASC_COMPILER.version,
      resolved: GOVERNED_RUNTIME_ASC_COMPILER.url,
      integrity: GOVERNED_RUNTIME_ASC_COMPILER.integrity,
    };
    writeFileSync(
      resolve(ascRoot, "package-lock.json"),
      `${JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": {},
          [`node_modules/${GOVERNED_RUNTIME_ASC_COMPILER.name}`]: compilerLockEntry,
        },
      })}\n`,
    );
    const ascNodeModules = resolve(
      root,
      "node_modules",
      `${GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX}00000000-0000-4000-8000-000000000002`,
      "packages/pi-autonomous-session-control/node_modules",
    );
    mkdirSync(ascNodeModules, { recursive: true });
    symlinkSync(ascNodeModules, resolve(ascRoot, "node_modules"), "dir");
    const compilerRoot = resolve(ascNodeModules, "@typescript/native-preview");
    mkdirSync(compilerRoot, { recursive: true });
    writeFileSync(
      resolve(compilerRoot, "package.json"),
      `${JSON.stringify({
        name: GOVERNED_RUNTIME_ASC_COMPILER.name,
        version: GOVERNED_RUNTIME_ASC_COMPILER.version,
      })}\n`,
    );
    writeFileSync(
      resolve(ascRoot, "node_modules/.package-lock.json"),
      `${JSON.stringify({
        lockfileVersion: 3,
        packages: {
          [`node_modules/${GOVERNED_RUNTIME_ASC_COMPILER.name}`]: compilerLockEntry,
        },
      })}\n`,
    );
    for (const relativePath of GOVERNED_RUNTIME_ASC_RUNTIME_FILES) {
      const filePath = resolve(ascRoot, "dist", relativePath);
      mkdirSync(resolve(filePath, ".."), { recursive: true });
      writeFileSync(filePath, `${relativePath}\n`);
    }
    const derivation = inspectGovernedRuntimeAscRuntime(root);
    assert.equal(derivation.compiler.version, GOVERNED_RUNTIME_ASC_COMPILER.version);
    assert.equal(derivation.compiler.integrity, GOVERNED_RUNTIME_ASC_COMPILER.integrity);
    assert.match(derivation.inputDigest, /^[a-f0-9]{64}$/u);
    assert.match(derivation.treeDigest, /^[a-f0-9]{64}$/u);
    const sourceCommit = "a".repeat(40);
    const execution = {
      nodeExecutable: inspectGovernedRuntimeExecutable(process.execPath),
      environment: {
        HOME: "/governed-home",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        PATH: "/governed-path",
        TEMP: "/governed-tmp",
        TMP: "/governed-tmp",
        TMPDIR: "/governed-tmp",
      },
    };
    const environmentDigest = createHash("sha256")
      .update(JSON.stringify(execution.environment))
      .digest("hex");
    const receipt = (ordinal, buildNonce) => ({
      schema: "pi.governed-asc-build-pass.v1",
      ordinal,
      buildNonce,
      sourceCommit,
      invocation: {
        executable: execution.nodeExecutable,
        argv: ["scripts/build-runtime.mjs"],
        cwdRole: "clean_output_rebuild",
        environment: execution.environment,
        environmentDigest,
      },
      inputHashes: derivation.inputHashes,
      inputDigest: derivation.inputDigest,
      compiler: derivation.compiler,
      outputEntries: derivation.outputEntries,
      treeDigest: derivation.treeDigest,
    });
    const receipts = [
      receipt(1, "11111111-1111-4111-8111-111111111111"),
      receipt(2, "22222222-2222-4222-8222-222222222222"),
    ];
    assert.doesNotThrow(() =>
      verifyGovernedRuntimeAscBuildPassReceipts(derivation, receipts, sourceCommit, execution),
    );
    const forged = structuredClone(receipts);
    forged[1].treeDigest = "0".repeat(64);
    assert.throws(
      () => verifyGovernedRuntimeAscBuildPassReceipts(derivation, forged, sourceCommit, execution),
      (error) => error?.failureClass === "materialization_asc_build_receipt_drift",
    );
    const forgedEnvironment = structuredClone(receipts);
    forgedEnvironment[0].invocation.environment.PATH = "/ambient-node-options-wrapper";
    assert.throws(
      () =>
        verifyGovernedRuntimeAscBuildPassReceipts(
          derivation,
          forgedEnvironment,
          sourceCommit,
          execution,
        ),
      (error) => error?.failureClass === "materialization_asc_build_receipt_drift",
    );
    writeFileSync(resolve(ascRoot, "execution.ts"), "drift\n");
    assert.notEqual(inspectGovernedRuntimeAscRuntime(root).inputDigest, derivation.inputDigest);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("governed runtime CLI rejects option values that are actually flags", () => {
  const script = resolve(SOURCE_ROOT, "scripts/governed-deep-review-canary.mjs");
  const result = spawnSync(
    process.execPath,
    [script, "verify", "--source-root", "--expected-commit", "0".repeat(40)],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--source-root requires a value/u);
});

test("runtime cleanliness rejects source drift but excludes node_modules", () => {
  const root = mkdtempSync(`${tmpdir()}/governed-runtime-cleanliness-`);
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("sh", ["-c", "printf tracked > tracked.txt"], { cwd: root });
    execFileSync("git", ["add", "tracked.txt"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
    assert.equal(inspectGovernedRuntimeCleanliness(root).clean, true);

    execFileSync("git", ["update-index", "--assume-unchanged", "tracked.txt"], { cwd: root });
    const assumeUnchanged = inspectGovernedRuntimeCleanliness(root);
    assert.equal(assumeUnchanged.clean, false);
    assert.ok(assumeUnchanged.trackedChanges.includes("index-flag:assume-unchanged:tracked.txt"));
    execFileSync("sh", ["-c", "printf hidden-drift >> tracked.txt"], { cwd: root });
    assert.ok(
      inspectGovernedRuntimeCleanliness(root).trackedChanges.some((entry) =>
        entry.includes("tracked-byte-drift:M:tracked.txt"),
      ),
    );
    execFileSync("git", ["update-index", "--no-assume-unchanged", "tracked.txt"], { cwd: root });
    execFileSync("git", ["checkout", "--", "tracked.txt"], { cwd: root });

    execFileSync("git", ["update-index", "--skip-worktree", "tracked.txt"], { cwd: root });
    const skipWorktree = inspectGovernedRuntimeCleanliness(root);
    assert.equal(skipWorktree.clean, false);
    assert.ok(skipWorktree.trackedChanges.includes("index-flag:skip-worktree:tracked.txt"));
    execFileSync("sh", ["-c", "printf hidden-drift >> tracked.txt"], { cwd: root });
    assert.ok(
      inspectGovernedRuntimeCleanliness(root).trackedChanges.some((entry) =>
        entry.includes("tracked-byte-drift:M:tracked.txt"),
      ),
    );
    execFileSync("git", ["update-index", "--no-skip-worktree", "tracked.txt"], { cwd: root });
    execFileSync("git", ["checkout", "--", "tracked.txt"], { cwd: root });

    execFileSync("sh", ["-c", "printf drift >> tracked.txt"], { cwd: root });
    assert.equal(inspectGovernedRuntimeCleanliness(root).clean, false);
    execFileSync("git", ["checkout", "--", "tracked.txt"], { cwd: root });

    execFileSync("sh", ["-c", "printf source > ordinary-untracked.ts"], { cwd: root });
    const untracked = inspectGovernedRuntimeCleanliness(root);
    assert.equal(untracked.clean, false);
    assert.deepEqual(untracked.untrackedSourcePaths, ["ordinary-untracked.ts"]);
    execFileSync("rm", ["ordinary-untracked.ts"], { cwd: root });

    mkdirSync(resolve(root, "node_modules/example"), { recursive: true });
    execFileSync("sh", ["-c", "printf generated > node_modules/example/index.js"], {
      cwd: root,
    });
    assert.equal(inspectGovernedRuntimeCleanliness(root).clean, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
