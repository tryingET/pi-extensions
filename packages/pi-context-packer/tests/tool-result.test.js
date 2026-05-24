import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildContextPacket, contextPacketToolResult } from "../src/context-pack.js";
import { compactContextPacketDetails } from "../src/context-pack-result.js";
import { buildContextPlan, compactContextPlanDetails } from "../src/context-plan.js";

const makeWorkspace = async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-context-pack-tool-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# AGENTS\n", "utf8");
  await writeFile(join(root, "docs", "note.md"), "# Note\n\nUseful packet content.\n", "utf8");
  return root;
};

test("compactContextPlanDetails omits raw objectives, paths, queries, and seeds", async () => {
  const root = await makeWorkspace();
  const sentinel = "SENTINEL_SECRET_OBJECTIVE";
  const plan = buildContextPlan(
    {
      objective: `Plan docs for ${sentinel}`,
      cwd: root,
      repoRoot: root,
      seeds: [
        { kind: "path", value: "docs/note.md", note: `note-${sentinel}` },
        { kind: "symbol", value: `symbol${sentinel}` },
        { kind: "prompt", value: `prompt-${sentinel}` },
        { kind: "free_text", value: `free-${sentinel}` },
      ],
      providers: { docs: "required", sci: "required", prompt_vault: "required" },
    },
    { cwd: root },
  );
  const details = compactContextPlanDetails(plan);

  assert.equal(details.ok, true);
  assert.equal(details.objective, undefined);
  assert.equal(details.cwd, undefined);
  assert.equal(details.repoRoot, undefined);
  assert.equal(details.objectiveRef, "plan Markdown title");
  assert.equal(details.workspace.absolutePathsOmitted, true);
  assert.equal(details.redaction.rawObjectiveOmitted, true);
  assert.equal(details.redaction.rawQueriesOmitted, true);
  assert.equal(details.redaction.rawSeedsOmitted, true);
  assert.equal(details.redaction.rawSeedNotesOmitted, true);

  const byProvider = Object.fromEntries(details.providers.map((entry) => [entry.provider, entry]));
  assert.equal(byProvider.docs.posture, "selected");
  assert.equal(byProvider.docs.queryCount, 1);
  assert.equal(byProvider.docs.proposedQueries[0].queryOmitted, true);
  assert.equal(byProvider.docs.proposedQueries[0].rawSeedsOmitted, true);
  assert.equal(byProvider.docs.proposedQueries[0].seedKindCounts.path, 1);
  assert.equal(byProvider.sci.proposedQueries[0].seedKindCounts.symbol, 1);
  assert.equal(byProvider.prompt_vault.proposedQueries[0].seedKindCounts.prompt, 1);
  assert.equal(Array.isArray(details.risks), true);
  assert.equal(Array.isArray(details.ownerSurfaceRecommendations), true);
  assert.ok(details.nonAuthorizations.some((item) => item.includes("does not mutate")));

  const serializedDetails = JSON.stringify(details);
  assert.equal(serializedDetails.includes(root), false);
  assert.equal(serializedDetails.includes(sentinel), false);
  assert.equal(serializedDetails.includes("docs/note.md"), false);
  assert.equal(serializedDetails.includes("symbolSENTINEL"), false);
  assert.equal(serializedDetails.includes("note-SENTINEL"), false);
  assert.equal(serializedDetails.includes("prompt-SENTINEL"), false);
  assert.equal(serializedDetails.includes("free-SENTINEL"), false);
});

