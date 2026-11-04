/**
 * summary: "exercises /commit fallback through real Pi 1.1 lifecycle with offline synthetic providers only."
 * read_when:
 *   - "changing boundary continuation, failure omission, or model restoration."
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import extension from "../extensions/prompt-template-execution.js";

for (const mode of ["quota", "partial", "fallback-error", "sticky", "retry-exhausted"]) {
  test(
    `real host: ${mode} keeps one user prompt and truthful failure history`,
    { timeout: 30000 },
    async () => {
      const originalHome = process.env.HOME;
      const home = await mkdtemp(path.join(os.tmpdir(), "ptx-fallback-host-"));
      process.env.HOME = home;
      let session;
      try {
        const agentDir = path.join(home, ".pi", "agent");
        await mkdir(path.join(agentDir, "prompts"), { recursive: true });
        await writeFile(
          path.join(agentDir, "prompts", "commit.md"),
          `---\nmodel: fallback-quota/override\n${mode === "sticky" ? "restore: false\n" : ""}---\nCommit only authorized files: $ARGUMENTS`,
        );
        const calls = [];
        const errors = [];
        const modelRuntime = await ModelRuntime.create({
          authPath: path.join(agentDir, "auth.json"),
          modelsPath: null,
          allowModelNetwork: false,
          refreshOnCreate: false,
          modelsStorePath: path.join(home, "model-cache"),
        });
        for (const [provider, id] of [
          ["fallback-current", "active"],
          ["fallback-quota", "override"],
        ]) {
          modelRuntime.registerProvider(provider, {
            api: `offline-${provider}`,
            apiKey: "synthetic-test-only",
            baseUrl: "http://invalid.invalid",
            models: [
              {
                id,
                name: id,
                reasoning: true,
                input: ["text"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 128000,
                maxTokens: 2048,
              },
            ],
            streamSimple(model, context) {
              calls.push({ provider: model.provider, messages: context.messages });
              const stream = new AssistantMessageEventStream();
              const failed = provider === "fallback-quota" || mode === "fallback-error";
              const message = {
                role: "assistant",
                api: model.api,
                provider: model.provider,
                model: model.id,
                content:
                  mode === "partial"
                    ? [{ type: "text", text: "Partial output" }]
                    : failed
                      ? []
                      : [{ type: "text", text: "FALLBACK_OK" }],
                usage: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 0,
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
                timestamp: Date.now(),
                stopReason: failed ? "error" : "stop",
                ...(failed
                  ? {
                      errorMessage:
                        mode === "retry-exhausted"
                          ? "503: temporarily unavailable"
                          : "429: Go usage limit exceeded",
                    }
                  : {}),
              };
              queueMicrotask(() => {
                stream.push({ type: "start", partial: message });
                stream.push(
                  failed
                    ? { type: "error", reason: "error", error: message }
                    : { type: "done", reason: "stop", message },
                );
                stream.end();
              });
              return stream;
            },
          });
        }
        await modelRuntime.refresh({ network: false });
        const settingsManager = SettingsManager.inMemory({
          compaction: { enabled: false },
          retry: {
            enabled: mode === "retry-exhausted",
            maxRetries: 1,
            baseDelayMs: 1,
            maxAgentDelayMs: 10,
          },
        });
        const resourceLoader = new DefaultResourceLoader({
          cwd: home,
          agentDir,
          settingsManager,
          noExtensions: true,
          noSkills: true,
          noThemes: true,
          noPromptTemplates: true,
          extensionFactories: [extension],
          agentsFilesOverride: () => ({ agentsFiles: [] }),
          systemPromptOverride: () => "Offline model-fallback integration test.",
        });
        await resourceLoader.reload();
        assert.deepEqual(resourceLoader.getExtensions().errors, []);
        ({ session } = await createAgentSession({
          cwd: home,
          agentDir,
          modelRuntime,
          resourceLoader,
          settingsManager,
          model: modelRuntime.getModel("fallback-current", "active"),
          thinkingLevel: "high",
          noTools: true,
          sessionManager: SessionManager.inMemory(home),
        }));
        await session.bindExtensions({ onError: (error) => errors.push(error) });
        const settled = new Promise((resolve) =>
          session.subscribe((event) => {
            if (event.type === "agent_settled") resolve();
          }),
        );
        await session.prompt("/commit selected-paths");
        await settled;
        assert.deepEqual(errors, []);
        assert.equal(calls[0]?.provider, "fallback-quota");
        assert.equal(calls.length, mode === "partial" ? 1 : mode === "retry-exhausted" ? 3 : 2);
        const branch = session.sessionManager.getBranch();
        assert.equal(
          branch.filter((entry) => entry.type === "message" && entry.message.role === "user")
            .length,
          1,
        );
        assert.equal(session.model.provider, "fallback-current");
        assert.equal(session.thinkingLevel, "high");
        if (mode !== "partial") {
          assert.equal(calls.at(-1).provider, "fallback-current");
          assert.ok(
            branch.some((entry) => entry.type === "context_edit" && entry.replacement === null),
          );
          assert.ok(
            branch.some(
              (entry) =>
                entry.type === "message" &&
                entry.message.errorMessage?.includes(mode === "retry-exhausted" ? "503" : "429"),
            ),
          );
          assert.equal(
            calls
              .at(-1)
              .messages.some(
                (message) => message.role === "assistant" && message.stopReason === "error",
              ),
            false,
          );
        }
      } finally {
        session?.dispose();
        process.env.HOME = originalHome;
        await rm(home, { recursive: true, force: true });
      }
    },
  );
}
