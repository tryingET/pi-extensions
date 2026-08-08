import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { abortError, type CapabilityRegistry } from "./capability-registry.ts";
import {
  type EvalResultMessage,
  MAX_PROTOCOL_FRAME_BYTES,
  parseWorkerMessage,
  validateCommittedState,
  type WorkerMessage,
} from "./kernel-protocol.ts";

export { validateCommittedState } from "./kernel-protocol.ts";

import type {
  CodeModeLanguage,
  EvalToolDetails,
  KernelCapabilityInvocation,
  KernelRunRequest,
  KernelRunResult,
} from "./types.ts";

interface KernelClientOptions {
  language: CodeModeLanguage;
  registry: CapabilityRegistry;
  pythonExecutable?: string;
}

export class KernelExecutionError extends Error {
  readonly partial: KernelRunResult;

  constructor(message: string, partial: KernelRunResult) {
    super(message);
    this.name = "KernelExecutionError";
    this.partial = partial;
  }
}

export class KernelClient {
  readonly #language: CodeModeLanguage;
  readonly #registry: CapabilityRegistry;
  readonly #pythonExecutable?: string;
  #queue: Promise<void> = Promise.resolve();
  #generation = 0;
  #closed = false;
  #active?: { child: ChildProcessWithoutNullStreams; controller: AbortController };
  #state: Record<string, unknown> = {};
  #hasRun = false;

  constructor(options: KernelClientOptions) {
    this.#language = options.language;
    this.#registry = options.registry;
    this.#pythonExecutable = options.pythonExecutable;
  }

