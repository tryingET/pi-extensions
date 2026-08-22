import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  acquireMaterializationLock,
  publishPackageRuntimes,
  runNpmEffect,
  writeJsonDurably,
} from "../../../scripts/governed-deep-review-canary.mjs";
import {
  createGovernedDeepReviewPreflightRuntime,
  isGovernedDeepReviewPreflightRuntimeOwner,
} from "../src/runtime/governed-deep-review-preflight.ts";
import {
  classifyGovernedRuntimeHostLockEvidence,
  GOVERNED_RUNTIME_ASC_COMPILER,
  GOVERNED_RUNTIME_ASC_RUNTIME_FILES,
  GOVERNED_RUNTIME_HOST_CACHE_TARBALLS,
  GOVERNED_RUNTIME_HOST_PEERS,
  GOVERNED_RUNTIME_HOST_VERSION,
  GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS,
  GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX,
  GOVERNED_RUNTIME_PACKAGES,
  GOVERNED_RUNTIME_PEER_LAYER_RELATIVE_PATH,
  GOVERNED_RUNTIME_TYPEBOX_INTEGRITY,
  GOVERNED_RUNTIME_TYPEBOX_VERSION,
  governedRuntimeAscBuildEnvironment,
  governedRuntimeCacheTarballName,
  governedRuntimeNpmEffectEnvironment,
  inspectGovernedRuntimeAscRuntime,
  inspectGovernedRuntimeCleanliness,
  inspectGovernedRuntimeExecutable,
  inspectGovernedRuntimeLexicalNodeModules,
  inspectGovernedRuntimeNpmPolicy,
  verifyGovernedRuntimeAscBuildPassReceipts,
  verifyGovernedRuntimeFileIntegrity,
  verifyGovernedRuntimeNodeModulesLayout,
  verifyGovernedRuntimeNpmEffectReceipts,
  verifyGovernedRuntimeNpmPolicy,
  verifyGovernedRuntimePackageClosures,
  verifyGovernedRuntimePeerClosure,
} from "../src/runtime/governed-runtime-materialization.ts";

const SOURCE_ROOT = resolve(import.meta.dirname, "../../..");
const CALLER_URL = pathToFileURL(
  resolve(SOURCE_ROOT, "packages/pi-little-helpers/src/visibleLoop.ts"),
).href;
const TOOL_PATHS = {
  toolbox: resolve(SOURCE_ROOT, "packages/pi-toolbox-discovery/extensions/toolbox.ts"),
  orchestrator: resolve(
    SOURCE_ROOT,
    "packages/pi-society-orchestrator/extensions/society-orchestrator.ts",
  ),
  vault: resolve(SOURCE_ROOT, "packages/pi-vault-client/extensions/vault.js"),
  asc: resolve(SOURCE_ROOT, "packages/pi-autonomous-session-control/extensions/self.ts"),
};

