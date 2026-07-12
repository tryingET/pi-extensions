/**
 * summary: "tests dry-run claim reports, command-collision readiness, and real commit fixture planning parity."
 * read_when:
 *   - "changing diagnostic report contents or non-mutating commit prompt planning."
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  buildPromptTemplateDiagnosticReport,
  loadPromptTemplateDiagnosticReport,
} from "../src/diagnostic-report.js";
import { preparePromptExecutionPlan } from "../src/execution-plan.js";
import { buildPromptCommandDescription, loadPromptTemplates } from "../src/loader.js";

const tempDirs = [];

const COMMIT_FIXTURE = new URL("./fixtures/commit.md", import.meta.url);

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ptx-exec-report-"));
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

describe("prompt-template dry-run diagnostic report", () => {
  it("lists claimed templates without registering commands", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(globalDir, "commit.md", await readFile(COMMIT_FIXTURE, "utf8"));
    await writePrompt(projectDir, "plain.md", "---\ndescription: Plain\n---\nBody");

    const report = loadPromptTemplateDiagnosticReport({
      cwd: projectDir,
      globalDir,
      projectDir,
      existingCommands: [{ name: "model" }],
    });

    assert.equal(report.kind, "pi-prompt-template-execution/dry-run-report/v1");
    assert.equal(report.liveMutation, false);
    assert.deepEqual(report.totals, {
      claimedTemplates: 1,
      diagnostics: 0,
      commandCollisions: 0,
      diagnosticCodes: {},
    });
    assert.deepEqual(
      report.claimedTemplates.map((claim) => ({
        command: claim.command,
        source: claim.source,
        models: claim.models,
        reasons: claim.reasons,
        blockedByExistingCommand: claim.blockedByExistingCommand,
      })),
      [
        {
          command: "/commit",
          source: "user",
          models: ["zai/glm-5.1"],
          reasons: ["model"],
          blockedByExistingCommand: false,
        },
      ],
    );
    assert.equal(report.registrationReadiness.wouldRegister, true);
    assert.equal(report.registrationReadiness.reason, "clean_command_snapshot");
    assert.match(report.notes.join("\n"), /pi-society-orchestrator/);
    assert.match(report.notes.join("\n"), /pi-autonomous-session-control/);
  });

  it("proves current live /commit ownership would block successor registration", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(globalDir, "commit.md", await readFile(COMMIT_FIXTURE, "utf8"));
    const loadResult = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir });

    const report = buildPromptTemplateDiagnosticReport(loadResult, {
      existingCommands: [{ invocationName: "/commit", source: "npm:pi-prompt-template-model" }],
    });

    assert.deepEqual(report.commandCollisions, ["commit"]);
    assert.equal(report.claimedTemplates[0].blockedByExistingCommand, true);
    assert.deepEqual(report.registrationReadiness, {
      wouldRegister: false,
      reason: "existing_command_collision",
      collisions: ["commit"],
      message: "would refuse to register prompt command(s) already present: commit",
    });
  });

  it("fails dry-run readiness closed without an explicit existing-command snapshot", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    await writePrompt(globalDir, "commit.md", await readFile(COMMIT_FIXTURE, "utf8"));

    const report = loadPromptTemplateDiagnosticReport({ globalDir, projectDir, cwd: projectDir });
    assert.equal(report.registrationReadiness.wouldRegister, false);
    assert.equal(report.registrationReadiness.reason, "unknown_existing_commands");
    assert.equal(report.commandCollisions, undefined);
  });
});

describe("real /commit fixture parity", () => {
  it("loads the current live /commit prompt shape and command description", async () => {
    const globalDir = await tempDir();
    const projectDir = await tempDir();
    const commitPath = await writePrompt(
      globalDir,
      "commit.md",
      await readFile(COMMIT_FIXTURE, "utf8"),
    );

    const result = loadPromptTemplates({ globalDir, projectDir, cwd: projectDir });
    const prompt = result.prompts.get("commit");

    assert.equal(result.diagnostics.length, 0);
    assert.ok(prompt);
    assert.equal(prompt.filePath, commitPath);
    assert.equal(prompt.description.startsWith("Deterministic multi-commit workflow"), true);
    assert.deepEqual(prompt.models, ["zai/glm-5.1"]);
    assert.equal(prompt.restore, true);
    assert.equal(prompt.thinking, undefined);
    assert.equal(prompt.skill, undefined);
    assert.match(buildPromptCommandDescription(prompt), /\[glm-5\.1\] \(user\)$/);
  });

  it("plans /commit model switch, argument substitution, and restore without host mutation", async () => {
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
      "split consolidation docs from runtime code",
      current,
      createRegistry([current, target]),
    );

    assert.equal(plan.promptName, "commit");
    assert.equal(plan.selectedModel.model, target);
    assert.equal(plan.selectedModel.alreadyActive, false);
    assert.equal(plan.restore, true);
    assert.equal(plan.actions.switchModel.from, current);
    assert.equal(plan.actions.switchModel.to, target);
    assert.equal(plan.actions.restoreModel, current);
    assert.equal(plan.actions.setThinking, undefined);
    assert.match(plan.content, /You are the commit orchestrator\./);
    assert.match(plan.content, /NEVER run `git add \.`/);
    assert.match(plan.content, /split consolidation docs from runtime code\s*$/);
    assert.equal(plan.content.includes("$ARGUMENTS"), false);
  });
});
