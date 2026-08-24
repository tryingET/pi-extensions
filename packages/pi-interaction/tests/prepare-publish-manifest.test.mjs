import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseNpmPackJson } from "../../../scripts/npm-pack-json.mjs";

const groupDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lifecycleScript = path.join(groupDir, "scripts", "prepare-publish-manifest.mjs");
const backupName = ".package.json.prepack.backup";
const lockName = ".package.json.publish-manifest.lock";
const guardName = ".package.json.publish-manifest.guard";
const recoveryName = ".package.json.publish-manifest.recovery";
const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];
const quickCheck =
  "node --test ../tests/prepare-publish-manifest.test.mjs && node ../scripts/release-check-package.mjs";

function pathEntryExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createFixture(
  t,
  { dependencyName = "@fixture/dependency", dependencyVersion = "1.2.3" } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-manifest-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dependencyDir = path.join(root, "dependency");
  const packageDir = path.join(root, "consumer");
  fs.mkdirSync(dependencyDir);
  fs.mkdirSync(packageDir);
  writeJson(path.join(dependencyDir, "package.json"), {
    name: dependencyName,
    version: dependencyVersion,
    type: "module",
    main: "index.js",
  });
  fs.writeFileSync(path.join(dependencyDir, "index.js"), "export const value = 1;\n", "utf8");

  const manifest = {
    name: "@fixture/consumer",
    version: "4.5.6",
    type: "module",
    main: "index.js",
    files: ["index.js"],
    scripts: {
      prepack: `node ${JSON.stringify(lifecycleScript)} prepack`,
      postpack: `node ${JSON.stringify(lifecycleScript)} postpack`,
      postpublish: `node ${JSON.stringify(lifecycleScript)} postpublish`,
    },
    dependencies: { [dependencyName]: "file:../dependency" },
  };
  const packageJsonPath = path.join(packageDir, "package.json");
  writeJson(packageJsonPath, manifest);
  fs.writeFileSync(path.join(packageDir, "index.js"), "export const consumer = true;\n", "utf8");

  return {
    root,
    packageDir,
    packageJsonPath,
    backupPath: path.join(packageDir, backupName),
    lockPath: path.join(packageDir, lockName),
    guardPath: path.join(packageDir, guardName),
    recoveryPath: path.join(packageDir, recoveryName),
    originalText: fs.readFileSync(packageJsonPath, "utf8"),
    dependencyName,
    dependencyVersion,
  };
}

function lifecycleEnv(
  mode,
  {
    owner = "fixture-owner",
    npmCommand = "publish",
    npmMajor = 11,
    holdGuardMilliseconds = 0,
  } = {},
) {
  const env = {
    ...process.env,
    npm_command: npmCommand,
    npm_lifecycle_event: mode,
    npm_config_user_agent: `npm/${npmMajor}.13.0 node/v26.7.0 linux x64 workspaces/false`,
  };
  if (holdGuardMilliseconds > 0) {
    env.NODE_ENV = "test";
    env.PI_PUBLISH_MANIFEST_TEST_HOLD_GUARD_MS = String(holdGuardMilliseconds);
  }
  if (owner) {
    env.PI_PUBLISH_MANIFEST_OWNER = owner;
    env.PI_PUBLISH_MANIFEST_OWNER_PID = String(process.pid);
  } else {
    delete env.PI_PUBLISH_MANIFEST_OWNER;
    delete env.PI_PUBLISH_MANIFEST_OWNER_PID;
  }
  return env;
}

function runLifecycle(fixture, mode, options) {
  return execFileSync(process.execPath, [lifecycleScript, mode], {
    cwd: fixture.packageDir,
    env: lifecycleEnv(mode, options),
    encoding: "utf8",
  });
}

