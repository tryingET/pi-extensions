import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { productionFixture, verifyProductionFixture } from "./production-fixture.ts";

test("production fixture binds tarball bytes to authored lock; corrupt or stale fixtures fail closed", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8"));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const bytes = await readFile(await productionFixture());
  verifyProductionFixture(manifest, lock, bytes);
  const corrupt = Buffer.from(bytes);
  corrupt[100] ^= 1;
  assert.throws(() => verifyProductionFixture(manifest, lock, corrupt));
  assert.throws(() => verifyProductionFixture(manifest, lock, bytes.subarray(0, 100)));
  for (const field of ["version", "integrity"]) {
    const stale = structuredClone(lock);
    stale.packages["node_modules/ipaddr.js"][field] = "changed";
    assert.throws(() => verifyProductionFixture(manifest, stale, bytes));
  }
  assert.throws(() =>
    verifyProductionFixture({ dependencies: { "ipaddr.js": "3.0.0" } }, lock, bytes),
  );
  assert.throws(() =>
    verifyProductionFixture(
      { dependencies: { ...manifest.dependencies, extra: "1.0.0" } },
      lock,
      bytes,
    ),
  );
});