test("compactContextPlanDetails normalizes labels and resists returned-array mutation", async () => {
  const sentinel = "INVALID_KIND_DETAILS_SENTINEL";
  const invalidPlan = buildContextPlan({
    objective: "Review invalid kind projection",
    seeds: [{ kind: sentinel, value: "x".repeat(1001) }],
  });
  const invalidDetails = compactContextPlanDetails(invalidPlan);

  assert.equal(JSON.stringify(invalidDetails).includes(sentinel), false);
  assert.deepEqual(invalidDetails.omittedSeeds, [
    {
      kind: "free_text",
      provider: "context_plan",
      reason: "seed value exceeds compact input limit (1000 characters)",
    },
  ]);

  invalidDetails.nonAuthorizations.push("MUTATED AUTH BOUNDARY");
  const mutablePlan = buildContextPlan({
    objective: "Use Prompt Vault task",
    seeds: [{ kind: "path", value: "/tmp/secret.md" }],
    providers: { prompt_vault: "required" },
  });
  const mutableDetails = compactContextPlanDetails(mutablePlan);
  mutableDetails.budget.maxTokens = 1;
  mutableDetails.risks[0].message = "MUTATED RISK";
  mutableDetails.ownerSurfaceRecommendations[0].surface = "MUTATED OWNER";
  const nextPlan = buildContextPlan({ objective: "Fresh plan" });
  const nextDetails = compactContextPlanDetails(nextPlan);
  assert.equal(nextPlan.nonAuthorizations.includes("MUTATED AUTH BOUNDARY"), false);
  assert.equal(nextDetails.nonAuthorizations.includes("MUTATED AUTH BOUNDARY"), false);
  assert.notEqual(mutablePlan.budget.maxTokens, 1);
  assert.notEqual(mutablePlan.risks[0].message, "MUTATED RISK");
  assert.notEqual(mutablePlan.ownerSurfaceRecommendations[0].surface, "MUTATED OWNER");

  const packetResult = await contextPacketToolResult(
    {
      objective: "Read docs",
      seeds: [{ kind: sentinel, value: "x".repeat(1001) }],
      providers: { agents: "off", docs: "off", sci: "off", git: "off", session: "off" },
    },
    { cwd: process.cwd() },
  );
  assert.equal(packetResult.content[0].text.includes(sentinel), false);
  assert.equal(JSON.stringify(packetResult.details).includes(sentinel), false);

  const promptSeedResult = await contextPacketToolResult(
    {
      objective: "Read prompt context",
      seeds: [{ kind: "prompt", value: "p".repeat(1001) }],
      providers: { agents: "off", docs: "off", sci: "off", git: "off", session: "off" },
    },
    { cwd: process.cwd() },
  );
  assert.equal(promptSeedResult.details.omissions[0].reason, "unsafe_seed");
});

test("compactContextPacketDetails resists returned projection mutation", async () => {
  const packetResult = await buildContextPacket(
    {
      objective: "Review AK omission projection",
      providers: {
        agents: "off",
        docs: "off",
        sci: "off",
        git: "off",
        session: "off",
        ak: "required",
      },
    },
    { cwd: process.cwd() },
  );
  const details = compactContextPacketDetails(packetResult, "");

  details.budget.maxTokens = 1;
  details.totals.candidatesSelected = 999;
  details.omissions[0].detail = "MUTATED OMISSION";
  details.ownerSurfaceRecommendations[0].surface = "MUTATED OWNER";
  details.nextOwnerActions[0].surface = "MUTATED ACTION";
  details.nextToolSuggestions[0].reason = "MUTATED SUGGESTION";
  details.measurementReceipt.wiredProviders.push("mutated_provider");
  details.dogfoodObservationTemplate.packet.omissions[0].provider = "mutated_provider";
  details.measurementHints[0].note = "MUTATED HINT";
  details.nonAuthorizations.push("MUTATED AUTH BOUNDARY");

  assert.notEqual(packetResult.packet.budget.maxTokens, 1);
  assert.notEqual(packetResult.packet.totals.candidatesSelected, 999);
  assert.notEqual(packetResult.packet.omissions[0].detail, "MUTATED OMISSION");
  assert.notEqual(packetResult.packet.ownerSurfaceRecommendations[0].surface, "MUTATED OWNER");
  assert.notEqual(packetResult.packet.nextOwnerActions[0].surface, "MUTATED ACTION");
  assert.notEqual(packetResult.packet.nextToolSuggestions[0].reason, "MUTATED SUGGESTION");
  assert.equal(
    packetResult.packet.measurementReceipt.wiredProviders.includes("mutated_provider"),
    false,
  );
  assert.notEqual(
    packetResult.packet.dogfoodObservationTemplate.packet.omissions[0].provider,
    "mutated_provider",
  );
  assert.notEqual(packetResult.packet.measurementHints[0].note, "MUTATED HINT");
  assert.equal(packetResult.packet.nonAuthorizations.includes("MUTATED AUTH BOUNDARY"), false);
});

test("compactContextPacketDetails omits raw omission details and suggestion reasons", async () => {
  const root = await makeWorkspace();
  const omittedPath = "docs/omitted-budget-path.md";
  await writeFile(
    join(root, omittedPath),
    "# Omitted budget path\n\nThis file is intentionally too large for the tiny packet budget.\n",
    "utf8",
  );

  const result = await contextPacketToolResult(
    {
      objective: "Assemble tiny docs packet",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: omittedPath }],
      providers: { agents: "off", docs: "required", sci: "off", git: "off", session: "off" },
      budget: { maxTokens: 20, reserveTokens: 19 },
    },
    { cwd: root },
  );

  assert.match(result.content[0].text, /omitted-budget-path\.md/);
  assert.equal(result.details.ok, true);
  assert.equal(result.details.omissions[0].provider, "docs");
  assert.equal(result.details.omissions[0].reason, "budget");
  assert.equal(result.details.omissions[0].detail, undefined);
  assert.equal(result.details.omissions[0].detailOmitted, true);
  assert.equal(result.details.omissions[0].detailRef, "packet.omissions[0].detail");
  assert.equal(typeof result.details.omissions[0].detailEstimatedTokens, "number");
  assert.equal(typeof result.details.omissions[0].detailBytes, "number");

  const suggestion = result.details.nextToolSuggestions.find(
    (entry) => entry.tool === "docs owner surface",
  );
  assert.ok(suggestion);
  assert.equal(suggestion.reason, undefined);
  assert.equal(suggestion.reasonOmitted, true);
  assert.equal(typeof suggestion.reasonEstimatedTokens, "number");
  assert.equal(typeof suggestion.reasonBytes, "number");

  assert.equal(
    result.details.dogfoodObservationTemplate.packet.omissions[0].detailRef,
    "packet.omissions[0].detail",
  );
  assert.equal(JSON.stringify(result.details).includes(omittedPath), false);
  assert.equal(JSON.stringify(result.details).includes(`docs:${omittedPath}`), false);
  assert.equal(result.details.redaction.rawOmissionDetailsOmitted, true);
  assert.equal(result.details.redaction.rawNextToolSuggestionReasonsOmitted, true);
});