  run(request: KernelRunRequest): Promise<KernelRunResult> {
    if (this.#closed) return Promise.reject(new Error(`${this.#language} kernel is closed.`));
    const generation = this.#generation;
    const scheduled = this.#queue.then(async () => {
      if (this.#closed || generation !== this.#generation) {
        throw new Error(`${this.#language} eval was invalidated before execution.`);
      }
      return this.#runNow(request, generation);
    });
    this.#queue = scheduled.then(
      () => undefined,
      () => undefined,
    );
    return scheduled;
  }

  async reset(): Promise<void> {
    this.#generation += 1;
    this.#state = {};
    this.#hasRun = false;
    await this.#stopActive(`${this.#language} kernel reset.`);
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#generation += 1;
    this.#state = {};
    this.#hasRun = false;
    await this.#stopActive(`${this.#language} kernel closed.`);
  }

  async #stopActive(reason: string): Promise<void> {
    const active = this.#active;
    if (!active) return;
    active.controller.abort(abortError(reason));
    await terminateChild(active.child);
  }

  async #runNow(request: KernelRunRequest, generation: number): Promise<KernelRunResult> {
    if (request.signal?.aborted) throw abortError();

    const workerScript = fileURLToPath(
      new URL(
        this.#language === "python"
          ? "../runtime/python-kernel.py"
          : "../runtime/javascript-kernel.mjs",
        import.meta.url,
      ),
    );
    const workerExecutable =
      this.#language === "python"
        ? (this.#pythonExecutable ?? process.env.PI_CODE_MODE_PYTHON ?? "python3")
        : process.execPath;
    const workerArgs = this.#language === "python" ? ["-u", workerScript] : [workerScript];
    const brokerScript = fileURLToPath(new URL("../runtime/protocol-broker.mjs", import.meta.url));
    const child = spawn(
      process.execPath,
      [brokerScript, workerExecutable, JSON.stringify(workerArgs)],
      {
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const controller = new AbortController();
    this.#active = { child, controller };

    const id = randomUUID();
    const startedAt = Date.now();
    const invocations: KernelCapabilityInvocation[] = [];
    const inFlight = new Set<Promise<void>>();
    const kernelReused = this.#hasRun;
    let candidate: EvalResultMessage | undefined;
    let finalizeToken: string | undefined;
    let evalComplete = false;
    let forcedError: Error | undefined;
    let ready = false;
    let protocolStderr = "";

    const failAndTerminate = (error: Error) => {
      if (forcedError) return;
      forcedError = error;
      controller.abort(error);
      void terminateChild(child);
    };
    const onAbort = () => failAndTerminate(abortError(`${this.#language} eval was aborted.`));
    request.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(
      () =>
        failAndTerminate(
          new Error(`${this.#language} eval timed out after ${request.timeoutMs}ms.`),
        ),
      request.timeoutMs,
    );

    const handleLine = (line: string) => {
      if (forcedError) return;
      let message: WorkerMessage;
      try {
        message = parseWorkerMessage(line);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failAndTerminate(
          new Error(`${this.#language} kernel emitted an invalid protocol message: ${reason}`),
        );
        return;
      }
      if (message.type === "ready") {
        if (ready || request.signal?.aborted || message.runtime !== this.#language) {
          failAndTerminate(new Error(`${this.#language} kernel emitted an invalid ready frame.`));
          return;
        }
        ready = true;
        try {
          sendToChild(child, {
            type: "eval",
            id,
            code: request.code,
            cwd: request.cwd,
            state: this.#state,
            capabilities: this.#registry.catalog(),
            outputLimitBytes: request.outputLimitBytes,
          });
        } catch (error) {
          failAndTerminate(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }
      if (message.type === "protocol_error") {
        failAndTerminate(new Error(`${this.#language} kernel protocol failed: ${message.error}`));
        return;
      }
      if (message.type === "eval_result") {
        if (!ready || message.id !== id || candidate) {
          failAndTerminate(
            new Error(`${this.#language} kernel emitted an invalid or duplicate eval result.`),
          );
          return;
        }
        candidate = message;
        finalizeToken = randomUUID();
        try {
          sendToChild(child, { type: "finalize", id, token: finalizeToken });
        } catch (error) {
          failAndTerminate(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }
      if (message.type === "eval_complete") {
        if (!candidate || evalComplete || message.id !== id || message.token !== finalizeToken) {
          failAndTerminate(
            new Error(`${this.#language} kernel emitted an invalid completion frame.`),
          );
          return;
        }
        evalComplete = true;
        return;
      }
      if (message.type === "capability_call") {
        if (!ready || message.evalId !== id) {
          failAndTerminate(
            new Error(`${this.#language} kernel emitted an invalid capability call.`),
          );
          return;
        }
        const operation = this.#handleCapabilityCall({
          child,
          controller,
          evalId: id,
          message,
          request,
          invocations,
          startedAt,
          kernelReused,
        });
        inFlight.add(operation);
        void operation.finally(() => inFlight.delete(operation));
      }
    };
    let stdoutBuffer = Buffer.alloc(0);
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutBuffer.length + chunk.length > MAX_PROTOCOL_FRAME_BYTES) {
        stdoutBuffer = Buffer.alloc(0);
        child.stdout.removeAllListeners("data");
        child.stdout.destroy();
        failAndTerminate(new Error(`${this.#language} kernel protocol frame exceeded the limit.`));
        return;
      }
      stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
      let newline = stdoutBuffer.indexOf(0x0a);
      while (newline >= 0) {
        const frame = stdoutBuffer.subarray(0, newline);
        stdoutBuffer = stdoutBuffer.subarray(newline + 1);
        if (frame.length > MAX_PROTOCOL_FRAME_BYTES) {
          failAndTerminate(
            new Error(`${this.#language} kernel protocol frame exceeded the limit.`),
          );
          return;
        }
        handleLine(frame.toString("utf8"));
        newline = stdoutBuffer.indexOf(0x0a);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      protocolStderr = `${protocolStderr}${chunk.toString("utf8")}`.slice(-16_384);
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (!forcedError) failAndTerminate(error);
    });
    child.once("error", (error) => failAndTerminate(error));

    const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => child.once("close", (code, signal) => resolve({ code, signal })),
    );
    if (request.signal?.aborted) onAbort();
    const exit = await exitPromise;
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", onAbort);
    if (this.#active?.child === child) this.#active = undefined;

    if (forcedError) throw forcedError;
    if (generation !== this.#generation || this.#closed) {
      throw new Error(`${this.#language} eval was invalidated during execution.`);
    }
    if (inFlight.size > 0) {
      controller.abort(abortError("Kernel exited with unfinished capability calls."));
      throw new Error(`${this.#language} kernel exited before capability calls settled.`);
    }
    if (!candidate || !evalComplete) {
      throw new Error(
        `${this.#language} kernel exited without a finalized result (${exit.code ?? "no-code"}/${
          exit.signal ?? "no-signal"
        }).${protocolStderr ? ` ${protocolStderr.trim()}` : ""}`,
      );
    }

    const partial: KernelRunResult = {
      language: this.#language,
      value: candidate.value,
      stdout: candidate.stdout ?? "",
      stderr: candidate.stderr ?? "",
      elapsedMs: candidate.elapsedMs ?? Date.now() - startedAt,
      capabilityInvocations: invocations,
      kernelReused,
    };
    if (!candidate.ok) {
      throw new KernelExecutionError(candidate.error ?? `${this.#language} eval failed.`, partial);
    }

    this.#state = validateCommittedState(candidate.state);
    this.#hasRun = true;
    return partial;
  }

  async #handleCapabilityCall(input: {
    child: ChildProcessWithoutNullStreams;
    controller: AbortController;
    evalId: string;
    message: Extract<WorkerMessage, { type: "capability_call" }>;
    request: KernelRunRequest;
    invocations: KernelCapabilityInvocation[];
    startedAt: number;
    kernelReused: boolean;
  }): Promise<void> {
    const { child, controller, evalId, message, request, invocations, startedAt, kernelReused } =
      input;
    if (message.evalId !== evalId || controller.signal.aborted) return;
    const capability = this.#registry.get(message.name);
    const capabilityStartedAt = Date.now();
    let ok = false;
    let value: unknown;
    let errorMessage: string | undefined;
    try {
      await request.onUpdate?.({
        content: [
          {
            type: "text",
            text: `Running ${this.#language}; invoking ${message.name} (${capability?.effect ?? "unknown"}).`,
          },
        ],
        details: progressDetails({
          language: this.#language,
          startedAt,
          invocations,
          kernelReused,
        }),
      });
      value = await this.#registry.invoke(message.name, message.input, {
        cwd: request.cwd,
        signal: controller.signal,
        allowedEffects: request.allowedEffects,
      });
      ok = true;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    invocations.push({
      name: message.name,
      effect: capability?.effect ?? "unknown",
      elapsedMs: Date.now() - capabilityStartedAt,
      ok,
    });
    if (child.exitCode === null && child.signalCode === null) {
      try {
        sendToChild(child, {
          type: "capability_result",
          callId: message.callId,
          ok,
          ...(ok ? { value } : { error: errorMessage ?? "Capability call failed." }),
        });
      } catch (error) {
        try {
          sendToChild(child, {
            type: "capability_result",
            callId: message.callId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        } catch {
          controller.abort(abortError("Capability result could not be delivered."));
          void terminateChild(child);
        }
      }
    }
  }
}

function progressDetails(input: {
  language: CodeModeLanguage;
  startedAt: number;
  invocations: KernelCapabilityInvocation[];
  kernelReused: boolean;
}): EvalToolDetails {
  return {
    ok: true,
    language: input.language,
    elapsedMs: Date.now() - input.startedAt,
    capabilityCalls: input.invocations.length,
    capabilityInvocations: [...input.invocations],
    kernelReused: input.kernelReused,
    truncated: false,
  };
}

function sendToChild(
  child: ChildProcessWithoutNullStreams,
  message: Record<string, unknown>,
): void {
  if (child.stdin.destroyed) throw new Error("Kernel input stream is unavailable.");
  const frame = `${JSON.stringify(message)}\n`;
  if (Buffer.byteLength(frame, "utf8") > MAX_PROTOCOL_FRAME_BYTES) {
    throw new Error("Host-to-kernel protocol frame exceeded the limit.");
  }
  child.stdin.write(frame);
}

async function terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const forceTimer = setTimeout(() => child.kill("SIGKILL"), 750);
    child.once("close", () => {
      clearTimeout(forceTimer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
