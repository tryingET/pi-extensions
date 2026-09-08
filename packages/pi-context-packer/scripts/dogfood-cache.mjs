/** Real-binary cache equivalence and working-tree invalidation. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectRipwire } from "../src/ripwire-provider.js";
import { fixtureDigest } from "./dogfood-fixtures.mjs";
export async function cacheScenario() {
  const temp = await mkdtemp(join(tmpdir(), "ripwire-cache-"));
  const root = join(temp, "source");
  const cacheRoot = join(temp, "cache");
  try {
    await mkdir(root);
    await writeFile(join(root, "a.ts"), "export function cacheTarget() { return 1; }\n");
    const before = await fixtureDigest(root);
    const input = { root, objective: "Find cacheTarget" };
    let calls = 0;
    const options = { cacheRoot, onExecution: () => calls++ };
    const cold = await collectRipwire(input, options);
    const warm = await collectRipwire(input, options);
    assert.equal(cold.ok, true);
    assert.equal(cold.state.cache, "miss");
    assert.equal(warm.state.cache, "hit");
    assert.deepEqual(warm.items, cold.items);
    assert.equal(calls, 3);
    assert.equal(await fixtureDigest(root), before);
    const disabled = await collectRipwire(input);
    assert.deepEqual(disabled.items, cold.items);
    await writeFile(join(root, "a.ts"), "export function cacheTarget() { return 2; }\n");
    const edited = await collectRipwire(input, options);
    assert.equal(edited.state.cache, "miss");
    assert.notEqual(edited.state.snapshotId, cold.state.snapshotId);
    await writeFile(join(root, "new.ts"), "export function newCacheTarget() { return 3; }\n");
    const added = await collectRipwire(input, options);
    assert.equal(added.state.analyzedFiles, 2);
    assert.equal(added.state.cache, "miss");
    await rename(join(root, "new.ts"), join(root, "renamed.ts"));
    const renamed = await collectRipwire(input, options);
    assert.notEqual(renamed.state.snapshotId, added.state.snapshotId);
    await rm(join(root, "renamed.ts"));
    const deleted = await collectRipwire(input, options);
    assert.equal(deleted.state.snapshotId, edited.state.snapshotId);
    const excluded = await collectRipwire(input, { ...options, excludePaths: ["a.ts"] });
    assert.equal(excluded.state.analyzedFiles, 0);
    for (const file of await readdir(cacheRoot))
      await writeFile(join(cacheRoot, file), "malformed");
    const corrupt = await collectRipwire(input, options);
    assert.equal(corrupt.state.cache, "corrupt_miss");
    assert.deepEqual(corrupt.items, edited.items);
    const afterChanges = await fixtureDigest(root);
    const refused = await collectRipwire(input, { cacheRoot: join(root, "badcache") });
    assert.equal(refused.ok, false);
    assert.equal(await fixtureDigest(root), afterChanges);
    return {
      gate: "RW-06",
      realBinary: true,
      coldWarmEquivalent: true,
      dirtyAddRenameDeletePolicyInvalidation: true,
      corruptRecovery: true,
      sourceCacheRefused: true,
      acquisitionUnchanged: true,
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
