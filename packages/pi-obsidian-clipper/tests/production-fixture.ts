import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// The consumer supplies the exact, registry-authored tarball locally. npm still
// installs the unmodified packed extension and resolves its production dependency.
// A version/integrity change MUST refresh this fixture, not reuse a warm cache.
export function verifyProductionFixture(
  manifest: { dependencies: Record<string, string> },
  lock: { packages: Record<string, { version: string; integrity: string }> },
  tarball: Uint8Array,
) {
  assert.deepEqual(manifest.dependencies, { "ipaddr.js": "2.2.0" });
  const entry = lock.packages["node_modules/ipaddr.js"];
  assert.equal(entry.version, manifest.dependencies["ipaddr.js"]);
  assert.equal(entry.integrity, `sha512-${createHash("sha512").update(tarball).digest("base64")}`);
}

export async function productionFixture() {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const path = resolve("tests/fixtures/ipaddr.js-2.2.0.tgz");
  verifyProductionFixture(manifest, lock, await readFile(path));
  return path;
}
