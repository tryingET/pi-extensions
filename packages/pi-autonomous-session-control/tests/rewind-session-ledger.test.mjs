import assert from "node:assert/strict";
import test from "node:test";
import {
  ASC_REWIND_FORK_PENDING_CUSTOM_TYPE,
  ASC_REWIND_OP_CUSTOM_TYPE,
  ASC_REWIND_TURN_CUSTOM_TYPE,
  applyRewindBindings,
  getCommitFromRewindOp,
  isAscRewindForkPendingData,
  isAscRewindOpData,
  isAscRewindTurnData,
} from "../extensions/self/rewind/index.ts";

test("rewind session-ledger guards accept well-shaped ASC-owned rewind records", () => {
  assert.equal(ASC_REWIND_TURN_CUSTOM_TYPE, "asc-rewind-turn");
  assert.equal(ASC_REWIND_OP_CUSTOM_TYPE, "asc-rewind-op");
  assert.equal(ASC_REWIND_FORK_PENDING_CUSTOM_TYPE, "asc-rewind-fork-pending");

  assert.equal(
    isAscRewindTurnData({
      v: 1,
      snapshots: ["commit-a"],
      bindings: [["entry-1", 0]],
    }),
    true,
  );

  assert.equal(
    isAscRewindOpData({
      v: 1,
      snapshots: ["commit-a", "commit-b"],
      bindings: [["entry-1", 0]],
      current: 0,
      undo: 1,
    }),
    true,
  );

  assert.equal(
    isAscRewindForkPendingData({
      v: 1,
      current: "commit-a",
      undo: "commit-b",
    }),
    true,
  );

  assert.equal(
    isAscRewindTurnData({ v: 2, snapshots: ["commit-a"], bindings: [["entry-1", 0]] }),
    false,
  );
  assert.equal(
    isAscRewindOpData({ v: 1, snapshots: ["commit-a"], bindings: [["entry-1", "bad"]] }),
    false,
  );
  assert.equal(isAscRewindForkPendingData({ v: 1, current: "" }), false);
});

test("rewind session-ledger guards reject malformed snapshot ledgers fail-closed", () => {
  const malformedCases = [
    {
      name: "non-array snapshots",
      data: { v: 1, snapshots: "commit-a", bindings: [["entry-1", 0]] },
    },
    {
      name: "empty snapshot string",
      data: { v: 1, snapshots: [""], bindings: [["entry-1", 0]] },
    },
    {
      name: "non-string snapshot",
      data: { v: 1, snapshots: [123], bindings: [["entry-1", 0]] },
    },
    {
      name: "negative binding index",
      data: { v: 1, snapshots: ["commit-a"], bindings: [["entry-1", -1]] },
    },
    {
      name: "out-of-bounds binding index",
      data: { v: 1, snapshots: ["commit-a"], bindings: [["entry-1", 1]] },
    },
  ];

  for (const { name, data } of malformedCases) {
    assert.equal(isAscRewindTurnData(data), false, name);
    assert.equal(isAscRewindOpData(data), false, name);
  }

  assert.equal(isAscRewindOpData({ v: 1, snapshots: ["commit-a"], current: -1 }), false);
  assert.equal(isAscRewindOpData({ v: 1, snapshots: ["commit-a"], undo: 1 }), false);
});

test("rewind session-ledger helpers bind entries and resolve current or undo commits safely", () => {
  const entryToCommit = new Map();
  applyRewindBindings(
    entryToCommit,
    ["commit-a", "commit-b"],
    [
      ["entry-a", 0],
      ["entry-b", 1],
      ["entry-missing", 99],
    ],
  );

  assert.deepEqual(
    [...entryToCommit.entries()],
    [
      ["entry-a", "commit-a"],
      ["entry-b", "commit-b"],
    ],
  );

  const opData = {
    v: 1,
    snapshots: ["commit-a", "commit-b"],
    current: 0,
    undo: 1,
  };

  assert.equal(getCommitFromRewindOp(opData, "current"), "commit-a");
  assert.equal(getCommitFromRewindOp(opData, "undo"), "commit-b");
  assert.equal(
    getCommitFromRewindOp({ v: 1, snapshots: ["commit-a"], current: 9 }, "current"),
    undefined,
  );
});
