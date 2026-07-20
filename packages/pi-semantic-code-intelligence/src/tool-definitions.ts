import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export const SCI_COMPOSITE_TOOL_NAMES = [
  "explore_symbol_impact",
  "locate_confirm_definition",
  "patch_checks_in_snapshot",
  "structural_patch_checks",
  "rename_safely",
  "safe_write",
] as const;

export type SciCompositeToolName = (typeof SCI_COMPOSITE_TOOL_NAMES)[number];
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

export interface CompositeToolSpec {
  name: SciCompositeToolName;
  label: string;
  description: string;
  parameters: PiToolDefinition["parameters"];
  profile: "read" | "mutating";
}

export const SCI_COMPOSITE_TOOL_SPECS: readonly CompositeToolSpec[] = [
  {
    name: "explore_symbol_impact",
    label: "SCI Explore Symbol Impact",
    description:
      "PREFERRED first call for unfamiliar code changes involving a symbol. Combines definition lookup, AST symbol mapping, and graph-neighbor impact. Do not manually chain search/definition/reference primitives unless this result is insufficient.",
    profile: "read",
    parameters: Type.Object({
      symbol: Type.String({ description: "Symbol to investigate." }),
      file: Type.Optional(Type.String({ description: "Repo-relative context file when known." })),
      precise: Type.Optional(Type.Boolean({ default: true })),
      depth: Type.Optional(Type.Number({ minimum: 1, maximum: 5, default: 1 })),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200, default: 50 })),
    }),
  },
  {
    name: "locate_confirm_definition",
    label: "SCI Locate and Confirm Definition",
    description:
      "PREFERRED first call when a symbol definition is uncertain. Performs fast lookup and a precise retry when ambiguous. Use native read only after the relevant definition candidates are known.",
    profile: "read",
    parameters: Type.Object({
      symbol: Type.String({ description: "Symbol whose definition must be confirmed." }),
      file: Type.Optional(Type.String({ description: "Repo-relative context file when known." })),
      precise: Type.Optional(Type.Boolean({ default: true })),
      maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 200, default: 50 })),
    }),
  },
  {
    name: "patch_checks_in_snapshot",
    label: "SCI Patch Checks in Snapshot",
    description:
      "PREFERRED one-call validation for a prepared unified diff. Stages the patch in an SCI snapshot, runs exact checks, and returns diff/check/evidence without editing the working tree.",
    profile: "mutating",
    parameters: Type.Object({
      patch: Type.String({ description: "Unified diff to stage and validate." }),
      snapshot: Type.Optional(
        Type.String({ description: "Existing SCI snapshot id, if continuing one." }),
      ),
      commands,
      recommendChecks: Type.Optional(Type.Boolean({ default: false })),
      impactSummary: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      onlyTouched: Type.Optional(Type.Boolean({ default: false })),
      timeoutSec,
    }),
  },
  {
    name: "structural_patch_checks",
    label: "SCI Structural Patch Checks",
    description:
      "PREFERRED one-call path for structural transformations. Generates an ast-grep rewrite diff, stages it in a snapshot, and runs checks. This Pi surface is preview-only and does not expose SCI's apply parameter.",
    profile: "mutating",
    parameters: Type.Object({
      language: Type.String({
        description: "ast-grep language, for example typescript or python.",
      }),
      pattern: Type.String({ description: "ast-grep match pattern." }),
      rewrite: Type.String({ description: "ast-grep rewrite template." }),
      paths: Type.Optional(
        Type.Array(Type.String(), { description: "Repo-relative files or directories." }),
      ),
      commands,
      timeoutSec,
      timeoutMs: Type.Optional(Type.Number({ minimum: 1, maximum: 600_000 })),
      maxBuffer: Type.Optional(Type.Number({ minimum: 1 })),
      maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 2000, default: 200 })),
    }),
  },
  {
    name: "rename_safely",
    label: "SCI Rename Safely",
    description:
      "PREFERRED one-call path for symbol renames. Plans the cross-file rename in a snapshot and optionally runs checks. Avoid ad-hoc search/replace unless this workflow cannot represent the change.",
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
  {
    name: "safe_write",
    label: "SCI Safe Write",
    description:
      "PREFERRED one-call patch preview/check path. Stages a unified diff, runs checks, and returns validation/rollback evidence. This Pi surface is preview-only and does not expose SCI's apply parameter.",
    profile: "mutating",
    parameters: Type.Object({
      patch: Type.String({ description: "Unified diff to stage and validate." }),
      snapshot: Type.Optional(
        Type.String({ description: "Existing SCI snapshot id, if continuing one." }),
      ),
      commands,
      recommendChecks: Type.Optional(Type.Boolean({ default: false })),
      impactSummary: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      timeoutSec,
      brief: Type.Optional(Type.Boolean({ default: false })),
    }),
  },
] as const;
