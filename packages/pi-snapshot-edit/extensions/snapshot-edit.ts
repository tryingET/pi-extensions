// ---
// summary: "registers snapshot-bound read and edit tools, clipboard image lift, override, and release-smoke commands"
// read_when:
//   - "changing extension tool schemas, lifecycle hooks, clipboard image lift, or standard tool overrides"
// ---
import { StringEnum } from "@earendil-works/pi-ai";
import {
  type ExtensionAPI,
  type ExtensionContext,
  type ToolDefinition,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import { liftClipboardImages } from "../src/clipboard-image-attach.js";
import { runPackedReleaseSmoke } from "../src/release-smoke.js";
import { normalizeRevisionAlias, SnapshotEditService } from "../src/snapshot-service.js";

const LEGACY_TEXT_BASE = "__legacy_exact_text_requires_snapshot_read__";
const LEGACY_LINES_BASE = "__legacy_line_coordinates_require_snapshot_read__";
const OVERRIDE_ENV = "PI_SNAPSHOT_EDIT_OVERRIDE";
const OVERRIDE_OPT_OUT_VALUES = new Set(["0", "false", "off", "no"]);

const readParameters = Type.Object({
  path: Type.String({
    description: "File path, relative to the current working directory or absolute",
  }),
  offset: Type.Optional(
    Type.Integer({ minimum: 1, description: "First 1-indexed line to display" }),
  ),
  limit: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 2000, description: "Maximum lines to display" }),
  ),
});

const occurrence = Type.Optional(
  Type.Integer({
    minimum: 1,
    description: "1-indexed exact-match occurrence; omit only when the selector is unique",
  }),
);

const editOperation = Type.Union([
  Type.Object({
    op: StringEnum(["replace"] as const),
    oldText: Type.String({ minLength: 1, description: "Exact text selected in the base snapshot" }),
    occurrence,
    newText: Type.String({ description: "Literal replacement text; empty text deletes" }),
  }),
  Type.Object({
    op: StringEnum(["insert_after"] as const),
    anchorText: Type.String({
      minLength: 1,
      description: "Exact text whose selected occurrence supplies the insertion point",
    }),
    occurrence,
    newText: Type.String({ minLength: 1, description: "Literal text inserted after the anchor" }),
  }),
]);

const editParameters = Type.Object({
  path: Type.String({ description: "Same file path used with the corresponding snapshot read" }),
  base: Type.String({
    description:
      "Revision alias returned by the corresponding read; pass the bare word (for example 'amber') - a 'revision:' header prefix is also accepted",
  }),
  edits: Type.Array(editOperation, {
    minItems: 1,
    description:
      "Disjoint operations resolved against the same immutable base revision; each is op:'replace' with oldText/newText or op:'insert_after' with anchorText/newText ('op' may be omitted when oldText or anchorText uniquely implies it)",
  }),
});

type EditParams = Static<typeof editParameters>;

export function createSnapshotEditService() {
  return new SnapshotEditService({
    mutationQueue: (path, operation) => withFileMutationQueue(path, operation),
  });
}

function result(text: string, details: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text }], details };
}

function messageText(content: Array<{ type: string; text?: string }>) {
  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

function compactRenderText(text: string, expanded: boolean) {
  if (expanded) return text;
  const lines = text.split("\n");
  return lines.length <= 12 ? text : `${lines.slice(0, 12).join("\n")}\n…`;
}

function createReadDefinition(
  name: "read" | "snapshot_read",
  label: string,
  service: SnapshotEditService,
): ToolDefinition<typeof readParameters, unknown> {
  return {
    name,
    label,
    description:
      name === "read"
        ? "Read a local UTF-8 text file as raw text with one compact session-scoped revision header for standard snapshot editing. Unsupported inputs fail closed; reload to restore the built-in reader. Output is capped at 2000 lines or 50KB."
        : "Read raw UTF-8 text with one compact session-scoped revision header. The full file is snapshotted even when output is paginated. Output is capped at 2000 lines or 50KB.",
    promptSnippet:
      name === "read"
        ? "Read raw file text and obtain a revision for exact-selector edits"
        : "Read raw text and obtain a revision alias for exact-selector edits",
    promptGuidelines: [
      `Use ${name} before ${name === "read" ? "edit" : "snapshot_edit"}; copy exact selectors from the raw base text.`,
      `Treat ${name} revision words as opaque aliases; pagination remains bound to the full file.`,
      "If the user message already includes an image attachment or a clipboard <file name> marker, treat that image as a committed observation; do not read the PNG or cover with OCR.",
    ],
    parameters: readParameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx: ExtensionContext) {
      if (signal?.aborted) throw new Error(`${name} cancelled`);
      const readResult = await service.read(params, ctx.cwd);
      return result(readResult.text, readResult.details);
    },
    renderCall(args, theme) {
      return new Text(
        `${theme.fg("toolTitle", theme.bold(name))} ${theme.fg("muted", args.path ?? "")}`,
        0,
        0,
      );
    },
    renderResult(toolResult, options, theme) {
      const text = messageText(toolResult.content);
      return new Text(theme.fg("toolOutput", compactRenderText(text, options.expanded)), 0, 0);
    },
  };
}