test("contextPacketToolResult returns markdown content and compact details", async () => {
  const root = await makeWorkspace();
  const result = await contextPacketToolResult(
    {
      objective: "Assemble readable packet",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "docs/note.md" }],
      providers: { git: "off", sci: "off" },
    },
    { cwd: root },
  );

  assert.match(result.content[0].text, /# Context packet:/);
  assert.match(result.content[0].text, /Useful packet content/);
  assert.equal(result.details.ok, true);
  assert.equal(result.details.objective, undefined);
  assert.equal(result.details.cwd, undefined);
  assert.equal(result.details.repoRoot, undefined);
  assert.equal(result.details.objectiveRef, "packet Markdown title");
  assert.equal(result.details.workspace.absolutePathsOmitted, true);
  assert.equal(result.details.redaction.rawSelectedItemPathsOmitted, true);
  assert.equal(result.details.sections[0].items[0].content, undefined);
  assert.equal(result.details.sections[0].items[0].id, undefined);
  assert.equal(result.details.sections[0].items[0].idOmitted, true);
  assert.equal(result.details.sections[0].items[0].ref, "packet.sections[0].items[0]");
  assert.equal(result.details.sections[0].items[0].provenance.path, undefined);
  assert.equal(result.details.sections[0].items[0].provenance.pathOmitted, true);
  assert.equal(Array.isArray(result.details.ownerSurfaceRecommendations), true);
  assert.equal(Array.isArray(result.details.nextOwnerActions), true);
  assert.equal(typeof result.details.measurementReceipt.estimatedToolCallsAvoided, "number");
  assert.equal(result.details.packetUtilityRecommendation.status, "use_packet");
  assert.equal(
    result.details.packetUtilityRecommendation.nonAuthorization.includes("advisory"),
    true,
  );
  assert.equal(result.details.dogfoodFollowupReceipt.status, "observation_pending");
  assert.equal(result.details.dogfoodFollowupReceipt.activityType, null);
  assert.equal(result.details.dogfoodFollowupReceipt.runtimeContext, "unknown");
  assert.deepEqual(result.details.dogfoodFollowupReceipt.runtimeContextOptions, [
    "source_local",
    "installed_artifact",
    "live_pi_reloaded",
    "unknown",
  ]);
  assert.equal(result.details.dogfoodFollowupReceipt.actualLowLevelReadSearchStatusCalls, null);
  assert.equal(result.details.dogfoodFollowupReceipt.validationCommandsRun, null);
  assert.equal(
    result.details.dogfoodObservationTemplate.kind,
    "context_pack_dogfood_observation_v1",
  );
  assert.equal(result.details.dogfoodObservationTemplate.observation.activityType, null);
  assert.equal(
    result.details.dogfoodObservationTemplate.observation.actualLowLevelReadSearchStatusCalls,
    null,
  );
  assert.equal(result.details.dogfoodObservationTemplate.observation.validationCommandsRun, null);
  assert.ok(
    result.details.dogfoodObservationTemplate.observation.omissionFollowupClassOptions.includes(
      "true_missing_capability",
    ),
  );
  assert.equal(
    result.details.dogfoodFollowupReceipt.nonAuthorization.includes("AK evidence"),
    true,
  );
  assert.equal(
    JSON.stringify(result.details.dogfoodFollowupReceipt).includes("Useful packet content"),
    false,
  );
  assert.equal(
    JSON.stringify(result.details.dogfoodObservationTemplate).includes("Useful packet content"),
    false,
  );
  assert.equal(JSON.stringify(result.details).includes(root), false);
  assert.equal(JSON.stringify(result.details).includes("Assemble readable packet"), false);
  assert.equal(JSON.stringify(result.details).includes("docs/note.md"), false);
});
