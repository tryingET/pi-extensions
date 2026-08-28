import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildDeclarationSpdx,
  buildLockSpdx,
  integrityChecksum,
  resolveLockEntry,
} from "./release-sbom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "release-sbom.mjs");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...process.env, npm_config_update_notifier: "false", ...(options.env ?? {}) },
  });
  const diagnostic = `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`;
  assert.equal(result.error, undefined, diagnostic);
  assert.equal(typeof result.status, "number", diagnostic);
  if (options.expectFailure) {
    assert.notEqual(result.status, 0, diagnostic);
  } else {
    assert.equal(result.status, 0, diagnostic);
  }
  return result;
}

function runScript(args, options = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, npm_config_update_notifier: "false", ...(options.env ?? {}) },
  });
  const diagnostic = `${process.execPath} ${SCRIPT} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`;
  assert.equal(result.error, undefined, diagnostic);
  assert.equal(typeof result.status, "number", diagnostic);
  if (options.expectFailure) {
    assert.notEqual(result.status, 0, diagnostic);
  } else {
    assert.equal(result.status, 0, diagnostic);
  }
  return result;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sidecar(filePath, digest) {
  fs.writeFileSync(`${filePath}.sha256`, `${digest}  ${path.basename(filePath)}\n`, "utf8");
}

function npmPack(packageRoot, artifactDir) {
  const result = run("npm", ["pack", "--silent", "--pack-destination", artifactDir], {
    cwd: packageRoot,
  });
  return path.join(artifactDir, result.stdout.trim().split(/\r?\n/u).at(-1));
}

function fileRecord(filePath, name, version, artifactDir) {
  return {
    name,
    version,
    repositoryPath: "",
    relativePath: path.relative(artifactDir, filePath).replaceAll(path.sep, "/"),
    sha256: sha256(filePath),
    size: fs.statSync(filePath).size,
    npmIntegrity: null,
    npmShasum: null,
  };
}

function liveGitSnapshot() {
  const indexResult = run("git", ["rev-parse", "--git-path", "index"]);
  const indexPath = path.resolve(ROOT, indexResult.stdout.trim());
  return {
    index: fs.readFileSync(indexPath),
    lsFiles: run("git", ["ls-files", "-z"]).stdout,
  };
}

function assertLiveGitUnchanged(f) {
  const current = liveGitSnapshot();
  assert.deepEqual(current.index, f.liveGitBefore.index, "live Git index bytes changed");
  assert.equal(current.lsFiles, f.liveGitBefore.lsFiles, "live git ls-files changed");
}

