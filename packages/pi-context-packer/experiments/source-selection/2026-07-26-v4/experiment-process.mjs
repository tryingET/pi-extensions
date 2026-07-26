import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access } from "node:fs/promises";

import { MAX_CAPTURE_BYTES, PATH_VALUE } from "./experiment-config.mjs";

function fail(message) {
  throw new Error(message);
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function rawDigest(value) {
  return `sha256:${sha256Hex(value)}`;
}

function normalizeText(value) {
  return String(value).trim().replace(/\s+/g, " ");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function cleanEnvironment(extra = {}) {
  return {
    ...process.env,
    PATH: PATH_VALUE,
    PUSHGATEWAY_URL: "",
    GIT_OPTIONAL_LOCKS: "0",
    ...extra,
  };
}

async function capture(command, args, options = {}) {
  const {
    cwd,
    env = cleanEnvironment(),
    input,
    detached = false,
    maxBytes = MAX_CAPTURE_BYTES,
  } = options;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let overflow = false;
    const add = (chunks, chunk, stream) => {
      const bytes = Buffer.from(chunk);
      if (stream === "stdout") stdoutBytes += bytes.length;
      else stderrBytes += bytes.length;
      if (stdoutBytes > maxBytes || stderrBytes > maxBytes) {
        overflow = true;
        try {
          if (detached && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {}
        return;
      }
      chunks.push(bytes);
    };
    child.stdout.on("data", (chunk) => add(stdout, chunk, "stdout"));
    child.stderr.on("data", (chunk) => add(stderr, chunk, "stderr"));
    child.on("error", rejectPromise);
    child.on("close", (code, signal) => {
      if (overflow) return rejectPromise(new Error(`${command}: captured output exceeded bound`));
      resolvePromise({
        code,
        signal,
        pid: child.pid,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

async function checked(command, args, options = {}) {
  const result = await capture(command, args, options);
  if (result.code !== 0 || result.signal !== null) {
    fail(
      `${command} ${args.join(" ")} failed: code=${result.code} signal=${result.signal} stderr=${result.stderr.toString("utf8").slice(0, 2000)}`,
    );
  }
  return result;
}

export {
  capture,
  checked,
  cleanEnvironment,
  exists,
  fail,
  normalizeText,
  rawDigest,
  sha256Hex,
  stableJson,
};
