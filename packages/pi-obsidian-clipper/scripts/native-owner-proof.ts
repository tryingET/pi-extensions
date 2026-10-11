// Host qualification, not a portable CI test: requires Linux unprivileged user namespaces,
// util-linux unshare/newuidmap/newgidmap and subordinate UID/GID mappings for this user.
// Missing prerequisites FAIL (never silently skip). Only a fresh test-owned file is chowned;
// no sudo, live artifact/configuration change, native execution or network operation occurs.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chown, lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { admitNative } from "../src/closure.ts";
import { fixture } from "../tests/helpers.ts";
import { artifactRoot } from "../tests/native-fixture.ts";

const exec = promisify(execFile);
assert.equal(process.platform, "linux", "Owner proof requires Linux user namespaces");
assert.ok(process.getuid && process.getuid() !== 0, "Run as the ordinary non-root operator");
const f = await fixture();
try {
  const a = await artifactRoot(f.dir, "process.stdout.write('Owner proof body')", {
    "node_modules/dep/index.js": "exports.word = 'inert';",
  });
  const path = join(a.root, "node_modules/dep/index.js");
  const digest = async () =>
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  const inherited = await lstat(path);
  // A setgid scratch parent can give this fresh inode a secondary group not mapped by
  // --map-root-user. Normalize this test-owned file only, before the ownership controls.
  assert.equal(inherited.uid, process.getuid?.());
  assert.ok(process.getgid, "Owner proof requires a primary GID");
  await chown(path, inherited.uid, process.getgid());
  const before = await lstat(path);
  assert.equal(before.gid, process.getgid());
  const hash = await digest();
  const control = await admitNative(a.cli);
  const changeOwner = async (owner: string) => {
    // Namespace uid 0 maps to this host user; uid 1 maps to a configured subordinate uid.
    // The fixture inode stays on the host filesystem, so the real admission observes its
    // actual foreign uid, rather than a mocked stat or an alternate uid interpretation.
    await exec("unshare", ["--user", "--map-auto", "--map-root-user", "chown", owner, path], {
      timeout: 10000,
      maxBuffer: 65536,
    });
  };
  await changeOwner("1:1");
  const foreign = await lstat(path);
  assert.notEqual(foreign.uid, before.uid);
  assert.notEqual(foreign.uid, 0);
  assert.equal(foreign.ino, before.ino);
  assert.equal(foreign.dev, before.dev);
  assert.equal(foreign.size, before.size);
  assert.equal(foreign.mode, before.mode);
  // A real foreign-owned inode must reject with the specific admission error, before spawn.
  await assert.rejects(
    admitNative(a.cli),
    /closure has a foreign owner: node_modules\/dep\/index\.js/,
  );
  await changeOwner("0:0");
  const restored = await lstat(path);
  for (const key of ["uid", "gid", "ino", "dev", "mode", "size"] as const)
    assert.equal(restored[key], before[key], `restored ${key}`);
  assert.equal(await digest(), hash);
  assert.deepEqual(await admitNative(a.cli), control);
  console.log(
    JSON.stringify({
      ownerProofPassed: true,
      node: process.versions.node,
      mechanism: "host-visible inode ownership via unprivileged subordinate-ID namespace",
      hostUid: before.uid,
      inheritedGid: inherited.gid,
      normalizedGid: before.gid,
      foreignUid: foreign.uid,
      sameInodeModeBytes: true,
      controlAdmitted: true,
      foreignRejected: true,
      restoredAdmitted: true,
      nativeSpawned: false,
    }),
  );
} finally {
  // All directories remain owned by the operator; unlinking the foreign fixture (if a
  // prerequisite/assertion failed) needs only permission on its test-owned parent.
  await f.dispose();
}
