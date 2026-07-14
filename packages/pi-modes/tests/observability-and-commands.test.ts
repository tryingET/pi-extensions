import assert from "node:assert/strict";
import test from "node:test";
import { createCompositionReport, estimateTokens } from "../src/mode-observability.ts";
import {
  composeModeSelection,
  createModeState,
  parseModeDefinition,
  type ResolvedMode,
  resolveInitialSelection,
  startupCompositionFromEnvironment,
} from "../src/modes.ts";
import {
  modeArgumentCompletions,
  parseDirectSelection,
  requiresReplaceFinalConfirmation,
} from "../src/selection-commands.ts";

function mode(
  key: string,
  promptStrategy: "append" | "replace_base" | "replace_final",
): ResolvedMode {
  return {
    ...parseModeDefinition({
      schemaVersion: 2,
      key,
      label: key,
      promptStrategy,
      systemPrompt: key,
    }),
    scope: "global",
  };
}

const modes = [
  mode("builder", "replace_base"),
  mode("exact", "replace_final"),
  mode("review", "append"),
  mode("explain", "append"),
];

test("PI_MODES provides strict structured startup composition and precedes PI_MODE", () => {
  assert.deepEqual(
    startupCompositionFromEnvironment('{"baseKey":"builder","overlayKeys":["review","explain"]}'),
    {
      configured: true,
      selection: { baseKey: "builder", overlayKeys: ["review", "explain"] },
    },
  );
  assert.match(
    startupCompositionFromEnvironment('{"baseKey":null,"overlayKeys":["review","review"]}').error ??
      "",
    /duplicate/,
  );
  const initial = resolveInitialSelection({
    applyEnvironment: true,
    environmentValue: "exact",
    compositionEnvironmentValue: '{"baseKey":"builder","overlayKeys":["review"]}',
    sessionSelection: { baseKey: null, overlayKeys: [] },
    modes,
  });
  assert.deepEqual(initial.selection, { baseKey: "builder", overlayKeys: ["review"] });
});

test("direct replace_final syntax records explicit headless acknowledgement", () => {
  const parsed = parseDirectSelection("exact --confirm-exact", modes, {
    baseKey: null,
    overlayKeys: [],
  });
  assert.deepEqual(parsed.selection, { baseKey: "exact", overlayKeys: [] });
  assert.equal(parsed.confirmExact, true);
  assert.equal(
    requiresReplaceFinalConfirmation(
      { baseKey: null, overlayKeys: [] },
      parsed.selection ?? { baseKey: null, overlayKeys: [] },
      modes,
    ),
    true,
  );
});

test("semantic completions separate bases, selectable overlays, and removals", () => {
  const current = { baseKey: "builder", overlayKeys: ["review"] };
  assert.deepEqual(modeArgumentCompletions("+", modes, current), ["+explain"]);
  assert.deepEqual(modeArgumentCompletions("-", modes, current), ["-review"]);
  assert.ok(modeArgumentCompletions("set ", modes, current).includes("set exact"));
  assert.equal(modeArgumentCompletions("+", modes, current).includes("+builder"), false);
});

test("composition report provides stable hashes, estimates, provenance, and optional prompt", () => {
  const selection = { baseKey: "builder", overlayKeys: ["review"] };
  const state = createModeState(selection, modes, "command", {
    activatedAt: "2026-07-13T00:00:00.000Z",
  });
  const composed = composeModeSelection(
    selection,
    modes,
    { cwd: "/tmp", selectedTools: ["read"] },
    "HOST",
    { fingerprints: state.fingerprints, driftPolicy: state.driftPolicy },
  );
  const report = createCompositionReport({
    selection,
    resolved: composed.resolved,
    prompt: composed.prompt,
    hostPrompt: "HOST",
    state,
    includePrompt: true,
  });
  assert.match(report.composition.sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.composition.estimatedTokens, estimateTokens(composed.prompt));
  assert.equal(report.activation.source, "command");
  assert.equal(report.components.length, 2);
  assert.equal(report.prompt, composed.prompt);
});
