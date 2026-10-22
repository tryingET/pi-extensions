// ---
// summary: "renders only allowlisted ribbon observation fields, never arbitrary diagnostic text"
// read_when:
//   - "changing diagnostic output or its redaction boundary"
// ---

/** @param {unknown} value @param {string[]} allowed */
const enumValue = (value, allowed) =>
  typeof value === "string" && allowed.includes(value) ? value : "unknown";
/** @param {unknown} value */
const hashValue = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : "unknown";

/** @param {import("./contracts.ts").ActivityStripRuntimeStatus["ribbonDiagnostics"]} diagnostics */
export function formatRibbonDiagnostics(diagnostics) {
  if (!diagnostics) return ["ribbon diagnostics: not reported by this controller"];
  const build = diagnostics.panelBuild;
  return [
    `visibility reason: ${enumValue(diagnostics.visibilityReason, ["starting", "error", "unproven-focus", "non-agent-focus", "no-admitted-owner", "awaiting-panel-visibility", "eligible-agent-context"])}`,
    `keyboard authorization: ${enumValue(diagnostics.keyboardAuthorization, ["none", "hover", "explicit"])} (not proof of capture)`,
    "capture expiry: not observed (native monotonic clock)",
    `private protocol: expected ${Number.isSafeInteger(diagnostics.expectedPrivateProtocol) ? diagnostics.expectedPrivateProtocol : "unknown"}, receipt ${Number.isSafeInteger(build?.privateProtocol) ? build.privateProtocol : "unknown"}`,
    `panel receipt: ${enumValue(build?.state, ["pending", "unavailable", "changed-during-observation", "incompatible", "receipt-matched", "receipt-mismatch"])}`,
    `panel PID executable sha256: ${hashValue(build?.binarySha256)} (sampled; not custody proof)`,
    `panel build sampled at: ${Number.isSafeInteger(diagnostics.panelBuildObservedAt) ? diagnostics.panelBuildObservedAt : "unknown"} (stale after process changes)`,
    `receipted native source sha256: ${hashValue(build?.receiptedSourceSha256)}`,
    `controller startup source sha256: ${hashValue(diagnostics.controllerStartupSourceSha256)} (observation, not loaded-byte proof)`,
  ];
}
