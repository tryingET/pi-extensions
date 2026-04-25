import { createSessionCompactionExtension } from "./session-compaction/registration.js";

const LIVE_CUTOVER_PREFLIGHT = {
  enableInputTracking: true,
  enableSessionBeforeCompact: true,
  handlerTestsPassed: true,
  noDoubleCompactionPreflight: true,
  existingCompactionHandlerCount: 0,
};

function describeRegistration(result) {
  const input = result?.inputTracking?.ok
    ? "input tracking enabled"
    : `input tracking skipped (${result?.inputTracking?.reason ?? "unknown"})`;
  const compaction = result?.compaction?.ok
    ? "session_before_compact enabled"
    : `session_before_compact skipped (${result?.compaction?.reason ?? "unknown"})`;
  return `pi-session-compaction: ${input}; ${compaction}`;
}

export default function sessionCompactionExtension(pi) {
  const extension = createSessionCompactionExtension(LIVE_CUTOVER_PREFLIGHT);
  const result = extension(pi);
  const message = describeRegistration(result);

  if (!result.compaction?.ok) {
    console.warn(message);
  }

  pi.on("session_start", async (_event, ctx) => {
    ctx?.ui?.notify?.(message, result.compaction?.ok ? "info" : "warning");
    return { action: "continue" };
  });

  return result;
}
