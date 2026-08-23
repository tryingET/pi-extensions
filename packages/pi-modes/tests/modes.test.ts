import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";
import { buildSystemPrompt as buildHostSystemPrompt } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js";
import {
  ancestorModeDirectories,
  buildCustomBasePrompt,
  composeModePrompt,
  composeModeSelection,
  deleteMode,
  loadModes,
  MODE_STATE_TYPE,
  MODE_STATE_TYPE_V2,
  modePath,
  parseModeDefinition,
  resolveInitialModeSelection,
  resolveInitialSelection,
  resolveModeSelection,
  saveMode,
  selectedModeFromEntries,
  selectionFromEntries,
  startupModeFromEnvironment,
} from "../src/modes.ts";
import { PI_HOST_COMPATIBILITY } from "../src/prompt-composition.ts";

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
  const result = buildCustomBasePrompt("CUSTOM BASE", promptOptions);
  assert.match(result, /^CUSTOM BASE/);
  assert.match(result, /Operator appendix/);
  assert.match(result, /<project_context>/);
  assert.match(result, /Project policy/);
  assert.match(result, /<name>example-skill<\/name>/);
  assert.doesNotMatch(result, /Current date:/);
  assert.ok(result.endsWith("Current working directory: /workspace/demo\n"));
  assert.doesNotMatch(result, /HOST PROMPT/);
});

test("replace_base has complete-output parity with the pinned Pi host builder", () => {
  const customPrompt = "CUSTOM BASE\nwith deliberate spacing";
  const expected = buildHostSystemPrompt({ ...promptOptions, customPrompt });
  const actual = buildCustomBasePrompt(customPrompt, promptOptions);
  assert.equal(actual, expected);
  assert.ok(actual.endsWith("Current working directory: /workspace/demo\n"));
});

