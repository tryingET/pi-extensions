import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  buildCompatibilityCanaryReport,
  summarizeExecutionPlan,
  summarizePromptLoadResult,
} from "../src/compat-canary.js";
import { preparePromptExecutionPlan } from "../src/execution-plan.js";
import { loadPromptTemplates } from "../src/loader.js";

const tempDirs = [];
const COMMIT_FIXTURE = new URL("./fixtures/commit.md", import.meta.url);

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptx-exec-canary-"));
  tempDirs.push(dir);
  return dir;
}

async function writePrompt(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return filePath;
}

function createModel(overrides = {}) {
  return {
    id: "claude-sonnet-4",
    provider: "anthropic",
    name: "Claude Sonnet",
    reasoning: true,
    ...overrides,
  };
}

function createRegistry(models, available = models) {
  return {
    getAll() {
      return models;
    },
    getAvailable() {
      return available;
    },
    isUsingOAuth() {
      return false;
    },
    async getApiKeyAndHeaders(model) {
      return { ok: true, apiKey: `key:${model.provider}` };
    },
  };
}

describe("prompt-template-model compatibility canary", () => {
  it("matches external-compatible prompt loading decisions and command descriptions", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(globalDir, "commit.md", await readFile(COMMIT_FIXTURE, "utf8"));
    await writePrompt(globalDir, "plain.md", "---\ndescription: Plain core prompt\n---\nPlain");
    await writePrompt(projectDir, "bad.md", "---\nmodel: anthropic/*\n---\nBad");
    const loadResult = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir });

    const expectedLoadSummary = {
      claimed: ["commit"],
      prompts: [
        {
          name: "commit",
          description:
            "Deterministic multi-commit workflow with explicit staging, fail-fast validation, concise success reporting, and commit-local provenance notes",
          commandDescription:
            "Deterministic multi-commit workflow with explicit staging, fail-fast validation, concise success reporting, and commit-local provenance notes [glm-5.1] (user)",
          models: ["zai/glm-5.1"],
          restore: true,
          thinking: undefined,
          skill: undefined,
          source: "user",
          subdir: undefined,
        },
      ],
      diagnosticCodes: ["invalid-model-spec"],
    };

    assert.deepEqual(summarizePromptLoadResult(loadResult), expectedLoadSummary);
    const report = buildCompatibilityCanaryReport({ loadResult, expectedLoadSummary });
    assert.equal(report.kind, "pi-prompt-template-execution/compat-canary/v1");
    assert.equal(report.liveMutation, false);
    assert.equal(report.ok, true);
  });

  it("matches external-compatible /commit execution-plan fixture", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(globalDir, "commit.md", await readFile(COMMIT_FIXTURE, "utf8"));
    const prompt = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir }).prompts.get(
      "commit",
    );
    const current = createModel({ provider: "openai-codex", id: "gpt-5.4" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });

    const plan = await preparePromptExecutionPlan(
      prompt,
      "scope package-local changes",
      current,
      createRegistry([current, target]),
    );
    const summary = summarizeExecutionPlan(plan);

    assert.equal(summary.kind, "ready");
    assert.equal(summary.promptName, "commit");
    assert.equal(summary.selectedModel, "zai/glm-5.1");
    assert.equal(summary.alreadyActive, false);
    assert.deepEqual(summary.switchModel, {
      from: "openai-codex/gpt-5.4",
      to: "zai/glm-5.1",
    });
    assert.equal(summary.restoreModel, "openai-codex/gpt-5.4");
    assert.equal(summary.thinking, undefined);
    assert.match(summary.content, /You are the commit orchestrator\./);
    assert.match(summary.content, /scope package-local changes\s*$/);

    const expectedExecutionPlans = {
      commit: summary,
    };
    const report = buildCompatibilityCanaryReport({
      executionPlans: { commit: plan },
      expectedExecutionPlans,
    });
    assert.equal(report.ok, true);
  });

  it("matches external-compatible model selection decisions for current-model preservation and provider priority", async () => {
    const current = createModel({ provider: "zai", id: "glm-5.1" });
    const fallback = createModel({ provider: "anthropic", id: "claude-sonnet-4" });
    const openrouter = createModel({ provider: "openrouter", id: "claude-sonnet-4" });
    const registry = createRegistry([openrouter, fallback, current]);

    const currentPlan = await preparePromptExecutionPlan(
      {
        name: "current",
        content: "Use current",
        models: ["anthropic/claude-sonnet-4", "zai/glm-5.1"],
        restore: true,
      },
      "",
      current,
      registry,
    );
    const priorityPlan = await preparePromptExecutionPlan(
      {
        name: "priority",
        content: "Use provider priority",
        models: ["claude-sonnet-4"],
        restore: true,
      },
      "",
      undefined,
      registry,
    );

    assert.deepEqual(summarizeExecutionPlan(currentPlan), {
      kind: "ready",
      promptName: "current",
      selectedModel: "zai/glm-5.1",
      alreadyActive: true,
      restore: true,
      switchModel: undefined,
      restoreModel: undefined,
      thinking: undefined,
      content: "Use current",
    });
    assert.deepEqual(summarizeExecutionPlan(priorityPlan), {
      kind: "ready",
      promptName: "priority",
      selectedModel: "anthropic/claude-sonnet-4",
      alreadyActive: false,
      restore: true,
      switchModel: {
        from: undefined,
        to: "anthropic/claude-sonnet-4",
      },
      restoreModel: undefined,
      thinking: undefined,
      content: "Use provider priority",
    });
  });

  it("matches external-compatible restore, thinking, conditional, and invalid-frontmatter fixtures", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(
      globalDir,
      "restore-false.md",
      "---\nmodel: zai/glm-5.1\nrestore: false\n---\nStay on target",
    );
    await writePrompt(
      globalDir,
      "thinking.md",
      "---\nmodel: zai/glm-5.1\nthinking: high\n---\nThink $1",
    );
    await writePrompt(
      globalDir,
      "conditional.md",
      '---\nmodel: zai/glm-5.1\n---\n<if-model is="zai/glm-5.1">zai $1<else>other</if-model>',
    );
    await writePrompt(
      globalDir,
      "invalid-thinking.md",
      "---\nmodel: zai/glm-5.1\nthinking: nope\n---\nInvalid thinking still claims by model",
    );
    await writePrompt(
      globalDir,
      "invalid-restore.md",
      "---\nmodel: zai/glm-5.1\nrestore: maybe\n---\nInvalid restore defaults",
    );
    await writePrompt(globalDir, "bad-model.md", "---\nmodel: anthropic/*\n---\nBad model");
    await writePrompt(
      globalDir,
      "bad-frontmatter.md",
      "---\n- model: zai/glm-5.1\n---\nBad frontmatter",
    );
    const loadResult = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir });
    const loadSummary = summarizePromptLoadResult(loadResult);

    assert.deepEqual(loadSummary.claimed, [
      "conditional",
      "invalid-restore",
      "invalid-thinking",
      "restore-false",
      "thinking",
    ]);
    assert.deepEqual(loadSummary.diagnosticCodes, [
      "invalid-frontmatter",
      "invalid-model-spec",
      "invalid-restore",
      "invalid-thinking",
    ]);
    assert.deepEqual(
      loadSummary.prompts.map((prompt) => ({
        name: prompt.name,
        models: prompt.models,
        restore: prompt.restore,
        thinking: prompt.thinking,
        commandDescription: prompt.commandDescription,
      })),
      [
        {
          name: "conditional",
          models: ["zai/glm-5.1"],
          restore: true,
          thinking: undefined,
          commandDescription: "[glm-5.1] (user)",
        },
        {
          name: "invalid-restore",
          models: ["zai/glm-5.1"],
          restore: true,
          thinking: undefined,
          commandDescription: "[glm-5.1] (user)",
        },
        {
          name: "invalid-thinking",
          models: ["zai/glm-5.1"],
          restore: true,
          thinking: undefined,
          commandDescription: "[glm-5.1] (user)",
        },
        {
          name: "restore-false",
          models: ["zai/glm-5.1"],
          restore: false,
          thinking: undefined,
          commandDescription: "[glm-5.1] (user)",
        },
        {
          name: "thinking",
          models: ["zai/glm-5.1"],
          restore: true,
          thinking: "high",
          commandDescription: "[glm-5.1 high] (user)",
        },
      ],
    );

    const current = createModel({ provider: "openai-codex", id: "gpt-5.4" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const registry = createRegistry([current, target]);
    const restoreFalsePlan = await preparePromptExecutionPlan(
      loadResult.prompts.get("restore-false"),
      "",
      current,
      registry,
    );
    const thinkingPlan = await preparePromptExecutionPlan(
      loadResult.prompts.get("thinking"),
      "deeply",
      current,
      registry,
    );
    const conditionalPlan = await preparePromptExecutionPlan(
      loadResult.prompts.get("conditional"),
      "branch",
      current,
      registry,
    );

    assert.deepEqual(summarizeExecutionPlan(restoreFalsePlan), {
      kind: "ready",
      promptName: "restore-false",
      selectedModel: "zai/glm-5.1",
      alreadyActive: false,
      restore: false,
      switchModel: {
        from: "openai-codex/gpt-5.4",
        to: "zai/glm-5.1",
      },
      restoreModel: undefined,
      thinking: undefined,
      content: "Stay on target",
    });
    assert.deepEqual(summarizeExecutionPlan(thinkingPlan), {
      kind: "ready",
      promptName: "thinking",
      selectedModel: "zai/glm-5.1",
      alreadyActive: false,
      restore: true,
      switchModel: {
        from: "openai-codex/gpt-5.4",
        to: "zai/glm-5.1",
      },
      restoreModel: "openai-codex/gpt-5.4",
      thinking: "high",
      content: "Think deeply",
    });
    assert.deepEqual(summarizeExecutionPlan(conditionalPlan), {
      kind: "ready",
      promptName: "conditional",
      selectedModel: "zai/glm-5.1",
      alreadyActive: false,
      restore: true,
      switchModel: {
        from: "openai-codex/gpt-5.4",
        to: "zai/glm-5.1",
      },
      restoreModel: "openai-codex/gpt-5.4",
      thinking: undefined,
      content: "zai branch",
    });
  });

  it("matches external-compatible model-less conditional inheritance, empty render aborts, and restore-false thinking", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(
      globalDir,
      "model-less-inherited.md",
      '---\ndescription: Inherits active model for conditionals\n---\n<if-model is="anthropic/claude-sonnet-4">anthropic inherited<else>fallback</if-model>',
    );
    await writePrompt(
      globalDir,
      "empty-conditional.md",
      '---\ndescription: Empty render abort\n---\n<if-model is="zai/glm-5.1"></if-model>',
    );
    await writePrompt(
      globalDir,
      "restore-false-thinking.md",
      "---\nmodel: zai/glm-5.1\nrestore: false\nthinking: medium\n---\nStay on target with thinking",
    );

    const loadResult = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir });
    const loadSummary = summarizePromptLoadResult(loadResult);
    assert.deepEqual(loadSummary.claimed, [
      "empty-conditional",
      "model-less-inherited",
      "restore-false-thinking",
    ]);
    assert.deepEqual(
      loadSummary.prompts.map((prompt) => ({
        name: prompt.name,
        models: prompt.models,
        restore: prompt.restore,
        thinking: prompt.thinking,
        commandDescription: prompt.commandDescription,
      })),
      [
        {
          name: "empty-conditional",
          models: [],
          restore: true,
          thinking: undefined,
          commandDescription: "Empty render abort [current] (user)",
        },
        {
          name: "model-less-inherited",
          models: [],
          restore: true,
          thinking: undefined,
          commandDescription: "Inherits active model for conditionals [current] (user)",
        },
        {
          name: "restore-false-thinking",
          models: ["zai/glm-5.1"],
          restore: false,
          thinking: "medium",
          commandDescription: "[glm-5.1 medium] (user)",
        },
      ],
    );

    const current = createModel({ provider: "anthropic", id: "claude-sonnet-4" });
    const target = createModel({ provider: "zai", id: "glm-5.1" });
    const inheritedPlan = await preparePromptExecutionPlan(
      loadResult.prompts.get("model-less-inherited"),
      "",
      current,
      createRegistry([current, target]),
    );
    const emptyPlan = await preparePromptExecutionPlan(
      loadResult.prompts.get("empty-conditional"),
      "",
      current,
      createRegistry([current, target]),
    );
    const restoreFalseThinkingPlan = await preparePromptExecutionPlan(
      loadResult.prompts.get("restore-false-thinking"),
      "",
      current,
      createRegistry([current, target]),
    );

    const expectedExecutionPlans = {
      "model-less-inherited": {
        kind: "ready",
        promptName: "model-less-inherited",
        selectedModel: "anthropic/claude-sonnet-4",
        alreadyActive: true,
        restore: true,
        switchModel: undefined,
        restoreModel: undefined,
        thinking: undefined,
        content: "anthropic inherited",
      },
      "empty-conditional": {
        kind: "aborted",
        message: "Prompt `empty-conditional` rendered to an empty message.",
        warning: undefined,
      },
      "restore-false-thinking": {
        kind: "ready",
        promptName: "restore-false-thinking",
        selectedModel: "zai/glm-5.1",
        alreadyActive: false,
        restore: false,
        switchModel: {
          from: "anthropic/claude-sonnet-4",
          to: "zai/glm-5.1",
        },
        restoreModel: undefined,
        thinking: "medium",
        content: "Stay on target with thinking",
      },
    };

    assert.deepEqual(
      summarizeExecutionPlan(inheritedPlan),
      expectedExecutionPlans["model-less-inherited"],
    );
    assert.deepEqual(
      summarizeExecutionPlan(emptyPlan),
      expectedExecutionPlans["empty-conditional"],
    );
    assert.deepEqual(
      summarizeExecutionPlan(restoreFalseThinkingPlan),
      expectedExecutionPlans["restore-false-thinking"],
    );

    const report = buildCompatibilityCanaryReport({
      executionPlans: {
        "model-less-inherited": inheritedPlan,
        "empty-conditional": emptyPlan,
        "restore-false-thinking": restoreFalseThinkingPlan,
      },
      expectedExecutionPlans,
    });
    assert.equal(report.ok, true);
  });

  it("reports canary drift without throwing", () => {
    const report = buildCompatibilityCanaryReport({
      loadResult: { prompts: new Map(), diagnostics: [] },
      expectedLoadSummary: { claimed: ["commit"], prompts: [], diagnosticCodes: [] },
    });

    assert.equal(report.ok, false);
    assert.equal(report.comparisons[0].name, "prompt-loading");
    assert.equal(report.comparisons[0].ok, false);
    assert.match(report.comparisons[0].message, /Expected values to be strictly deep-equal/);
  });
});
