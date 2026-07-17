import assert from "node:assert/strict";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import {
  openVerifiedPreparedRuntime,
  type PreparedRuntimeLocation,
  type PreparedRuntimeManifest,
  parsePreparedRuntimeManifest,
  preparedManifestDigest,
  sha256Raw,
  verifyPreparedRuntime,
  verifyPreparedRuntimeMaterial,
} from "../src/semantic/prepared-runtime.ts";
import {
  buildClosedRunnerEnv,
  buildDiscoveryArgv,
  createDevelopmentRocsRunnerDescriptor,
  createVerifiedDevelopmentRocsPort,
} from "../src/semantic/runner.ts";
import { invokePrepared, ProcessBoundaryError } from "../src/semantic/subprocess.ts";
import { createTestDevelopmentDescriptor } from "./helpers.ts";

const FIXTURE_PATH = new URL(
  "../docs/project/semantic-preflight-v0/prepared-runtime-fixtures.json",
  import.meta.url,
);

async function safeRuntimeRoot(prefix: string): Promise<string> {
  const cache = path.join(process.env.HOME ?? tmpdir(), ".cache");
  await mkdir(cache, { recursive: true, mode: 0o700 });
  return mkdtemp(path.join(cache, prefix));
}

async function executableRuntime(script: string): Promise<{
  location: PreparedRuntimeLocation;
  invocation: Parameters<typeof invokePrepared>[0];
}> {
  const root = await safeRuntimeRoot("pi-rocs-exec-");
  await mkdir(path.join(root, "rocs_cli"), { mode: 0o755 });
  const source = Buffer.from("# source\n");
  await writeFile(path.join(root, "rocs_cli", "__init__.py"), source, { mode: 0o644 });
  const lock = Buffer.from("lock\n");
  const entrypoint = Buffer.from("entry\n");
  const interpreter = Buffer.from(script);
  const dependencyLockPath = path.join(root, "uv.lock");
  const entrypointPath = path.join(root, "entrypoint.txt");
  const interpreterPath = path.join(root, "python3.12");
  await writeFile(dependencyLockPath, lock, { mode: 0o644 });
  await writeFile(entrypointPath, entrypoint, { mode: 0o644 });
  await writeFile(interpreterPath, interpreter, { mode: 0o755 });
  const manifest: PreparedRuntimeManifest = {
    schema: "pi-rocs-prepared-runtime-manifest.v0",
    rocs_commit: "a".repeat(40),
    files: [
      { path: "rocs_cli/__init__.py", mode: 0o644, size: source.length, digest: sha256Raw(source) },
    ],
    dependency_lock_digest: sha256Raw(lock),
    interpreter: { path: interpreterPath, version: "3.12.10", digest: sha256Raw(interpreter) },
    entrypoint_digest: sha256Raw(entrypoint),
    manifest_digest: `sha256:${"0".repeat(64)}`,
  };
  manifest.manifest_digest = preparedManifestDigest(manifest);
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o644 });
  const location = { root, manifestPath, dependencyLockPath, entrypointPath };
  return {
    location,
    invocation: {
      location,
      executable: interpreterPath,
      cwd: root,
      fixedArguments: [],
      manifestDigest: manifest.manifest_digest,
      rocsCommit: manifest.rocs_commit,
      pythonVersion: manifest.interpreter.version,
    },
  };
}

test("prepared-runtime fixture JCS, manifest, and raw bytes validate independently", async () => {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  const valid = fixture.valid;
  const raw = {
    files: Object.fromEntries(
      Object.entries(valid.raw_material.files).map(([name, hex]) => [
        name,
        Buffer.from(hex as string, "hex"),
      ]),
    ),
    dependencyLock: Buffer.from(valid.raw_material.dependency_lock_raw_hex, "hex"),
    entrypoint: Buffer.from(valid.raw_material.entrypoint_raw_hex, "hex"),
    interpreter: Buffer.from(valid.raw_material.interpreter_raw_hex, "hex"),
  };
  const manifest = verifyPreparedRuntimeMaterial(valid.manifest, raw);
  assert.equal(preparedManifestDigest(manifest), valid.expected_manifest_digest);
  assert.equal(preparedManifestDigest(manifest), manifest.manifest_digest);
  assert.equal(
    Buffer.byteLength(Buffer.from(valid.preimage_jcs_utf8_hex, "hex")),
    valid.preimage_byte_length,
  );

  for (const invalid of fixture.invalid) {
    const patched = structuredClone(raw);
    if (invalid.raw_material_patch?.path === "/dependency_lock_raw_hex")
      patched.dependencyLock = Buffer.from(invalid.raw_material_patch.raw_hex, "hex");
    if (invalid.raw_material_patch?.path?.startsWith("/files/"))
      patched.files["rocs_cli/__init__.py"] = Buffer.from(
        invalid.raw_material_patch.raw_hex,
        "hex",
      );
    assert.throws(() => verifyPreparedRuntimeMaterial(invalid.instance, patched), invalid.case);
  }
});

