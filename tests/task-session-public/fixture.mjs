// New task5480 fixtures; prior task5513 packets/reports are never modified.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { available, native, setup as seedSetup, wait } from "../task-session-native/fixture.mjs";
import { digest, json, sha } from "../task-session-native/pins.mjs";
export { native, wait, available, json, sha, digest };
const here = import.meta.dirname;
export async function setup(packet, scenario = "complete") {
  const manifest = json(join(packet.workerRoot, "pin-manifest.json"));
  assert.equal(
    manifest.task_session.test_support,
    false,
    "public path requires default worker, never test-support",
  );
  assert.equal(manifest.task_session.abi, "ak.task-session.worker.v2");
  const alias = scenario.includes("alias") || scenario.startsWith("owner-");
  const old = json(packet.seedPins),
    worker = join(packet.workerRoot, "ak-bin");
  assert.equal(sha(readFileSync(worker)), manifest.files["ak-bin"].sha256);
  const runtime = resolve(packet.runtimeRoot);
  const pins = { ...old, pi: { ...old.pi, runtimeRoot: runtime } };
  const f = await seedSetup(
    pins,
    alias ? "owner-model-recover" : "model-recover",
    Number(process.env.TASK5480_PUBLIC_SCHEMA ?? 43),
  );
  const home = join(f.root, "home"),
    ns = join(home, ".local/state/pi-task-sessions"),
    owner = join(home, "ai-society/softwareco/owned/agent-kernel");
  mkdirSync(ns, { recursive: true, mode: 0o700 });
  for (const name of ["profiles", "credentials", "attempts"]) {
    cpSync(join(f.root, name), join(ns, name), { recursive: true });
    chmodSync(join(ns, name), 0o700);
  }
  if (alias) {
    cpSync(join(f.root, "model-sources"), join(ns, "model-sources"), {
      recursive: true,
    });
    chmodSync(join(ns, "model-sources"), 0o700);
  }
  for (const name of ["namespace.lock", "state.json"]) cpSync(join(f.root, name), join(ns, name));
  const r = lstatSync(ns),
    l = lstatSync(join(ns, "namespace.lock"));
  f.locator = {
    ...f.locator,
    root: ns,
    rootDev: r.dev,
    rootIno: r.ino,
    lockDev: l.dev,
    lockIno: l.ino,
  };
  mkdirSync(join(home, ".config/pi-task-sessions"), {
    recursive: true,
    mode: 0o700,
  });
  f.state.durableWrite(join(home, ".config/pi-task-sessions/host.json"), f.locator, true);
  for (const [name, identity] of Object.entries(manifest.files)) {
    assert.equal(sha(readFileSync(join(packet.workerRoot, name))), identity.sha256);
    if (name === "ak-bin") continue;
    const target = join(owner, name);
    mkdirSync(resolve(target, ".."), { recursive: true, mode: 0o700 });
    cpSync(join(packet.workerRoot, name), target);
    chmodSync(target, identity.mode);
  }
  const host = join(home, ".local/libexec/pi-task-sessions/host-v1");
  mkdirSync(resolve(host, ".."), { recursive: true, mode: 0o700 });
  writeFileSync(
    host,
    `#!/usr/bin/python3
import os
os.environ["TASK5480_FIXTURE_ROOT"]=${JSON.stringify(f.root)}
os.execv(${JSON.stringify(process.execPath)},${JSON.stringify([process.execPath, "--import", join(here, "host-loader.mjs"), join(runtime, "dist/task-session/host-entry.js")])})
`,
    { mode: 0o700 },
  );
  // No profile hash in policy: freeze code/host first, policy second, profile last.
  const seedPolicy = json(join(f.root, "policy.json"));
  const helper = join(
    packet.sourceRoot ?? join(dirname(packet.workerRoot), "ak-source"),
    "scripts/ci/task-session-deployment-fixture.py",
  );
  execFileSync(
    "/usr/bin/python3",
    [
      "-B",
      "-c",
      `import importlib.util,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location("fixture",sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.configure(*[Path(p) for p in sys.argv[2:]],test_support=False)`,
      helper,
      f.root,
      owner,
      worker,
      seedPolicy.database.path,
      seedPolicy.admission_gate.lock_directory,
      host,
    ],
    { env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } },
  );
  const policy = json(join(f.root, "policy.json"));
  const workerPin = {
    path: worker,
    sha256: sha(readFileSync(worker)),
    commit: manifest.commit,
    abi: "ak.task-session.worker.v2",
    manifest_path: join(packet.workerRoot, "pin-manifest.json"),
    manifest_sha256: sha(readFileSync(join(packet.workerRoot, "pin-manifest.json"))),
  };
  const closure = {
    gate_sha256: "scripts/ak-runtime-gate.sh",
    binding_sha256: "scripts/ak-task-session-binding.py",
    supervisor_sha256: "scripts/ak-task-session-supervisor.py",
    protocol_sha256: "docs/project/contracts/task-session-protocol-v1.json",
    deployment_schema_sha256: "docs/project/contracts/task-session-deployment-v1.json",
  };
  const hashes = Object.fromEntries(
    Object.entries(closure).map(([key, path]) => [key, sha(readFileSync(join(owner, path)))]),
  );
  const { installedHostBuild } = await import(
    pathToFileURL(join(runtime, "dist/task-session/build-identity.js"))
  );
  policy.task_session.worker = workerPin;
  policy.task_session.host_build_digest = installedHostBuild();
  mkdirSync(join(owner, "policy"), { mode: 0o700 });
  const policyPath = join(owner, "policy/ak-runtime-access.json");
  writeFileSync(policyPath, JSON.stringify(policy), { mode: 0o600 });
  const bindings = {
    policy_path: policyPath,
    policy_sha256: sha(readFileSync(policyPath)),
    policy_generation: policy.task_session.generation,
    ordinary_binary: policy.approved_binary,
    worker: workerPin,
    gate_path: join(owner, closure.gate_sha256),
    ...hashes,
    host_sha256: policy.task_session.host_sha256,
    host_build_digest: policy.task_session.host_build_digest,
    database_selector_digest: sha(policy.database.path),
  };
  f.state.durableWrite(
    join(ns, "producer.json"),
    {
      schema: "pi.task-session.producer-binding.v1",
      publication: "owner-approved",
      bindings,
    },
    true,
  );
  const pin = {
    ...f.pin,
    runSeconds: 120,
    producer: {
      ...f.pin.producer,
      executable: bindings.gate_path,
      entrypointDigest: bindings.gate_sha256,
      akBinaryDigest: workerPin.sha256,
      policyDigest: bindings.policy_sha256,
      hostBuildDigest: bindings.host_build_digest,
    },
  };
  const request = {
    ...f.request,
    requestId: `task5480-public-${scenario}`,
    profile: digest(pin),
  };
  f.state.durableWrite(join(ns, "profiles", `${request.profile}.json`), pin, true);
  const config = {
    ...f.config,
    root: f.root,
    home,
    ns,
    owner,
    host,
    gate: bindings.gate_path,
    runtime,
    locator: f.locator,
    scenario,
    databasePath: policy.database.path,
    usePiProjection: scenario === "tool",
    bindings,
  };
  writeFileSync(join(f.root, "public-fixture.json"), JSON.stringify(config), {
    mode: 0o600,
  });
  return {
    ...f,
    home,
    ns,
    owner,
    host,
    bindings,
    policyPath,
    pin,
    request,
    config,
  };
}
