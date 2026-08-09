#!/usr/bin/env node
// ---
// summary: "Gates canary subprocess effects until their process identity is durably journaled."
// read_when:
//   - "Changing hard-interruption child-process handling or npm sandbox cleanup."
// ---
import { spawn } from "node:child_process";
import { removeDirectoryByHandle } from "./integrity.mjs";

let command;
try {
  command = JSON.parse(process.argv[2] ?? "null");
  if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== "string")) {
    throw new Error("invalid wrapped command");
  }
} catch (error) {
  console.error(`command wrapper setup failed: ${error.message}`);
  process.exit(125);
}

let cleanup;
try {
  cleanup = process.env.PI_HOST_COMPAT_WRAPPER_CLEANUP
    ? JSON.parse(process.env.PI_HOST_COMPAT_WRAPPER_CLEANUP)
    : null;
} catch {
  console.error("command wrapper cleanup descriptor is malformed");
  process.exit(125);
}
delete process.env.PI_HOST_COMPAT_WRAPPER_CLEANUP;

let started = false;
let settled = false;
function report(message) {
  if (process.connected) {
    try { process.send(message); } catch {}
  }
}
function cleanupSandbox() {
  if (!cleanup) return null;
  try {
    removeDirectoryByHandle(cleanup.path, cleanup.identity);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
function settle(result) {
  if (settled) return;
  settled = true;
  const cleanupError = cleanupSandbox();
  const finalResult = cleanupError
    ? { ...result, ok: false, cleanupError, error: [result.error, `npm environment cleanup failed: ${cleanupError}`].filter(Boolean).join("; ") }
    : result;
  report({ type: "result", result: finalResult });
  process.exitCode = finalResult.ok ? 0 : (Number.isInteger(finalResult.exitCode) ? finalResult.exitCode : 1);
  if (process.connected) process.disconnect();
}

process.on("message", (message) => {
  if (started || settled) return;
  if (message?.type === "abort") {
    settle({ ok: false, exitCode: 1, signal: null, error: message.error ?? "command release aborted" });
    return;
  }
  if (message?.type !== "run") return;
  started = true;
  const [executable, ...args] = command;
  const child = spawn(executable, args, { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  child.once("error", (error) => {
    settle({ ok: false, exitCode: 1, signal: null, error: error.message });
  });
  child.once("close", (code, signal) => {
    settle({ ok: code === 0, exitCode: code ?? 1, signal: signal ?? null });
  });
});

process.on("disconnect", () => {
  if (!started && !settled) settle({ ok: false, exitCode: 125, signal: null, error: "command parent disconnected before durable release" });
});

if (typeof process.send !== "function") {
  settle({ ok: false, exitCode: 125, signal: null, error: "command wrapper requires an IPC parent" });
} else {
  report({ type: "ready" });
}
