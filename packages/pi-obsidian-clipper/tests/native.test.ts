import assert from "node:assert/strict";
import { chmod, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import {
  captureBody,
  captureTemplate,
  extract,
  NATIVE_LOCK_SHA256,
  NATIVE_SOURCE_PATCH_SHA256,
  nativeArtifact,
  OUTPUT_LIMIT,
  runNative,
} from "../src/native.ts";
import { deadline, HTML_LIMIT } from "../src/transport.ts";
import { environment, fixture } from "./helpers.ts";

const cliChecks = `
const fs = require('node:fs'); const assert = require('node:assert/strict');
const argv = process.argv.slice(2);
assert.equal(argv.length,5); assert.ok(argv[0].startsWith('https://'));
assert.equal(argv[1],'--template'); assert.equal(argv[3],'--html');
assert.equal(fs.statSync(process.cwd()).mode & 511,448);
for (const p of [argv[2],argv[4]]) assert.equal(fs.statSync(p).mode & 511,384);
const template=JSON.parse(fs.readFileSync(argv[2],'utf8'));
assert.equal(template.schemaVersion,'0.1.0'); assert.equal(template.path,'Input');
assert.equal(template.vault,undefined); assert.equal(template.noteContentFormat,'{{content}}');
assert.deepEqual(template.properties.slice(0,3).map(p=>p.value),['input','source','captured']);
assert.equal(template.properties[3].value,'{{url}}');
assert.ok(!Object.keys(process.env).some(k=>/KEY|TOKEN|NODE_OPTIONS|NODE_PATH|PI_SESSION|PROXY/.test(k)));
assert.equal(fs.readFileSync(argv[4],'utf8'),'<html><script>DO_NOT_RUN()</script><p>fixture</p></html>');
process.stdout.write('Native fake fixture body');
`;
test("native argv/private files/template/environment and cleanup; caller HTML does not fetch", async () => {
  const f = await fixture();
  try {
    const path = join(f.dir, "cli.cjs");
    await writeFile(path, cliChecks, { mode: 0o600 });
    const before = await readdir(f.dir);
    await environment(
      {
        PI_OBSIDIAN_CLIPPER_CLI: path,
        TMPDIR: f.dir,
        NODE_OPTIONS: "--require /must-not-load.cjs",
        PROVIDER_API_KEY: "NEVER-IN-CHILD",
        HTTPS_PROXY: "http://127.0.0.1:1",
      },
      async () => {
        const result = await extract(
          "https://no-dns-network.invalid-public.example/page?x=%3Btouch",
          "<html><script>DO_NOT_RUN()</script><p>fixture</p></html>",
        );
        assert.equal(result.markdown, "Native fake fixture body");
        assert.equal(result.saved, false);
        assert.match(result.trust, /not-instructions/);
        assert.equal(result.engine.requiredSourceBase, "6d56d618b00bd970aa738d6a7a61edee27783e81");
        assert.equal(result.engine.requiredSourcePatchSha256, NATIVE_SOURCE_PATCH_SHA256);
        assert.equal(result.engine.requiredLockSha256, NATIVE_LOCK_SHA256);
        assert.equal(result.engine.requiredSourcePatchSha256, null);
        assert.deepEqual(result.engine.requiredRepairs, []);
        assert.match(result.engine.provenance, /not observed provenance/);
      },
    );
    assert.deepEqual(await readdir(f.dir), before);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally {
    await f.dispose();
  }
});
test("exit-zero frontmatter-only capture fails closed; genuine body is preserved", async () => {
  const f = await fixture();
  try {
    const path = join(f.dir, "cli.cjs");
    const header =
      "---\nspace: input\nkind: source\nstate: captured\nsource: https://example.com/\ncaptured: 2026-10-04T00:00:00Z\n---";
    for (const output of [
      header,
      `${header}\n\t\n`,
      `\uFEFF\n${header.replaceAll("\n", "\r\n")}\r\n`,
      `${header}\n#\n---\n`,
      `${header}\n\x00\x1b`,
      header.slice(0, -3),
    ]) {
      await writeFile(path, `process.stdout.write(${JSON.stringify(output)});`, { mode: 0o600 });
      await environment({ PI_OBSIDIAN_CLIPPER_CLI: path, TMPDIR: f.dir }, () =>
        assert.rejects(
          extract("https://example.com/", "<p>fixture</p>"),
          /no meaningful body|unterminated frontmatter/,
        ),
      );
      assert.deepEqual(await readdir(f.dir), ["cli.cjs"]);
    }
    const output = `${header}\n\nOpening evidence.\n\nClosing evidence.\n`;
    await writeFile(path, `process.stdout.write(${JSON.stringify(output)});`, { mode: 0o600 });
    await environment({ PI_OBSIDIAN_CLIPPER_CLI: path, TMPDIR: f.dir }, async () => {
      const result = await extract("https://example.com/", "<p>fixture</p>");
      assert.equal(result.markdown, output);
      assert.equal(captureBody(result.markdown), "\nOpening evidence.\n\nClosing evidence.\n");
      assert.equal(result.saved, false);
    });
    assert.equal(captureBody("Short evidence."), "Short evidence.");
    assert.deepEqual(await readdir(f.dir), ["cli.cjs"]);
  } finally {
    await f.dispose();
  }
});
test("native artifact missing/writable/directory/wrong executable path rejects", async () => {
  const f = await fixture();
  try {
    await assert.rejects(nativeArtifact(join(f.dir, "cli.cjs")), /missing/);
    await assert.rejects(nativeArtifact("relative/cli.cjs"), /absolute/);
    await assert.rejects(nativeArtifact(join(f.dir, "index.js")), /cli.cjs/);
    const path = join(f.dir, "cli.cjs");
    await writeFile(path, "x", { mode: 0o666 });
    await chmod(path, 0o666);
    await assert.rejects(nativeArtifact(path), /private/);
    await chmod(path, 0o600);
    assert.equal(await nativeArtifact(path), path);
    await chmod(f.dir, 0o777);
    await assert.rejects(nativeArtifact(path));
    await chmod(f.dir, 0o700);
    const link = join(f.dir, "current");
    await symlink(f.dir, link);
    assert.equal(await nativeArtifact(join(link, "cli.cjs")), path);
    await environment({ PI_OBSIDIAN_CLIPPER_CLI: join(f.dir, "missing", "cli.cjs") }, () =>
      assert.rejects(extract("https://example.com/"), /missing/),
    );
  } finally {
    await f.dispose();
  }
});
test("input and native output budgets fail closed, cleanup on failures and no stderr leak", async () => {
  const f = await fixture();
  try {
    await assert.rejects(extract("https://example.com/", "x".repeat(HTML_LIMIT + 1)), /HTML/);
    const path = join(f.dir, "cli.cjs");
    for (const [script, match] of [
      [`process.stdout.write('x'.repeat(${OUTPUT_LIMIT + 1}))`, /byte limit/],
      [`process.stdout.write(Buffer.alloc(${OUTPUT_LIMIT},255))`, /byte limit/],
      ["process.stderr.write('x'.repeat(8193)); setInterval(()=>{},1000)", /stderr byte limit/],
      ["process.stdout.write('line\\n'.repeat(1001))", /line limit/],
      ["process.stderr.write('SECRET-DATA\\x1b[31m');process.exitCode=17", /exit 17/],
      ["process.stdout.write(' ')", /empty/],
    ]) {
      await writeFile(path, script, { mode: 0o600 });
      await environment({ PI_OBSIDIAN_CLIPPER_CLI: path, TMPDIR: f.dir }, async () => {
        await assert.rejects(extract("https://example.com/", "<p>fixture</p>"), (error) => {
          assert.match(error.message, match);
          assert.doesNotMatch(error.message, /SECRET-DATA/);
          return true;
        });
      });
      assert.deepEqual(await readdir(f.dir), ["cli.cjs"]);
    }
  } finally {
    await f.dispose();
  }
});
test("abort kills running child, waits for close and prevents pre-aborted subprocess", async () => {
  const f = await fixture();
  try {
    const path = join(f.dir, "cli.cjs");
    await writeFile(
      path,
      "require('node:fs').writeFileSync('ready',String(process.pid));setInterval(()=>{},1000)",
      { mode: 0o600 },
    );
    const c = new AbortController();
    const pending = runNative(path, "https://example.com/", f.dir, c.signal);
    const check = deadline(
      async (signal) => {
        for (;;) {
          signal.throwIfAborted();
          try {
            return Number(await readFile(join(f.dir, "ready"), "utf8"));
          } catch {
            await sleep(10, undefined, { signal });
          }
        }
      },
      undefined,
      10000,
    );
    const pid = await check;
    c.abort();
    await assert.rejects(pending, /cancelled/);
    assert.throws(() => process.kill(pid, 0), /ESRCH/);
    await assert.rejects(async () => runNative(path, "https://example.com/", f.dir, c.signal));
    await assert.rejects(
      deadline((s) => runNative(path, "https://example.com/", f.dir, s), undefined, 20),
      /deadline/,
    );
  } finally {
    await f.dispose();
  }
});
test("returned terminal controls are removed; native template contains no inference or vault", async () => {
  const f = await fixture();
  try {
    const path = join(f.dir, "cli.cjs");
    await writeFile(path, "process.stdout.write('data\\x1b[31m\\x00')", { mode: 0o600 });
    const text = await runNative(path, "https://example.com/", f.dir, new AbortController().signal);
    assert.equal(text, "data[31m");
    const template = captureTemplate("2026-01-01T00:00:00Z");
    assert.equal(template.vault, undefined);
    assert.equal(template.noteContentFormat, "{{content}}");
    assert.deepEqual(template.triggers, []);
    assert.equal(template.properties[4].value, "2026-01-01T00:00:00Z");
  } finally {
    await f.dispose();
  }
});
