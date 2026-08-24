import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export const SCI_COMPOSITE_TOOL_NAMES = [
  "explore_symbol_impact",
  "locate_confirm_definition",
  "patch_checks_in_snapshot",
  "structural_patch_checks",
  "rename_safely",
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
    name: "patch_checks_in_snapshot",
    label: "SCI Patch Checks in Snapshot",
    description:
      "PREFERRED one Pi door for a prepared unified diff: stage in a snapshot and run checks. Preview only. Apply only via rename_safely or snapshot apply when the operator explicitly asks; never apply_rename. Does not edit the working tree.",
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
