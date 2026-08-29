/**
summary: "Context-packet assembly, budgets, and unsafe-seed safety; split from context-pack.test.js."
read_when:
  - "You change assembly, budgets, and unsafe-seed safety behavior."
*/
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildContextPacket, makeWorkspace } from "./context-pack-helpers.js";

test("context_pack assembles AGENTS and seeded Markdown without mutating providers", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Plan docs context for implementation",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off" },
  });

  assert.equal(result.ok, true);
  const byProvider = Object.fromEntries(
    result.packet.sections.map((section) => [section.provider, section]),
  );
  assert.equal(byProvider.agents.items.length, 1);
  assert.equal(byProvider.docs.items.length, 1);
  assert.match(byProvider.docs.items[0].content, /source-owned Markdown/);
  assert.ok(result.packet.nonAuthorizations.some((item) => item.includes("does not mutate")));
  assert.ok(result.packet.measurementReceipt.selectedItemCount >= 2);
  assert.ok(result.packet.measurementReceipt.estimatedToolCallsAvoided >= 2);
});

test("context_pack keeps Markdown-only path packets on docs without SCI omissions", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off", session: "off" },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.packet.sections.map((section) => section.provider),
    ["agents", "docs"],
  );
  assert.equal(
    result.packet.omissions.some((omission) => omission.provider === "sci"),
    false,
  );
});

test("context_pack omits contaminated Markdown path seeds without reading or leaking them", async () => {
  const root = await makeWorkspace();
  await writeFile(
    join(root, "docs", "project", "contaminated.md"),
    "# Contaminated\n\nMUST_NOT_READ_CONTAMINATED_SEED\n",
    "utf8",
  );
  const docsListScript = join(root, "docs-list-empty.mjs");
  await writeFile(
    docsListScript,
    "console.log(JSON.stringify({ ok: true, rankedItems: [] }));\n",
    "utf8",
  );

  const result = await buildContextPacket(
    {
      objective: "Read docs context",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "\ndocs/project/contaminated.md" }],
      providers: { agents: "off", docs: "required", git: "off", session: "off", sci: "off" },
    },
    { docsListScript },
  );

  assert.equal(result.ok, true);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "docs"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "docs" &&
        omission.reason === "unsafe_path" &&
        omission.detail.includes("control characters"),
    ),
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "docs" && omission.reason === "no_results",
    ),
  );
  assert.equal(
    result.packet.omissions.some((omission) => omission.provider === "sci"),
    false,
  );

  const publicPacket = JSON.stringify({
    sections: result.packet.sections,
    omissions: result.packet.omissions,
    template: result.packet.dogfoodObservationTemplate,
  });
  assert.doesNotMatch(publicPacket, /contaminated\.md|MUST_NOT_READ_CONTAMINATED_SEED/);
});

test("context_pack keeps provider query seeds scoped through mixed docs and SCI packets", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "example.js"), "export const target = 1;\n", "utf8");
  const sciReadFilePaths = [];
  const sciSymbolQueries = [];
  const fakeExec = async (_command, args) => {
    const workflow = args[1];
    const workflowArgs = JSON.parse(args[3]);
    if (workflow === "read_file") {
      sciReadFilePaths.push(workflowArgs.path);
      assert.equal(workflowArgs.path, "src/example.js");
      return {
        stdout: JSON.stringify({
          content: [
            { type: "text", text: JSON.stringify({ content: "export const target = 1;\n" }) },
          ],
          isError: false,
        }),
      };
    }
    assert.equal(workflow, "symbol_search");
    sciSymbolQueries.push(workflowArgs.query);
    assert.equal(workflowArgs.query, "target");
    return {
      stdout: JSON.stringify({
        content: [{ type: "text", text: JSON.stringify({ count: 1, symbols: [] }) }],
        isError: false,
      }),
    };
  };

  const result = await buildContextPacket(
    {
      objective: "Use architecture docs and implementation code",
      cwd: root,
      repoRoot: root,
      seeds: [
        { kind: "path", value: "docs/project/note.md" },
        { kind: "path", value: "src/example.js" },
        { kind: "symbol", value: "target" },
      ],
      providers: { git: "off", session: "off", docs: "required", sci: "required" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );

  assert.equal(result.ok, true);
  const plans = Object.fromEntries(
    result.plan.providerPlans.map((providerPlan) => [providerPlan.provider, providerPlan]),
  );
  assert.deepEqual(plans.agents.proposedQueries[0].seeds, []);
  assert.deepEqual(plans.docs.proposedQueries[0].seeds, [
    { kind: "path", value: "docs/project/note.md" },
  ]);
  assert.deepEqual(plans.sci.proposedQueries[0].seeds, [
    { kind: "path", value: "src/example.js" },
    { kind: "symbol", value: "target" },
  ]);
  assert.deepEqual(sciReadFilePaths, ["src/example.js"]);
  assert.deepEqual(sciSymbolQueries, ["target"]);
  const routeByProvider = Object.fromEntries(
    result.packet.dogfoodObservationTemplate.packet.providerRoutes.map((route) => [
      route.provider,
      route,
    ]),
  );
  assert.equal(routeByProvider.docs.routeRole, "selected");
  assert.equal(routeByProvider.docs.queryCount, 1);
  assert.equal(routeByProvider.docs.followupQueryCount, 0);
  assert.deepEqual(routeByProvider.docs.seedCounts, { markdown: 1 });
  assert.equal(routeByProvider.sci.routeRole, "selected");
  assert.equal(routeByProvider.sci.queryCount, 1);
  assert.equal(routeByProvider.sci.followupQueryCount, 0);
  assert.deepEqual(routeByProvider.sci.seedCounts, { code: 1, symbol: 1 });
  assert.equal(routeByProvider.agents.seedCount, 0);
  assert.equal(routeByProvider.prompt_vault.routeRole, "followup");
  assert.equal(routeByProvider.prompt_vault.queryCount, 1);
  assert.equal(routeByProvider.prompt_vault.totalQueryCount, 1);
  assert.equal(routeByProvider.prompt_vault.followupQueryCount, 1);
  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.deepEqual(
    docs.items.map((item) => item.provenance.path),
    ["docs/project/note.md"],
  );
});

