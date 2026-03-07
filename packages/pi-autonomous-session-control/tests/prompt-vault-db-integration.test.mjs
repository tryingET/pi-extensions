import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSubagentState, registerSubagentTool } from "../extensions/self/subagent.ts";

const DEFAULT_VAULT_DIR = "/home/tryinget/ai-society/core/prompt-vault/prompt-vault-db";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadTemplateFromVault() {
  const vaultDir = process.env.VAULT_DIR || DEFAULT_VAULT_DIR;

  if (!existsSync(vaultDir)) {
    return null;
  }

  try {
    const raw = execFileSync(
      "dolt",
      [
        "sql",
        "-r",
        "json",
        "-q",
        "SELECT name, content, tags FROM prompt_templates WHERE status = 'active' LIMIT 1",
      ],
      {
        cwd: vaultDir,
        encoding: "utf-8",
      },
    );

    const parsed = JSON.parse(raw);
    const row = parsed?.rows?.[0];

    if (!row || typeof row.name !== "string" || typeof row.content !== "string") {
      return null;
    }

    return {
      name: row.name,
      content: row.content,
      tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      source: "prompt-vault-db",
    };
  } catch {
    return null;
  }
}

async function setup() {
  const sessionsDir = await mkdtemp(join(tmpdir(), "prompt-vault-db-integration-test-"));
  const state = createSubagentState(sessionsDir);

  let registeredTool;
  let capturedDef;

  const pi = {
    registerTool(definition) {
      registeredTool = definition;
    },
  };

  const spawner = async (def) => {
    capturedDef = def;
    return {
      output: "ok",
      exitCode: 0,
      elapsed: 100,
      status: "done",
    };
  };

  registerSubagentTool(pi, state, () => "test/model", spawner);

  return {
    tool: registeredTool,
    getCapturedDef: () => capturedDef,
    cleanup: async () => {
      await rm(sessionsDir, { recursive: true, force: true });
    },
  };
}

const liveTemplate = loadTemplateFromVault();

test(
  "live prompt-vault DB template can be applied through dispatch_subagent prompt envelope",
  { skip: !liveTemplate },
  async () => {
    const harness = await setup();

    try {
      const result = await harness.tool.execute(
        "tc-vault-db-1",
        {
          profile: "reviewer",
          objective: "Review architecture plan",
          prompt_name: liveTemplate.name,
          prompt_content: liveTemplate.content,
          prompt_tags: liveTemplate.tags,
          prompt_source: liveTemplate.source,
        },
        null,
        null,
        { cwd: process.cwd() },
      );

      const def = harness.getCapturedDef();
      assert.match(def.systemPrompt, /^\[Prompt Envelope\]/);
      assert.match(def.systemPrompt, new RegExp(`name: ${escapeRegExp(liveTemplate.name)}`));
      assert.match(def.systemPrompt, /source: prompt-vault-db/);
      assert.equal(result.details.prompt_applied, true);
      assert.equal(result.details.prompt_name, liveTemplate.name);
      assert.equal(result.details.prompt_source, "prompt-vault-db");
      assert.equal(result.details.prompt_warning, undefined);
    } finally {
      await harness.cleanup();
    }
  },
);
