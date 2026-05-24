import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { contextPacketToolResult } from "../src/context-pack.js";
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
  const nextPlan = buildContextPlan({ objective: "Fresh plan" });
  const nextDetails = compactContextPlanDetails(nextPlan);
  assert.equal(nextPlan.nonAuthorizations.includes("MUTATED AUTH BOUNDARY"), false);
  assert.equal(nextDetails.nonAuthorizations.includes("MUTATED AUTH BOUNDARY"), false);

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