function spawnLifecycle(fixture, mode, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [lifecycleScript, mode], {
      cwd: fixture.packageDir,
      env: lifecycleEnv(mode, options),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function assertPrepared(fixture) {
  const manifest = JSON.parse(fs.readFileSync(fixture.packageJsonPath, "utf8"));
  assert.equal(manifest.dependencies[fixture.dependencyName], fixture.dependencyVersion);
  for (const field of dependencyFields) {
    for (const spec of Object.values(manifest[field] ?? {})) {
      assert.equal(String(spec).startsWith("file:"), false);
    }
  }
  assert.equal(fs.existsSync(fixture.backupPath), true);
  assert.equal(fs.existsSync(fixture.lockPath), true);
  return manifest;
}

function assertRestored(fixture) {
  assert.equal(fs.readFileSync(fixture.packageJsonPath, "utf8"), fixture.originalText);
  assert.equal(fs.existsSync(fixture.backupPath), false);
  assert.equal(fs.existsSync(fixture.lockPath), false);
  assert.equal(pathEntryExists(fixture.guardPath), false);
  assert.equal(pathEntryExists(fixture.recoveryPath), false);
}

function seedOrdinaryGuard(fixture, owner) {
  fs.mkdirSync(fixture.guardPath);
  if (owner) writeJson(path.join(fixture.guardPath, "owner.json"), owner);
}

test("all consumers use the complete lifecycle and consolidated quick check", () => {
  const consumers = fs
    .readdirSync(groupDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && fs.existsSync(path.join(groupDir, entry.name, "package.json")),
    )
    .map((entry) => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(groupDir, entry.name, "package.json"), "utf8"),
      );
      return { directory: entry.name, scripts: manifest.scripts ?? {} };
    })
    .filter(
      ({ scripts }) => scripts.prepack === "node ../scripts/prepare-publish-manifest.mjs prepack",
    );

  assert.deepEqual(consumers.map(({ directory }) => directory).sort(), [
    "pi-editor-registry",
    "pi-interaction",
    "pi-interaction-kit",
    "pi-runtime-registry",
    "pi-trigger-adapter",
  ]);
  for (const { directory, scripts } of consumers) {
    assert.equal(
      scripts.postpack,
      "node ../scripts/prepare-publish-manifest.mjs postpack",
      `${directory} postpack`,
    );
    assert.equal(
      scripts.postpublish,
      "node ../scripts/prepare-publish-manifest.mjs postpublish",
      `${directory} postpublish`,
    );
    assert.equal(scripts["release:check:quick"], quickCheck, `${directory} quick check`);
  }
});

test("npm pack contains exact versions and releases lifecycle ownership", (t) => {
  const fixture = createFixture(t);
  const artifactDir = path.join(fixture.root, "artifacts");
  fs.mkdirSync(artifactDir);
  const output = execFileSync("npm", ["pack", "--json", "--pack-destination", artifactDir], {
    cwd: fixture.packageDir,
    env: { ...process.env, TMPDIR: fixture.root },
    encoding: "utf8",
  });
  const [{ filename }] = [parseNpmPackJson(output)];
  const packedText = execFileSync(
    "tar",
    ["-xOf", path.join(artifactDir, filename), "package/package.json"],
    { encoding: "utf8" },
  );
  const packedManifest = JSON.parse(packedText);
  assert.equal(packedManifest.dependencies[fixture.dependencyName], fixture.dependencyVersion);
  assert.equal(packedText.includes('"file:'), false);
  assertRestored(fixture);
  console.log(`packed projection: ${JSON.stringify(packedManifest.dependencies)}`);
});

test("modeled npm 11 publish retains exact versions and postpublish releases ownership", (t) => {
  const fixture = createFixture(t);
  runLifecycle(fixture, "prepack");
  runLifecycle(fixture, "postpack");
  const publishReady = assertPrepared(fixture);
  console.log(`publish-ready projection: ${JSON.stringify(publishReady.dependencies)}`);
  runLifecycle(fixture, "postpublish");
  assertRestored(fixture);
});

test("modeled npm 12 publish retains exact versions and postpublish releases ownership", (t) => {
  const fixture = createFixture(t);
  runLifecycle(fixture, "prepack", { npmMajor: 12 });
  runLifecycle(fixture, "postpack", { npmMajor: 12 });
  const publishReady = assertPrepared(fixture);
  console.log(`publish-ready projection: ${JSON.stringify(publishReady.dependencies)}`);
  runLifecycle(fixture, "postpublish", { npmMajor: 12 });
  assertRestored(fixture);
});

test("concurrent lifecycle processes cannot steal or restore the active owner", async (t) => {
  const fixture = createFixture(t);
  const [first, second] = await Promise.all([
    spawnLifecycle(fixture, "prepack", { owner: "concurrent-a" }),
    spawnLifecycle(fixture, "prepack", { owner: "concurrent-b" }),
  ]);
  const winner = first.status === 0 ? "concurrent-a" : "concurrent-b";
  const loser = winner === "concurrent-a" ? "concurrent-b" : "concurrent-a";
  const failed = first.status === 0 ? second : first;
  assert.equal([first.status, second.status].filter((status) => status === 0).length, 1);
  assert.match(failed.stderr, /active lifecycle owner/);
  assertPrepared(fixture);

  const hostilePostpack = spawnSync(process.execPath, [lifecycleScript, "postpack"], {
    cwd: fixture.packageDir,
    env: lifecycleEnv("postpack", { owner: loser }),
    encoding: "utf8",
  });
  assert.notEqual(hostilePostpack.status, 0);
  assert.match(hostilePostpack.stderr, /active owner|active lifecycle owner/);
  assertPrepared(fixture);

  runLifecycle(fixture, "postpublish", { owner: winner });
  assertRestored(fixture);
});

