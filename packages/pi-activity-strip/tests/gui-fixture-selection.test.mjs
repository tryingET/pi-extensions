import assert from "node:assert/strict";
import test from "node:test";
import { selectEmptyWorkspace } from "./support/fixture-workspaces.mjs";

test("empty-workspace fixture cannot accidentally select the unfocused target agent", () => {
  const workspaces = [
    { id: 1, idx: 1 },
    { id: 2, idx: 2, active_window_id: null },
    { id: 3, idx: 3 },
  ];
  const windows = [
    { id: 44, workspace_id: 1, is_focused: true },
    { id: 55, workspace_id: 2, is_focused: false },
  ];
  assert.equal(selectEmptyWorkspace(workspaces, windows, 1), workspaces[2]);
  assert.equal(
    selectEmptyWorkspace([workspaces[1], workspaces[2], workspaces[0]], windows, 1),
    workspaces[2],
  );
});
test("no actual empty workspace means no fixture selection, never a guessed fallback", () => {
  assert.equal(
    selectEmptyWorkspace([{ id: 1 }, { id: 2 }], [{ workspace_id: 1 }, { workspace_id: 2 }], 1),
    undefined,
  );
});
