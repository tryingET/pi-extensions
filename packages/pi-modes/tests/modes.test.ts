import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";
import { buildSystemPrompt as buildHostSystemPrompt } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js";
import {
  ancestorModeDirectories,
  buildCustomBasePrompt,
  composeModePrompt,
  deleteMode,
  loadModes,
  MODE_STATE_TYPE,
  modePath,
  parseModeDefinition,
  resolveInitialModeSelection,
  saveMode,
  selectedModeFromEntries,
  startupModeFromEnvironment,
} from "../src/modes.ts";

const appendMode = parseModeDefinition({
  key: "review",
  label: "Review",
  promptStrategy: "append",
  systemPrompt: "Review carefully.",
});

const promptOptions: BuildSystemPromptOptions = {
  cwd: "/workspace/demo",
  selectedTools: ["read", "bash"],
  appendSystemPrompt: "Operator appendix",
  contextFiles: [{ path: "/workspace/AGENTS.md", content: "Project policy" }],
  skills: [
    {
      name: "example-skill",
      description: "Use for examples",
      filePath: "/skills/example/SKILL.md",
      baseDir: "/skills/example",
      sourceInfo: {
        path: "/skills/example/SKILL.md",
        source: "test",
        scope: "temporary",
        origin: "top-level",
        baseDir: "/skills/example",
      },
      disableModelInvocation: false,
    },
  ],
};

test("append preserves the assembled host prompt", () => {
  const result = composeModePrompt(appendMode, promptOptions, "HOST PROMPT");
  assert.match(result, /^HOST PROMPT/);
  assert.match(result, /Active prompt mode: Review/);
  assert.match(result, /Review carefully/);
});

test("replace_base mirrors Pi custom-base composition", () => {
  const result = buildCustomBasePrompt("CUSTOM BASE", promptOptions, new Date(2026, 6, 11));
  assert.match(result, /^CUSTOM BASE/);
  assert.match(result, /Operator appendix/);
  assert.match(result, /<project_context>/);
  assert.match(result, /Project policy/);
  assert.match(result, /<name>example-skill<\/name>/);
  assert.match(result, /Current date: 2026-07-11/);
  assert.match(result, /Current working directory: \/workspace\/demo$/);
  assert.doesNotMatch(result, /HOST PROMPT/);
});

test("replace_base has complete-output parity with the pinned Pi host builder", () => {
  const customPrompt = "CUSTOM BASE\nwith deliberate spacing";
  const expected = buildHostSystemPrompt({ ...promptOptions, customPrompt });
  const actual = buildCustomBasePrompt(customPrompt, promptOptions);
  assert.equal(actual, expected);
});

test("replace_final returns the exact configured prompt", () => {
  const mode = parseModeDefinition({
    key: "raw",
    label: "Raw",
    promptStrategy: "replace_final",
    systemPrompt: "EXACT FINAL PROMPT",
  });
  assert.equal(composeModePrompt(mode, promptOptions, "HOST PROMPT"), "EXACT FINAL PROMPT");
});

test("replace_base omits skills when read is inactive", () => {
  const result = buildCustomBasePrompt(
    "BASE",
    { ...promptOptions, selectedTools: ["bash"] },
    new Date(2026, 6, 11),
  );
  assert.doesNotMatch(result, /example-skill/);
});

