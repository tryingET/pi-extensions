import { randomUUID } from "node:crypto";
import { writeSync } from "node:fs";
import readline from "node:readline";
import vm from "node:vm";

const pendingCapabilities = new Map();
const pendingPromises = new Set();
const state = Object.create(null);
let currentCatalog = [];
let currentOutputLimit = 50 * 1024;
let awaitingFinalizeId;
const MAX_STATE_BYTES = 1_000_000;
const MAX_PROTOCOL_BYTES = 2_000_000;

function writeProtocol(frame) {
  const buffer = Buffer.from(frame, "utf8");
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(3, buffer, offset, buffer.length - offset);
    if (written <= 0) throw new Error("Kernel protocol channel stopped accepting output.");
    offset += written;
  }
}

function send(message) {
  const frame = `${JSON.stringify(message)}\n`;
  if (Buffer.byteLength(frame, "utf8") > MAX_PROTOCOL_BYTES) {
    throw new Error("Kernel-to-host protocol frame exceeded the limit.");
  }
  writeProtocol(frame);
}

function sendFinal(message) {
  let payload = JSON.stringify(message);
  if (Buffer.byteLength(payload, "utf8") > MAX_PROTOCOL_BYTES) {
    payload = JSON.stringify({
      type: "eval_result",
      id: message.id,
      ok: false,
      error: "Serialized eval result exceeded the protocol limit; state was not committed.",
      stdout: "",
      stderr: "",
      elapsedMs: message.elapsedMs,
    });
  }
  awaitingFinalizeId = message.id;
  writeProtocol(`${payload}\n`);
}

function safeValue(value, depth = 0, seen = new WeakSet()) {
  if (value === undefined) return null;
  if (value === null || ["number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "string") return value.slice(0, currentOutputLimit);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return String(value);
  if (typeof value !== "object") return String(value);
  if (depth >= 12) return "[depth limit]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.slice(0, 2_000).map((entry) => safeValue(entry, depth + 1, seen));
    }
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 2_000)
        .map(([key, entry]) => [key, safeValue(entry, depth + 1, seen)]),
    );
  } finally {
    seen.delete(value);
  }
}

function serializeState() {
  const pending = [{ value: state, exiting: false }];
  const active = new Set();
  let visited = 0;
  while (pending.length > 0) {
    const frame = pending.pop();
    const current = frame.value;
    if (frame.exiting) {
      active.delete(current);
      continue;
    }
    visited += 1;
    if (visited > 100_000) throw new Error("state exceeds the structural node limit.");
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean" ||
      (typeof current === "number" && Number.isFinite(current))
    ) {
      continue;
    }
    if (!current || typeof current !== "object") {
      throw new Error("state must contain only strict JSON values.");
    }
    if (active.has(current)) throw new Error("state must not contain cycles.");
    active.add(current);
    pending.push({ value: current, exiting: true });
    if (Array.isArray(current)) {
      pending.push(...current.map((value) => ({ value, exiting: false })));
      continue;
    }
    const prototype = Object.getPrototypeOf(current);
    const isPlainObject = prototype === null || Object.getPrototypeOf(prototype) === null;
    if (!isPlainObject) {
      throw new Error("state objects must use plain JSON object semantics.");
    }
    pending.push(...Object.values(current).map((value) => ({ value, exiting: false })));
  }
  const payload = JSON.stringify(state);
  const bytes = Buffer.byteLength(payload, "utf8");
  if (bytes > MAX_STATE_BYTES) {
    throw new Error(`state exceeds the ${MAX_STATE_BYTES}-byte limit; state was not committed.`);
  }
  return JSON.parse(payload);
}

function hostCall(evalId, name, input = {}) {
  const callId = randomUUID();
  const promise = new Promise((resolve, reject) => {
    pendingCapabilities.set(callId, { resolve, reject });
    try {
      send({ type: "capability_call", evalId, callId, name, input: safeValue(input) });
    } catch (error) {
      pendingCapabilities.delete(callId);
      reject(error);
    }
  });
  pendingPromises.add(promise);
  void promise.catch(() => undefined);
  void promise.then(
    () => pendingPromises.delete(promise),
    () => pendingPromises.delete(promise),
  );
  return promise;
}

async function parallel(evalId, calls, maxConcurrency = 4) {
  if (!Array.isArray(calls)) throw new Error("tool.parallel calls must be an array.");
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 32) {
    throw new Error("tool.parallel maxConcurrency must be an integer from 1 to 32.");
  }
  const results = new Array(calls.length);
  let next = 0;
  async function worker() {
    while (next < calls.length) {
      const index = next++;
      const call = calls[index];
      if (!call || typeof call !== "object" || typeof call.name !== "string") {
        throw new Error(`tool.parallel call ${index} must contain a capability name.`);
      }
      results[index] = await hostCall(evalId, call.name, call.input ?? {});
    }
  }
  await Promise.all(Array.from({ length: Math.min(maxConcurrency, calls.length) }, () => worker()));
  return results;
}

