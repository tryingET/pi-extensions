// Freeze the owner-provided default debug export for NEW synthetic proof, never a release/activation.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const [repo, commit, exportRoot, runtimeRoot, seedPins, expectedManifest] = process.argv.slice(2);
assert.equal(process.argv.length, expectedManifest ? 8 : 7);
assert.match(commit, /^[a-f0-9]{40}$/);
if (expectedManifest) {
  assert.match(expectedManifest, /^[a-f0-9]{64}$/);
  const sha = (b) => createHash("sha256").update(b).digest("hex"),
    bytes = readFileSync(join(exportRoot, "pin-manifest.json"));
  assert.equal(sha(bytes), expectedManifest);
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.commit, commit);
  assert.equal(manifest.profile, "release");
  assert.equal(manifest.dirty, false);
  assert.equal(manifest.cargo_locked, true);
  assert.equal(manifest.activation, "not_published");
  for (const [name, entry] of Object.entries(manifest.files)) {
    assert(!name.startsWith("/") && !name.split("/").includes(".."));
    const data = readFileSync(join(exportRoot, name));
    assert.equal(sha(data), entry.sha256);
    assert.equal(data.length, entry.size);
    if (name !== "ak-bin")
      assert.equal(
        sha(
          execFileSync("git", ["-C", repo, "show", `${commit}:${name}`], { maxBuffer: 10000000 }),
        ),
        entry.sha256,
      );
  }
  const env = { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
    options = { cwd: exportRoot, env, timeout: 15000, maxBuffer: 65536 };
  assert.equal(
    execFileSync(join(exportRoot, "ak-bin"), ["--version"], options).toString().trim(),
    `ak 0.1.0+git.${commit}`,
  );
  const abi = JSON.parse(
    execFileSync(join(exportRoot, "ak-bin"), ["task-session", "owner-abi"], options),
  );
  assert.deepEqual(abi, {
    schema: "ak.task-session.worker-abi.v1",
    abi: "ak.task-session.worker.v2",
    protocol: "ak.task-session.v1",
    supported_schemas: [40, 43],
    test_support: false,
  });
  const root = mkdtempSync(join(process.env.TMPDIR, "task5480-public-release-packet-")),
    sourceRoot = join(root, "ak-source"),
    helper = "scripts/ci/task-session-deployment-fixture.py";
  mkdirSync(dirname(join(sourceRoot, helper)), { recursive: true });
  writeFileSync(
    join(sourceRoot, helper),
    execFileSync("git", ["-C", repo, "show", `${commit}:${helper}`], { maxBuffer: 1000000 }),
    { mode: 0o600 },
  );
  const packet = {
    schema: "pi.task-session.public-proof-packet.v1",
    sourceCommit: commit,
    sourceRoot,
    workerRoot: resolve(exportRoot),
    runtimeRoot: resolve(runtimeRoot),
    seedPins: resolve(seedPins),
    manifestSha256: expectedManifest,
    workerSha256: manifest.files["ak-bin"].sha256,
    nativeAbi: abi,
    release: true,
    liveActivation: false,
  };
  writeFileSync(join(root, "packet.json"), JSON.stringify(packet, null, 2));
  console.log(join(root, "packet.json"));
  process.exit(0);
}
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  meta = JSON.parse(readFileSync(join(exportRoot, "artifacts.json"))),
  identity = readFileSync(join(exportRoot, "source-identity.json"));
assert.equal(sha(identity), meta.source_identity_sha256);
const root = mkdtempSync(join(process.env.TMPDIR, "task5480-public-packet-")),
  source = join(root, "ak-source"),
  workerRoot = join(root, "worker");
mkdirSync(source);
mkdirSync(workerRoot);
let tracked = 0;
for (const [path, hash] of Object.entries(JSON.parse(identity).source_sha256)) {
  assert(!path.startsWith("/") && !path.split("/").includes(".."));
  if (path === ".cargo/config.toml") {
    assert.equal(sha(readFileSync(join(repo, path))), hash);
    continue;
  }
  const bytes = execFileSync("git", ["-C", repo, "show", `${commit}:${path}`], {
    maxBuffer: 10000000,
  });
  assert.equal(sha(bytes), hash, path);
  const target = join(source, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes, { mode: path.endsWith(".sh") ? 0o700 : 0o600 });
  tracked++;
}
const artifact = meta.artifacts.find((a) => a.kind === "candidate-debug");
assert.equal(sha(readFileSync(artifact.path)), artifact.sha256);
copyFileSync(artifact.path, join(workerRoot, "ak-bin"));
chmodSync(join(workerRoot, "ak-bin"), 0o700);
const abi = JSON.parse(
  execFileSync(join(workerRoot, "ak-bin"), ["task-session", "owner-abi"], {
    cwd: root,
    timeout: 15000,
    maxBuffer: 65536,
    env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
  }),
);
assert.deepEqual(abi, {
  schema: "ak.task-session.worker-abi.v1",
  abi: "ak.task-session.worker.v2",
  protocol: "ak.task-session.v1",
  supported_schemas: [40, 43],
  test_support: false,
});
const manifest = {
  schema_version: 1,
  commit,
  activation: "not_published",
  synthetic_fixture_not_release: true,
  task_session: {
    schema: "ak.task-session.worker-abi.v1",
    abi: "ak.task-session.worker.v2",
    protocol: "ak.task-session.v1",
    supported_schemas: [40, 43],
    test_support: false,
  },
  files: { "ak-bin": { sha256: artifact.sha256, mode: 0o700 } },
};
for (const path of [
  "scripts/ak-runtime-gate.sh",
  "scripts/ak-task-session-binding.py",
  "scripts/ak-task-session-supervisor.py",
  "docs/project/contracts/task-session-protocol-v1.json",
  "docs/project/contracts/task-session-deployment-v1.json",
]) {
  const bytes = execFileSync("git", ["-C", repo, "show", `${commit}:${path}`], {
    maxBuffer: 1000000,
  });
  const target = join(workerRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes, { mode: path.endsWith(".sh") ? 0o700 : 0o600 });
  manifest.files[path] = { sha256: sha(bytes), mode: path.endsWith(".sh") ? 0o700 : 0o600 };
}
writeFileSync(join(workerRoot, "pin-manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
const packet = {
  schema: "pi.task-session.public-proof-packet.v1",
  sourceCommit: commit,
  sourceIdentity: sha(identity),
  tracked,
  seedPins: resolve(seedPins),
  workerRoot,
  runtimeRoot: resolve(runtimeRoot),
  workerSha256: artifact.sha256,
  nativeAbi: abi,
  release: false,
  liveActivation: false,
};
writeFileSync(join(root, "packet.json"), JSON.stringify(packet, null, 2));
console.log(join(root, "packet.json"));
