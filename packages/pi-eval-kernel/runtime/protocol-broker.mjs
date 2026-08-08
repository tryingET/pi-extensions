import { spawn } from "node:child_process";

const MAX_FRAME_BYTES = 2_000_000;
const MAX_FRAMES = 10_000;
const MAX_STDERR_BYTES = 16_384;

const executable = process.argv[2];
const workerArgs = JSON.parse(process.argv[3] ?? "[]");
if (!executable || !Array.isArray(workerArgs)) {
  process.stderr.write("protocol broker requires executable and JSON argument array\n");
  process.exit(2);
}
const persistentWorker = workerArgs.includes("--persistent");

const worker = spawn(executable, workerArgs, {
  detached: process.platform !== "win32",
  env: process.env,
  stdio: ["pipe", "pipe", "pipe", "pipe"],
});
const protocolOutput = worker.stdio[3];
if (!protocolOutput) {
  process.stderr.write("protocol broker could not open the worker protocol channel\n");
  process.exit(2);
}
let workerBuffer = Buffer.alloc(0);
let hostBuffer = Buffer.alloc(0);
let workerFrames = 0;
let failed = false;
let workerStderr = "";
let forceTimer;
let terminating = false;
let workerClosed = false;
let workerExitCode = 0;
let workerExitSignal;
let finishing = false;

function terminateWorker() {
  if (terminating) return;
  terminating = true;
  killTree("SIGTERM");
  forceTimer = setTimeout(() => {
    forceTimer = undefined;
    killTree("SIGKILL");
    if (workerClosed) finishBroker();
  }, 500);
}

function killTree(signal) {
  if (process.platform !== "win32" && worker.pid) {
    try {
      process.kill(-worker.pid, signal);
      return;
    } catch {
      // Fall through to direct child signaling.
    }
  }
  worker.kill(signal);
}

function finishBroker() {
  if (finishing) return;
  finishing = true;
  process.stdin.pause();
  if (workerStderr) process.stderr.write(workerStderr);
  process.exitCode = failed ? 1 : (workerExitCode ?? (workerExitSignal ? 1 : 0));
  process.stdout.end();
}

function fail(message) {
  if (failed) return;
  failed = true;
  workerBuffer = Buffer.alloc(0);
  protocolOutput.removeAllListeners("data");
  protocolOutput.destroy();
  worker.stdout.removeAllListeners("data");
  worker.stdout.destroy();
  const frame = `${JSON.stringify({ type: "protocol_error", error: message })}\n`;
  process.stdout.write(frame);
  terminateWorker();
}

function forwardWorkerFrames() {
  let newline = workerBuffer.indexOf(0x0a);
  while (newline >= 0 && !failed) {
    const frame = workerBuffer.subarray(0, newline);
    workerBuffer = workerBuffer.subarray(newline + 1);
    if (frame.length > MAX_FRAME_BYTES) {
      fail("Kernel-to-host protocol frame exceeded the limit.");
      return;
    }
    workerFrames += 1;
    if (workerFrames > MAX_FRAMES) {
      fail("Kernel-to-host protocol frame count exceeded the limit.");
      return;
    }
    if (!process.stdout.write(Buffer.concat([frame, Buffer.from("\n")]))) {
      protocolOutput.pause();
      process.stdout.once("drain", () => {
        if (failed) return;
        protocolOutput.resume();
        forwardWorkerFrames();
      });
      return;
    }
    newline = workerBuffer.indexOf(0x0a);
  }
  if (workerBuffer.length > MAX_FRAME_BYTES) {
    fail("Kernel-to-host protocol frame exceeded the limit.");
  }
}

protocolOutput.on("data", (chunk) => {
  if (failed) return;
  if (workerBuffer.length + chunk.length > MAX_FRAME_BYTES) {
    fail("Kernel-to-host protocol frame exceeded the limit.");
    return;
  }
  workerBuffer = Buffer.concat([workerBuffer, chunk]);
  forwardWorkerFrames();
});
protocolOutput.on("error", (error) => {
  if (!failed) fail(`Kernel protocol output failed: ${error.message}`);
});
worker.stdout.on("data", () => {
  fail("Kernel wrote outside its dedicated protocol channel.");
});
worker.stdout.on("error", (error) => {
  if (!failed) fail(`Kernel stdout failed: ${error.message}`);
});

function forwardHostFrames() {
  let newline = hostBuffer.indexOf(0x0a);
  while (newline >= 0 && !failed) {
    const frame = hostBuffer.subarray(0, newline);
    hostBuffer = hostBuffer.subarray(newline + 1);
    if (frame.length > MAX_FRAME_BYTES) {
      fail("Host-to-kernel protocol frame exceeded the limit.");
      return;
    }
    if (!worker.stdin.write(Buffer.concat([frame, Buffer.from("\n")]))) {
      process.stdin.pause();
      worker.stdin.once("drain", () => {
        if (failed) return;
        process.stdin.resume();
        forwardHostFrames();
      });
      return;
    }
    newline = hostBuffer.indexOf(0x0a);
  }
  if (hostBuffer.length > MAX_FRAME_BYTES) {
    fail("Host-to-kernel protocol frame exceeded the limit.");
  }
}

process.stdin.on("data", (chunk) => {
  if (failed) return;
  if (hostBuffer.length + chunk.length > MAX_FRAME_BYTES) {
    fail("Host-to-kernel protocol frame exceeded the limit.");
    return;
  }
  hostBuffer = Buffer.concat([hostBuffer, chunk]);
  forwardHostFrames();
});
process.stdin.on("end", () => worker.stdin.end());
worker.stdin.on("error", (error) => {
  if (!failed) fail(`Kernel input failed: ${error.message}`);
});
worker.stderr.on("data", (chunk) => {
  workerStderr = `${workerStderr}${chunk.toString("utf8")}`.slice(-MAX_STDERR_BYTES);
});
worker.once("error", (error) => fail(`Kernel spawn failed: ${error.message}`));
worker.once("close", (code, signal) => {
  workerClosed = true;
  workerExitCode = code;
  workerExitSignal = signal;
  if (terminating && forceTimer) return;
  finishBroker();
});

process.stdout.on("error", () => {
  failed = true;
  terminateWorker();
});

process.on("SIGTERM", () => {
  failed = true;
  terminateWorker();
});
process.on("SIGINT", () => {
  if (persistentWorker && !terminating) {
    killTree("SIGINT");
    return;
  }
  failed = true;
  terminateWorker();
});

process.once("exit", () => {
  if (terminating) killTree("SIGKILL");
});
