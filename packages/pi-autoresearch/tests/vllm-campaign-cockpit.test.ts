import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AUTORESEARCH_VLLM_CAMPAIGN_TOOL_NAME,
  buildVllmAutoresearchCampaignPlan,
  formatVllmAutoresearchCampaignPlan,
} from "../src/core/vllmCampaignCockpit.ts";

test("vLLM campaign cockpit plans bounded autoresearch calls from workstation artifacts", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pi-autoresearch-vllm-"));
  mkdirSync(path.join(cwd, "runtime/m14-longcot-local-benchmark"), { recursive: true });
  mkdirSync(path.join(cwd, "kb/docs"), { recursive: true });
  writeFileSync(path.join(cwd, "kb/README.md"), "# Blackwell\n");
  writeFileSync(path.join(cwd, "kb/docs/index.md"), "# Index\n");
  writeFileSync(
    path.join(cwd, "runtime/m14-longcot-local-benchmark/targets.local.json"),
    JSON.stringify({
      targets: [{ target_id: "configi-27b-direct" }, { target_id: "qwen36-vllm-main-dflash" }],
    }),
  );

  const plan = buildVllmAutoresearchCampaignPlan({
    action: "handoff_prompt",
    cwd,
    knowledgeBase: "kb",
    modelPath: path.join(cwd, "missing-model"),
    targets: ["configi-27b-direct"],
  });

  assert.equal(plan.action, "handoff_prompt");
  assert.equal(plan.targetCatalog.exists, true);
  assert.deepEqual(plan.targetCatalog.matchingTargets, ["configi-27b-direct"]);
  assert.equal(plan.matrix.maxCellsPerSegment, 4);
  assert.match(plan.exactToolCalls.join("\n"), /autoresearch_campaign_start/);
  assert.match(plan.exactToolCalls.join("\n"), /peerMode/);
  assert.match(plan.handoffPrompt, /fresh, stateless Pi session/);
  assert.match(formatVllmAutoresearchCampaignPlan(plan), /vLLM autoresearch campaign cockpit/);
});

test("vLLM campaign tool name is stable", () => {
  assert.equal(AUTORESEARCH_VLLM_CAMPAIGN_TOOL_NAME, "autoresearch_vllm_campaign");
});
