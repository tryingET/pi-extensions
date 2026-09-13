import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { sciErrorText } from "../src/sci-error-projection.ts";
import { createHarness, fakeBridge } from "./extension-test-helpers.ts";

// Explicit source-owner integration lane, not a runtime dependency or an implicit repo scan.
// The child imports only error factories/mapping (no analyzer, DB, MCP server or network).
const producerRoot = process.env.SCI_PRODUCER_ROOT;
test(
  "real producer normal-mode public errors survive native execution and both renderer views",
  {
    skip:
      !producerRoot &&
      "set SCI_PRODUCER_ROOT to the reviewed producer source for integration proof",
  },
  async () => {
    assert.ok(producerRoot && path.isAbsolute(producerRoot));
    const script = `
    import path from 'node:path';
    import { pathToFileURL } from 'node:url';
    const root = process.argv[1];
    const { workspaceReferenceError } = await import(pathToFileURL(path.join(root, 'src/core/workspace-ref.ts')).href);
    const { handleAdapterError } = await import(pathToFileURL(path.join(root, 'src/adapters/error-mapper.ts')).href);
    const reasons = ['workspace_ref_required', 'workspace_ref_mismatch', 'workspace_binding_mismatch',
      'workspace_path_invalid', 'workspace_path_unresolved', 'workspace_state_changed', 'workspace_state_unavailable'];
    console.log(JSON.stringify(reasons.map(reason => ({reason, result:handleAdapterError(workspaceReferenceError(reason), 'mcp')}))));
  `;
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script, producerRoot],
      {
        cwd: path.resolve(import.meta.dirname, ".."),
        env: { ...process.env, NODE_ENV: "production", DEBUG: "" },
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 64 * 1024,
      },
    );
    assert.equal(child.status, 0, "normal-mode producer error-mapper child must exit successfully");
    assert.equal(child.error, undefined);
    const results = JSON.parse(child.stdout);
    assert.equal(results.length, 7);
    for (const { reason, result } of results) {
      assert.equal(result.error.data.reason, reason);
      const expected = sciErrorText("explore_symbol_impact", result);
      assert.match(expected, new RegExp(`reason: ${reason}`));
      const fake = fakeBridge();
      fake.bridge.callTool = async () => result;
      const harness = createHarness(fake.bridge);
      const tool = harness.tools.get("explore_symbol_impact");
      assert.ok(tool?.renderResult);
      let failure: unknown;
      try {
        await tool.execute("producer-wire", { symbol: "Target" }, undefined, undefined, {
          cwd: "/synthetic/repo",
        });
      } catch (error) {
        failure = error;
      }
      assert.ok(failure instanceof Error);
      assert.equal(failure.message, expected);
      for (const expanded of [false, true]) {
        const rendered = tool.renderResult(
          { content: [{ type: "text", text: failure.message }] },
          { expanded, isPartial: false },
          {},
          { toolCallId: "producer-wire", isError: true },
        );
        const text = rendered.render(1000).join("\n");
        assert.match(text, new RegExp(reason));
        assert.doesNotMatch(text, /could not be rendered|raw fallback/);
      }
      assert.equal(harness.customEntries.length, 0);
    }
  },
);
