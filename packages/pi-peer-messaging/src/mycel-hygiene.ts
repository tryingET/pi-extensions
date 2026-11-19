// ---
// summary: provides mycel-inspired peer message hygiene (sha256 file freshness, hop guards, replier-side reply contracts)
// read_when:
//   - changing file attachment freshness checks, hop-limit loop guards, or reply contract validation
// ---
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type { PeerAttachment, PeerReplyContract } from "./contracts.ts";

export const DEFAULT_MAX_HOPS = 4;

export type FileFreshnessStatus = "unchanged" | "changed" | "gone";

export function computeFileSha256(filePath: string): string | undefined {
  try {
    const content = readFileSync(filePath);
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return undefined;
  }
}

export function pinFileAttachments(
  attachments: PeerAttachment[] | undefined,
): PeerAttachment[] | undefined {
  if (!attachments || attachments.length === 0) {
    return attachments;
  }

  return attachments.map((attachment) => {
    if (attachment.type !== "file" || attachment.sha256) {
      return attachment;
    }
    const targetPath = attachment.path ?? attachment.name;
    const sha256 = computeFileSha256(targetPath);
    if (!sha256) {
      return attachment;
    }
    return {
      ...attachment,
      path: attachment.path ?? targetPath,
      sha256,
    };
  });
}

export function checkAttachmentFreshness(
  attachment: PeerAttachment,
): FileFreshnessStatus | undefined {
  if (attachment.type !== "file" || !attachment.sha256) {
    return undefined;
  }
  const targetPath = attachment.path ?? attachment.name;
  const current = computeFileSha256(targetPath);
  if (!current) {
    return "gone";
  }
  return current === attachment.sha256 ? "unchanged" : "changed";
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
    return " (CHANGED since sent)";
  }
  return " (gone since sent)";
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
  return `a JSON object with required keys: ${contract.required.join(", ")}`;
}

export function validateReplyContract(
  contract: PeerReplyContract | undefined,
  replyText: string,
): { ok: true; normalized: string } | { ok: false; reason: string } {
  const trimmed = replyText.trim();
  if (!contract || contract.type === "any") {
    return { ok: true, normalized: trimmed };
  }
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
  const missing = contract.required.filter((key) => !(key in record));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `JSON reply is missing required keys: ${missing.join(", ")}.`,
    };
  }
  return { ok: true, normalized: JSON.stringify(record) };
}
