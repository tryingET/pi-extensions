import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// Exact SCI workflow names (producer contract): these are the names the bridge calls and
// the names producer results carry under `workflow`. They must never be renamed Pi-side.
export const SCI_COMPOSITE_TOOL_NAMES = [
  "explore_symbol_impact",
  "locate_confirm_definition",
  "patch_checks_in_snapshot",
  "structural_patch_checks",
  "rename_safely",
] as const;

export type SciCompositeToolName = (typeof SCI_COMPOSITE_TOOL_NAMES)[number];

// Pi-facing door names. One preview door (preview_patch_checks) routes to the two
// patch workflows so the model has exactly one patch surface to choose.
export type PiSciDoorName = SciCompositeToolName | "preview_patch_checks";

export type PiToolDefinition = Parameters<ExtensionAPI["registerTool"]>[0];

const commands = Type.Optional(
  Type.Array(Type.String(), {
    maxItems: 20,
    description: "Exact validation commands to run inside the SCI snapshot workspace.",
  }),
);

const timeoutSec = Type.Optional(
  Type.Number({
    minimum: 1,
    maximum: 600,
    description: "Per-command timeout in seconds.",
  }),
);

export interface SciRoute {
  /** Exact SCI workflow this route calls. */
  workflow: SciCompositeToolName;
  /** Human mode name accepted by the door's optional `mode` argument. */
  mode: "patch" | "structural";
  /** Parameter subset compared against this workflow's advertised schema. */
  parameters: PiToolDefinition["parameters"];
  /** True when the args select this route. */
  matches: (args: Record<string, unknown>) => boolean;
  /** Forward only this route's keys to the producer. */
  route: (args: Record<string, unknown>) => Record<string, unknown>;
}

export interface CompositeToolSpec {
  /** Pi-facing door name (not necessarily an SCI workflow name). */
  name: PiSciDoorName;
  label: string;
  description: string;
  parameters: PiToolDefinition["parameters"];
  profile: "read" | "mutating";
  /** Preview-only door: the apply argument is rejected before bridging. */
  previewOnly?: boolean;
  /** Routing table; absent means the door is a passthrough for spec.name. */
  routes?: readonly SciRoute[];
}

// Route-level parameters keep required fields (they are compared against each workflow's
// advertised schema). Door-level parameters make the mode keys optional: exactly-one-mode
// is enforced fail-closed by resolveSciRoute, and a JSON-schema-required union would be
// unsatisfiable for any single-mode call (caught live in dogfooding, 2026-08-27).
const patchModeParameters = {
  patch: Type.Optional(Type.String({ description: "Unified diff to stage and validate." })),
  snapshot: Type.Optional(
    Type.String({ description: "Existing SCI snapshot id, if continuing one." }),
  ),
  recommendChecks: Type.Optional(Type.Boolean({ default: false })),
  impactSummary: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  onlyTouched: Type.Optional(Type.Boolean({ default: false })),
};

const structuralModeParameters = {
  language: Type.Optional(
    Type.String({ description: "ast-grep language, for example typescript or python." }),
  ),
  pattern: Type.Optional(Type.String({ description: "ast-grep match pattern." })),
  rewrite: Type.Optional(Type.String({ description: "ast-grep rewrite template." })),
  paths: Type.Optional(
    Type.Array(Type.String(), { description: "Repo-relative files or directories." }),
  ),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1, maximum: 600_000 })),
  maxBuffer: Type.Optional(Type.Number({ minimum: 1 })),
  maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 2000, default: 200 })),
};

const sharedParameters = { commands, timeoutSec };

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const patchRoute: SciRoute = {
  workflow: "patch_checks_in_snapshot",
  mode: "patch",
  parameters: Type.Object({
    patch: Type.String({ description: "Unified diff to stage and validate." }),
    snapshot: patchModeParameters.snapshot,
    recommendChecks: patchModeParameters.recommendChecks,
    impactSummary: patchModeParameters.impactSummary,
    onlyTouched: patchModeParameters.onlyTouched,
    ...sharedParameters,
  }),
  matches: (args) => isNonEmptyString(args.patch),
  route: (args) => {
    const routed: Record<string, unknown> = {};
    for (const key of [
      "patch",
      "snapshot",
      "recommendChecks",
      "impactSummary",
      "onlyTouched",
      "commands",
      "timeoutSec",
    ]) {
      if (Object.hasOwn(args, key)) routed[key] = args[key];
    }
    return routed;
  },
};

const structuralRoute: SciRoute = {
  workflow: "structural_patch_checks",
  mode: "structural",
  parameters: Type.Object({
    language: Type.String({ description: "ast-grep language, for example typescript or python." }),
    pattern: Type.String({ description: "ast-grep match pattern." }),
    rewrite: Type.String({ description: "ast-grep rewrite template." }),
    paths: structuralModeParameters.paths,
    timeoutMs: structuralModeParameters.timeoutMs,
    maxBuffer: structuralModeParameters.maxBuffer,
    maxResults: structuralModeParameters.maxResults,
    ...sharedParameters,
  }),
  matches: (args) =>
    isNonEmptyString(args.language) &&
    isNonEmptyString(args.pattern) &&
    isNonEmptyString(args.rewrite),
  route: (args) => {
    const routed: Record<string, unknown> = {};
    for (const key of [
      "language",
      "pattern",
      "rewrite",
      "paths",
      "commands",
      "timeoutSec",
      "timeoutMs",
      "maxBuffer",
      "maxResults",
    ]) {
      if (Object.hasOwn(args, key)) routed[key] = args[key];
    }
    return routed;
  },
};

