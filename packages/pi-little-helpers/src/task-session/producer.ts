import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { installedHostBuild } from "./build-identity.js";
import { assertSdkIdentity } from "./identity.js";
import { bytesDigest, digest, parseJson, record, refuse } from "./json.js";
import {
  interpretTaskSessionBindings,
  interpretTaskSessionDescriptor,
  interpretTaskSessionOwnerPlan,
  type ProducerBindings,
  requireTaskSessionProducer,
  taskSessionAdapterIdentity,
} from "./producer-adapter.js";
import type { ProfilePin } from "./profile.js";
import { accountLocator, type Locator, privateRead } from "./state.js";

const CLOSURE = {
  gate_sha256: "scripts/ak-runtime-gate.sh",
  binding_sha256: "scripts/ak-task-session-binding.py",
  supervisor_sha256: "scripts/ak-task-session-supervisor.py",
  protocol_sha256: "docs/project/contracts/task-session-protocol-v1.json",
  deployment_schema_sha256: "docs/project/contracts/task-session-deployment-v1.json",
} as const;
export function ownerInstallation() {
  const home = userInfo().homedir;
  return {
    root: join(home, "ai-society/softwareco/owned/agent-kernel"),
    host: join(home, ".local/libexec/pi-task-sessions/host-v1"),
  };
}
/** Identity only, streaming bounded memory. No worker invocation or database access. */
function artifact(path: string, expected: string, executable = false, elf = false) {
  for (let p = dirname(path); ; p = dirname(p)) {
    const info = lstatSync(p);
    if (
      info.isSymbolicLink() ||
      !info.isDirectory() ||
      ![0, process.getuid?.()].includes(info.uid) ||
      (info.mode & 0o022) !== 0
    )
      refuse("producer_artifact_parent_invalid");
    if (p === dirname(p)) break;
  }
  const info = lstatSync(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.uid !== process.getuid?.() ||
    (info.mode & 0o022) !== 0 ||
    realpathSync(path) !== path
  )
    refuse("producer_artifact_identity_invalid");
  if (elf && info.size < 20) refuse("producer_elf_incompatible");
  if (executable && (info.mode & 0o100) === 0) refuse("producer_not_executable");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    if (opened.dev !== info.dev || opened.ino !== info.ino) refuse("producer_artifact_changed");
    const hash = createHash("sha256"),
      buffer = Buffer.alloc(65536);
    let size = 0;
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      size += count;
      if (size > 1073741824) refuse("producer_artifact_too_large");
      if (elf && size === count) {
        if (
          count < 20 ||
          buffer.subarray(0, 4).toString("hex") !== "7f454c46" ||
          buffer[4] !== 2 ||
          buffer[5] !== 1 ||
          ![0, 3].includes(buffer[7]) ||
          ![2, 3].includes(buffer.readUInt16LE(16)) ||
          buffer.readUInt16LE(18) !== 62
        )
          refuse("producer_elf_incompatible");
      }
      hash.update(buffer.subarray(0, count));
    }
    if (hash.digest("hex") !== expected) refuse("producer_artifact_changed");
    const current = lstatSync(path);
    if (current.dev !== opened.dev || current.ino !== opened.ino || current.size !== size)
      refuse("producer_artifact_changed");
  } finally {
    closeSync(fd);
  }
}
export function installedProducerPins(locator: Locator = accountLocator()) {
  const raw = record(parseJson(privateRead(join(locator.root, "producer.json"))), [
    "schema",
    "publication",
    "bindings",
  ]);
  if (raw.schema !== "pi.task-session.producer-binding.v1" || raw.publication !== "owner-approved")
    refuse("producer_publication_required");
  const bindings = interpretTaskSessionBindings(raw.bindings),
    installation = ownerInstallation();
  if (process.platform !== "linux" || process.arch !== "x64")
    refuse("producer_platform_unsupported");
  if (
    bindings.gate_path !== join(installation.root, CLOSURE.gate_sha256) ||
    bindings.policy_path !== join(installation.root, "policy/ak-runtime-access.json")
  )
    refuse("producer_entrypoint_not_fixed");
  if (
    bindings.protocol_sha256 !== taskSessionAdapterIdentity.producerSchemaDigest ||
    bindings.deployment_schema_sha256 !== taskSessionAdapterIdentity.deploymentSchemaDigest
  )
    refuse("producer_protocol_incompatible");
  const checkedArtifact = (path: string, expected: string, executable = false, elf = false) => {
    if (path === bindings.policy_path) refuse("producer_policy_artifact_forbidden");
    // Owner DB selector stays opaque. Detect every family-prefix alias, including native
    // WAL/FEC/namespace suffixes, without opening policy or any database-family member.
    for (let end = 1; end <= path.length; end++)
      if (bytesDigest(path.slice(0, end)) === bindings.database_selector_digest)
        refuse("producer_database_artifact_forbidden");
    artifact(path, expected, executable, elf);
  };
  const publicationDigest = digest(raw);
  const assertArtifacts = () => {
    if (digest(parseJson(privateRead(join(locator.root, "producer.json")))) !== publicationDigest)
      refuse("producer_publication_changed");
    // Owner policy is opaque. Never open policy_path; currentness comes from owner describe.
    for (const [key, path] of Object.entries(CLOSURE))
      checkedArtifact(
        join(installation.root, path),
        bindings[key as keyof typeof CLOSURE],
        key === "gate_sha256",
      );
    checkedArtifact(bindings.worker.path, bindings.worker.sha256, true, true);
    checkedArtifact(bindings.worker.manifest_path, bindings.worker.manifest_sha256);
    checkedArtifact(bindings.ordinary_binary.path, bindings.ordinary_binary.sha256);
    checkedArtifact(installation.host, bindings.host_sha256, true);
    assertSdkIdentity();
    if (installedHostBuild() !== bindings.host_build_digest) refuse("producer_host_build_mismatch");
  };
  assertArtifacts();
  return { bindings, assertArtifacts };
}
export async function describeInstalledProducer(
  locator: Locator = accountLocator(),
  profile?: ProfilePin,
) {
  const pins = installedProducerPins(locator); // Trust/closure check BEFORE any owner entrypoint invocation.
  if (profile) assertProducerProfile(pins.bindings, profile);
  const value = await new Promise<unknown>((resolve, reject) => {
    execFile(
      pins.bindings.gate_path,
      ["--", "task-session", "describe"],
      { timeout: 15000, maxBuffer: 65536, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } },
      (error, stdout) => {
        if (error) return reject(new Error("producer_lookup_failed"));
        try {
          resolve(parseJson(stdout, 65536));
        } catch {
          reject(new Error("producer_descriptor_invalid"));
        }
      },
    );
  });
  pins.assertArtifacts();
  const descriptor = interpretTaskSessionDescriptor(value);
  const assertStable = () => {
    pins.assertArtifacts();
    let current: unknown;
    try {
      current = parseJson(
        execFileSync(pins.bindings.gate_path, ["--", "task-session", "describe"], {
          timeout: 15000,
          maxBuffer: 65536,
          env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
          stdio: ["ignore", "pipe", "pipe"],
        }),
        65536,
      );
    } catch {
      refuse("producer_lookup_failed");
    }
    pins.assertArtifacts();
    requireTaskSessionProducer(current, pins.bindings);
  };
  return { ...pins, descriptor, assertStable };
}
export async function requireInstalledProducer(
  locator: Locator = accountLocator(),
  profile?: ProfilePin,
) {
  const state = await describeInstalledProducer(locator, profile);
  requireTaskSessionProducer(state.descriptor, state.bindings);
  if (profile) assertProducerProfile(state.bindings, profile);
  return state;
}
export function assertProducerProfile(b: ProducerBindings, p: ProfilePin) {
  // The full policy SHA binds the owner's recovery invariant too. Keep it opaque: no Pi
  // policy-diff algorithm or parallel profile field that could disagree with owner meaning.
  interpretTaskSessionBindings(b);
  if (
    p.producer.executable !== b.gate_path ||
    p.producer.entrypointDigest !== b.gate_sha256 ||
    p.producer.akBinaryDigest !== b.worker.sha256 ||
    p.producer.policyDigest !== b.policy_sha256 ||
    p.producer.hostBuildDigest !== b.host_build_digest
  )
    refuse("producer_profile_mismatch");
}

export async function readInstalledBaseline(
  state: Awaited<ReturnType<typeof requireInstalledProducer>>,
  taskId: number,
  databaseIdentity: string,
  cwd: string,
) {
  state.assertStable();
  const raw = await new Promise<unknown>((resolve, reject) => {
    const child = execFile(
      state.bindings.gate_path,
      ["--", "task-session", "plan"],
      { cwd, timeout: 15000, maxBuffer: 1048576, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } },
      (error, stdout) => {
        if (error) return reject(new Error("native_plan_unavailable"));
        try {
          resolve(parseJson(stdout));
        } catch {
          reject(new Error("native_plan_invalid"));
        }
      },
    );
    child.stdin?.end(JSON.stringify({ task_id: taskId }));
  });
  state.assertStable();
  const result = interpretTaskSessionOwnerPlan(raw, state.bindings);
  if (result.databaseIdentity !== databaseIdentity) refuse("producer_database_mismatch");
  return result.baseline;
}
