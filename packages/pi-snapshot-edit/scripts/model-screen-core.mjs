import { spawn } from "node:child_process";
import {
  expectedLines,
  fixtureByteString,
  fixtureFor,
  simulatorOptions,
} from "./model-screen-fixtures.mjs";
import { executeProtocol } from "./protocol-simulator.mjs";

export const FIXED_SYSTEM_PROMPT =
  "You are a blinded file-edit screening model. Follow the supplied protocol and return exactly the requested strict JSON object, with no markdown or prose.";

export class ScreenError extends Error {
  constructor(category, message) {
    super(message);
    this.category = category;
  }
}

function assertNoDuplicateJsonKeys(source) {
  let index = 0;
  const whitespace = () => {
    while (/\s/.test(source[index] ?? "")) index += 1;
  };
  const string = () => {
    const start = index;
    if (source[index++] !== '"') throw new SyntaxError("expected JSON string");
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      if (source[index++] === '"') return JSON.parse(source.slice(start, index));
    }
    throw new SyntaxError("unterminated JSON string");
  };
  const value = () => {
    whitespace();
    if (source[index] === "{") {
      index += 1;
      whitespace();
      const keys = new Set();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      while (index < source.length) {
        whitespace();
        const key = string();
        if (keys.has(key)) throw new SyntaxError(`duplicate JSON key: ${key}`);
        keys.add(key);
        whitespace();
        if (source[index++] !== ":") throw new SyntaxError("expected colon");
        value();
        whitespace();
        if (source[index] === "}") {
          index += 1;
          return;
        }
        if (source[index++] !== ",") throw new SyntaxError("expected comma");
      }
      throw new SyntaxError("unterminated JSON object");
    }
    if (source[index] === "[") {
      index += 1;
      whitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      while (index < source.length) {
        value();
        whitespace();
        if (source[index] === "]") {
          index += 1;
          return;
        }
        if (source[index++] !== ",") throw new SyntaxError("expected comma");
      }
      throw new SyntaxError("unterminated JSON array");
    }
    if (source[index] === '"') {
      string();
      return;
    }
    const start = index;
    while (index < source.length && !/[\s,\]}]/.test(source[index])) index += 1;
    if (start === index) throw new SyntaxError("expected JSON value");
  };
  value();
  whitespace();
  if (index !== source.length) throw new SyntaxError("trailing JSON input");
}

function strictJsonParse(source) {
  assertNoDuplicateJsonKeys(source);
  return JSON.parse(source);
}

function requiredCount(value, field) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new ScreenError("usage_error", `missing or invalid usage.${field}`);
  return value;
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) throw new ScreenError("parse_ambiguity", "final content is absent");
  const texts = content.filter((part) => part?.type === "text" && typeof part.text === "string");
  if (texts.length !== 1)
    throw new ScreenError(
      "parse_ambiguity",
      "final content does not contain exactly one text part",
    );
  return texts[0].text;
}

function costTotal(cost) {
  if (cost === undefined || cost === null) return null;
  if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) return cost;
  if (typeof cost === "object" && Number.isFinite(cost.total) && cost.total >= 0) return cost.total;
  throw new ScreenError("usage_error", "reported cost has no valid total");
}

export function parsePiJsonl(raw) {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
  let events;
  try {
    events = lines.map((line) => strictJsonParse(line));
  } catch {
    throw new ScreenError("parse_ambiguity", "Pi output contains invalid JSONL");
  }
  const finals = events
    .filter((event) => event?.type === "message_end" && event.message?.role === "assistant")
    .map((event) => event.message);
  if (finals.length !== 1)
    throw new ScreenError(
      "parse_ambiguity",
      `expected one final assistant message, got ${finals.length}`,
    );
  const message = finals[0];
  if (
    typeof message.provider !== "string" ||
    typeof message.model !== "string" ||
    typeof message.api !== "string"
  )
    throw new ScreenError("usage_error", "final provider/model/api is missing");
  const usage = message.usage;
  if (!usage || typeof usage !== "object")
    throw new ScreenError("usage_error", "final usage is missing");
  return {
    text: textFromContent(message.content),
    provider: message.provider,
    model: message.model,
    api: message.api,
    usage: {
      input: requiredCount(usage.input, "input"),
      output: requiredCount(usage.output, "output"),
      cacheRead: requiredCount(usage.cacheRead, "cacheRead"),
      cacheWrite: requiredCount(usage.cacheWrite, "cacheWrite"),
      total: requiredCount(usage.totalTokens, "totalTokens"),
      cost: costTotal(usage.cost),
    },
  };
}

