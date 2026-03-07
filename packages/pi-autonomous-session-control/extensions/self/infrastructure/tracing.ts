/**
 * Simple tracing utility for debugging compaction hangs and other issues.
 * Writes to a log file since terminal output may not be visible during hangs.
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOG_DIR = join(tmpdir(), "pi-self-trace");
const LOG_FILE = join(LOG_DIR, "trace.log");

let enabled = false;

export function enableTracing(): void {
  enabled = true;
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
  // Clear previous log on enable
  writeFileSync(LOG_FILE, "");
  trace("TRACING_ENABLED", { logFile: LOG_FILE });
}

export function disableTracing(): void {
  enabled = false;
}

export function trace(phase: string, data?: Record<string, unknown>): void {
  if (!enabled) return;

  const timestamp = new Date().toISOString();
  const elapsed = process.hrtime.bigint();
  const elapsedMs = Number(elapsed % BigInt(1_000_000_000)) / 1_000_000;
  const elapsedMsStr = elapsedMs.toString().padStart(6, "0");

  const line = `[${timestamp}] [${elapsedMsStr}ms] ${phase}${data ? ` ${JSON.stringify(data)}` : ""}\n`;

  try {
    appendFileSync(LOG_FILE, line);
  } catch {
    // Ignore write errors
  }
}

/**
 * Create a traced wrapper for async functions
 */
export function traceAsync<T>(
  phase: string,
  fn: () => Promise<T>,
  data?: Record<string, unknown>,
): Promise<T> {
  if (!enabled) return fn();

  trace(`${phase}_START`, data);
  const start = Date.now();

  return fn()
    .then((result) => {
      trace(`${phase}_END`, { durationMs: Date.now() - start, ...data });
      return result;
    })
    .catch((error) => {
      trace(`${phase}_ERROR`, {
        durationMs: Date.now() - start,
        error: error?.message ?? String(error),
        ...data,
      });
      throw error;
    });
}

/**
 * Trace sync function
 */
export function traceSync<T>(phase: string, fn: () => T, data?: Record<string, unknown>): T {
  if (!enabled) return fn();

  trace(`${phase}_START`, data);
  const start = Date.now();

  try {
    const result = fn();
    trace(`${phase}_END`, { durationMs: Date.now() - start, ...data });
    return result;
  } catch (error) {
    trace(`${phase}_ERROR`, {
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      ...data,
    });
    throw error;
  }
}

/**
 * Get log file path for user inspection
 */
export function getLogFile(): string {
  return LOG_FILE;
}

/**
 * Check if tracing is currently enabled
 */
export function isTracingEnabled(): boolean {
  return enabled;
}