function createTool(evalId) {
  const base = {
    call: (name, input = {}) => hostCall(evalId, name, input),
    list: () => currentCatalog.map((entry) => ({ ...entry })),
    parallel: (calls, maxConcurrency = 4) => parallel(evalId, calls, maxConcurrency),
  };
  return new Proxy(base, {
    get(target, property) {
      if (typeof property !== "string") return target[property];
      if (property in target) return target[property];
      if (property.startsWith("_")) return undefined;
      return (input = {}) => hostCall(evalId, property, input);
    },
  });
}

function createBoundedCapture(limitBytes) {
  let bytes = 0;
  let text = "";
  let truncated = false;
  return {
    append(value) {
      if (truncated) return;
      const separator = text ? "\n" : "";
      const candidate = `${separator}${value}`;
      const remaining = limitBytes - bytes;
      if (Buffer.byteLength(candidate, "utf8") <= remaining) {
        text += candidate;
        bytes += Buffer.byteLength(candidate, "utf8");
        return;
      }
      text += utf8Prefix(candidate, Math.max(0, remaining));
      truncated = true;
    },
    value() {
      return truncated ? `${text}\n[worker output truncated]` : text;
    },
  };
}

function utf8Prefix(text, maxBytes) {
  let result = "";
  let bytes = 0;
  for (const character of text) {
    const width = Buffer.byteLength(character, "utf8");
    if (bytes + width > maxBytes) break;
    result += character;
    bytes += width;
  }
  return result;
}

function boundedText(value, maxBytes = currentOutputLimit) {
  return utf8Prefix(String(value), Math.max(0, maxBytes));
}

function captureConsole(stdout, stderr) {
  const format = (values) =>
    values
      .map((value) => (typeof value === "string" ? value : JSON.stringify(safeValue(value))))
      .join(" ");
  return {
    log: (...values) => stdout.append(format(values)),
    info: (...values) => stdout.append(format(values)),
    debug: (...values) => stdout.append(format(values)),
    warn: (...values) => stderr.append(format(values)),
    error: (...values) => stderr.append(format(values)),
  };
}

async function executeEval(message) {
  const startedAt = Date.now();
  currentOutputLimit = Math.max(0, Number(message.outputLimitBytes) || 50 * 1024);
  const stdout = createBoundedCapture(currentOutputLimit);
  const stderr = createBoundedCapture(currentOutputLimit);
  currentCatalog = Array.isArray(message.capabilities) ? message.capabilities : [];
  for (const key of Object.keys(state)) delete state[key];
  if (message.state && typeof message.state === "object" && !Array.isArray(message.state)) {
    Object.assign(state, message.state);
  }
  try {
    process.chdir(message.cwd);
    const sandbox = {
      console: captureConsole(stdout, stderr),
      state,
      tool: createTool(message.id),
      TextDecoder,
      TextEncoder,
      URL,
      URLSearchParams,
      clearInterval,
      clearTimeout,
      queueMicrotask,
      setInterval,
      setTimeout,
    };
    const context = vm.createContext(sandbox, {
      codeGeneration: { strings: false, wasm: false },
      name: `pi-code-mode:${message.id}`,
    });
    const script = new vm.Script(`(async () => {\n${message.code}\n})()`, {
      filename: `pi-code-mode-${message.id}.mjs`,
      displayErrors: true,
    });
    const value = await script.runInContext(context);
    const pendingResults = await Promise.allSettled([...pendingPromises]);
    const rejected = pendingResults.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
    sendFinal({
      type: "eval_result",
      id: message.id,
      ok: true,
      value: safeValue(value),
      state: serializeState(),
      stdout: stdout.value(),
      stderr: stderr.value(),
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    sendFinal({
      type: "eval_result",
      id: message.id,
      ok: false,
      error: boundedText(error instanceof Error ? error.message : String(error)),
      stdout: stdout.value(),
      stderr: boundedText(
        `${stderr.value()}${stderr.value() ? "\n" : ""}${
          error instanceof Error ? error.stack : String(error)
        }`,
      ),
      elapsedMs: Date.now() - startedAt,
    });
  }
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    process.stderr.write(`Invalid host protocol JSON: ${error}\n`);
    process.exitCode = 1;
    lines.close();
    return;
  }
  if (message.type === "capability_result") {
    const pending = pendingCapabilities.get(message.callId);
    if (!pending) return;
    pendingCapabilities.delete(message.callId);
    if (message.ok) pending.resolve(message.value);
    else pending.reject(new Error(message.error ?? "Capability call failed."));
    return;
  }
  if (message.type === "finalize") {
    if (
      typeof message.id !== "string" ||
      typeof message.token !== "string" ||
      message.id !== awaitingFinalizeId
    ) {
      process.stderr.write("Invalid host finalization frame.\n");
      process.exit(1);
    }
    writeProtocol(
      `${JSON.stringify({ type: "eval_complete", id: message.id, token: message.token })}\n`,
    );
    process.exit(0);
  }
  if (message.type === "eval") {
    void executeEval(message);
  }
});

send({ type: "ready", runtime: "javascript" });
