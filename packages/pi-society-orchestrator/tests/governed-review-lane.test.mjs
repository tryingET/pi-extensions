import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildGovernedReviewLaneWorkflowParams,
  executeGovernedReviewLaneWorkflow,
} from "../src/runtime/governed-review-lane.ts";
import {
  PI_PROVENANCE_OUTPUT_FILE,
  PI_PROVENANCE_REVIEW_LANE_ID,
} from "../src/runtime/review-lane-provenance.ts";
import { createWorkflowExecutor } from "../src/runtime/workflow-execution.ts";

function createFakeDispatchResult({ status = "done", output, exitCode = 0, elapsed = 25 }) {
  return {
    ok: status === "done",
    text: `[custom] ${status}`,
    details: {
      status,
      fullOutput: output,
      displayOutput: output,
      exitCode,
      elapsed,
      timedOut: status === "timed_out",
      aborted: status === "aborted",
    },
  };
}

test("buildGovernedReviewLaneWorkflowParams enables provenance without exposing public request fields", () => {
  const params = buildGovernedReviewLaneWorkflowParams({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo",
    cognitiveToolContent: "FRAMEWORK: review",
    reviewLane: {
      artifactRoot: "/tmp/review-lane-artifacts",
      extensionPath: "/tmp/pi-provenance.ts",
    },
    request: {
      mode: "chain",
      steps: [{ kind: "step", agent: "reviewer", objective: "Review the packet" }],
    },
  });

  assert.deepEqual(params.request, {
    mode: "chain",
    steps: [{ kind: "step", agent: "reviewer", objective: "Review the packet" }],
  });
  assert.deepEqual(params.provenance, {
    mode: "review_lane",
    artifactRoot: "/tmp/review-lane-artifacts",
    extensionPath: "/tmp/pi-provenance.ts",
  });
});

test("executeGovernedReviewLaneWorkflow is the narrow caller boundary that requests sidecars", async () => {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-governed-review-lane-"));
  const extensionPath = path.join(artifactRoot, "pi-provenance.ts");
  fs.writeFileSync(extensionPath, "export default function () {}\n", "utf-8");
  const calls = [];

  try {
    const workflowExecutor = createWorkflowExecutor({
      executor: {
        state: {},
        async execute(params) {
          calls.push(params);
          fs.mkdirSync(path.dirname(params.env[PI_PROVENANCE_OUTPUT_FILE]), { recursive: true });
          fs.writeFileSync(
            params.env[PI_PROVENANCE_OUTPUT_FILE],
            `${JSON.stringify({
              provenance_schema: "pi.assistant_message.provenance.v1",
              source_owner: "pi-runtime",
              pi_session: { message_entry_id: "entry-1" },
              assistant_message: {
                provider: "mock-provider",
                model: "mock-model",
                api: "mock-api",
              },
              capture_context: {
                kind: "review_lane",
                review_lane_id: params.env[PI_PROVENANCE_REVIEW_LANE_ID],
              },
            })}\n`,
            "utf-8",
          );

          return createFakeDispatchResult({
            output: `reviewed: ${params.objective}`,
          });
        },
      },
    });

    const result = await executeGovernedReviewLaneWorkflow(workflowExecutor, {
      activeTeam: "full",
      model: "mock/model",
      cwd: "/repo",
      cognitiveToolContent: "FRAMEWORK: review",
      reviewLane: { artifactRoot, extensionPath },
      request: {
        mode: "chain",
        steps: [{ kind: "step", agent: "reviewer", objective: "Review the governed packet" }],
      },
    });

    assert.equal(result.status, "done");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].extensions, [extensionPath]);
    assert.match(calls[0].env[PI_PROVENANCE_REVIEW_LANE_ID], /^orch-review-lane:/);
    assert.ok(calls[0].env[PI_PROVENANCE_OUTPUT_FILE].startsWith(artifactRoot));
    assert.equal(result.steps[0].provenance?.status, "captured");
    assert.equal(
      result.steps[0].provenance?.provenance.capture_context.review_lane_id,
      calls[0].env[PI_PROVENANCE_REVIEW_LANE_ID],
    );
  } finally {
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
});
