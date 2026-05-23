import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { contextPacketToolResult } from "../src/context-pack.js";

const makeWorkspace = async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-context-pack-tool-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# AGENTS\n", "utf8");
  await writeFile(join(root, "docs", "note.md"), "# Note\n\nUseful packet content.\n", "utf8");
  return root;
};

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
  assert.equal(result.details.dogfoodFollowupReceipt.actualLowLevelReadSearchStatusCalls, null);
  assert.equal(
    result.details.dogfoodObservationTemplate.kind,
    "context_pack_dogfood_observation_v1",
  );
  assert.equal(
    result.details.dogfoodObservationTemplate.observation.actualLowLevelReadSearchStatusCalls,
    null,
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
