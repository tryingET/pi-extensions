import {
  VISIBLE_LOOP_CHILD_COMMAND,
  VISIBLE_LOOP_COMMAND,
  type VisibleLoopChildParseResult,
  type VisibleLoopCommandParseResult,
  type VisibleLoopCompletionParseResult,
  type VisibleLoopReportBack,
} from "./visibleLoopTypes.ts";

export function parseVisibleLoopCommandArgs(
  args: string | undefined,
  commandName = VISIBLE_LOOP_COMMAND,
): VisibleLoopCommandParseResult {
  const usage = `Usage: /${commandName} [--count N|N] [--parentPeerTarget session-...] [--reportBack intercom|manual|none] [--delegate-commit] [--candidate evolution-...]`;
  const tokens = tokenizeArgs(args ?? "");
  let loopCount: number | undefined;
  let parentPeerTarget: string | undefined;
  let reportBack: VisibleLoopReportBack | undefined;
  let delegateCommit = false;
  let candidateId: string | undefined;

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
      index += 1;
      candidateId = parseCandidateId(tokens[index]);
      if (!candidateId) return { ok: false, error: "Missing or invalid candidate id.", usage };
      continue;
    }

    if (token.startsWith("--candidate=")) {
      candidateId = parseCandidateId(token.slice("--candidate=".length));
      if (!candidateId) return { ok: false, error: "Missing or invalid candidate id.", usage };
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

  return {
    ok: true,
    loopCount: loopCount ?? 1,
    reportBack: reportBack ?? "intercom",
    parentPeerTarget,
    ...(delegateCommit ? { delegateCommit } : {}),
    ...(candidateId ? { candidateId } : {}),
  };
}

function parseCandidateId(value: string | undefined): string | undefined {
  if (!value || value.length > 160 || !/^evolution-[A-Za-z0-9._-]+$/u.test(value)) {
    return undefined;
  }
  return value;
}

export function parseVisibleLoopChildArgs(args: string | undefined): VisibleLoopChildParseResult {
  const usage = `Usage: /${VISIBLE_LOOP_CHILD_COMMAND} <config-path> [--claim-token TOKEN]`;
  const tokenized = tokenizeArgsStrict(args ?? "");
  if (!tokenized.ok) return { ok: false, error: tokenized.error, usage };
  let configPath: string | undefined;
  let claimToken: string | undefined;
  for (let index = 0; index < tokenized.tokens.length; index += 1) {
    const token = tokenized.tokens[index];
    if (token === "--claim-token") {
      if (claimToken) return { ok: false, error: "duplicate claim token", usage };
      index += 1;
      claimToken = parseClaimToken(tokenized.tokens[index]);
      if (!claimToken) return { ok: false, error: "missing or invalid claim token", usage };
      continue;
    }
    if (token?.startsWith("--claim-token=")) {
      if (claimToken) return { ok: false, error: "duplicate claim token", usage };
      claimToken = parseClaimToken(token.slice("--claim-token=".length));
      if (!claimToken) return { ok: false, error: "missing or invalid claim token", usage };
      continue;
    }
    if (!token?.startsWith("-") && !configPath) {
      configPath = normalizeOptionalString(token);
      if (!configPath || hasControlCharacters(configPath)) {
        return { ok: false, error: "invalid config path", usage };
      }
      continue;
    }
    return { ok: false, error: `unknown argument: ${token ?? ""}`, usage };
  }
  if (!configPath) return { ok: false, error: "missing config path", usage };
  return { ok: true, configPath, ...(claimToken ? { claimToken } : {}) };
}

export function renderVisibleLoopChildCommand(configPath: string, claimToken?: string): string {
  if (!configPath.trim() || hasControlCharacters(configPath)) {
    throw new Error("invalid visible-loop child config path");
  }
  const token = claimToken ? parseClaimToken(claimToken) : undefined;
  if (claimToken && !token) throw new Error("invalid visible-loop continuation claim token");
  return `/${VISIBLE_LOOP_CHILD_COMMAND} ${quoteVisibleLoopCommandArg(configPath)}${
    token ? ` --claim-token ${quoteVisibleLoopCommandArg(token)}` : ""
  }`;
}

function parseClaimToken(value: string | undefined): string | undefined {
  return value && /^[A-Za-z0-9_-]{32,128}$/u.test(value) ? value : undefined;
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

function quoteVisibleLoopCommandArg(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(value)) return value;
  return JSON.stringify(value);
}

function tokenizeArgsStrict(
  input: string,
): { ok: true; tokens: string[] } | { ok: false; error: string } {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/u.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaped) return { ok: false, error: "unterminated escape in child arguments" };
  if (quote) return { ok: false, error: "unterminated quote in child arguments" };
  if (current) tokens.push(current);
  return { ok: true, tokens };
}

export function parseVisibleLoopCompletionArgs(
  args: string | undefined,
): VisibleLoopCompletionParseResult {
  const tokens = tokenizeArgs(args ?? "");
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
