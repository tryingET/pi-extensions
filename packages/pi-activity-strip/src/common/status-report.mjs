// ---
// summary: "converts broker runtime responses into detailed status text and concise UI notifications"
// read_when:
//   - "changing CLI status output or extension-facing readiness summaries"
// ---

/** @typedef {import("./contracts.ts").BrokerResponse} BrokerResponse */

/** @param {BrokerResponse | null | undefined} result */
export function formatBrokerRuntimeStatus(result) {
  if (!result?.ok) return "stopped";
  const runtime = result.runtimeStatus;
  if (!runtime) return "running (legacy broker: no overlay readiness metadata)";

  const lines = [
    runtime.state === "ready" ? "running (ready)" : `running (${runtime.state})`,
    `display: ${runtime.displayServer || "unknown"}`,
    `window manager: ${runtime.windowManager || "unknown"}`,
    `alignment: ${runtime.alignmentMode || "unknown"}`,
  ];

  if (typeof runtime.displayCount === "number") {
    lines.push(`displays: ${runtime.displayCount}`);
  }
  if (typeof runtime.windowVisible === "boolean") {
    lines.push(`window visible: ${runtime.windowVisible ? "yes" : "no"}`);
  }
  if (runtime.error) {
    lines.push(`error: ${runtime.error}`);
  }
  if (Array.isArray(runtime.warnings) && runtime.warnings.length > 0) {
    lines.push("warnings:");
    for (const warning of runtime.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

/**
 * @param {BrokerResponse | null | undefined} result
 * @returns {{ headline: string; level: "info" | "warning" | "error" }}
 */
export function summarizeBrokerRuntimeStatus(result) {
  if (!result?.ok) {
    return { headline: "Activity strip is stopped", level: "warning" };
  }

  const runtime = result.runtimeStatus;
  if (!runtime) {
    return { headline: "Activity strip is running", level: "info" };
  }

  if (runtime.state === "ready") {
    return { headline: "Activity strip is running and ready", level: "info" };
  }

  if (runtime.state === "error") {
    return { headline: "Activity strip reported an error", level: "error" };
  }

  return { headline: `Activity strip is ${runtime.state}`, level: "warning" };
}
