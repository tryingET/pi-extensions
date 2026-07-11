import { StringEnum } from "@earendil-works/pi-ai";
import {
  type ExtensionAPI,
  type ExtensionContext,
  type ToolDefinition,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import { SnapshotEditService } from "../src/snapshot-service.js";

const LEGACY_BASE = "__legacy_exact_text_requires_snapshot_read__";
const OVERRIDE_ENV = "PI_SNAPSHOT_EDIT_OVERRIDE";

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

const editOperation = Type.Object({
  op: StringEnum(["replace", "insert_after"] as const, {
    description: "replace an inclusive base line range, or insert_after startLine",
  }),
  startLine: Type.Integer({
    minimum: 0,
    description: "Base revision line. replace requires >=1; insert_after accepts 0 for file start.",
  }),
  endLine: Type.Optional(
    Type.Integer({ minimum: 1, description: "Inclusive base revision end line for replace" }),
  ),
  newText: Type.String({
    description: "Literal replacement or insertion text; empty replace text deletes",
  }),
});

const editParameters = Type.Object({
  path: Type.String({ description: "Same file path used with the corresponding snapshot read" }),
  base: Type.String({ description: "Compact revision alias returned by the corresponding read" }),
  edits: Type.Array(editOperation, {
    minItems: 1,
    description: "Disjoint operations resolved against the same immutable base revision",
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
        ? "Read a local UTF-8 text file with 1-indexed lines and a compact session-scoped revision for the standard snapshot edit protocol. Unsupported inputs fail closed; reload to restore the authoritative built-in reader. Output is capped at 2000 lines or 50KB."
        : "Read UTF-8 text with 1-indexed line numbers and create a compact session-scoped revision alias. The full file is snapshotted even when output is paginated. Output is capped at 2000 lines or 50KB.",
    promptSnippet:
      name === "read"
        ? "Read files and obtain snapshot revisions for unambiguous line-range edits"
        : "Read a text file and obtain a revision alias for unambiguous line-range edits",
    promptGuidelines: [
      `Use ${name} before ${name === "read" ? "edit" : "snapshot_edit"}; line numbers are coordinates in the returned base revision.`,
      `Treat ${name} revision words as opaque aliases, not file content or checksums.`,
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
        ? "Apply disjoint line-range edits against a revision returned by standard read. Duplicate source text is valid because selection uses base line coordinates. Detects stale bytes and file identity before atomic rename, but cannot exclude non-cooperating cross-process writers."
        : "Apply disjoint line-range edits against an immutable snapshot_read revision using Pi's per-file queue and atomic rename. Duplicate source text is valid because selection uses base line coordinates. Detects stale bytes and file identity before commit, but cannot exclude non-cooperating cross-process writers.",
    promptSnippet:
      name === "edit"
        ? "Apply snapshot-bound line-range edits to one file"
        : "Apply unambiguous line-range edits against a snapshot_read revision",
    promptGuidelines: [
      `Use ${name} with the revision returned by ${name === "edit" ? "read" : "snapshot_read"}; do not use oldText/newText matching.`,
      `All ${name} operations use coordinates from one base revision; do not adjust later ranges for earlier edits.`,
      `On an unknown, expired, or stale ${name} revision, read the file again instead of guessing or retrying unchanged arguments.`,
      `Keep ${name} ranges disjoint; merge touching or overlapping changes into one operation.`,
    ],
    parameters: editParameters,
    prepareArguments: acceptLegacyResume ? prepareLegacyEditArguments : undefined,
    async execute(_toolCallId, params, signal, _onUpdate, ctx: ExtensionContext) {
      if (signal?.aborted) throw new Error(`${name} cancelled`);
      if (params.base === LEGACY_BASE) {
        throw new Error(
          "This resumed edit call uses the retired exact-text schema. Call read again, then retry with base, startLine/endLine, and newText.",
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
    edits?: Array<{ oldText?: unknown; newText?: unknown }>;
  };
  const topLevelLegacy = typeof input.oldText === "string" && typeof input.newText === "string";
  const nestedLegacy = input.edits?.some((edit) => typeof edit.oldText === "string");
  if (!topLevelLegacy && !nestedLegacy) return args as EditParams;
  return {
    path: typeof input.path === "string" ? input.path : "",
    base: LEGACY_BASE,
    edits: [{ op: "replace", startLine: 1, endLine: 1, newText: "" }],
  };
}

function validateStandardOwners(pi: ExtensionAPI) {
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
  for (const name of ["read", "edit"]) {
    if (!standardTools.some((tool) => tool.name === name && tool.sourceInfo.source === "builtin")) {
      throw new Error(
        `Refusing snapshot override without a positively identified built-in ${name} owner`,
      );
    }
  }
}

export default function snapshotEditExtension(pi: ExtensionAPI) {
  const service = createSnapshotEditService();
  let overrideInstalled = false;

  pi.registerFlag("snapshot-edit-override", {
    description: "Replace built-in read/edit with the local snapshot protocol for this Pi process",
    type: "boolean",
    default: false,
  });

  pi.registerTool(createReadDefinition("snapshot_read", "Snapshot Read", service));
  pi.registerTool(createEditDefinition("snapshot_edit", "Snapshot Edit", service, false));

  const installStandardOverrides = () => {
    if (overrideInstalled) return { installed: false, reason: "already installed" };
    validateStandardOwners(pi);
    pi.registerTool(createReadDefinition("read", "Read", service));
    pi.registerTool(createEditDefinition("edit", "Edit", service, true));
    pi.setActiveTools([...new Set([...pi.getActiveTools(), "read", "edit"])]);
    overrideInstalled = true;
    return { installed: true, reason: "local snapshot override active" };
  };

  pi.registerCommand("snapshot-edit", {
    description: "Snapshot edit status; actions: override, clear",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "override") {
        const installed = installStandardOverrides();
        if (ctx.hasUI) {
          ctx.ui.notify(
            installed.installed
              ? "Snapshot protocol now owns standard read/edit for this session. Run /reload to restore built-ins."
              : "Snapshot read/edit override was already active.",
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
    if (process.env[OVERRIDE_ENV] === "1" || pi.getFlag("snapshot-edit-override") === true) {
      installStandardOverrides();
    }
  });

  pi.on("session_shutdown", async () => {
    service.clear();
  });
}