function parseResponse(text) {
  let value;
  try {
    value = strictJsonParse(text);
  } catch {
    throw new ScreenError("invalid_json", "model response is not strict JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ScreenError("schema_error", "model response must be an object");
  return value;
}

function exactKeys(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => [...required, ...optional].includes(key))
  );
}

function validateEditSchema(protocol, call) {
  const topKeys = protocol === "E" ? ["path", "base", "patch"] : ["path", "base", "edits"];
  if (!exactKeys(call, topKeys) || call.path !== "screen.txt" || typeof call.base !== "string")
    throw new ScreenError("schema_error", "invalid edit-call envelope");
  if (protocol === "E") {
    if (typeof call.patch !== "string") throw new ScreenError("schema_error", "invalid patch");
    return;
  }
  if (!Array.isArray(call.edits) || call.edits.length < 1)
    throw new ScreenError("schema_error", "edits must be a non-empty array");
  for (const edit of call.edits) {
    let valid = false;
    if (protocol === "A" || protocol === "C")
      valid =
        (edit?.op === "replace" && exactKeys(edit, ["op", "startLine", "endLine", "newText"])) ||
        (edit?.op === "insert_after" && exactKeys(edit, ["op", "startLine", "newText"]));
    else if (protocol === "B")
      valid =
        (edit?.op === "replace" && exactKeys(edit, ["op", "oldText", "newText"], ["occurrence"])) ||
        (edit?.op === "insert_after" &&
          exactKeys(edit, ["op", "anchorText", "newText"], ["occurrence"]));
    else
      valid =
        (edit?.op === "replace" && exactKeys(edit, ["op", "startId", "endId", "newText"])) ||
        (edit?.op === "insert_after" && exactKeys(edit, ["op", "afterId", "newText"]));
    if (!valid) throw new ScreenError("schema_error", "invalid protocol operation shape");
  }
}

function validateRange(range, workload, editCall) {
  const lineCount = fixtureFor(workload).lines.length;
  if (
    !exactKeys(range, ["offset", "limit"]) ||
    !Number.isInteger(range.offset) ||
    !Number.isInteger(range.limit) ||
    range.offset < 1 ||
    range.limit < 1 ||
    range.offset + range.limit - 1 > lineCount
  )
    throw new ScreenError("range_error", "C range is invalid");
  const high = range.offset + range.limit - 1;
  const submittedTargets = editCall.edits.flatMap((edit) =>
    edit.op === "insert_after" ? [Math.max(1, edit.startLine)] : [edit.startLine, edit.endLine],
  );
  if (submittedTargets.some((target) => target < range.offset || target > high))
    throw new ScreenError(
      "range_error",
      "C range does not cover every submitted coordinate target",
    );
}

export function scorePiOutput({ raw, selectedModel, protocol, workload }) {
  let parsed;
  try {
    parsed = parsePiJsonl(raw);
  } catch (error) {
    return { validJson: false, correct: false, error: error.category ?? "parse_ambiguity" };
  }
  const expectedIdentity = {
    "zai/glm-5.2": { provider: "zai", model: "glm-5.2", api: "openai-completions" },
    "openai-codex/gpt-5.6-sol": {
      provider: "openai-codex",
      model: "gpt-5.6-sol",
      api: "openai-codex-responses",
    },
  }[selectedModel];
  if (
    !expectedIdentity ||
    parsed.provider !== expectedIdentity.provider ||
    parsed.model !== expectedIdentity.model ||
    parsed.api !== expectedIdentity.api
  )
    return { validJson: false, correct: false, error: "model_mismatch" };
  let response;
  try {
    response = parseResponse(parsed.text);
  } catch (error) {
    return { validJson: false, correct: false, error: error.category, usage: parsed.usage };
  }
  try {
    if (protocol === "C" && !exactKeys(response, ["range", "edit"]))
      throw new ScreenError("schema_error", "C response must contain exactly range and edit");
    const editCall = protocol === "C" ? response.edit : response;
    validateEditSchema(protocol, editCall);
    if (protocol === "C") validateRange(response.range, workload, editCall);
    const item = fixtureFor(workload);
    const actual = executeProtocol(
      protocol,
      item.lines,
      editCall,
      simulatorOptions(protocol, workload),
    );
    const correct = fixtureByteString(actual) === fixtureByteString(expectedLines(workload));
    return {
      validJson: true,
      correct,
      error: correct ? null : "wrong_bytes",
      usage: parsed.usage,
    };
  } catch (error) {
    return {
      validJson: true,
      correct: false,
      error: error instanceof ScreenError ? error.category : "simulator_error",
      usage: parsed.usage,
    };
  }
}

