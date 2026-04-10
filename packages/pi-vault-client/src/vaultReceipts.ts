import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type {
  VaultExecutionLogResult,
  VaultExecutionReceiptSink,
  VaultExecutionReceiptV1,
  VaultPreparedExecutionCandidate,
  VaultReceiptManager,
  VaultRuntime,
} from "./vaultTypes.js";
import { RENDER_ENGINES } from "./vaultTypes.js";

const DEFAULT_PENDING_TTL_MS = 10 * 60 * 1000;
const DEFAULT_PENDING_LIMIT = 64;
const DEFAULT_RECEIPTS_FILE = path.join(
  process.env.PI_VAULT_RECEIPTS_DIR ||
    path.join(homedir(), ".pi", "agent", "state", "pi-vault-client"),
  "vault-execution-receipts.jsonl",
);
const DEFAULT_RECEIPT_KEY_FILE = "vault-execution-receipts.key";

const EXECUTION_MARKER_START = "\u2063\u2063\u2063";
const EXECUTION_MARKER_END = "\u2064\u2064\u2064";
const EXECUTION_MARKER_ZERO = "\u200b";
const EXECUTION_MARKER_ONE = "\u200c";
const EXECUTION_MARKER_REGEX = new RegExp(
  `${EXECUTION_MARKER_START}([${EXECUTION_MARKER_ZERO}${EXECUTION_MARKER_ONE}]+)${EXECUTION_MARKER_END}`,
  "g",
);
const VALID_RENDER_ENGINES = new Set(RENDER_ENGINES);
const TRUSTED_RECEIPT_AUTHORIZATION = Symbol(
  "@tryinget/pi-vault-client/trusted-vault-receipt-authorization",
);

interface ReceiptSigningKeyRecord {
  key: Buffer;
  keyId: string;
}

interface ReceiptAuthorityCandidate {
  receipt: VaultExecutionReceiptV1;
  trusted: boolean;
}

