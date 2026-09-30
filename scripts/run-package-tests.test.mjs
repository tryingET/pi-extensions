// summary: The package test runner bounds each file and never leaves test processes behind: stuck files, leaked handles, subprocesses holding its pipes, signals, a killed runner and spawn failures.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const RUNNER = path.join(import.meta.dirname, "run-package-tests.mjs");

function fixture(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-tests-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

// Whether a process whose command line contains `marker` is still alive (the marker is unique per test).
function alive(marker) {
  return spawnSync("ps", ["-eo", "args"], { encoding: "utf8" })
    .stdout.split("\n")
    .some((line) => line.includes(marker) && !line.startsWith("ps "));
}

const run = (dir, args, extra = {}) =>
  spawnSync(process.execPath, [RUNNER, ...args], { cwd: dir, encoding: "utf8", timeout: 30_000, ...extra });

test("a leaked handle or a subprocess holding the output pipe cannot stall the runner", (t) => {
  const marker = `holder-${process.pid}-${Date.now()}`;
  const dir = fixture(t, {
    "leak.test.mjs": "import test from 'node:test'; test('leaks', () => { setInterval(() => {}, 1000); });\n",
    "holder.test.mjs": `import { spawn } from 'node:child_process'; import test from 'node:test';
test('starts a subprocess that keeps the pipe', () => {
  spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)', '${marker}'], { stdio: 'inherit' }).unref();
});\n`,
  });
  const started = Date.now();
  const result = run(dir, ["--concurrency", "2", "--timeout-ms", "1000", "--", "leak.test.mjs", "holder.test.mjs"]);
  assert.ok(Date.now() - started < 8000, `took ${Date.now() - started} ms`);
  assert.equal(result.status, 1, "the leaking file fails");
  assert.match(result.stdout, /leak\.test\.mjs timed out/);
  assert.match(result.stdout, /1 of 2 file\(s\) failed: leak\.test\.mjs/);
  assert.equal(alive(marker), false, "the subprocess went with its file's group");
});

test("a killed runner takes its test processes with it", async (t) => {
  const marker = `orphan-${process.pid}-${Date.now()}`;
  const dir = fixture(t, {
    "slow.test.mjs": `import test from 'node:test'; test('${marker}', async () => { await new Promise((r) => setTimeout(r, 30000)); });\n`,
  });
  const runner = spawn(process.execPath, [RUNNER, "--timeout-ms", "60000", "--", "slow.test.mjs"], {
    cwd: dir,
    stdio: "ignore",
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const before = spawnSync("ps", ["-eo", "args"], { encoding: "utf8" }).stdout.includes("slow.test.mjs");
  runner.kill("SIGKILL");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.ok(before, "the test process was running");
  const left = spawnSync("ps", ["-eo", "pid,args"], { encoding: "utf8" })
    .stdout.split("\n")
    .filter((line) => line.includes(dir) || (line.includes("slow.test.mjs") && line.includes("isolation=none")));
  assert.deepEqual(left, [], "no test process outlives the runner");
});

test("after SIGTERM no new file starts, and the runner exits 143", async (t) => {
  const files = Object.fromEntries(
    Array.from({ length: 5 }, (_, index) => [
      `f${index}.test.mjs`,
      `import fs from 'node:fs'; import test from 'node:test';
test('f${index}', async () => { fs.appendFileSync('started.log', 'f${index}\\n'); await new Promise((r) => setTimeout(r, 400)); });\n`,
    ]),
  );
  const dir = fixture(t, files);
  const runner = spawn(process.execPath, [RUNNER, "--timeout-ms", "10000", "--", ...Object.keys(files)], {
    cwd: dir,
    stdio: "ignore",
  });
  await new Promise((resolve) => setTimeout(resolve, 600));
  runner.kill("SIGTERM");
  const code = await new Promise((resolve) => runner.on("exit", (exitCode) => resolve(exitCode)));
  assert.equal(code, 143);
  const started = fs.readFileSync(path.join(dir, "started.log"), "utf8").trim().split("\n");
  assert.ok(started.length < 5, `every file started: ${started.join(", ")}`);
});

test("a file that cannot start fails that file, not the runner", (t) => {
  const dir = fixture(t, {
    "a.test.mjs": "import test from 'node:test'; test('a', () => {});\n",
    "b.test.mjs": "import test from 'node:test'; test('b', () => {});\n",
  });
  // Too few file descriptors for the pipes of both files at once.
  const result = spawnSync(
    "bash",
    ["-c", `ulimit -n 24; exec "${process.execPath}" "${RUNNER}" --concurrency 2 --timeout-ms 5000 -- a.test.mjs b.test.mjs`],
    { cwd: dir, encoding: "utf8", timeout: 30_000 },
  );
  assert.doesNotMatch(result.stderr, /TypeError|Uncaught/, result.stderr);
  assert.match(result.stdout, /tests: .*(file\(s\) passed|file\(s\) failed)/, "the runner reports, not crashes");
});

test("an out-of-range timeout is refused instead of firing at once", (t) => {
  const dir = fixture(t, { "a.test.mjs": "import test from 'node:test'; test('a', () => {});\n" });
  const result = run(dir, ["--timeout-ms", "2147483648", "--", "a.test.mjs"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--timeout-ms must be a positive integer/);
});
