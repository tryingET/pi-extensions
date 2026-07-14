import assert from "node:assert/strict";
import test from "node:test";
import {
  createModeState,
  modeDefinitionFingerprint,
  parseModeDefinition,
  type ResolvedMode,
  resolveModeSelection,
} from "../src/modes.ts";
import { parseDirectSelection } from "../src/selection-commands.ts";

function mode(
  key: string,
  promptStrategy: "append" | "replace_base" | "replace_final",
  contracts: Record<string, unknown> = {},
): ResolvedMode {
  return {
    ...parseModeDefinition({
      schemaVersion: 2,
      key,
      label: key,
      promptStrategy,
      systemPrompt: `${key} prompt`,
      ...contracts,
    }),
    scope: "global",
    path: `/modes/${key}.json`,
  };
}

test("schema v2 is strict while legacy v1 keeps its replace_base default", () => {
  assert.equal(
    parseModeDefinition({ key: " Legacy ", label: "Legacy", systemPrompt: "x" }).key,
    "legacy",
  );
  assert.equal(
    parseModeDefinition({ key: "legacy", label: "Legacy", systemPrompt: "x" }).promptStrategy,
    "replace_base",
  );
  assert.throws(
    () =>
      parseModeDefinition({
        schemaVersion: 2,
        key: "Upper",
        label: "Upper",
        promptStrategy: "append",
        systemPrompt: "x",
      }),
    /canonical lowercase/,
  );
  assert.throws(
    () =>
      parseModeDefinition({ schemaVersion: 2, key: "strict", label: "Strict", systemPrompt: "x" }),
    /requires promptStrategy/,
  );
  assert.throws(
    () =>
      parseModeDefinition({
        schemaVersion: 2,
        key: "strict",
        label: "Strict",
        promptStrategy: "append",
        systemPrompt: "x",
        typoStrategy: true,
      }),
    /unknown field/,
  );
});

test("schema v2 bounds display, prompt, and contract inputs", () => {
  assert.throws(() => mode("bad", "append", { requires: ["bad"] }), /must not reference/);
  assert.throws(
    () => mode("bad", "append", { requires: ["review"], conflictsWith: ["review"] }),
    /overlap/,
  );
  assert.throws(
    () => mode("bad", "append", { before: ["review"], after: ["review"] }),
    /before and after overlap/,
  );
  assert.throws(
    () => mode("base", "replace_base", { before: ["review"] }),
    /valid only for append/,
  );
  assert.throws(
    () =>
      parseModeDefinition({
        schemaVersion: 2,
        key: "huge",
        label: "Huge",
        promptStrategy: "append",
        systemPrompt: "x".repeat(128 * 1024 + 1),
      }),
    /exceeds/,
  );
  assert.equal(
    parseModeDefinition({
      schemaVersion: 2,
      key: "unicode-label",
      label: "😀".repeat(120),
      promptStrategy: "append",
      systemPrompt: "x",
    }).label,
    "😀".repeat(120),
  );
  for (const label of ["Trailing newline\n", "C1\u0085control"]) {
    assert.throws(
      () =>
        parseModeDefinition({
          schemaVersion: 2,
          key: "control-label",
          label,
          promptStrategy: "append",
          systemPrompt: "x",
        }),
      /control|one line/,
    );
  }
});

