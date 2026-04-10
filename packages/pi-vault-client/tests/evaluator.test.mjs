import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { registerPromptEvaluatorTool } from "../src/evaluator.js";

function makePiStub() {
  const tools = new Map();
  return {
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
    tools,
  };
}

function makeVaultStub() {
  return {
    queryJson() {
      return { rows: [] };
    },
    exec() {
      return true;
    },
    commit() {},
    escapeSql(value) {
      return String(value).replace(/'/g, "''");
    },
  };
}

async function withPromptEvalEnv(storePath, run) {
  const originalPromptEvalFile = process.env.PI_VAULT_PROMPT_EVAL_VARIANTS_FILE;
  const originalPiCompany = process.env.PI_COMPANY;
  const originalVaultCompany = process.env.VAULT_CURRENT_COMPANY;

  process.env.PI_VAULT_PROMPT_EVAL_VARIANTS_FILE = storePath;
  delete process.env.PI_COMPANY;
  delete process.env.VAULT_CURRENT_COMPANY;

  try {
    return await run();
  } finally {
    if (originalPromptEvalFile === undefined) delete process.env.PI_VAULT_PROMPT_EVAL_VARIANTS_FILE;
    else process.env.PI_VAULT_PROMPT_EVAL_VARIANTS_FILE = originalPromptEvalFile;

    if (originalPiCompany === undefined) delete process.env.PI_COMPANY;
    else process.env.PI_COMPANY = originalPiCompany;

    if (originalVaultCompany === undefined) delete process.env.VAULT_CURRENT_COMPANY;
    else process.env.VAULT_CURRENT_COMPANY = originalVaultCompany;
  }
}

test(
  "prompt_eval variants fail closed without context and stay company-scoped in local state",
  { concurrency: false },
  async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "prompt-eval-store-"));
    const storePath = path.join(tempDir, "prompt-eval-variants.jsonl");

    try {
      await withPromptEvalEnv(storePath, async () => {
        const pi = makePiStub();
        registerPromptEvaluatorTool(
          pi,
          { vaultDir: "/tmp", localModelEndpoint: "http://localhost:8000", defaultModel: "demo" },
          makeVaultStub(),
        );

        const tool = pi.tools.get("prompt_eval");
        assert.ok(tool);

        const blocked = await tool.execute(
          "call-1",
          { action: "create_variant", name: "bad", content: "body" },
          null,
          null,
          {},
        );
        assert.equal(blocked.details.ok, false);
        assert.match(blocked.content[0].text, /Explicit company context is required/);

        const created = await tool.execute(
          "call-2",
          { action: "create_variant", name: "software-only", content: "body" },
          null,
          null,
          { cwd: "/home/tryinget/ai-society/softwareco/owned/demo" },
        );
        assert.equal(created.details.ok, true);
        assert.equal(created.details.currentCompany, "software");

        const softwareList = await tool.execute("call-3", { action: "list_variants" }, null, null, {
          cwd: "/home/tryinget/ai-society/softwareco/owned/demo",
        });
        assert.equal(softwareList.details.ok, true);
        assert.match(softwareList.content[0].text, /software-only/);

        const financeList = await tool.execute("call-4", { action: "list_variants" }, null, null, {
          cwd: "/home/tryinget/ai-society/financeco/owned/demo",
        });
        assert.equal(financeList.details.ok, true);
        assert.equal(financeList.content[0].text, "No variants stored");
        assert.equal(financeList.details.currentCompany, "finance");
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "prompt_eval create_variant rejects blank trimmed inputs before persistence",
  { concurrency: false },
  async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "prompt-eval-blank-input-"));
    const storePath = path.join(tempDir, "prompt-eval-variants.jsonl");

    try {
      await withPromptEvalEnv(storePath, async () => {
        const pi = makePiStub();
        registerPromptEvaluatorTool(
          pi,
          { vaultDir: "/tmp", localModelEndpoint: "http://localhost:8000", defaultModel: "demo" },
          makeVaultStub(),
        );

        const tool = pi.tools.get("prompt_eval");
        assert.ok(tool);
        const result = await tool.execute(
          "call-blank",
          { action: "create_variant", name: "   ", content: "   " },
          null,
          null,
          { cwd: "/home/tryinget/ai-society/softwareco/owned/demo" },
        );

        assert.equal(result.details.ok, false);
        assert.equal(result.content[0].text, "name and content required for create_variant");
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "prompt_eval create_variant fails closed when local variant persistence cannot be written",
  { concurrency: false },
  async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "prompt-eval-persist-fail-"));

    try {
      await withPromptEvalEnv(tempDir, async () => {
        const pi = makePiStub();
        registerPromptEvaluatorTool(
          pi,
          { vaultDir: "/tmp", localModelEndpoint: "http://localhost:8000", defaultModel: "demo" },
          makeVaultStub(),
        );

        const tool = pi.tools.get("prompt_eval");
        assert.ok(tool);
        const result = await tool.execute(
          "call-5",
          { action: "create_variant", name: "ghost", content: "body" },
          null,
          null,
          { cwd: "/home/tryinget/ai-society/softwareco/owned/demo" },
        );

        assert.equal(result.details.ok, false);
        assert.match(result.content[0].text, /Failed to persist local prompt variant/);
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  "prompt_eval run_test uses judged scores instead of constant defaults",
  { concurrency: false },
  async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "prompt-eval-judge-"));
    const storePath = path.join(tempDir, "prompt-eval-variants.jsonl");

    try {
      await withPromptEvalEnv(storePath, async () => {
        const responses = [
          "excellent answer",
          '{"scores":{"correctness":5,"clarity":4},"notes":"strong"}',
          "weak answer",
          '{"scores":{"correctness":1,"clarity":2},"notes":"weak"}',
        ];
        const fetchBodies = [];
        const fetchImpl = async (_url, init) => {
          fetchBodies.push(JSON.parse(String(init?.body || "{}")));
          const content = responses.shift();
          assert.ok(content);
          return {
            ok: true,
            async json() {
              return { choices: [{ message: { content } }] };
            },
          };
        };

        const pi = makePiStub();
        registerPromptEvaluatorTool(
          pi,
          {
            vaultDir: "/tmp",
            localModelEndpoint: "http://localhost:8000",
            defaultModel: "demo",
            fetchImpl,
          },
          makeVaultStub(),
        );

        const tool = pi.tools.get("prompt_eval");
        assert.ok(tool);

        const alpha = await tool.execute(
          "call-6",
          { action: "create_variant", name: "alpha", content: "Prompt A" },
          null,
          null,
          { cwd: "/home/tryinget/ai-society/softwareco/owned/demo" },
        );
        const beta = await tool.execute(
          "call-7",
          { action: "create_variant", name: "beta", content: "Prompt B" },
          null,
          null,
          { cwd: "/home/tryinget/ai-society/softwareco/owned/demo" },
        );
        assert.equal(alpha.details.ok, true);
        assert.equal(beta.details.ok, true);

        const result = await tool.execute(
          "call-8",
          {
            action: "run_test",
            variant_ids: [alpha.details.variant.id, beta.details.variant.id],
            test_inputs: ["input"],
            criteria: ["correctness", "clarity"],
          },
          null,
          null,
          { cwd: "/home/tryinget/ai-society/softwareco/owned/demo" },
        );

        assert.equal(result.details.ok, true);
        assert.equal(result.details.summary.bestVariant, "alpha");
        assert.match(result.content[0].text, /- alpha: 4\.50\/5/);
        assert.match(result.content[0].text, /- beta: 1\.50\/5/);
        assert.equal(fetchBodies.length, 4);
        assert.match(fetchBodies[1].messages[0].content, /Return ONLY valid JSON/);
        assert.match(fetchBodies[3].messages[0].content, /Candidate output:\nweak answer/);
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
);
