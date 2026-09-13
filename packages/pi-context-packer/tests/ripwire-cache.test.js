import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cachedRipwireText } from "../src/ripwire-cache.js";

test("cache keys include source identity and recover corruption", async () => {
  const root = await mkdtemp(join(tmpdir(), "cache-test-"));
  try {
    let calls = 0;
    const options = {
      cacheRoot: join(root, "cache"),
      sourceRoot: join(root, "source"),
      identity: { snapshot: "a" },
      compute: async () => JSON.stringify({ answer: ++calls }),
      parse: JSON.parse,
    };
    const first = await cachedRipwireText(options);
    const second = await cachedRipwireText(options);
    assert.deepEqual(first.value, second.value);
    assert.equal(second.cache, "hit");
    assert.equal(calls, 1);
    const [file] = await readdir(options.cacheRoot);
    await writeFile(join(options.cacheRoot, file), "corrupt");
    assert.equal((await cachedRipwireText(options)).cache, "corrupt_miss");
    assert.equal(calls, 2);
    assert.equal(
      (await cachedRipwireText({ ...options, identity: { snapshot: "b" } })).cache,
      "miss",
    );
    assert.equal((await cachedRipwireText({ ...options, cacheRoot: undefined })).cache, "disabled");
    await symlink(options.cacheRoot, join(root, "link"));
    await assert.rejects(
      cachedRipwireText({ ...options, cacheRoot: join(root, "link") }),
      /invalid_cache_root/,
    );
    await assert.rejects(
      cachedRipwireText({ ...options, cacheRoot: join(root, "source", "cache") }),
      /invalid_cache_root/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
