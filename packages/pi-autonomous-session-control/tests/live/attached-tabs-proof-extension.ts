// Explicit live qualification fixture: deterministic controller, two real original ASC children.
// Does not implement a viewer or substitute attachment commands/host logic.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSubagentState, registerSubagentTool } from "../../extensions/self/subagent.ts";
import { registerSubagentDashboard } from "../../extensions/self/subagent-dashboard.ts";

export default function proof(pi: ExtensionAPI): void {
  const root = process.env.ASC_TABS_PROOF_ROOT;
  const model = process.env.ASC_TABS_PROOF_MODEL;
  if (!root || !model) throw new Error("Explicit proof root and real child model required");
  if (process.env.ASC_TABS_PROOF_INSTALLED !== "1") {
    const state = createSubagentState(join(root, "sessions"));
    registerSubagentTool(pi, state, () => model);
    registerSubagentDashboard(pi, state);
  }
  pi.registerCommand("proof-refuse-tabs", {
    description: "Verify unavailable target refuses before any tab effect",
    handler: async (_args, ctx) => {
      const surface = process.env.GHOSTTY_SURFACE_ID;
      try {
        process.env.GHOSTTY_SURFACE_ID = "0";
        await (
          await import("../../extensions/self/subagent-attachment-commands.ts")
        ).requestSubagentTabs(
          pi,
          {
            sessionsDir: join(root, "sessions"),
            activeCount: 0,
            completedCount: 0,
            maxConcurrent: 0,
            reservedSessionNames: new Set(),
          },
          ctx,
        );
        writeFileSync(
          join(root, "refusal.json"),
          JSON.stringify({ target: "zero", completed: true }),
        );
      } finally {
        if (surface === undefined) delete process.env.GHOSTTY_SURFACE_ID;
        else process.env.GHOSTTY_SURFACE_ID = surface;
      }
    },
  });
  let authorizedStart = false;
  let dispatched = false;
  pi.on("before_agent_start", (event) => {
    authorizedStart = !dispatched && event.prompt.trim() === "START_TWO_ORIGINAL_CHILDREN";
  });
  pi.registerProvider("tabs-proof", {
    api: "tabs-proof-api",
    apiKey: "local-fixture",
    baseUrl: "http://invalid.local",
    models: [
      {
        id: "controller",
        name: "Deterministic tab proof controller",
        reasoning: false,
        input: ["text"],
        contextWindow: 1000000,
        maxTokens: 10000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
    streamSimple: (selected) => {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const initial = authorizedStart && !dispatched;
        if (initial) {
          dispatched = true;
          authorizedStart = false;
        }
        const calls = ["alpha", "beta"].map((name) => {
          const command = `printf 'TAB_${name.toUpperCase()}_STARTED\\n'; while [ ! -f '${root}/release' ]; do sleep 0.2; done; printf 'TAB_${name.toUpperCase()}_FINISHED\\n'`;
          return {
            type: "toolCall" as const,
            id: `${name}-${Date.now()}`,
            name: "dispatch_subagent",
            arguments: {
              profile: "minimal",
              name: `tab-${name}`,
              tools: "bash",
              thinking: "off",
              objective: `Owner-authorized AK7039 native attached-view verification. Do not edit any files or run anything besides one bash call with this exact command: ${command}. After it finishes, read any new operator guidance in your context before responding. Finish concisely with ORIGINAL_${name.toUpperCase()} unless guidance changes that word.`,
              mutationPolicy: "read_only",
              forbiddenPaths: ["**"],
            },
          };
        });
        const message = {
          role: "assistant" as const,
          api: selected.api,
          provider: selected.provider,
          model: selected.id,
          timestamp: Date.now(),
          content: initial ? calls : [{ type: "text" as const, text: "ORIGINAL_CHILDREN_SETTLED" }],
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: initial ? ("toolUse" as const) : ("stop" as const),
        };
        stream.push({ type: "start", partial: message });
        if (initial)
          calls.forEach((call, index) => {
            stream.push({ type: "toolcall_start", contentIndex: index, partial: message });
            stream.push({
              type: "toolcall_end",
              contentIndex: index,
              toolCall: call,
              partial: message,
            });
          });
        else {
          stream.push({ type: "text_start", contentIndex: 0, partial: message });
          stream.push({
            type: "text_delta",
            contentIndex: 0,
            delta: "ORIGINAL_CHILDREN_SETTLED",
            partial: message,
          });
          stream.push({
            type: "text_end",
            contentIndex: 0,
            content: "ORIGINAL_CHILDREN_SETTLED",
            partial: message,
          });
        }
        stream.push({ type: "done", reason: message.stopReason, message });
        stream.end();
      });
      return stream;
    },
  });
  pi.on("session_start", (_event, ctx) => {
    writeFileSync(
      join(root, "ready.json"),
      JSON.stringify({
        pid: process.pid,
        sessionId: ctx.sessionManager.getSessionId(),
        cwd: ctx.cwd,
        mode: ctx.mode,
      }),
    );
  });
  pi.on("tool_execution_end", (event) => {
    if (event.toolName === "dispatch_subagent")
      writeFileSync(join(root, `${event.toolCallId}.result.json`), JSON.stringify(event));
  });
}
