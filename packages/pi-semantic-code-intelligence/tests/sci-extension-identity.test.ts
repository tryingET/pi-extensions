/**
summary: "SCI extension companion identity, door registration, schema-drift, and toolbox profiles; split from extension.test.ts."
read_when:
  - "You change companion identity, door registration, schema-drift, and toolbox profiles behavior."
*/
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertSciSchemaCompatibility, PI_SCI_MCP_CLIENT_INFO } from "../src/mcp-bridge.ts";
import { SCI_COMPOSITE_TOOL_SPECS } from "../src/tool-definitions.ts";
import { registerToolboxBundle } from "../src/toolboxBundle.ts";
import {
  createHarness,
  fakeBridge,
  PI_DOOR_NAMES,
  type SchemaFixture,
} from "./extension-test-helpers.ts";

test("package, lock, and MCP client metadata share one companion identity", async () => {
  const [packageText, lockText] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
  ]);
  const packageManifest = JSON.parse(packageText) as { name: string; version: string };
  const lock = JSON.parse(lockText) as {
    name: string;
    version: string;
    packages: Record<string, { name?: string; version?: string }>;
  };
  const packageClientName = packageManifest.name.replace(/^@[^/]+\//, "");

  assert.equal(lock.name, packageManifest.name);
  assert.equal(lock.version, packageManifest.version);
  assert.equal(lock.packages[""]?.name, packageManifest.name);
  assert.equal(lock.packages[""]?.version, packageManifest.version);
  assert.equal(PI_SCI_MCP_CLIENT_INFO.name, packageClientName);
  assert.equal(PI_SCI_MCP_CLIENT_INFO.version, packageManifest.version);
});

test("registers four native Pi doors; the patch workflows share one preview door", () => {
  const fake = fakeBridge();
  const harness = createHarness(fake.bridge);

  assert.deepEqual([...harness.tools.keys()], [...PI_DOOR_NAMES]);
  for (const name of PI_DOOR_NAMES) {
    const tool = harness.tools.get(name);
    assert.ok(tool);
    assert.match(tool.description, /PREFERRED/);
    assert.ok(tool.parameters);
    assert.ok(
      tool.promptGuidelines.some((entry: string) =>
        name === "preview_patch_checks"
          ? entry.includes("preview_patch_checks")
          : entry.includes(name),
      ),
    );
  }
});

test("explore_symbol_impact advertises all progressive disclosure modes", () => {
  const fake = fakeBridge();
  const harness = createHarness(fake.bridge);
  const tool = harness.tools.get("explore_symbol_impact");
  assert.ok(tool);
  const schema = tool.parameters as SchemaFixture;

  assert.deepEqual(schema.properties?.mode?.enum, ["compact", "standard", "debug"]);
  assert.equal(schema.properties?.mode?.default, "compact");
  assert.match(schema.properties?.mode?.description ?? "", /selected normalized evidence/);
  assert.match(
    schema.properties?.mode?.description ?? "",
    /raw detail retained only.*expanded TUI/,
  );
  assert.match(tool.description, /concise decision projection/);
  assert.match(tool.description, /24 KiB/);
  assert.match(tool.description, /48 KiB/);
});

test("fails closed when installed SCI schemas drift from the registered Pi subset", () => {
  function advertisedFromRoutes(): Array<{ name: string; inputSchema: SchemaFixture }> {
    const advertised: Array<{ name: string; inputSchema: SchemaFixture }> = [];
    for (const spec of SCI_COMPOSITE_TOOL_SPECS) {
      if (spec.routes) {
        for (const route of spec.routes) {
          advertised.push({
            name: route.workflow,
            inputSchema: structuredClone(route.parameters) as SchemaFixture,
          });
        }
      } else {
        advertised.push({
          name: spec.name,
          inputSchema: structuredClone(spec.parameters) as SchemaFixture,
        });
      }
    }
    return advertised;
  }

  const advertised = advertisedFromRoutes();
  assert.doesNotThrow(() => assertSciSchemaCompatibility(advertised));

  const patchChecks = advertised.find((tool) => tool.name === "patch_checks_in_snapshot");
  assert.ok(patchChecks?.inputSchema.properties?.recommendChecks);
  patchChecks.inputSchema.properties.recommendChecks.default = true;
  assert.throws(
    () => assertSciSchemaCompatibility(advertised),
    /preview_patch_checks\(patch_checks_in_snapshot\)/,
  );

  const nestedDrift = advertisedFromRoutes();
  const nestedPatchChecks = nestedDrift.find((tool) => tool.name === "patch_checks_in_snapshot");
  assert.ok(nestedPatchChecks.inputSchema.properties?.commands?.items);
  nestedPatchChecks.inputSchema.properties.commands.items.type = "number";
  assert.throws(
    () => assertSciSchemaCompatibility(nestedDrift),
    /preview_patch_checks\(patch_checks_in_snapshot\)\.commands\.items: type differs/,
  );
});

test("toolbox bundle exposes read and risk-gated mutating profiles", () => {
  const readFake = fakeBridge();
  const readHarness = createHarness(readFake.bridge);
  const read = registerToolboxBundle(readHarness.pi as never, { profile: "read" });
  assert.deepEqual(
    read.map((entry) => entry.name),
    ["explore_symbol_impact", "locate_confirm_definition"],
  );
  assert.ok(read.every((entry) => entry.risk === "read"));

  const mutatingFake = fakeBridge();
  const mutatingHarness = createHarness(mutatingFake.bridge);
  const mutating = registerToolboxBundle(mutatingHarness.pi as never, { profile: "mutating" });
  assert.deepEqual(
    mutating.map((entry) => entry.name),
    ["preview_patch_checks", "rename_safely"],
  );
  assert.ok(mutating.every((entry) => entry.risk === "mutating"));
});

test("the preview door's emitted schema admits each single-mode argument set (live-caught gap)", async () => {
  // The unit harness executes with raw args and bypasses argument-schema validation; this
  // pinned the door schema against the failure a live session found on 2026-08-27: a
  // required union of both modes' mandatory keys is unsatisfiable for any single-mode call.
  const preview = createHarness(fakeBridge().bridge).tools.get("preview_patch_checks");
  assert.ok(preview);
  const schema = preview.parameters as SchemaFixture;
  const required = new Set(schema.required ?? []);
  assert.equal(
    required.has("patch") ||
      required.has("language") ||
      required.has("pattern") ||
      required.has("rewrite"),
    false,
    "no mode key may be schema-required; exactly-one-mode is enforced by fail-closed routing",
  );
  for (const key of ["patch", "language", "pattern", "rewrite", "commands", "timeoutSec"]) {
    assert.ok(schema.properties?.[key], `door schema must declare ${key}`);
  }

  // each single-mode arg set passes schema validation and routes to its exact workflow
  const fake = fakeBridge();
  const harness = createHarness(fake.bridge);
  const door = harness.tools.get("preview_patch_checks");
  assert.ok(door);
  await door.execute(
    "schema-patch",
    { patch: "diff --git a/a b/a", commands: ["true"] },
    undefined,
    undefined,
    { cwd: "/workspace/repo" },
  );
  assert.equal(fake.calls.at(-1)?.name, "patch_checks_in_snapshot");
  await door.execute(
    "schema-structural",
    { language: "typescript", pattern: "a", rewrite: "b" },
    undefined,
    undefined,
    { cwd: "/workspace/repo" },
  );
  assert.equal(fake.calls.at(-1)?.name, "structural_patch_checks");
});