function ensureReceiptDirectory(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function buildDefaultFallbackReceiptsFile(filePath: string): string {
  return path.join(
    tmpdir(),
    "pi-vault-client",
    sha256(filePath).slice(0, 16),
    "vault-execution-receipts.fallback.jsonl",
  );
}

function buildDefaultReceiptKeyPath(filePath: string): string {
  return path.join(path.dirname(filePath), DEFAULT_RECEIPT_KEY_FILE);
}

function enforceSecureReceiptKeyMode(keyPath: string): void {
  const currentMode = statSync(keyPath).mode & 0o777;
  if (currentMode !== 0o600) chmodSync(keyPath, 0o600);
}

function loadOrCreateReceiptSigningKey(keyPath: string, createIfMissing: boolean): Buffer {
  ensureReceiptDirectory(keyPath);
  if (existsSync(keyPath)) {
    enforceSecureReceiptKeyMode(keyPath);
    return readFileSync(keyPath);
  }
  if (!createIfMissing) {
    throw new Error(`Receipt signing key not found: ${keyPath}`);
  }
  const key = randomBytes(32);
  try {
    writeFileSync(keyPath, key, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code !== "EEXIST") throw error;
  }
  enforceSecureReceiptKeyMode(keyPath);
  return readFileSync(keyPath);
}

function buildReceiptAuthKeyId(key: Buffer): string {
  return sha256(key.toString("hex")).slice(0, 16);
}

function canonicalizeReceiptForAuth(receipt: VaultExecutionReceiptV1): string {
  return JSON.stringify({
    schema_version: receipt.schema_version,
    receipt_kind: receipt.receipt_kind,
    execution_id: receipt.execution_id,
    recorded_at: receipt.recorded_at,
    invocation: receipt.invocation,
    template: receipt.template,
    company: receipt.company,
    model: receipt.model,
    render: receipt.render,
    prepared: receipt.prepared,
    replay_safe_inputs: receipt.replay_safe_inputs,
  });
}

function buildReceiptAuthSignature(receipt: VaultExecutionReceiptV1, key: Buffer): string {
  return createHmac("sha256", key)
    .update(canonicalizeReceiptForAuth(receipt), "utf8")
    .digest("hex");
}

function withReceiptAuth(receipt: VaultExecutionReceiptV1, key: Buffer): VaultExecutionReceiptV1 {
  return {
    ...receipt,
    auth: {
      mode: "hmac-sha256",
      key_id: buildReceiptAuthKeyId(key),
      signature: buildReceiptAuthSignature(receipt, key),
    },
  };
}

function markReceiptTrustedForAuthorization(
  receipt: VaultExecutionReceiptV1,
): VaultExecutionReceiptV1 {
  if (receiptTrustedForAuthorization(receipt)) return receipt;
  Object.defineProperty(receipt, TRUSTED_RECEIPT_AUTHORIZATION, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return receipt;
}

export function receiptTrustedForAuthorization(
  receipt: VaultExecutionReceiptV1 | null | undefined,
): boolean {
  return Boolean(
    receipt && (receipt as unknown as Record<PropertyKey, unknown>)[TRUSTED_RECEIPT_AUTHORIZATION],
  );
}

export function receiptHasTrustedAuth(receipt: VaultExecutionReceiptV1, key: Buffer): boolean {
  if (!receipt.auth) return false;
  if (receipt.auth.mode !== "hmac-sha256") return false;
  if (receipt.auth.key_id !== buildReceiptAuthKeyId(key)) return false;
  return buildReceiptAuthSignature(receipt, key) === receipt.auth.signature;
}

function toReceiptSigningKeyRecord(key: Buffer): ReceiptSigningKeyRecord {
  return {
    key,
    keyId: buildReceiptAuthKeyId(key),
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeReceiptReplayInputs(
  value: unknown,
): VaultExecutionReceiptV1["replay_safe_inputs"] | null {
  if (!isRecord(value) || typeof value.kind !== "string") return null;
  if (value.kind === "vault-selection") {
    if (typeof value.query !== "string" || typeof value.context !== "string") return null;
    return {
      kind: "vault-selection",
      query: value.query,
      context: value.context,
    };
  }
  if (value.kind === "route-request") {
    if (typeof value.context !== "string") return null;
    return {
      kind: "route-request",
      context: value.context,
    };
  }
  if (value.kind === "grounding-request") {
    if (
      typeof value.command_text !== "string" ||
      typeof value.objective !== "string" ||
      typeof value.workflow !== "string" ||
      typeof value.mode !== "string" ||
      typeof value.extras !== "string" ||
      !isRecord(value.framework_resolution) ||
      !isStringArray(value.framework_resolution.selected_names) ||
      typeof value.framework_resolution.retrieval_method !== "string" ||
      !Number.isFinite(Number(value.framework_resolution.discovery_used)) ||
      !isStringArray(value.framework_resolution.invalid_overrides) ||
      !isStringArray(value.framework_resolution.warnings)
    ) {
      return null;
    }
    return {
      kind: "grounding-request",
      command_text: value.command_text,
      objective: value.objective,
      workflow: value.workflow,
      mode: value.mode,
      extras: value.extras,
      framework_resolution: {
        selected_names: [...value.framework_resolution.selected_names],
        retrieval_method: value.framework_resolution
          .retrieval_method as VaultExecutionReceiptV1["replay_safe_inputs"] extends infer T
          ? T extends { kind: "grounding-request"; framework_resolution: infer F }
            ? F extends { retrieval_method: infer R }
              ? R
              : never
            : never
          : never,
        discovery_used: Number(value.framework_resolution.discovery_used) as 0 | 1,
        invalid_overrides: [...value.framework_resolution.invalid_overrides],
        warnings: [...value.framework_resolution.warnings],
      },
    };
  }
  return null;
}

function normalizeReceipt(value: unknown): VaultExecutionReceiptV1 | null {
  if (!isRecord(value)) return null;
  if (value.receipt_kind !== "vault_execution") return null;
  if (value.schema_version !== 1) return null;
  if (!Number.isFinite(Number(value.execution_id))) return null;
  if (typeof value.recorded_at !== "string") return null;
  if (!isRecord(value.invocation)) return null;
  if (
    typeof value.invocation.surface !== "string" ||
    typeof value.invocation.channel !== "string" ||
    typeof value.invocation.selection_mode !== "string"
  ) {
    return null;
  }
  if (!isRecord(value.template)) return null;
  if (
    typeof value.template.name !== "string" ||
    typeof value.template.artifact_kind !== "string" ||
    typeof value.template.control_mode !== "string" ||
    typeof value.template.formalization_level !== "string" ||
    typeof value.template.owner_company !== "string" ||
    !isStringArray(value.template.visibility_companies)
  ) {
    return null;
  }
  if (!isRecord(value.company)) return null;
  if (
    typeof value.company.current_company !== "string" ||
    typeof value.company.company_source !== "string"
  ) {
    return null;
  }
  if (!isRecord(value.model) || typeof value.model.id !== "string") return null;
  if (!isRecord(value.render)) return null;
  if (
    typeof value.render.engine !== "string" ||
    !VALID_RENDER_ENGINES.has(value.render.engine as (typeof RENDER_ENGINES)[number]) ||
    (value.render.explicit_engine != null && typeof value.render.explicit_engine !== "string") ||
    typeof value.render.context_appended !== "boolean" ||
    typeof value.render.append_context_section !== "boolean" ||
    !isStringArray(value.render.used_render_keys)
  ) {
    return null;
  }
  if (!isRecord(value.prepared)) return null;
  if (
    typeof value.prepared.text !== "string" ||
    typeof value.prepared.sha256 !== "string" ||
    typeof value.prepared.edited_after_prepare !== "boolean"
  ) {
    return null;
  }
  const replaySafeInputs = normalizeReceiptReplayInputs(value.replay_safe_inputs);
  if (!replaySafeInputs) return null;
  const auth =
    value.auth == null
      ? null
      : isRecord(value.auth) &&
          value.auth.mode === "hmac-sha256" &&
          typeof value.auth.key_id === "string" &&
          typeof value.auth.signature === "string"
        ? {
            mode: "hmac-sha256" as const,
            key_id: value.auth.key_id,
            signature: value.auth.signature,
          }
        : null;

  return {
    schema_version: 1,
    receipt_kind: "vault_execution",
    execution_id: Number(value.execution_id),
    recorded_at: value.recorded_at,
    invocation: {
      surface: value.invocation.surface as VaultExecutionReceiptV1["invocation"]["surface"],
      channel: value.invocation.channel as VaultExecutionReceiptV1["invocation"]["channel"],
      selection_mode: value.invocation
        .selection_mode as VaultExecutionReceiptV1["invocation"]["selection_mode"],
      llm_tool_call:
        value.invocation.llm_tool_call && isRecord(value.invocation.llm_tool_call)
          ? {
              tool_name: String(value.invocation.llm_tool_call.tool_name || ""),
              ...(typeof value.invocation.llm_tool_call.tool_call_id === "string"
                ? { tool_call_id: value.invocation.llm_tool_call.tool_call_id }
                : {}),
            }
          : null,
    },
    template: {
      ...(Number.isFinite(Number(value.template.id)) ? { id: Number(value.template.id) } : {}),
      name: value.template.name,
      ...(Number.isFinite(Number(value.template.version))
        ? { version: Number(value.template.version) }
        : {}),
      artifact_kind: value.template.artifact_kind,
      control_mode: value.template.control_mode,
      formalization_level: value.template.formalization_level,
      owner_company: value.template.owner_company,
      visibility_companies: [...value.template.visibility_companies],
    },
    company: {
      current_company: value.company.current_company,
      company_source: value.company.company_source,
    },
    model: { id: value.model.id },
    render: {
      engine: value.render.engine as VaultExecutionReceiptV1["render"]["engine"],
      explicit_engine:
        typeof value.render.explicit_engine === "string"
          ? (value.render.explicit_engine as VaultExecutionReceiptV1["render"]["explicit_engine"])
          : null,
      context_appended: value.render.context_appended,
      append_context_section: value.render.append_context_section,
      used_render_keys: [...value.render.used_render_keys],
    },
    prepared: {
      text: value.prepared.text,
      sha256: value.prepared.sha256,
      edited_after_prepare: value.prepared.edited_after_prepare,
    },
    replay_safe_inputs: replaySafeInputs,
    ...(auth ? { auth } : {}),
  };
}

function encodeExecutionToken(token: string): string {
  return [...Buffer.from(token, "utf8").toString("hex")]
    .map((digit) => Number.parseInt(digit, 16).toString(2).padStart(4, "0"))
    .join("")
    .replaceAll("0", EXECUTION_MARKER_ZERO)
    .replaceAll("1", EXECUTION_MARKER_ONE);
}

function decodeExecutionToken(value: string): string | null {
  const bits = [...value]
    .map((char) => {
      if (char === EXECUTION_MARKER_ZERO) return "0";
      if (char === EXECUTION_MARKER_ONE) return "1";
      return "";
    })
    .join("");
  if (!bits || bits.length % 4 !== 0) return null;
  const hex = bits.replace(/.{4}/g, (chunk) => Number.parseInt(chunk, 2).toString(16));
  try {
    return Buffer.from(hex, "hex").toString("utf8");
  } catch {
    return null;
  }
}

export function createPreparedExecutionToken(): string {
  return randomUUID();
}

export function withPreparedExecutionMarker(text: string, executionToken: string): string {
  const marker = `${EXECUTION_MARKER_START}${encodeExecutionToken(executionToken)}${EXECUTION_MARKER_END}`;
  return `${String(text ?? "")}${marker}`;
}

export function stripPreparedExecutionMarkers(text: string): string {
  return String(text ?? "").replaceAll(EXECUTION_MARKER_REGEX, "");
}

function extractPreparedExecutionToken(text: string): { token: string | null; text: string } {
  const raw = String(text ?? "");
  let token: string | null = null;
  const stripped = raw.replaceAll(EXECUTION_MARKER_REGEX, (_match, encoded: string) => {
    if (!token) token = decodeExecutionToken(encoded);
    return "";
  });
  return { token, text: stripped };
}

function readAllReceipts(filePath: string): VaultExecutionReceiptV1[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return normalizeReceipt(JSON.parse(line));
        } catch {
          return null;
        }
      })
      .filter((receipt): receipt is VaultExecutionReceiptV1 => Boolean(receipt));
  } catch {
    return [];
  }
}

