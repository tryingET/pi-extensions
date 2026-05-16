import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_PROMPT_PLANE_MODULE_SPECIFIER,
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
  type AutoresearchDecisionPromptExecutionResult,
  buildFinalizeDecisionContext,
  buildNextHypothesisDecisionContext,
  buildSetupDecisionContext,
  createAutoresearchDecisionRuntime,
  mapNextHypothesisOutcomeToCampaignDecision,
  mapNextHypothesisStatusToCampaignDecision,
  parseFinalizeDecisionOutput,
  parseNextHypothesisDecisionOutput,
  parseSetupDecisionOutput,
} from "../src/core/decisions.ts";

test("decision packet builders render bounded markdown context", () => {
  const setupContext = buildSetupDecisionContext({
    optimizationObjective: "Reduce startup latency for the dashboard route.",
    repoContext: ["Repo: packages/pi-autoresearch", "Bounded slice: prompt-plane adapter"],
    filesInScope: ["packages/pi-autoresearch/src/**"],
    offLimits: ["packages/pi-society-orchestrator/**"],
    benchmarkSurfaces: ["npm run check", "node --test tests/runtime.test.ts"],
    existingArtifacts: ["autoresearch.jsonl", "autoresearch.events.jsonl"],
    hardConstraints: ["No package-local prompt copies", "Fail closed on parser errors"],
    blockers: ["None currently known"],
    akTask: {
      id: 1529,
      allowedPaths: ["packages/pi-autoresearch/src/**", "packages/pi-autoresearch/tests/**"],
      requiredPaths: ["packages/pi-autoresearch/src/core/decisions.ts"],
    },
  });

  const nextContext = buildNextHypothesisDecisionContext({
    goal: "Land the decision runtime adapter without widening runtime ownership.",
    constraints: ["Keep Prompt Vault as procedure owner"],
    segmentSummary: ["Bounded runtime kernel already landed"],
    baselineHistory: ["No live decisions yet"],
    recentRunHistory: ["Last run recorded as baseline"],
    checksStatus: ["npm run check pending"],
    confidenceSignals: ["Exact-template seam already exists upstream"],
    asiNotes: ["Do not copy prompt bodies locally"],
    deadEndMemory: ["Router-first design is intentionally deferred"],
    filesInScope: ["packages/pi-autoresearch/src/**"],
    offLimits: ["packages/pi-vault-client/src/**"],
    ideasBacklog: ["Wire runtime integration in task 1530"],
  });

  const finalizeContext = buildFinalizeDecisionContext({
    keptRuns: ["run-7 kept: parser hardening"],
    campaignContext: ["Target branch: main", "Approval remains explicit"],
    mergeBase: "abc1234",
    trunkTarget: "main",
    commitSummaries: ["abc1234 add decision runtime adapter", "def5678 add parser tests"],
    dependencyNotes: ["Apply parser commit before runtime integration"],
    ideasToLeaveOut: ["Deferred router work"],
  });

  assert.equal(
    AUTORESEARCH_PROMPT_PLANE_MODULE_SPECIFIER,
    "@tryinget/pi-vault-client/prompt-plane",
  );
  assert.match(setupContext, /# PI-AUTORESEARCH SETUP PACKET/);
  assert.match(setupContext, /AK task scope reference/);
  assert.match(nextContext, /# PI-AUTORESEARCH NEXT HYPOTHESIS PACKET/);
  assert.match(nextContext, /Dead-end memory/);
  assert.match(finalizeContext, /# PI-AUTORESEARCH FINALIZE PACKET/);
  assert.match(finalizeContext, /Target trunk/);
});

test("parseSetupDecisionOutput normalizes the typed setup contract", () => {
  const result = parseSetupDecisionOutput(`
STATUS: ready
GOAL: Reduce dashboard startup latency without widening package scope.
PRIMARY_METRIC: total_ms (ms, lower is better)
SECONDARY_METRICS: render_ms, cpu_ms
BENCHMARK_COMMAND: bash autoresearch.sh
FILES_IN_SCOPE:
- packages/pi-autoresearch/src/core/decisions.ts
- packages/pi-autoresearch/tests/decisions.test.ts
OFF_LIMITS:
- packages/pi-vault-client/src/**
HARD_CONSTRAINTS:
- No local prompt copies
- Fail closed on malformed output
CHECKS_REQUIRED: reuse_existing_checks
AUTORESEARCH_MD_PLAN:
- goal
- guardrails
AUTORESEARCH_SH_CONTRACT:
- Emit METRIC total_ms=<value>
- Reuse repo-local benchmark command
BASELINE_PLAN:
- Run three warm benchmark samples and compare the median
FIRST_EXPERIMENT_RULES:
- Keep only exact-template preparation changes in this slice
MISSING_INFORMATION: none
`);

  assert.deepEqual(result, {
    kind: "setup",
    templateName: "pi-autoresearch-setup",
    status: "ready",
    goal: "Reduce dashboard startup latency without widening package scope.",
    primaryMetric: {
      name: "total_ms",
      unit: "ms",
      direction: "lower",
    },
    secondaryMetrics: ["render_ms", "cpu_ms"],
    benchmarkCommand: "bash autoresearch.sh",
    filesInScope: [
      "packages/pi-autoresearch/src/core/decisions.ts",
      "packages/pi-autoresearch/tests/decisions.test.ts",
    ],
    offLimits: ["packages/pi-vault-client/src/**"],
    hardConstraints: ["No local prompt copies", "Fail closed on malformed output"],
    checksRequired: "reuse_existing_checks",
    autoresearchMdPlan: ["goal", "guardrails"],
    autoresearchShContract: ["Emit METRIC total_ms=<value>", "Reuse repo-local benchmark command"],
    baselinePlan: ["Run three warm benchmark samples and compare the median"],
    firstExperimentRules: ["Keep only exact-template preparation changes in this slice"],
    missingInformation: [],
  });
});

test("parseSetupDecisionOutput fails closed when required sections are missing", () => {
  assert.throws(
    () =>
      parseSetupDecisionOutput(`
STATUS: blocked
GOAL: Need more benchmark detail before a lawful setup packet exists.
PRIMARY_METRIC: total_ms (ms, lower is better)
SECONDARY_METRICS: none
BENCHMARK_COMMAND: bash autoresearch.sh
FILES_IN_SCOPE: packages/pi-autoresearch/src/**
OFF_LIMITS: packages/pi-vault-client/src/**
HARD_CONSTRAINTS: no prompt copies
CHECKS_REQUIRED: none
AUTORESEARCH_MD_PLAN: goal
AUTORESEARCH_SH_CONTRACT: emit total_ms
BASELINE_PLAN: confirm workload
FIRST_EXPERIMENT_RULES: stop if metrics drift
`),
    /Missing required section: MISSING_INFORMATION/,
  );
});

test("parseNextHypothesisDecisionOutput parses status and machine mapping", () => {
  const ready = parseNextHypothesisDecisionOutput(`
STATUS: ready
STATE_READ: Baseline exists and the parser seam is the next bounded change.
NEXT_HYPOTHESIS: Add an exact-template adapter with typed parsers and fail-closed behavior.
WHY_NOW: The prompt-plane seam already exists upstream and runtime integration depends on a stable adapter.
TARGET_FILES:
- packages/pi-autoresearch/src/core/decisions.ts
CHANGE_SHAPE:
- Add one bounded decision runtime factory
- Parse required template sections into typed results
EXPECTED_PRIMARY_EFFECT: Runtime can consume governed Prompt Vault decisions without copying templates locally.
RISK_TO_GUARD:
- Silent picker fallback
- Parse errors becoming ready decisions
RUN_PLAN:
- npm run check
ASI_TO_CAPTURE_IF_KEPT:
- Exact-template enforcement protects ownership boundaries
ASI_TO_CAPTURE_IF_DISCARDED:
- Adapter shape was too narrow for runtime integration
STOP_CONDITION:
- Prompt-plane seam cannot prove exact template resolution
`);

  const rebaseline = mapNextHypothesisStatusToCampaignDecision("rebaseline_needed");
  const finalize = mapNextHypothesisStatusToCampaignDecision("finalize_candidate");
  const blocked = mapNextHypothesisStatusToCampaignDecision("blocked");

  assert.equal(ready.status, "ready");
  assert.equal(mapNextHypothesisOutcomeToCampaignDecision(ready), "iterate");
  assert.equal(rebaseline, "rebaseline");
  assert.equal(finalize, "finalize");
  assert.equal(blocked, "block");
  assert.deepEqual(ready.targetFiles, ["packages/pi-autoresearch/src/core/decisions.ts"]);
  assert.deepEqual(ready.changeShape, [
    "Add one bounded decision runtime factory",
    "Parse required template sections into typed results",
  ]);
});

test("parseFinalizeDecisionOutput parses proposed groups and JSON draft", () => {
  const result = parseFinalizeDecisionOutput(`
STATUS: ready
BASE_REF: abc1234
TRUNK_REF: main
OVERALL_RESULT: The decision adapter is reviewable as one bounded change group.
PROPOSED_GROUPS:
1. TITLE: Land the decision runtime adapter
   COMMITS: abc1234, def5678
   FILES:
   - packages/pi-autoresearch/src/core/decisions.ts
   - packages/pi-autoresearch/tests/decisions.test.ts
   METRIC_EFFECT: Unblocks live Prompt Vault decision consumption in the runtime
   DEPENDENCY_NOTES: none
GROUPING_RATIONALE:
- The parser and runtime adapter form one coherent review surface
APPROVAL_REQUIRED: yes
GROUPS_JSON_DRAFT:
${"```json"}
{
  "groups": [
    {
      "title": "Land the decision runtime adapter",
      "commits": ["abc1234", "def5678"],
      "files": [
        "packages/pi-autoresearch/src/core/decisions.ts",
        "packages/pi-autoresearch/tests/decisions.test.ts"
      ]
    }
  ]
}
${"```"}
RISK_NOTES:
- Live executor wiring remains deferred to task 1530
CLEANUP_HINTS:
- Keep runtime integration separate from the adapter commit
`);

  assert.equal(result.status, "ready");
  assert.equal(result.baseRef, "abc1234");
  assert.equal(result.trunkRef, "main");
  assert.equal(result.approvalRequired, true);
  assert.deepEqual(result.proposedGroups, [
    {
      title: "Land the decision runtime adapter",
      commits: ["abc1234", "def5678"],
      files: [
        "packages/pi-autoresearch/src/core/decisions.ts",
        "packages/pi-autoresearch/tests/decisions.test.ts",
      ],
      metricEffect: "Unblocks live Prompt Vault decision consumption in the runtime",
      dependencyNotes: [],
    },
  ]);
  assert.deepEqual(result.groupsJsonDraft, {
    groups: [
      {
        title: "Land the decision runtime adapter",
        commits: ["abc1234", "def5678"],
        files: [
          "packages/pi-autoresearch/src/core/decisions.ts",
          "packages/pi-autoresearch/tests/decisions.test.ts",
        ],
      },
    ],
  });
});

test("parseFinalizeDecisionOutput rejects malformed GROUPS_JSON_DRAFT", () => {
  assert.throws(
    () =>
      parseFinalizeDecisionOutput(`
STATUS: ready
BASE_REF: abc1234
TRUNK_REF: main
OVERALL_RESULT: ready
PROPOSED_GROUPS:
1. TITLE: Adapter
   COMMITS: abc1234
   FILES: packages/pi-autoresearch/src/core/decisions.ts
   METRIC_EFFECT: Unblocks runtime decisions
   DEPENDENCY_NOTES: none
GROUPING_RATIONALE: one group is enough
APPROVAL_REQUIRED: yes
GROUPS_JSON_DRAFT:
${"```json"}
{ invalid json }
${"```"}
RISK_NOTES: none
CLEANUP_HINTS: none
`),
    /GROUPS_JSON_DRAFT must be valid JSON/,
  );
});

test("decision runtime prepares the exact template, executes it, and parses next-hypothesis output", async () => {
  const prepareCalls: Array<{
    request: { query: string; context?: string };
    ctx?: { cwd?: string; currentCompany?: string };
  }> = [];
  const executorCalls: Array<{
    preparedText: string;
    templateName: string;
    cwd: string;
    currentCompany?: string;
  }> = [];

  const runtime = createAutoresearchDecisionRuntime({
    loadPromptPlaneRuntime: async () => ({
      async prepareSelection(request, ctx) {
        prepareCalls.push({ request, ctx });
        return {
          ok: true,
          status: "ready",
          selection_mode: "exact",
          template: {
            name: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
            artifact_kind: "procedure",
            control_mode: "one_shot",
            formalization_level: "workflow",
            owner_company: "software",
            visibility_companies: ["software"],
          },
          prepared_text: "Prepared governed prompt text",
        };
      },
    }),
    executePreparedPrompt: async (input): Promise<AutoresearchDecisionPromptExecutionResult> => {
      executorCalls.push({
        preparedText: input.preparedText,
        templateName: input.templateName,
        cwd: input.cwd,
        currentCompany: input.currentCompany,
      });
      return {
        outputText: `
STATUS: ready
STATE_READ: The adapter contract is stable enough for runtime integration.
NEXT_HYPOTHESIS: Wire the adapter into post-run runtime decision handling.
WHY_NOW: Task 1529 only needs the bounded adapter, and task 1530 depends on it landing first.
TARGET_FILES:
- packages/pi-autoresearch/src/core/runtime.ts
- packages/pi-autoresearch/extensions/pi-autoresearch.ts
CHANGE_SHAPE:
- Replace the unconditional iterate bridge when live decisions are available
EXPECTED_PRIMARY_EFFECT: Runtime can consume governed next-step decisions after each run.
RISK_TO_GUARD:
- Mixing adapter work with broader autonomy changes
RUN_PLAN:
- npm run check
ASI_TO_CAPTURE_IF_KEPT:
- Exact-template enforcement kept the prompt-plane seam honest
ASI_TO_CAPTURE_IF_DISCARDED:
- Runtime integration needed a different adapter seam
STOP_CONDITION:
- The live executor cannot return contract-valid sections
`,
      };
    },
  });

  const outcome = await runtime.runNextHypothesis(
    {
      goal: "Land task 1529 without widening scope.",
      constraints: ["Keep Prompt Vault as durable procedure owner"],
      segmentSummary: ["Bounded runtime kernel already exists"],
      baselineHistory: ["No live next-hypothesis step is wired yet"],
      recentRunHistory: ["Most recent run ended in iterate by thin bridge"],
      checksStatus: ["Package check still required before commit"],
      confidenceSignals: ["Prompt-plane seam already landed upstream"],
      asiNotes: ["Do not copy prompt text into the package"],
      deadEndMemory: ["Router-first approach is deferred"],
      filesInScope: ["packages/pi-autoresearch/src/**"],
      offLimits: ["packages/pi-vault-client/src/**"],
      ideasBacklog: ["Runtime integration follows in task 1530"],
    },
    {
      cwd: "/repo/packages/pi-autoresearch",
      currentCompany: "software",
      model: "gpt-test",
    },
  );

  assert.equal(outcome.status, "ready");
  assert.equal(prepareCalls.length, 1);
  assert.equal(prepareCalls[0]?.request.query, AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME);
  assert.match(prepareCalls[0]?.request.context ?? "", /Campaign goal/);
  assert.deepEqual(prepareCalls[0]?.ctx, {
    cwd: "/repo/packages/pi-autoresearch",
    currentCompany: "software",
  });
  assert.deepEqual(executorCalls, [
    {
      preparedText: "Prepared governed prompt text",
      templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
      cwd: "/repo/packages/pi-autoresearch",
      currentCompany: "software",
    },
  ]);
});

test("decision runtime fails closed when prompt preparation is not exact or cannot find the template", async () => {
  const fallbackRuntime = createAutoresearchDecisionRuntime({
    loadPromptPlaneRuntime: async () => ({
      async prepareSelection() {
        return {
          ok: true,
          status: "ready",
          selection_mode: "picker-fallback",
          template: {
            name: AUTORESEARCH_SETUP_TEMPLATE_NAME,
            artifact_kind: "procedure",
            control_mode: "one_shot",
            formalization_level: "workflow",
            owner_company: "software",
            visibility_companies: ["software"],
          },
          prepared_text: "Prepared prompt text",
        };
      },
    }),
    executePreparedPrompt: async () => "STATUS: blocked",
  });

  const fallbackOutcome = await fallbackRuntime.runSetup(
    {
      optimizationObjective: "Reduce latency",
      repoContext: ["Bounded scope"],
      filesInScope: ["packages/pi-autoresearch/src/**"],
      offLimits: [],
      benchmarkSurfaces: ["bash autoresearch.sh"],
      existingArtifacts: [],
      hardConstraints: ["Fail closed"],
    },
    {
      cwd: "/repo/packages/pi-autoresearch",
    },
  );

  assert.equal(fallbackOutcome.status, "blocked");
  assert.ok("failureStage" in fallbackOutcome);
  if (!("failureStage" in fallbackOutcome)) {
    throw new Error("Expected a blocked setup decision error.");
  }
  assert.equal(fallbackOutcome.failureStage, "prompt_plane");
  assert.match(fallbackOutcome.blockingReason, /exact-template selection/);

  const missingTemplateRuntime = createAutoresearchDecisionRuntime({
    loadPromptPlaneRuntime: async () => ({
      async prepareSelection() {
        return {
          ok: false,
          status: "blocked",
          blocking_reason: 'No visible template matched "pi-autoresearch-setup".',
        };
      },
    }),
    executePreparedPrompt: async () => "unused",
  });

  const missingTemplateOutcome = await missingTemplateRuntime.runSetup(
    {
      optimizationObjective: "Reduce latency",
      repoContext: ["Bounded scope"],
      filesInScope: ["packages/pi-autoresearch/src/**"],
      offLimits: [],
      benchmarkSurfaces: ["bash autoresearch.sh"],
      existingArtifacts: [],
      hardConstraints: ["Fail closed"],
    },
    {
      cwd: "/repo/packages/pi-autoresearch",
    },
  );

  assert.equal(missingTemplateOutcome.status, "blocked");
  assert.ok("failureStage" in missingTemplateOutcome);
  if (!("failureStage" in missingTemplateOutcome)) {
    throw new Error("Expected a blocked setup decision error.");
  }
  assert.equal(missingTemplateOutcome.failureStage, "prompt_plane");
  assert.match(missingTemplateOutcome.blockingReason, /No visible template matched/);
});

test("decision runtime preserves prompt-plane company-context failures as blocked results", async () => {
  const runtime = createAutoresearchDecisionRuntime({
    loadPromptPlaneRuntime: async () => ({
      async prepareSelection() {
        return {
          ok: false,
          status: "blocked",
          blocking_reason:
            "Explicit currentCompany (core) conflicts with resolved company context (software via cwd:/repo/packages/pi-autoresearch).",
        };
      },
    }),
    executePreparedPrompt: async () => "unused",
  });

  const outcome = await runtime.runSetup(
    {
      optimizationObjective: "Reduce latency",
      repoContext: ["Bounded scope"],
      filesInScope: ["packages/pi-autoresearch/src/**"],
      offLimits: [],
      benchmarkSurfaces: ["bash autoresearch.sh"],
      existingArtifacts: [],
      hardConstraints: ["Fail closed"],
    },
    {
      cwd: "/repo/packages/pi-autoresearch",
      currentCompany: "core",
    },
  );

  assert.equal(outcome.status, "blocked");
  assert.ok("failureStage" in outcome);
  if (!("failureStage" in outcome)) {
    throw new Error("Expected a blocked setup decision error.");
  }
  assert.equal(outcome.failureStage, "prompt_plane");
  assert.match(outcome.blockingReason, /conflicts with resolved company context/);
});

test("decision runtime returns a parse-stage blocked result when executor output breaks the contract", async () => {
  const runtime = createAutoresearchDecisionRuntime({
    loadPromptPlaneRuntime: async () => ({
      async prepareSelection() {
        return {
          ok: true,
          status: "ready",
          selection_mode: "exact",
          template: {
            name: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
            artifact_kind: "procedure",
            control_mode: "one_shot",
            formalization_level: "workflow",
            owner_company: "software",
            visibility_companies: ["software"],
          },
          prepared_text: "Prepared governed prompt text",
        };
      },
    }),
    executePreparedPrompt: async () => `
STATUS: ready
STATE_READ: Missing the rest of the required sections.
`,
  });

  const outcome = await runtime.runNextHypothesis(
    {
      goal: "Land task 1529.",
      constraints: ["Bounded slice only"],
      segmentSummary: ["Adapter exists"],
      baselineHistory: ["No live decisions yet"],
      recentRunHistory: ["Last step used thin iterate bridge"],
      checksStatus: ["Package check pending"],
      confidenceSignals: ["Prompt-plane seam exists"],
      asiNotes: ["Exact-template enforcement matters"],
      deadEndMemory: ["Do not widen into router work"],
      filesInScope: ["packages/pi-autoresearch/src/**"],
      offLimits: ["packages/pi-vault-client/src/**"],
      ideasBacklog: ["Task 1530 runtime wiring"],
    },
    {
      cwd: "/repo/packages/pi-autoresearch",
    },
  );

  assert.equal(outcome.status, "blocked");
  assert.ok("failureStage" in outcome);
  if (!("failureStage" in outcome)) {
    throw new Error("Expected a blocked next-hypothesis decision error.");
  }
  assert.equal(outcome.failureStage, "parse");
  assert.match(outcome.blockingReason, /Missing required section: NEXT_HYPOTHESIS/);
  assert.match(outcome.rawOutput ?? "", /STATE_READ/);
});

test("decision runtime can prepare a real visible Prompt Vault template and parse a bounded live next-hypothesis flow", async (t) => {
  let createVaultPromptPlaneRuntime: undefined | (() => unknown);

  try {
    ({ createVaultPromptPlaneRuntime } = (await import(
      new URL("../../pi-vault-client/src/promptPlane.js", import.meta.url).href
    )) as {
      createVaultPromptPlaneRuntime?: () => unknown;
    });
  } catch (error) {
    t.skip(
      `Live prompt-plane runtime is unavailable in this checkout: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  if (typeof createVaultPromptPlaneRuntime !== "function") {
    t.skip("Live prompt-plane runtime did not expose createVaultPromptPlaneRuntime().");
    return;
  }

  let preparedPrompt:
    | {
        templateName: string;
        selectionMode: string;
        preparedText: string;
        cwd: string;
      }
    | undefined;

  const runtime = createAutoresearchDecisionRuntime({
    loadPromptPlaneRuntime: async () => createVaultPromptPlaneRuntime() as never,
    executePreparedPrompt: async (input): Promise<AutoresearchDecisionPromptExecutionResult> => {
      preparedPrompt = {
        templateName: input.templateName,
        selectionMode: input.selectionMode,
        preparedText: input.preparedText,
        cwd: input.cwd,
      };
      return {
        outputText: `
STATUS: ready
STATE_READ: A live exact-template preparation exists, so the runtime can surface the next bounded move truthfully.
NEXT_HYPOTHESIS: Keep the next change inside the runtime-owned decision/reporting seam.
WHY_NOW: The exact Prompt Vault template already prepared successfully through the public prompt-plane seam.
TARGET_FILES:
- packages/pi-autoresearch/src/core/runtime.ts
- packages/pi-autoresearch/tests/runtime.test.ts
CHANGE_SHAPE:
- Reuse the existing live decision seam without widening into AK binding or router work
EXPECTED_PRIMARY_EFFECT: The package can keep a governed next move attached to the bounded runtime state.
RISK_TO_GUARD:
- Treating a missing live template as success
RUN_PLAN:
- npm run check
ASI_TO_CAPTURE_IF_KEPT:
- Exact template preparation stayed lawful under the live prompt-plane runtime
ASI_TO_CAPTURE_IF_DISCARDED:
- The live template lookup or parser contract drifted
STOP_CONDITION:
- Stop if exact template preparation no longer resolves pi-autoresearch-next-hypothesis
`,
      };
    },
  });

  const outcome = await runtime.runNextHypothesis(
    {
      goal: "Prove the bounded live Prompt Vault decision flow without widening package ownership.",
      constraints: ["bounded runtime only", "Prompt Vault remains the durable procedure owner"],
      segmentSummary: ["Workstream A runtime integration is already landed"],
      baselineHistory: ["Post-run decisions are now machine-mapped inside pi-autoresearch"],
      recentRunHistory: ["Need one end-to-end proof of live exact-template preparation"],
      checksStatus: ["npm run check pending"],
      confidenceSignals: [
        "The visible template set already includes pi-autoresearch-next-hypothesis",
      ],
      asiNotes: ["Do not copy prompt text into the package"],
      deadEndMemory: ["Router-first work remains explicitly deferred"],
      filesInScope: [
        "packages/pi-autoresearch/docs/project/**",
        "packages/pi-autoresearch/tests/**",
      ],
      offLimits: ["packages/pi-autoresearch/src/**", "packages/pi-vault-client/src/**"],
      ideasBacklog: ["Resume/control-surface workstream starts after Prompt Vault proof closes"],
    },
    {
      cwd: process.cwd(),
    },
  );

  if ("failureStage" in outcome) {
    const environmentBoundPromptPlaneFailure =
      outcome.failureStage === "prompt_plane" &&
      /(No visible template matched|Explicit company context is required|no such table|database is locked|unable to open database file)/iu.test(
        outcome.blockingReason,
      );
    if (environmentBoundPromptPlaneFailure) {
      t.skip(
        `Live Prompt Vault preparation is unavailable in this environment: ${outcome.blockingReason}`,
      );
      return;
    }
    assert.fail(
      `Expected a parsed live next-hypothesis decision, received ${outcome.failureStage}: ${outcome.blockingReason}`,
    );
  }

  assert.equal(outcome.status, "ready");
  assert.equal(preparedPrompt?.templateName, AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME);
  assert.equal(preparedPrompt?.selectionMode, "exact");
  assert.equal(preparedPrompt?.cwd, process.cwd());
  assert.match(preparedPrompt?.preparedText ?? "", /# PI-AUTORESEARCH NEXT HYPOTHESIS/);
  assert.match(preparedPrompt?.preparedText ?? "", /## CONTEXT/);
  assert.match(
    preparedPrompt?.preparedText ?? "",
    /Prove the bounded live Prompt Vault decision flow/,
  );
  assert.equal(
    outcome.nextHypothesis,
    "Keep the next change inside the runtime-owned decision/reporting seam.",
  );
  assert.deepEqual(outcome.targetFiles, [
    "packages/pi-autoresearch/src/core/runtime.ts",
    "packages/pi-autoresearch/tests/runtime.test.ts",
  ]);
});
