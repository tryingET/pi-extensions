import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { verifyPreparedRuntime } from "../src/semantic/prepared-runtime.ts";
import {
  type DevelopmentDependencyPackage,
  DevelopmentPreparationError,
  type DevelopmentSourcePin,
  prepareDevelopmentRuntime,
} from "../src/semantic/preparer.ts";
import { dependencyMaterialDigest } from "../src/semantic/preparer-dependencies.ts";
import {
  createDevelopmentRocsRunnerDescriptor,
  createVerifiedDevelopmentRocsPort,
} from "../src/semantic/runner.ts";

const execute = promisify(execFile);

interface Fixture {
  pin: DevelopmentSourcePin;
  source: string;
  cache: string;
  module: Buffer;
  lock: Buffer;
  interpreter: string;
  sitePackages: string;
}

async function fixture(dependencies: string[] = []): Promise<Fixture> {
  const safeParent = path.join(process.env.HOME ?? "/nonexistent", ".cache");
  await mkdir(safeParent, { recursive: true, mode: 0o700 });
  const base = await mkdtemp(path.join(safeParent, "pi-rocs-preparer-test-"));
  await chmod(base, 0o700);
  const source = path.join(base, "source");
  const cache = path.join(base, "extension-cache");
  await mkdir(path.join(source, "src", "rocs_cli"), { recursive: true, mode: 0o700 });
  const module = Buffer.from("# pinned source\n");
  await writeFile(path.join(source, "src", "rocs_cli", "__init__.py"), module, { mode: 0o644 });
  const lock = lockFor(dependencies);
  await writeFile(path.join(source, "uv.lock"), lock, { mode: 0o644 });
  await writeFile(path.join(source, ".gitignore"), ".venv*\n", { mode: 0o644 });

  await git(source, ["init", "--quiet"]);
  await git(source, ["add", ".gitignore", "src/rocs_cli/__init__.py", "uv.lock"]);
  await git(source, [
    "-c",
    "user.name=preparer-test",
    "-c",
    "user.email=preparer-test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  const commit = (await git(source, ["rev-parse", "HEAD"])).trim();

  const venv = path.join(source, ".venv");
  const interpreter = path.join(venv, "bin", "python3.12");
  const sitePackages = path.join(venv, "lib", "python3.12", "site-packages");
  await mkdir(path.dirname(interpreter), { recursive: true, mode: 0o700 });
  await mkdir(sitePackages, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(venv, "pyvenv.cfg"),
    `home = ${path.dirname(interpreter)}\nversion_info = 3.12.12\n`,
    { mode: 0o644 },
  );
  await writeFile(interpreter, "fake interpreter\n", { mode: 0o755 });
  await writeFile(path.join(venv, "lib", "python3.12", "os.py"), "# stdlib\n", {
    mode: 0o644,
  });
  const packagePins: DevelopmentDependencyPackage[] = [];
  for (const dependency of dependencies) {
    const dependencyBytes = Buffer.from("# dependency\n");
    await mkdir(path.join(sitePackages, dependency), { recursive: true, mode: 0o700 });
    await writeFile(path.join(sitePackages, dependency, "__init__.py"), dependencyBytes, {
      mode: 0o644,
    });
    packagePins.push({
      distribution: dependency,
      path: dependency,
      version: "1.0.0",
      materialDigest: dependencyMaterialDigest(
        new Map([[`${dependency}/__init__.py`, { bytes: dependencyBytes, mode: 0o644 }]]),
        dependency,
      ),
      purePython: true,
    });
  }
  return {
    source,
    cache,
    module,
    lock,
    interpreter,
    sitePackages,
    pin: {
      sourceRoot: source,
      cacheRoot: cache,
      commit,
      files: [["src/rocs_cli/__init__.py", gitBlob(module)]],
      lock: { path: "uv.lock", blob: gitBlob(lock) },
      dependencyPackages: packagePins,
    },
  };
}

test("preparer concurrently publishes once and reuses only the exact generation", async () => {
  const value = await fixture();
  const [first, second] = await Promise.all([
    prepareDevelopmentRuntime(value.pin),
    prepareDevelopmentRuntime(value.pin),
  ]);
  assert.equal(Number(first.published) + Number(second.published), 1);
  assert.equal(first.location.root, second.location.root);
  assert.equal(first.manifest.manifest_digest, second.manifest.manifest_digest);
  assert.ok(first.manifest.files.some((entry) => entry.path === "rocs_cli/__init__.py"));
  assert.equal(first.manifest.interpreter.version, "3.12.12");
  assert.equal(
    (await verifyPreparedRuntime(first.location)).manifest_digest,
    first.manifest.manifest_digest,
  );
  assert.deepEqual(
    (await readdir(value.cache)).filter((name) => name.startsWith(".")),
    [],
  );
  const third = await prepareDevelopmentRuntime(value.pin);
  assert.equal(third.published, false);
  assert.equal(third.location.root, first.location.root);
});

test("preparer requires an exact clean checkout and independent blob identities", async () => {
  const dirty = await fixture();
  await writeFile(path.join(dirty.source, "untracked"), "dirty\n");
  await assert.rejects(
    () => prepareDevelopmentRuntime(dirty.pin),
    (error: unknown) =>
      error instanceof DevelopmentPreparationError && /checkout is not clean/.test(error.message),
  );

  const wrongBlob = await fixture();
  wrongBlob.pin.files = [["src/rocs_cli/__init__.py", "b".repeat(40)]];
  await assert.rejects(() => prepareDevelopmentRuntime(wrongBlob.pin), /tree identity mismatch/);
});

test("preparer rejects incomplete pins, path extras, escapes, and overlapping writes", async () => {
  const incomplete = await fixture();
  incomplete.pin.files = [];
  await assert.rejects(() => prepareDevelopmentRuntime(incomplete.pin), /pin set is incomplete/);

  const escaped = await fixture(["dep"]);
  escaped.pin.dependencyPackages = [
    {
      distribution: "dep",
      path: "../outside",
      version: "1.0.0",
      materialDigest: `sha256:${"0".repeat(64)}`,
      purePython: true,
    },
  ];
  await assert.rejects(
    () => prepareDevelopmentRuntime(escaped.pin),
    /unsafe dependency package path/,
  );

  const overlapping = await fixture(["dep", "other"]);
  overlapping.pin.dependencyPackages = [
    {
      distribution: "dep",
      path: "dep",
      version: "1.0.0",
      materialDigest: `sha256:${"0".repeat(64)}`,
      purePython: true,
    },
    {
      distribution: "other",
      path: "dep/nested",
      version: "1.0.0",
      materialDigest: `sha256:${"1".repeat(64)}`,
      purePython: true,
    },
  ];
  await assert.rejects(() => prepareDevelopmentRuntime(overlapping.pin), /paths overlap/);
});

test("preparer rejects symlinked source, virtualenv, dependency directories, and files", async () => {
  const linkedSource = await fixture();
  const sourceAlias = path.join(path.dirname(linkedSource.source), "source-alias");
  await symlink(linkedSource.source, sourceAlias);
  linkedSource.pin.sourceRoot = sourceAlias;
  await assert.rejects(
    () => prepareDevelopmentRuntime(linkedSource.pin),
    /ELOOP|ENOTDIR|canonical|symbolic/i,
  );

  const linkedVenv = await fixture();
  const actualVenv = path.join(linkedVenv.source, ".venv-actual");
  await rename(path.join(linkedVenv.source, ".venv"), actualVenv);
  await symlink(actualVenv, path.join(linkedVenv.source, ".venv"));
  await assert.rejects(
    () => prepareDevelopmentRuntime(linkedVenv.pin),
    /ELOOP|ENOTDIR|virtualenv/i,
  );

  const linkedDirectory = await fixture(["dep"]);
  await rename(
    path.join(linkedDirectory.sitePackages, "dep"),
    path.join(linkedDirectory.sitePackages, "actual"),
  );
  await symlink("actual", path.join(linkedDirectory.sitePackages, "dep"));
  await assert.rejects(
    () => prepareDevelopmentRuntime(linkedDirectory.pin),
    /ELOOP|ENOTDIR|dependency/i,
  );

  const linkedFile = await fixture(["dep"]);
  await symlink("/etc/passwd", path.join(linkedFile.sitePackages, "dep", "payload"));
  await assert.rejects(
    () => prepareDevelopmentRuntime(linkedFile.pin),
    /ELOOP|symlink|preparation material/i,
  );
});

test("preparer rejects unsafe owner-visible modes and undeclared native material", async () => {
  const writable = await fixture(["dep"]);
  await chmod(path.join(writable.sitePackages, "dep"), 0o770);
  await assert.rejects(() => prepareDevelopmentRuntime(writable.pin), /unsafe owner or mode/);

  const native = await fixture(["dep"]);
  await writeFile(path.join(native.sitePackages, "dep", "extension.so"), "native\n", {
    mode: 0o755,
  });
  await assert.rejects(
    () => prepareDevelopmentRuntime(native.pin),
    /native dependency requires explicit support/,
  );
});

test("preparer proves the selected required dependency closure without extras", async () => {
  const missing = await fixture(["dep"]);
  missing.pin.dependencyPackages = [];
  await assert.rejects(
    () => prepareDevelopmentRuntime(missing.pin),
    /closure is incomplete or has extras/,
  );

  const extra = await fixture();
  extra.pin.dependencyPackages = [
    {
      distribution: "extra",
      path: "extra",
      version: "1.0.0",
      materialDigest: `sha256:${"0".repeat(64)}`,
      purePython: true,
    },
  ];
  await assert.rejects(
    () => prepareDevelopmentRuntime(extra.pin),
    /closure is incomplete or has extras/,
  );
});

test("preparer binds dependency versions and every staged dependency byte", async () => {
  const wrongVersion = await fixture(["dep"]);
  wrongVersion.pin.dependencyPackages = wrongVersion.pin.dependencyPackages.map((dependency) => ({
    ...dependency,
    version: "2.0.0",
  }));
  await assert.rejects(
    () => prepareDevelopmentRuntime(wrongVersion.pin),
    /dependency version does not match lock/,
  );

  const driftedMaterial = await fixture(["dep"]);
  await writeFile(
    path.join(driftedMaterial.sitePackages, "dep", "__init__.py"),
    "# stale or tampered dependency\n",
  );
  await assert.rejects(
    () => prepareDevelopmentRuntime(driftedMaterial.pin),
    /dependency material identity mismatch/,
  );
});

test("content identity changes for cfg and every pinned source byte", async () => {
  const value = await fixture();
  const first = await prepareDevelopmentRuntime(value.pin);
  await writeFile(
    path.join(value.source, ".venv", "pyvenv.cfg"),
    `home = ${path.dirname(value.interpreter)}\nversion_info = 3.12.12\nprompt = changed\n`,
  );
  const cfgChanged = await prepareDevelopmentRuntime(value.pin);
  assert.notEqual(cfgChanged.location.root, first.location.root);

  const changed = Buffer.from("# a different pinned source\n");
  await writeFile(path.join(value.source, "src", "rocs_cli", "__init__.py"), changed);
  await git(value.source, ["add", "src/rocs_cli/__init__.py"]);
  await git(value.source, [
    "-c",
    "user.name=preparer-test",
    "-c",
    "user.email=preparer-test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "changed source",
  ]);
  value.pin.commit = (await git(value.source, ["rev-parse", "HEAD"])).trim();
  value.pin.files = [["src/rocs_cli/__init__.py", gitBlob(changed)]];
  const sourceChanged = await prepareDevelopmentRuntime(value.pin);
  assert.notEqual(sourceChanged.location.root, cfgChanged.location.root);
});

test("preparer detects descriptor signature drift while reading", async () => {
  const value = await fixture();
  await writeFile(value.interpreter, Buffer.alloc(64 * 1024 * 1024, 0x41), { mode: 0o755 });
  let tick = 0;
  const timer = setInterval(() => {
    tick++;
    const seconds = Date.now() / 1000 + tick;
    void utimes(value.interpreter, seconds, seconds);
  }, 1);
  try {
    await assert.rejects(
      () => prepareDevelopmentRuntime(value.pin),
      /changed while read|path changed|unsafe preparation file/,
    );
  } finally {
    clearInterval(timer);
  }
});

test("preparer fails closed on partial or extra final generations", async () => {
  const partial = await fixture();
  const published = await prepareDevelopmentRuntime(partial.pin);
  await writeFile(path.join(published.location.root, "rocs_cli", "__init__.py"), "# drift\n");
  await assert.rejects(() => prepareDevelopmentRuntime(partial.pin), /partial or invalid/);

  const extra = await fixture();
  const complete = await prepareDevelopmentRuntime(extra.pin);
  await writeFile(path.join(complete.location.root, "unexpected"), "extra\n", { mode: 0o644 });
  await assert.rejects(() => prepareDevelopmentRuntime(extra.pin), /path set mismatch/);
});

test(
  "offline default preparation negotiates real prepared ROCS capabilities",
  { skip: process.env.PI_ROCS_LIVE_SMOKE !== "1" },
  async () => {
    const prepared = await prepareDevelopmentRuntime();
    const descriptor = await createDevelopmentRocsRunnerDescriptor(prepared.location);
    const port = await createVerifiedDevelopmentRocsPort(descriptor);
    assert.equal(port.developmentDescriptor.manifestDigest, prepared.manifest.manifest_digest);
  },
);

function lockFor(dependencies: string[]): Buffer {
  const blocks = dependencies
    .map(
      (name) =>
        `[[package]]\nname = "${name}"\nversion = "1.0.0"\nsource = { registry = "https://example.invalid/simple" }\n`,
    )
    .join("\n");
  const dependencyLines = dependencies.map((name) => `    { name = "${name}" },`).join("\n");
  return Buffer.from(
    `version = 1\n\n${blocks}[[package]]\nname = "rocs-cli"\nversion = "0.0.0"\nsource = { editable = "." }\ndependencies = [\n${dependencyLines}${dependencyLines ? "\n" : ""}]\n`,
  );
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execute("/usr/bin/git", args, {
    cwd,
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 1_048_576,
    shell: false,
    env: {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      HOME: "/nonexistent",
      XDG_CONFIG_HOME: "/nonexistent",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
    },
  });
  return result.stdout;
}

function gitBlob(bytes: Buffer): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
