import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

type PiToolParameters = Parameters<ExtensionAPI["registerTool"]>[0]["parameters"];
type ToolResult = Awaited<ReturnType<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>>;

type DesignmdFormat = "css" | "oat" | "tailwind" | "dtcg" | "tokens" | "agent-prompt" | "json";

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

interface ReadinessParams extends BaseParams {}

const FORMAT_VALUES = ["css", "oat", "tailwind", "dtcg", "tokens", "agent-prompt", "json"] as const;
const MODE_VALUES = ["iterate", "remix", "expand", "audit"] as const;

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
      const result = runDesignmd(request, [
        "lint",
        resolveInputPath(request.cwd, request.designPath || "DESIGN.md"),
      ]);
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
      return toolResult(runDesignmd(request, args));
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
      return toolResult(runDesignmd(request, args));
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
      return toolResult(runDesignmd(request, args));
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
      return toolResult(runDesignmd(request, args));
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
      return toolResult(runDesignmd(request, args, request.paletteText));
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
        commandResult(
          "node",
          ["scripts/run-ts.mjs", "scripts/integration-readiness.ts"],
          foundryRoot,
          result,
        ),
      );
    },
  });
}

function runDesignmd(
  params: BaseParams,
  cliArgs: string[],
  stdin?: string,
): ReturnType<typeof commandResult> {
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
) {
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

function toolResult(result: ReturnType<typeof commandResult>): ToolResult {
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
