import type { BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";
import {
  type DefinitionFingerprints,
  type DriftPolicy,
  type ModeDefinition,
  type ModeSelection,
  modeDefinitionFingerprint,
  normalizeModeSelection,
  type ResolvedMode,
  type ResolvedModeSelection,
  type SelectionDiagnostic,
  selectedKeys,
} from "./modes.ts";

/** Compose one legacy mode; retained as a compatibility helper. */
export function composeModePrompt(
  mode: ModeDefinition,
  options: BuildSystemPromptOptions,
  assembledPrompt: string,
): string {
  if (mode.promptStrategy === "append") {
    return `${assembledPrompt}\n\n# Active prompt mode: ${mode.label}\n${mode.systemPrompt}`;
  }
  if (mode.promptStrategy === "replace_final") return mode.systemPrompt;
  return buildCustomBasePrompt(mode.systemPrompt, options);
}

export interface ResolutionPolicy {
  fingerprints?: DefinitionFingerprints;
  driftPolicy?: DriftPolicy;
}

export function resolveModeSelection(
  selection: ModeSelection,
  modes: readonly ResolvedMode[],
  policy: ResolutionPolicy = {},
): ResolvedModeSelection {
  const diagnostics: SelectionDiagnostic[] = [];
  const driftedKeys: string[] = [];
  let normalized: ModeSelection;
  try {
    normalized = normalizeModeSelection(selection);
  } catch (error) {
    return {
      overlays: [],
      diagnostics: [{ message: error instanceof Error ? error.message : String(error) }],
      driftedKeys,
      blocked: true,
    };
  }
  const byKey = new Map(modes.map((mode) => [mode.key, mode]));
  let base: ResolvedMode | undefined;
  if (normalized.baseKey) {
    const candidate = byKey.get(normalized.baseKey);
    if (!candidate) {
      diagnostics.push({
        key: normalized.baseKey,
        message: "base mode is unavailable; using native host",
      });
    } else if (candidate.promptStrategy === "append") {
      diagnostics.push({
        key: candidate.key,
        message: "append mode cannot occupy the base slot; using native host",
      });
    } else {
      base = candidate;
    }
  }

  const overlays: ResolvedMode[] = [];
  const seen = new Set<string>();
  for (const key of normalized.overlayKeys) {
    if (seen.has(key)) {
      diagnostics.push({ key, message: "duplicate overlay omitted" });
      continue;
    }
    seen.add(key);
    const candidate = byKey.get(key);
    if (!candidate) {
      diagnostics.push({ key, message: "overlay mode is unavailable and was omitted" });
    } else if (candidate.promptStrategy !== "append") {
      diagnostics.push({
        key,
        message: `${candidate.promptStrategy} mode cannot be an overlay and was omitted`,
      });
    } else {
      overlays.push(candidate);
    }
  }

  const components = [...(base ? [base] : []), ...overlays];
  if (policy.fingerprints) {
    for (const key of selectedKeys(normalized)) {
      const expected = policy.fingerprints[key];
      const current = byKey.get(key);
      const actual = current ? modeDefinitionFingerprint(current) : undefined;
      if (
        !expected ||
        !actual ||
        expected.digest !== actual.digest ||
        expected.scope !== actual.scope ||
        expected.path !== actual.path
      ) {
        driftedKeys.push(key);
        diagnostics.push({
          key,
          message: `definition changed since activation (${policy.driftPolicy ?? "block"} policy)`,
        });
      }
    }
  }
  if (base?.promptStrategy === "replace_final" && driftedKeys.includes(base.key)) {
    diagnostics.push({
      key: base.key,
      message:
        "drifted replace_final is blocked under every policy until explicit confirmed reactivation",
    });
    return { overlays: [], diagnostics, driftedKeys, blocked: true };
  }
  if (driftedKeys.length > 0 && (policy.driftPolicy ?? "block") === "block") {
    diagnostics.push({
      message: "composition blocked until /mode-reapprove or explicit reactivation",
    });
    return { overlays: [], diagnostics, driftedKeys, blocked: true };
  }

  if (base?.promptStrategy === "replace_final" && normalized.overlayKeys.length > 0) {
    diagnostics.push({
      key: base.key,
      message: `replace_final is exclusive; preserving exact final prompt and omitting overlays: ${normalized.overlayKeys.join(", ")}`,
    });
    return { base, overlays: [], diagnostics, driftedKeys, blocked: false };
  }

  const selected = new Set(components.map((component) => component.key));
  const overlayPositions = new Map(overlays.map((component, index) => [component.key, index]));
  const constraintDiagnostics: SelectionDiagnostic[] = [];
  for (const component of components) {
    const missing = (component.requires ?? []).filter((key) => !selected.has(key));
    if (missing.length > 0) {
      constraintDiagnostics.push({
        key: component.key,
        message: `requires selected mode(s): ${missing.join(", ")}`,
      });
    }
    const conflicts = (component.conflictsWith ?? []).filter((key) => selected.has(key));
    if (conflicts.length > 0) {
      constraintDiagnostics.push({
        key: component.key,
        message: `conflicts with selected mode(s): ${conflicts.join(", ")}`,
      });
    }
    for (const key of component.before ?? []) {
      if (!selected.has(key)) continue;
      if (byKey.get(key)?.promptStrategy !== "append") {
        constraintDiagnostics.push({
          key: component.key,
          message: `before may target only a selected append overlay: ${key}`,
        });
      } else if ((overlayPositions.get(component.key) ?? -1) >= (overlayPositions.get(key) ?? -1)) {
        constraintDiagnostics.push({ key: component.key, message: `must appear before ${key}` });
      }
    }
    for (const key of component.after ?? []) {
      if (!selected.has(key)) continue;
      if (byKey.get(key)?.promptStrategy !== "append") {
        constraintDiagnostics.push({
          key: component.key,
          message: `after may target only a selected append overlay: ${key}`,
        });
      } else if ((overlayPositions.get(component.key) ?? -1) <= (overlayPositions.get(key) ?? -1)) {
        constraintDiagnostics.push({ key: component.key, message: `must appear after ${key}` });
      }
    }
  }
  if (constraintDiagnostics.length > 0) {
    diagnostics.push(...constraintDiagnostics, {
      message: "composition constraints failed; using native host",
    });
    return { overlays: [], diagnostics, driftedKeys, blocked: true };
  }
  return { base, overlays, diagnostics, driftedKeys, blocked: false };
}

export function composeModeSelection(
  selection: ModeSelection,
  modes: readonly ResolvedMode[],
  options: BuildSystemPromptOptions,
  assembledPrompt: string,
  policy: ResolutionPolicy = {},
): { prompt: string; resolved: ResolvedModeSelection } {
  const resolved = resolveModeSelection(selection, modes, policy);
  if (resolved.blocked) return { prompt: assembledPrompt, resolved };
  let prompt = assembledPrompt;
  if (resolved.base?.promptStrategy === "replace_base") {
    prompt = buildCustomBasePrompt(resolved.base.systemPrompt, options);
  } else if (resolved.base?.promptStrategy === "replace_final") {
    return { prompt: resolved.base.systemPrompt, resolved };
  }
  return { prompt: appendOverlaySections(prompt, resolved.overlays), resolved };
}

function appendOverlaySections(prompt: string, overlays: readonly ModeDefinition[]): string {
  if (overlays.length === 0) return prompt;
  return `${prompt}${overlays
    .map(
      (mode, index) =>
        `\n\n# Active prompt overlay ${index + 1}: ${mode.label}\n${mode.systemPrompt}`,
    )
    .join("")}`;
}

/** Mirrors Pi's documented custom-base branch: custom base + append + context + skills + date/cwd. */
export function buildCustomBasePrompt(
  customPrompt: string,
  options: BuildSystemPromptOptions,
  now = new Date(),
): string {
  let prompt = customPrompt;
  if (options.appendSystemPrompt) prompt += `\n\n${options.appendSystemPrompt}`;
  if (options.contextFiles && options.contextFiles.length > 0) {
    prompt += "\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n";
    for (const file of options.contextFiles) {
      prompt += `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>\n\n`;
    }
    prompt += "</project_context>\n";
  }
  const readAvailable = !options.selectedTools || options.selectedTools.includes("read");
  const visibleSkills = readAvailable
    ? (options.skills ?? []).filter((skill) => !skill.disableModelInvocation)
    : [];
  if (visibleSkills.length > 0) prompt += formatSkills(visibleSkills);
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  prompt += `\nCurrent date: ${date}`;
  prompt += `\nCurrent working directory: ${options.cwd.replace(/\\/g, "/")}`;
  return prompt;
}

function formatSkills(skills: NonNullable<BuildSystemPromptOptions["skills"]>): string {
  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill's file when the task matches its description.",
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];
  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }
  lines.push("</available_skills>");
  return lines.join("\n");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
