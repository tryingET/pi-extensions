import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import typescriptTool, { type parameters } from "../extensions/typescript-tool.ts";
import { executionError, MAX_RESULT_BYTES, renderResult } from "../src/serialization.ts";

test("serializer handles JSON, cross-realm values (through tool), strings and top-level undefined", () => {
  assert.equal(renderResult({ a: [1, true, null, "x"] }), '{"a":[1,true,null,"x"]}');
  assert.equal(renderResult("plain"), "plain");
  assert.equal(renderResult(undefined), "undefined");
  const shared = { x: 1 };
  assert.equal(renderResult([shared, shared]), '[{"x":1},{"x":1}]');
  assert.equal(renderResult(Object.create(null)), "{}");
});

test("serializer rejects lossy and unsupported data", () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  for (const value of [
    1n,
    () => 1,
    Symbol("s"),
    NaN,
    Infinity,
    { x: undefined },
    cyclic,
    new Date(),
    new Map(),
    /a/,
    new Error("x"),
    new Array(2),
    new (class extends Array {})(),
    Object.create(Object.create(null)),
    { [Symbol("s")]: 1 },
  ]) {
    assert.throws(() => renderResult(value));
  }
});

test("serializer never calls getters or toJSON, and rejects thrown-object coercion", () => {
  let called = false;
  const value = {
    get secret() {
      called = true;
      return "secret";
    },
  };
  assert.throws(() => renderResult(value), /accessors/);
  assert.throws(() =>
    renderResult({
      toJSON() {
        called = true;
        return "secret";
      },
    }),
  );
  assert.equal(
    executionError({
      get message() {
        called = true;
        return "secret";
      },
    }).message,
    "TypeScript execution failed (non-string error)",
  );
  assert.equal(called, false);
});

test("serializer bounds bytes, escaped JSON, lines, depth, nodes and error output", () => {
  assert.equal(Buffer.byteLength(renderResult("é".repeat(MAX_RESULT_BYTES / 2))), MAX_RESULT_BYTES);
  assert.throws(() => renderResult("é".repeat(MAX_RESULT_BYTES / 2 + 1)), /bytes/);
  assert.throws(() => renderResult({ a: "\0".repeat(3000) }), /bytes/);
  assert.throws(() => renderResult("\n".repeat(2000)), /lines/);
  let nested: unknown = 1;
  for (let i = 0; i < 34; i++) nested = [nested];
  assert.throws(() => renderResult(nested), /structural/);
  assert.throws(() => renderResult(new Array(4097).fill(0)), /properties/);
  assert.ok(executionError("x".repeat(5000)).message.length <= 2000);
});

function registeredTool() {
  const tools: ToolDefinition<typeof parameters>[] = [];
  const api = {
    registerTool: (tool: ToolDefinition<typeof parameters>) => {
      tools.push(tool);
    },
  };
  typescriptTool(api as unknown as ExtensionAPI);
  assert.equal(tools.length, 1);
  return tools[0];
}

test("registration exposes only typescript with explicit trust and bounds", () => {
  const tool = registeredTool();
  assert.equal(tool.name, "typescript");
  assert.deepEqual(Object.keys(tool.parameters.properties), ["code"]);
  assert.match(tool.description, /NOT a sandbox/);
  assert.match(tool.description, /interface ToolCapabilities/);
  assert.match(tool.description, /16384 UTF-8 bytes/);
});

