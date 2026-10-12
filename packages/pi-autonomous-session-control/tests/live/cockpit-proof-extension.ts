// Opt-in native TUI proof fixture: deterministic controller provider, real ASC child/provider.
// Never loaded by the package manifest. Paths and child model are explicitly supplied by the driver.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createSubagentState, registerSubagentTool } from "../../extensions/self/subagent.ts";
import { registerSubagentDashboard } from "../../extensions/self/subagent-dashboard.ts";

export default function proof(pi: ExtensionAPI) {
  const root = process.env.ASC_COCKPIT_PROOF_ROOT;
  const model = process.env.ASC_COCKPIT_PROOF_MODEL;
  if (!root || !model) throw new Error("Explicit proof scratch and real child model required");
  const state = createSubagentState(join(root, "sessions"));
  registerSubagentTool(pi, state, () => model);
  registerSubagentDashboard(pi, state);
  pi.registerProvider("cockpit-proof", {
    api: "cockpit-proof-api",
    apiKey: "local-fixture",
    baseUrl: "http://invalid.local",
    models: [
      {
        id: "controller",
        name: "Deterministic proof controller (real child)",
        reasoning: false,
        input: ["text"],
        contextWindow: 1000000,
        maxTokens: 10000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
    streamSimple: (selected, context) => {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const last = context.messages.at(-1);
        const text = JSON.stringify(last?.content);
        const cancel = text?.includes("CANCEL-PROOF");
        const isRequest = last?.role === "user";
        const call = {
          type: "toolCall" as const,
          id: `proof-${Date.now()}`,
          name: "dispatch_subagent",
          arguments: {
            profile: "minimal",
            name: cancel ? "cancel-proof" : "steering-proof",
            tools: "bash",
            thinking: "off",
            objective: cancel
              ? "This is an owner-authorized AK7039 cancellation proof. Use bash once to run sleep 90. Do not edit any files. Finish with CANCEL_FINISHED if not cancelled."
              : "This is an owner-authorized AK7039 live guidance proof. Do not edit files or execute anything besides one bash call: printf 'COCKPIT_TOOL_STARTED\\n'; sleep 40; printf 'COCKPIT_TOOL_FINISHED\\n'. After that tool finishes, read any new operator guidance in your context before responding. Finish concisely with ORIGINAL unless new guidance changes that final word.",
          },
        };
        const content = isRequest
          ? [call]
          : [{ type: "text" as const, text: "PROOF_TOOL_SETTLED" }];
        const message = {
          role: "assistant" as const,
          api: selected.api,
          provider: selected.provider,
          model: selected.id,
          timestamp: Date.now(),
          content,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: isRequest ? ("toolUse" as const) : ("stop" as const),
        };
        stream.push({ type: "start", partial: message });
        if (isRequest) {
          stream.push({ type: "toolcall_start", contentIndex: 0, partial: message });
          stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: message });
        } else {
          stream.push({ type: "text_start", contentIndex: 0, partial: message });
          stream.push({
            type: "text_delta",
            contentIndex: 0,
            delta: "PROOF_TOOL_SETTLED",
            partial: message,
          });
          stream.push({
            type: "text_end",
            contentIndex: 0,
            content: "PROOF_TOOL_SETTLED",
            partial: message,
          });
        }
        stream.push({ type: "done", reason: message.stopReason, message });
        stream.end();
      });
      return stream;
    },
  });
  pi.registerCommand("proof-draft", {
    description: "Set this test's main editor draft",
    handler: (_args, ctx) => {
      ctx.ui.setEditorText("MAIN_DRAFT_MUST_SURVIVE");
      writeFileSync(
        join(root, "main-draft-set.json"),
        JSON.stringify({ draft: ctx.ui.getEditorText() }),
      );
    },
  });
  pi.registerCommand("proof-check-draft", {
    description: "Read this test's main editor draft",
    handler: (_args, ctx) => {
      writeFileSync(
        join(root, "main-draft-read.json"),
        JSON.stringify({ draft: ctx.ui.getEditorText() }),
      );
    },
  });
  pi.registerShortcut("ctrl+alt+shift+d", {
    description: "Read proof main draft without changing it",
    handler: (ctx) => {
      writeFileSync(
        join(root, "main-draft-read.json"),
        JSON.stringify({ draft: ctx.ui.getEditorText() }),
      );
    },
  });
  pi.on("session_start", (_event, ctx) => {
    writeFileSync(
      join(root, "ready.json"),
      JSON.stringify({
        sessionId: ctx.sessionManager.getSessionId(),
        cwd: ctx.cwd,
        mode: ctx.mode,
      }),
    );
  });
  pi.on("tool_execution_end", (event) => {
    if (event.toolName === "dispatch_subagent")
      writeFileSync(join(root, "tool-result.json"), JSON.stringify(event));
  });
}
