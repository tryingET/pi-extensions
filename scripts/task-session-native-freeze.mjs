#!/usr/bin/env node
// Freeze owner artifacts in NEW owned scratch; never update a producer/consumer runtime.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fileHash,
  head,
  inventory,
  json,
  piPaths,
  sha,
  verifyPins,
} from "../tests/task-session-native/pins.mjs";

const [akRepo, akInput, exported, packed, piInput] = process.argv.slice(2);
assert(
  akRepo && akInput && exported && packed && piInput,
  "AK_REPO AK_REF EXPORT_DIR PACK_DIR PI_REF required",
);
const piRepo = dirname(dirname(fileURLToPath(import.meta.url)));
const akRef = execFileSync("git", ["-C", akRepo, "rev-parse", `${akInput}^{commit}`], {
  encoding: "utf8",
}).trim();
const piRef = execFileSync("git", ["-C", piRepo, "rev-parse", `${piInput}^{commit}`], {
  encoding: "utf8",
}).trim();
const packet = mkdtempSync(join(realpathSync(process.env.TMPDIR), "task5513-frozen-"));
console.error(`owned verification packet: ${packet}`);
const put = (path, bytes) => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, bytes, { flag: "wx", mode: 0o400 });
};
function blob(repo, ref, path) {
  return execFileSync("git", ["-C", repo, "show", `${ref}:${path}`], {
    maxBuffer: 16 * 1024 * 1024,
  });
}
function materialize(repo, ref, root, paths) {
  const hashes = {};
  for (const path of paths) {
    assert(resolve(root, path).startsWith(`${root}/`));
    const bytes = blob(repo, ref, path);
    hashes[path] = sha(bytes);
    put(join(root, path), bytes);
  }
  return hashes;
}
const receipt = json(join(exported, "artifacts.json"));
const identityBytes = readFileSync(join(exported, "source-identity.json"));
assert.equal(sha(identityBytes), receipt.source_identity_sha256);
const identity = JSON.parse(identityBytes);
const akRoot = join(packet, "ak-source");
const sources = materialize(
  akRepo,
  akRef,
  akRoot,
  Object.keys(identity.source_sha256).filter((p) => p !== ".cargo/config.toml"),
);
// Owner manifest also binds this ignored, non-runtime build-settings appendix.
const appendix = readFileSync(join(akRepo, ".cargo/config.toml"));
assert.equal(sha(appendix), identity.source_sha256[".cargo/config.toml"]);
put(join(akRoot, ".cargo/config.toml"), appendix);
sources[".cargo/config.toml"] = sha(appendix);
assert.deepEqual(
  sources,
  identity.source_sha256,
  "Git blobs must match the actual build source manifest",
);
put(join(packet, "artifacts.json"), readFileSync(join(exported, "artifacts.json")));
put(join(packet, "source-identity.json"), identityBytes);
const artifacts = {};
for (const [kind, ownerKind] of [
  ["native_fixture", "native-worker-fixture"],
  ["candidate_debug", "candidate-debug"],
]) {
  const artifact = receipt.artifacts.find((a) => a.kind === ownerKind);
  assert(artifact);
  assert.equal(await fileHash(artifact.path), artifact.sha256);
  const path = join(packet, ownerKind);
  copyFileSync(artifact.path, path);
  chmodSync(path, 0o500);
  artifacts[kind] = { path, sha256: artifact.sha256 };
}
const piRoot = join(packet, "pi");
const sourcePaths = piPaths.filter((p) => !p.includes("/dist/"));
const names = execFileSync(
  "git",
  ["-C", piRepo, "ls-tree", "-r", "--name-only", piRef, "--", ...sourcePaths],
  { encoding: "utf8" },
)
  .trim()
  .split("\n");
const piSources = materialize(piRepo, piRef, piRoot, names);
const memoPath = "docs/project/2026-09-07-visible-task-session-pi-implementation.md";
const memo = blob(piRepo, piRef, memoPath);
put(join(piRoot, memoPath), memo);
piSources[memoPath] = sha(memo);
const packReceiptBytes = readFileSync(join(packed, "evidence.json"));
put(join(packet, "pi-pack-evidence.json"), packReceiptBytes);
const packReceipt = JSON.parse(packReceiptBytes);
mkdirSync(join(piRoot, "runtime"), { recursive: true, mode: 0o700 });
cpSync(join(packed, "node_modules"), join(piRoot, "runtime/node_modules"), {
  recursive: true,
  verbatimSymlinks: true,
});
const runtimeRoot = join(piRoot, "runtime/node_modules/@tryinget/pi-little-helpers");
const packedArtifacts = [];
for (const name of ["@tryinget/pi-little-helpers", "@tryinget/pi-society-orchestrator"]) {
  const entry = packReceipt.packages.find((p) => p.name === name);
  assert(entry);
  const tarHash = await fileHash(join(packed, entry.filename));
  assert(memo.includes(tarHash), "owner memo must bind exact packed artifact");
  const tar = join(packet, entry.filename);
  copyFileSync(join(packed, entry.filename), tar);
  chmodSync(tar, 0o400);
  const extracted = join(packet, "tar-check", name.split("/")[1]);
  mkdirSync(extracted, { recursive: true, mode: 0o700 });
  const members = execFileSync("/usr/bin/tar", ["-tzf", tar], { encoding: "utf8" })
    .trim()
    .split("\n");
  assert(members.every((p) => p.startsWith("package/") && !p.split("/").includes("..")));
  execFileSync("/usr/bin/tar", ["-xzf", tar, "-C", extracted]);
  const installed = join(piRoot, "runtime/node_modules", name);
  for (const [path, hash] of Object.entries(inventory(join(extracted, "package"), ["."])))
    assert.equal(
      sha(readFileSync(join(installed, path))),
      hash,
      `installed package differs: ${path}`,
    );
  packedArtifacts.push({ name, path: tar, sha256: tarHash });
}
const tarName = packedArtifacts[0].path;
const tarHash = packedArtifacts[0].sha256;
const runtimeInventory = inventory(piRoot, ["runtime"], true);
const pins = {
  schema: "pi.task-session.native-integration-pins.v2",
  releasePin: false,
  packet,
  observedLiveHeads: { ak: head(akRepo), pi: head(piRepo) },
  ak: {
    root: akRoot,
    head: akRef,
    sourceCommit: akRef,
    nonGitBuildAppendix: [".cargo/config.toml"],
    sources,
    receipt: join(packet, "artifacts.json"),
    receiptSha256: sha(readFileSync(join(packet, "artifacts.json"))),
    identity: join(packet, "source-identity.json"),
  },
  pi: {
    root: piRoot,
    head: piRef,
    sources: piSources,
    runtimeRoot,
    runtimeInventory,
    tar: tarName,
    packedArtifacts,
    packEvidence: join(packet, "pi-pack-evidence.json"),
    packEvidenceSha256: sha(packReceiptBytes),
    tarHash,
    ownerMemo: memoPath,
  },
  artifacts,
};
await verifyPins(pins);
put(join(packet, "pins.json"), `${JSON.stringify(pins, null, 2)}\n`);
console.log(join(packet, "pins.json"));
