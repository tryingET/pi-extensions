// summary: parses visible-loop launch and completion command arguments into bounded typed results.
// read_when:
//   - changing visible-loop flags, defaults, tokenization, or completion argument validation.
import {
  VISIBLE_LOOP_COMMAND,
  type VisibleLoopCommandParseResult,
  type VisibleLoopCompletionParseResult,
  type VisibleLoopReportBack,
} from "./visibleLoopTypes.ts";

export function parseVisibleLoopCommandArgs(
  args: string | undefined,
  commandName = VISIBLE_LOOP_COMMAND,
): VisibleLoopCommandParseResult {
  const usage = `Usage: /${commandName} (--objective "bounded objective"|--task AK-ID|--candidate evolution-...) [--count N|N] [--parentPeerTarget session-...] [--reportBack intercom|manual|none] [--delegate-commit]`;
  const rawArgs = args ?? "";
  if (hasUnmatchedQuote(rawArgs)) {
    return { ok: false, error: "Unterminated quoted argument.", usage };
  }
  const tokens = tokenizeArgs(rawArgs);
  let loopCount: number | undefined;
  let parentPeerTarget: string | undefined;
  let reportBack: VisibleLoopReportBack | undefined;
  let delegateCommit = false;
  let candidateId: string | undefined;
  let objective: string | undefined;
  let taskId: number | undefined;
  let bindingOccurrences = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;

    if (token === "--count" || token === "-n") {
      index += 1;
      const value = tokens[index];
      const parsed = parseLoopCount(value);
      if (!parsed) return { ok: false, error: `Invalid loop count: ${value ?? ""}`, usage };
      loopCount = parsed;
      continue;
    }

    if (token.startsWith("--count=")) {
      const parsed = parseLoopCount(token.slice("--count=".length));
      if (!parsed) return { ok: false, error: `Invalid loop count: ${token}`, usage };
      loopCount = parsed;
      continue;
    }

    if (token === "--parentPeerTarget" || token === "--parent" || token === "--to") {
      index += 1;
      parentPeerTarget = normalizeOptionalString(tokens[index]);
      if (!parentPeerTarget) return { ok: false, error: "Missing parent peer target.", usage };
      continue;
    }

    if (token.startsWith("--parentPeerTarget=")) {
      parentPeerTarget = normalizeOptionalString(token.slice("--parentPeerTarget=".length));
      if (!parentPeerTarget) return { ok: false, error: "Missing parent peer target.", usage };
      continue;
    }

    if (token === "--reportBack" || token === "--report-back") {
      index += 1;
      const parsed = parseReportBack(tokens[index]);
      if (!parsed) return { ok: false, error: `Invalid reportBack: ${tokens[index] ?? ""}`, usage };
      reportBack = parsed;
      continue;
    }

    if (token.startsWith("--reportBack=") || token.startsWith("--report-back=")) {
      const raw = token.includes("--reportBack=")
        ? token.slice("--reportBack=".length)
        : token.slice("--report-back=".length);
      const parsed = parseReportBack(raw);
      if (!parsed) return { ok: false, error: `Invalid reportBack: ${raw}`, usage };
      reportBack = parsed;
      continue;
    }

    if (token === "--manual") {
      reportBack = "manual";
      continue;
    }

    if (token === "--none") {
      reportBack = "none";
      continue;
    }

    if (token === "--delegate-commit" || token === "--delegateCommit") {
      delegateCommit = true;
      continue;
    }

    if (token === "--candidate") {
      bindingOccurrences += 1;
      index += 1;
      candidateId = parseCandidateId(tokens[index]);
      if (!candidateId) return { ok: false, error: "Missing or invalid candidate id.", usage };
      continue;
    }

    if (token.startsWith("--candidate=")) {
      bindingOccurrences += 1;
      candidateId = parseCandidateId(token.slice("--candidate=".length));
      if (!candidateId) return { ok: false, error: "Missing or invalid candidate id.", usage };
      continue;
    }

    if (token === "--objective") {
      bindingOccurrences += 1;
      index += 1;
      const value = tokens[index];
      if (value?.startsWith("-")) {
        return { ok: false, error: "Missing or invalid objective.", usage };
      }
      objective = parseObjective(value);
      if (!objective) return { ok: false, error: "Missing or invalid objective.", usage };
      continue;
    }

    if (token.startsWith("--objective=")) {
      bindingOccurrences += 1;
      objective = parseObjective(token.slice("--objective=".length));
      if (!objective) return { ok: false, error: "Missing or invalid objective.", usage };
      continue;
    }

    if (token === "--task") {
      bindingOccurrences += 1;
      index += 1;
      taskId = parseTaskId(tokens[index]);
      if (!taskId) return { ok: false, error: "Missing or invalid AK task id.", usage };
      continue;
    }

    if (token.startsWith("--task=")) {
      bindingOccurrences += 1;
      taskId = parseTaskId(token.slice("--task=".length));
      if (!taskId) return { ok: false, error: "Missing or invalid AK task id.", usage };
      continue;
    }

    if (!token.startsWith("-") && loopCount === undefined) {
      const parsed = parseLoopCount(token);
      if (!parsed) return { ok: false, error: `Invalid loop count: ${token}`, usage };
      loopCount = parsed;
      continue;
    }

    return { ok: false, error: `Unknown argument: ${token}`, usage };
  }

  const bindingCount = [candidateId, objective, taskId].filter(
    (value) => value !== undefined,
  ).length;
  if (bindingCount === 0) {
    return {
      ok: false,
      error: `/${commandName} requires one explicit execution binding: --objective, --task, or --candidate. Run direction-to-execution or choose an owner-authorized task before launching an execution loop.`,
      usage,
    };
  }
  if (bindingCount > 1 || bindingOccurrences > 1) {
    return {
      ok: false,
      error: "Choose exactly one execution binding: --objective, --task, or --candidate.",
      usage,
    };
  }

  return {
    ok: true,
    loopCount: loopCount ?? 1,
    reportBack: reportBack ?? "intercom",
    parentPeerTarget,
    ...(delegateCommit ? { delegateCommit } : {}),
    ...(candidateId ? { candidateId } : {}),
    ...(objective ? { objective } : {}),
    ...(taskId ? { taskId } : {}),
  };
}