function sortReceiptsNewestFirst(
  left: VaultExecutionReceiptV1,
  right: VaultExecutionReceiptV1,
): number {
  const recordedAtDelta = Date.parse(right.recorded_at) - Date.parse(left.recorded_at);
  if (Number.isFinite(recordedAtDelta) && recordedAtDelta !== 0) return recordedAtDelta;
  return Number(right.execution_id) - Number(left.execution_id);
}

function readAllReceiptsFromPaths(filePaths: string[]): VaultExecutionReceiptV1[] {
  return filePaths.flatMap((filePath) => readAllReceipts(filePath)).sort(sortReceiptsNewestFirst);
}

type SuccessfulExecutionLog = Extract<VaultExecutionLogResult, { ok: true }>;

function buildReceipt(
  candidate: VaultPreparedExecutionCandidate,
  execution: SuccessfulExecutionLog,
  sentText: string,
): VaultExecutionReceiptV1 {
  return {
    schema_version: 1,
    receipt_kind: "vault_execution",
    execution_id: execution.executionId,
    recorded_at: execution.createdAt,
    invocation: candidate.invocation,
    template: candidate.template,
    company: candidate.company,
    model: { id: execution.model },
    render: candidate.render,
    prepared: {
      text: sentText,
      sha256: sha256(sentText),
      edited_after_prepare: sentText !== candidate.prepared.text,
    },
    replay_safe_inputs: candidate.replay_safe_inputs,
  };
}

