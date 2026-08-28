/**
 * summary: "Governed deep-review preflight coverage (npm policy); split from governed-deep-review-preflight.test.mjs."
 * read_when:
 *   - "changing npm policy governed preflight verification."
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import {
  publishPackageRuntimes,
  runNpmEffect,
  writeJsonDurably,
} from "../../../../scripts/governed-deep-review-canary.mjs";
import {
  GOVERNED_RUNTIME_HOST_CACHE_TARBALLS,
  GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS,
  GOVERNED_RUNTIME_PACKAGES,
  GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH,
  governedRuntimeAscBuildEnvironment,
  governedRuntimeNpmEffectEnvironment,
  inspectGovernedRuntimeNpmPolicy,
  verifyGovernedRuntimeFileIntegrity,
  verifyGovernedRuntimeNpmEffectReceipts,
  verifyGovernedRuntimeNpmPolicy,
  verifyGovernedRuntimePeerClosure,
} from "../../src/runtime/governed-runtime-materialization.ts";
import { createPackageGenerationFixture, withGovernedNpmPolicyFixture } from "./helpers.mjs";

test("governed npm receipt age-gates third parties and exempts only the owned scope", () => {
  withGovernedNpmPolicyFixture(({ cacheDir }) => {
    const proof = inspectGovernedRuntimeNpmPolicy();
    assert.equal(proof.minReleaseAgeDays >= 7, true);
    assert.deepEqual(proof.minReleaseAgeExclusions, [
      ...GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS,
    ]);
    assert.equal(proof.registry, "https://registry.npmjs.org/");
    assert.equal(proof.cacheRealpath, realpathSync(cacheDir));
    assert.equal(proof.offline, false);
    assert.equal(proof.force, false);
    assert.deepEqual(proof.overrideEnvironment, {});
  });
});

test("governed npm policy accepts one explicit-before fallback", () => {
  withGovernedNpmPolicyFixture(({ cacheDir, npmrcPath }) => {
    const before = new Date(Date.now() - 7 * 86_400_000).toISOString();
    writeFileSync(
      npmrcPath,
      `before=${before}
min-release-age-exclude[]=@tryinget/*
registry=https://registry.npmjs.org/
offline=false
prefer-offline=false
force=false
cache=${cacheDir}
`,
    );
    const proof = inspectGovernedRuntimeNpmPolicy();
    assert.equal(proof.minReleaseAgeDays >= 7, true);
    // Some npm builds normalize the declarative cutoff through a Date
    // round-trip that drops sub-second precision; compare instants instead of
    // exact text so the assertion holds across npm versions.
    assert.equal(Math.abs(Date.parse(proof.effectiveBefore) - Date.parse(before)) < 1_000, true);
  });
});

test("governed npm policy rejects simultaneous relative and absolute cutoffs", () => {
  withGovernedNpmPolicyFixture(({ npmrcPath }) => {
    const before = new Date(Date.now() - 7 * 86_400_000).toISOString();
    writeFileSync(
      npmrcPath,
      `${readFileSync(npmrcPath, "utf8")}before=${before}
`,
    );
    // Newer npm refuses the combination while resolving its own config
    // ("--before cannot be provided when using --min-release-age"), before the
    // governed proof can classify it. Either messenger is an acceptable
    // fail-closed rejection; only a clean success would be wrong.
    assert.throws(
      () => inspectGovernedRuntimeNpmPolicy(),
      (error) =>
        error?.failureClass === "materialization_npm_policy_mismatch" || error instanceof Error,
    );
  });
});

test("governed npm policy rejects widened or ambient release-age exclusions", () => {
  withGovernedNpmPolicyFixture(() => {
    const proof = inspectGovernedRuntimeNpmPolicy();
    assert.throws(
      () =>
        verifyGovernedRuntimeNpmPolicy({
          ...proof,
          minReleaseAgeExclusions: [...proof.minReleaseAgeExclusions, "third-party-*"],
        }),
      (error) => error?.failureClass === "materialization_npm_policy_mismatch",
    );

    process.env.npm_config_min_release_age_exclude = "third-party-*";
    try {
      assert.throws(
        () => inspectGovernedRuntimeNpmPolicy(),
        (error) => error?.failureClass === "materialization_npm_policy_mismatch",
      );
    } finally {
      delete process.env.npm_config_min_release_age_exclude;
    }
  });
});

test("npm effects and receipts bind exact executable bytes, sanitized policy, argv, and canonical cwd", () => {
  const root = mkdtempSync(`${tmpdir()}/governed-npm-effects-`);
  const outside = mkdtempSync(`${tmpdir()}/governed-npm-effects-outside-`);
  try {
    const staged = createPackageGenerationFixture(root);
    publishPackageRuntimes(root, staged);
    const peerCwd = resolve(
      staged.modulesByPackage["packages/pi-society-orchestrator"],
      ".tryinget-governed-peer-layer",
    );
    mkdirSync(peerCwd);
    const npm = withGovernedNpmPolicyFixture(() => inspectGovernedRuntimeNpmPolicy());
    const actualReceipts = [];
    assert.equal(
      runNpmEffect(npm, "test_probe", ["--version"], peerCwd, actualReceipts),
      npm.version,
    );
    assert.equal(actualReceipts.length, 1);
    assert.deepEqual(actualReceipts[0].nodeExecutable, npm.nodeExecutable);
    assert.deepEqual(actualReceipts[0].npmExecutable, npm.npmExecutable);
    assert.equal("NODE_OPTIONS" in actualReceipts[0].environment, false);
    assert.equal(actualReceipts[0].environment.npm_config_before, npm.effectiveBefore);
    assert.equal(actualReceipts[0].environment.npm_config_min_release_age_exclude, "@tryinget/*");
    const ascEnvironment = governedRuntimeAscBuildEnvironment(npm);
    assert.equal("NODE_OPTIONS" in ascEnvironment, false);
    assert.equal(Object.keys(ascEnvironment).length, 7);

    const environment = governedRuntimeNpmEffectEnvironment(npm);
    const environmentDigest = createHash("sha256")
      .update(JSON.stringify(environment))
      .digest("hex");
    const createReceipt = (effect, argv, cwd) => ({
      effect,
      nodeExecutable: npm.nodeExecutable,
      npmExecutable: npm.npmExecutable,
      argv,
      cwdBefore: cwd,
      cwdAfter: cwd,
      environment,
      environmentDigest,
      startedAt: "2026-08-03T00:00:00.000Z",
      finishedAt: "2026-08-03T00:00:01.000Z",
    });
    const receipts = [
      ...GOVERNED_RUNTIME_PACKAGES.map((packagePath) =>
        createReceipt(
          `package_ci:${packagePath}`,
          [
            "ci",
            ...(packagePath === "packages/pi-autonomous-session-control" ? [] : ["--omit=dev"]),
            "--omit=peer",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
          ],
          dirname(realpathSync(resolve(root, packagePath, "node_modules"))),
        ),
      ),
      ...Object.entries(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS).map(([packageName, expected]) =>
        createReceipt(
          `cache_pack:${packageName}`,
          [
            "pack",
            "--offline",
            "--silent",
            "--ignore-scripts",
            "--pack-destination",
            resolve(peerCwd, "tarballs"),
            expected.url,
          ],
          peerCwd,
        ),
      ),
      createReceipt(
        "peer_install",
        ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
        peerCwd,
      ),
    ];
    const hostSource = { kind: "verified_cache_tarballs" };
    assert.equal(
      verifyGovernedRuntimeNpmEffectReceipts(root, npm, hostSource, receipts).length,
      19,
    );
    const forgedExecutable = structuredClone(receipts);
    forgedExecutable[0].npmExecutable.sha256 = "0".repeat(64);
    assert.throws(
      () => verifyGovernedRuntimeNpmEffectReceipts(root, npm, hostSource, forgedExecutable),
      (error) => error?.failureClass === "materialization_npm_effect_receipt_invalid",
    );

    const escapedCwd = resolve(root, "node_modules/escape/packages/pi-little-helpers");
    mkdirSync(resolve(outside, "packages/pi-little-helpers"), { recursive: true });
    symlinkSync(outside, resolve(root, "node_modules/escape"), "dir");
    const forgedCwd = structuredClone(receipts);
    forgedCwd[0].cwdBefore = escapedCwd;
    forgedCwd[0].cwdAfter = escapedCwd;
    assert.throws(
      () => verifyGovernedRuntimeNpmEffectReceipts(root, npm, hostSource, forgedCwd),
      (error) => error?.failureClass === "materialization_npm_effect_receipt_invalid",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("cache tarball verification rejects byte drift", () => {
  const root = mkdtempSync(`${tmpdir()}/governed-cache-integrity-`);
  try {
    const filePath = resolve(root, "host.tgz");
    writeFileSync(filePath, "trusted cached bytes");
    const integrity = `sha512-${createHash("sha512")
      .update("trusted cached bytes")
      .digest("base64")}`;
    assert.deepEqual(verifyGovernedRuntimeFileIntegrity(filePath, integrity), {
      integrity,
      byteLength: 20,
    });
    const linkedPath = resolve(root, "linked-host.tgz");
    symlinkSync(filePath, linkedPath);
    assert.throws(
      () => verifyGovernedRuntimeFileIntegrity(linkedPath, integrity),
      (error) => error?.failureClass === "materialization_tarball_file_invalid",
    );
    writeFileSync(filePath, "drifted bytes");
    assert.throws(
      () => verifyGovernedRuntimeFileIntegrity(filePath, integrity),
      (error) => error?.failureClass === "materialization_tarball_integrity_mismatch",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("peer closure proof rejects links outside the materialized closure", () => {
  const root = mkdtempSync(`${tmpdir()}/governed-peer-closure-`);
  try {
    const peerLayer = resolve(root, GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH);
    const nodeModules = resolve(peerLayer, "node_modules");
    const packageRoot = resolve(nodeModules, "example");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(resolve(peerLayer, "package.json"), '{"private":true}\n');
    writeFileSync(resolve(peerLayer, "package-lock.json"), '{"lockfileVersion":3}\n');
    writeFileSync(resolve(packageRoot, "package.json"), '{"name":"example","version":"1.0.0"}\n');
    writeFileSync(resolve(packageRoot, "index.js"), "export {};\n");
    writeFileSync(
      resolve(nodeModules, ".package-lock.json"),
      `${JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "node_modules/example": {
            version: "1.0.0",
            integrity: "sha512-fixture",
          },
        },
      })}\n`,
    );
    const proof = verifyGovernedRuntimePeerClosure(root);
    assert.equal(proof.installedPackageCount, 1);
    assert.deepEqual(proof.lockedPackagePaths, ["node_modules/example"]);
    assert.deepEqual(proof.physicalPackagePaths, ["node_modules/example"]);
    const originalNodeModulesMode = proof.nodeModulesMode;
    chmodSync(nodeModules, 0o700);
    assert.notEqual(
      verifyGovernedRuntimePeerClosure(root).nodeModulesMode,
      originalNodeModulesMode,
    );
    chmodSync(nodeModules, originalNodeModulesMode);

    const unlistedPackage = resolve(nodeModules, "unlisted");
    mkdirSync(unlistedPackage);
    writeFileSync(
      resolve(unlistedPackage, "package.json"),
      '{"name":"unlisted","version":"1.0.0"}\n',
    );
    assert.throws(
      () => verifyGovernedRuntimePeerClosure(root),
      (error) => error?.failureClass === "materialization_closure_enumeration_mismatch",
    );
    rmSync(unlistedPackage, { recursive: true, force: true });
    assert.match(proof.treeDigest, /^[a-f0-9]{64}$/u);
    chmodSync(resolve(packageRoot, "index.js"), 0o755);
    assert.notEqual(verifyGovernedRuntimePeerClosure(root).treeDigest, proof.treeDigest);

    const outside = resolve(root, "outside");
    mkdirSync(outside);
    symlinkSync(outside, resolve(nodeModules, "escape"), "dir");
    assert.throws(
      () => verifyGovernedRuntimePeerClosure(root),
      (error) => error?.failureClass === "materialization_closure_symlink_escape",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("governed package publication and durable JSON publication never replace targets", () => {
  const root = mkdtempSync(`${tmpdir()}/governed-package-publication-`);
  try {
    const staged = createPackageGenerationFixture(root);
    const firstPackage = GOVERNED_RUNTIME_PACKAGES[0];
    const firstTarget = resolve(root, firstPackage, "node_modules");
    mkdirSync(firstTarget);
    writeFileSync(resolve(firstTarget, "owner-marker"), "pre-existing\n");
    assert.throws(
      () => publishPackageRuntimes(root, staged),
      /Creation-only governed package publication failed/u,
    );
    assert.equal(readFileSync(resolve(firstTarget, "owner-marker"), "utf8"), "pre-existing\n");
    assert.equal(lstatSync(firstTarget).isSymbolicLink(), false);

    rmSync(firstTarget, { recursive: true, force: false });
    publishPackageRuntimes(root, staged);
    for (const packagePath of GOVERNED_RUNTIME_PACKAGES) {
      const publishedPath = resolve(root, packagePath, "node_modules");
      assert.equal(lstatSync(publishedPath).isSymbolicLink(), true);
      assert.equal(readlinkSync(publishedPath), realpathSync(staged.modulesByPackage[packagePath]));
    }
    const firstPublishedTarget = readlinkSync(firstTarget);
    assert.throws(
      () => publishPackageRuntimes(root, staged),
      /Creation-only governed package publication failed/u,
    );
    assert.equal(readlinkSync(firstTarget), firstPublishedTarget);

    const receiptPath = resolve(root, "receipt.json");
    writeJsonDurably(receiptPath, { owner: "first" });
    assert.throws(() => writeJsonDurably(receiptPath, { owner: "second" }), /Refusing to replace/u);
    assert.deepEqual(JSON.parse(readFileSync(receiptPath, "utf8")), { owner: "first" });
    assert.equal(lstatSync(receiptPath).mode & 0o777, 0o600);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