test("runtime host compatibility matches every Pi peer range", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { peerDependencies: Record<string, string> };
  for (const peer of [
    "@earendil-works/pi-ai",
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-tui",
  ]) {
    assert.equal(packageJson.peerDependencies[peer], PI_HOST_COMPATIBILITY);
  }
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

test("replace_base has no-read skill-omission parity with the pinned Pi host builder", () => {
  const noReadOptions = { ...promptOptions, selectedTools: ["bash"] };
  const result = buildCustomBasePrompt("BASE", noReadOptions);
  assert.equal(result, buildHostSystemPrompt({ ...noReadOptions, customPrompt: "BASE" }));
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
    const saved = JSON.parse(readFileSync(path, "utf8")) as { key: string; schemaVersion: number };
    assert.equal(saved.key, "safe");
    assert.equal(saved.schemaVersion, 2, "saving upgrades legacy definitions to strict v2");
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

const baseMode = {
  ...parseModeDefinition({
    key: "builder",
    label: "Builder",
    promptStrategy: "replace_base",
    systemPrompt: "BUILDER BASE",
  }),
  scope: "global" as const,
};

const finalMode = {
  ...parseModeDefinition({
    key: "exact",
    label: "Exact",
    promptStrategy: "replace_final",
    systemPrompt: "EXACT FINAL",
  }),
  scope: "global" as const,
};

const resolvedAppendMode = { ...appendMode, scope: "builtin" as const };
const explainOverlay = {
  ...parseModeDefinition({
    key: "explain-more",
    label: "Explain More",
    promptStrategy: "append",
    systemPrompt: "Explain more.",
  }),
  scope: "global" as const,
};
const compositionModes = [baseMode, finalMode, resolvedAppendMode, explainOverlay];

test("composes one replace_base with flat ordered append overlays", () => {
  const result = composeModeSelection(
    { baseKey: "builder", overlayKeys: ["review", "explain-more"] },
    compositionModes,
    promptOptions,
    "HOST PROMPT",
  );
  assert.match(result.prompt, /^BUILDER BASE/);
  assert.doesNotMatch(result.prompt, /HOST PROMPT/);
  const first = result.prompt.indexOf("Active prompt overlay 1: Review");
  const second = result.prompt.indexOf("Active prompt overlay 2: Explain More");
  assert.ok(first > 0 && second > first);
  assert.equal((result.prompt.match(/Active prompt overlay/g) ?? []).length, 2);
});

test("native base supports ordered overlays without rebuilding host context", () => {
  const result = composeModeSelection(
    { baseKey: null, overlayKeys: ["explain-more", "review"] },
    compositionModes,
    promptOptions,
    "HOST PROMPT",
  );
  assert.match(result.prompt, /^HOST PROMPT/);
  assert.ok(result.prompt.indexOf("Explain More") < result.prompt.indexOf("Review"));
});

test("replace_final remains exact and omits malformed overlays", () => {
  const result = composeModeSelection(
    { baseKey: "exact", overlayKeys: ["review"] },
    compositionModes,
    promptOptions,
    "HOST PROMPT",
  );
  assert.equal(result.prompt, "EXACT FINAL");
  assert.equal(result.resolved.overlays.length, 0);
  assert.match(result.resolved.diagnostics[0]?.message ?? "", /exclusive/);
});

test("selection resolution fails closed on a structurally malformed selection", () => {
  const result = resolveModeSelection(
    { baseKey: "review", overlayKeys: ["missing", "builder", "review", "review"] },
    compositionModes,
  );
  assert.equal(result.base, undefined);
  assert.deepEqual(result.overlays, []);
  assert.equal(result.blocked, true);
  assert.match(result.diagnostics[0]?.message ?? "", /duplicate|also be an overlay/);
});

test("v2 state replays ordered overlays and later recognized versions win chronologically", () => {
  const entries = [
    { type: "custom", customType: MODE_STATE_TYPE, data: { key: "builder" } },
    {
      type: "custom",
      customType: MODE_STATE_TYPE_V2,
      data: { baseKey: "builder", overlayKeys: ["review", "explain-more"] },
    },
    { type: "custom", customType: MODE_STATE_TYPE, data: { key: "review" } },
  ];
  assert.deepEqual(selectionFromEntries(entries, compositionModes).selection, {
    baseKey: null,
    overlayKeys: ["review"],
  });
});

test("malformed newest v2 state is ignored and preceding valid state remains active", () => {
  const entries = [
    {
      type: "custom",
      customType: MODE_STATE_TYPE_V2,
      data: { baseKey: "builder", overlayKeys: ["review"] },
    },
    {
      type: "custom",
      customType: MODE_STATE_TYPE_V2,
      data: { baseKey: null, overlayKeys: ["review", "review"] },
    },
  ];
  assert.deepEqual(selectionFromEntries(entries, compositionModes).selection, {
    baseKey: "builder",
    overlayKeys: ["review"],
  });
});

test("legacy unavailable keys recover when discovery later contains the mode", () => {
  const entries = [{ type: "custom", customType: MODE_STATE_TYPE, data: { key: "later" } }];
  assert.deepEqual(selectionFromEntries(entries, compositionModes).selection, {
    baseKey: null,
    overlayKeys: [],
  });
  const later = { ...appendMode, key: "later", scope: "global" as const };
  assert.deepEqual(selectionFromEntries(entries, [...compositionModes, later]).selection, {
    baseKey: null,
    overlayKeys: ["later"],
  });
});

test("PI_MODE translates append/base/final/off into durable v2 selection shapes", () => {
  const sessionSelection = { baseKey: "builder", overlayKeys: ["review"] };
  assert.deepEqual(
    resolveInitialSelection({
      applyEnvironment: true,
      environmentValue: "review",
      sessionSelection,
      modes: compositionModes,
    }).selection,
    { baseKey: null, overlayKeys: ["review"] },
  );
  assert.deepEqual(
    resolveInitialSelection({
      applyEnvironment: true,
      environmentValue: "exact",
      sessionSelection,
      modes: compositionModes,
    }).selection,
    { baseKey: "exact", overlayKeys: [] },
  );
  assert.deepEqual(
    resolveInitialSelection({
      applyEnvironment: true,
      environmentValue: "off",
      sessionSelection,
      modes: compositionModes,
    }).selection,
    { baseKey: null, overlayKeys: [] },
  );
});

test("mode discovery diagnoses regular-file directories and atomic saves resist predictable temp symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-modes-atomic-"));
  const regular = join(root, "regular");
  const victim = join(root, "victim");
  writeFileSync(regular, "not a directory");
  writeFileSync(victim, "SAFE");
  try {
    const loaded = loadModes({ globalDir: regular, projectTrusted: false });
    assert.match(loaded.diagnostics[0]?.message ?? "", /not a directory/);

    const target = modePath(root, "atomic");
    const now = Date.now();
    for (let offset = -20; offset <= 20; offset += 1) {
      symlinkSync(victim, `${target}.${process.pid}.${now + offset}.tmp`);
    }
    saveMode(root, parseModeDefinition({ key: "atomic", label: "Atomic", systemPrompt: "atomic" }));
    assert.equal(readFileSync(victim, "utf8"), "SAFE");
    assert.equal(JSON.parse(readFileSync(target, "utf8")).key, "atomic");

    mkdirSync(modePath(root, "blocked"));
    assert.throws(() =>
      saveMode(
        root,
        parseModeDefinition({ key: "blocked", label: "Blocked", systemPrompt: "blocked" }),
      ),
    );
    assert.deepEqual(
      readdirSync(root).filter((name) => name.endsWith(".tmp") && name.includes("blocked")),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