test("simultaneous stale recoverers cannot delete a replacement live guard", async (t) => {
  const fixture = createFixture(t);
  seedOrdinaryGuard(fixture, {
    kind: "process",
    id: "guard:stale-owner",
    pid: 999_999_999,
    startTime: "dead",
  });

  const [first, second] = await Promise.all([
    spawnLifecycle(fixture, "prepack", {
      owner: "stale-recoverer-a",
      holdGuardMilliseconds: 250,
    }),
    spawnLifecycle(fixture, "prepack", {
      owner: "stale-recoverer-b",
      holdGuardMilliseconds: 250,
    }),
  ]);
  const winner = first.status === 0 ? "stale-recoverer-a" : "stale-recoverer-b";
  const failed = first.status === 0 ? second : first;
  assert.equal([first.status, second.status].filter((status) => status === 0).length, 1);
  assert.match(failed.stderr, /active lifecycle owner/);
  assertPrepared(fixture);
  runLifecycle(fixture, "postpublish", { owner: winner });
  assertRestored(fixture);
});

test("missing ordinary-guard owner metadata is recovered without a crash-window deadlock", (t) => {
  const fixture = createFixture(t);
  seedOrdinaryGuard(fixture, null);
  const result = spawnSync(process.execPath, [lifecycleScript, "prepack"], {
    cwd: fixture.packageDir,
    env: lifecycleEnv("prepack", { owner: "missing-owner-recovery" }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assertPrepared(fixture);
  runLifecycle(fixture, "postpublish", { owner: "missing-owner-recovery" });
  assertRestored(fixture);
});

test("missing recovery-guard metadata remains permanently fail closed", (t) => {
  const fixture = createFixture(t);
  fs.mkdirSync(fixture.recoveryPath);
  const result = spawnSync(process.execPath, [lifecycleScript, "prepack"], {
    cwd: fixture.packageDir,
    env: lifecycleEnv("prepack", { owner: "blocked-recovery" }),
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /recovery guard metadata is missing.*disabled/);
  assert.equal(fs.readFileSync(fixture.packageJsonPath, "utf8"), fixture.originalText);
  assert.equal(pathEntryExists(fixture.guardPath), false);
  fs.rmSync(fixture.recoveryPath, { recursive: true, force: true });
  assertRestored(fixture);
});

test("unsupported npm publish majors fail before manifest mutation or ownership", (t) => {
  const fixture = createFixture(t);
  const result = spawnSync(process.execPath, [lifecycleScript, "prepack"], {
    cwd: fixture.packageDir,
    env: lifecycleEnv("prepack", { owner: "unsupported", npmMajor: 10 }),
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected npm 11 or 12/);
  assertRestored(fixture);
});

test("explicit cleanup restores a failed publish and dead owners are recovered", (t) => {
  const fixture = createFixture(t);
  runLifecycle(fixture, "prepack", { owner: "failed-publish" });
  assertPrepared(fixture);
  runLifecycle(fixture, "restore", { owner: "failed-publish", npmCommand: "run-script" });
  assertRestored(fixture);

  fs.mkdirSync(fixture.lockPath);
  runLifecycle(fixture, "restore", { owner: "orphan-cleanup", npmCommand: "run-script" });
  assertRestored(fixture);

  const deadOwner = spawnSync(process.execPath, [lifecycleScript, "prepack"], {
    cwd: fixture.packageDir,
    env: lifecycleEnv("prepack", { owner: null, npmCommand: "pack" }),
    encoding: "utf8",
  });
  assert.equal(deadOwner.status, 0, deadOwner.stderr);
  assertPrepared(fixture);
  const recovery = spawnSync(process.execPath, [lifecycleScript, "restore"], {
    cwd: fixture.packageDir,
    env: lifecycleEnv("restore", { owner: null, npmCommand: "run-script" }),
    encoding: "utf8",
  });
  assert.equal(recovery.status, 0, recovery.stderr);
  assertRestored(fixture);
});

test("legacy backups restore but conflicting developer edits fail closed", (t) => {
  const fixture = createFixture(t);
  runLifecycle(fixture, "prepack");
  fs.writeFileSync(fixture.backupPath, fixture.originalText, "utf8");
  runLifecycle(fixture, "restore", { npmCommand: "run-script" });
  assertRestored(fixture);

  runLifecycle(fixture, "prepack");
  const changed = JSON.parse(fs.readFileSync(fixture.packageJsonPath, "utf8"));
  changed.description = "concurrent developer edit";
  writeJson(fixture.packageJsonPath, changed);
  const result = spawnSync(process.execPath, [lifecycleScript, "restore"], {
    cwd: fixture.packageDir,
    env: lifecycleEnv("restore", { npmCommand: "run-script" }),
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing to restore/);
  assert.equal(fs.existsSync(fixture.backupPath), true);
  assert.equal(
    JSON.parse(fs.readFileSync(fixture.packageJsonPath, "utf8")).description,
    changed.description,
  );
});

test("dependency validation cleans ownership before returning failure", (t) => {
  const fixture = createFixture(t);
  fs.rmSync(path.join(fixture.root, "dependency"), { recursive: true, force: true });
  const result = spawnSync(process.execPath, [lifecycleScript, "prepack"], {
    cwd: fixture.packageDir,
    env: lifecycleEnv("prepack"),
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not exist/);
  assertRestored(fixture);
});
