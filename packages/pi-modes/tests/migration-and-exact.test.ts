import assert from "node:assert/strict";
import test from "node:test";
import {
  composeModeSelection,
  MODE_STATE_TYPE,
  MODE_STATE_TYPE_V2,
  parseModeDefinition,
  type ResolvedMode,
  selectionFromEntries,
} from "../src/modes.ts";

function mode(
  key: string,
  promptStrategy: "append" | "replace_base" | "replace_final",
  systemPrompt = key,
): ResolvedMode {
  return {
    ...parseModeDefinition({ key, label: key, promptStrategy, systemPrompt }),
    scope: "global",
  };
}

const options = { cwd: "/tmp", selectedTools: ["read"] };

test("replace_final preserves leading and trailing configured whitespace", () => {
  const exact = mode("exact", "replace_final", "  EXACT\n");
  const result = composeModeSelection(
    { baseKey: "exact", overlayKeys: [] },
    [exact],
    options,
    "HOST",
  );
  assert.equal(result.prompt, "  EXACT\n");
});

test("replay reports legacy state so the adapter can freeze its slot into v2", () => {
  const append = mode("same", "append");
  const replayed = selectionFromEntries(
    [{ type: "custom", customType: MODE_STATE_TYPE, data: { key: "same" } }],
    [append],
  );
  assert.equal(replayed.stateVersion, "v1");
  assert.deepEqual(replayed.selection, { baseKey: null, overlayKeys: ["same"] });
});

test("a later v2 snapshot freezes slot semantics across strategy drift", () => {
  const entries = [
    { type: "custom", customType: MODE_STATE_TYPE, data: { key: "same" } },
    {
      type: "custom",
      customType: MODE_STATE_TYPE_V2,
      data: { baseKey: null, overlayKeys: ["same"] },
    },
  ];
  const drifted = mode("same", "replace_final", "EXACT");
  const replayed = selectionFromEntries(entries, [drifted]);
  assert.equal(replayed.stateVersion, "v2");
  assert.deepEqual(replayed.selection, { baseKey: null, overlayKeys: ["same"] });
  const composed = composeModeSelection(replayed.selection, [drifted], options, "HOST");
  assert.equal(composed.prompt, "HOST");
  assert.match(composed.resolved.diagnostics[0]?.message ?? "", /cannot be an overlay/);
});