function createEditDefinition(
  name: "edit" | "snapshot_edit",
  label: string,
  service: SnapshotEditService,
  acceptLegacyResume: boolean,
): ToolDefinition<typeof editParameters, Record<string, unknown>> {
  return {
    name,
    label,
    description:
      name === "edit"
        ? "Apply exact-text replacements and anchored insertions against an immutable revision returned by standard read. Unique selectors may omit occurrence; duplicates require a 1-indexed occurrence. A 'revision:' base prefix is accepted and a missing 'op' is inferred from oldText/anchorText. Detects stale bytes and file identity before atomic rename."
        : "Apply exact-text replacements and anchored insertions against an immutable snapshot_read revision. Unique selectors may omit occurrence; duplicates require a 1-indexed occurrence. A 'revision:' base prefix is accepted and a missing 'op' is inferred from oldText/anchorText. Uses Pi's per-file queue and atomic rename.",
    promptSnippet:
      name === "edit"
        ? "Apply snapshot-bound exact-selector edits to one file"
        : "Apply exact-selector edits against a snapshot_read revision",
    promptGuidelines: [
      `Use ${name} with the revision returned by ${name === "edit" ? "read" : "snapshot_read"}; pass the bare revision word as base and replace via oldText or insert via anchorText.`,
      `Omit occurrence only for a unique selector; otherwise provide its 1-indexed exact occurrence.`,
      `All operations resolve against one immutable base revision; do not account for earlier operations in the batch.`,
      `On an unknown, expired, stale, or invalid selector, read the file again instead of guessing or rebasing.`,
      `Keep replacements and insertion points disjoint; insertion on a replacement boundary is rejected.`,
    ],
    parameters: editParameters,
    prepareArguments: acceptLegacyResume ? prepareStandardEditArguments : normalizeEditArguments,
    async execute(_toolCallId, params, signal, _onUpdate, ctx: ExtensionContext) {
      if (signal?.aborted) throw new Error(`${name} cancelled`);
      if (params.base === LEGACY_TEXT_BASE) {
        throw new Error(
          "This resumed top-level edit call uses the retired schema. Call read again, then retry with {path, base, edits:[{op:'replace', oldText, occurrence?, newText}] }.",
        );
      }
      if (params.base === LEGACY_LINES_BASE) {
        throw new Error(
          "This resumed edit call uses retired line coordinates. Call read again, then retry with exact oldText or anchorText selectors from the raw snapshot.",
        );
      }
      const editResult = await service.edit(params, ctx.cwd, signal);
      return result(editResult.text, editResult.details);
    },
    renderCall(args, theme) {
      const count = Array.isArray(args.edits) ? args.edits.length : 0;
      return new Text(
        `${theme.fg("toolTitle", theme.bold(name))} ${theme.fg("muted", args.path ?? "")} ${theme.fg("dim", `${count} operation(s)`)}`,
        0,
        0,
      );
    },
    renderResult(toolResult, options, theme) {
      const text = messageText(toolResult.content);
      return new Text(theme.fg("toolOutput", compactRenderText(text, options.expanded)), 0, 0);
    },
  };
}

