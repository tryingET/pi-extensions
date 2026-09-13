import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { executeToolExpectFailure, setup, withTemporaryEnv } from "./dispatch-subagent-harness.mjs";

for (const source of ["argument", "environment", "unrelated"]) {
  test(`dispatch validates ${source} extension identity before the aliased child spawn`, async () => {
    const root = await mkdtemp(join(tmpdir(), "asc-multipass-dispatch-"));
    const entry = join(root, "extensions", "multi-sub.ts");
    await mkdir(join(root, "extensions"));
    await writeFile(entry, "export default () => {};\n");
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: source === "unrelated" ? "some-other-extension" : "pi-multi-pass" }),
    );
    const harness = await setup(undefined, () => "openai-codex-2/test-model");
    try {
      await withTemporaryEnv(
        {
          PI_MULTI_PASS_EXTENSION: join(root, "missing-old-install.ts"),
          PI_SUBAGENT_EXTENSIONS: source === "environment" ? entry : undefined,
        },
        async () => {
          const args = [
            `explicit-provider-${source}`,
            {
              profile: "reviewer",
              objective: "Fixture-only bootstrap",
              extensions: source === "environment" ? [] : [entry],
            },
            null,
            null,
            { cwd: root, model: { provider: "openai-codex-2", id: "test-model" } },
          ];
          if (source === "unrelated") {
            const result = await executeToolExpectFailure(harness.tool, ...args);
            assert.equal(result.details.failureKind, "extension_bootstrap_missing");
            assert.equal(harness.getCapturedDef(), undefined);
          } else {
            const result = await harness.tool.execute(...args);
            assert.equal(result.details.status, "done");
            assert.deepEqual(result.details.loadedExtensions, [entry]);
            assert.deepEqual(harness.getCapturedDef().extensionSources, [entry]);
            assert.equal(harness.getCapturedModel(), "openai-codex-2/test-model");
          }
          assert.equal(harness.state.activeCount, 0);
        },
      );
    } finally {
      await harness.cleanup();
      await rm(root, { recursive: true, force: true });
    }
  });
}
