// Trusted, in-process execution; Node vm is NOT a sandbox. See README limitations.
// Adapted from the a0411c361 spike runner; invocation now runs inside the vm timeout.
import { runInNewContext } from "node:vm";
import { compileSnippet, type SnippetKind } from "./typescript-gate.ts";

export interface RunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("TypeScript program aborted");
}

export async function runSnippet(
  source: string,
  kind: SnippetKind,
  capabilities: unknown,
  options: RunOptions = {},
): Promise<unknown> {
  throwIfAborted(options.signal);
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new Error("timeoutMs must be an integer from 1 to 10000");
  }
  const compiled = compileSnippet(source, kind);
  throwIfAborted(options.signal);
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`TypeScript program exceeded ${timeoutMs} ms`)),
      timeoutMs,
    );
    onAbort = () => reject(new Error("TypeScript program aborted"));
    options.signal?.addEventListener("abort", onAbort, { once: true });
  });
  try {
    // Promise callback converts synchronous vm throws into rejections in the race.
    // Only the initial synchronous execution is interruptible by vm timeout.
    // After await, CPU loops/microtask starvation can block Pi and its deadline.
    const execution = Promise.resolve().then(() => {
      throwIfAborted(options.signal);
      return runInNewContext(
        compiled,
        { capabilities },
        {
          filename: "typescript-tool.js",
          timeout: timeoutMs,
          contextCodeGeneration: { strings: false, wasm: false },
        },
      ) as unknown;
    });
    const value = await Promise.race([execution, deadline]);
    throwIfAborted(options.signal);
    return value;
  } finally {
    clearTimeout(timer);
    if (onAbort) options.signal?.removeEventListener("abort", onAbort);
  }
}
