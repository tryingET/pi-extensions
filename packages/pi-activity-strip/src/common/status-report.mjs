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
    `backend: ${runtime.backend || "unknown"}`,
    `display: ${runtime.displayServer || "unknown"}`,
    `window manager: ${runtime.windowManager || "unknown"}`,
    `alignment: ${runtime.alignmentMode || "unknown"}`,
  ];

  if (typeof runtime.displayCount === "number") {
    lines.push(`displays: ${runtime.displayCount}`);
  }
  if (typeof runtime.windowVisible === "boolean") {
    lines.push(`surface visible: ${runtime.windowVisible ? "yes" : "no"}`);
  }
  if (typeof runtime.rendererCardCount === "number") {
    const hidden =
      typeof runtime.rendererHiddenTabCardCount === "number"
        ? ` (${runtime.rendererHiddenTabCardCount} hidden tabs)`
        : "";
    lines.push(`cards on focused workspace: ${runtime.rendererCardCount}${hidden}`);
  }
  if (typeof runtime.surfaceBindingCount === "number") {
    lines.push(`remembered tab windows: ${runtime.surfaceBindingCount}`);
  }
  if (typeof runtime.agentTabCount === "number") {
    lines.push(`agent tabs discovered: ${runtime.agentTabCount}`);
  }
  if (runtime.themeName) {
    lines.push(`theme: ${runtime.themeName} (${runtime.themeScheme ?? "unknown"})`);
  }
  if (runtime.agentScanError) {
    lines.push(`agent discovery error: ${runtime.agentScanError}`);
  }
  if (typeof runtime.heightRepairState === "string") {
    const repaired = Number(runtime.heightRepairCount ?? 0);
    lines.push(
      `window height repair: ${runtime.heightRepairState}${repaired > 0 ? ` (${repaired} restored to automatic)` : ""}`,
    );
  }
  if (typeof runtime.tabInventoryState === "string") {
    const detail =
      runtime.tabInventoryState === "ready"
        ? ` (${runtime.tabInventoryFrameCount ?? 0} Ghostty windows, ${runtime.tabInventoryTabCount ?? 0} tabs)`
        : runtime.tabInventoryDetail
          ? ` (${runtime.tabInventoryDetail})`
          : "";
    lines.push(`tab inventory: ${runtime.tabInventoryState}${detail}`);
  }
  if (typeof runtime.akTaskState === "string") {
    if (runtime.akTaskState === "ok") {
      const orphaned = Number(runtime.akTaskOrphanCount ?? 0);
      lines.push(
        `AK task refs: ok (${runtime.akTaskClaimCount ?? 0} live claims, ${runtime.akTaskDeferredCount ?? 0} deferred${orphaned > 0 ? `, ${orphaned} orphaned claims` : ""})`,
      );
    } else if (runtime.akTaskState !== "disabled") {
      lines.push(
        `AK task refs: ${runtime.akTaskState}${runtime.akTaskError ? ` (${runtime.akTaskError})` : ""}`,
      );
    }
  }
  if (typeof runtime.unplacedSurfaceCount === "number" && runtime.unplacedSurfaceCount > 0) {
    lines.push(
      `unplaced hidden tabs: ${runtime.unplacedSurfaceCount} (placed once the tab inventory or a visible title reveals their window)`,
    );
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