export function runPi({
  model,
  prompt,
  cwd,
  spawnImpl = spawn,
  timeoutMs = 180_000,
  killGraceMs = 5_000,
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new ScreenError("process_error", "timeout must be a positive integer");
  const args = [
    "-p",
    "--no-tools",
    "--no-session",
    "--mode",
    "json",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--model",
    model,
    "--system-prompt",
    FIXED_SYSTEM_PROMPT,
  ];
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl("pi", args, {
        cwd,
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          PI_SKIP_VERSION_CHECK: "1",
          PI_TELEMETRY: "0",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      reject(new ScreenError("process_error", `Pi process error: ${error.message}`));
      return;
    }
    let stdout = "";
    let bytes = 0;
    let overflow = false;
    let timedOut = false;
    let settled = false;
    let killTimer;
    let closeResult;
    const signalTree = (signal) => {
      try {
        if (process.platform !== "win32" && Number.isInteger(child.pid))
          process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) {
        if (error?.code !== "ESRCH") child.kill(signal);
      }
    };
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      signalTree("SIGTERM");
      killTimer = setTimeout(() => {
        signalTree("SIGKILL");
        finish(() => reject(new ScreenError("timeout", `Pi exceeded ${timeoutMs}ms timeout`)));
      }, killGraceMs);
    }, timeoutMs);
    timeoutTimer.unref?.();
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      callback();
    };
    const collect = (target) => (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 2_000_000) {
        overflow = true;
        signalTree("SIGKILL");
        return;
      }
      if (target === "stdout") stdout += chunk;
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));
    child.on("error", (error) => {
      if (timedOut) return;
      finish(() => reject(new ScreenError("process_error", `Pi process error: ${error.message}`)));
    });
    child.on("close", (code) => {
      closeResult = code;
      if (timedOut) return;
      finish(() => {
        if (overflow) reject(new ScreenError("process_error", "Pi output exceeded memory limit"));
        else if (closeResult !== 0)
          reject(new ScreenError("process_error", `Pi exited with status ${closeResult}`));
        else resolve(stdout);
      });
    });
    child.stdin.on("error", (error) => {
      if (error?.code !== "EPIPE") {
        signalTree("SIGKILL");
        finish(() => reject(new ScreenError("process_error", `Pi stdin error: ${error.message}`)));
      }
    });
    child.stdin.end(prompt);
  });
}

export function aggregateResults(results) {
  const cells = new Map();
  for (const result of results) {
    const key = JSON.stringify([result.model, result.protocol, result.workload]);
    const cell = cells.get(key) ?? {
      model: result.model,
      protocol: result.protocol,
      workload: result.workload,
      attempts: 0,
      validJson: 0,
      correct: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      reportedCost: 0,
      reportedCostSamples: 0,
      errorCategories: {},
    };
    cell.attempts += 1;
    cell.validJson += Number(result.validJson);
    cell.correct += Number(result.correct);
    if (result.usage) {
      cell.inputTokens += result.usage.input;
      cell.outputTokens += result.usage.output;
      cell.cacheReadTokens += result.usage.cacheRead;
      cell.cacheWriteTokens += result.usage.cacheWrite;
      cell.totalTokens += result.usage.total;
      if (result.usage.cost !== null) {
        cell.reportedCost += result.usage.cost;
        cell.reportedCostSamples += 1;
      }
    }
    if (result.error)
      cell.errorCategories[result.error] = (cell.errorCategories[result.error] ?? 0) + 1;
    cells.set(key, cell);
  }
  return { schemaVersion: 1, screeningMode: "blinded-one-response", cells: [...cells.values()] };
}
