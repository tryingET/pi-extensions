import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import { runSnippet } from "../src/runner.ts";
import { renderResult } from "../src/serialization.ts";
import { checkSnippet, MAX_CODE_BYTES } from "../src/typescript-gate.ts";

const LIST = 'async ({ fs }) => (await fs.list(".")).map(e => e.name)';

test("strict in-memory gate accepts function and expression submissions", () => {
  for (const code of [
    LIST,
    `(${LIST}); // tail`,
    '(function ({ fs }) { return fs.read("a"); });',
  ]) {
    assert.deepEqual(checkSnippet(code), { ok: true, kind: "program" }, code);
  }
  for (const code of ["40 + 2; // comment", "({a: 1})", "[1,2].map(x => x * 2)"]) {
    assert.deepEqual(checkSnippet(code), { ok: true, kind: "expression" }, code);
  }
});

test("gate rejects wrong capabilities, arguments, ambient globals and declarations", () => {
  for (const code of [
    "async ({ bash }) => bash('id')",
    "async ({ fs }) => fs.read(42)",
    "async ({ fs }) => fs.write('a', 'b')",
    "async c => (await c.fs.list()).map(e => e.nope)",
    "async () => process.cwd()",
    "async () => fetch('https://example.org')",
    "async () => import('node:fs')",
    'import fs from "node:fs"',
    "const x = 1",
    "function f() {}",
    "1; 2",
    "",
    "async ({ fs }) => {",
  ]) {
    const gate = checkSnippet(code);
    assert.equal(gate.ok, false, code);
    if (!gate.ok) assert.ok(gate.diagnostics.length > 0);
  }
});

test("source bound uses bytes, diagnostics are bounded, and checking never executes", () => {
  assert.equal(checkSnippet(`"${"é".repeat(MAX_CODE_BYTES / 2)}"`).ok, false);
  const gate = checkSnippet(`async () => { ${"missing();".repeat(100)} }`);
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.ok(gate.diagnostics.join("\n").length <= 8000);
  assert.equal(checkSnippet("() => { throw new Error('not executed'); }").ok, true);
});

test("runner invokes parenthesized functions and semicolon/comment expressions", async () => {
  const fake = { fs: { list: async () => [{ name: "a.ts" }] } };
  assert.equal(renderResult(await runSnippet(`(${LIST}); // tail`, "program", fake)), '["a.ts"]');
  assert.equal(await runSnippet("40 + 2; // tail", "expression", {}), 42);
  assert.equal(await runSnippet("(() => 42)", "program", {}), 42);
});

test("initial synchronous loop is interrupted inside vm (child watchdog)", async () => {
  const result = await childRun(`
    import { runSnippet } from './src/runner.ts';
    try { await runSnippet('() => { while (true) {} }', 'program', {}, {timeoutMs:30}); }
    catch(e) { console.log(e.message); }
  `);
  assert.equal(result.killed, false);
  assert.match(result.stdout, /Script execution timed out/);
  assert.equal(result.code, 0);
});

test("async deadline rejects an unsettled promise", async () => {
  await assert.rejects(
    runSnippet("async () => new Promise(() => {})", "program", {}, { timeoutMs: 20 }),
    /exceeded 20 ms/,
  );
});

test("post-await CPU loop is NOT interrupted: documented limitation, killed only in child", async () => {
  const result = await childRun(`
    import { runSnippet } from './src/runner.ts';
    console.log('ready');
    await runSnippet('async () => { await Promise.resolve(); while(true) {} }', 'program', {}, {timeoutMs:20});
  `);
  assert.match(result.stdout, /ready/);
  assert.equal(result.killed, true);
});

test("pre-abort prevents execution; running abort and listener cleanup work", async () => {
  const pre = new AbortController();
  pre.abort();
  let called = false;
  await assert.rejects(
    runSnippet(
      "c => c.touch()",
      "program",
      {
        touch: () => {
          called = true;
        },
      },
      { signal: pre.signal },
    ),
    /aborted/,
  );
  assert.equal(called, false);
  const controller = new AbortController();
  const execution = runSnippet(
    "async () => new Promise(() => {})",
    "program",
    {},
    { signal: controller.signal },
  );
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(execution, /aborted/);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  const success = new AbortController();
  await runSnippet("1", "expression", {}, { signal: success.signal });
  assert.equal(getEventListeners(success.signal, "abort").length, 0);
  await assert.rejects(
    runSnippet("() => { throw new Error('failure'); }", "program", {}, { signal: success.signal }),
    /failure/,
  );
  assert.equal(getEventListeners(success.signal, "abort").length, 0);
});

test("timeout rejects non-finite, out-of-range and fractional values", async () => {
  for (const timeoutMs of [NaN, Infinity, 0, -1, 1.5, 10001]) {
    await assert.rejects(runSnippet("1", "expression", {}, { timeoutMs }), /timeoutMs/);
  }
});

test("vm and types are not security boundaries: a host function exposes host constructors", async () => {
  const code = '({ fs }) => fs.read.constructor("return typeof process")()';
  assert.equal(checkSnippet(code).ok, true);
  assert.equal(await runSnippet(code, "program", { fs: { read: async () => "" } }), "object");
  await assert.rejects(runSnippet("process.cwd()", "expression", {}), /process is not defined/);
});

async function childRun(
  source: string,
): Promise<{ killed: boolean; stdout: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", source],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, 2500);
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code && !killed) reject(new Error(stderr));
      else resolve({ killed, stdout, code });
    });
  });
}