function prepareLegacyEditArguments(args: unknown): EditParams {
  if (!args || typeof args !== "object") return args as EditParams;
  const input = args as {
    path?: unknown;
    oldText?: unknown;
    newText?: unknown;
    edits?: Array<{ startLine?: unknown; endLine?: unknown }>;
  };
  const topLevelLegacy = typeof input.oldText === "string" && typeof input.newText === "string";
  const resumedLines =
    Array.isArray(input.edits) &&
    input.edits.some(
      (operation) =>
        operation !== null &&
        typeof operation === "object" &&
        ("startLine" in operation || "endLine" in operation),
    );
  if (!topLevelLegacy && !resumedLines) return args as EditParams;
  return {
    path: typeof input.path === "string" ? input.path : "",
    base: topLevelLegacy ? LEGACY_TEXT_BASE : LEGACY_LINES_BASE,
    edits: [{ op: "replace", oldText: "legacy", newText: "" }],
  };
}

/**
 * Runs before host schema validation (agent-loop prepareToolCallArguments), so it
 * removes deterministic caller slips instead of failing them: strip the rendered
 * 'revision:' header prefix from base, and infer a missing 'op' when exactly one
 * selector field (oldText or anchorText) is present. Ambiguous shapes are left
 * untouched so schema validation still fails closed.
 */
function normalizeEditArguments(args: unknown): EditParams {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args as EditParams;
  const input = args as Record<string, unknown>;
  let changed = false;
  const next: Record<string, unknown> = { ...input };

  if (typeof input.base === "string") {
    const normalizedBase = normalizeRevisionAlias(input.base);
    if (normalizedBase !== input.base) {
      next.base = normalizedBase;
      changed = true;
    }
  }

  if (Array.isArray(input.edits)) {
    const normalizedEdits = input.edits.map((operation) => {
      if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
        return operation;
      }
      const edit = operation as Record<string, unknown>;
      if (typeof edit.op === "string" && edit.op.length > 0) return operation;
      const hasOldText = typeof edit.oldText === "string";
      const hasAnchorText = typeof edit.anchorText === "string";
      if (hasOldText === hasAnchorText) return operation;
      changed = true;
      return { ...edit, op: hasOldText ? "replace" : "insert_after" };
    });
    if (changed) next.edits = normalizedEdits;
  }

  return changed ? (next as EditParams) : (args as EditParams);
}

function prepareStandardEditArguments(args: unknown): EditParams {
  const legacy = prepareLegacyEditArguments(args);
  if (legacy !== args) return legacy;
  return normalizeEditArguments(args);
}

function inspectStandardOwners(pi: ExtensionAPI): { missing: string[] } {
  const standardTools = pi
    .getAllTools()
    .filter((tool) => tool.name === "read" || tool.name === "edit");
  const conflicts = standardTools
    .filter((tool) => tool.sourceInfo.source !== "builtin")
    .map((tool) => `${tool.name}:${tool.sourceInfo.source}`);
  if (conflicts.length > 0) {
    throw new Error(
      `Refusing snapshot read/edit override because non-built-in owners are active: ${conflicts.join(", ")}`,
    );
  }
  return {
    missing: ["read", "edit"].filter(
      (name) =>
        !standardTools.some((tool) => tool.name === name && tool.sourceInfo.source === "builtin"),
    ),
  };
}

