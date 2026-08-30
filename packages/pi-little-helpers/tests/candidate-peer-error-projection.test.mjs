// summary: proves failed candidate-peer tool returns become Pi error results without losing details.
import assert from "node:assert/strict";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import { registerExtension } from "./sidequest-harness.mjs";

test("candidate_peer_spawn details.ok=false is projected to toolResult isError=true", async () => {
  const { events } = registerExtension(
    createSidequestExtension({ registerCommands: false, registerTools: true }),
  );
  const handler = events.get("tool_result")?.at(-1);
  assert.equal(typeof handler, "function");

  const failed = await handler({
    toolName: "candidate_peer_spawn",
    isError: false,
    details: { ok: false, error: "worktree_prepare_failed" },
    content: [{ type: "text", text: "candidate_peer_spawn failed" }],
  });
  assert.deepEqual(failed, { isError: true });

  const succeeded = await handler({
    toolName: "candidate_peer_spawn",
    isError: false,
    details: { ok: true },
    content: [{ type: "text", text: "opened" }],
  });
  assert.equal(succeeded, undefined);

  const unrelated = await handler({
    toolName: "scout_peer_spawn",
    isError: false,
    details: { ok: false },
    content: [{ type: "text", text: "unrelated" }],
  });
  assert.equal(unrelated, undefined);
});