function createVaultFixture(root) {
  execFileSync("dolt", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  execFileSync(
    "dolt",
    [
      "sql",
      "-q",
      [
        "CREATE TABLE prompt_templates (",
        "id INT PRIMARY KEY, name VARCHAR(64) NOT NULL, description TEXT, content TEXT,",
        "artifact_kind VARCHAR(32) NOT NULL, control_mode VARCHAR(32) NOT NULL,",
        "formalization_level VARCHAR(32) NOT NULL, owner_company VARCHAR(32) NOT NULL,",
        "visibility_companies JSON NOT NULL, controlled_vocabulary JSON,",
        "status VARCHAR(16) NOT NULL, export_to_pi BOOLEAN NOT NULL, version INT NOT NULL,",
        "UNIQUE KEY prompt_templates_name (name));",
        "INSERT INTO prompt_templates VALUES",
        "(1,'deep-review','Deep review','INERT','cognitive','one_shot','workflow','core','[\"core\",\"software\"]',NULL,'active',true,2);",
      ].join(" "),
    ],
    { cwd: root, stdio: "ignore" },
  );
}

function createPiRuntime(overrides = {}) {
  let activeTools = [...(overrides.activeTools ?? ["read"])];
  const ownerByTool = {
    toolbox: "toolbox",
    workflow_execute: "orchestrator",
    vault_execute_template: "orchestrator",
    vault_dispatch_check: "vault",
    dispatch_subagent: "asc",
  };
  const allTools = Object.entries(ownerByTool).map(([name, owner]) => ({
    name,
    sourceInfo: {
      path: overrides.toolPathOverrides?.[name] ?? TOOL_PATHS[owner],
    },
  }));
  return {
    getAllTools: () => allTools,
    getActiveTools: () => [...activeTools],
    setActiveTools(next) {
      activeTools = [...new Set(next)];
    },
  };
}

async function withFixture(run) {
  const scratch = mkdtempSync(`${tmpdir()}/governed-preflight-owner-`);
  const vaultDir = resolve(scratch, "vault");
  mkdirSync(vaultDir, { recursive: true });
  const previousVaultDir = process.env.VAULT_DIR;
  const previousCompany = process.env.PI_COMPANY;
  try {
    createVaultFixture(vaultDir);
    process.env.VAULT_DIR = vaultDir;
    process.env.PI_COMPANY = "software";
    await run(scratch);
  } finally {
    if (previousVaultDir === undefined) delete process.env.VAULT_DIR;
    else process.env.VAULT_DIR = previousVaultDir;
    if (previousCompany === undefined) delete process.env.PI_COMPANY;
    else process.env.PI_COMPANY = previousCompany;
    rmSync(scratch, { recursive: true, force: true });
  }
}

function prepare(runtime, nonce, runId) {
  return runtime.prepare({
    nonce,
    runId,
    cwd: SOURCE_ROOT,
    callerModuleUrl: CALLER_URL,
  });
}

function createHostLockFixture(kind) {
  const dependencies = {};
  const packages = { "": { dependencies } };
  for (const [packageName, expected] of Object.entries(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS)) {
    const tarballName = governedRuntimeCacheTarballName(packageName, expected.version);
    const selector =
      kind === "registry_resolution" ? expected.version : `file:tarballs/${tarballName}`;
    dependencies[packageName] = selector;
    packages[`node_modules/${packageName}`] = {
      version: expected.version,
      integrity: expected.integrity,
      resolved: kind === "registry_resolution" ? expected.url : selector,
    };
  }
  return {
    manifest: { dependencies: { ...dependencies } },
    regular: { lockfileVersion: 3, packages: structuredClone(packages) },
    hidden: {
      lockfileVersion: 3,
      packages: Object.fromEntries(
        Object.entries(packages).filter(([packagePath]) => Boolean(packagePath)),
      ),
    },
  };
}

function createPackageGenerationFixture(root) {
  const generationRoot = resolve(
    root,
    "node_modules",
    `${GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX}00000000-0000-4000-8000-000000000001`,
  );
  const modulesByPackage = {};
  for (const packagePath of GOVERNED_RUNTIME_PACKAGES) {
    mkdirSync(resolve(root, packagePath), { recursive: true });
    const nodeModules = resolve(generationRoot, packagePath, "node_modules");
    mkdirSync(nodeModules, { recursive: true });
    writeFileSync(
      resolve(nodeModules, ".package-lock.json"),
      `${JSON.stringify({ lockfileVersion: 3, packages: {} })}\n`,
    );
    modulesByPackage[packagePath] = nodeModules;
  }
  return { stagingRoot: generationRoot, modulesByPackage };
}

test("governed runtime pins match the Pi 0.83 lock identities", () => {
  const lock = JSON.parse(
    readFileSync(
      resolve(SOURCE_ROOT, "packages/pi-society-orchestrator/package-lock.json"),
      "utf8",
    ),
  );
  const lockedPackages = lock.packages ?? {};

  assert.equal(GOVERNED_RUNTIME_HOST_VERSION, "0.83.0");
  for (const [name, expected] of Object.entries(GOVERNED_RUNTIME_HOST_PEERS)) {
    const direct = lockedPackages[`node_modules/${name}`];
    const nested = Object.entries(lockedPackages).find(([packagePath]) =>
      packagePath.endsWith(`/node_modules/${name}`),
    )?.[1];
    const locked = direct ?? nested;
    assert.equal(locked?.version, GOVERNED_RUNTIME_HOST_VERSION, name);
    if (locked?.integrity !== undefined) assert.equal(locked.integrity, expected.integrity, name);
    assert.equal(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS[name].integrity, expected.integrity, name);
  }

  assert.equal(GOVERNED_RUNTIME_TYPEBOX_VERSION, "1.3.7");
  const lockedTypebox = lockedPackages["node_modules/typebox"];
  assert.equal(lockedTypebox?.version, GOVERNED_RUNTIME_TYPEBOX_VERSION);
  assert.equal(lockedTypebox?.integrity, GOVERNED_RUNTIME_TYPEBOX_INTEGRITY);
});

test("cache-backed host closure pins all four Pi 0.83 runtime owners", () => {
  assert.deepEqual(Object.keys(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS), [
    "@earendil-works/pi-ai",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-tui",
  ]);
  for (const expected of Object.values(GOVERNED_RUNTIME_HOST_CACHE_TARBALLS)) {
    assert.equal(expected.version, GOVERNED_RUNTIME_HOST_VERSION);
    assert.match(expected.url, /^https:\/\/registry\.npmjs\.org\//u);
    assert.match(expected.integrity, /^sha512-/u);
  }
});

test("host provenance is derived from all four regular and hidden lock entries", () => {
  const registry = createHostLockFixture("registry_resolution");
  assert.equal(
    classifyGovernedRuntimeHostLockEvidence(registry.manifest, registry.regular, registry.hidden)
      .kind,
    "registry_resolution",
  );
  const cache = createHostLockFixture("verified_cache_tarballs");
  assert.equal(
    classifyGovernedRuntimeHostLockEvidence(cache.manifest, cache.regular, cache.hidden).kind,
    "verified_cache_tarballs",
  );

  const packageName = "@earendil-works/pi-agent-core";
  const expected = GOVERNED_RUNTIME_HOST_CACHE_TARBALLS[packageName];
  const tarballName = governedRuntimeCacheTarballName(packageName, expected.version);
  const selector = `file:tarballs/${tarballName}`;
  registry.manifest.dependencies[packageName] = selector;
  registry.regular.packages[""].dependencies[packageName] = selector;
  registry.regular.packages[`node_modules/${packageName}`].resolved = selector;
  registry.hidden.packages[`node_modules/${packageName}`].resolved = selector;
  assert.throws(
    () =>
      classifyGovernedRuntimeHostLockEvidence(registry.manifest, registry.regular, registry.hidden),
    (error) => error?.failureClass === "materialization_host_lock_mixed_provenance",
  );
});

/**
 * Provisions a self-contained governed-npm posture instead of borrowing the
 * operator's ambient environment. The gate must not depend on machine-local
 * ~/.npmrc contents (min-release-age) or an exported TMPDIR; a fresh CI runner
 * has neither, which made these tests fail there while passing locally.
 */
function withGovernedNpmPolicyFixture(run) {
  const scratch = mkdtempSync(join(tmpdir(), "governed-npm-policy-"));
  const cacheDir = join(scratch, "cache");
  mkdirSync(cacheDir, { recursive: true });
  const npmrcPath = join(scratch, "npmrc");
  // npm derives a runtime-only flat `before` option from this declarative
  // relative policy. The governed proof reads min-release-age directly because
  // `npm config get before` exposes only a raw explicit cutoff, not the derived
  // flat option used by install resolution.
  writeFileSync(
    npmrcPath,
    `min-release-age=7
min-release-age-exclude[]=@tryinget/*
registry=https://registry.npmjs.org/
offline=false
prefer-offline=false
force=false
cache=${cacheDir}
`,
  );
  // npm forbids loading one file as both user and global config; give global an
  // empty fixture so ambient /etc/npmrc cannot leak machine-local policy in.
  const globalrcPath = join(scratch, "globalrc");
  writeFileSync(globalrcPath, "");
  const keys = ["TMPDIR", "npm_config_userconfig", "npm_config_globalconfig", "npm_config_cache"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.TMPDIR = scratch;
    process.env.npm_config_userconfig = npmrcPath;
    process.env.npm_config_globalconfig = globalrcPath;
    process.env.npm_config_cache = cacheDir;
    return run({ scratch, cacheDir, npmrcPath });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

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
    assert.equal(proof.effectiveBefore, before);
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
    assert.throws(
      () => inspectGovernedRuntimeNpmPolicy(),
      (error) => error?.failureClass === "materialization_npm_policy_mismatch",
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

test("a newer owner runtime revokes stale same-root runtime attestation", () => {
  const first = createGovernedDeepReviewPreflightRuntime(createPiRuntime(), {
    requireMaterializationManifest: false,
  });
  assert.equal(isGovernedDeepReviewPreflightRuntimeOwner(first), true);
  const second = createGovernedDeepReviewPreflightRuntime(createPiRuntime(), {
    requireMaterializationManifest: false,
  });
  assert.equal(isGovernedDeepReviewPreflightRuntimeOwner(first), false);
  assert.equal(isGovernedDeepReviewPreflightRuntimeOwner(second), true);
});

test("owner preflight binds the exact tool call and owner-brands its receipt", async () => {
  await withFixture(async (scratch) => {
    const pi = createPiRuntime();
    const runtime = createGovernedDeepReviewPreflightRuntime(pi, {
      requireMaterializationManifest: false,
      dispatchReceiptPath: resolve(scratch, "handoffs.jsonl"),
    });
    assert.equal(isGovernedDeepReviewPreflightRuntimeOwner(runtime), true);

    const result = await prepare(runtime, "11111111-1111-4111-8111-111111111111", "run-1");
    assert.equal(result.ok, true, result.ok ? "" : result.error);
    assert.equal(runtime.verifyReceipt(result.receipt), true);
    assert.equal(runtime.verifyReceipt({ ...result.receipt }), false);
    assert.equal(runtime.bindToolCall(result.receipt.nonce, "tool-call-1"), true);
    assert.deepEqual(
      runtime.claimForExecution({
        templateName: "deep-review",
        cwd: SOURCE_ROOT,
        toolCallId: "wrong-call",
      }),
      {
        ok: false,
        error: "Governed deep-review tool call does not match the pending loop preflight.",
      },
    );
    const claimed = runtime.claimForExecution({
      templateName: "deep-review",
      cwd: SOURCE_ROOT,
      toolCallId: "tool-call-1",
    });
    assert.equal(claimed.ok, true);
    assert.equal(claimed.receipt, result.receipt);
    assert.equal(runtime.settleExecution(result.receipt.nonce, "done"), true);
    assert.equal(runtime.verifyReceipt(result.receipt), false);
    assert.deepEqual(pi.getActiveTools(), ["read"]);
  });
});

test("overlapping preflight leases retain tools until the final owner settles", async () => {
  await withFixture(async (scratch) => {
    const pi = createPiRuntime({ activeTools: ["read", "workflow_execute"] });
    const runtime = createGovernedDeepReviewPreflightRuntime(pi, {
      requireMaterializationManifest: false,
      dispatchReceiptPath: resolve(scratch, "handoffs.jsonl"),
    });
    const first = await prepare(runtime, "22222222-2222-4222-8222-222222222222", "run-a");
    const second = await prepare(runtime, "33333333-3333-4333-8333-333333333333", "run-b");
    assert.equal(first.ok, true, first.ok ? "" : first.error);
    assert.equal(second.ok, true, second.ok ? "" : second.error);
    assert.deepEqual(
      new Set(pi.getActiveTools()),
      new Set(["read", "workflow_execute", "toolbox", "vault_execute_template"]),
    );

    assert.equal(runtime.cancel(first.receipt.nonce), true);
    assert.deepEqual(
      new Set(pi.getActiveTools()),
      new Set(["read", "workflow_execute", "toolbox", "vault_execute_template"]),
    );
    assert.equal(runtime.cancel(second.receipt.nonce), true);
    assert.deepEqual(pi.getActiveTools(), ["read", "workflow_execute"]);
  });
});

test("preflight rejects a registered tool from the wrong exact owner extension", async () => {
  await withFixture(async (scratch) => {
    const pi = createPiRuntime({
      toolPathOverrides: { vault_dispatch_check: TOOL_PATHS.orchestrator },
    });
    const runtime = createGovernedDeepReviewPreflightRuntime(pi, {
      requireMaterializationManifest: false,
      dispatchReceiptPath: resolve(scratch, "handoffs.jsonl"),
    });
    const result = await prepare(runtime, "44444444-4444-4444-8444-444444444444", "run-wrong");
    assert.equal(result.ok, false);
    assert.equal(result.failureClass, "registered_tool_source_path_mismatch");
    assert.match(result.error, /vault_dispatch_check resolves from/);
    assert.deepEqual(pi.getActiveTools(), ["read"]);
  });
});
