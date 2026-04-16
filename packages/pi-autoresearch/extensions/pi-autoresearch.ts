import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  buildAutoresearchHelpText,
  buildAutoresearchRuntimeStatus,
  executeAutoresearchRun,
  formatAutoresearchRunResult,
  formatAutoresearchStatusText,
} from "../src/core/runtime.ts";

const statusSchema = Type.Object({
  cwd: Type.Optional(Type.String({ description: "Optional cwd override for runtime reporting" })),
});

const directionSchema = Type.Union([Type.Literal("lower"), Type.Literal("higher")], {
  description: "Whether lower or higher metric values are better.",
});

const runSchema = Type.Object({
  cwd: Type.Optional(Type.String({ description: "Optional cwd override for the bounded runtime" })),
  description: Type.String({
    description: "Short description of what this bounded run is trying.",
  }),
  name: Type.Optional(
    Type.String({
      description:
        "Campaign name. Required when bootstrapping the first config receipt or reconfiguring the bounded runtime.",
    }),
  ),
  metricName: Type.Optional(
    Type.String({
      description:
        "Primary metric name. Required when bootstrapping the first config receipt or reconfiguring the bounded runtime.",
    }),
  ),
  metricUnit: Type.Optional(
    Type.String({ description: "Primary metric unit (defaults to empty string)." }),
  ),
  direction: Type.Optional(directionSchema),
  benchmarkCommand: Type.Optional(
    Type.String({
      description:
        "Benchmark command override. Defaults to the config receipt command or 'bash autoresearch.sh' when present.",
    }),
  ),
  checksCommand: Type.Optional(
    Type.Union([
      Type.String({ description: "Checks command override." }),
      Type.Null({ description: "Pass null to disable checks for this run." }),
    ]),
  ),
  timeoutSeconds: Type.Optional(
    Type.Number({ description: "Benchmark timeout in seconds (default: 600).", minimum: 1 }),
  ),
  checksTimeoutSeconds: Type.Optional(
    Type.Number({ description: "Checks timeout in seconds (default: 300).", minimum: 1 }),
  ),
  reconfigure: Type.Optional(
    Type.Boolean({
      description:
        "Append a new config receipt before this run. Requires name + metricName and resets the current segment.",
    }),
  ),
});

export default function piAutoresearchExtension(pi: ExtensionAPI): void {
  pi.registerCommand(AUTORESEARCH_COMMAND_NAME, {
    description: "Open the pi-autoresearch bounded-runtime overview",
    handler: async (args, ctx) => {
      await openAutoresearchShell(args, ctx);
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_STATUS_TOOL_NAME,
    label: "Autoresearch Runtime Status",
    description: "Inspect the current pi-autoresearch bounded runtime and receipt log.",
    promptSnippet:
      "Inspect the current pi-autoresearch bounded runtime, receipt log, and local artifact contract.",
    parameters: statusSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as { cwd?: string };
      const status = buildAutoresearchRuntimeStatus(request.cwd ?? ctx.cwd);
      return {
        content: [{ type: "text", text: formatAutoresearchStatusText(status) }],
        details: status,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_RUN_TOOL_NAME,
    label: "Autoresearch Runtime Run",
    description: "Execute one bounded local pi-autoresearch run and append config/run receipts.",
    promptSnippet:
      "Execute one bounded local pi-autoresearch run, parse metrics, run checks, and append receipts.",
    parameters: runSchema,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const request = params as {
        cwd?: string;
        description: string;
        name?: string;
        metricName?: string;
        metricUnit?: string;
        direction?: "lower" | "higher";
        benchmarkCommand?: string;
        checksCommand?: string | null;
        timeoutSeconds?: number;
        checksTimeoutSeconds?: number;
        reconfigure?: boolean;
      };

      const result = await executeAutoresearchRun({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        description: request.description,
        name: request.name,
        metricName: request.metricName,
        metricUnit: request.metricUnit,
        direction: request.direction,
        benchmarkCommand: request.benchmarkCommand,
        checksCommand: request.checksCommand,
        timeoutSeconds: request.timeoutSeconds,
        checksTimeoutSeconds: request.checksTimeoutSeconds,
        reconfigure: request.reconfigure,
        signal,
      });

      return {
        content: [{ type: "text", text: formatAutoresearchRunResult(result) }],
        details: result,
      };
    },
  });
}

async function openAutoresearchShell(args: string, ctx: ExtensionContext): Promise<void> {
  if (!ctx.hasUI) return;

  const normalizedArgs = args.trim();
  const status = buildAutoresearchRuntimeStatus(ctx.cwd);

  if (normalizedArgs.length > 0 && normalizedArgs !== "help" && normalizedArgs !== "status") {
    ctx.ui.notify(
      "The autonomous loop is still out of scope. Opened the bounded runtime overview instead; use autoresearch_runtime_run for one local receipt-backed run.",
      "info",
    );
  }

  await ctx.ui.editor("pi-autoresearch", buildAutoresearchHelpText(status));
}
