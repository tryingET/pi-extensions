import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ancestorPresetDirectories,
  decodePreset,
  encodePreset,
  loadModePresets,
  parseModePreset,
  presetExportText,
  saveModePreset,
} from "../src/mode-presets.ts";
import {
  createModeState,
  MODE_STATE_TYPE_V2,
  MODE_STATE_TYPE_V3,
  parseModeDefinition,
  type ResolvedMode,
  selectionFromEntries,
} from "../src/modes.ts";

function overlay(key: string): ResolvedMode {
  return {
    ...parseModeDefinition({
      schemaVersion: 2,
      key,
      label: key,
      promptStrategy: "append",
      systemPrompt: key,
    }),
    scope: "global",
    path: `/modes/${key}.json`,
  };
}

test("v3 replay wins chronologically and malformed newest v3 is ignored", () => {
  const review = overlay("review");
  const state = createModeState({ baseKey: null, overlayKeys: ["review"] }, [review], "command", {
    activatedAt: "2026-07-13T00:00:00.000Z",
  });
  const entries = [
    { type: "custom", customType: MODE_STATE_TYPE_V2, data: { baseKey: null, overlayKeys: [] } },
    { type: "custom", customType: MODE_STATE_TYPE_V3, data: state },
    { type: "custom", customType: MODE_STATE_TYPE_V3, data: { ...state, unknown: true } },
  ];
  const replayed = selectionFromEntries(entries, [review]);
  assert.equal(replayed.stateVersion, "v3");
  assert.deepEqual(replayed.selection, { baseKey: null, overlayKeys: ["review"] });
  assert.equal(replayed.state?.source, "command");
});

test("v3 requires exact fingerprint correspondence", () => {
  const review = overlay("review");
  const state = createModeState({ baseKey: null, overlayKeys: ["review"] }, [review], "command");
  const malformed = { ...state, fingerprints: {} };
  const replayed = selectionFromEntries(
    [
      { type: "custom", customType: MODE_STATE_TYPE_V2, data: { baseKey: null, overlayKeys: [] } },
      { type: "custom", customType: MODE_STATE_TYPE_V3, data: malformed },
    ],
    [review],
  );
  assert.equal(replayed.stateVersion, "v2");
  assert.deepEqual(replayed.selection, { baseKey: null, overlayKeys: [] });
  const nonIso = selectionFromEntries(
    [
      { type: "custom", customType: MODE_STATE_TYPE_V2, data: { baseKey: null, overlayKeys: [] } },
      { type: "custom", customType: MODE_STATE_TYPE_V3, data: { ...state, activatedAt: "0" } },
    ],
    [review],
  );
  assert.equal(nonIso.stateVersion, "v2");
});

test("preset parser and base64url export round-trip exact order", () => {
  const preset = parseModePreset({
    schemaVersion: 1,
    key: "deep-review",
    label: "Deep Review",
    selection: { baseKey: null, overlayKeys: ["plan", "review"] },
  });
  assert.deepEqual(decodePreset(encodePreset(preset)), preset);
  assert.throws(() => parseModePreset({ ...preset, execute: true }), /unknown preset field/);
  assert.throws(
    () => parseModePreset({ ...preset, selection: { baseKey: "plan", overlayKeys: ["plan"] } }),
    /duplicate|also be an overlay/,
  );
  assert.throws(
    () => parseModePreset({ ...preset, selection: { baseKey: true, overlayKeys: [] } }),
    /baseKey/,
  );
  const resolved = { ...preset, scope: "global" as const, path: "/preset/deep-review.json" };
  assert.deepEqual(JSON.parse(presetExportText(resolved)), preset);
});

test("preset descriptions are strict and failed atomic saves leave no temporary files", () => {
  const base = {
    schemaVersion: 1 as const,
    key: "blocked",
    label: "Blocked",
    selection: { baseKey: null, overlayKeys: [] },
  };
  assert.throws(() => parseModePreset({ ...base, description: 42 }), /must be a string/);
  assert.throws(() => parseModePreset({ ...base, description: "   " }), /nonblank/);

  const root = mkdtempSync(join(tmpdir(), "pi-mode-preset-atomic-"));
  mkdirSync(join(root, "blocked.json"));
  try {
    assert.throws(() => saveModePreset(root, base));
    assert.deepEqual(
      readdirSync(root).filter((name) => name.endsWith(".tmp")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mode linter rejects content whose key does not match its filename", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-mode-lint-name-"));
  const path = join(root, "wrong.json");
  writeFileSync(
    path,
    JSON.stringify({
      schemaVersion: 2,
      key: "actual",
      label: "Actual",
      promptStrategy: "append",
      systemPrompt: "ACTUAL",
    }),
  );
  try {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts", "mode-lint.mjs"), path],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /filename must be actual\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preset discovery is trust-gated, layered, and symlink-safe", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-mode-presets-"));
  const globalDir = join(root, "global");
  const project = join(root, "company", "repo");
  const ancestor = join(root, "company", ".pi", "mode-presets");
  const projectDir = join(project, ".pi", "mode-presets");
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(ancestor, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  const base = {
    schemaVersion: 1 as const,
    key: "shared",
    label: "Shared",
    selection: { baseKey: null, overlayKeys: ["review"] },
  };
  saveModePreset(globalDir, base);
  saveModePreset(ancestor, { ...base, label: "Ancestor" });
  saveModePreset(projectDir, { ...base, label: "Project" });
  try {
    const dirs = ancestorPresetDirectories(project);
    const trusted = loadModePresets({ globalDir, projectDirs: dirs, projectTrusted: true });
    assert.equal(trusted.presets.find((preset) => preset.key === "shared")?.label, "Project");
    const untrusted = loadModePresets({ globalDir, projectDirs: dirs, projectTrusted: false });
    assert.equal(untrusted.presets.find((preset) => preset.key === "shared")?.label, "Shared");

    const target = join(root, "target");
    mkdirSync(target);
    writeFileSync(join(target, "bad.json"), JSON.stringify(base));
    const linked = join(root, "linked");
    symlinkSync(target, linked, "dir");
    const rejected = loadModePresets({ globalDir: linked, projectDirs: [], projectTrusted: false });
    assert.match(rejected.diagnostics[0]?.message ?? "", /symbolic-link boundary/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preset discovery bounds directories and diagnoses a regular-file directory path", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-mode-preset-bound-"));
  const regular = join(root, "regular");
  writeFileSync(regular, "not a directory");
  const bounded = join(root, "bounded");
  mkdirSync(bounded);
  try {
    const regularResult = loadModePresets({
      globalDir: regular,
      projectDirs: [],
      projectTrusted: false,
    });
    assert.match(regularResult.diagnostics[0]?.message ?? "", /not a directory/);
    for (let index = 0; index < 1025; index += 1) {
      const key = `p${String(index).padStart(4, "0")}`;
      writeFileSync(
        join(bounded, `${key}.json`),
        JSON.stringify({
          schemaVersion: 1,
          key,
          label: key,
          selection: { baseKey: null, overlayKeys: [] },
        }),
      );
    }
    const loaded = loadModePresets({ globalDir: bounded, projectDirs: [], projectTrusted: false });
    assert.equal(loaded.presets.length, 1024);
    assert.match(loaded.diagnostics[0]?.message ?? "", /only the first 1024/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
