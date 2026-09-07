// Independent test-only evidence gate. No AK CLI, build, install or policy activation.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const canonical = (x) =>
  JSON.stringify(x, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
export const digest = (x) => sha(canonical(x));
export const head = (root) =>
  execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
export const json = (path) => JSON.parse(readFileSync(path, "utf8"));
export async function fileHash(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export function inventory(root, paths, links = false) {
  const out = {};
  function visit(path) {
    const s = lstatSync(path);
    if (s.isSymbolicLink()) {
      assert(links && realpathSync(path).startsWith(root + sep), `external symlink: ${path}`);
      out[relative(root, path)] = `symlink:${readlinkSync(path)}`;
      return;
    }
    if (s.isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name));
    else {
      assert(s.isFile());
      out[relative(root, path)] = sha(readFileSync(path));
    }
  }
  for (const path of paths) visit(join(root, path));
  return out;
}
export const piPaths = [
  "packages/pi-little-helpers/src/task-session",
  "packages/pi-little-helpers/dist/task-session",
  "packages/pi-little-helpers/scripts/task-session-build.mjs",
  "packages/pi-little-helpers/src/taskSessionTransport.ts",
  "packages/pi-little-helpers/extensions/sidequestGhostty.ts",
  "packages/pi-society-orchestrator/src/runtime/task-session-adapter.ts",
  "packages/pi-society-orchestrator/src/runtime/task-session-protocol-v1.json",
  "packages/pi-little-helpers/package.json",
  "packages/pi-little-helpers/package-lock.json",
];
export function sourceCheck(root, entries) {
  assert(Object.keys(entries).length > 0, "empty source inventory");
  for (const [path, hash] of Object.entries(entries)) {
    const full = resolve(root, path);
    assert(full.startsWith(`${root}${sep}`), "source path escape");
    assert.equal(sha(readFileSync(full)), hash, `source drift: ${path}`);
  }
}
export async function verifyPins(pins) {
  assert.equal(pins.releasePin, false);
  let receipt;
  if (pins.schema === "pi.task-session.native-integration-pins.v2") {
    // A frozen verification packet is not represented as the current working tree.
    for (const owner of [pins.ak, pins.pi]) {
      assert.equal(realpathSync(owner.root), owner.root);
      sourceCheck(owner.root, owner.sources);
    }
    receipt = json(pins.ak.receipt);
    assert.equal(sha(readFileSync(pins.ak.receipt)), pins.ak.receiptSha256);
    assert.equal(sha(readFileSync(pins.ak.identity)), receipt.source_identity_sha256);
    assert.deepEqual(json(pins.ak.identity).source_sha256, pins.ak.sources);
    assert.equal(await fileHash(pins.pi.tar), pins.pi.tarHash);
    assert(readFileSync(join(pins.pi.root, pins.pi.ownerMemo), "utf8").includes(pins.pi.tarHash));
    assert.deepEqual(
      inventory(pins.pi.root, ["runtime"], true),
      pins.pi.runtimeInventory,
      "frozen dependency/runtime drift",
    );
    receipt = {
      ...receipt,
      artifacts: receipt.artifacts.map((a) => ({
        ...a,
        kind:
          a.kind === "native-worker-fixture"
            ? "native_fixture"
            : a.kind === "candidate-debug"
              ? "candidate_debug"
              : a.kind,
      })),
    };
  } else {
    assert.equal(pins.schema, "pi.task-session.native-integration-pins.v1");
    for (const owner of [pins.ak, pins.pi]) {
      assert.equal(realpathSync(owner.root), owner.root);
      assert.equal(head(owner.root), owner.head, "owner HEAD drift; refreeze before running");
      sourceCheck(owner.root, owner.sources);
    }
    assert.deepEqual(
      inventory(pins.pi.root, piPaths),
      pins.pi.sources,
      "Pi closure additions/deletions",
    );
    receipt = json(pins.ak.receipt);
    assert.equal(sha(readFileSync(pins.ak.receipt)), pins.ak.receiptSha256);
    assert.equal(receipt.source_commit, pins.ak.sourceCommit);
    assert.deepEqual(receipt.source_sha256, pins.ak.sources);
  }
  for (const kind of ["native_fixture", "candidate_debug"]) {
    const artifact = pins.artifacts[kind];
    assert(
      receipt.artifacts.some((a) => a.kind === kind && a.sha256 === artifact.sha256),
      "artifact absent from owner receipt",
    );
    assert.equal(realpathSync(artifact.path), artifact.path);
    const s = lstatSync(artifact.path);
    assert(s.isFile() && (s.mode & 0o111) !== 0 && (s.mode & 0o022) === 0);
    const fd = await import("node:fs/promises");
    const file = await fd.open(artifact.path, "r");
    try {
      const b = Buffer.alloc(4);
      await file.read(b, 0, 4, 0);
      assert.equal(b.toString("hex"), "7f454c46", "not a native ELF; no scripted worker");
    } finally {
      await file.close();
    }
    assert.equal(await fileHash(artifact.path), artifact.sha256, `${kind} bytes differ`);
  }
  const fixture = readFileSync(
    join(pins.ak.root, "crates/ak-cli/tests/task_session_native_process.rs"),
    "utf8",
  );
  assert.match(fixture, /#\[path = "\.\.\/src\/task_session.rs"\]/);
  assert.match(fixture, /task_session::run_owner_private\(path, &root.join\("policy.json"\)\)/);
  return pins;
}
