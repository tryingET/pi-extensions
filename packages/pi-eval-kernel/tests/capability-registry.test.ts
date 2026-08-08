import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CapabilityRegistry } from "../src/capability-registry.ts";
import { createDefaultCapabilities } from "../src/default-capabilities.ts";

test("capability registry rejects duplicate and malformed names", () => {
  const registry = new CapabilityRegistry();
  registry.register({
    name: "read_value",
    description: "Read one value.",
    effect: "read",
    execute: () => 1,
  });
  assert.throws(
    () =>
      registry.register({
        name: "read_value",
        description: "Duplicate.",
        effect: "read",
        execute: () => 2,
      }),
    /already registered/,
  );
  assert.throws(
    () =>
      registry.register({
        name: "Read-Value",
        description: "Malformed.",
        effect: "read",
        execute: () => 2,
      }),
    /Invalid capability name/,
  );
});

test("capability effect admission fails closed", async () => {
  const registry = new CapabilityRegistry([
    {
      name: "mutate",
      description: "Mutate something.",
      effect: "write",
      execute: () => "changed",
    },
  ]);
  await assert.rejects(
    registry.invoke("mutate", {}, { cwd: process.cwd(), allowedEffects: new Set(["read"]) }),
    /not admitted/,
  );
});

test("default filesystem capabilities stay inside cwd and retain a hard read ceiling", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "pi-eval-kernel-capability-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(path.join(cwd, "nested"));
  await writeFile(path.join(cwd, "nested", "sample.txt"), "one\ntwo\nthree", "utf8");
  const registry = new CapabilityRegistry(createDefaultCapabilities());
  const context = { cwd, allowedEffects: new Set(["read"] as const) };

  const result = (await registry.invoke(
    "read_text",
    { path: "nested/sample.txt", offset: 2, limit: 1 },
    context,
  )) as { text: string; totalLines: number };
  assert.equal(result.text, "two");
  assert.equal(result.totalLines, 3);

  await assert.rejects(registry.invoke("read_text", { path: "../outside" }, context));

  await writeFile(path.join(cwd, "large.txt"), "x".repeat(1_000_001), "utf8");
  await assert.rejects(
    registry.invoke("read_text", { path: "large.txt", maxBytes: 999_999_999 }, context),
    /exceeds maxBytes/,
  );
});

test("run_process does not invoke a shell", async () => {
  const registry = new CapabilityRegistry(createDefaultCapabilities());
  const result = (await registry.invoke(
    "run_process",
    { command: process.execPath, args: ["-e", "process.stdout.write('ok')"] },
    { cwd: process.cwd(), allowedEffects: new Set(["process"]) },
  )) as { stdout: string; exitCode: number };
  assert.equal(result.stdout, "ok");
  assert.equal(result.exitCode, 0);
});
