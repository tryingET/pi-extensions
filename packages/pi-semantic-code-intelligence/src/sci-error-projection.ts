import type { SciBridgeCallResult } from "./mcp-bridge.ts";
import type { SciCompositeToolName } from "./tool-definitions.ts";

// Owner contract: semantic-code-intelligence AK #4862, commit
// b4f3c96ed4fc77439390426393244362f14334b2 (src/core/errors.ts).
// These literals are duplicated intentionally so producer text is validated, never echoed.

const OUTSIDE_WORKSPACE_REASON = "outside_workspace";
const PRODUCER_BOUNDARY_CODE = "InvalidParams";
const PRODUCER_BOUNDARY_MESSAGE = "Requested path must stay within the configured workspace";
const PRODUCER_BOUNDARY_REMEDIATION =
  "Use a path within the configured workspace, expressed as a workspace-relative path or a contained absolute path.";
const LOCAL_BOUNDARY_RECOVERY =
  "Retry with a workspace-relative path or an absolute path contained by the configured workspace.";
const WITHHELD_NOTICE = "Producer diagnostics, paths, and stderr were withheld.";

export function hasSciErrorSignal(result: SciBridgeCallResult): boolean {
  try {
    const envelope = plainRecord(result);
    if (!envelope) return true;
    if (Object.hasOwn(envelope, "error")) return true;
    return Object.hasOwn(envelope, "isError") && envelope.isError !== false;
  } catch {
    return true;
  }
}

export function sciErrorText(name: SciCompositeToolName, result: SciBridgeCallResult): string {
  return isAllowlistedWorkspaceBoundaryError(result)
    ? `SCI workflow ${name} rejected the request (reason: ${OUTSIDE_WORKSPACE_REASON}). ${LOCAL_BOUNDARY_RECOVERY} ${WITHHELD_NOTICE}`
    : `SCI workflow ${name} returned an error. ${WITHHELD_NOTICE}`;
}

function isAllowlistedWorkspaceBoundaryError(result: SciBridgeCallResult): boolean {
  try {
    const envelope = plainRecord(result);
    if (
      !envelope ||
      !hasExactKeys(envelope, ["isError", "error", "content"]) ||
      envelope.isError !== true
    ) {
      return false;
    }
    const error = plainRecord(envelope.error);
    const data = plainRecord(error?.data);
    if (
      !error ||
      !data ||
      !hasExactKeys(error, ["code", "message", "data"]) ||
      !hasExactKeys(data, ["reason", "remediation"]) ||
      error.code !== PRODUCER_BOUNDARY_CODE ||
      error.message !== PRODUCER_BOUNDARY_MESSAGE ||
      data.reason !== OUTSIDE_WORKSPACE_REASON ||
      data.remediation !== PRODUCER_BOUNDARY_REMEDIATION
    ) {
      return false;
    }

    if (!Array.isArray(envelope.content) || envelope.content.length !== 1) return false;
    const text = plainRecord(envelope.content[0]);
    return Boolean(
      text &&
        hasExactKeys(text, ["type", "text"]) &&
        text.type === "text" &&
        text.text === PRODUCER_BOUNDARY_MESSAGE,
    );
  } catch {
    return false;
  }
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}
