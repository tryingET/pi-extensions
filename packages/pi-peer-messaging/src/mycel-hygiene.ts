// ---
// summary: provides mycel-inspired peer message hygiene (bounded explicit-path sha256 freshness, hop ceiling, non-valid reply placeholders, own-key reply contracts)
// read_when:
//   - changing file attachment freshness checks, hop-limit loop guards, or reply contract validation
// ---
import { createHash } from "node:crypto";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import path from "node:path";

import type { PeerAttachment, PeerReplyContract } from "./contracts.ts";

export const DEFAULT_MAX_HOPS = 4;
export const MAX_ALLOWED_HOPS_CEILING = 16;
export const MAX_HASH_BYTES = 10 * 1024 * 1024;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;
const READ_CHUNK_BYTES = 65_536;

export type FileFreshnessStatus =
  | "unchanged"
  | "changed"
  | "missing"
  | "unreadable"
  | "too_large"
  | "not_checked";

export function isValidSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX_RE.test(value);
}

/**
 * Bounded chunked fd read stopping at MAX_HASH_BYTES + 1 so pseudo-files
 * (e.g. /proc/self/pagemap reporting st_size=0) cannot hang the event loop.
 */
export function inspectFileSha256(filePath: unknown): {
  status: Exclude<FileFreshnessStatus, "changed">;
  sha256?: string;
} {
  if (typeof filePath !== "string" || !filePath || !path.isAbsolute(filePath)) {
    return { status: "not_checked" };
  }
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return { status: code === "ENOENT" ? "missing" : "unreadable" };
  }
  if (!stats.isFile()) {
    return { status: "unreadable" };
  }
  if (stats.size > MAX_HASH_BYTES) {
    return { status: "too_large" };
  }
  let fd: number | undefined;
  try {
    fd = openSync(filePath, "r");
    const hash = createHash("sha256");
    const buf = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    let total = 0;
    while (true) {
      const bytesRead = readSync(fd, buf, 0, READ_CHUNK_BYTES, null);
      if (bytesRead <= 0) {
        break;
      }
      total += bytesRead;
      if (total > MAX_HASH_BYTES) {
        return { status: "too_large" };
      }
      hash.update(buf.subarray(0, bytesRead));
    }
    return { status: "unchanged", sha256: hash.digest("hex") };
  } catch {
    return { status: "unreadable" };
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore close errors
      }
    }
  }
}

export function computeFileSha256(filePath: string): string | undefined {
  return inspectFileSha256(filePath).sha256;
}

/**
 * Pin only explicit absolute file paths — never interpret display attachment.name as a local path.
 */
export function pinFileAttachments(
  attachments: PeerAttachment[] | undefined,
): PeerAttachment[] | undefined {
  if (!attachments || attachments.length === 0) {
    return attachments;
  }

  return attachments.map((attachment) => {
    if (attachment.type !== "file" || isValidSha256Hex(attachment.sha256) || !attachment.path) {
      return attachment;
    }
    const sha256 = computeFileSha256(attachment.path);
    if (!sha256) {
      return attachment;
    }
    return { ...attachment, sha256 };
  });
}

export function checkAttachmentFreshness(
  attachment: PeerAttachment,
): FileFreshnessStatus | undefined {
  if (attachment.type !== "file" || attachment.sha256 === undefined) {
    return undefined;
  }
  if (!isValidSha256Hex(attachment.sha256)) {
    return "not_checked";
  }
  if (typeof attachment.path !== "string" || !path.isAbsolute(attachment.path)) {
    return "not_checked";
  }
  const inspected = inspectFileSha256(attachment.path);
  if (!inspected.sha256) {
    return inspected.status;
  }
  return inspected.sha256 === attachment.sha256.toLowerCase() ? "unchanged" : "changed";
}

export function formatFreshnessStatusTag(status: FileFreshnessStatus | undefined): string {
  if (!status) {
    return "";
  }
  if (status === "unchanged") {
    return " (unchanged on disk since sent)";
  }
  if (status === "changed") {
    return " (CHANGED on disk since sent — attachment text below is caller-supplied)";
  }
  if (status === "missing") {
    return " (missing on disk since sent — attachment text below is caller-supplied)";
  }
  if (status === "too_large") {
    return " (too large — not checked)";
  }
  if (status === "unreadable") {
    return " (unreadable — not verified)";
  }
  return " (not checked)";
}

export function formatAttachmentFreshnessTag(attachment: PeerAttachment): string {
  return formatFreshnessStatusTag(checkAttachmentFreshness(attachment));
}

