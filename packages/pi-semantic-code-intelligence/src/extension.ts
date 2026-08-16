import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  type ExtensionAPI,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";

import { type SciBridge, type SciBridgeCallResult, SciMcpBridge } from "./mcp-bridge.ts";
import { SCI_COMPOSITE_TOOL_SPECS, type SciCompositeToolName } from "./tool-definitions.ts";

export interface SemanticCodeExtensionOptions {
  bridgeFactory?: () => SciBridge;
}

export function createSemanticCodeExtension(options: SemanticCodeExtensionOptions = {}) {
  return function semanticCodeExtension(pi: ExtensionAPI): void {
    const bridge = options.bridgeFactory?.() ?? new SciMcpBridge();

    for (const spec of SCI_COMPOSITE_TOOL_SPECS) {
      pi.registerTool({
        name: spec.name,
        label: spec.label,
        description: spec.description,
        promptSnippet: spec.description,
        promptGuidelines: [guidelineFor(spec.name)],
        parameters: spec.parameters,
        async execute(_toolCallId, params, signal, _onUpdate, ctx) {
          const args = params as Record<string, unknown>;
          if (
            (spec.name === "safe_write" || spec.name === "structural_patch_checks") &&
            Object.hasOwn(args, "apply")
          ) {
            throw new Error(
              `${spec.name} is preview-only in Pi; the apply argument is not accepted.`,
            );
          }
          const startedAt = Date.now();
          const result = await bridge.callTool(spec.name, args, ctx.cwd, signal);
          if (result.isError) throw new Error(errorText(spec.name, result));

          return formatPiResult(spec.name, Date.now() - startedAt, result);
        },
      });
    }

    pi.on("session_shutdown", async () => {
      await bridge.close();
    });
  };
}

export default createSemanticCodeExtension();

function guidelineFor(name: SciCompositeToolName): string {
  switch (name) {
    case "explore_symbol_impact":
      return "Use explore_symbol_impact before raw search/read chains when a code task involves an unfamiliar symbol or uncertain impact; use bounded native reads after it identifies relevant files.";
    case "locate_confirm_definition":
      return "Use locate_confirm_definition instead of guessing a symbol definition; use native read after SCI returns candidates.";
    case "rename_safely":
      return "Use rename_safely instead of ad-hoc cross-file search/replace for symbol renames.";
    case "structural_patch_checks":
      return "Use structural_patch_checks for syntax-shaped transformations; this native Pi surface is preview-only.";
    case "patch_checks_in_snapshot":
      return "Use patch_checks_in_snapshot to validate a prepared diff without editing the working tree.";
    case "safe_write":
      return "Use safe_write as the normal patch preview/check path; this native Pi surface is preview-only.";
  }
}

function formatPiResult(
  workflow: SciCompositeToolName,
  elapsedMs: number,
  result: SciBridgeCallResult,
) {
  const rawText = resultText(result, workflow);
  const truncation = truncateHead(rawText, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES,
  });
  let text = truncation.content;
  if (truncation.truncated) {
    text += `\n\n[SCI result truncated: ${truncation.outputLines}/${truncation.totalLines} lines, ${formatSize(truncation.outputBytes)}/${formatSize(truncation.totalBytes)}.]`;
  }

  return {
    content: [{ type: "text" as const, text }],
    details: {
      schema: "pi.sci_composite_call.v1",
      workflow,
      transport: "mcp-stdio",
      schemaCompatibility: "verified_on_connect",
      elapsedMs,
      utilization: {
        sciCompositeCalls: [workflow],
        nativeFallbacks: [],
        rawShellAvoided: avoidedPrimitiveChain(workflow),
      },
      producerResultSanitized: workflow === "safe_write" || workflow === "structural_patch_checks",
      truncated: truncation.truncated,
    },
  };
}

function resultText(result: SciBridgeCallResult, workflow?: SciCompositeToolName): string {
  const content = Array.isArray(result.content) ? result.content : [];
  const parts = content.map((item) => {
    if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
      return compactJsonText(item.text, workflow);
    }
    return JSON.stringify(item);
  });
  return parts.length > 0 ? parts.join("\n") : JSON.stringify(result);
}

function compactJsonText(text: string, workflow?: SciCompositeToolName): string {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (workflow === "safe_write" || workflow === "structural_patch_checks") {
      sanitizePreviewOnlyPayload(parsed);
    }
    return JSON.stringify(parsed);
  } catch {
    return text;
  }
}

function sanitizePreviewOnlyPayload(payload: Record<string, unknown>): void {
  payload.piBridge = {
    previewOnly: true,
    note: "This native Pi surface does not accept apply; inspect snapshot evidence or use native exact edits after review.",
  };
  payload.next = "Inspect snapshot evidence; apply is unavailable through this native Pi surface.";
  payload.next_actions = ["Inspect the snapshot diff and validation evidence."];
  stripRollbackCommand(payload.rollback);
  const validationPlan = recordOrUndefined(payload.validationPlan);
  if (validationPlan) stripRollbackCommand(validationPlan.rollback);
}

function stripRollbackCommand(value: unknown): void {
  const record = recordOrUndefined(value);
  if (record) delete record.command;
}

function recordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function errorText(name: SciCompositeToolName, result: SciBridgeCallResult): string {
  return `SCI workflow ${name} returned an error: ${resultText(result, name)}`;
}

function avoidedPrimitiveChain(name: SciCompositeToolName): string[] {
  switch (name) {
    case "explore_symbol_impact":
      return ["definition lookup", "AST symbol map", "graph expansion"];
    case "locate_confirm_definition":
      return ["fast definition lookup", "manual ambiguity check", "precise retry"];
    case "patch_checks_in_snapshot":
      return ["snapshot creation", "patch staging", "check execution", "evidence assembly"];
    case "structural_patch_checks":
      return ["structural search", "rewrite diff generation", "snapshot checks"];
    case "rename_safely":
      return ["reference search", "rename planning", "snapshot checks"];
    case "safe_write":
      return ["snapshot creation", "patch staging", "check execution", "rollback evidence"];
  }
}