export default function snapshotEditExtension(pi: ExtensionAPI) {
  const service = createSnapshotEditService();
  let overrideInstalled = false;

  pi.registerFlag("snapshot-edit-override", {
    description: "Explicitly activate snapshot-owned standard read/edit for this Pi process",
    type: "boolean",
    default: false,
  });

  type RegisteredTool =
    | ReturnType<typeof createReadDefinition>
    | ReturnType<typeof createEditDefinition>;
  const registeredTools = new Map<string, RegisteredTool>();
  const snapshotRead = createReadDefinition("snapshot_read", "Snapshot Read", service);
  const snapshotEdit = createEditDefinition("snapshot_edit", "Snapshot Edit", service, false);
  registeredTools.set(snapshotRead.name, snapshotRead);
  registeredTools.set(snapshotEdit.name, snapshotEdit);
  pi.registerTool(snapshotRead);
  pi.registerTool(snapshotEdit);

  const installStandardOverrides = ({
    activate = false,
    requireOwners = activate,
  }: {
    activate?: boolean;
    requireOwners?: boolean;
  } = {}) => {
    const wasInstalled = overrideInstalled;
    if (!overrideInstalled) {
      const ownerInspection = inspectStandardOwners(pi);
      if (ownerInspection.missing.length > 0) {
        const missingOwners = ownerInspection.missing.join(" and ");
        if (requireOwners) {
          throw new Error(
            `Refusing snapshot override without positively identified built-in ${missingOwners} owner(s)`,
          );
        }
        return {
          installed: false,
          activated: false,
          available: false,
          reason: `namespaced-only because the host tool selection omits built-in ${missingOwners}`,
        };
      }
      const standardRead = createReadDefinition("read", "Read", service);
      const standardEdit = createEditDefinition("edit", "Edit", service, true);
      registeredTools.set(standardRead.name, standardRead);
      registeredTools.set(standardEdit.name, standardEdit);
      pi.registerTool(standardRead);
      pi.registerTool(standardEdit);
      overrideInstalled = true;
    }
    let activated = false;
    if (activate) {
      const currentTools = pi.getActiveTools();
      const nextTools = [...new Set([...currentTools, "read", "edit"])];
      activated = nextTools.length !== currentTools.length;
      pi.setActiveTools(nextTools);
    }
    return {
      installed: !wasInstalled,
      activated,
      available: true,
      reason: activate
        ? "local snapshot override active and standard tools enabled"
        : "local snapshot override active with host tool selection preserved",
    };
  };

  pi.registerCommand("snapshot-edit-release-smoke", {
    description: "Internal packed-artifact release smoke (environment gated)",
    handler: async () => {
      if (process.env.PI_SNAPSHOT_EDIT_RELEASE_SMOKE !== "1") {
        throw new Error("snapshot-edit release smoke is disabled");
      }
      const phase = process.env.PI_SNAPSHOT_EDIT_RELEASE_SMOKE_PHASE ?? "";
      const summary = await runPackedReleaseSmoke({
        phase,
        snapshotRead,
        snapshotEdit,
        installStandardOverrides,
        getTool: (name: string) => registeredTools.get(name),
        getAllToolNames: () => pi.getAllTools().map((tool) => tool.name),
        getActiveTools: () => pi.getActiveTools(),
        clear: () => service.clear(),
      });
      console.log(`snapshot-edit packed release smoke ${phase} OK: ${summary}`);
    },
  });

  pi.registerCommand("snapshot-edit", {
    description: "Snapshot edit status; actions: override, clear",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "override") {
        const installed = installStandardOverrides({ activate: true, requireOwners: true });
        if (ctx.hasUI) {
          ctx.ui.notify(
            installed.installed || installed.activated
              ? "Snapshot protocol owns and has enabled standard read/edit for this session. Restart with PI_SNAPSHOT_EDIT_OVERRIDE=off for namespaced-only operation."
              : "Snapshot read/edit override was already active and enabled.",
            "info",
          );
        }
        return;
      }
      if (action === "clear") {
        service.clear();
        if (ctx.hasUI) ctx.ui.notify("Cleared snapshot-edit revisions", "info");
        return;
      }
      const stats = service.stats();
      if (ctx.hasUI) {
        ctx.ui.notify(
          `snapshot-edit: ${stats.count} revision(s), ${stats.bytes} retained byte(s), standard override ${overrideInstalled ? "active" : "inactive"}.`,
          "info",
        );
      }
    },
  });

  pi.on("session_start", async () => {
    const overrideValue = process.env[OVERRIDE_ENV]?.trim().toLowerCase();
    if (overrideValue !== undefined && OVERRIDE_OPT_OUT_VALUES.has(overrideValue)) return;
    const explicitlyEnabled =
      overrideValue === "1" || pi.getFlag("snapshot-edit-override") === true;
    installStandardOverrides({
      activate: explicitlyEnabled,
      requireOwners: explicitlyEnabled,
    });
  });

  pi.on("session_shutdown", async () => {
    service.clear();
  });

  pi.on("input", async (event) => {
    const lifted = await liftClipboardImages(event.text, event.images);
    if (!lifted.changed) return;
    return { action: "transform", text: lifted.text, images: lifted.images };
  });
}