test("mode loading is per-file fault tolerant and project overrides global", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-test-"));
  const globalDir = join(root, "global");
  const projectDir = join(root, "project");
  mkdirSync(globalDir);
  mkdirSync(projectDir);
  writeFileSync(
    join(globalDir, "shared.json"),
    JSON.stringify({ key: "shared", label: "Global", systemPrompt: "global" }),
  );
  writeFileSync(join(globalDir, "broken.json"), "{");
  writeFileSync(
    join(projectDir, "shared.json"),
    JSON.stringify({ key: "shared", label: "Project", systemPrompt: "project" }),
  );
  try {
    const loaded = loadModes({ globalDir, projectDir, projectTrusted: true });
    assert.equal(loaded.modes.find((mode) => mode.key === "shared")?.label, "Project");
    assert.equal(loaded.diagnostics.length, 1);
    assert.match(loaded.diagnostics[0]?.path ?? "", /broken\.json$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ancestor mode discovery mirrors root-to-cwd AGENTS layering", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-test-"));
  const company = join(root, "softwareco");
  const repo = join(company, "owned", "demo");
  const companyModes = join(company, ".pi", "modes");
  const repoModes = join(repo, ".pi", "modes");
  const globalDir = join(root, "global");
  mkdirSync(companyModes, { recursive: true });
  mkdirSync(repoModes, { recursive: true });
  mkdirSync(globalDir);
  writeFileSync(
    join(companyModes, "shared.json"),
    JSON.stringify({ key: "shared", label: "Company", systemPrompt: "company" }),
  );
  writeFileSync(
    join(companyModes, "company-only.json"),
    JSON.stringify({ key: "company-only", label: "Company Only", systemPrompt: "company" }),
  );
  writeFileSync(
    join(repoModes, "shared.json"),
    JSON.stringify({ key: "shared", label: "Repo", systemPrompt: "repo" }),
  );
  try {
    const projectDirs = ancestorModeDirectories(repo);
    assert.deepEqual(projectDirs.slice(-4), [
      join(root, ".pi", "modes"),
      join(company, ".pi", "modes"),
      join(company, "owned", ".pi", "modes"),
      repoModes,
    ]);
    const loaded = loadModes({ globalDir, projectDirs, projectTrusted: true });
    assert.equal(loaded.modes.find((mode) => mode.key === "shared")?.label, "Repo");
    assert.equal(loaded.modes.find((mode) => mode.key === "company-only")?.label, "Company Only");

    const untrusted = loadModes({ globalDir, projectDirs, projectTrusted: false });
    assert.equal(
      untrusted.modes.some((mode) => mode.key === "company-only"),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("untrusted projects cannot contribute modes", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-test-"));
  const projectDir = join(root, "project");
  mkdirSync(projectDir);
  writeFileSync(
    join(projectDir, "secret.json"),
    JSON.stringify({ key: "secret", label: "Secret", systemPrompt: "secret" }),
  );
  try {
    const loaded = loadModes({
      globalDir: join(root, "missing"),
      projectDir,
      projectTrusted: false,
    });
    assert.equal(
      loaded.modes.some((mode) => mode.key === "secret"),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("safe persistence rejects traversal and deletes only selected directory files", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-test-"));
  try {
    assert.throws(() => modePath(root, "../../outside"), /invalid mode key/);
    const mode = parseModeDefinition({ key: "safe", label: "Safe", systemPrompt: "safe" });
    const path = saveMode(root, mode);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).key, "safe");
    assert.throws(() => deleteMode(join(root, "..", "outside.json"), root), /refusing to delete/);
    deleteMode(path, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mode discovery and persistence reject symbolic-link boundaries", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-test-"));
  const actualDir = join(root, "actual");
  const linkedDir = join(root, "linked");
  const actualConfig = join(root, "actual-config");
  const project = join(root, "project");
  const linkedParentModes = join(project, ".pi", "modes");
  mkdirSync(actualDir);
  mkdirSync(join(actualConfig, "modes"), { recursive: true });
  mkdirSync(project);
  symlinkSync(actualDir, linkedDir, "dir");
  symlinkSync(actualConfig, join(project, ".pi"), "dir");
  try {
    const direct = loadModes({ globalDir: linkedDir, projectTrusted: false });
    assert.match(direct.diagnostics[0]?.message ?? "", /symbolic-link boundary/);
    const parent = loadModes({ globalDir: linkedParentModes, projectTrusted: false });
    assert.match(parent.diagnostics[0]?.message ?? "", /symbolic-link boundary/);
    const mode = parseModeDefinition({ key: "safe", label: "Safe", systemPrompt: "safe" });
    assert.throws(() => saveMode(linkedDir, mode), /symbolic-link boundary/);
    assert.throws(() => saveMode(linkedParentModes, mode), /symbolic-link boundary/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("session state follows the latest mode entry including off", () => {
  const entries = [
    { type: "custom", customType: MODE_STATE_TYPE, data: { key: "review" } },
    { type: "custom", customType: "other", data: { key: "ignored" } },
    { type: "custom", customType: MODE_STATE_TYPE, data: { key: null } },
  ];
  assert.deepEqual(selectedModeFromEntries(entries), { key: null });
});

test("session state uses only the caller-provided active branch", () => {
  const abandonedBranch = [
    { type: "custom", customType: MODE_STATE_TYPE, data: { key: "review" } },
    { type: "custom", customType: MODE_STATE_TYPE, data: { key: "explain" } },
  ];
  const activeBranch = [
    { type: "custom", customType: MODE_STATE_TYPE, data: { key: "review" } },
    { type: "custom", customType: MODE_STATE_TYPE, data: { key: "plan" } },
  ];
  assert.equal(selectedModeFromEntries(abandonedBranch).key, "explain");
  assert.equal(selectedModeFromEntries(activeBranch).key, "plan");
});

test("PI_MODE selects a normalized launch-time mode key", () => {
  assert.deepEqual(startupModeFromEnvironment("  Focused_Builder  "), {
    configured: true,
    key: "focused_builder",
  });
});

test("PI_MODE off aliases explicitly select the native SYSTEM.md host base", () => {
  for (const value of ["off", "DEFAULT", " none "]) {
    assert.deepEqual(startupModeFromEnvironment(value), { configured: true, key: null });
  }
});

test("missing or blank PI_MODE does not override restored session state", () => {
  assert.deepEqual(startupModeFromEnvironment(undefined), { configured: false, key: null });
  assert.deepEqual(startupModeFromEnvironment("  "), { configured: false, key: null });
});

test("invalid PI_MODE fails closed instead of becoming a path or prompt selector", () => {
  const result = startupModeFromEnvironment("../../SYSTEM.md");
  assert.equal(result.configured, true);
  assert.equal(result.key, null);
  assert.match(result.error ?? "", /valid mode key/);
});

test("explicit PI_MODE overrides a resumed session selection", () => {
  assert.deepEqual(
    resolveInitialModeSelection({
      applyEnvironment: true,
      environmentValue: "review",
      sessionKey: "plan",
      availableKeys: ["plan", "review"],
    }),
    { source: "environment", key: "review" },
  );
  assert.deepEqual(
    resolveInitialModeSelection({
      applyEnvironment: true,
      environmentValue: "off",
      sessionKey: "review",
      availableKeys: ["review"],
    }),
    { source: "environment", key: null },
  );
});

test("session selection is restored when PI_MODE is absent", () => {
  assert.deepEqual(
    resolveInitialModeSelection({
      applyEnvironment: true,
      environmentValue: undefined,
      sessionKey: "review",
      availableKeys: ["review"],
    }),
    { source: "session", key: "review" },
  );
});

test("PI_MODE is consumed only on process startup, not reload or session replacement", () => {
  for (const sessionKey of [null, "plan"] as const) {
    assert.deepEqual(
      resolveInitialModeSelection({
        applyEnvironment: false,
        environmentValue: "review",
        sessionKey,
        availableKeys: ["plan", "review"],
      }),
      { source: "session", key: sessionKey },
    );
  }
});

test("unavailable PI_MODE fails closed to the native SYSTEM.md host base", () => {
  const result = resolveInitialModeSelection({
    applyEnvironment: true,
    environmentValue: "missing",
    sessionKey: "review",
    availableKeys: ["review"],
  });
  assert.equal(result.source, "environment");
  assert.equal(result.key, null);
  assert.match(result.error ?? "", /unavailable mode/);
});
