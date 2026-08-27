// ---
// summary: "Registers the caller-authored workflow tool and its thin command adapters."
// read_when:
//   - "Changing workflow registration, validation precedence, messages, or rendering."
// ---

import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { isBoundaryFailure } from "../runtime/boundaries.ts";
import type { getCognitiveToolByName } from "../runtime/cognitive-tools.ts";
import type { getGlobalSessionTeamStore } from "../runtime/team-state.ts";
import { validateWorkflowRequest, WORKFLOW_AGENT_NAMES } from "../runtime/workflow.ts";
import {
  type createWorkflowExecutor,
  WorkflowExecutionError,
} from "../runtime/workflow-execution.ts";

type CompatToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "parameters"> & {
  parameters?: unknown;
};

function registerCompatTool(pi: ExtensionAPI, tool: CompatToolDefinition): void {
  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
}

function workflowCognitiveToolUnavailable(
  mode: "chain" | "parallel",
  lookupFailure: "boundary_failure" | "lookup_exception" | "not_found" | "empty_content",
  error: string,
) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Workflow execution blocked: governed cognitive tool 'controlled' is unavailable (${lookupFailure}): ${error}`,
      },
    ],
    details: {
      ok: false,
      mode,
      status: "blocked",
      stepCount: 0,
      errorCode: "workflow_cognitive_tool_unavailable",
      cognitiveTool: "controlled",
      lookupFailure,
      error,
      dispatchedSteps: 0,
    },
  };
}

function buildWorkflowExecuteInvocation(objective?: string): string {
  const trimmedObjective = objective?.trim();
  const request = trimmedObjective
    ? {
        mode: "chain",
        steps: [
          {
            kind: "step",
            agent: "scout",
            objective: trimmedObjective,
          },
          {
            kind: "step",
            agent: "reviewer",
            objective: `Review the findings from: ${trimmedObjective}`,
          },
        ],
      }
    : {
        mode: "chain",
        steps: [
          {
            kind: "step",
            agent: "scout",
            objective: "Inspect the current repo and identify the relevant workflow entry points.",
          },
          {
            kind: "step",
            agent: "reviewer",
            objective:
              "Review the discovered workflow surface and summarize the main runtime risks.",
          },
        ],
      };

  return `workflow_execute(${JSON.stringify({ request }, null, 2)})`;
}

function formatWorkflowWrapperGuide(): string {
  return [
    "# Workflow wrappers",
    "",
    "Thin command adapters over `workflow_execute`:",
    "- `/workflow [objective]` seeds a starter `workflow_execute(...)` call in the editor",
    "- `/workflows` shows this short guide",
    "",
    "## Recommended first use",
    "",
    "```js",
    buildWorkflowExecuteInvocation(),
    "```",
    "",
    "## Selection guide",
    "- `dispatch_subagent` — one focused specialist worker via ASC",
    "- `cognitive_dispatch` — one task where cognition/tool choice is the main uncertainty",
    "- `loop_execute` — predefined orchestrator-owned cognitive framework",
    "- `workflow_execute` — explicit caller-authored chain/parallel/worktree graph",
    "- DSPy / DSPx — program/runtime optimization, replay, compile/eval, and empirical evolution",
    "",
    "## Interpretation",
    "- workflows here are caller-authored / operator-authored requests",
    "- the request names the graph explicitly; the agent executes it but does not silently redefine the topology",
    "- loops are different: they are predefined orchestrator-owned cognitive frameworks",
    "- subagents are the execution units underneath these higher-level orchestration surfaces",
    "- DSPy/DSPx concerns are different again: inner cognition/program runtimes and the engineering/optimization/replay layer around them",
    "",
    "## Notes",
    "- prefer chain for dependent work",
    "- use parallel only for independent tasks",
    "- reserve worktree mode for eligible mutation cases",
    "- wrappers are adapters only; `workflow_execute` remains the core surface",
  ].join("\n");
}

