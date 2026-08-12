// summary: "Covers self cache-aware tree/fork/dispatch advice and tool safety boundary."
// read_when:
//   - "Changing self cache routing or session-branch recommendations."

import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, createMockContext, createPiHarness, loadExtensionWithMocks } from "./harness.mjs";

test("self query: cache-aware delegation distinguishes tree affinity from fork identity", async () => {
  const { default: extension, tempDir } = await loadExtensionWithMocks();
  const harness = createPiHarness();
  extension(harness.pi);

  const tool = harness.tools.get("self");
  const ctx = createMockContext({
    cwd: "/repo",
    model: { provider: "openai-codex", id: "gpt-5.6-sol" },
    getContextUsage() {
      return { tokens: 120_000, contextWindow: 200_000, percent: 60 };
    },
    sessionManager: {
      getSessionName: () => "controller",
      getSessionFile: () => "/sessions/controller.jsonl",
    },
  });

  const result = await tool.execute(
    "tc-cache-routing",
    { query: "cache-aware delegation: tree or fork?" },
    null,
    null,
    ctx,
  );

  assert.equal(result.details.intent, "meta");
  assert.equal(result.details.data.kind, "self.cache_routing_advice.v1");
  assert.equal(result.details.data.current.provider, "openai-codex");
  assert.equal(result.details.data.current.contextUsage.percent, 60);
  assert.equal(result.details.data.treeThenFork.preservesParentCacheIdentity, false);
  assert.equal(result.details.data.toolBoundary.automaticSessionReplacementFromTool, false);
  assert.ok(result.details.data.routes.every((route) => route.cacheGuarantee === false));
  assert.match(result.content[0].text, /\/tree and continue in place/);
  assert.match(result.content[0].text, /\/clone allocates a new session ID/);
  assert.match(result.content[0].text, /prompt_cache_key from the Pi session ID/);
  assert.match(result.content[0].text, /must not execute \/tree, \/fork, or \/clone/);
  assert.match(result.content[0].text, /external quality\/overlap evaluation/);

  await cleanup(tempDir);
});
