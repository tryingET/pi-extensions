import assert from "node:assert/strict";
import test from "node:test";

import { createSemanticCodeExtension } from "../src/extension.ts";
import type { SciBridge } from "../src/mcp-bridge.ts";
import { SCI_COMPOSITE_TOOL_NAMES } from "../src/tool-definitions.ts";
import {
  fakeExploreDetails,
  standardObservedUnusableDetails,
  unconfirmedExplorePacket,
} from "./explore-test-fixtures.ts";

interface ExploreTool {
  execute: (...args: unknown[]) => Promise<{
    content: Array<{ type: string; text: string }>;
    details: unknown;
  }>;
}

function createExploreHarness(bridge: SciBridge) {
  let exploreTool: ExploreTool | undefined;
  const customEntries: Array<{ customType: string; data: unknown }> = [];
  createSemanticCodeExtension({ bridgeFactory: () => bridge })({
    registerTool(tool: ExploreTool & { name: string }) {
      if (tool.name === "explore_symbol_impact") exploreTool = tool;
    },
    registerEntryRenderer(_customType: string, _renderer: unknown) {},
    appendEntry(customType: string, data: unknown) {
      customEntries.push({ customType, data });
    },
    on() {},
  } as never);
  return { exploreTool, customEntries };
}

test("valid explore packets with high-confidence provider tokens fail closed before projection or persistence", async () => {
  const tokens = [
    `xoxb-${"A".repeat(24)}`,
    `github_pat_${"B".repeat(48)}`,
    `sk-proj-${"C".repeat(32)}`,
    `sk_live_${"D".repeat(24)}`,
    `rk_live_${"K".repeat(24)}`,
    `glpat-${"E".repeat(24)}`,
    `AKIA${"F".repeat(16)}`,
    `AIza${"G".repeat(32)}`,
    `GOCSPX-${"L".repeat(24)}`,
    `npm_${"H".repeat(32)}`,
    `pypi-${"I".repeat(32)}`,
    "eyJabcde.eyJfghij.signature12345",
    `%78oxb-${"J".repeat(24)}`,
    `%72k_live_${"M".repeat(24)}`,
    `GOCSPX%2D${"N".repeat(24)}`,
  ];

  for (const token of tokens) {
    for (const mode of ["compact", "standard", "debug"] as const) {
      const details =
        mode === "compact"
          ? undefined
          : mode === "standard"
            ? standardObservedUnusableDetails()
            : fakeExploreDetails("debug");
      const packet = unconfirmedExplorePacket(details);
      packet.limitations = [`producer note ${token}`];
      const bridge: SciBridge = {
        async callTool() {
          return { content: [{ type: "text", text: JSON.stringify(packet) }] };
        },
        async advertisedToolNames() {
          return [...SCI_COMPOSITE_TOOL_NAMES];
        },
        async close() {},
      };
      const harness = createExploreHarness(bridge);
      assert.ok(harness.exploreTool);
      const result = await harness.exploreTool.execute(
        "call-secret",
        { symbol: "Target", mode },
        undefined,
        undefined,
        { cwd: "/workspace/repo" },
      );
      const projected = JSON.parse(result.content[0].text);
      assert.equal(projected.ok, false);
      assert.equal(projected.status, "indeterminate");
      assert.equal(harness.customEntries.length, 0);
      assert.equal(result.content[0].text.includes(token), false);
      assert.doesNotMatch(JSON.stringify(result.details), /"packet"/);
    }
  }
});
