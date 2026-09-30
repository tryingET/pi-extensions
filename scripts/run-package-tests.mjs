#!/usr/bin/env node
// summary: Runs a package's test files with a per-file wall clock, so a file that keeps a handle open fails instead of hanging the gate.
// read_when:
//   - changing how the package quality gate runs node:test files, their timeout or concurrency.
//
// node --test bounds each file with --test-timeout on Node 22, but Node 26 no longer stops a file
// whose tests finished while a handle stays open: the run then waits for the job timeout (AK6249).
// Each file therefore runs in its own node --test process (tests in-process, no isolated child), in
// its own process group, and is killed with that group once it outlives the per-file timeout plus a
// short grace, so node reports its own test timeouts first. A preloaded hook watches a pipe to this
// runner and ends the group if the runner dies (the pattern of the compatibility canary's
// selected-tests.mjs). POSIX only; on Windows files run without the group and the hook.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const GRACE_MS = 1_000;
// After the file's process exits, how long its output may still arrive from a subprocess that
// escaped the group but holds the pipe; the runner does not wait for such a process beyond this.
const DRAIN_MS = 1_000;
// The longest delay a timer supports; a larger one would fire at once.
const MAX_TIMER_MS = 2_147_483_647;
// Output kept per file; the rest is dropped with a note.
const MAX_OUTPUT_CHARS = 8 * 1024 * 1024;
const POSIX = process.platform !== "win32";
const LIFETIME_HOOK = fileURLToPath(new URL("./test-lifetime-hook.mjs", import.meta.url));

function parse(argv) {
  const options = { concurrency: 1, timeoutMs: 0, imports: [], files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      options.files = argv.slice(index + 1);
      break;
    }
    const value = argv[index + 1];
    index += 1;
    if (arg === "--concurrency") options.concurrency = Number(value);
    else if (arg === "--timeout-ms") options.timeoutMs = Number(value);
    else if (arg === "--import") options.imports.push(value);
    else throw new Error(`unknown option ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > MAX_TIMER_MS) {
    throw new Error(`--timeout-ms must be a positive integer up to ${MAX_TIMER_MS}`);
  }
  if (options.files.length === 0) throw new Error("no test files after --");
  return options;
}

const running = new Set();
// Set by SIGINT or SIGTERM: the exit code the runner ends with once its files have stopped.
let stopCode;

function signalRun(run, signal) {
  if (run.exited) return; // Never signal a group after its leader was reaped.
  try {
    if (POSIX) process.kill(-run.child.pid, signal);
    else run.child.kill(signal);
  } catch {
    // Already gone.
  }
}

function runFile(file, options) {
  return new Promise((resolve) => {
    const run = { child: null, output: "", dropped: 0, exited: false, timedOut: false };
    let settled = false;
    let wallClock;
    let drain;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(wallClock);
      clearTimeout(drain);
      running.delete(run);
      for (const stream of run.child?.stdio ?? []) stream?.destroy();
      resolve({ file, output: run.output, dropped: run.dropped, timedOut: run.timedOut, ...result });
    };
    try {
      const args = [
        ...(POSIX ? ["--import", LIFETIME_HOOK] : []),
        ...options.imports.flatMap((name) => ["--import", name]),
        "--test",
        // In this process: a single file needs no isolated child.
        "--experimental-test-isolation=none",
        `--test-timeout=${options.timeoutMs}`,
        file,
      ];
      // fd 3 is the lifeline the hook watches; no test subprocess inherits it.
      run.child = spawn(process.execPath, args, {
        detached: POSIX,
        stdio: POSIX ? ["ignore", "pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      });
      const { child } = run;
      if (!child.stdout || !child.stderr) throw new Error("no output pipes (out of file descriptors?)");
      running.add(run);
      const collect = (chunk) => {
        const room = Math.max(MAX_OUTPUT_CHARS - run.output.length, 0);
        run.output += chunk.slice(0, room);
        run.dropped += Math.max(chunk.length - room, 0);
      };
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      for (const stream of child.stdio) stream?.on("error", () => {});
      wallClock = setTimeout(
        () => {
          run.timedOut = true;
          signalRun(run, "SIGKILL");
        },
        Math.min(options.timeoutMs + GRACE_MS, MAX_TIMER_MS),
      );
      // A process that could not start (for example at a task limit) fails its file, not the runner.
      child.on("error", (error) => finish({ code: null, error }));
      child.on("exit", (code, signal) => {
        run.exited = true;
        // The group has served its purpose: anything left in it goes with the file.
        if (POSIX) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            // Nothing left.
          }
        }
        drain = setTimeout(() => finish({ code, signal }), DRAIN_MS);
        child.on("close", () => finish({ code, signal }));
      });
    } catch (error) {
      finish({ code: null, error });
    }
  });
}

function report(result, options) {
  process.stdout.write(`tests: ${result.file}\n${result.output}`);
  if (result.output && !result.output.endsWith("\n")) process.stdout.write("\n");
  if (result.dropped > 0) {
    process.stdout.write(`tests: ${result.file}: ${result.dropped} more characters of output dropped\n`);
  }
  if (result.error) {
    process.stdout.write(`tests: ${result.file} could not start: ${result.error.message}\n`);
  }
  if (result.timedOut) {
    process.stdout.write(
      `tests: ${result.file} timed out: still running ${options.timeoutMs}ms after it started ` +
        "(a test is stuck, or a handle stays open after the tests finished)\n",
    );
  }
}

// A signal sent to the runner alone: no new file starts, running ones get the signal and a moment
// to clean up, then the runner exits the way a process killed by that signal would.
function onSignal(signal, code) {
  process.on(signal, () => {
    stopCode ??= code;
    for (const run of running) signalRun(run, signal);
    setTimeout(() => {
      for (const run of running) signalRun(run, "SIGKILL");
      process.exit(code);
    }, 2_000).unref();
    const check = setInterval(() => {
      if (running.size === 0) process.exit(code);
    }, 50);
    check.unref();
  });
}

async function main() {
  let options;
  try {
    options = parse(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`run-package-tests: ${error.message}\n`);
    return 2;
  }
  onSignal("SIGINT", 130);
  onSignal("SIGTERM", 143);
  const queue = [...options.files];
  const failed = [];
  const worker = async () => {
    while (stopCode === undefined && queue.length > 0) {
      const result = await runFile(queue.shift(), options);
      report(result, options);
      if (result.timedOut || result.error || result.code !== 0) failed.push(result.file);
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency, queue.length) }, worker));
  const total = options.files.length;
  process.stdout.write(
    failed.length === 0
      ? `tests: ${total} file(s) passed\n`
      : `tests: ${failed.length} of ${total} file(s) failed: ${failed.join(", ")}\n`,
  );
  return stopCode ?? (failed.length === 0 ? 0 : 1);
}

process.exitCode = await main();
