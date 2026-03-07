/**
 * Infrastructure utilities for the self tool.
 * These are general-purpose helpers not tied to the core query resolution logic.
 */

export {
  describeEntry,
  extractAssistantText,
  extractUserText,
  makeCheckpointLabel,
  makeRiskCheckpointLabel,
  messageHasToolCalls,
  previewAssistantMessage,
  previewToolResult,
  previewUserMessage,
  safeText,
  sanitizeLabelChunk,
} from "./entry-utils.ts";
export {
  disableTracing,
  enableTracing,
  getLogFile,
  isTracingEnabled,
  trace,
  traceAsync,
  traceSync,
} from "./tracing.ts";
export {
  compactWithWatchdog,
  createWatchdog,
  WATCHDOG_TIMEOUT_MS,
  type WatchdogContext,
  type WatchdogOptions,
  withWatchdog,
} from "./watchdog.ts";