export function registerWorkflowCommands(pi: ExtensionAPI): void {
  pi.registerCommand("workflow", {
    description: "Seed a workflow_execute call in the editor: /workflow [objective]",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const objective = (args || "").trim();
      ctx.ui.setEditorText(buildWorkflowExecuteInvocation(objective || undefined));
      ctx.ui.notify(
        objective
          ? `Seeded workflow_execute chain for: ${objective}`
          : "Inserted starter workflow_execute template.",
        "info",
      );
    },
  });

  pi.registerCommand("workflows", {
    description: "Show workflow wrapper usage and examples",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      await ctx.ui.editor("Workflow wrappers", formatWorkflowWrapperGuide());
    },
  });
}

export interface WorkflowToolRegistrationOptions {
  sessionTeams: ReturnType<typeof getGlobalSessionTeamStore>;
  workflowCognitiveToolLookup: typeof getCognitiveToolByName;
  workflowExecutorFactory: typeof createWorkflowExecutor;
}

export function registerWorkflowTool(
  pi: ExtensionAPI,
  options: WorkflowToolRegistrationOptions,
): void {
  const { sessionTeams, workflowCognitiveToolLookup, workflowExecutorFactory } = options;
  registerCompatTool(pi, {
    name: "workflow_execute",
    label: "Execute Workflow",
    description: `Execute a bounded chain or parallel workflow composition over the ASC-backed subagent executor.

Supports:
- chain: sequential step execution; halts on first failure
- parallel: concurrent step execution within parallel groups
- worktree isolation: optional git worktree coordination for eligible parallel groups

Each step dispatches a named agent (scout, builder, reviewer, researcher) with a cognitive tool.
The workflow executor validates the request against the active team, preserves step-level status
and failureKind truth, and produces a structured aggregated output with workflow/group/task summaries.`,
    promptSnippet:
      "Execute a chain or parallel workflow composition over the orchestrator's ASC-backed subagent seam.",
    promptGuidelines: [
      "Use workflow_execute when the task decomposes into a structured sequence of agent steps rather than a single cognitive dispatch.",
      "Prefer chain mode for dependent steps; use parallel groups for independent work that can run concurrently.",
      "Set worktree: true on parallel groups only when steps may mutate files and git isolation is required.",
    ],
    parameters: Type.Object({
      request: Type.Object({
        mode: Type.Union([Type.Literal("chain"), Type.Literal("parallel")], {
          description:
            "Workflow mode: chain (sequential, halt on failure) or parallel (concurrent within groups)",
        }),
        cwd: Type.Optional(Type.String({ description: "Shared working directory for all steps" })),
        steps: Type.Array(
          Type.Union([
            Type.Object({
              kind: Type.Literal("step"),
              agent: Type.Union(WORKFLOW_AGENT_NAMES.map((name) => Type.Literal(name))),
              objective: Type.String({ description: "What this step should accomplish" }),
              cwd: Type.Optional(Type.String({ description: "Step-specific cwd override" })),
            }),
            Type.Object({
              kind: Type.Literal("parallel"),
              concurrency: Type.Optional(Type.Number({ description: "Max concurrent tasks" })),
              worktree: Type.Optional(Type.Boolean({ description: "Use git worktree isolation" })),
              tasks: Type.Array(
                Type.Object({
                  kind: Type.Literal("step"),
                  agent: Type.Union(WORKFLOW_AGENT_NAMES.map((name) => Type.Literal(name))),
                  objective: Type.String({ description: "What this task should accomplish" }),
                  cwd: Type.Optional(Type.String({ description: "Task-specific cwd override" })),
                }),
              ),
            }),
          ]),
        ),
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { request } = params as { request: unknown };
      const activeTeam = sessionTeams.getTeam(ctx);
      const model = ctx.model
        ? `${ctx.model.provider}/${ctx.model.id}`
        : "openrouter/google/gemini-2.5-flash-preview";

      // Preserve request/team validation precedence so malformed workflows fail without
      // consulting Prompt Vault or touching the execution substrate.
      const validatedRequest = validateWorkflowRequest(request, { activeTeam });
      if (!validatedRequest.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Workflow execution failed: Workflow request failed validation.\nIssues: ${validatedRequest.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`,
            },
          ],
          details: {
            ok: false,
            errorCode: "workflow_validation_failed",
            issues: validatedRequest.issues.map((issue) => ({
              path: issue.path,
              code: issue.code,
              message: issue.message,
            })),
          },
        };
      }

      // A valid workflow must never silently downgrade from its governed cognitive framework
      // to an ungoverned placeholder. Fail before constructing the executor or dispatching.
      let toolResult: Awaited<ReturnType<typeof getCognitiveToolByName>>;
      try {
        toolResult = await workflowCognitiveToolLookup("controlled", { cwd: ctx.cwd }, signal);
      } catch (error) {
        signal?.throwIfAborted();
        return workflowCognitiveToolUnavailable(
          validatedRequest.value.mode,
          "lookup_exception",
          error instanceof Error ? error.message : String(error),
        );
      }
      signal?.throwIfAborted();
      if (isBoundaryFailure(toolResult)) {
        return workflowCognitiveToolUnavailable(
          validatedRequest.value.mode,
          "boundary_failure",
          toolResult.error,
        );
      }
      if (!toolResult.value) {
        return workflowCognitiveToolUnavailable(
          validatedRequest.value.mode,
          "not_found",
          "Cognitive tool 'controlled' was not found.",
        );
      }
      const cognitiveToolContent = toolResult.value.content;
      if (!cognitiveToolContent.trim()) {
        return workflowCognitiveToolUnavailable(
          validatedRequest.value.mode,
          "empty_content",
          "Cognitive tool 'controlled' has empty content.",
        );
      }

      const workflowExecutor = workflowExecutorFactory({
        sessionsDir: path.join(os.homedir(), ".pi", "agent", "sessions", "workflows"),
      });

      try {
        const result = await workflowExecutor.execute({
          request,
          activeTeam,
          model,
          cwd: ctx.cwd,
          cognitiveToolContent,
          signal,
        });

        const statusIcon = result.status === "done" ? "✓" : "✗";
        const truncatedOutput =
          result.aggregatedOutput.length > 8000
            ? `${result.aggregatedOutput.slice(0, 8000)}\n\n... [truncated]`
            : result.aggregatedOutput;

        const summary = `${statusIcon} Workflow (${result.mode}) — ${result.status} — ${result.steps.length} step(s) executed`;

        return {
          content: [{ type: "text" as const, text: `${summary}\n\n${truncatedOutput}` }],
          details: {
            ok: result.status === "done",
            mode: result.mode,
            status: result.status,
            stepCount: result.steps.length,
            stepStatuses: result.steps.map((step) => ({
              index: step.index,
              agent: step.agent,
              status: step.status,
              failureKind: step.failureKind || null,
              provenance: step.provenance || null,
            })),
            worktreeSummary: result.worktreeSummary || null,
          },
        };
      } catch (error) {
        if (error instanceof WorkflowExecutionError) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Workflow execution failed: ${error.message}${error.issues ? `\nIssues: ${error.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}` : ""}`,
              },
            ],
            details: {
              ok: false,
              errorCode: error.code,
              issues:
                error.issues?.map((issue) => ({
                  path: issue.path,
                  code: issue.code,
                  message: issue.message,
                })) || [],
            },
          };
        }

        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Workflow execution failed: ${message}` }],
          details: { ok: false, error: message },
        };
      }
    },
    renderCall(args, theme) {
      const a = args as { request?: { mode?: string; steps?: unknown[] } };
      const mode = a.request?.mode || "?";
      const stepCount = a.request?.steps?.length ?? 0;
      return new Text(
        theme.fg("toolTitle", theme.bold("workflow_execute ")) +
          theme.fg("accent", mode) +
          theme.fg("dim", ` — ${stepCount} node(s)`),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as
        | { ok?: boolean; mode?: string; status?: string; stepCount?: number }
        | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text.slice(0, 200) : "", 0, 0);
      }

      const icon = details.ok ? "✓" : "✗";
      const color = details.ok ? "success" : "error";
      return new Text(
        theme.fg(color, `${icon} ${details.mode} workflow`) +
          theme.fg("dim", ` — ${details.status} — ${details.stepCount} step(s)`),
        0,
        0,
      );
    },
  });
}
