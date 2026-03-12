import assert from "node:assert/strict";
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

function makeVaultStub(overrides = {}) {
  return {
    queryJson() {
      return { rows: [{ id: "var_test" }] };
    },
    exec() {
      return true;
    },
    commit() {},
    escapeSql(value) {
      return String(value).replace(/'/g, "''");
    },
    ...overrides,
  };
}

test("prompt_eval create_variant fails closed when variant persistence cannot be created", async () => {
  const pi = makePiStub();
  const vault = makeVaultStub({
    exec() {
      return false;
    },
  });

  registerPromptEvaluatorTool(
    pi,
    { vaultDir: "/tmp", localModelEndpoint: "http://localhost:8000", defaultModel: "demo" },
    vault,
  );

  const tool = pi.tools.get("prompt_eval");
  assert.ok(tool);
  const result = await tool.execute(
    "call-1",
    { action: "create_variant", name: "bad", content: "body" },
    null,
    null,
    {},
  );

  assert.equal(result.details.ok, false);
  assert.match(result.content[0].text, /Failed to ensure prompt_variants table exists/);
});

test("prompt_eval create_variant fails closed when insert succeeds but persistence cannot be verified", async () => {
  const pi = makePiStub();
  let execCalls = 0;
  let commitCalls = 0;
  const vault = makeVaultStub({
    exec() {
      execCalls += 1;
      return true;
    },
    commit() {
      commitCalls += 1;
    },
    queryJson() {
      return { rows: [] };
    },
  });

  registerPromptEvaluatorTool(
    pi,
    { vaultDir: "/tmp", localModelEndpoint: "http://localhost:8000", defaultModel: "demo" },
    vault,
  );

  const tool = pi.tools.get("prompt_eval");
  assert.ok(tool);
  const result = await tool.execute(
    "call-2",
    { action: "create_variant", name: "ghost", content: "body" },
    null,
    null,
    {},
  );

  assert.equal(execCalls, 2);
  assert.equal(commitCalls, 1);
  assert.equal(result.details.ok, false);
  assert.match(result.content[0].text, /Prompt variant was not persisted/);
});
