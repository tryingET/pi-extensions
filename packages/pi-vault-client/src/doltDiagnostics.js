function formatAttempt(attempt) {
  if (!attempt.ok) return `${attempt.source}:error=${attempt.error || "unknown"}`;
  if (attempt.created) return `${attempt.source}:ok-created`;
  if (attempt.wouldCreate) return `${attempt.source}:ok-would-create`;
  return `${attempt.source}:ok`;
}
function formatAttempts(attempts) {
  return attempts.map(formatAttempt).join("; ") || "none";
}
export function resolveDoltExecutionEnvironmentSnapshot(runtime) {
  if (typeof runtime.getDoltExecutionEnvironment !== "function") {
    return {
      status: "unavailable",
      source: "runtime-missing",
      tempDir: "unknown",
      attempts: "runtime-missing",
    };
  }
  try {
    const environment = runtime.getDoltExecutionEnvironment({ probeMode: "inspect" });
    return {
      status: "ok",
      source: environment.source,
      tempDir: environment.tempDir,
      attempts: formatAttempts(environment.attempts),
    };
  } catch (error) {
    return {
      status: "error",
      source: "resolution-failed",
      tempDir: "unknown",
      attempts: error instanceof Error ? error.message : String(error),
    };
  }
}
