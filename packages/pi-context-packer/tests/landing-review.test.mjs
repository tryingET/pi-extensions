import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { contextPacketToolResult } from "../src/context-pack.js";
import { buildContextPlan } from "../src/context-plan.js";
import { copyApprovedCorpus, stableRead } from "../src/ripwire-corpus.js";

const providers = { agents: "off", docs: "off", git: "off", session: "off", ripwire: "required" };

test("requested cwd/repoRoot aliases cannot escape trusted workspace or invoke code", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-root-"));
  const outside = await mkdtemp(join(tmpdir(), "review-outside-"));
  try {
    await writeFile(join(outside, "private.ts"), "export function escapedCanary() {}\n");
    await symlink(outside, join(root, "alias"), "dir");
    let calls = 0;
    for (const input of [
      { cwd: join(root, "alias"), repoRoot: join(root, "alias") },
      { cwd: join(root, "alias") },
    ]) {
      const result = await contextPacketToolResult(
        { ...input, objective: "Locate escapedCanary", providers },
        { cwd: root, ripwire: { onExecution: () => calls++ } },
      );
      assert.equal(result.isError, true);
      assert.equal(result.details.providerRuns.ripwire.status, "unavailable");
      assert.match(result.content[0].text, /invalid_workspace/);
      assert.doesNotMatch(result.content[0].text, /private\.ts/);
    }
    assert.equal(calls, 0);
    await mkdir(join(root, "copy"));
    await assert.rejects(
      copyApprovedCorpus(join(root, "alias"), join(root, "copy")),
      /invalid_root/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("trusted and requested in-workspace aliases resolve without losing legitimate scope", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-contained-"));
  try {
    await mkdir(join(root, "real"));
    await symlink(join(root, "real"), join(root, "alias"), "dir");
    const plan = buildContextPlan(
      { objective: "Find code", cwd: join(root, "alias"), providers },
      { cwd: root },
    );
    assert.equal(plan.cwd, join(root, "real"));
    assert.equal(
      plan.risks.some((r) => r.kind === "path" && r.severity === "blocked"),
      false,
    );
    const trustedAlias = buildContextPlan(
      { objective: "Find code", providers },
      { cwd: join(root, "alias") },
    );
    assert.equal(trustedAlias.cwd, join(root, "real"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("zero packet or provider budgets never become defaults or execute code", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-zero-"));
  try {
    let calls = 0;
    for (const budget of [
      { maxBytes: 0 },
      { maxTokens: 0 },
      { perProviderMaxTokens: { ripwire: 0 } },
    ]) {
      const result = await contextPacketToolResult(
        { objective: "Find code", providers, budget },
        { cwd: root, ripwire: { onExecution: () => calls++ } },
      );
      assert.equal(result.isError, true);
      if (budget.maxBytes === 0 || budget.maxTokens === 0) assert.equal(result.content[0].text, "");
    }
    assert.equal(calls, 0);
    assert.equal(
      buildContextPlan({ objective: "Read", budget: { reserveTokens: 0 } }, { cwd: root }).budget
        .reserveTokens,
      0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stable reads enforce the byte boundary and reject source symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-read-"));
  try {
    const file = join(root, "source.ts");
    await writeFile(file, "1234");
    assert.equal((await stableRead(file, 4)).toString(), "1234");
    await assert.rejects(stableRead(file, 3), /oversize/);
    await symlink(file, join(root, "link.ts"));
    await assert.rejects(stableRead(join(root, "link.ts"), 4), /unsupported/);
    assert.equal(await readFile(file, "utf8"), "1234");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
