import assert from "node:assert/strict";
import test from "node:test";

import { materializeVaultWorkflowBinding } from "../src/runtime/vault-workflow-binding.ts";

const binding = {
  workflow_id: "deep-review.v1",
  request: {
    mode: "chain",
    steps: [{ kind: "step", agent: "reviewer", objective: "$OBJECTIVE" }],
  },
};

test("materializes the exact deep-review v1 graph with the caller objective", () => {
  const result = materializeVaultWorkflowBinding("deep-review", binding, "Review the current diff");
  assert.equal(result.ok, true);
  assert.equal(result.workflowId, "deep-review.v1");
  assert.deepEqual(result.request, {
    mode: "chain",
    steps: [{ kind: "step", agent: "reviewer", objective: "Review the current diff" }],
  });
});

test("rejects unknown templates, ids, graph drift, and empty objectives", () => {
  assert.equal(materializeVaultWorkflowBinding("other", binding, "review").ok, false);
  assert.equal(
    materializeVaultWorkflowBinding(
      "deep-review",
      { ...binding, workflow_id: "deep-review.v2" },
      "review",
    ).ok,
    false,
  );
  assert.equal(
    materializeVaultWorkflowBinding(
      "deep-review",
      {
        ...binding,
        request: {
          mode: "parallel",
          steps: [{ kind: "step", agent: "reviewer", objective: "$OBJECTIVE" }],
        },
      },
      "review",
    ).ok,
    false,
  );
  assert.equal(materializeVaultWorkflowBinding("deep-review", binding, "  ").ok, false);
});