export function formatAttachmentFreshnessBanner(
  attachments: PeerAttachment[] | undefined,
  statuses?: ReadonlyArray<FileFreshnessStatus | undefined>,
): string {
  if (!attachments || attachments.length === 0) {
    return "";
  }
  const resolved = statuses ?? attachments.map((att) => checkAttachmentFreshness(att));
  const flaggedCount = resolved.filter(
    (st) => st === "changed" || st === "missing" || st === "unreadable",
  ).length;
  if (flaggedCount === 0) {
    return "";
  }
  return `\n\n⚠️ ${flaggedCount}/${attachments.length} pinned file(s) changed/missing on disk since sent (attachment text below is caller-supplied).`;
}

export function checkHopLimit(
  hops: number | undefined,
  maxHops: number | undefined = DEFAULT_MAX_HOPS,
): { ok: true; hops: number; maxHops: number } | { ok: false; reason: string } {
  const effectiveHops = hops ?? 0;
  const effectiveMax = maxHops ?? DEFAULT_MAX_HOPS;
  if (
    !Number.isInteger(effectiveHops) ||
    effectiveHops < 0 ||
    !Number.isInteger(effectiveMax) ||
    effectiveMax < 1 ||
    effectiveMax > MAX_ALLOWED_HOPS_CEILING
  ) {
    return {
      ok: false,
      reason: `Invalid hop configuration (hops=${String(hops)}, maxHops=${String(maxHops)}; ceiling is ${MAX_ALLOWED_HOPS_CEILING}).`,
    };
  }
  if (effectiveHops >= effectiveMax) {
    return {
      ok: false,
      reason: `Hop limit reached (${effectiveHops}/${effectiveMax}); wait for operator input to reset relay depth.`,
    };
  }
  return { ok: true, hops: effectiveHops, maxHops: effectiveMax };
}

export function formatReplyContract(contract: PeerReplyContract | undefined): string | undefined {
  if (!contract || contract.type === "any") {
    return undefined;
  }
  if (contract.type === "yes_no") {
    return "yes or no";
  }
  if (contract.type === "one_of") {
    return `one of ${contract.values.map((v) => JSON.stringify(v)).join(", ")}`;
  }
  return `a JSON object with required top-level keys: ${contract.required.join(", ")}`;
}

/**
 * Always returns a clearly NON-VALID placeholder showing allowed choices so copying
 * the reply hint can never rubber-stamp an approval (e.g. "<yes|no>", never "yes").
 */
export function formatReplyContractExample(contract: PeerReplyContract | undefined): string {
  if (!contract || contract.type === "any") {
    return "<YOUR_REPLY>";
  }
  if (contract.type === "yes_no") {
    return "<yes|no>";
  }
  if (contract.type === "one_of") {
    const shown = contract.values.slice(0, 4).join("|");
    return `<${shown || "CHOICE"}>`;
  }
  const inner = contract.required.map((k) => `${JSON.stringify(k)}: <...>`).join(", ");
  return `{${inner || '"<key>": <value>'}}`;
}

export function validateReplyContract(
  contract: PeerReplyContract | undefined,
  replyText: string,
): { ok: true; normalized: string } | { ok: false; reason: string } {
  if (!contract || contract.type === "any") {
    return { ok: true, normalized: replyText };
  }
  const trimmed = replyText.trim();
  if (contract.type === "yes_no") {
    const low = trimmed.toLowerCase();
    if (low === "yes" || low === "y" || low === "ja") {
      return { ok: true, normalized: "yes" };
    }
    if (low === "no" || low === "n" || low === "nein") {
      return { ok: true, normalized: "no" };
    }
    return { ok: false, reason: `${JSON.stringify(trimmed)} is not yes or no.` };
  }
  if (contract.type === "one_of") {
    const match = contract.values.find((value) => value.toLowerCase() === trimmed.toLowerCase());
    if (match !== undefined) {
      return { ok: true, normalized: match };
    }
    return {
      ok: false,
      reason: `${JSON.stringify(trimmed)} is not one of ${contract.values.map((v) => JSON.stringify(v)).join(", ")}.`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `Reply is not valid JSON: ${detail}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "Reply must be a JSON object." };
  }
  const record = parsed as Record<string, unknown>;
  const missing = contract.required.filter((key) => !Object.hasOwn(record, key));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `JSON reply is missing required top-level keys: ${missing.join(", ")}.`,
    };
  }
  // Preserve original JSON string so large integers/formatting aren't altered lossily
  return { ok: true, normalized: trimmed };
}