export const SCI_COMPOSITE_TOOL_SPECS: readonly CompositeToolSpec[] = [
  {
    name: "explore_symbol_impact",
    label: "SCI Explore Symbol Impact",
    description:
      "PREFERRED first call for unfamiliar code changes involving a symbol. Skip locate_confirm_definition when this returns definitionConfirmed. compact returns a concise decision projection; standard adds selected normalized evidence; debug adds a bounded labelled diagnostic summary. The full validated and sanitized producer packet, including debug raw fragments, is available only in the expanded TUI operator view. Producer standard details are capped at 24 KiB, debug details at 36 KiB, and complete packets at 48 KiB. Do not manually chain search/definition/reference primitives unless this result is insufficient.",
    profile: "read",
    parameters: Type.Object({
      symbol: Type.String({ description: "Symbol to investigate." }),
      file: Type.Optional(Type.String({ description: "Repo-relative context file when known." })),
      precise: Type.Optional(Type.Boolean({ default: true })),
      depth: Type.Optional(Type.Number({ minimum: 1, maximum: 5, default: 1 })),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200, default: 50 })),
      mode: Type.Optional(
        StringEnum(["compact", "standard", "debug"] as const, {
          default: "compact",
          description:
            "compact: concise decision projection; standard: selected normalized evidence; debug: standard plus a bounded diagnostic summary, with validated raw detail retained only for the expanded TUI; complete producer packets remain under 48 KiB.",
        }),
      ),
    }),
  },
  {
    name: "locate_confirm_definition",
    label: "SCI Locate and Confirm Definition",
    description:
      "PREFERRED only when explore_symbol_impact did not confirm the definition, or you never ran explore. Skip when explore already returned definitionConfirmed.",
    profile: "read",
    parameters: Type.Object({
      symbol: Type.String({ description: "Symbol whose definition must be confirmed." }),
      file: Type.Optional(Type.String({ description: "Repo-relative context file when known." })),
      precise: Type.Optional(Type.Boolean({ default: true })),
      maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 200, default: 50 })),
    }),
  },
  {
    name: "preview_patch_checks",
    label: "SCI Preview Patch Checks",
    description:
      "PREFERRED one Pi preview door for any code-change diff. Provide EITHER a prepared unified diff (patch) OR a structural rewrite (language + pattern + rewrite) — never both, never neither. The change is staged in an SCI snapshot and checks run there. Preview only: it does not edit the working tree. Apply only via rename_safely or snapshot apply when the operator explicitly asks; never apply_rename.",
    profile: "mutating",
    previewOnly: true,
    parameters: Type.Object({
      ...patchModeParameters,
      ...structuralModeParameters,
      ...sharedParameters,
      mode: Type.Optional(
        StringEnum(["patch", "structural"] as const, {
          description:
            "Explicit input mode. patch: stage the unified diff in patch. structural: generate an ast-grep rewrite diff from language/pattern/rewrite. Optional — the input shape selects the mode; conflicting shapes fail closed.",
        }),
      ),
    }),
    routes: [patchRoute, structuralRoute],
  },
  {
    name: "rename_safely",
    label: "SCI Rename Safely",
    description:
      "PREFERRED one Pi door for symbol renames. Preview first in a snapshot. Apply only through this workflow or snapshot apply when the operator explicitly asks; never apply_rename or search/replace.",
    profile: "mutating",
    parameters: Type.Object({
      oldName: Type.String({ description: "Original symbol name." }),
      newName: Type.String({ description: "Replacement symbol name." }),
      file: Type.Optional(Type.String({ description: "Repo-relative context file when known." })),
      commands,
      timeoutSec,
      runChecks: Type.Optional(Type.Boolean({ default: true })),
    }),
  },
] as const;

/**
 * Resolve a door call to its exact SCI workflow. Exactly one route must match;
 * zero or multiple matches fail closed before any bridge call.
 */
export function resolveSciRoute(
  spec: CompositeToolSpec,
  args: Record<string, unknown>,
): { workflow: SciCompositeToolName; args: Record<string, unknown> } | { error: string } {
  if (!spec.routes) {
    // Passthrough door: its name is exactly the SCI workflow it calls.
    const workflow = spec.name as SciCompositeToolName;
    return { workflow, args };
  }
  const matched = spec.routes.filter((route) => route.matches(args));
  if (matched.length === 0) {
    return {
      error:
        "preview_patch_checks requires exactly one input mode: a prepared unified diff (patch) or a structural rewrite (language + pattern + rewrite).",
    };
  }
  if (matched.length > 1) {
    return {
      error:
        "preview_patch_checks received both a unified diff and a structural rewrite; provide exactly one input mode.",
    };
  }
  const route = matched[0];
  const declared = args.mode;
  if (declared !== undefined && declared !== route.mode) {
    return {
      error:
        "preview_patch_checks received a mode that conflicts with the provided input shape; provide exactly one input mode.",
    };
  }
  return { workflow: route.workflow, args: route.route(args) };
}