function parseObjective(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized || normalized.length > 2_000 || normalized.includes("\u0000")) return undefined;
  return normalized;
}

function parseTaskId(value: string | undefined): number | undefined {
  const normalized = value?.trim().replace(/^AK-/iu, "");
  if (!normalized || !/^\d+$/u.test(normalized)) return undefined;
  const taskId = Number(normalized);
  return Number.isSafeInteger(taskId) && taskId > 0 ? taskId : undefined;
}

function parseCandidateId(value: string | undefined): string | undefined {
  if (!value || value.length > 160 || !/^evolution-[A-Za-z0-9._-]+$/u.test(value)) {
    return undefined;
  }
  return value;
}

export function parseVisibleLoopCompletionArgs(
  args: string | undefined,
): VisibleLoopCompletionParseResult {
  const rawArgs = args ?? "";
  if (hasUnmatchedQuote(rawArgs)) return { ok: false, error: "unterminated quoted argument" };
  const tokens = tokenizeArgs(rawArgs);
  let configPath: string | undefined;
  let iteration: number | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--iteration") {
      index += 1;
      iteration = parseLoopCount(tokens[index]);
      if (!iteration) return { ok: false, error: `invalid iteration: ${tokens[index] ?? ""}` };
      continue;
    }
    if (token?.startsWith("--iteration=")) {
      iteration = parseLoopCount(token.slice("--iteration=".length));
      if (!iteration) return { ok: false, error: `invalid iteration: ${token}` };
      continue;
    }
    if (!token?.startsWith("-") && !configPath) {
      configPath = normalizeOptionalString(token);
      continue;
    }
    return { ok: false, error: `unknown argument: ${token ?? ""}` };
  }

  return { ok: true, ...(configPath ? { configPath } : {}), ...(iteration ? { iteration } : {}) };
}

export function parseLoopCount(value: string | undefined): number | undefined {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > 100) return undefined;
  return numberValue;
}

export function parseReportBack(value: string | undefined): VisibleLoopReportBack | undefined {
  if (value === "intercom" || value === "manual" || value === "none") return value;
  return undefined;
}

export function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasUnmatchedQuote(input: string): boolean {
  let quote: '"' | "'" | null = null;
  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    }
  }
  return quote !== null;
}

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}
