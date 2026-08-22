// ---
// summary: verifies that the monorepo root either has a committed lockfile or remains dependency-free.
// read_when:
//   - changing root package metadata, root dependency installation, or CI bootstrap behavior.
// ---

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const lockPath = path.join(ROOT, "package-lock.json");
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

function declaredDependencies() {
  return DEPENDENCY_FIELDS.flatMap((field) =>
    Object.keys(manifest[field] ?? {}).map((name) => ({ field, name })),
  );
}

test("root dependency installation is explicit and reproducible", () => {
  assert.equal(manifest.private, true, "the monorepo root must remain private");
  const declared = declaredDependencies();
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    assert.equal(lock.lockfileVersion, 3, "root package-lock must use lockfileVersion 3");
    assert.equal(lock.packages?.[""]?.private, true, "root lock must preserve private=true");
    return;
  }

  assert.deepEqual(
    declared,
    [],
    "a dependency-bearing root package requires a committed package-lock.json; do not synthesize one in CI",
  );
});