test("requires, one-sided conflicts, and explicit ordering reject the whole composition", () => {
  const needs = mode("needs-review", "append", { requires: ["review"] });
  const review = mode("review", "append");
  const hostile = mode("hostile", "append", { conflictsWith: ["review"] });
  const first = mode("first", "append", { before: ["review"] });
  const builder = mode("builder", "replace_base");
  const afterBase = mode("after-base", "append", { after: ["builder"] });
  const modes = [needs, review, hostile, first, builder, afterBase];

  assert.equal(
    resolveModeSelection({ baseKey: null, overlayKeys: ["needs-review"] }, modes).blocked,
    true,
  );
  assert.equal(
    resolveModeSelection({ baseKey: null, overlayKeys: ["review", "hostile"] }, modes).blocked,
    true,
  );
  assert.equal(
    resolveModeSelection({ baseKey: null, overlayKeys: ["review", "first"] }, modes).blocked,
    true,
  );
  const invalidTarget = resolveModeSelection(
    { baseKey: "builder", overlayKeys: ["after-base"] },
    modes,
  );
  assert.equal(invalidTarget.blocked, true);
  assert.match(invalidTarget.diagnostics[0]?.message ?? "", /selected append overlay/);
  const valid = resolveModeSelection(
    { baseKey: null, overlayKeys: ["first", "review", "needs-review"] },
    modes,
  );
  assert.equal(valid.blocked, false);
  assert.deepEqual(
    valid.overlays.map((candidate) => candidate.key),
    ["first", "review", "needs-review"],
  );
});

test("incremental commands reject dependency breakage while exact set can satisfy it", () => {
  const review = mode("review", "append");
  const needs = mode("needs-review", "append", { requires: ["review"] });
  const modes = [review, needs];
  assert.match(
    parseDirectSelection("+needs-review", modes, { baseKey: null, overlayKeys: [] }).error ?? "",
    /requires/,
  );
  assert.deepEqual(
    parseDirectSelection("set native --overlay review --overlay needs-review", modes, {
      baseKey: null,
      overlayKeys: [],
    }).selection,
    { baseKey: null, overlayKeys: ["review", "needs-review"] },
  );
  assert.match(
    parseDirectSelection("-review", modes, {
      baseKey: null,
      overlayKeys: ["review", "needs-review"],
    }).error ?? "",
    /requires/,
  );
});

test("fingerprints ignore constraint list order but detect prompt and provenance drift", () => {
  const first = mode("portfolio", "append", { requires: ["review", "plan"] });
  const reordered = mode("portfolio", "append", { requires: ["plan", "review"] });
  assert.equal(
    modeDefinitionFingerprint(first).digest,
    modeDefinitionFingerprint(reordered).digest,
  );

  const state = createModeState({ baseKey: null, overlayKeys: ["portfolio"] }, [first], "command", {
    activatedAt: "2026-07-13T00:00:00.000Z",
  });
  const changed = { ...first, systemPrompt: "changed" };
  const blocked = resolveModeSelection({ baseKey: null, overlayKeys: ["portfolio"] }, [changed], {
    fingerprints: state.fingerprints,
    driftPolicy: "block",
  });
  assert.equal(blocked.blocked, true);
  assert.deepEqual(blocked.driftedKeys, ["portfolio"]);

  const warning = resolveModeSelection({ baseKey: null, overlayKeys: ["portfolio"] }, [changed], {
    fingerprints: state.fingerprints,
    driftPolicy: "warn",
  });
  assert.equal(
    warning.blocked,
    true,
    "changed requires contract still fails because its peers are absent",
  );

  const simple = mode("simple", "append");
  const simpleState = createModeState(
    { baseKey: null, overlayKeys: ["simple"] },
    [simple],
    "command",
  );
  const moved = { ...simple, path: "/other/simple.json" };
  const allowed = resolveModeSelection({ baseKey: null, overlayKeys: ["simple"] }, [moved], {
    fingerprints: simpleState.fingerprints,
    driftPolicy: "allow",
  });
  assert.equal(allowed.blocked, false);
  assert.deepEqual(allowed.driftedKeys, ["simple"]);

  const exact = mode("exact", "replace_final");
  const review = mode("review", "append");
  const malformedSelection = { baseKey: "exact", overlayKeys: ["review"] };
  const exactState = createModeState(malformedSelection, [exact, review], "command");
  const changedExact = { ...exact, systemPrompt: "changed exact" };
  const exactDrift = resolveModeSelection(malformedSelection, [changedExact, review], {
    fingerprints: exactState.fingerprints,
    driftPolicy: "block",
  });
  assert.equal(exactDrift.blocked, true);
  assert.deepEqual(exactDrift.driftedKeys, ["exact"]);
});