export function receiptVisibleToCompany(
  receipt: VaultExecutionReceiptV1,
  company?: string,
): boolean {
  if (!company) return true;
  return receipt.template.visibility_companies.includes(company);
}

class JsonlVaultExecutionReceiptSink implements VaultExecutionReceiptSink {
  constructor(private readonly filePath: string) {}

  append(receipt: VaultExecutionReceiptV1): void {
    ensureReceiptDirectory(this.filePath);
    appendFileSync(this.filePath, `${JSON.stringify(receipt)}\n`, "utf8");
  }
}

export function createVaultReceiptManager(
  runtime: Pick<VaultRuntime, "logExecution">,
  options?: {
    filePath?: string;
    fallbackFilePath?: string;
    keyPath?: string;
    pendingTtlMs?: number;
    maxPending?: number;
    sink?: VaultExecutionReceiptSink;
    fallbackSink?: VaultExecutionReceiptSink | false;
  },
): VaultReceiptManager {
  const filePath = options?.filePath || DEFAULT_RECEIPTS_FILE;
  const fallbackFilePath = options?.fallbackFilePath || buildDefaultFallbackReceiptsFile(filePath);
  const primaryKeyPath = options?.keyPath || buildDefaultReceiptKeyPath(filePath);
  const sink = options?.sink || new JsonlVaultExecutionReceiptSink(filePath);
  const fallbackSink =
    options?.fallbackSink === false
      ? null
      : options?.fallbackSink ||
        (options?.sink ? null : new JsonlVaultExecutionReceiptSink(fallbackFilePath));
  const receiptReadPaths = [filePath, ...(fallbackSink ? [fallbackFilePath] : [])].filter(Boolean);
  const keyPaths = [
    primaryKeyPath,
    ...(fallbackSink ? [buildDefaultReceiptKeyPath(fallbackFilePath)] : []),
  ].filter((value, index, values) => values.indexOf(value) === index);
  const pendingTtlMs = options?.pendingTtlMs ?? DEFAULT_PENDING_TTL_MS;
  const maxPending = options?.maxPending ?? DEFAULT_PENDING_LIMIT;
  const pending: VaultPreparedExecutionCandidate[] = [];
  let cachedReceiptSigningKey: ReceiptSigningKeyRecord | null = null;

  function prunePending(now = Date.now()): void {
    for (let i = pending.length - 1; i >= 0; i--) {
      const queuedAt = Date.parse(pending[i]?.queued_at || "");
      if (!Number.isFinite(queuedAt) || now - queuedAt > pendingTtlMs) pending.splice(i, 1);
    }
    if (pending.length > maxPending) pending.splice(0, pending.length - maxPending);
  }

  function appendReceiptWithFallback(
    receipt: VaultExecutionReceiptV1,
  ): { ok: true } | { ok: false; message: string } {
    try {
      sink.append(receipt);
      return { ok: true };
    } catch (primaryError) {
      if (!fallbackSink) {
        return {
          ok: false,
          message: primaryError instanceof Error ? primaryError.message : String(primaryError),
        };
      }

      try {
        fallbackSink.append(receipt);
        return { ok: true };
      } catch (fallbackError) {
        const primaryMessage =
          primaryError instanceof Error ? primaryError.message : String(primaryError);
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        return {
          ok: false,
          message: `primary receipt sink failed (${primaryMessage}); fallback receipt sink failed (${fallbackMessage})`,
        };
      }
    }
  }

  function resolveReceiptSigningKey(
    createIfMissing: boolean,
  ): { ok: true; keyRecord: ReceiptSigningKeyRecord } | { ok: false; message: string } {
    if (cachedReceiptSigningKey) {
      return { ok: true, keyRecord: cachedReceiptSigningKey };
    }
    const errors: string[] = [];
    for (const candidateKeyPath of keyPaths) {
      try {
        cachedReceiptSigningKey = toReceiptSigningKeyRecord(
          loadOrCreateReceiptSigningKey(candidateKeyPath, createIfMissing),
        );
        return { ok: true, keyRecord: cachedReceiptSigningKey };
      } catch (error) {
        errors.push(
          `${candidateKeyPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return {
      ok: false,
      message: `Receipt signing key unavailable: ${errors.join("; ") || "no key paths configured"}`,
    };
  }

  function loadAvailableReceiptSigningKeys(): ReceiptSigningKeyRecord[] {
    const records: ReceiptSigningKeyRecord[] = [];
    const seen = new Set<string>();

    if (cachedReceiptSigningKey) {
      records.push(cachedReceiptSigningKey);
      seen.add(cachedReceiptSigningKey.keyId);
    }

    for (const candidateKeyPath of keyPaths) {
      try {
        const record = toReceiptSigningKeyRecord(
          loadOrCreateReceiptSigningKey(candidateKeyPath, false),
        );
        if (seen.has(record.keyId)) continue;
        records.push(record);
        seen.add(record.keyId);
      } catch {}
    }

    return records;
  }

  function findReceiptSigningKeyForReceipt(
    receipt: VaultExecutionReceiptV1 | null | undefined,
  ): ReceiptSigningKeyRecord | null {
    if (!receipt?.auth) return null;
    for (const keyRecord of loadAvailableReceiptSigningKeys()) {
      if (keyRecord.keyId === receipt.auth.key_id) return keyRecord;
    }
    return null;
  }

  function isTrustedReceipt(receipt: VaultExecutionReceiptV1 | null | undefined): boolean {
    if (!receipt) return false;
    const keyRecord = findReceiptSigningKeyForReceipt(receipt);
    if (!keyRecord) return false;
    return receiptHasTrustedAuth(receipt, keyRecord.key);
  }

  function toReceiptAuthorityCandidate(
    receipt: VaultExecutionReceiptV1,
  ): ReceiptAuthorityCandidate {
    const trusted = isTrustedReceipt(receipt);
    return {
      receipt: trusted ? markReceiptTrustedForAuthorization(receipt) : receipt,
      trusted,
    };
  }

  function selectPreferredReceiptCandidate(
    candidates: ReceiptAuthorityCandidate[],
  ): ReceiptAuthorityCandidate | null {
    if (candidates.length === 0) return null;
    const preferredPool = candidates.some((candidate) => candidate.trusted)
      ? candidates.filter((candidate) => candidate.trusted)
      : candidates;
    return (
      [...preferredPool].sort((left, right) =>
        sortReceiptsNewestFirst(left.receipt, right.receipt),
      )[0] || null
    );
  }

  function readReceiptAuthorityCandidates(): ReceiptAuthorityCandidate[] {
    return readAllReceiptsFromPaths(receiptReadPaths).map((receipt) =>
      toReceiptAuthorityCandidate(receipt),
    );
  }

  function readReceiptSet(): VaultExecutionReceiptV1[] {
    const grouped = new Map<number, ReceiptAuthorityCandidate[]>();
    for (const candidate of readReceiptAuthorityCandidates()) {
      const executionId = Number(candidate.receipt.execution_id);
      const group = grouped.get(executionId);
      if (group) group.push(candidate);
      else grouped.set(executionId, [candidate]);
    }
    return [...grouped.values()]
      .map((candidates) => selectPreferredReceiptCandidate(candidates)?.receipt || null)
      .filter((receipt): receipt is VaultExecutionReceiptV1 => Boolean(receipt))
      .sort(sortReceiptsNewestFirst);
  }

  function readReceiptsFromPaths(): VaultExecutionReceiptV1[] {
    return readReceiptSet();
  }

  return {
    spoolPath: filePath,
    queuePreparedExecution(candidate) {
      prunePending();
      pending.push(candidate);
      prunePending();
    },
    finalizePreparedExecution(preparedText, modelId) {
      prunePending();
      const resolved = extractPreparedExecutionToken(preparedText);
      if (!resolved.token) return { status: "no-match" } as const;
      const matchIndex = (() => {
        for (let i = pending.length - 1; i >= 0; i--) {
          if (pending[i]?.execution_token === resolved.token) return i;
        }
        return -1;
      })();
      if (matchIndex === -1) return { status: "no-match" } as const;

      const [candidate] = pending.splice(matchIndex, 1);
      if (resolved.text !== candidate.prepared.text) {
        return {
          status: "rejected",
          reason: "prepared-text-mismatch",
          message:
            "Prepared vault prompt was edited after preparation; skipped execution logging and local receipt persistence.",
        } as const;
      }

      const execution = runtime.logExecution(candidate.template, modelId, candidate.input_context);
      if (!execution.ok) return { status: "error", message: execution.message } as const;

      const keyResult = resolveReceiptSigningKey(true);
      if (!keyResult.ok) {
        return {
          status: "degraded",
          reason: "receipt-persist-failed",
          execution,
          message: `Execution ${execution.executionId} was logged, but local receipt persistence failed: ${keyResult.message}`,
        } as const;
      }

      const receipt = markReceiptTrustedForAuthorization(
        withReceiptAuth(buildReceipt(candidate, execution, resolved.text), keyResult.keyRecord.key),
      );
      const appended = appendReceiptWithFallback(receipt);
      if (!appended.ok) {
        return {
          status: "degraded",
          reason: "receipt-persist-failed",
          execution,
          message: `Execution ${execution.executionId} was logged, but local receipt persistence failed: ${appended.message}`,
        } as const;
      }
      return { status: "matched", execution, receipt } as const;
    },
    readLatestReceipt() {
      const receipts = readReceiptSet();
      return receipts[0] || null;
    },
    readReceiptByExecutionId(executionId) {
      const normalizedId = Math.floor(Number(executionId));
      if (!Number.isFinite(normalizedId) || normalizedId < 1) return null;
      const candidate = selectPreferredReceiptCandidate(
        readReceiptAuthorityCandidates().filter(
          (receiptCandidate) => Number(receiptCandidate.receipt.execution_id) === normalizedId,
        ),
      );
      return candidate?.receipt || null;
    },
    readTrustedReceiptByExecutionId(executionId) {
      const normalizedId = Math.floor(Number(executionId));
      if (!Number.isFinite(normalizedId) || normalizedId < 1) return null;
      const candidate = selectPreferredReceiptCandidate(
        readReceiptAuthorityCandidates().filter(
          (receiptCandidate) =>
            Number(receiptCandidate.receipt.execution_id) === normalizedId &&
            receiptCandidate.trusted,
        ),
      );
      return candidate?.receipt || null;
    },
    readReceiptAuthorizationByExecutionId(executionId) {
      const normalizedId = Math.floor(Number(executionId));
      if (!Number.isFinite(normalizedId) || normalizedId < 1) return null;
      const candidate = selectPreferredReceiptCandidate(
        readReceiptAuthorityCandidates().filter(
          (receiptCandidate) =>
            Number(receiptCandidate.receipt.execution_id) === normalizedId &&
            receiptCandidate.trusted,
        ),
      );
      if (!candidate) return null;
      const keyRecord = findReceiptSigningKeyForReceipt(candidate.receipt);
      if (!keyRecord) return null;
      return {
        receipt: candidate.receipt,
        verificationKeys: [Buffer.from(keyRecord.key)],
      };
    },
    listRecentReceipts({ currentCompany, templateName, limit } = {}) {
      const normalizedLimit = Number.isFinite(Number(limit))
        ? Math.max(1, Math.floor(Number(limit)))
        : 20;
      const normalizedTemplateName = String(templateName || "").trim();
      const receipts = readReceiptsFromPaths();
      const results: VaultExecutionReceiptV1[] = [];
      for (const receipt of receipts) {
        if (results.length >= normalizedLimit) break;
        if (!receiptVisibleToCompany(receipt, currentCompany)) continue;
        if (normalizedTemplateName && receipt.template.name !== normalizedTemplateName) continue;
        results.push(receipt);
      }
      return results;
    },
  };
}

export function formatVaultReceipt(receipt: VaultExecutionReceiptV1): string {
  const frameworkResolution =
    receipt.replay_safe_inputs.kind === "grounding-request"
      ? receipt.replay_safe_inputs.framework_resolution
      : null;
  const lines = [
    "# Vault Execution Receipt",
    "",
    `- execution_id: ${receipt.execution_id}`,
    `- recorded_at: ${receipt.recorded_at}`,
    `- surface: ${receipt.invocation.surface}`,
    `- channel: ${receipt.invocation.channel}`,
    `- selection_mode: ${receipt.invocation.selection_mode}`,
    `- template: ${receipt.template.name}`,
    `- template_version: ${receipt.template.version ?? "unknown"}`,
    `- template_facets: ${receipt.template.artifact_kind}/${receipt.template.control_mode}/${receipt.template.formalization_level}`,
    `- owner_company: ${receipt.template.owner_company}`,
    `- visibility_companies: ${receipt.template.visibility_companies.join(", ") || "(none)"}`,
    `- current_company: ${receipt.company.current_company}`,
    `- company_source: ${receipt.company.company_source}`,
    `- model: ${receipt.model.id}`,
    `- render_engine: ${receipt.render.engine}`,
    `- explicit_engine: ${receipt.render.explicit_engine ?? "none"}`,
    `- context_appended: ${receipt.render.context_appended ? "true" : "false"}`,
    `- append_context_section: ${receipt.render.append_context_section ? "true" : "false"}`,
    `- used_render_keys: ${receipt.render.used_render_keys.join(", ") || "none"}`,
    `- prepared_sha256: ${receipt.prepared.sha256}`,
    `- edited_after_prepare: ${receipt.prepared.edited_after_prepare ? "true" : "false"}`,
    `- replay_input_kind: ${receipt.replay_safe_inputs.kind}`,
    `- auth_mode: ${receipt.auth?.mode ?? "none"}`,
    `- auth_key_id: ${receipt.auth?.key_id ?? "none"}`,
  ];

  if (receipt.replay_safe_inputs.kind === "vault-selection") {
    lines.push(`- query: ${receipt.replay_safe_inputs.query || "(empty)"}`);
    lines.push(`- context: ${receipt.replay_safe_inputs.context || "(empty)"}`);
  }
  if (receipt.replay_safe_inputs.kind === "route-request") {
    lines.push(`- route_context: ${receipt.replay_safe_inputs.context || "(empty)"}`);
  }
  if (receipt.replay_safe_inputs.kind === "grounding-request") {
    lines.push(`- command_text: ${receipt.replay_safe_inputs.command_text}`);
    lines.push(`- objective: ${receipt.replay_safe_inputs.objective}`);
    lines.push(`- workflow: ${receipt.replay_safe_inputs.workflow}`);
    lines.push(`- mode: ${receipt.replay_safe_inputs.mode}`);
    lines.push(`- extras: ${receipt.replay_safe_inputs.extras || "(empty)"}`);
  }
  if (frameworkResolution) {
    lines.push(
      `- framework_resolution: ${frameworkResolution.selected_names.join(", ") || "none"} (${frameworkResolution.retrieval_method})`,
    );
  }

  lines.push("", "## Prepared Prompt", receipt.prepared.text);
  return lines.join("\n");
}
