// A synthetic AK runtime bundle and Pi host that the unchanged installed-producer check accepts
// (AK8117). The check refuses any artifact below a symlink, a foreign owner or a group- or
// world-writable directory, so each path below the home gets an explicit mode, and the caller
// must choose a home whose ancestors pass too (never a shared /tmp).
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installedHostBuild } from "../../../dist/task-session/build-identity.js";

const dist = fileURLToPath(new URL("../../../dist/task-session/", import.meta.url));
const fileDigest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

function ownerFile(path, content, mode = 0o644) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
  writeFileSync(path, content, { mode });
  chmodSync(path, mode);
  return path;
}

/** Bindings that pass every installed check, with the host pinned to this checkout's build. */
export function ownerBundle(home) {
  const bundle = join(home, ".local/libexec/agent-kernel/runtime/fixture");
  const gate = ownerFile(join(bundle, "scripts/ak-runtime-gate.sh"), "#!/bin/sh\nexit 64\n", 0o755);
  const binding = ownerFile(join(bundle, "scripts/ak-task-session-binding.py"), "# fixture\n");
  const supervisor = ownerFile(join(bundle, "scripts/ak-task-session-supervisor.py"), "# x\n");
  const contract = (name) =>
    ownerFile(join(bundle, "docs/project/contracts", name), readFileSync(join(dist, name)));
  const protocol = contract("task-session-protocol-v1.json");
  const deployment = contract("task-session-deployment-v1.json");
  const policy = ownerFile(join(bundle, "policy/ak-runtime-access.json"), "{}\n");
  const worker = join(bundle, "worker/ak-bin");
  mkdirSync(dirname(worker), { recursive: true, mode: 0o755 });
  copyFileSync(realpathSync("/usr/bin/true"), worker);
  chmodSync(worker, 0o755);
  const manifest = ownerFile(join(bundle, "worker/pin-manifest.json"), "{}\n");
  const ordinary = ownerFile(join(bundle, "ordinary/ak-bin"), "fixture\n");
  const host = ownerFile(
    join(home, ".local/libexec/pi-task-sessions/host-v1"),
    "#!/bin/sh\n",
    0o755,
  );
  symlinkSync("fixture", join(home, ".local/libexec/agent-kernel/runtime/current"));
  // Directories made by others (provision init makes .local without a mode) follow the umask.
  for (const artifact of [gate, binding, supervisor, protocol, deployment, worker, manifest, host])
    for (let dir = dirname(artifact); ; dir = dirname(dir)) {
      chmodSync(dir, lstatSync(dir).mode & 0o7755);
      if (dir === home || dir === dirname(dir)) break;
    }
  const repeat = (digit) => digit.repeat(64);
  return {
    policy_path: policy,
    policy_sha256: repeat("5"),
    policy_generation: "fixture-1",
    ordinary_binary: { path: ordinary, sha256: fileDigest(ordinary), commit: "1".repeat(40) },
    worker: {
      path: worker,
      sha256: fileDigest(worker),
      commit: "2".repeat(40),
      abi: "ak.task-session.worker.v3",
      manifest_path: manifest,
      manifest_sha256: fileDigest(manifest),
    },
    gate_path: gate,
    gate_sha256: fileDigest(gate),
    binding_sha256: fileDigest(binding),
    deployment_schema_sha256: fileDigest(deployment),
    protocol_sha256: fileDigest(protocol),
    supervisor_sha256: fileDigest(supervisor),
    host_sha256: fileDigest(host),
    host_build_digest: installedHostBuild(),
    database_selector_digest: repeat("6"),
    recovery_invariant_digest: repeat("7"),
  };
}

/** The enabled `ak task-session describe` answer for `bindings`. */
export const enabledDescriptor = (bindings) => ({
  schema: "ak.task-session.descriptor.v1",
  platform: "linux",
  state: "enabled",
  reason: "configured",
  operations: ["plan", "supervise", "recover"],
  authority: false,
  database_opened: false,
  database_locked: false,
  worker_test_support: false,
  bindings,
});
