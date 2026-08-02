// summary: validates complete owner-issued ASC settlement receipts and their durable filesystem identity.
// read_when:
//   - changing delegated commit receipt fields, path validation, digests, or reload recovery.

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";

export interface VisibleLoopAscSettlementReceipt {
  schema: "asc.dispatch_effect_receipt.v1";
  dispatchId: string;
  attemptId: string;
  sessionName: string;
  consumerCorrelationId: string;
  disposition: "settled";
  recordedAt: string;
  receiptPath: string;
  receiptDigest: string;
}

interface CanonicalAscSettlementReceipt
  extends Omit<VisibleLoopAscSettlementReceipt, "receiptDigest"> {}

const ASC_RECEIPT_KEYS = [
  "schema",
  "dispatchId",
  "attemptId",
  "sessionName",
  "consumerCorrelationId",
  "disposition",
  "recordedAt",
  "receiptPath",
];

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function parseCanonicalAscSettlementReceipt(value: unknown): CanonicalAscSettlementReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const receipt = value as Record<string, unknown>;
  if (
    !hasExactKeys(receipt, ASC_RECEIPT_KEYS) ||
    receipt.schema !== "asc.dispatch_effect_receipt.v1" ||
    receipt.disposition !== "settled" ||
    typeof receipt.dispatchId !== "string" ||
    !receipt.dispatchId.trim() ||
    typeof receipt.attemptId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/u.test(receipt.attemptId) ||
    typeof receipt.sessionName !== "string" ||
    !receipt.sessionName ||
    basename(receipt.sessionName) !== receipt.sessionName ||
    typeof receipt.consumerCorrelationId !== "string" ||
    !receipt.consumerCorrelationId.trim() ||
    !isCanonicalIsoTimestamp(receipt.recordedAt) ||
    typeof receipt.receiptPath !== "string" ||
    !isAbsolute(receipt.receiptPath)
  ) {
    return null;
  }
  return {
    schema: "asc.dispatch_effect_receipt.v1",
    dispatchId: receipt.dispatchId,
    attemptId: receipt.attemptId,
    sessionName: receipt.sessionName,
    consumerCorrelationId: receipt.consumerCorrelationId,
    disposition: "settled",
    recordedAt: receipt.recordedAt,
    receiptPath: receipt.receiptPath,
  };
}

function validateReceiptArtifact(
  receipt: CanonicalAscSettlementReceipt,
  expectedDigest?: string,
): VisibleLoopAscSettlementReceipt | null {
  try {
    const expectedPath = join(
      dirname(receipt.receiptPath),
      `${receipt.sessionName}.${receipt.attemptId}.effect-receipt.json`,
    );
    if (
      receipt.receiptPath !== expectedPath ||
      realpathSync(dirname(receipt.receiptPath)) !== dirname(receipt.receiptPath) ||
      realpathSync(receipt.receiptPath) !== receipt.receiptPath
    ) {
      return null;
    }
    const info = lstatSync(receipt.receiptPath);
    const stat = statSync(receipt.receiptPath);
    if (
      info.isSymbolicLink() ||
      !stat.isFile() ||
      (stat.mode & 0o777) !== 0o600 ||
      (typeof process.getuid === "function" && stat.uid !== process.getuid())
    ) {
      return null;
    }
    const raw = readFileSync(receipt.receiptPath, "utf8");
    const artifact = JSON.parse(raw) as unknown;
    if (!isDeepStrictEqual(artifact, receipt) || raw !== `${JSON.stringify(receipt, null, 2)}\n`) {
      return null;
    }
    const receiptDigest = createHash("sha256").update(raw).digest("hex");
    if (expectedDigest !== undefined && receiptDigest !== expectedDigest) return null;
    return { ...receipt, receiptDigest };
  } catch {
    return null;
  }
}

export function readVisibleLoopAscSettlementReceipt(event: {
  result?: { details?: unknown };
  isError?: boolean;
}): VisibleLoopAscSettlementReceipt | null {
  const details = event.result?.details;
  if (event.isError === true || !details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const record = details as Record<string, unknown>;
  const receipt = parseCanonicalAscSettlementReceipt(record.effectReceipt);
  if (
    !receipt ||
    record.status !== "done" ||
    record.timedOut !== false ||
    record.aborted !== false ||
    record.dispatchId !== receipt.dispatchId ||
    record.attemptId !== receipt.attemptId ||
    record.sessionName !== receipt.sessionName ||
    record.effectCorrelationId !== receipt.consumerCorrelationId
  ) {
    return null;
  }
  return validateReceiptArtifact(receipt);
}

export function validatePersistedVisibleLoopAscSettlementReceipt(
  value: unknown,
): VisibleLoopAscSettlementReceipt | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const persisted = value as Record<string, unknown>;
  if (
    !hasExactKeys(persisted, [...ASC_RECEIPT_KEYS, "receiptDigest"]) ||
    typeof persisted.receiptDigest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(persisted.receiptDigest)
  ) {
    return undefined;
  }
  const canonical = parseCanonicalAscSettlementReceipt(
    Object.fromEntries(ASC_RECEIPT_KEYS.map((key) => [key, persisted[key]])),
  );
  if (!canonical) return undefined;
  return validateReceiptArtifact(canonical, persisted.receiptDigest) ?? undefined;
}
