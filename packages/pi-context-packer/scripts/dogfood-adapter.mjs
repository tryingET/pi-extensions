/** Real-binary adapter gate. Missing executable is BLOCKED by the outer runner. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectRipwire } from "../src/ripwire-provider.js";
import { fixtureDigest } from "./dogfood-fixtures.mjs";

export async function adapterScenario() {
  if (!process.env.PI_CONTEXT_PACKER_RIPWIRE_BIN)
    throw new Error("BLOCKED: ripwire binary required");
  const root = await mkdtemp(join(tmpdir(), "rw03-"));
  const outside = await mkdtemp(join(tmpdir(), "rw03-outside-"));
  let calls = 0;
  const options = {
    onExecution: () => {
      calls++;
    },
  };
  try {
    await mkdir(join(root, "src"));
    await mkdir(join(root, "vendor"));
    await mkdir(join(root, "excluded"));
    const code = "export function providerIsExecutable(name) { return name === 'ripwire'; }\n";
    await writeFile(join(root, "src", "provider.js"), code);
    await writeFile(join(root, "vendor", "private.js"), "function excludedVendorCanary() {}\n");
    await writeFile(join(root, "excluded", "private.js"), "function excludedPolicyCanary() {}\n");
    await writeFile(join(outside, "secret.js"), "function escapedSecretCanary() {}\n");
    await symlink(join(outside, "secret.js"), join(root, "src", "escape.js"));
    await symlink(outside, join(root, "external-directory"));
    const before = await fixtureDigest(root);
    const outsideBefore = await fixtureDigest(outside);
    const result = await collectRipwire(
      { root, objective: "providerIsExecutable", limit: 10 },
      { ...options, excludePaths: ["excluded"] },
    );
    assert.equal(result.ok, true);
    assert.equal(result.state.analyzedFiles, 1);
    assert.ok(result.items.some((item) => item.provenance.path === "src/provider.js"));
    assert.doesNotMatch(
      JSON.stringify(result),
      /escapedSecretCanary|excludedVendorCanary|excludedPolicyCanary/,
    );
    assert.equal(result.state.skipped.symlink, 2);
    assert.equal(calls, 2);
    const wrongDigest = await collectRipwire(
      { root, objective: "provider" },
      { ...options, binarySha256: "0".repeat(64) },
    );
    assert.equal(wrongDigest.ok, false);
    assert.equal(wrongDigest.omissions[0].reason, "ripwire_digest_mismatch");
    assert.equal(calls, 2, "wrong digest must prevent execution");
    const unsafe = await collectRipwire(
      { root, objective: "provider" },
      { ...options, excludePaths: ["../escape"] },
    );
    assert.equal(unsafe.ok, false);
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(
      collectRipwire({ root, objective: "provider" }, { signal: aborted.signal }),
    );
    assert.equal(await readFile(join(root, "src", "provider.js"), "utf8"), code);
    assert.equal(
      await readFile(join(outside, "secret.js"), "utf8"),
      "function escapedSecretCanary() {}\n",
    );
    assert.equal(await fixtureDigest(root), before);
    assert.equal(await fixtureDigest(outside), outsideBefore);
    return {
      gate: "RW-03",
      realBinary: true,
      snapshot: result.state.snapshotId,
      excludedCanariesAbsent: true,
      digestNegativeControl: true,
      cancellationChecked: true,
      targetUnchanged: true,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
}