test("tool executes gated code against cwd and returns serializable, bounded details", async (t) => {
  const tool = registeredTool();
  const root = await mkdtemp(join(tmpdir(), "pi-typescript-tool-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "note.md"), "# note");
  const ctx = { cwd: root } as Parameters<typeof tool.execute>[4];
  const result = await tool.execute(
    "1",
    { code: "async ({fs}) => (await fs.list()).map(e => e.name)" },
    undefined,
    undefined,
    ctx,
  );
  assert.deepEqual(result.content, [{ type: "text", text: '["note.md"]' }]);
  assert.deepEqual(result.details, { kind: "program" });
  assert.doesNotThrow(() => JSON.stringify(result));
  for (const code of [
    "async ({ shell }) => shell('id')",
    "() => { throw new Error('failure'); }",
    "() => 1n",
    "() => ({get x() {return 1;}})",
    '"x".repeat(20000)',
    "() => { const a: unknown[] = []; a.push(a); return a; }",
  ]) {
    await assert.rejects(tool.execute("2", { code }, undefined, undefined, ctx));
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    tool.execute("3", { code: "invalid invalid" }, controller.signal, undefined, ctx),
    /aborted/,
  );
});

test("non-enumerable and extra array properties are rejected without silent loss", () => {
  assert.throws(
    () => renderResult(Object.defineProperty({}, "secret", { value: 1 })),
    /non-enumerable/,
  );
  const array = Object.assign([1], { note: "hidden from JSON arrays" });
  assert.throws(() => renderResult(array), /extra properties/);
});

test("tool rejects type errors before touching an invalid cwd", async () => {
  const tool = registeredTool();
  await assert.rejects(
    tool.execute("invalid", { code: "async ({fs}) => fs.read(42)" }, undefined, undefined, {
      cwd: "\0",
    } as Parameters<typeof tool.execute>[4]),
    /TypeScript validation failed/,
  );
});

test("registered tool executes class decorators and their emitted helpers", async () => {
  const tool = registeredTool();
  const code = `() => {
    let calls = 0;
    function mark(_value: Function, context: ClassDecoratorContext) {
      context.addInitializer(() => { calls += 1; });
    }
    @mark
    class Answer { value = 42; }
    return { value: new Answer().value, calls };
  }`;
  const result = await tool.execute("decorator", { code }, undefined, undefined, {
    cwd: process.cwd(),
  } as Parameters<typeof tool.execute>[4]);
  assert.deepEqual(result.content, [{ type: "text", text: '{"value":42,"calls":1}' }]);
  assert.deepEqual(result.details, { kind: "program" });
});

for (const code of [
  "(() => 42) satisfies ToolProgram",
  "(() => 42) as ToolProgram",
  "(() => 42)!",
  "<ToolProgram>(() => 42)",
  "(((() => 42) satisfies ToolProgram) as ToolProgram)!; // trailing comment",
  "(function () { return 42; }) satisfies ToolProgram",
]) {
  test(`registered tool invokes the wrapped function: ${code}`, async () => {
    const tool = registeredTool();
    const result = await tool.execute("wrapper", { code }, undefined, undefined, {
      cwd: process.cwd(),
    } as Parameters<typeof tool.execute>[4]);
    assert.deepEqual(result.content, [{ type: "text", text: "42" }]);
    assert.deepEqual(result.details, { kind: "program" });
  });
}

test("registered tool preserves wrapper typing and rejects incompatible annotations", async () => {
  const tool = registeredTool();
  for (const code of [
    "(() => 42) satisfies () => string",
    "(() => 42) as string",
    "<string>(() => 42)",
  ]) {
    await assert.rejects(
      tool.execute("wrapper-error", { code }, undefined, undefined, {
        cwd: process.cwd(),
      } as Parameters<typeof tool.execute>[4]),
      /TypeScript validation failed/,
    );
  }
});

test("registered tool keeps wrapped non-function values as expressions", async () => {
  const tool = registeredTool();
  const result = await tool.execute(
    "expression",
    { code: "((42 satisfies number) as number)!" },
    undefined,
    undefined,
    {
      cwd: process.cwd(),
    } as Parameters<typeof tool.execute>[4],
  );
  assert.deepEqual(result.content, [{ type: "text", text: "42" }]);
  assert.deepEqual(result.details, { kind: "expression" });
});

test("registered tool can directly return a truncated default UTF-8 read", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-typescript-default-read-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "large.txt"), "é".repeat(MAX_RESULT_BYTES));
  const tool = registeredTool();
  const result = await tool.execute(
    "default-read",
    { code: 'async ({fs}) => fs.read("large.txt")' },
    undefined,
    undefined,
    {
      cwd: root,
    } as Parameters<typeof tool.execute>[4],
  );
  const content = result.content[0];
  assert.equal(content.type, "text");
  if (content.type !== "text") throw new Error("Expected text output");
  assert.equal(content.text, `${"é".repeat(8000)}\n… truncated`);
  assert.ok(Buffer.byteLength(content.text, "utf8") <= MAX_RESULT_BYTES);
});
