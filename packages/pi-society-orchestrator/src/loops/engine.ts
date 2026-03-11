/**
 * Loop Engine — Pluggable iteration frameworks (OODA, Strategic, Kaizen, ADKAR)
 *
 * Each plugin defines phases, cognitive tools per phase, and transition hooks.
 * The engine executes phases sequentially, recording evidence and diary entries.
 *
 * Note: the former `mito` loop name was retired because it collided with
 * Prof. Binner's MITO terminology already used elsewhere in the workspace.
 *
 * Usage:
 *   /loop ooda "Fix the authentication bug"
 *   /loop strategic "Plan the migration strategy"
 *   /loop kaizen "Improve test coverage"
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { AGENT_PROFILES } from "../runtime/agent-profiles.ts";
import { isBoundaryFailure } from "../runtime/boundaries.ts";
import { getCognitiveToolByName } from "../runtime/cognitive-tools.ts";

const DEFAULT_AK_PATH = path.join(
  os.homedir(),
  "ai-society",
  "softwareco",
  "owned",
  "agent-kernel",
  "target",
  "release",
  "ak",
);

// ============================================================================
// TYPES
// ============================================================================

export interface LoopPlugin {
  name: string;
  phases: string[];
  description: string;
  cognitiveTools: Record<string, string[]>;
  agents: Record<string, string>;
  onEnter?(phase: string, context: LoopContext): Promise<void>;
  onExit?(phase: string, context: LoopContext): Promise<Artifact[]>;
  validate?(from: string, to: string, context: LoopContext): boolean;
}

export interface LoopContext {
  sessionId: string;
  pluginName: string;
  objective: string;
  currentPhase: string;
  history: PhaseResult[];
  artifacts: Artifact[];
  cwd: string;
}

export interface PhaseResult {
  phase: string;
  output: string;
  exitCode: number;
  elapsed: number;
  artifacts: Artifact[];
  timestamp: Date;
}

export interface Artifact {
  type: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface LoopResult {
  plugin: string;
  objective: string;
  phases: PhaseResult[];
  artifacts: Artifact[];
  success: boolean;
  elapsed: number;
}

// ============================================================================
// BUILT-IN PLUGINS
// ============================================================================

export const OODA_PLUGIN: LoopPlugin = {
  name: "ooda",
  phases: ["observe", "orient", "decide", "act"],
  description: "OODA Loop — Observe, Orient, Decide, Act. Military-grade decision cycle.",
  cognitiveTools: {
    observe: ["telescopic", "dependency-cartography"],
    orient: ["inversion", "audit", "evidence-matrix"],
    decide: ["nexus", "constraint-inventory"],
    act: ["controlled", "atomic-completion"],
  },
  agents: {
    observe: "scout",
    orient: "reviewer",
    decide: "researcher",
    act: "builder",
  },
};

export const STRATEGIC_PLUGIN: LoopPlugin = {
  name: "strategic",
  phases: ["mission", "intelligence", "tooling", "operations"],
  description:
    "Strategic loop — Mission, Intelligence, Tooling, Operations. Strategic execution frame.",
  cognitiveTools: {
    mission: ["first-principles", "nexus"],
    intelligence: ["telescopic", "inversion"],
    tooling: ["audit", "blast-radius"],
    operations: ["controlled", "atomic-completion"],
  },
  agents: {
    mission: "researcher",
    intelligence: "scout",
    tooling: "reviewer",
    operations: "builder",
  },
};

export const KAIZEN_PLUGIN: LoopPlugin = {
  name: "kaizen",
  phases: ["plan", "do", "check", "act"],
  description: "Kaizen (PDCA) — Plan, Do, Check, Act. Continuous improvement cycle.",
  cognitiveTools: {
    plan: ["first-principles", "nexus", "constraint-inventory"],
    do: ["controlled", "atomic-completion"],
    check: ["audit", "inversion", "mirror"],
    act: ["knowledge-crystallization", "elevate"],
  },
  agents: {
    plan: "researcher",
    do: "builder",
    check: "reviewer",
    act: "researcher",
  },
};

export const ADKAR_PLUGIN: LoopPlugin = {
  name: "adkar",
  phases: ["awareness", "desire", "knowledge", "ability", "reinforcement"],
  description: "ADKAR — Awareness, Desire, Knowledge, Ability, Reinforcement. Change management.",
  cognitiveTools: {
    awareness: ["telescopic", "dependency-cartography"],
    desire: ["nexus", "decision"],
    knowledge: ["knowledge-crystallization", "first-principles"],
    ability: ["controlled", "atomic-completion"],
    reinforcement: ["elevate", "temporal-degradation"],
  },
  agents: {
    awareness: "scout",
    desire: "researcher",
    knowledge: "researcher",
    ability: "builder",
    reinforcement: "reviewer",
  },
};

export const TRANSCENDENT_PLUGIN: LoopPlugin = {
  name: "transcendent",
  phases: ["diagnose", "first-100x", "second-100x", "rebuild", "debt"],
  description: "Transcendent Iteration — Diagnose → 100x → 100x → Rebuild → Name Debt",
  cognitiveTools: {
    diagnose: ["inversion", "first-principles"],
    "first-100x": ["nexus", "controlled"],
    "second-100x": ["audit", "telescopic"],
    rebuild: ["first-principles", "atomic-completion"],
    debt: ["knowledge-crystallization"],
  },
  agents: {
    diagnose: "scout",
    "first-100x": "builder",
    "second-100x": "reviewer",
    rebuild: "builder",
    debt: "researcher",
  },
};

export const BUILT_IN_PLUGINS: Record<string, LoopPlugin> = {
  ooda: OODA_PLUGIN,
  strategic: STRATEGIC_PLUGIN,
  kaizen: KAIZEN_PLUGIN,
  adkar: ADKAR_PLUGIN,
  transcendent: TRANSCENDENT_PLUGIN,
};

// ============================================================================
// DIARY WRITER
// ============================================================================

export class DiaryWriter {
  private diaryDir: string;

  constructor(cwd: string) {
    this.diaryDir = path.join(cwd, "diary");
    if (!fs.existsSync(this.diaryDir)) {
      fs.mkdirSync(this.diaryDir, { recursive: true });
    }
  }

  writeEntry(entry: {
    type: string;
    plugin?: string;
    phase?: string;
    objective?: string;
    result?: string;
    artifacts?: string[];
    metadata?: Record<string, unknown>;
  }): string {
    const date = new Date().toISOString().slice(0, 10);
    const baseName = `${date}--loop-${entry.plugin || "unknown"}-${entry.type}`;
    const fileName = this.findAvailableFileName(baseName);
    const filePath = path.join(this.diaryDir, fileName);

    const content = `# ${date} — Loop: ${entry.plugin || "unknown"} (${entry.type})

## Context
- Plugin: ${entry.plugin || "N/A"}
- Phase: ${entry.phase || "N/A"}
- Objective: ${entry.objective || "N/A"}

## Result
${entry.result || "No result recorded"}

## Artifacts
${entry.artifacts?.map((a) => `- ${a}`).join("\n") || "None"}

## Metadata
\`\`\`json
${JSON.stringify(entry.metadata || {}, null, 2)}
\`\`\`
`;

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  private findAvailableFileName(baseName: string): string {
    let fileName = `${baseName}.md`;
    let i = 2;
    while (fs.existsSync(path.join(this.diaryDir, fileName))) {
      fileName = `${baseName}--${i}.md`;
      i++;
    }
    return fileName;
  }
}

// ============================================================================
// AGENT-KERNEL CLI WRAPPER
// ============================================================================

export class AgentKernel {
  private akPath: string;

  constructor(akPath: string = fs.existsSync(DEFAULT_AK_PATH) ? DEFAULT_AK_PATH : "ak") {
    this.akPath = akPath;
  }

  async taskReady(): Promise<Array<{ id: number; title: string; repo: string }>> {
    const output = await this.run(["task", "ready", "--format", "json"]);
    try {
      return JSON.parse(output);
    } catch {
      return [];
    }
  }

  async taskClaim(taskId: number, agent: string, lease: number = 3600): Promise<boolean> {
    try {
      await this.run(["task", "claim", String(taskId), "--agent", agent, "--lease", String(lease)]);
      return true;
    } catch {
      return false;
    }
  }

  async taskComplete(taskId: number, result: Record<string, unknown>): Promise<boolean> {
    try {
      await this.run(["task", "complete", String(taskId), "--result", JSON.stringify(result)]);
      return true;
    } catch {
      return false;
    }
  }

  async evidenceRecord(params: {
    task_id?: number;
    check_type: string;
    result: "pass" | "fail" | "skip";
    details?: Record<string, unknown>;
  }): Promise<boolean> {
    try {
      const args = [
        "evidence",
        "record",
        "--check-type",
        params.check_type,
        "--result",
        params.result,
      ];
      if (params.task_id) {
        args.push("--task", String(params.task_id));
      }
      if (params.details) {
        args.push("--details", JSON.stringify(params.details));
      }
      await this.run(args);
      return true;
    } catch {
      return false;
    }
  }

  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.akPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      proc.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `ak exited with code ${code}`));
        }
      });

      proc.on("error", reject);
    });
  }
}

// ============================================================================
// LOOP EXECUTOR
// ============================================================================

export class LoopExecutor {
  private plugin: LoopPlugin;
  private diary: DiaryWriter;
  private ak: AgentKernel;

  constructor(
    plugin: LoopPlugin,
    cwd: string,
    _vaultDir: string,
    akPath: string = fs.existsSync(DEFAULT_AK_PATH) ? DEFAULT_AK_PATH : "ak",
  ) {
    this.plugin = plugin;
    this.diary = new DiaryWriter(cwd);
    this.ak = new AgentKernel(akPath);
    const sessionsDir = path.join(os.homedir(), ".pi", "agent", "sessions", "loops");
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
  }

  async execute(
    objective: string,
    dispatchFn: (params: {
      agent: string;
      cognitiveTool: string;
      context: string;
    }) => Promise<{ output: string; exitCode: number; elapsed: number }>,
  ): Promise<LoopResult> {
    const startTime = Date.now();
    const sessionId = `${this.plugin.name}-${Date.now()}`;

    const context: LoopContext = {
      sessionId,
      pluginName: this.plugin.name,
      objective,
      currentPhase: "",
      history: [],
      artifacts: [],
      cwd: process.cwd(),
    };

    // Write loop start to diary
    this.diary.writeEntry({
      type: "start",
      plugin: this.plugin.name,
      objective,
      metadata: { sessionId, phases: this.plugin.phases },
    });

    let success = true;

    for (let i = 0; i < this.plugin.phases.length; i++) {
      const phase = this.plugin.phases[i];
      context.currentPhase = phase;

      // Phase enter hook
      if (this.plugin.onEnter) {
        await this.plugin.onEnter(phase, context);
      }

      // Get cognitive tools and agent for this phase
      const tools = this.plugin.cognitiveTools[phase] || [];
      const agent = this.plugin.agents[phase] || "scout";
      const primaryTool = tools[0] || "first-principles";

      // Build context for this phase
      const phaseContext = this.buildPhaseContext(phase, objective, context);

      // Dispatch agent with cognitive tool
      const _phaseStart = Date.now();
      const result = await dispatchFn({
        agent,
        cognitiveTool: primaryTool,
        context: phaseContext,
      });

      const phaseResult: PhaseResult = {
        phase,
        output: result.output,
        exitCode: result.exitCode,
        elapsed: result.elapsed,
        artifacts: [],
        timestamp: new Date(),
      };

      // Record evidence
      await this.ak.evidenceRecord({
        check_type: `loop:${this.plugin.name}:${phase}`,
        result: result.exitCode === 0 ? "pass" : "fail",
        details: {
          sessionId,
          objective: objective.slice(0, 100),
          elapsed: result.elapsed,
        },
      });

      // Phase exit hook
      if (this.plugin.onExit) {
        const artifacts = await this.plugin.onExit(phase, context);
        phaseResult.artifacts = artifacts;
        context.artifacts.push(...artifacts);
      }

      context.history.push(phaseResult);

      // Write phase completion to diary
      this.diary.writeEntry({
        type: "phase",
        plugin: this.plugin.name,
        phase,
        objective,
        result: result.output.slice(0, 500),
        artifacts: phaseResult.artifacts.map((a) => a.type),
        metadata: { exitCode: result.exitCode, elapsed: result.elapsed },
      });

      if (result.exitCode !== 0) {
        success = false;
        // Continue to next phase even on failure (resilient loop)
      }
    }

    // Write loop completion to diary
    this.diary.writeEntry({
      type: "complete",
      plugin: this.plugin.name,
      objective,
      result: success ? "Success" : "Completed with failures",
      artifacts: context.artifacts.map((a) => a.type),
      metadata: {
        sessionId,
        success,
        elapsed: Date.now() - startTime,
        phases: context.history.length,
      },
    });

    return {
      plugin: this.plugin.name,
      objective,
      phases: context.history,
      artifacts: context.artifacts,
      success,
      elapsed: Date.now() - startTime,
    };
  }

  private buildPhaseContext(phase: string, objective: string, context: LoopContext): string {
    const previousResults = context.history
      .map((h) => `## ${h.phase}\n${h.output.slice(0, 500)}`)
      .join("\n\n");

    return `# Loop: ${this.plugin.name.toUpperCase()}
## Phase: ${phase}
## Session: ${context.sessionId}

## Objective
${objective}

${previousResults ? `## Previous Phases\n${previousResults}` : ""}

## Your Task
Execute the **${phase}** phase of the ${this.plugin.name.toUpperCase()} loop.
Focus on what this phase requires. Use the cognitive tools available to you.
`;
  }
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

export function registerLoopTools(
  pi: ExtensionAPI,
  plugins: Record<string, LoopPlugin> = BUILT_IN_PLUGINS,
  vaultDir: string = process.env.VAULT_DIR ||
    path.join(os.homedir(), "ai-society", "core", "prompt-vault", "prompt-vault-db"),
): void {
  pi.registerTool({
    name: "loop_execute",
    label: "Execute Loop",
    description: `Execute a structured iteration loop with cognitive tools.

Available loops:
- ooda: Observe → Orient → Decide → Act (military-grade decision cycle)
- strategic: Mission → Intelligence → Tooling → Operations (strategic execution; renamed from the old 'mito' label to avoid collision with Prof. Binner's MITO)
- kaizen: Plan → Do → Check → Act (continuous improvement)
- adkar: Awareness → Desire → Knowledge → Ability → Reinforcement (change management)
- transcendent: Diagnose → 100x → 100x → Rebuild → Name Debt (100x improvement)

Each phase injects the appropriate cognitive tool and dispatches an agent.
Results are recorded to diary/ and evidence ledger.`,
    parameters: Type.Object({
      loop: Type.Union(
        [
          Type.Literal("ooda"),
          Type.Literal("strategic"),
          Type.Literal("kaizen"),
          Type.Literal("adkar"),
          Type.Literal("transcendent"),
        ],
        { description: "Loop type to execute" },
      ),
      objective: Type.String({ description: "The objective to accomplish through the loop" }),
    }),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const { loop, objective } = params as { loop: string; objective: string };

      if (loop === "mito") {
        return {
          content: [
            {
              type: "text",
              text: "The `mito` loop name was retired because it collided with Prof. Binner's MITO. Use `strategic` instead.",
            },
          ],
          details: { ok: false, renamed_to: "strategic" },
        };
      }

      const plugin = plugins[loop];
      if (!plugin) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown loop: ${loop}. Available: ${Object.keys(plugins).join(", ")}`,
            },
          ],
          details: { ok: false },
        };
      }

      if (onUpdate) {
        onUpdate({
          content: [{ type: "text", text: `Starting ${loop.toUpperCase()} loop...` }],
          details: { loop, objective, status: "starting" },
        });
      }

      const executor = new LoopExecutor(plugin, ctx.cwd, vaultDir);

      // Create dispatch function using shared agent profiles + vault-loaded cognitive tools.
      const dispatch = async (p: { agent: string; cognitiveTool: string; context: string }) => {
        const agentProfile = AGENT_PROFILES[p.agent] || AGENT_PROFILES.scout;
        const toolResult = getCognitiveToolByName(vaultDir, p.cognitiveTool);
        if (isBoundaryFailure(toolResult)) {
          return {
            output: `Failed to load cognitive tool '${p.cognitiveTool}': ${toolResult.error}`,
            exitCode: 1,
            elapsed: 0,
          };
        }

        if (!toolResult.value) {
          return {
            output: `Cognitive tool not found: ${p.cognitiveTool}`,
            exitCode: 1,
            elapsed: 0,
          };
        }

        const combinedPrompt = `${agentProfile.systemPrompt}

---

${toolResult.value.content}

---

## LOOP EXECUTION CONTEXT
- Agent profile: ${agentProfile.name}
- Cognitive tool: ${toolResult.value.name}`;
        const model = ctx.model
          ? `${ctx.model.provider}/${ctx.model.id}`
          : "openrouter/google/gemini-2.5-flash-preview";
        const sessionFile = path.join(
          os.homedir(),
          ".pi",
          "agent",
          "sessions",
          "loops",
          `${agentProfile.name}-${toolResult.value.name}-${Date.now()}.json`,
        );

        return new Promise<{ output: string; exitCode: number; elapsed: number }>((resolve) => {
          const startTime = Date.now();
          const args = [
            "--mode",
            "json",
            "-p",
            "--no-extensions",
            "--model",
            model,
            "--tools",
            agentProfile.tools,
            "--thinking",
            "off",
            "--append-system-prompt",
            combinedPrompt,
            "--session",
            sessionFile,
            p.context,
          ];

          const proc = spawn("pi", args, { stdio: ["ignore", "pipe", "pipe"] });
          const chunks: string[] = [];
          let buffer = "";
          let stderr = "";

          proc.stdout?.setEncoding("utf-8");
          proc.stdout?.on("data", (chunk: string) => {
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const event = JSON.parse(line);
                if (
                  event.type === "message_update" &&
                  event.assistantMessageEvent?.type === "text_delta"
                ) {
                  chunks.push(event.assistantMessageEvent.delta || "");
                }
              } catch {}
            }
          });

          proc.stderr?.setEncoding("utf-8");
          proc.stderr?.on("data", (chunk: string) => {
            stderr += chunk;
          });
          proc.on("close", (code) => {
            resolve({
              output: chunks.join("") || stderr || `pi exited with code ${code ?? 1}`,
              exitCode: code ?? 1,
              elapsed: Date.now() - startTime,
            });
          });
          proc.on("error", (error) => {
            resolve({
              output: `Spawn error: ${error.message}`,
              exitCode: 1,
              elapsed: Date.now() - startTime,
            });
          });
        });
      };

      try {
        const result = await executor.execute(objective, dispatch);

        const summary = `# ${loop.toUpperCase()} Loop Complete

**Objective:** ${objective}
**Status:** ${result.success ? "✓ Success" : "✗ Completed with failures"}
**Elapsed:** ${Math.round(result.elapsed / 1000)}s

## Phases
${result.phases.map((p) => `- ${p.phase}: ${p.exitCode === 0 ? "✓" : "✗"} (${Math.round(p.elapsed / 1000)}s)`).join("\n")}

## Artifacts
${result.artifacts.map((a) => `- ${a.type}`).join("\n") || "None"}

## Diary
Entries written to \`diary/\` directory.
`;

        return {
          content: [{ type: "text", text: summary }],
          details: { ok: true, result },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Loop execution failed: ${err}` }],
          details: { ok: false },
        };
      }
    },
    renderCall(args, theme) {
      const a = args as { loop?: string; objective?: string };
      return new Text(
        theme.fg("toolTitle", theme.bold("loop_execute ")) +
          theme.fg("accent", a.loop || "?") +
          theme.fg("dim", " — ") +
          theme.fg("muted", (a.objective || "").slice(0, 40)),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as { ok?: boolean; result?: LoopResult } | undefined;
      if (!details?.result) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }
      const icon = details.ok ? "✓" : "✗";
      const color = details.ok ? "success" : "error";
      return new Text(
        theme.fg(color, `${icon} ${details.result.plugin}`) +
          theme.fg("dim", ` ${Math.round(details.result.elapsed / 1000)}s`),
        0,
        0,
      );
    },
  });
}

export function buildLoopExecuteInvocation(loop: string, objective: string): string {
  return `loop_execute({ loop: ${JSON.stringify(loop)}, objective: ${JSON.stringify(objective)} })`;
}

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

export function registerLoopCommands(
  pi: ExtensionAPI,
  plugins: Record<string, LoopPlugin> = BUILT_IN_PLUGINS,
): void {
  pi.registerCommand("loop", {
    description: "Execute a loop: /loop <type> <objective>",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const parts = (args || "").trim().split(/\s+/);
      if (parts.length < 2) {
        ctx.ui.notify(
          `Usage: /loop <type> <objective>\n\nAvailable: ${Object.keys(plugins).join(", ")}`,
          "warning",
        );
        return;
      }

      const loopType = parts[0];
      const objective = parts.slice(1).join(" ");

      if (loopType === "mito") {
        ctx.ui.notify(
          "The `mito` loop name was retired because it collided with Prof. Binner's MITO. Use `strategic` instead.",
          "error",
        );
        ctx.ui.setEditorText(buildLoopExecuteInvocation("strategic", objective));
        return;
      }

      const plugin = plugins[loopType];
      if (!plugin) {
        ctx.ui.notify(
          `Unknown loop: ${loopType}. Available: ${Object.keys(plugins).join(", ")}`,
          "error",
        );
        return;
      }

      ctx.ui.notify(`Starting ${loopType.toUpperCase()} loop...`, "info");
      // The actual execution happens via the loop_execute tool
      ctx.ui.setEditorText(buildLoopExecuteInvocation(loopType, objective));
    },
  });

  pi.registerCommand("loops", {
    description: "List available loop types",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const list = Object.entries(plugins)
        .map(
          ([name, plugin]) =>
            `## ${name}\n${plugin.description}\nPhases: ${plugin.phases.join(" → ")}`,
        )
        .join("\n\n");

      await ctx.ui.editor("Available Loops", list);
    },
  });
}