function fixture(t, { trackedLock = false } = {}) {
  const liveGitBefore = liveGitSnapshot();
  fs.mkdirSync(path.join(ROOT, ".release-test-scratch"), { recursive: true });
  const root = fs.mkdtempSync(path.join(ROOT, ".release-test-scratch", "release-sbom-fixture-"));
  t.after(() => {
    try {
      assertLiveGitUnchanged({ liveGitBefore });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  const privateObjects = path.join(root, "git-objects");
  fs.mkdirSync(privateObjects);
  const objectsResult = run("git", ["rev-parse", "--git-path", "objects"]);
  const repositoryObjects = path.resolve(ROOT, objectsResult.stdout.trim());
  const gitEnv = {
    GIT_INDEX_FILE: path.join(root, "git-index"),
    GIT_OBJECT_DIRECTORY: privateObjects,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: [
      repositoryObjects,
      process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES,
    ]
      .filter(Boolean)
      .join(path.delimiter),
  };
  run("git", ["read-tree", "HEAD"], { env: gitEnv });
  const mainRoot = path.join(root, "main");
  const localRoot = path.join(root, "local");
  const artifacts = path.join(root, "artifacts");
  fs.mkdirSync(mainRoot);
  fs.mkdirSync(localRoot);
  fs.mkdirSync(artifacts);

  writeJson(path.join(localRoot, "package.json"), {
    name: "@example/local",
    version: "1.2.3",
    license: "MIT",
    files: ["index.js"],
    main: "./index.js",
  });
  fs.writeFileSync(path.join(localRoot, "index.js"), "module.exports = true;\n");

  writeJson(path.join(mainRoot, "package.json"), {
    name: "@example/main",
    version: "2.0.0",
    license: "MIT",
    files: ["index.js"],
    main: "./index.js",
    dependencies: {
      "@example/local": "1.2.3",
      "left-pad": "^1.3.0",
    },
    optionalDependencies: {
      "optional-fixture": "~4.0.0",
    },
    peerDependencies: {
      "@example/host": ">=1 <3",
    },
  });
  fs.writeFileSync(path.join(mainRoot, "index.js"), "module.exports = true;\n");

  const lockPath = path.join(mainRoot, "package-lock.json");
  writeJson(lockPath, {
    name: "@example/main",
    version: "2.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "@example/main",
        version: "2.0.0",
        dependencies: {
          "@example/local": "1.2.3",
          "left-pad": "1.3.0",
        },
        optionalDependencies: {
          "optional-fixture": "4.0.1",
        },
        peerDependencies: {
          "@example/host": ">=1 <3",
        },
      },
      "node_modules/@example/local": {
        version: "1.2.3",
      },
      "node_modules/left-pad": {
        version: "1.3.0",
        resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz",
        integrity: "sha512-YWJj",
        license: "WTFPL",
      },
      "node_modules/optional-fixture": {
        version: "4.0.1",
        optional: true,
        license: "MIT",
      },
    },
  });
  if (trackedLock) {
    run("git", ["add", "-f", "--", path.relative(ROOT, lockPath)], { env: gitEnv });
  }

  const localTarball = npmPack(localRoot, artifacts);
  const mainTarball = npmPack(mainRoot, artifacts);
  const localRecord = fileRecord(localTarball, "@example/local", "1.2.3", artifacts);
  const mainRecord = fileRecord(mainTarball, "@example/main", "2.0.0", artifacts);
  sidecar(localTarball, localRecord.sha256);
  sidecar(mainTarball, mainRecord.sha256);

  const artifactManifest = {
    schema: "pi.release-artifact.v1",
    producer: "test",
    package: {
      component: "main",
      name: mainRecord.name,
      version: mainRecord.version,
      repositoryPath: path.relative(ROOT, mainRoot).replaceAll(path.sep, "/"),
    },
    source: {
      tag: "main-v2.0.0",
      commit: "a".repeat(40),
    },
    artifact: {
      basename: path.basename(mainTarball),
      relativePath: mainRecord.relativePath,
      sha256: mainRecord.sha256,
      size: mainRecord.size,
    },
    dependencies: {
      localArtifacts: [localRecord],
    },
  };
  const artifactManifestPath = path.join(artifacts, `${path.basename(mainTarball)}.manifest.json`);
  writeJson(artifactManifestPath, artifactManifest);
  return {
    root,
    gitEnv,
    liveGitBefore,
    mainRoot,
    artifacts,
    artifactManifestPath,
    mainTarball,
    mainRecord,
    localRecord,
    lockPath,
  };
}

function generate(f) {
  const envPath = path.join(f.root, "github.env");
  const result = runScript([
    "generate",
    "--manifest",
    f.artifactManifestPath,
    "--source-date-epoch",
    "1700000000",
    "--output-env-file",
    envPath,
  ], { env: f.gitEnv });
  const evidence = JSON.parse(result.stdout);
  const env = Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  return { evidence, env };
}

test("decodes npm integrity and resolves nested lock entries", () => {
  assert.deepEqual(integrityChecksum("sha512-YWJj"), {
    algorithm: "SHA512",
    checksumValue: "616263",
  });
  const packages = {
    "node_modules/a": { version: "1.0.0" },
    "node_modules/a/node_modules/b": { version: "2.0.0" },
    "node_modules/b": { version: "3.0.0" },
  };
  assert.equal(resolveLockEntry(packages, "node_modules/a", "b").entry.version, "2.0.0");
  assert.equal(resolveLockEntry(packages, "", "b").entry.version, "3.0.0");
});

test("declaration mode labels external ranges and binds exact local artifacts", (t) => {
  const f = fixture(t, { trackedLock: false });
  const { evidence, env } = generate(f);
  assert.equal(evidence.sbom.mode, "packed-manifest-declarations");
  assert.equal(evidence.sbom.sourcePackageLock, null);
  assert.ok(evidence.boundaries.nonclaims.some((claim) => claim.includes("not resolved versions")));
  const spdx = JSON.parse(fs.readFileSync(env.RELEASE_SBOM_PATH, "utf8"));
  const leftPad = spdx.packages.find((pkg) => pkg.name === "left-pad");
  assert.equal(leftPad.versionInfo, "^1.3.0");
  assert.equal(leftPad.checksums, undefined);
  const local = spdx.packages.find(
    (pkg) =>
      pkg.name === f.localRecord.name &&
      pkg.checksums?.some((checksum) => checksum.checksumValue === f.localRecord.sha256),
  );
  assert.ok(local);
  const verified = runScript(["verify", "--evidence", env.RELEASE_EVIDENCE_MANIFEST_PATH], {
    env: f.gitEnv,
  });
  assert.match(verified.stdout, /Verified packed-manifest-declarations SPDX evidence/u);
  assertLiveGitUnchanged(f);
});

test("tracked lock mode is deterministic and records resolved direct dependencies", (t) => {
  const f = fixture(t, { trackedLock: true });
  const first = generate(f);
  assert.equal(first.evidence.sbom.mode, "tagged-package-lock");
  assert.equal(first.evidence.sbom.sourcePackageLock.sha256, sha256(f.lockPath));
  const sbomFirst = fs.readFileSync(first.env.RELEASE_SBOM_PATH, "utf8");
  const evidenceFirst = fs.readFileSync(first.env.RELEASE_EVIDENCE_MANIFEST_PATH, "utf8");
  fs.unlinkSync(first.env.RELEASE_SBOM_PATH);
  fs.unlinkSync(first.env.RELEASE_SBOM_CHECKSUM_PATH);
  fs.unlinkSync(first.env.RELEASE_EVIDENCE_MANIFEST_PATH);
  fs.unlinkSync(first.env.RELEASE_EVIDENCE_CHECKSUM_PATH);
  fs.unlinkSync(path.join(f.root, "github.env"));
  const second = generate(f);
  assert.equal(fs.readFileSync(second.env.RELEASE_SBOM_PATH, "utf8"), sbomFirst);
  assert.equal(fs.readFileSync(second.env.RELEASE_EVIDENCE_MANIFEST_PATH, "utf8"), evidenceFirst);
  const spdx = JSON.parse(sbomFirst);
  const leftPad = spdx.packages.find((pkg) => pkg.name === "left-pad" && pkg.versionInfo === "1.3.0");
  assert.ok(leftPad);
  assert.equal(leftPad.checksums[0].algorithm, "SHA512");
  assert.equal(spdx.creationInfo.created, "2023-11-14T22:13:20.000Z");
  assert.equal(
    spdx.documentNamespace,
    `https://github.com/tryingET/pi-extensions/sbom/sha256/${f.mainRecord.sha256}`,
  );
  const verified = runScript(["verify", "--evidence", second.env.RELEASE_EVIDENCE_MANIFEST_PATH], {
    env: f.gitEnv,
  });
  assert.match(verified.stdout, /Verified tagged-package-lock SPDX evidence/u);
  assertLiveGitUnchanged(f);
});

test("untracked generated lockfiles never become tagged evidence", (t) => {
  const f = fixture(t, { trackedLock: true });
  run("git", ["rm", "--cached", "--", path.relative(ROOT, f.lockPath)], { env: f.gitEnv });
  const { evidence } = generate(f);
  assert.equal(evidence.sbom.mode, "packed-manifest-declarations");
  assertLiveGitUnchanged(f);
});

test("verification fails closed on SBOM, subject, and lock tampering", (t) => {
  const f = fixture(t, { trackedLock: true });
  let generated = generate(f);
  fs.appendFileSync(generated.env.RELEASE_SBOM_PATH, "tamper");
  let result = runScript(["verify", "--evidence", generated.env.RELEASE_EVIDENCE_MANIFEST_PATH], {
    expectFailure: true,
    env: f.gitEnv,
  });
  assert.match(`${result.stdout}\n${result.stderr}`, /SPDX SBOM evidence differs/u);
  assertLiveGitUnchanged(f);

  fs.rmSync(f.root, { recursive: true, force: true });
  const subjectFixture = fixture(t, { trackedLock: true });
  generated = generate(subjectFixture);
  fs.appendFileSync(subjectFixture.mainTarball, "tamper");
  result = runScript(["verify", "--evidence", generated.env.RELEASE_EVIDENCE_MANIFEST_PATH], {
    expectFailure: true,
    env: subjectFixture.gitEnv,
  });
  assert.match(`${result.stdout}\n${result.stderr}`, /Evidence subject SHA-256 changed/u);
  assertLiveGitUnchanged(subjectFixture);

  const lockFixture = fixture(t, { trackedLock: true });
  generated = generate(lockFixture);
  fs.appendFileSync(lockFixture.lockPath, "\n");
  result = runScript(["verify", "--evidence", generated.env.RELEASE_EVIDENCE_MANIFEST_PATH], {
    expectFailure: true,
    env: lockFixture.gitEnv,
  });
  assert.match(`${result.stdout}\n${result.stderr}`, /Tracked package-lock\.json digest differs/u);
  assertLiveGitUnchanged(lockFixture);
});
