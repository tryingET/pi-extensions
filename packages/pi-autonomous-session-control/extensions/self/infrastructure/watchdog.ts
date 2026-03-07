/**
 * Watchdog timeout guard for long-running operations.
 * Prevents stuck compaction prompts and other hanging operations.
 */

import { trace } from "./tracing.ts";

export const WATCHDOG_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

export interface WatchdogContext {
  hasUI: boolean;
  ui: {
    notify: (msg: string, level: "info" | "warning" | "error") => void;
  };
  abort?: () => void;
  isIdle?: () => boolean;
}

export interface WatchdogOptions {
  ctx: WatchdogContext;
  timeoutMs?: number;
  label: string;
  onTimeout?: () => void;
}

/**
 * Creates a watchdog timer that aborts long-running operations.
 * Returns settle function to call when operation completes successfully.
 */
export function createWatchdog(options: WatchdogOptions): {
  settle: () => boolean;
  timeoutId: NodeJS.Timeout;
} {
  const { ctx, timeoutMs = WATCHDOG_TIMEOUT_MS, label, onTimeout } = options;

  trace("WATCHDOG_ENTER", {
    hasUI: ctx.hasUI,
    hasIsIdle: typeof ctx.isIdle === "function",
    hasAbort: typeof ctx.abort === "function",
    timeoutMs,
    label,
  });

  let settled = false;

  const timeoutId = setTimeout(() => {
    trace("WATCHDOG_TIMEOUT_FIRED", { settled, label });
    if (settled) return;
    settled = true;

    const isIdle = typeof ctx.isIdle === "function" ? ctx.isIdle() : false;
    trace("WATCHDOG_TIMEOUT_ABORT", { isIdle, hasAbort: typeof ctx.abort === "function" });

    if (!isIdle && typeof ctx.abort === "function") {
      ctx.abort();
      trace("WATCHDOG_ABORT_CALLED", { label });
    }

    if (ctx.hasUI) {
      ctx.ui.notify(
        `${label} timed out after ${Math.floor(timeoutMs / 1000)}s and was aborted.`,
        "warning",
      );
    }

    onTimeout?.();
  }, timeoutMs);

  // Don't keep the process alive just for the watchdog
  if (
    typeof timeoutId === "object" &&
    "unref" in timeoutId &&
    typeof timeoutId.unref === "function"
  ) {
    timeoutId.unref();
    trace("WATCHDOG_TIMEOUT_UNREF", { label });
  }

  const settle = (): boolean => {
    if (settled) {
      trace("WATCHDOG_SETTLE_SKIP", { alreadySettled: true, label });
      return false;
    }
    settled = true;
    clearTimeout(timeoutId);
    trace("WATCHDOG_SETTLED", { label });
    return true;
  };

  return { settle, timeoutId };
}

/**
 * Wrap an async operation with a watchdog timeout.
 * Automatically settles on success or error.
 */
export async function withWatchdog<T>(
  options: WatchdogOptions & { operation: () => Promise<T> },
): Promise<T> {
  const { operation, ...watchdogOptions } = options;
  const { settle } = createWatchdog(watchdogOptions);

  try {
    const result = await operation();
    settle();
    return result;
  } catch (error) {
    settle();
    throw error;
  }
}

/**
 * Wrap a compaction call with watchdog protection.
 */
export function compactWithWatchdog(options: {
  ctx: WatchdogContext & {
    compact: (opts: {
      customInstructions?: string;
      onComplete?: () => void;
      onError?: (error: Error) => void;
    }) => void;
  };
  customInstructions: string;
  successMessage: string;
  errorPrefix: string;
  timeoutMs?: number;
}): void {
  const { ctx, customInstructions, successMessage, errorPrefix, timeoutMs } = options;

  const { settle } = createWatchdog({
    ctx,
    timeoutMs,
    label: "Compaction",
  });

  trace("WATCHDOG_CALLING_COMPACT", {
    customInstructionsPreview: customInstructions?.slice(0, 100),
  });

  ctx.compact({
    customInstructions,
    onComplete: () => {
      trace("WATCHDOG_ON_COMPLETE_CALLED");
      if (!settle()) {
        trace("WATCHDOG_ON_COMPLETE_SKIPPED");
        return;
      }
      trace("WATCHDOG_SUCCESS", { message: successMessage });
      if (ctx.hasUI) ctx.ui.notify(successMessage, "info");
    },
    onError: (error) => {
      trace("WATCHDOG_ON_ERROR_CALLED", { errorMessage: error?.message });
      if (!settle()) {
        trace("WATCHDOG_ON_ERROR_SKIPPED");
        return;
      }
      trace("WATCHDOG_ERROR", { errorPrefix, message: error?.message });
      if (ctx.hasUI) ctx.ui.notify(`${errorPrefix}: ${error.message}`, "error");
    },
  });
}
