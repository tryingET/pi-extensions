/**
 * summary: "Governed deep-review preflight coverage (shared fixtures); split from governed-deep-review-preflight.test.mjs."
 * read_when:
 *   - "changing shared fixtures governed preflight verification."
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS } from "../../src/runtime/governed-runtime-constants.ts";
import {
  GOVERNED_RUNTIME_HOST_CACHE_TARBALLS,
  GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX,
  GOVERNED_RUNTIME_PACKAGES,
  governedRuntimeCacheTarballName,
} from "../../src/runtime/governed-runtime-materialization.ts";

export const SOURCE_ROOT = resolve(import.meta.dirname, "../../../..");
export const testRequire = createRequire(import.meta.url);
export const INSTALLED_ASC_EXTENSION_PATH = realpathSync(
  testRequire.resolve("@tryinget/pi-autonomous-session-control"),
);
export const INSTALLED_ASC_PACKAGE_ROOT = realpathSync(
  resolve(dirname(INSTALLED_ASC_EXTENSION_PATH), ".."),
);
export const LOCAL_ASC_EXTENSION_PATH = resolve(
  SOURCE_ROOT,
  "packages/pi-autonomous-session-control/extensions/self.ts",
);
export const CALLER_URL = pathToFileURL(
  resolve(SOURCE_ROOT, "packages/pi-little-helpers/src/visibleLoop.ts"),
).href;
export const TOOL_PATHS = {
  toolbox: resolve(SOURCE_ROOT, "packages/pi-toolbox-discovery/extensions/toolbox.ts"),
  orchestrator: resolve(
    SOURCE_ROOT,
    "packages/pi-society-orchestrator/extensions/society-orchestrator.ts",
  ),
  vault: resolve(SOURCE_ROOT, "packages/pi-vault-client/extensions/vault.js"),
  asc: INSTALLED_ASC_EXTENSION_PATH,
};

export function createVaultFixture(root) {
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

export function createPiRuntime(overrides = {}) {
  let activeTools = [...(overrides.activeTools ?? ["read"])];
  const ownerByTool = {
    toolbox: "toolbox",
    workflow_execute: "orchestrator",
    vault_execute_template: "orchestrator",
    vault_dispatch_check: "vault",
    dispatch_subagent: "asc",
  };
  const toolPaths = overrides.toolPaths ?? TOOL_PATHS;
  const allTools = Object.entries(ownerByTool).map(([name, owner]) => ({
    name,
    sourceInfo: {
      path: overrides.toolPathOverrides?.[name] ?? toolPaths[owner],
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

export async function withFixture(run) {
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

export function prepare(runtime, nonce, runId) {
  return runtime.prepare({
    nonce,
    runId,
    cwd: SOURCE_ROOT,
    callerModuleUrl: CALLER_URL,
  });
}

export function createHostLockFixture(kind) {
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

export function createPackageGenerationFixture(root) {
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

export function withGovernedNpmPolicyFixture(run) {
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
${GOVERNED_RUNTIME_NPM_RELEASE_AGE_EXCLUSIONS.filter((entry) => entry !== "@tryinget/*")
  .map((entry) => `min-release-age-exclude[]=${entry}`)
  .join("\n")}
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
  // Also scrub ambient npm_config_* policy overrides: when the gate runs via
  // `npm run` (e.g. the pre-push hook), npm exports user .npmrc policy
  // (min-release-age*, registry, ...) as environment variables. The governed
  // runtime must see none of them, exactly like a fresh CI runner.
  const keys = [
    "TMPDIR",
    "npm_config_userconfig",
    "npm_config_globalconfig",
    "npm_config_cache",
    "npm_config_before",
    "npm_config_force",
    "npm_config_min_release_age",
    "npm_config_min_release_age_exclude",
    "npm_config_offline",
    "npm_config_prefer_offline",
    "npm_config_registry",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(scratch, { recursive: true, force: true });
  };
  process.env.TMPDIR = scratch;
  process.env.npm_config_userconfig = npmrcPath;
  process.env.npm_config_globalconfig = globalrcPath;
  process.env.npm_config_cache = cacheDir;
  // Being listed above only saves/restores; policy overrides must additionally
  // be REMOVED while the fixture runs so the governed proof observes a clean
  // environment regardless of how the gate was invoked (direct or npm run).
  for (const key of keys) {
    if (
      key === "TMPDIR" ||
      key === "npm_config_userconfig" ||
      key === "npm_config_globalconfig" ||
      key === "npm_config_cache"
    ) {
      continue;
    }
    delete process.env[key];
  }
  let result;
  try {
    result = run({ scratch, cacheDir, npmrcPath });
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof result.then === "function") return result.finally(restore);
  restore();
  return result;
}

export function createImmutableMaterializationCandidate(scratch) {
  const stagingRoot = resolve(scratch, "candidate-staging");
  execFileSync("git", ["clone", "--local", "--no-hardlinks", SOURCE_ROOT, stagingRoot], {
    stdio: "ignore",
  });
  const workingDiff = execFileSync("git", ["-C", SOURCE_ROOT, "diff", "--binary", "HEAD"], {
    encoding: "buffer",
  });
  if (workingDiff.length > 0) {
    const applied = spawnSync("git", ["-C", stagingRoot, "apply", "--binary", "-"], {
      input: workingDiff,
      encoding: "buffer",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.equal(applied.status, 0, applied.stderr?.toString());
  }
  execFileSync("git", ["-C", stagingRoot, "add", "--all"]);
  execFileSync(
    "git",
    [
      "-C",
      stagingRoot,
      "-c",
      "user.name=Governed Fixture",
      "-c",
      "user.email=governed-fixture@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "governed materialization fixture",
    ],
    { stdio: "ignore" },
  );
  const commit = execFileSync("git", ["-C", stagingRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const candidateRoot = resolve(scratch, `candidate-${commit.slice(0, 8)}`);
  renameSync(stagingRoot, candidateRoot);
  return { candidateRoot, commit };
}

export function materializeProductionCandidate(candidateRoot, commit) {
  const result = spawnSync(
    process.execPath,
    [
      resolve(candidateRoot, "scripts/governed-deep-review-canary.mjs"),
      "materialize",
      "--source-root",
      candidateRoot,
      "--expected-commit",
      commit,
    ],
    {
      cwd: candidateRoot,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 50 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return { ok: true, stdout: result.stdout };
}
