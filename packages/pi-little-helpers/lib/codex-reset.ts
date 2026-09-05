// summary: "implements authenticated Codex reset-credit API parsing, redemption, ambiguity classification, and result formatting"
// read_when:
//   - "changing Codex reset endpoints, response parsing, authentication headers, or credit formatting"

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const MAX_ERROR_BODY_LENGTH = 500;

export interface CodexResetCredit {
  id?: string;
  status?: string;
  expiresAt?: string;
  title?: string;
}

export interface CodexResetCredits {
  availableCount: number;
  credits: CodexResetCredit[];
}

export type CodexResetOutcome =
  | "reset"
  | "already_redeemed"
  | "nothing_to_reset"
  | "no_credit"
  | "unknown";

export interface CodexResetResult {
  outcome: CodexResetOutcome;
  windowsReset?: number;
}

export type CodexResetFetch = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

export class CodexResetApiError extends Error {
  readonly ambiguous: boolean;

  constructor(message: string, ambiguous: boolean) {
    super(message);
    this.name = "CodexResetApiError";
    this.ambiguous = ambiguous;
  }
}

export function isAmbiguousCodexResetError(error: unknown): boolean {
  return !(error instanceof CodexResetApiError) || error.ambiguous;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined;
}

export function codexResetCreditsUrl(baseUrl = DEFAULT_CODEX_BASE_URL): string {
  return `${baseUrl.replace(/\/$/, "")}/wham/rate-limit-reset-credits`;
}

export function codexResetConsumeUrl(baseUrl = DEFAULT_CODEX_BASE_URL): string {
  return `${codexResetCreditsUrl(baseUrl)}/consume`;
}

export function parseCodexResetCredits(payload: unknown): CodexResetCredits | undefined {
  if (!isRecord(payload)) return undefined;
  const availableCount = nonNegativeInteger(payload.available_count);
  if (availableCount === undefined) return undefined;

  const credits = Array.isArray(payload.credits)
    ? payload.credits.flatMap((value): CodexResetCredit[] => {
        if (!isRecord(value)) return [];
        return [
          {
            ...(nonEmptyString(value.id) ? { id: nonEmptyString(value.id) } : {}),
            ...(nonEmptyString(value.status) ? { status: nonEmptyString(value.status) } : {}),
            ...(nonEmptyString(value.expires_at)
              ? { expiresAt: nonEmptyString(value.expires_at) }
              : {}),
            ...(nonEmptyString(value.title) ? { title: nonEmptyString(value.title) } : {}),
          },
        ];
      })
    : [];

  return { availableCount, credits };
}

export function parseCodexResetResult(payload: unknown): CodexResetResult {
  const root = isRecord(payload) ? payload : {};
  const code = nonEmptyString(root.code);
  const outcome: CodexResetOutcome =
    code === "reset" ||
    code === "already_redeemed" ||
    code === "nothing_to_reset" ||
    code === "no_credit"
      ? code
      : "unknown";
  const windowsReset = nonNegativeInteger(root.windows_reset);
  return { outcome, ...(windowsReset === undefined ? {} : { windowsReset }) };
}

function extractBearerToken(headers: Headers): string | undefined {
  return headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim();
}

function extractAccountId(token: string): string | undefined {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return undefined;
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as unknown;
    const claims = isRecord(payload) ? payload[JWT_CLAIM_PATH] : undefined;
    return isRecord(claims) ? nonEmptyString(claims.chatgpt_account_id) : undefined;
  } catch {
    return undefined;
  }
}

export async function buildCodexHeaders(
  ctx: ExtensionContext,
  allowSubscriptionAliases = false,
): Promise<Headers> {
  const model = ctx.model;
  if (!model) throw new Error("Select an OpenAI Codex subscription model first.");
  if (
    model.provider !== "openai-codex" &&
    !(allowSubscriptionAliases && /^openai-codex-\d+$/.test(model.provider))
  ) {
    throw new Error("Codex reset credits require an OpenAI Codex subscription model.");
  }

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) throw new Error(auth.error);

  const headers = new Headers(model.headers);
  for (const [key, value] of Object.entries(auth.headers ?? {})) {
    if (value === null) headers.delete(key);
    else headers.set(key, value);
  }
  if (auth.apiKey) headers.set("authorization", `Bearer ${auth.apiKey}`);

  const token = auth.apiKey ?? extractBearerToken(headers);
  const accountId = token ? extractAccountId(token) : undefined;
  if (accountId) headers.set("chatgpt-account-id", accountId);
  headers.set("accept", "application/json");
  headers.set("oai-language", "en");
  headers.set("originator", "pi");
  return headers;
}

