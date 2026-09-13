import { NEXUS_WORKSPACE_MISMATCH_MESSAGE } from "./nexus-workspace.ts";
import { knownSciErrorText } from "./sci-error-projection.ts";
import type { SciCompositeToolName } from "./tool-definitions.ts";

const LOCAL_BRIDGE_ERRORS = new Set([
  NEXUS_WORKSPACE_MISMATCH_MESSAGE,
  "SCI NEXUS handshake returned an invalid reference contract",
  "SCI NEXUS handshake returned mismatched workspace lineage",
  "SCI bridge workspace is immutable for this Pi session; start a target-root session.",
]);

export function knownLocalSciErrorText(text: unknown): string | undefined {
  return typeof text === "string" && LOCAL_BRIDGE_ERRORS.has(text) ? text : undefined;
}

export function safeLocalSciErrorText(error: unknown): string | undefined {
  try {
    return error instanceof Error ? knownLocalSciErrorText(error.message) : undefined;
  } catch {
    // Hostile getters/proxies are not local recovery evidence.
    return undefined;
  }
}

/** Pi preserves thrown errors as plain text with isError=true, not successful result details. */
export function safeSciErrorMessage(
  name: SciCompositeToolName,
  content: unknown,
): string | undefined {
  if (!Array.isArray(content) || content.length !== 1) return undefined;
  const item = content[0];
  if (!item || typeof item !== "object" || item.type !== "text") return undefined;
  return knownSciErrorText(name, item.text) ?? knownLocalSciErrorText(item.text);
}

export function formatExploreError(message: string | undefined, expanded: boolean): string {
  const summary = message
    ? `SCI explore failed: ${message}`
    : "SCI explore failed: unclassified error; backend diagnostics and raw detail withheld.";
  return expanded
    ? `${summary}\n\nFailure receipt only; no validated semantic result or operator packet. No automatic retry was performed by this renderer.`
    : summary;
}
