import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

type PiToolParameters = Parameters<ExtensionAPI["registerTool"]>[0]["parameters"];
type ToolResult = Awaited<ReturnType<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>>;

type DesignmdFormat =
  | "css"
  | "oat"
  | "tailwind"
  | "dtcg"
  | "tokens"
  | "agent-prompt"
  | "xstate"
  | "rive"
  | "json";
type OpenPencilExportFormat = "svg" | "png" | "jpg" | "webp" | "fig";
type SessionArtifactKind = "html" | "svg" | "image" | "markdown" | "css" | "json" | "text";

interface BaseParams {
  cwd?: string;
  foundryRoot?: string;
}

interface LintParams extends BaseParams {
  designPath?: string;
}

interface ExportParams extends BaseParams {
  designPath?: string;
  format: DesignmdFormat;
  mode?: string;
  objective?: string;
}

interface PromptParams extends BaseParams {
  designPath?: string;
  mode?: string;
  objective?: string;
}

interface OatVisualSnapshotParams extends BaseParams {
  designPath?: string;
  referenceTitle?: string;
  referenceUrl?: string;
  observations?: string[];
  cdn?: boolean;
  stylesheet?: string;
}

interface OpenPencilFileParams extends BaseParams {
  filePath: string;
}

interface OpenPencilExportParams extends BaseParams {
  filePath: string;
  format: OpenPencilExportFormat;
  outputPath: string;
}

interface ImportPenpotParams extends BaseParams {
  tokenPath: string;
  name?: string;
  description?: string;
}

interface PaletteParams extends BaseParams {
  paletteText?: string;
  palettePath?: string;
  applyDesignPath?: string;
}

interface PenpotMcpInspectParams extends BaseParams {
  endpoint?: string;
}

interface PenpotMcpBridgeParams extends BaseParams {
  bridgePath: string;
  apply?: boolean;
  outputPath?: string;
  endpoint?: string;
  boardName?: string;
  maxNodes?: number;
}

interface PenpotMcpExportParams extends BaseParams {
  outputPath: string;
  boardId?: string;
  latest?: boolean;
  endpoint?: string;
}

interface SessionPlanParams extends BaseParams {
  projectId?: string;
  sessionId?: string;
  materialize?: boolean;
}

interface SessionVariantsParams extends BaseParams {
  projectId?: string;
  sessionId?: string;
  materialize?: boolean;
}

interface SessionCloseoutParams extends BaseParams {
  projectId?: string;
  sessionId?: string;
  materialize?: boolean;
}

interface SessionHandoffParams extends BaseParams {
  projectId?: string;
  sessionId?: string;
  laneId?: string;
  materialize?: boolean;
}

interface SessionBrowserAgentHandoffParams extends BaseParams {
  projectId?: string;
  sessionId?: string;
  target?: "sitegeist" | "manual-browser-agent";
  baseUrl?: string;
  materialize?: boolean;
}

interface SessionPromotionCandidateParams extends BaseParams {
  projectId?: string;
  sessionId?: string;
  materialize?: boolean;
}

interface ReadinessParams extends BaseParams {}

interface SessionArtifactSpec {
  kind: SessionArtifactKind;
  title: string;
  mimeType: string;
  content?: string;
  path?: string;
}

interface SessionReportOptions {
  toolName: string;
  objective?: string;
  artifact?: (result: CommandResult) => SessionArtifactSpec | undefined;
}

interface WatchSession {
  id: string;
}

interface CommandResult {
  ok: boolean;
  command: string;
  args: string[];
  cwd: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error: string | undefined;
}

const FORMAT_VALUES = [
  "css",
  "oat",
  "tailwind",
  "dtcg",
  "tokens",
  "agent-prompt",
  "xstate",
  "rive",
  "json",
] as const;
const MODE_VALUES = ["iterate", "remix", "expand", "audit"] as const;
const OPENPENCIL_EXPORT_FORMAT_VALUES = ["svg", "png", "jpg", "webp", "fig"] as const;

const baseFields = {
  cwd: Type.Optional(
    Type.String({
      description:
        "Working directory for relative DESIGN.md/input paths. Defaults to Pi process cwd.",
    }),
  ),
  foundryRoot: Type.Optional(
    Type.String({
      description:
        "DesignMD Foundry repo root. Defaults to DESIGNMD_FOUNDRY_HOME or ~/ai-society/softwareco/owned/designmd-foundry.",
    }),
  ),
};

const modeField = Type.Optional(
  Type.Union(
    MODE_VALUES.map((value) => Type.Literal(value)),
    {
      description: "Design operation mode. Allowed values: iterate, remix, expand, audit.",
    },
  ),
);

