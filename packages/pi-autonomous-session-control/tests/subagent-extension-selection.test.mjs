import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveSubagentExtensionSelection } from "../extensions/self/subagent-extension-selection.ts";

for (const kind of ["javascript", "symlink"]) {
  test(`${kind} provider entry is bound to its real package identity`, async (t) => {
    await fixture(async ({ root, packageRoot, entry, select }) => {
      let source;
      if (kind === "javascript") {
        source = join(packageRoot, "extensions", "multi-sub.js");
        await writeFile(source, "throw new Error('must not execute');\n");
      } else {
        source = join(root, "linked-entry.ts");
        try {
          await symlink(entry, source);
        } catch (error) {
          if (["EPERM", "EACCES"].includes(error.code)) {
            t.skip("symlink creation unavailable");
            return;
          }
          throw error;
        }
      }
      const result = select([source]);
      assert.deepEqual(result.missingRequired, []);
      assert.deepEqual(result.extensions, [source]);
    });
  });
}

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "asc-explicit-multipass-"));
  const saved = ["PI_MULTI_PASS_EXTENSION", "PI_SUBAGENT_EXTENSIONS"].map((key) => [
    key,
    process.env[key],
  ]);
  const packageRoot = join(root, "a-fork-checkout");
  const entry = join(packageRoot, "extensions", "multi-sub.ts");
  await mkdir(join(packageRoot, "extensions"), { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "pi-multi-pass", pi: { extensions: ["./extensions"] } }),
  );
  await writeFile(entry, "throw new Error('Selection must not execute extensions');\n");
  process.env.PI_MULTI_PASS_EXTENSION = join(root, "old-install-missing.ts");
  delete process.env.PI_SUBAGENT_EXTENSIONS;
  const select = (requestedExtensions = [], effectiveModel = "openai-codex-2/test") =>
    resolveSubagentExtensionSelection({ requestedExtensions, effectiveModel, ctx: { cwd: root } });
  try {
    await run({ root, packageRoot, entry, select });
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
}

for (const kind of ["absolute", "relative", "environment", "mixed-alias"]) {
  test(`explicit ${kind} multi-pass source satisfies aliased model bootstrap without the old default`, async () => {
    await fixture(async ({ entry, select }) => {
      let requested = [entry];
      if (kind === "relative") requested = ["./a-fork-checkout/extensions/multi-sub.ts"];
      if (kind === "environment") {
        process.env.PI_SUBAGENT_EXTENSIONS = entry;
        requested = [];
      }
      if (kind === "mixed-alias") {
        process.env.PI_SUBAGENT_EXTENSIONS = entry;
        requested = ["pi-multi-pass", entry, "multi-pass"];
      }
      const result = select(requested);
      assert.deepEqual(result.missingRequired, []);
      assert.deepEqual(result.extensions, [entry]);
    });
  });
}

test("explicit verified source wins over an unrelated automatic installation", async () => {
  await fixture(async ({ root, entry, select }) => {
    const old = join(root, "old-multi-sub.ts");
    await writeFile(old, "export default () => {};\n");
    process.env.PI_MULTI_PASS_EXTENSION = old;
    assert.deepEqual(select([entry]).extensions, [entry]);
  });
});

test("unrelated, unidentifiable, and non-entry files do not satisfy the required provider", async () => {
  for (const kind of [
    "wrong-package",
    "malformed-package",
    "missing-package",
    "different-entry",
    "directory",
  ]) {
    await fixture(async ({ packageRoot, entry, select }) => {
      const manifest = join(packageRoot, "package.json");
      if (kind === "wrong-package")
        await writeFile(manifest, JSON.stringify({ name: "unrelated-extension" }));
      if (kind === "malformed-package") await writeFile(manifest, "{");
      if (kind === "missing-package") await rm(manifest);
      if (kind === "directory") {
        await rm(entry);
        await mkdir(entry);
      }
      if (kind === "different-entry") {
        entry = join(packageRoot, "extensions", "other.ts");
        await writeFile(entry, "export default () => {};\n");
      }
      const result = select([entry]);
      assert.equal(result.missingRequired.length, 1, kind);
      assert.match(result.missingRequired[0], /requires the pi-multi-pass extension/);
    });
  }
});

test("valid provider bootstrap does not forgive another missing explicit extension", async () => {
  await fixture(async ({ root, entry, select }) => {
    const missing = join(root, "missing.ts");
    const result = select([entry, missing]);
    assert.deepEqual(result.extensions, [entry]);
    assert.deepEqual(result.missingRequired, [
      `Requested child extension path was not found: ${missing}`,
    ]);
  });
});

test("base providers still allow unrelated explicit extensions without requiring multi-pass", async () => {
  await fixture(async ({ root, select }) => {
    const entry = join(root, "unrelated.ts");
    await writeFile(entry, "export default () => {};\n");
    const result = select([entry], "anthropic/test");
    assert.deepEqual(result.extensions, [entry]);
    assert.deepEqual(result.missingRequired, []);
  });
});
