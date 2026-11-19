// ---
// summary: provides mycel-inspired peer message hygiene (explicit-path sha256 freshness, hop guards, own-key reply contracts)
// read_when:
//   - changing file attachment freshness checks, hop-limit loop guards, or reply contract validation
// ---
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { PeerAttachment, PeerReplyContract } from "./contracts.ts";

export const DEFAULT_MAX_HOPS = 4;
export const MAX_HASH_BYTES = 10 * 1024 * 1024;

export type FileFreshnessStatus =
  | "unchanged"
  | "changed"
  | "missing"
  | "unreadable"
  | "too_large"
  | "not_checked";

export function inspectFileSha256(filePath: string): {
  status: Exclude<FileFreshnessStatus, "changed">;
  sha256?: string;
} {
  if (!filePath || !path.isAbsolute(filePath)) {
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
  try {
    const content = readFileSync(filePath);
    return {
      status: "unchanged",
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  } catch {
    return { status: "unreadable" };
  }
}

export function computeFileSha256(filePath: string): string | undefined {
  return inspectFileSha256(filePath).sha256;
}

/**
 * Pin only explicit absolute file paths — never interpret a display attachment.name as a local path.
 */
export function pinFileAttachments(
  attachments: PeerAttachment[] | undefined,
): PeerAttachment[] | undefined {
  if (!attachments || attachments.length === 0) {
    return attachments;
  }

  return attachments.map((attachment) => {
    if (attachment.type !== "file" || attachment.sha256 || !attachment.path) {
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
  if (attachment.type !== "file" || !attachment.sha256) {
    return undefined;
  }
  if (!attachment.path || !path.isAbsolute(attachment.path)) {
    return "not_checked";
  }
  const inspected = inspectFileSha256(attachment.path);
  if (!inspected.sha256) {
    return inspected.status;
  }
  return inspected.sha256 === attachment.sha256 ? "unchanged" : "changed";
}

export function formatAttachmentFreshnessTag(attachment: PeerAttachment): string {
  const status = checkAttachmentFreshness(attachment);
  if (!status) {
    return "";
  }
  if (status === "unchanged") {
    return " (unchanged since sent)";
  }
  if (status === "changed") {
    return " (CHANGED since sent — sent snapshot follows)";
  }
  if (status === "missing") {
    return " (missing since sent — sent snapshot follows)";
  }
  if (status === "too_large") {
    return " (too large — not checked)";
  }
  if (status === "unreadable") {
    return " (unreadable — not verified)";
  }
  return " (not checked — non-absolute path)";
}

export function formatAttachmentFreshnessBanner(attachments: PeerAttachment[] | undefined): string {
  if (!attachments || attachments.length === 0) {
    return "";
  }
  const flagged = attachments.filter((att) => {
    const st = checkAttachmentFreshness(att);
    return st === "changed" || st === "missing" || st === "unreadable";
  });
  if (flagged.length === 0) {
    return "";
  }
  return `\n\n⚠️ ${flagged.length}/${attachments.length} pinned file(s) need attention before relying on sent snapshots below.`;
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
    effectiveMax < 1
  ) {
    return {
      ok: false,
      reason: `Invalid hop configuration (hops=${String(hops)}, maxHops=${String(maxHops)}).`,
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

export function formatReplyContractExample(contract: PeerReplyContract | undefined): string {
  if (!contract || contract.type === "any") {
    return "...";
  }
  if (contract.type === "yes_no") {
    return "yes";
  }
  if (contract.type === "one_of") {
    return contract.values[0] ?? "...";
  }
  const sample = Object.fromEntries(contract.required.map((k) => [k, "..."]));
  return JSON.stringify(sample);
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
  return { ok: true, normalized: JSON.stringify(record) };
}