function asPiToolParameters(schema: unknown): PiToolParameters {
  return schema as PiToolParameters;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("designmd", {
    description: "Show DesignMD Foundry Pi adapter status and setup hints",
    handler: async (_args, ctx) => {
      const foundryRoot = resolveFoundryRoot({});
      const status = fs.existsSync(foundryRoot)
        ? `DesignMD Foundry root: ${foundryRoot}`
        : `DesignMD Foundry root not found: ${foundryRoot}`;
      if (ctx.hasUI) ctx.ui.notify(status, fs.existsSync(foundryRoot) ? "info" : "warning");
      else console.log(status);
    },
  });

  pi.registerTool({
    name: "designmd_lint",
    label: "DesignMD lint",
    description:
      "Lint a DESIGN.md file through the DesignMD Foundry CLI and return the JSON report.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        designPath: Type.Optional(
          Type.String({
            description: "DESIGN.md path relative to cwd, or absolute. Defaults to DESIGN.md.",
          }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as LintParams;
      const result = await runDesignmdWithSession(
        request,
        ["lint", resolveInputPath(request.cwd, request.designPath || "DESIGN.md")],
        { toolName: "designmd_lint" },
      );
      return toolResult(result);
    },
  });

  pi.registerTool({
    name: "designmd_export",
    label: "DesignMD export",
    description:
      "Export DesignMD artifacts such as CSS, Oat theme, Tailwind theme, DTCG tokens, or agent prompt.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        designPath: Type.Optional(
          Type.String({
            description: "DESIGN.md path relative to cwd, or absolute. Defaults to DESIGN.md.",
          }),
        ),
        format: Type.Union(FORMAT_VALUES.map((value) => Type.Literal(value))),
        mode: modeField,
        objective: Type.Optional(
          Type.String({ description: "Optional objective for agent-prompt export." }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as ExportParams;
      const args = ["export", "--format", request.format];
      if (request.mode) args.push("--mode", request.mode);
      if (request.objective) args.push("--objective", request.objective);
      args.push(resolveInputPath(request.cwd, request.designPath || "DESIGN.md"));
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_export",
          objective: request.objective,
          artifact: (result) => artifactForExport(request.format, result.stdout),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_agent_prompt",
    label: "DesignMD agent prompt",
    description: "Generate an agent-facing design prompt from DESIGN.md.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        designPath: Type.Optional(
          Type.String({
            description: "DESIGN.md path relative to cwd, or absolute. Defaults to DESIGN.md.",
          }),
        ),
        mode: modeField,
        objective: Type.Optional(
          Type.String({ description: "Implementation or audit objective for the prompt." }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as PromptParams;
      const args = ["export", "--format", "agent-prompt"];
      if (request.mode) args.push("--mode", request.mode);
      if (request.objective) args.push("--objective", request.objective);
      args.push(resolveInputPath(request.cwd, request.designPath || "DESIGN.md"));
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_agent_prompt",
          objective: request.objective,
          artifact: (result) => ({
            kind: "markdown",
            title: "DesignMD agent prompt",
            mimeType: "text/markdown; charset=utf-8",
            content: result.stdout,
          }),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_oat_visual_snapshot",
    label: "DesignMD Oat visual snapshot",
    description:
      "Generate a deterministic Oat visual snapshot HTML file from DESIGN.md. Returns HTML only; no canonical files are written.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        designPath: Type.Optional(
          Type.String({
            description: "DESIGN.md path relative to cwd, or absolute. Defaults to DESIGN.md.",
          }),
        ),
        referenceTitle: Type.Optional(
          Type.String({ description: "Optional title for the visual reference context." }),
        ),
        referenceUrl: Type.Optional(
          Type.String({ description: "Optional URL for the visual reference context." }),
        ),
        observations: Type.Optional(
          Type.Array(
            Type.String({
              description:
                "Reference cue or review observation to include in the snapshot handoff.",
            }),
          ),
        ),
        cdn: Type.Optional(
          Type.Boolean({ description: "Opt into loading the external Oat CDN stylesheet." }),
        ),
        stylesheet: Type.Optional(
          Type.String({
            description: "Optional local stylesheet path or URL to include explicitly.",
          }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as OatVisualSnapshotParams;
      const args = ["oat-visual-snapshot"];
      if (request.cdn) args.push("--cdn");
      if (request.stylesheet) args.push("--stylesheet", request.stylesheet);
      if (request.referenceTitle) args.push("--reference-title", request.referenceTitle);
      if (request.referenceUrl) args.push("--reference-url", request.referenceUrl);
      if (request.observations?.length) args.push("--observations", request.observations.join(";"));
      args.push(resolveInputPath(request.cwd, request.designPath || "DESIGN.md"));
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_oat_visual_snapshot",
          objective: request.referenceUrl || request.referenceTitle,
          artifact: (result) => ({
            kind: "html",
            title: "Oat visual snapshot",
            mimeType: "text/html; charset=utf-8",
            content: result.stdout,
          }),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_openpencil_prompt",
    label: "DesignMD OpenPencil prompt",
    description:
      "Generate an OpenPencil handoff prompt from DESIGN.md. This does not require the OpenPencil CLI.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        designPath: Type.Optional(
          Type.String({
            description: "DESIGN.md path relative to cwd, or absolute. Defaults to DESIGN.md.",
          }),
        ),
        mode: modeField,
        objective: Type.Optional(Type.String({ description: "OpenPencil handoff objective." })),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as PromptParams;
      const args = ["openpencil-prompt"];
      if (request.mode) args.push("--mode", request.mode);
      if (request.objective) args.push("--objective", request.objective);
      args.push(resolveInputPath(request.cwd, request.designPath || "DESIGN.md"));
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_openpencil_prompt",
          objective: request.objective,
          artifact: (result) => ({
            kind: "markdown",
            title: "OpenPencil handoff prompt",
            mimeType: "text/markdown; charset=utf-8",
            content: result.stdout,
          }),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_openpencil_info",
    label: "DesignMD OpenPencil info",
    description:
      "Inspect a .fig or .pen file through DesignMD Foundry's OpenPencil info adapter. Read-only; does not export or write files.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        filePath: Type.String({
          description: ".fig or .pen path relative to cwd, or absolute.",
        }),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as OpenPencilFileParams;
      return toolResult(
        await runDesignmdWithSession(
          request,
          ["openpencil-info", resolveInputPath(request.cwd, request.filePath)],
          { toolName: "designmd_openpencil_info" },
        ),
      );
    },
  });

  pi.registerTool({
    name: "designmd_openpencil_lint",
    label: "DesignMD OpenPencil lint",
    description:
      "Lint a .fig or .pen file through DesignMD Foundry's OpenPencil lint adapter. Read-only; export remains intentionally unwrapped.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        filePath: Type.String({
          description: ".fig or .pen path relative to cwd, or absolute.",
        }),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as OpenPencilFileParams;
      return toolResult(
        await runDesignmdWithSession(
          request,
          ["openpencil-lint", resolveInputPath(request.cwd, request.filePath)],
          { toolName: "designmd_openpencil_lint" },
        ),
      );
    },
  });

  pi.registerTool({
    name: "designmd_openpencil_export",
    label: "DesignMD OpenPencil export",
    description:
      "Export a .fig or .pen file through DesignMD Foundry's restricted OpenPencil export adapter. Allowed formats: svg, png, jpg, webp, fig. JSX is intentionally not exposed.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        filePath: Type.String({
          description: ".fig or .pen path relative to cwd, or absolute.",
        }),
        format: Type.Union(
          OPENPENCIL_EXPORT_FORMAT_VALUES.map((value) => Type.Literal(value)),
          {
            description: "Verified OpenPencil export format. JSX is intentionally excluded.",
          },
        ),
        outputPath: Type.String({
          description:
            "Output artifact path relative to cwd, or absolute. The tool writes this requested file.",
        }),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as OpenPencilExportParams;
      const resolvedOutputPath = resolveInputPath(request.cwd, request.outputPath);
      return toolResult(
        await runDesignmdWithSession(
          request,
          [
            "openpencil-export",
            resolveInputPath(request.cwd, request.filePath),
            "--format",
            request.format,
            "--output",
            resolvedOutputPath,
          ],
          {
            toolName: "designmd_openpencil_export",
            artifact: () => artifactForOpenPencilExport(request.format, resolvedOutputPath),
          },
        ),
      );
    },
  });

  pi.registerTool({
    name: "designmd_import_penpot",
    label: "DesignMD import Penpot/DTCG",
    description:
      "Convert a DTCG/Penpot token JSON file into DESIGN.md text. Returns text only; it does not overwrite canonical files.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        tokenPath: Type.String({
          description: "DTCG/Penpot token JSON path relative to cwd, or absolute.",
        }),
        name: Type.Optional(Type.String({ description: "Optional imported design system name." })),
        description: Type.Optional(
          Type.String({ description: "Optional imported design system description." }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as ImportPenpotParams;
      const args = ["import-penpot"];
      if (request.name) args.push("--name", request.name);
      if (request.description) args.push("--description", request.description);
      args.push(resolveInputPath(request.cwd, request.tokenPath));
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_import_penpot",
          artifact: (result) => ({
            kind: "markdown",
            title: "Imported Penpot/DTCG DESIGN.md",
            mimeType: "text/markdown; charset=utf-8",
            content: result.stdout,
          }),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_palette_from_text",
    label: "DesignMD palette from text",
    description:
      "Parse Pigmnts-style hex palette text and optionally apply it to DESIGN.md text. Returns output only; it does not overwrite canonical files.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        paletteText: Type.Optional(
          Type.String({ description: "Raw text containing hex colors. Use this or palettePath." }),
        ),
        palettePath: Type.Optional(
          Type.String({
            description:
              "Text file containing hex colors, relative to cwd or absolute. Use this or paletteText.",
          }),
        ),
        applyDesignPath: Type.Optional(
          Type.String({
            description:
              "Optional DESIGN.md path to apply palette to; otherwise returns parsed color JSON.",
          }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as PaletteParams;
      const paletteArg =
        request.paletteText !== undefined
          ? "-"
          : resolveInputPath(request.cwd, request.palettePath || "");
      if (!request.paletteText && !request.palettePath) {
        return messageResult("paletteText or palettePath is required.", { ok: false });
      }
      const args = ["palette", paletteArg, "--fromText"];
      if (request.applyDesignPath)
        args.push("--apply", resolveInputPath(request.cwd, request.applyDesignPath));
      return toolResult(
        await runDesignmdWithSession(
          request,
          args,
          {
            toolName: "designmd_palette_from_text",
            artifact: (result) => ({
              kind: request.applyDesignPath ? "markdown" : "json",
              title: request.applyDesignPath
                ? "Palette-applied DESIGN.md"
                : "Parsed palette colors",
              mimeType: request.applyDesignPath
                ? "text/markdown; charset=utf-8"
                : "application/json; charset=utf-8",
              content: result.stdout,
            }),
          },
          request.paletteText,
        ),
      );
    },
  });

  pi.registerTool({
    name: "designmd_penpot_mcp_inspect",
    label: "DesignMD Penpot MCP inspect",
    description:
      "Read-only inspect of the active Penpot file through the official Penpot MCP server. Requires the Penpot MCP plugin to be connected; does not mutate the file.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        endpoint: Type.Optional(
          Type.String({
            description:
              "Penpot MCP HTTP endpoint. Defaults to PENPOT_MCP_URL or http://127.0.0.1:4401/mcp.",
          }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as PenpotMcpInspectParams;
      const args = ["penpot-mcp-inspect"];
      if (request.endpoint) args.push("--endpoint", request.endpoint);
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_penpot_mcp_inspect",
          objective: "Inspect active Penpot MCP file",
          artifact: (result) => ({
            kind: "json",
            title: "Penpot MCP inspect result",
            mimeType: "application/json; charset=utf-8",
            content: result.stdout,
          }),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_penpot_mcp_bridge",
    label: "DesignMD Penpot MCP bridge",
    description:
      "Plan or explicitly apply a bounded DesignMD canvas-bridge to Penpot through the official Penpot MCP server. Plan-only by default; apply requires a connected Penpot MCP plugin and creates one board.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        bridgePath: Type.String({
          description:
            "designmd.canvas-bridge.v1 JSON path, relative to cwd or absolute. Use /api/session/:id/canvas-bridge to obtain one.",
        }),
        apply: Type.Optional(
          Type.Boolean({
            description:
              "When true, explicitly apply the bridge to the active Penpot file through MCP. Defaults to false (plan only).",
          }),
        ),
        outputPath: Type.Optional(
          Type.String({
            description:
              "Optional SVG proof output path for apply=true, relative to cwd or absolute.",
          }),
        ),
        endpoint: Type.Optional(
          Type.String({
            description:
              "Penpot MCP HTTP endpoint. Defaults to PENPOT_MCP_URL or http://127.0.0.1:4401/mcp.",
          }),
        ),
        boardName: Type.Optional(
          Type.String({ description: "Optional Penpot board name for the bridge apply plan." }),
        ),
        maxNodes: Type.Optional(
          Type.Number({
            description: "Optional positive maximum number of bridge nodes to render.",
          }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as PenpotMcpBridgeParams;
      const args = ["penpot-mcp-bridge", resolveInputPath(request.cwd, request.bridgePath)];
      if (request.apply) args.push("--apply");
      const resolvedOutputPath = request.outputPath
        ? resolveInputPath(request.cwd, request.outputPath)
        : undefined;
      if (resolvedOutputPath) args.push("--output", resolvedOutputPath);
      if (request.endpoint) args.push("--endpoint", request.endpoint);
      if (request.boardName) args.push("--board-name", request.boardName);
      if (request.maxNodes !== undefined) args.push("--max-nodes", String(request.maxNodes));
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_penpot_mcp_bridge",
          objective: request.apply ? "Apply Penpot MCP bridge" : "Plan Penpot MCP bridge",
          artifact: (result) =>
            artifactForPenpotMcpBridge(request, result.stdout, resolvedOutputPath),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_penpot_mcp_export",
    label: "DesignMD Penpot MCP export",
    description:
      "Read-only SVG export of an existing DesignMD bridge board from the active Penpot file through the official Penpot MCP server. Requires an explicit outputPath; does not mutate the Penpot file.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        outputPath: Type.String({
          description:
            "SVG output path, relative to cwd or absolute. The tool writes this requested artifact.",
        }),
        boardId: Type.Optional(
          Type.String({
            description:
              "Optional exact existing Penpot bridge board id. When omitted, the latest DesignMD bridge board is exported.",
          }),
        ),
        latest: Type.Optional(
          Type.Boolean({
            description:
              "Export the latest DesignMD bridge board when boardId is omitted. Defaults to true.",
          }),
        ),
        endpoint: Type.Optional(
          Type.String({
            description:
              "Penpot MCP HTTP endpoint. Defaults to PENPOT_MCP_URL or http://127.0.0.1:4401/mcp.",
          }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as PenpotMcpExportParams;
      if (!request.boardId && request.latest === false) {
        return messageResult("Provide boardId or leave latest enabled for Penpot MCP export.", {
          ok: false,
        });
      }
      const resolvedOutputPath = resolveInputPath(request.cwd, request.outputPath);
      const args = ["penpot-mcp-export", "--output", resolvedOutputPath];
      if (request.boardId) args.push("--board-id", request.boardId);
      else args.push("--latest");
      if (request.endpoint) args.push("--endpoint", request.endpoint);
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_penpot_mcp_export",
          objective: request.boardId
            ? `Export Penpot MCP bridge board ${request.boardId}`
            : "Export latest Penpot MCP bridge board",
          artifact: (result) => artifactForPenpotMcpExport(result.stdout, resolvedOutputPath),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_session_plan",
    label: "DesignMD session plan",
    description:
      "Build or materialize a local DesignMD Watch Mode session plan packet. This is Watch Mode planning guidance only, not canonical AK/society authority.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        projectId: Type.Optional(
          Type.String({ description: "DesignMD project id. Defaults to default." }),
        ),
        sessionId: Type.Optional(
          Type.String({
            description:
              "Watch Mode session id. Defaults to current running session in local Foundry storage.",
          }),
        ),
        materialize: Type.Optional(
          Type.Boolean({
            description:
              "When true, write the plan packet as a local session artifact and check. Defaults to false.",
          }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as SessionPlanParams;
      const args = ["session-plan", request.sessionId || "current"];
      if (request.projectId) args.push("--project", request.projectId);
      if (request.materialize) args.push("--materialize");
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_session_plan",
          objective: request.materialize
            ? "Materialize DesignMD session plan"
            : "Build DesignMD session plan",
          artifact: (result) => ({
            kind: "json",
            title: request.materialize
              ? "DesignMD materialized session plan result"
              : "DesignMD session plan packet",
            mimeType: "application/json; charset=utf-8",
            content: result.stdout,
          }),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_session_variants",
    label: "DesignMD session variants",
    description:
      "Build or materialize bounded local DesignMD Watch Mode session variant lanes. These are proposal lanes only, not accepted durable variants or canonical direction.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        projectId: Type.Optional(
          Type.String({ description: "DesignMD project id. Defaults to default." }),
        ),
        sessionId: Type.Optional(
          Type.String({
            description:
              "Watch Mode session id. Defaults to current running session in local Foundry storage.",
          }),
        ),
        materialize: Type.Optional(
          Type.Boolean({
            description:
              "When true, write the variant lanes packet as a local session artifact and check. Defaults to false.",
          }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as SessionVariantsParams;
      const args = ["session-variants", request.sessionId || "current"];
      if (request.projectId) args.push("--project", request.projectId);
      if (request.materialize) args.push("--materialize");
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_session_variants",
          objective: request.materialize
            ? "Materialize DesignMD session variant lanes"
            : "Build DesignMD session variant lanes",
          artifact: (result) => ({
            kind: "json",
            title: request.materialize
              ? "DesignMD materialized session variant lanes result"
              : "DesignMD session variant lanes packet",
            mimeType: "application/json; charset=utf-8",
            content: result.stdout,
          }),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_session_closeout",
    label: "DesignMD session closeout",
    description:
      "Build or materialize a local DesignMD Watch Mode session closeout packet. This is Watch Mode evidence only, not canonical AK/society promotion.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        projectId: Type.Optional(
          Type.String({ description: "DesignMD project id. Defaults to default." }),
        ),
        sessionId: Type.Optional(
          Type.String({
            description:
              "Watch Mode session id. Defaults to current running session in local Foundry storage.",
          }),
        ),
        materialize: Type.Optional(
          Type.Boolean({
            description:
              "When true, write the closeout packet as a local session artifact and check. Defaults to false.",
          }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as SessionCloseoutParams;
      const args = ["session-closeout", request.sessionId || "current"];
      if (request.projectId) args.push("--project", request.projectId);
      if (request.materialize) args.push("--materialize");
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_session_closeout",
          objective: request.materialize
            ? "Materialize DesignMD session closeout"
            : "Build DesignMD session closeout",
          artifact: (result) => ({
            kind: "json",
            title: request.materialize
              ? "DesignMD materialized session closeout result"
              : "DesignMD session closeout packet",
            mimeType: "application/json; charset=utf-8",
            content: result.stdout,
          }),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_session_handoff",
    label: "DesignMD session handoff",
    description:
      "Build or materialize a local DesignMD session handoff prompt for one variant lane. This is local agent/operator guidance only, not canonical authority.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        projectId: Type.Optional(
          Type.String({ description: "DesignMD project id. Defaults to default." }),
        ),
        sessionId: Type.Optional(
          Type.String({
            description:
              "Watch Mode session id. Defaults to current running session in local Foundry storage.",
          }),
        ),
        laneId: Type.Optional(
          Type.String({
            description:
              "Optional variant lane id or suffix such as safe-iterate, edge-remix, evidence-audit, or microscope-a11y-motion.",
          }),
        ),
        materialize: Type.Optional(
          Type.Boolean({
            description:
              "When true, write the handoff prompt as a local session artifact and check. Defaults to false.",
          }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as SessionHandoffParams;
      const args = ["session-handoff", request.sessionId || "current"];
      if (request.projectId) args.push("--project", request.projectId);
      if (request.laneId) args.push("--lane", request.laneId);
      if (request.materialize) args.push("--materialize");
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_session_handoff",
          objective: request.materialize
            ? "Materialize DesignMD session handoff"
            : "Build DesignMD session handoff",
          artifact: (result) => ({
            kind: "json",
            title: request.materialize
              ? "DesignMD materialized session handoff result"
              : "DesignMD session handoff packet",
            mimeType: "application/json; charset=utf-8",
            content: result.stdout,
          }),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_session_browser_agent_handoff",
    label: "DesignMD browser-agent handoff",
    description:
      "Build or materialize a local DesignMD browser-agent handoff prompt for optional browser-side review, such as Sitegeist. This is local Watch Mode guidance only, not mutation or promotion authority.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        projectId: Type.Optional(
          Type.String({ description: "DesignMD project id. Defaults to default." }),
        ),
        sessionId: Type.Optional(
          Type.String({
            description:
              "Watch Mode session id. Defaults to current running session in local Foundry storage.",
          }),
        ),
        target: Type.Optional(
          Type.Union([Type.Literal("sitegeist"), Type.Literal("manual-browser-agent")], {
            description: "Optional browser-agent handoff target. Defaults to sitegeist.",
          }),
        ),
        baseUrl: Type.Optional(
          Type.String({
            description:
              "Local Foundry base URL to include in the handoff, for example http://127.0.0.1:8787.",
          }),
        ),
        materialize: Type.Optional(
          Type.Boolean({
            description:
              "When true, write the browser-agent handoff prompt as a local session artifact and check. Defaults to false.",
          }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as SessionBrowserAgentHandoffParams;
      const args = ["session-browser-agent-handoff", request.sessionId || "current"];
      if (request.projectId) args.push("--project", request.projectId);
      if (request.target) args.push("--target", request.target);
      if (request.baseUrl) args.push("--base-url", request.baseUrl);
      if (request.materialize) args.push("--materialize");
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_session_browser_agent_handoff",
          objective: request.materialize
            ? "Materialize DesignMD browser-agent handoff"
            : "Build DesignMD browser-agent handoff",
          artifact: (result) => ({
            kind: "json",
            title: request.materialize
              ? "DesignMD materialized browser-agent handoff result"
              : "DesignMD browser-agent handoff packet",
            mimeType: "application/json; charset=utf-8",
            content: result.stdout,
          }),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_session_promotion_candidate",
    label: "DesignMD session promotion candidate",
    description:
      "Build or materialize a local DesignMD promotion candidate packet for owner-surface review. This does not promote, publish, merge, or mutate AK/society authority.",
    parameters: asPiToolParameters(
      Type.Object({
        ...baseFields,
        projectId: Type.Optional(
          Type.String({ description: "DesignMD project id. Defaults to default." }),
        ),
        sessionId: Type.Optional(
          Type.String({
            description:
              "Watch Mode session id. Defaults to current running session in local Foundry storage.",
          }),
        ),
        materialize: Type.Optional(
          Type.Boolean({
            description:
              "When true, write the promotion candidate packet as a local session artifact and check. Defaults to false.",
          }),
        ),
      }),
    ),
    async execute(_toolCallId, params) {
      const request = params as SessionPromotionCandidateParams;
      const args = ["session-promotion-candidate", request.sessionId || "current"];
      if (request.projectId) args.push("--project", request.projectId);
      if (request.materialize) args.push("--materialize");
      return toolResult(
        await runDesignmdWithSession(request, args, {
          toolName: "designmd_session_promotion_candidate",
          objective: request.materialize
            ? "Materialize DesignMD promotion candidate"
            : "Build DesignMD promotion candidate",
          artifact: (result) => ({
            kind: "json",
            title: request.materialize
              ? "DesignMD materialized promotion candidate result"
              : "DesignMD promotion candidate packet",
            mimeType: "application/json; charset=utf-8",
            content: result.stdout,
          }),
        }),
      );
    },
  });

  pi.registerTool({
    name: "designmd_readiness",
    label: "DesignMD readiness",
    description:
      "Run DesignMD Foundry integration-readiness checks for Penpot, OpenPencil, Pigmnts, Oat, and agent-prompt workflows.",
    parameters: asPiToolParameters(Type.Object({ ...baseFields })),
    async execute(_toolCallId, params) {
      const request = params as ReadinessParams;
      const foundryRoot = resolveFoundryRoot(request);
      const result = spawnSync(
        process.execPath,
        ["scripts/run-ts.mjs", "scripts/integration-readiness.ts"],
        {
          cwd: foundryRoot,
          encoding: "utf8",
          timeout: 120_000,
          maxBuffer: 5 * 1024 * 1024,
        },
      );
      return toolResult(
        await reportCommandResult(
          commandResult(
            "node",
            ["scripts/run-ts.mjs", "scripts/integration-readiness.ts"],
            foundryRoot,
            result,
          ),
          {
            toolName: "designmd_readiness",
            artifact: (command) => ({
              kind: "json",
              title: "DesignMD integration readiness",
              mimeType: "application/json; charset=utf-8",
              content: command.stdout,
            }),
          },
        ),
      );
    },
  });
}

async function runDesignmdWithSession(
  params: BaseParams,
  cliArgs: string[],
  options: SessionReportOptions,
  stdin?: string,
): Promise<CommandResult> {
  const session = await ensureWatchSession(options);
  await postSessionActivity(session, {
    kind: "action",
    source: "pi-designmd",
    message: `${options.toolName} started`,
    detail: cliArgs.join(" "),
  });
  const result = runDesignmd(params, cliArgs, stdin);
  return reportCommandResult(result, options, session);
}

async function reportCommandResult(
  result: CommandResult,
  options: SessionReportOptions,
  existingSession?: WatchSession | null,
): Promise<CommandResult> {
  const session =
    existingSession === undefined ? await ensureWatchSession(options) : existingSession;
  await postSessionActivity(session, {
    kind: result.ok ? "success" : "error",
    source: "pi-designmd",
    message: `${options.toolName} ${result.ok ? "passed" : "failed"}`,
    detail: result.ok
      ? result.stdout.slice(0, 1200)
      : [result.stderr, result.error].filter(Boolean).join("\n").slice(0, 1200),
  });
  if (result.ok && options.artifact) {
    const artifact = options.artifact(result);
    if (artifact) await postSessionArtifact(session, artifact);
  }
  return result;
}

function runDesignmd(params: BaseParams, cliArgs: string[], stdin?: string): CommandResult {
  const foundryRoot = resolveFoundryRoot(params);
  const { command, args } = designmdCli(foundryRoot);
  return commandResult(
    command,
    [...args, ...cliArgs],
    foundryRoot,
    spawnSync(command, [...args, ...cliArgs], {
      cwd: foundryRoot,
      input: stdin,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 5 * 1024 * 1024,
    }),
  );
}

function commandResult(
  command: string,
  args: string[],
  cwd: string,
  result: SpawnSyncReturns<string>,
): CommandResult {
  return {
    ok: !result.error && result.status === 0,
    command,
    args,
    cwd,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : undefined,
  };
}

function toolResult(result: CommandResult): ToolResult {
  const details = {
    ok: result.ok,
    command: result.command,
    args: result.args,
    cwd: result.cwd,
    status: result.status,
    signal: result.signal,
    stderr: result.stderr,
    error: result.error,
  };
  const text = result.ok
    ? result.stdout
    : [result.stdout, result.stderr, result.error].filter(Boolean).join("\n");
  return {
    content: [{ type: "text", text: text || JSON.stringify(details, null, 2) }],
    details,
  };
}

function messageResult(text: string, details: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text }], details };
}

function artifactForExport(format: DesignmdFormat, content: string): SessionArtifactSpec {
  switch (format) {
    case "css":
    case "oat":
      return {
        kind: "css",
        title: `DesignMD ${format} export`,
        mimeType: "text/css; charset=utf-8",
        content,
      };
    case "agent-prompt":
      return {
        kind: "markdown",
        title: "DesignMD agent prompt export",
        mimeType: "text/markdown; charset=utf-8",
        content,
      };
    case "tailwind":
    case "dtcg":
    case "tokens":
    case "xstate":
    case "rive":
    case "json":
      return {
        kind: "json",
        title: `DesignMD ${format} export`,
        mimeType: "application/json; charset=utf-8",
        content,
      };
  }
}

function artifactForOpenPencilExport(
  format: OpenPencilExportFormat,
  outputPath: string,
): SessionArtifactSpec {
  if (format === "svg" && fs.existsSync(outputPath)) {
    return {
      kind: "svg",
      title: "OpenPencil SVG export",
      mimeType: "image/svg+xml",
      content: fs.readFileSync(outputPath, "utf8"),
      path: outputPath,
    };
  }
  return {
    kind: format === "png" || format === "jpg" || format === "webp" ? "image" : "text",
    title: `OpenPencil ${format.toUpperCase()} export`,
    mimeType:
      format === "fig" ? "application/octet-stream" : `image/${format === "jpg" ? "jpeg" : format}`,
    path: outputPath,
  };
}

function artifactForPenpotMcpBridge(
  request: PenpotMcpBridgeParams,
  stdout: string,
  outputPath?: string,
): SessionArtifactSpec {
  if (request.apply && outputPath && fs.existsSync(outputPath)) {
    return {
      kind: "svg",
      title: "Penpot MCP bridge proof SVG",
      mimeType: "image/svg+xml",
      content: fs.readFileSync(outputPath, "utf8"),
      path: outputPath,
    };
  }
  return {
    kind: "json",
    title: request.apply ? "Penpot MCP bridge apply result" : "Penpot MCP bridge plan",
    mimeType: "application/json; charset=utf-8",
    content: stdout,
  };
}

function artifactForPenpotMcpExport(stdout: string, outputPath: string): SessionArtifactSpec {
  if (fs.existsSync(outputPath)) {
    return {
      kind: "svg",
      title: "Penpot MCP existing board SVG export",
      mimeType: "image/svg+xml",
      content: fs.readFileSync(outputPath, "utf8"),
      path: outputPath,
    };
  }
  return {
    kind: "json",
    title: "Penpot MCP existing board export result",
    mimeType: "application/json; charset=utf-8",
    content: stdout,
  };
}

async function ensureWatchSession(options: SessionReportOptions): Promise<WatchSession | null> {
  const endpoint = normalizedSessionEndpoint();
  if (!endpoint) return null;
  const explicitSessionId = process.env.DESIGNMD_SESSION_ID;
  if (explicitSessionId) return { id: explicitSessionId };

  const current = await postJson<{ session?: { id?: string } | null }>(
    `${endpoint}/current`,
    null,
    "GET",
  );
  if (current?.session?.id) return { id: current.session.id };

  const created = await postJson<{ session?: { id?: string } }>(endpoint, {
    objective: options.objective || `Pi DesignMD tool: ${options.toolName}`,
    actor: process.env.DESIGNMD_SESSION_ACTOR || "pi-designmd",
  });
  return created?.session?.id ? { id: created.session.id } : null;
}

async function postSessionActivity(
  session: WatchSession | null,
  activity: { kind: string; source: string; message: string; detail?: string },
): Promise<void> {
  const endpoint = normalizedSessionEndpoint();
  if (!endpoint || !session) return;
  await postJson(`${endpoint}/${encodeURIComponent(session.id)}/activity`, activity);
}

async function postSessionArtifact(
  session: WatchSession | null,
  artifact: SessionArtifactSpec,
): Promise<void> {
  const endpoint = normalizedSessionEndpoint();
  if (!endpoint || !session) return;
  await postJson(`${endpoint}/${encodeURIComponent(session.id)}/artifact`, artifact);
}

async function postJson<T = unknown>(
  url: string,
  body: unknown,
  method = "POST",
): Promise<T | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== null) headers["Content-Type"] = "application/json";
    const token = process.env.DESIGNMD_SESSION_TOKEN || process.env.DESIGNMD_API_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function normalizedSessionEndpoint(): string | undefined {
  const raw = process.env.DESIGNMD_SESSION_ENDPOINT;
  return raw ? raw.replace(/\/+$/, "") : undefined;
}

function designmdCli(foundryRoot: string): { command: string; args: string[] } {
  const distCli = path.join(foundryRoot, "dist", "cli.js");
  if (fs.existsSync(distCli)) return { command: process.execPath, args: [distCli] };
  const sourceCli = path.join(foundryRoot, "src", "cli.ts");
  return {
    command: process.execPath,
    args: ["--disable-warning=ExperimentalWarning", "--experimental-strip-types", sourceCli],
  };
}

function resolveFoundryRoot(params: BaseParams): string {
  const explicit = params.foundryRoot || process.env.DESIGNMD_FOUNDRY_HOME;
  const foundryRoot =
    explicit || path.join(os.homedir(), "ai-society", "softwareco", "owned", "designmd-foundry");
  return path.resolve(expandHome(foundryRoot));
}

function resolveInputPath(cwd: string | undefined, inputPath: string): string {
  if (!inputPath) return inputPath;
  const expanded = expandHome(inputPath);
  if (path.isAbsolute(expanded)) return path.resolve(expanded);
  return path.resolve(cwd ? expandHome(cwd) : process.cwd(), expanded);
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}
