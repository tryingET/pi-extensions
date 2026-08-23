import {
  DEFAULT_MAX_BYTES,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createExplorePresentation,
  EXPLORE_OPERATOR_ENTRY_TYPE,
  type ExploreOperatorEntry,
  type ExplorePresentation,
  restoreExploreOperatorEntries,
} from "./explore-presentation.ts";
import {
  renderExploreCall,
  renderExploreOperatorEntry,
  renderExploreResult,
} from "./explore-renderer.ts";
import { type ExploreMode, validExplorePayload } from "./explore-result-validator.ts";
import { type SciBridge, type SciBridgeCallResult, SciMcpBridge } from "./mcp-bridge.ts";
import { sanitizeProducerDisclosure } from "./producer-disclosure.ts";
import { SCI_COMPOSITE_TOOL_SPECS, type SciCompositeToolName } from "./tool-definitions.ts";

export interface SemanticCodeExtensionOptions {
  bridgeFactory?: () => SciBridge;
}

export function createSemanticCodeExtension(options: SemanticCodeExtensionOptions = {}) {
  return function semanticCodeExtension(pi: ExtensionAPI): void {
    const bridge = options.bridgeFactory?.() ?? new SciMcpBridge();
    const retainedExplorePackets = new Map<string, ExploreOperatorEntry>();
    const retainExplorePacket = (entry: ExploreOperatorEntry): void => {
      retainedExplorePackets.delete(entry.toolCallId);
      retainedExplorePackets.set(entry.toolCallId, entry);
      while (retainedExplorePackets.size > 128) {
        const oldest = retainedExplorePackets.keys().next().value;
        if (typeof oldest !== "string") break;
        retainedExplorePackets.delete(oldest);
      }
    };
    const reconstructExplorePackets = (ctx: ExtensionContext): void => {
      retainedExplorePackets.clear();
      const restored = restoreExploreOperatorEntries(ctx.sessionManager.getBranch(), ctx.cwd);
      for (const entry of restored) retainExplorePacket(entry);
    };

    pi.registerEntryRenderer<ExploreOperatorEntry>(
      EXPLORE_OPERATOR_ENTRY_TYPE,
      (entry, { expanded }) => {
        const data = recordOrUndefined(entry.data);
        const toolCallId = typeof data?.toolCallId === "string" ? data.toolCallId : "";
        return renderExploreOperatorEntry(retainedExplorePackets.get(toolCallId), expanded);
      },
    );
    pi.on("session_start", async (_event, ctx) => reconstructExplorePackets(ctx));
    pi.on("session_tree", async (_event, ctx) => reconstructExplorePackets(ctx));

    for (const spec of SCI_COMPOSITE_TOOL_SPECS) {
      pi.registerTool({
        name: spec.name,
        label: spec.label,
        description: spec.description,
        promptSnippet: spec.description,
        promptGuidelines: [guidelineFor(spec.name)],
        parameters: spec.parameters,
        ...(spec.name === "explore_symbol_impact"
          ? {
              renderCall(args: unknown, _theme: unknown, context: { lastComponent?: unknown }) {
                return renderExploreCall(recordOrUndefined(args) ?? {}, context.lastComponent);
              },
              renderResult(
                result: { content: Array<{ type: string; text?: string }>; details?: unknown },
                renderOptions: { expanded: boolean; isPartial: boolean },
                _theme: unknown,
                context: { toolCallId: string; lastComponent?: unknown },
              ) {
                return renderExploreResult(
                  result,
                  renderOptions,
                  context.toolCallId,
                  retainedExplorePackets,
                  context.lastComponent,
                );
              },
            }
          : {}),
        async execute(toolCallId, params, signal, _onUpdate, ctx) {
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
          let result: SciBridgeCallResult;
          try {
            result = await bridge.callTool(spec.name, args, ctx.cwd, signal);
          } catch {
            throw new Error(
              `SCI workflow ${spec.name} failed. Backend diagnostics, paths, and stderr were withheld.`,
            );
          }
          if (result.isError) throw new Error(errorText(spec.name));

          const formatted = formatPiResult(
            spec.name,
            ctx.cwd,
            Date.now() - startedAt,
            result,
            args,
            toolCallId,
          );
          if (formatted.operatorEntry) {
            retainExplorePacket(formatted.operatorEntry);
            let persisted = false;
            try {
              pi.appendEntry(EXPLORE_OPERATOR_ENTRY_TYPE, formatted.operatorEntry);
              persisted = true;
            } catch {
              // The bounded in-memory operator view remains available for this runtime.
            }
            const presentation = recordOrUndefined(formatted.result.details.explorePresentation);
            if (presentation) {
              presentation.operatorDetailRetained = true;
              presentation.operatorDetailPersisted = persisted;
            }
          }
          return formatted.result;
        },
      });
    }

    pi.on("session_shutdown", async () => {
      retainedExplorePackets.clear();
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

type ProducerText = {
  text: string;
  truncated: boolean;
  sanitized: boolean;
  explore?: ExplorePresentation;
};

type FormattedPiResult = {
  result: {
    content: Array<{ type: "text"; text: string }>;
    details: Record<string, unknown>;
  };
  operatorEntry?: ExploreOperatorEntry;
};

function formatPiResult(
  workflow: SciCompositeToolName,
  workspace: string,
  elapsedMs: number,
  result: SciBridgeCallResult,
  args: Record<string, unknown>,
  toolCallId: string,
): FormattedPiResult {
  const producer = resultText(result, workflow, exploreMode(args), workspace, toolCallId);
  const details: Record<string, unknown> = {
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
    producerResultSanitized:
      producer.sanitized || workflow === "safe_write" || workflow === "structural_patch_checks",
    truncated: producer.truncated,
  };
  if (producer.explore) {
    details.explorePresentation = {
      ...producer.explore.summary,
      modelBytes: producer.explore.modelBytes,
      operatorBytes: producer.explore.operatorEntry.producerBytes,
      operatorDetailRetained: false,
      operatorDetailPersisted: false,
    };
  }
  return {
    result: {
      content: [{ type: "text", text: producer.text }],
      details,
    },
    ...(producer.explore ? { operatorEntry: producer.explore.operatorEntry } : {}),
  };
}

function resultText(
  result: SciBridgeCallResult,
  workflow: SciCompositeToolName,
  expectedMode: ExploreMode,
  workspace: string,
  toolCallId: string,
): ProducerText {
  const content = Array.isArray(result.content) ? result.content.slice(0, 32) : [];
  const textItem = content.find(
    (item) => item && typeof item === "object" && "text" in item && typeof item.text === "string",
  );
  return textItem && typeof textItem === "object" && "text" in textItem
    ? compactJsonText(String(textItem.text), workflow, expectedMode, workspace, toolCallId)
    : producerShapeFailure(
        workflow,
        "SCI producer returned no bounded text result; producer content was omitted.",
      );
}

function compactJsonText(
  text: string,
  workflow: SciCompositeToolName,
  expectedMode: ExploreMode,
  workspace: string,
  toolCallId: string,
): ProducerText {
  const observedBytes = Buffer.byteLength(text, "utf8");
  if (observedBytes > DEFAULT_MAX_BYTES) return producerOversizeFailure(workflow, observedBytes);
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!validProducerPayload(parsed, workflow, expectedMode)) {
      return producerShapeFailure(
        workflow,
        "SCI producer returned an invalid result shape; producer content was omitted.",
      );
    }
    const previewSanitized = workflow === "safe_write" || workflow === "structural_patch_checks";
    if (previewSanitized) sanitizePreviewOnlyPayload(parsed);
    const disclosure = sanitizeProducerDisclosure(parsed, workflow, workspace);
    if (!disclosure.ok) {
      return producerShapeFailure(
        workflow,
        "SCI producer result violated the native disclosure boundary; producer content was omitted.",
      );
    }
    if (workflow === "explore_symbol_impact" && !validExplorePayload(parsed, expectedMode)) {
      return producerShapeFailure(
        workflow,
        "SCI producer result changed to an invalid shape during disclosure sanitization; producer content was omitted.",
      );
    }
    if (workflow === "explore_symbol_impact") {
      const explore = createExplorePresentation(parsed, expectedMode, toolCallId);
      return explore
        ? {
            text: explore.modelText,
            truncated: false,
            sanitized: disclosure.changed,
            explore,
          }
        : producerShapeFailure(
            workflow,
            "SCI producer result could not be projected safely; producer content was omitted.",
          );
    }
    const compact = JSON.stringify(parsed);
    return Buffer.byteLength(compact, "utf8") > DEFAULT_MAX_BYTES
      ? producerOversizeFailure(workflow, Buffer.byteLength(compact, "utf8"))
      : {
          text: compact,
          truncated: false,
          sanitized: previewSanitized || disclosure.changed,
        };
  } catch {
    return producerShapeFailure(
      workflow,
      "SCI producer returned a non-JSON result; producer content was omitted.",
    );
  }
}

function validProducerPayload(
  value: unknown,
  workflow: SciCompositeToolName,
  expectedMode: ExploreMode,
): value is Record<string, unknown> {
  const record = recordOrUndefined(value);
  if (!record || typeof record.ok !== "boolean" || record.workflow !== workflow) return false;
  if (workflow === "explore_symbol_impact") return validExplorePayload(record, expectedMode);
  if (record.ok === false) return true;
  switch (workflow) {
    case "locate_confirm_definition":
      return validLocatePayload(record);
    case "safe_write":
      return record.applied === false && validValidationPlan(record.validationPlan);
    case "structural_patch_checks":
      return record.applied === false && recordOrUndefined(record.checks)?.ok === true;
    case "patch_checks_in_snapshot":
      return (
        typeof record.snapshot === "string" &&
        recordOrUndefined(record.stage)?.accepted === true &&
        validValidationPlan(record.validationPlan)
      );
    case "rename_safely":
      return (
        typeof record.snapshot === "string" &&
        typeof record.filesAffected === "number" &&
        typeof record.totalEdits === "number"
      );
  }
}

function validLocatePayload(record: Record<string, unknown>): boolean {
  if (
    typeof record.symbol !== "string" ||
    typeof record.decision !== "string" ||
    !Array.isArray(record.definitions) ||
    record.definitions.length === 0
  ) {
    return false;
  }
  return record.definitions.every((definition) => {
    const candidate = recordOrUndefined(definition);
    return candidate !== undefined && typeof candidate.uri === "string";
  });
}

function validValidationPlan(value: unknown): boolean {
  const plan = recordOrUndefined(value);
  return plan !== undefined && typeof plan.status === "string" && plan.status.length > 0;
}

function exploreMode(args: Record<string, unknown>): ExploreMode {
  return args.mode === "standard" || args.mode === "debug" ? args.mode : "compact";
}

function producerShapeFailure(workflow: SciCompositeToolName, message: string): ProducerText {
  return {
    text: JSON.stringify({ workflow, ok: false, status: "indeterminate", message }),
    truncated: false,
    sanitized: true,
  };
}

function producerOversizeFailure(
  workflow: SciCompositeToolName,
  observedBytes: number,
): ProducerText {
  return {
    text: JSON.stringify({
      workflow,
      ok: false,
      status: "indeterminate",
      message: "SCI result exceeded the native Pi output budget; producer content was omitted.",
      truncation: { applied: true, byteBudget: DEFAULT_MAX_BYTES, observedBytes },
    }),
    truncated: true,
    sanitized: true,
  };
}

function sanitizePreviewOnlyPayload(payload: Record<string, unknown>): void {
  payload.piBridge = {
    previewOnly: true,
    note: "Mutation is unavailable through this native Pi surface; inspect bounded evidence or use native exact edits after review.",
  };
  payload.next =
    "Inspect bounded evidence; mutation is unavailable through this native Pi surface.";
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

function errorText(name: SciCompositeToolName): string {
  return `SCI workflow ${name} returned an error. Producer diagnostics, paths, and stderr were withheld.`;
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
