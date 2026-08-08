import type { EvalToolDetails, KernelRunResult } from "./types.ts";

const DEFAULT_MAX_OUTPUT_BYTES = 50 * 1024;

export function formatKernelResult(
  result: KernelRunResult,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
): { text: string; details: EvalToolDetails } {
  const sections: string[] = [];
  if (result.stdout.trim()) sections.push(`stdout:\n${result.stdout.trimEnd()}`);
  if (result.stderr.trim()) sections.push(`stderr:\n${result.stderr.trimEnd()}`);
  if (result.value !== null && result.value !== undefined) {
    sections.push(`result:\n${formatValue(result.value)}`);
  }
  if (sections.length === 0) sections.push("Eval completed without output.");

  const raw = sections.join("\n\n");
  const { text, truncated } = truncateUtf8(raw, maxOutputBytes);
  return {
    text,
    details: {
      ok: true,
      language: result.language,
      elapsedMs: result.elapsedMs,
      capabilityCalls: result.capabilityInvocations.length,
      capabilityInvocations: result.capabilityInvocations,
      kernelReused: result.kernelReused,
      truncated,
    },
  };
}

export function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function truncateUtf8(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const limit = Math.max(0, Math.floor(maxBytes));
  if (Buffer.byteLength(text, "utf8") <= limit) return { text, truncated: false };

  const marker = "\n[output truncated]";
  const markerBytes = Buffer.byteLength(marker, "utf8");
  if (limit <= markerBytes) {
    return { text: utf8Prefix(marker.trimStart(), limit), truncated: true };
  }
  return {
    text: `${utf8Prefix(text, limit - markerBytes)}${marker}`,
    truncated: true,
  };
}

function utf8Prefix(text: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const character of text) {
    const width = Buffer.byteLength(character, "utf8");
    if (bytes + width > maxBytes) break;
    result += character;
    bytes += width;
  }
  return result;
}
