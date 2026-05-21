import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContextPlan,
  CONTEXT_PLAN_PARAMETERS,
  formatContextPlan,
} from "../src/context-plan.js";

test("context_plan requires an objective", () => {
  const plan = buildContextPlan({});

  assert.equal(plan.ok, false);
  assert.deepEqual(plan.errors, ["objective is required"]);
  assert.ok(plan.nonAuthorizations.some((item) => item.includes("does not mutate")));
});

test("context_plan selects code and docs providers from objective and seeds", () => {
  const plan = buildContextPlan({
    objective: "Plan implementation context for a TypeScript symbol and Markdown architecture note",
    cwd: "/repo",
    seeds: [
      { kind: "symbol", value: "buildContextPlan" },
      { kind: "path", value: "docs/project/architecture.md" },
    ],
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.cwd, "/repo");
  const byProvider = Object.fromEntries(plan.providerPlans.map((entry) => [entry.provider, entry]));
  assert.equal(byProvider.agents.posture, "selected");
  assert.equal(byProvider.sci.posture, "selected");
  assert.equal(byProvider.docs.posture, "selected");
  assert.equal(byProvider.fcos.posture, "optional");
});

test("context_plan honors provider required and off modes without creating mutation authority", () => {
  const plan = buildContextPlan({
    objective: "Coordinate FCOS context window work",
    providers: { fcos: "required", ak: "off", sci: "off" },
  });

  const byProvider = Object.fromEntries(plan.providerPlans.map((entry) => [entry.provider, entry]));
  assert.equal(byProvider.fcos.posture, "selected");
  assert.equal(byProvider.ak.posture, "skipped");
  assert.equal(byProvider.sci.posture, "skipped");
  assert.ok(plan.nonAuthorizations.every((item) => !item.includes("authorizes mutation")));
  assert.ok(plan.nonAuthorizations.some((item) => item.includes("does not close FCOS")));
});

test("context_plan omits unsafe caller-controlled path seeds from provider queries", () => {
  const plan = buildContextPlan({
    objective: "Plan implementation context for these files",
    seeds: [
      { kind: "path", value: "src/context-plan.js" },
      { kind: "path", value: "../secrets.md" },
      { kind: "path", value: "/etc/passwd" },
      { kind: "path", value: "node_modules/pkg/index.js" },
      { kind: "path", value: ".git/config" },
      { kind: "path", value: "docs\\windows.md" },
      { kind: "path", value: "file:///etc/passwd" },
      { kind: "path", value: "C:/Users/admin/secret.txt" },
      { kind: "path", value: "http://example.invalid/path" },
      { kind: "path", value: "." },
    ],
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.omittedSeeds.length, 9);
  assert.equal(
    plan.risks.filter((risk) => risk.kind === "path" && risk.severity === "blocked").length,
    9,
  );
  for (const providerPlan of plan.providerPlans) {
    for (const query of providerPlan.proposedQueries) {
      assert.deepEqual(query.seeds, [{ kind: "path", value: "src/context-plan.js" }]);
    }
  }
  const serialized = JSON.stringify(plan.providerPlans);
  assert.doesNotMatch(
    serialized,
    /\.\.|\/etc\/passwd|node_modules|\.git|windows|file:\/\/|C:|http:\/\/|example\.invalid/,
  );
});

test("context_plan screens unsafe workspace roots without treating them as authority", () => {
  const plan = buildContextPlan(
    {
      objective: "Plan repo context",
      cwd: "file:///tmp/worktree",
      repoRoot: "../outside",
    },
    { cwd: "/safe/repo" },
  );

  assert.equal(plan.cwd, "/safe/repo");
  assert.equal(plan.repoRoot, undefined);
  assert.ok(plan.risks.some((risk) => risk.kind === "path" && risk.message.includes("cwd")));
  assert.ok(plan.risks.some((risk) => risk.kind === "path" && risk.message.includes("repoRoot")));
});

test("context_plan default reserve leaves usable packet budget", () => {
  const plan = buildContextPlan({ objective: "Context token budget planning" });

  assert.equal(plan.budget.maxTokens, 40_000);
  assert.equal(plan.budget.reserveTokens, 12_000);
  assert.ok(plan.budget.reserveTokens < plan.budget.maxTokens);
});

test("context_plan clamps reserve below max tokens", () => {
  const plan = buildContextPlan({
    objective: "Context token budget planning",
    budget: { maxTokens: 1000 },
  });

  assert.equal(plan.budget.maxTokens, 1000);
  assert.equal(plan.budget.reserveTokens, 999);
  assert.ok(plan.budget.reserveTokens < plan.budget.maxTokens);
});

test("context_plan normalizes budget and exposes a stable schema", () => {
  const plan = buildContextPlan({
    objective: "Context token budget planning",
    budget: {
      maxTokens: 100_000,
      reserveTokens: 20_000,
      perProviderMaxTokens: { sci: 22_000 },
    },
  });

  assert.equal(plan.budget.maxTokens, 100_000);
  assert.equal(plan.budget.reserveTokens, 20_000);
  assert.equal(plan.budget.perProviderMaxTokens.sci, 22_000);
  assert.equal(plan.budget.perProviderMaxTokens.docs, 12_000);
  assert.equal(CONTEXT_PLAN_PARAMETERS.required[0], "objective");
  assert.ok(plan.risks.some((risk) => risk.kind === "budget"));
});

test("formatContextPlan gives a compact operator-readable summary", () => {
  const plan = buildContextPlan({ objective: "Use SCI for code context and docs for policy" });
  const text = formatContextPlan(plan);

  assert.match(text, /selected providers:/);
  assert.match(text, /sci/);
  assert.match(text, /docs/);
  assert.match(text, /non-authorizations:/);
});