test("context_pack enforces the global packet budget across providers while preserving reserve", async () => {
  const root = await makeWorkspace();
  const body = "x".repeat(2400);
  await writeFile(join(root, "AGENTS.md"), body, "utf8");
  await writeFile(join(root, "docs", "project", "note.md"), body, "utf8");

  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    budget: { maxTokens: 1000 },
    seeds: [{ kind: "path", value: "docs/project/note.md" }],
    providers: { git: "off", sci: "off" },
  });

  assert.equal(result.ok, true);
  const usableTokens = result.packet.budget.maxTokens - result.packet.budget.reserveTokens;
  assert.ok(result.packet.totals.estimatedTokens <= usableTokens, result.packet);
  assert.ok(result.packet.totals.bytes <= result.packet.budget.maxBytes, result.packet);
  assert.equal(result.packet.totals.budgetAccounting, "selected_provider_content_only");
  assert.ok(result.packet.measurementReceipt.packetFillRatio <= 1, result.packet);
  assert.ok(result.packet.omissions.some((omission) => omission.reason === "budget"));
});

test("context_pack enforces cumulative per-provider budget across multiple items", async () => {
  const root = await makeWorkspace();
  await writeFile(join(root, "docs", "project", "a.md"), `# A\n${"a ".repeat(70)}`, "utf8");
  await writeFile(join(root, "docs", "project", "b.md"), `# B\n${"b ".repeat(70)}`, "utf8");

  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [
      { kind: "path", value: "docs/project/a.md" },
      { kind: "path", value: "docs/project/b.md" },
    ],
    providers: { agents: "off", git: "off", sci: "off" },
    budget: {
      maxTokens: 1000,
      reserveTokens: 1,
      perProviderMaxTokens: { docs: 50 },
    },
  });

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.ok(docs.estimatedTokens <= result.packet.budget.perProviderMaxTokens.docs, docs);
  assert.equal(docs.items.length, 1);
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "docs" &&
        omission.reason === "budget" &&
        omission.detail.includes("provider budget exhausted"),
    ),
  );
});

test("context_pack fails closed on unsafe path seeds", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "../secret.md" }],
    providers: { docs: "off", git: "off" },
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "docs"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.reason === "unsafe_path" && omission.detail.includes("parent"),
    ),
  );
});

test("context_pack reports unsafe code path seeds as SCI path omissions", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Read code context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "../src/secret.js" }],
    providers: { agents: "off", docs: "off", git: "off", sci: "required" },
  });

  assert.equal(result.ok, true);
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "sci" &&
        omission.reason === "unsafe_path" &&
        omission.detail.includes("parent"),
    ),
  );
});

test("context_pack reports unsafe symbol seeds as SCI symbol omissions", async () => {
  const root = await makeWorkspace();
  const result = await buildContextPacket({
    objective: "Find code symbol context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "symbol", value: "target\n## forged" }],
    providers: { agents: "off", docs: "off", git: "off", sci: "required" },
  });

  assert.equal(result.ok, true);
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "sci" &&
        omission.reason === "unsafe_symbol" &&
        omission.detail.includes("control characters"),
    ),
  );
});

test("context_pack blocks symlink path escapes before packet content is read", async () => {
  const root = await makeWorkspace();
  const outside = await mkdtemp(join(tmpdir(), "pi-context-pack-secret-"));
  await writeFile(join(outside, "secret.md"), "# Secret\n\nDo not packetize.\n", "utf8");
  await symlink(join(outside, "secret.md"), join(root, "docs", "project", "secret-link.md"));

  const result = await buildContextPacket({
    objective: "Read docs context",
    cwd: root,
    repoRoot: root,
    seeds: [{ kind: "path", value: "docs/project/secret-link.md" }],
    providers: { git: "off" },
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.packet.sections.some((section) =>
      section.items.some((item) => item.content.includes("Do not packetize")),
    ),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.reason === "unsafe_path" && omission.detail.includes("escapes"),
    ),
  );
});

test("context_pack records unreadable files as omissions instead of throwing", async () => {
  const root = await makeWorkspace();
  const path = join(root, "docs", "project", "unreadable.md");
  await writeFile(path, "# Hidden\n\nDo not leak.\n", "utf8");
  await chmod(path, 0o000);

  try {
    const result = await buildContextPacket({
      objective: "Read docs context",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "docs/project/unreadable.md" }],
      providers: { git: "off" },
    });

    assert.equal(result.ok, true);
    assert.equal(
      result.packet.sections.some((section) =>
        section.items.some((item) => item.content.includes("Do not leak")),
      ),
      false,
    );
    assert.ok(
      result.packet.omissions.some(
        (omission) => omission.reason === "blocked" && omission.detail.includes("read failed"),
      ),
    );
  } finally {
    await chmod(path, 0o600);
  }
});