test("prepared-runtime byte boundaries and file caps fail closed", async () => {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  for (const boundary of fixture.byte_boundaries) {
    const bytes = Buffer.alloc(boundary.repeat, Number.parseInt(boundary.unit_raw_hex, 16));
    assert.equal(bytes.byteLength, boundary.expected_size);
    if (boundary.expected_digest) assert.equal(sha256Raw(bytes), boundary.expected_digest);
  }
  const oversized = structuredClone(fixture.valid.manifest);
  oversized.files[0].size = 1_048_577;
  assert.throws(() => parsePreparedRuntimeManifest(oversized), /file size/);
});

test("verified descriptor binds exact development argv and a closed environment", async () => {
  const root = await safeRuntimeRoot("pi-rocs-runtime-");
  const moduleDir = path.join(root, "rocs_cli");
  await (await import("node:fs/promises")).mkdir(moduleDir);
  const modulePath = path.join(moduleDir, "__init__.py");
  const moduleBytes = Buffer.from("# fixture\n");
  await writeFile(modulePath, moduleBytes);
  await chmod(modulePath, 0o644);
  const lockPath = path.join(root, "uv.lock");
  const entrypointPath = path.join(root, "entrypoint.txt");
  const lock = Buffer.from("version = 1\n");
  const entrypoint = Buffer.from("python -B -m rocs_cli\n");
  await writeFile(lockPath, lock);
  await writeFile(entrypointPath, entrypoint);
  const sourceInterpreter = await realpath(process.execPath);
  const interpreterPath = path.join(root, "python3.12");
  await copyFile(sourceInterpreter, interpreterPath);
  await chmod(interpreterPath, 0o755);
  const interpreter = await readFile(interpreterPath);
  const interpreterStat = await lstat(interpreterPath);
  const manifest: PreparedRuntimeManifest = {
    schema: "pi-rocs-prepared-runtime-manifest.v0",
    rocs_commit: "a".repeat(40),
    files: [
      {
        path: "rocs_cli/__init__.py",
        mode: 0o644,
        size: moduleBytes.length,
        digest: sha256Raw(moduleBytes),
      },
    ],
    dependency_lock_digest: sha256Raw(lock),
    interpreter: { path: interpreterPath, version: "3.12.10", digest: sha256Raw(interpreter) },
    entrypoint_digest: sha256Raw(entrypoint),
    manifest_digest: `sha256:${"0".repeat(64)}`,
  };
  manifest.manifest_digest = preparedManifestDigest(manifest);
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  assert.equal(interpreterStat.isFile(), true);
  const descriptor = await createDevelopmentRocsRunnerDescriptor({
    root,
    manifestPath,
    dependencyLockPath: lockPath,
    entrypointPath,
  });
  assert.deepEqual(descriptor.verificationEvidence, {
    schema: "pi-rocs-prepared-runtime-verification.v0",
    materialIdentity: "verified_before_spawn",
    threatBoundary: "trusted_same_uid",
  });
  assert.equal(Object.isFrozen(descriptor.verificationEvidence), true);
  const context = {
    workspaceRoot: "/workspace",
    workspaceRefMode: "loose" as const,
    resolveRefs: true,
  };
  const argv = buildDiscoveryArgv(descriptor, "/repo", context);
  assert.deepEqual(argv.slice(0, 3), ["-B", "-m", "rocs_cli"]);
  assert.deepEqual(argv.slice(argv.indexOf("--tool-kind"), argv.indexOf("--tool-kind") + 4), [
    "--tool-kind",
    "development_runtime",
    "--tool-manifest-digest",
    manifest.manifest_digest,
  ]);
  for (const flag of ["--json", "--no-index-cache", "--no-env-file", "--resolve-refs"])
    assert.equal(argv.includes(flag), true);
  const env = buildClosedRunnerEnv(descriptor, "/workspace", "review");
  assert.equal(env.ROCS_WORKSPACE_REF_MODE, "strict");
  assert.equal("PYTHONPATH" in env, false);
  assert.equal("ROCS_BIN" in env, false);
  assert.equal("PI_ONTOLOGY_ROCS_BIN" in env, false);
  assert.deepEqual(
    Object.keys(env).sort(),
    [
      "HOME",
      "PATH",
      "LANG",
      "LC_ALL",
      "PYTHONDONTWRITEBYTECODE",
      "PYTHONNOUSERSITE",
      "ROCS_WORKSPACE_REF_MODE",
      "ROCS_WORKSPACE_ROOT",
    ].sort(),
  );
});

