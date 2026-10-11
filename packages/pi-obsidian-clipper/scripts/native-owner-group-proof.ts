// AK6999 host-only regression for inherited GID handling. Requires the owner-proof
// prerequisites plus membership in a secondary group. Missing prerequisites fail, not skip.
// Only fresh test-owned scratch directories/inodes are changed; no native engine is run.
import assert from "node:assert/strict";
import { chmod, chown, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixture } from "../tests/helpers.ts";
import { runOwnerProof } from "./owner-proof-process.ts";

assert.equal(process.platform, "linux");
assert.ok(process.getuid && process.getgid && process.getgroups);
const primary = process.getgid();
const secondary = process.getgroups().find((gid) => gid !== primary && gid !== 0);
assert.ok(secondary !== undefined, "Group regression needs a configured secondary group");
const require = createRequire(import.meta.url);
const script = fileURLToPath(new URL("./native-owner-proof.ts", import.meta.url));
const results = [];
for (const gid of [primary, secondary]) {
  const f = await fixture();
  try {
    const parent = join(f.dir, ".scratch/tests");
    await mkdir(parent, { recursive: true, mode: 0o700 });
    await chown(parent, process.getuid(), gid);
    await chmod(parent, 0o2700);
    const info = await stat(parent);
    assert.equal(info.gid, gid);
    assert.equal(info.mode & 0o2777, 0o2700);
    const { stdout } = await runOwnerProof(
      process.execPath,
      ["--import", require.resolve("tsx"), script],
      f.dir,
    );
    const proof = JSON.parse(stdout.trim());
    assert.equal(proof.ownerProofPassed, true);
    assert.equal(proof.inheritedGid, gid);
    assert.equal(proof.normalizedGid, primary);
    assert.equal(proof.foreignRejected, true);
    assert.equal(proof.restoredAdmitted, true);
    assert.equal(proof.sameInodeModeBytes, true);
    assert.equal(proof.nativeSpawned, false);
    results.push({ inheritedGid: gid, normalizedGid: primary, foreignRejected: true });
  } finally {
    await f.dispose();
  }
}
console.log(JSON.stringify({ groupRegressionPassed: true, node: process.versions.node, results }));
