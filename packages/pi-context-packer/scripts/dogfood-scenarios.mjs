#!/usr/bin/env node
/** Exercise the packed module against an isolated target; never the developer's workspace. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContextPacket } from "../src/context-pack.js";
import { buildContextPlan, CONTEXT_PLAN_PARAMETERS } from "../src/context-plan.js";

export async function migrationScenario() {
  const root = await mkdtemp(join(tmpdir(), "context-rw01-"));
  const hash = async (dir) => {
    const rows = [];
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = join(dir, entry.name);
      rows.push([
        entry.name,
        entry.isDirectory() ? await hash(file) : (await readFile(file)).toString("base64"),
      ]);
    }
    return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  };
  try {
    await mkdir(join(root, "docs"));
    await mkdir(join(root, ".ontology"));
    await writeFile(join(root, "AGENTS.md"), "# Instructions\nRead-only fixture.\n");
    await writeFile(join(root, "docs", "note.md"), "# Design\nFixture design context.\n");
    await writeFile(join(root, ".ontology", "owner-data"), "DO NOT DELETE\n");
    const before = await hash(root);
    let subprocessCalls = 0;
    const env = {
      cwd: root,
      execFileAsync: async () => {
        subprocessCalls++;
        throw new Error("Unexpected subprocess");
      },
    };
    const result = await buildContextPacket(
      {
        objective: "Read design docs",
        seeds: [{ kind: "path", value: "docs/note.md" }],
        providers: { docs: "required", git: "off", session: "off" },
      },
      env,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.packet.sections.map((section) => section.provider),
      ["agents", "docs"],
    );
    assert.match(result.packet.sections[1].items[0].content, /Fixture design context/);
    const code = await buildContextPacket(
      {
        objective: "Find implementation code",
        providers: { agents: "off", docs: "off", git: "off", session: "off" },
      },
      env,
    );
    assert.ok(
      code.packet.omissions.some(
        (entry) => entry.provider === "code" && entry.reason === "unavailable",
      ),
    );
    for (const mode of ["off", "auto", "required"]) {
      assert.equal(
        buildContextPlan({ objective: "Read", providers: { sci: mode } }, env).ok,
        false,
      );
    }
    assert.equal(
      buildContextPlan({ objective: "Read", budget: { perProviderMaxTokens: { sci: 1 } } }, env).ok,
      false,
    );
    assert.equal(
      Object.hasOwn(CONTEXT_PLAN_PARAMETERS.properties.providers.properties, "sci"),
      false,
    );
    assert.equal(subprocessCalls, 0);
    assert.equal(await hash(root), before);
    return {
      gate: "RW-01",
      assertions: 10,
      targetUnchanged: true,
      codeSubprocessCalls: subprocessCalls,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const scenarios = {
    "RW-01": migrationScenario,
    "RW-02": (await import("./dogfood-budget.mjs")).budgetScenario,
    "RW-03": (await import("./dogfood-adapter.mjs")).adapterScenario,
    "RW-06": (await import("./dogfood-cache.mjs")).cacheScenario,
    "RW-05": (await import("./dogfood-expansion.mjs")).expansionScenario,
    "RW-04": (await import("./dogfood-discovery.mjs")).discoveryScenario,
  };
  assert.ok(scenarios[process.argv[2]], "Scenario not implemented at this candidate");
  console.log(JSON.stringify(await scenarios[process.argv[2]]()));
}