test("prepared runtime rejects intermediate symlinks, writable components, and out-of-root material", async () => {
  const symlinked = await executableRuntime("#!/bin/sh\nexit 0\n");
  const realModule = path.join(symlinked.location.root, "real_module");
  await rename(path.join(symlinked.location.root, "rocs_cli"), realModule);
  await symlink(realModule, path.join(symlinked.location.root, "rocs_cli"));
  await assert.rejects(() => verifyPreparedRuntime(symlinked.location));

  const writable = await executableRuntime("#!/bin/sh\nexit 0\n");
  await chmod(path.join(writable.location.root, "rocs_cli"), 0o777);
  await assert.rejects(() => verifyPreparedRuntime(writable.location), /unsafe runtime directory/);

  const escaped = await executableRuntime("#!/bin/sh\nexit 0\n");
  const manifest = JSON.parse(await readFile(escaped.location.manifestPath, "utf8"));
  manifest.interpreter.path = "/bin/sh";
  manifest.interpreter.digest = sha256Raw(await readFile("/bin/sh"));
  manifest.manifest_digest = preparedManifestDigest(manifest);
  await writeFile(escaped.location.manifestPath, JSON.stringify(manifest));
  await assert.rejects(() => verifyPreparedRuntime(escaped.location), /inside runtime root/);
});

test("complete immediate reverification detects content and inode replacement before spawn", async () => {
  const descriptor = await createTestDevelopmentDescriptor();
  await writeFile(path.join(descriptor.cwd, "rocs_cli", "__init__.py"), "# changed\n");
  await assert.rejects(() => createVerifiedDevelopmentRocsPort(descriptor), /mismatch|drift/);

  const second = await executableRuntime("#!/bin/sh\nexit 0\n");
  const lease = await openVerifiedPreparedRuntime(second.location);
  try {
    const source = path.join(second.location.root, "rocs_cli", "__init__.py");
    const replacement = path.join(second.location.root, "replacement.py");
    await writeFile(replacement, "# source\n", { mode: 0o644 });
    await rename(replacement, source);
    await assert.rejects(() => lease.reverifyInodes(), /inode drift/);
  } finally {
    await lease.close();
  }
});

test("one 750ms boundary maps output caps and bounds TERM/KILL/reap", async () => {
  const runtime = await executableRuntime(`#!/bin/sh
if [ "$1" = flood ]; then
  /usr/bin/head -c 140000 /dev/zero
  exit 0
fi
trap '' TERM
while :; do :; done
`);
  const env = { PATH: "/usr/bin:/bin", HOME: process.env.HOME ?? "/nonexistent" };
  const capStart = performance.now();
  await assert.rejects(
    () => invokePrepared(runtime.invocation, ["flood"], undefined, env),
    (error: unknown) =>
      error instanceof ProcessBoundaryError && error.kind === "resource_exhausted",
  );
  assert.ok(performance.now() - capStart < 800);

  const deadlineStart = performance.now();
  await assert.rejects(
    () => invokePrepared(runtime.invocation, ["hang"], undefined, env),
    (error: unknown) => error instanceof ProcessBoundaryError && error.kind === "timeout",
  );
  const elapsed = performance.now() - deadlineStart;
  assert.ok(elapsed >= 500 && elapsed < 800, `elapsed=${elapsed}`);
});
