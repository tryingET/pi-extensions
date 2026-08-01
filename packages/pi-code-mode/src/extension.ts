import { Type } from "typebox";
import { CapabilityRegistry } from "./capability-registry.ts";
import { createDefaultCapabilities } from "./default-capabilities.ts";
import { formatKernelResult, truncateUtf8 } from "./format-result.ts";
import { KernelExecutionError } from "./kernel-client.ts";
import { KernelManager } from "./kernel-manager.ts";
import type { PiCodeModeApi } from "./pi-api.ts";
import type {
  CapabilityEffect,
  CodeModeExtensionOptions,
  CodeModeLanguage,
  EvalToolDetails,
  EvalToolResult,
} from "./types.ts";

const DEFAULT_ALLOWED_EFFECTS: CapabilityEffect[] = ["read", "process"];
const DEFAULT_MAX_TIMEOUT_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 50 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_CODE_BYTES = 100_000;

const evalParameters = Type.Object({
  language: Type.Unsafe<CodeModeLanguage>({
    type: "string",
    enum: ["python", "javascript"],
    description: "Logical kernel state to use.",
  }),
  code: Type.String({
    minLength: 1,
    maxLength: MAX_CODE_BYTES,
    description:
      "Code to execute. Python returns its final expression; JavaScript returns an explicit return value.",
  }),
  timeoutSeconds: Type.Optional(
    Type.Number({
      minimum: 1,
      maximum: 120,
      description: "Wall-clock timeout. Timeout or cancellation terminates that language kernel.",
    }),
  ),
});

export function createCodeModeExtension(options: CodeModeExtensionOptions = {}) {
  return function codeModeExtension(pi: PiCodeModeApi): void {
    const registry = new CapabilityRegistry(createDefaultCapabilities());
    registry.registerAll(options.capabilities ?? []);
    const runtime =
      options.runtime ??
      new KernelManager({ registry, pythonExecutable: options.pythonExecutable });
    const allowedEffects = new Set(options.allowedCapabilityEffects ?? DEFAULT_ALLOWED_EFFECTS);
    const requireConfirmation = options.requireConfirmation ?? true;
    const allowNonInteractive = options.allowNonInteractive ?? false;
    const maxTimeoutMs = options.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS;
    const maxOutputBytes = Math.min(
      Math.max(256, options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES),
      MAX_OUTPUT_BYTES,
    );

    pi.registerTool<typeof evalParameters, EvalToolDetails>({
      name: "eval",
      label: "Code mode",
      description: buildToolDescription(registry),
      promptSnippet:
        "Run substantial Python or JavaScript analysis in one call. Use tool capabilities for governed host operations.",
      promptGuidelines: [
        "Prefer eval when a bounded program can replace many repetitive tool calls.",
        "Use tool.list() to inspect the explicit capability registry.",
        "Python tool calls are synchronous; JavaScript tool calls must be awaited.",
        "Do not claim this runtime is a security sandbox.",
      ],
      parameters: evalParameters,
      async execute(_toolCallId, params, signal, onUpdate, ctx): Promise<EvalToolResult> {
        const language = params.language as CodeModeLanguage;
        const code = params.code.trim();
        if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
          throw new Error(`eval code exceeds ${MAX_CODE_BYTES} UTF-8 bytes.`);
        }
        const timeoutMs = Math.min(
          Math.round((params.timeoutSeconds ?? DEFAULT_TIMEOUT_MS / 1_000) * 1_000),
          maxTimeoutMs,
        );

        const admitted = await confirmExecution({
          language,
          code,
          requireConfirmation,
          allowNonInteractive,
          hasUI: ctx.hasUI,
          confirm: (title, message) => ctx.ui.confirm(title, message),
        });
        if (!admitted) {
          throw new Error("Operator approval was not available or was denied.");
        }

        try {
          await onUpdate?.({
            content: [{ type: "text", text: `Starting ${language} code mode.` }],
            details: {
              ok: true,
              language,
              elapsedMs: 0,
              capabilityCalls: 0,
              capabilityInvocations: [],
              kernelReused: false,
              truncated: false,
            },
          });
          const result = await runtime.run(language, {
            code,
            cwd: ctx.cwd,
            timeoutMs,
            outputLimitBytes: maxOutputBytes,
            signal,
            allowedEffects,
            onUpdate,
          });
          const formatted = formatKernelResult(result, maxOutputBytes);
          return {
            content: [{ type: "text", text: formatted.text }],
            details: formatted.details,
          };
        } catch (error) {
          if (error instanceof KernelExecutionError) {
            const partial = formatKernelResult(error.partial, maxOutputBytes);
            const failureText = truncateUtf8(
              `${language} eval failed: ${error.message}\n\n${partial.text}\n\nCapability calls: ${partial.details.capabilityCalls}.`,
              maxOutputBytes,
            ).text;
            const failure = new Error(failureText);
            Object.assign(failure, {
              details: { ...partial.details, ok: false, error: error.message },
            });
            throw failure;
          }
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(truncateUtf8(`${language} eval failed: ${message}`, maxOutputBytes).text);
        }
      },
    });

    pi.registerCommand("code-mode", {
      description: "Show code-mode runtime and capability status",
      handler: async (_args, ctx) => {
        const catalog = registry
          .catalog()
          .map((entry) => `${entry.name} [${entry.effect}]`)
          .join(", ");
        const message = `Code mode: Python + JavaScript; capabilities: ${catalog}; confirmation: ${
          requireConfirmation ? "required" : "disabled"
        }.`;
        if (ctx.hasUI) ctx.ui.notify(message, "info");
      },
    });

    pi.registerCommand("eval-reset", {
      description: "Terminate active code-mode workers and clear both logical kernel states",
      handler: async (_args, ctx) => {
        await runtime.reset();
        if (ctx.hasUI) ctx.ui.notify("Code-mode kernels reset.", "info");
      },
    });

    pi.on("session_start", async () => {
      await runtime.reset();
    });
    pi.on("session_shutdown", async () => {
      await runtime.close();
    });
  };
}

export const codeModeExtension = createCodeModeExtension();

function buildToolDescription(registry: CapabilityRegistry): string {
  const catalog = registry
    .catalog()
    .map((entry) => `${entry.name} (${entry.effect})`)
    .join(", ");
  return [
    "Execute bounded code with persistent Python or JavaScript state in disposable workers.",
    "Python exposes tool.<name>(input), tool.call(name, input), and tool.parallel(calls, max_workers).",
    "JavaScript exposes await tool.<name>(input), tool.call(), and tool.parallel(calls, maxConcurrency).",
    `Registered host capabilities: ${catalog}.`,
    "Code runs with the invoking user's permissions and is not a security sandbox.",
  ].join(" ");
}

async function confirmExecution(input: {
  language: CodeModeLanguage;
  code: string;
  requireConfirmation: boolean;
  allowNonInteractive: boolean;
  hasUI: boolean;
  confirm(title: string, message: string): Promise<boolean>;
}): Promise<boolean> {
  if (!input.requireConfirmation) return true;
  if (!input.hasUI) return input.allowNonInteractive;
  const preview = input.code.length > 1_500 ? `${input.code.slice(0, 1_500)}\n…` : input.code;
  return input.confirm(
    `Run ${input.language} code?`,
    `${preview}\n\nThis code runs with your user permissions and is not sandboxed.`,
  );
}