async function readJson(
  response: Response,
  action: string,
  ambiguousOnInvalidSuccess = false,
): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    const detail = text.trim().slice(0, MAX_ERROR_BODY_LENGTH) || response.statusText;
    const ambiguous = response.status >= 500 || response.status === 408;
    throw new CodexResetApiError(
      `${action} failed (${response.status})${detail ? `: ${detail}` : ""}`,
      ambiguous,
    );
  }
  if (!text.trim()) {
    throw new CodexResetApiError(
      `${action} returned an empty response.`,
      ambiguousOnInvalidSuccess,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CodexResetApiError(
      `${action} returned an unreadable response.`,
      ambiguousOnInvalidSuccess,
    );
  }
}

export async function fetchCodexResetCredits(
  ctx: ExtensionContext,
  fetchImpl: CodexResetFetch = globalThis.fetch,
): Promise<CodexResetCredits> {
  const headers = await buildCodexHeaders(ctx);
  const response = await fetchImpl(codexResetCreditsUrl(), {
    method: "GET",
    headers,
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });
  const credits = parseCodexResetCredits(await readJson(response, "Reset-credit check"));
  if (!credits) throw new Error("Reset-credit check returned an unrecognized response.");
  return credits;
}

export function createCodexResetRequestId(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `pi_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function consumeCodexResetCredit(
  ctx: ExtensionContext,
  requestId: string,
  fetchImpl: CodexResetFetch = globalThis.fetch,
): Promise<CodexResetResult> {
  const headers = await buildCodexHeaders(ctx);
  headers.set("content-type", "application/json");
  const response = await fetchImpl(codexResetConsumeUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({ redeem_request_id: requestId }),
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });
  return parseCodexResetResult(await readJson(response, "Codex reset", true));
}

function availableCreditExpiries(credits: CodexResetCredit[]): Array<number | undefined> {
  return credits
    .filter((credit) => !credit.status || credit.status === "available")
    .map((credit) => {
      const expiresAt = credit.expiresAt ? Date.parse(credit.expiresAt) : Number.NaN;
      return Number.isFinite(expiresAt) ? expiresAt : undefined;
    })
    .sort(
      (left, right) => (left ?? Number.POSITIVE_INFINITY) - (right ?? Number.POSITIVE_INFINITY),
    );
}

export function formatRelativeExpiry(expiresAt: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((expiresAt - now) / 60_000));
  if (minutes < 90) return `~${minutes}m`;
  if (minutes < 1_440) return `~${Math.round(minutes / 60)}h`;
  return `~${Math.round(minutes / 1_440)}d`;
}

function formatAbsoluteExpiry(expiresAt: number): string {
  return new Date(expiresAt)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
}

export function formatCodexResetCredits(credits: CodexResetCredits, now = Date.now()): string {
  const count = credits.availableCount;
  if (count === 0) return "Codex banked resets: 0";

  const expiries = availableCreditExpiries(credits.credits);
  while (expiries.length < count) expiries.push(undefined);

  const lines = [`Codex banked resets: ${count}`];
  for (const [index, expiresAt] of expiries.entries()) {
    lines.push(
      expiresAt === undefined
        ? `${index + 1}. expiry unknown`
        : `${index + 1}. expires in ${formatRelativeExpiry(expiresAt, now)} — ${formatAbsoluteExpiry(expiresAt)}`,
    );
  }
  return lines.join("\n");
}

export function formatCodexResetResult(result: CodexResetResult): string {
  if (result.outcome === "reset") {
    const windows = result.windowsReset;
    return `Codex limits reset${windows ? ` (${windows} window${windows === 1 ? "" : "s"})` : ""}.`;
  }
  if (result.outcome === "already_redeemed") return "This reset request was already applied.";
  if (result.outcome === "nothing_to_reset")
    return "No active Codex limit needed resetting; no reset was applied.";
  if (result.outcome === "no_credit") return "No banked Codex reset was available.";
  return "Codex returned an unrecognized reset result.";
}
