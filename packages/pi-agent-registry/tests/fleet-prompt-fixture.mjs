// Test-only receipt: copied with read-only `git show <commit>:<path>` from
// ~/ai-society/core/tpl-template-repo; never import or execute fixture content.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const RATIFIED_FIXTURE_COMMIT = "3eba942c0df2726fd5f4e0e138d5007cc356f4ab";
export const SOURCE_FIXTURE_PATH = "fixtures/l2/tpl-agent-repo";
export const METADATA_SOURCE_COMMIT = "7413cbe33f3718d9413b6b028465b9b3b68fbb6c";
export const COMPILED_PATH = "docs/person/system-prompt.md";
export const COMPILED_SHA256 = "d0bd36460fcc239994199311b6270a1851b2c34895047e2282bea6eb211a073f";
// Exactly the seven added lines from AK6351; not a general YAML stripping rule.
export const KNOWN_METADATA_PREFIX =
  '---\nsummary: "Compiled agent system prompt from the manifest and persona inputs."\nread_when:\n  - "Inspecting the generated agent system prompt."\ntype: reference\n---\n\n';
export const METADATA_COMPILED_SHA256 =
  "13d7046722c15867e3f2078a6392c804399e1687a5838758be9cf20486298b9b";
export const FIXTURE_SHA256 = Object.freeze({
  "agent.json": "7e3a6cb550dab9712998cd17c022f55f05053cdff8d66f27e76937ac54864433",
  "docs/person/.gitkeep": "01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b",
  "docs/person/README.md": "0e5b9005b11106d2b61c591584e6aa4fc8b0de4a27c4585f6fd039389d099d00",
  "docs/person/behavior_rules.md":
    "3024a7167e368676d0102b747719706672566f6bacaa6673622f4619a2ff3b4a",
  "docs/person/dream_goal.md": "96f9569789f447fb09fc68f0d2cb1dffc2c72c4d6b85d23bd322d6cf292586e2",
  "docs/person/identity.md": "773a0a9ec96b51f880d39e9602659fc58cdc2cdc608d55e0bcb2a842bd7d9cad",
  "docs/person/main_task.md": "c96226ecbbc0d445cdf17d37a02eccfb9a0a4714ce7161c82eb836340290aed9",
  "docs/person/reason.md": "61c221dc455c440b379a2c1d8fed4913a7f0fb616eb12dd8b2d10fa67ef3a23c",
  [COMPILED_PATH]: COMPILED_SHA256,
});
export const vendoredFixture = fileURLToPath(
  new URL("./fixtures/ratified-agent-3eba942/", import.meta.url),
);
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function assertContractPaths(paths) {
  assert.deepEqual(
    [...paths].sort(),
    Object.keys(FIXTURE_SHA256).sort(),
    "contract file-set drift",
  );
}

// Walk the whole contract directory, including ignored/untracked extras. No symlink reads.
export function readContractFiles(root) {
  const files = new Map();
  // Foreign canonical JSON is opaque byte-receipted data, not formatter input.
  // Its logical contract name stays agent.json; live files are never remapped.
  const manifestName = root === vendoredFixture ? "agent.json.fixture" : "agent.json";
  function visit(path) {
    const file = join(root, path === "agent.json" ? manifestName : path);
    const stat = lstatSync(file);
    if (stat.isDirectory()) {
      for (const name of readdirSync(join(root, path))) visit(`${path}/${name}`);
    } else {
      assert.ok(stat.isFile(), `contract path is not a regular file: ${path}`);
      // All nine ratified blobs have Git mode 100644. Retain the previous
      // live git-diff alarm's rejection of executable-bit drift.
      assert.equal(stat.mode & 0o111, 0, `contract file became executable: ${path}`);
      files.set(path, readFileSync(file));
    }
  }
  visit("agent.json");
  visit("docs/person");
  return files;
}

export function assertFixtureReceipt(files) {
  assertContractPaths(files.keys());
  for (const [path, expected] of Object.entries(FIXTURE_SHA256)) {
    assert.equal(sha256(files.get(path)), expected, `fixture SHA256 mismatch: ${path}`);
  }
}

export function assertLiveContract(files, pinned, observation) {
  assertFixtureReceipt(pinned);
  assert.equal(observation.lastManifestCommit, RATIFIED_FIXTURE_COMMIT, "manifest commit drift");
  assert.equal(observation.status, "", "ratified fixture bytes have uncommitted drift");
  assertContractPaths(observation.pinnedPaths);
  assertContractPaths(observation.trackedPaths);
  assertContractPaths(files.keys());
  for (const [path, expected] of pinned) {
    const actual = files.get(path);
    if (path === COMPILED_PATH && !actual.equals(expected)) {
      assert.deepEqual(
        actual,
        Buffer.concat([Buffer.from(KNOWN_METADATA_PREFIX), expected]),
        `live bytes drift: ${path} (only the exact ${METADATA_SOURCE_COMMIT} prefix is allowed)`,
      );
    } else {
      assert.deepEqual(actual, expected, `live bytes drift: ${path}`);
    }
  }
}
