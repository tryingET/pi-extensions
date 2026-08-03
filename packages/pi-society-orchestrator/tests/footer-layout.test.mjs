// ---
// summary: "Tests footer width accounting and protected fast/Git right-side priority."
// read_when:
//   - "Changing runtime footer slot order, padding, or narrow-width behavior."
// ---

import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";

import {
  createRuntimeTruthSnapshot,
  fitRuntimeFooterLayout,
  joinRuntimeFooterSlotText,
} from "../src/runtime/status-semantics.ts";

function snapshot() {
  return createRuntimeTruthSnapshot({
    cwd: "/repo",
    model: "test-model",
    contextUsage: { tokens: 20_000, contextWindow: 128_000 },
    sessionTokens: { input: 1_200, cacheRead: 300, cacheWrite: 200, output: 400 },
    societyDbPath: "/tmp/society.db",
    societyDbAvailable: true,
    vaultAvailable: true,
    vaultSummary: "available",
  });
}

const extraLeftSlots = [{ id: "status-rewind", tone: "dim", full: "rw 2/2", optional: true }];
const rightSlots = [
  { id: "fast-mode", tone: "dim", full: "🐢" },
  { id: "git", tone: "accent", full: "🌱 main 📝🤷⇡8" },
];

test("footer layout reserves its real left/right padding at every boundary width", () => {
  for (let width = 1; width <= 160; width += 1) {
    const layout = fitRuntimeFooterLayout(snapshot(), width, extraLeftSlots, rightSlots);
    const leftWidth = visibleWidth(joinRuntimeFooterSlotText(layout.left, layout.compactModel));
    const rightWidth = visibleWidth(joinRuntimeFooterSlotText(layout.right));

    if (layout.left.length > 0) {
      assert.ok(
        leftWidth + rightWidth + 3 <= width,
        `layout width ${width} retained a left side requiring ${leftWidth + rightWidth + 3}`,
      );
    }
  }
});

test("footer layout keeps the seam only when it fits beside protected fast and Git state", () => {
  const rightWidth = visibleWidth(joinRuntimeFooterSlotText(rightSlots));
  const seamWidth = visibleWidth("orchestrator→ASC");

  const fitting = fitRuntimeFooterLayout(
    snapshot(),
    rightWidth + seamWidth + 3,
    extraLeftSlots,
    rightSlots,
  );
  assert.deepEqual(
    fitting.left.map((slot) => slot.id),
    ["seam"],
  );

  const tooNarrow = fitRuntimeFooterLayout(
    snapshot(),
    rightWidth + seamWidth + 2,
    extraLeftSlots,
    rightSlots,
  );
  assert.deepEqual(tooNarrow.left, []);
  assert.deepEqual(
    tooNarrow.right.map((slot) => slot.id),
    ["fast-mode", "git"],
  );
});
