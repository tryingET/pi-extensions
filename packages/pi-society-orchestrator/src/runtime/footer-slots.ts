// ---
// summary: "Builds compact extension, fast-mode, and Git slots for the runtime footer."
// read_when:
//   - "Changing which extension statuses or right-side indicators appear in the footer."
// ---

import { formatGitFooterStatus, type GitFooterSummary } from "./git-footer-status.ts";
import type { RuntimeFooterSlot } from "./status-semantics.ts";

const FAST_MODE_STATUS_KEY = "better-openai-fast";

function sanitizeStatusText(text: string): string {
  const escapeChar = String.fromCharCode(27);
  return text
    .replace(new RegExp(`${escapeChar}\\[[0-9;]*m`, "g"), "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function compactExtensionStatus(key: string, text: string): string | undefined {
  const sanitized = sanitizeStatusText(text);
  if (!sanitized) return undefined;

  if (key === "asc-rewind") {
    const match = sanitized.match(/(\d+) rewind points? \/ (\d+) snapshots?/);
    return match ? `rw ${match[1]}/${match[2]}` : sanitized.replace(/^◆\s*/, "rw ");
  }
  if (key === "stash") {
    return sanitized.replace(/^stash:\s*/, "stash ");
  }
  if (key === "society-context") {
    return sanitized;
  }
  return undefined;
}

export function buildExtensionStatusSlots(
  statuses: ReadonlyMap<string, string>,
): RuntimeFooterSlot[] {
  const slots: RuntimeFooterSlot[] = [];
  for (const key of ["asc-rewind", "society-context", "stash"]) {
    const status = statuses.get(key);
    const compact = status ? compactExtensionStatus(key, status) : undefined;
    if (compact) {
      slots.push({
        id: `status-${key}`,
        tone: "dim",
        full: compact,
        optional: true,
      });
    }
  }
  return slots;
}

export function buildFooterRightSlots(
  statuses: ReadonlyMap<string, string>,
  branch: string | null,
  gitSummary?: GitFooterSummary,
): RuntimeFooterSlot[] {
  const slots: RuntimeFooterSlot[] = [];
  const fastStatus = sanitizeStatusText(statuses.get(FAST_MODE_STATUS_KEY) || "");
  const fastIcon = fastStatus.startsWith("🐇")
    ? "🐇"
    : fastStatus.startsWith("🐢")
      ? "🐢"
      : undefined;
  if (fastIcon) {
    slots.push({
      id: "fast-mode",
      tone: fastIcon === "🐇" ? "accent" : "dim",
      full: fastIcon,
    });
  }

  const gitStatus = formatGitFooterStatus(branch, gitSummary);
  if (gitStatus) {
    slots.push({
      id: "git",
      tone: "accent",
      full: gitStatus,
    });
  }

  return slots;
}
