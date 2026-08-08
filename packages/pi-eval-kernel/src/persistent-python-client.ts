import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { abortError, type CapabilityRegistry } from "./capability-registry.ts";
import { guardChild, interruptChild, terminateChild } from "./child-signal-escalation.ts";
import { KernelExecutionError } from "./kernel-client.ts";
import {
  type EvalResultMessage,
  MAX_PROTOCOL_FRAME_BYTES,
  parseWorkerMessage,
  type WorkerMessage,
} from "./kernel-protocol.ts";
import type {
  EvalToolDetails,
  KernelCapabilityInvocation,
  KernelRunRequest,
  KernelRunResult,
} from "./types.ts";

interface WorkerHandle {
  child: ChildProcessWithoutNullStreams;
  generation: number;
  pid: number;
  stderr: string;
  ready: { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void };
  readySeen: boolean;
}

interface ActiveEval {
  id: string;
  handle: WorkerHandle;
  request: KernelRunRequest;
  controller: AbortController;
  startedAt: number;
  kernelReused: boolean;
  invocations: KernelCapabilityInvocation[];
  inFlight: Set<Promise<void>>;
  candidate?: EvalResultMessage;
  finalizeToken?: string;
  evalComplete: boolean;
  settled: boolean;
  onAbort: () => void;
  timer: NodeJS.Timeout;
  interrupt?: { error: Error; cancel: () => void };
  resolve: (result: KernelRunResult) => void;
  reject: (error: Error) => void;
}

interface PersistentPythonKernelClientOptions {
  registry: CapabilityRegistry;
  pythonExecutable?: string;
}

export class PersistentPythonKernelClient {
  readonly #registry: CapabilityRegistry;
  readonly #pythonExecutable?: string;
  #queue: Promise<void> = Promise.resolve();
  #generation = 0;
  #closed = false;
  #handle?: WorkerHandle;
  #active?: ActiveEval;
  #stdoutBuffer = Buffer.alloc(0);
  #hasRun = false;

  constructor(options: PersistentPythonKernelClientOptions) {
    this.#registry = options.registry;
    this.#pythonExecutable = options.pythonExecutable;
  }

  /** Process id of the current long-lived broker worker (undefined when idle). */
  workerPid(): number | undefined {
    return this.#handle?.pid;
  }

  run(request: KernelRunRequest): Promise<KernelRunResult> {
    if (this.#closed) return Promise.reject(new Error("python kernel is closed."));
    const generation = this.#generation;
    const scheduled = this.#queue.then(async () => {
      if (this.#closed || generation !== this.#generation) {
        throw new Error("python eval was invalidated before execution.");
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
    this.#hasRun = false;
    await this.#stopWorker("python kernel reset.");
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#generation += 1;
    this.#hasRun = false;
    await this.#stopWorker("python kernel closed.");
  }

  async #stopWorker(reason: string): Promise<void> {
    const active = this.#active;
    if (active && !active.settled) this.#rejectActive(active, new Error(reason));
    const handle = this.#handle;
    this.#handle = undefined;
    this.#active = undefined;
    if (handle) {
      handle.child.stdout.removeAllListeners("data");
      await terminateChild(handle.child);
    }
  }

  async #ensureWorker(generation: number): Promise<WorkerHandle> {
    const existing = this.#handle;
    if (existing && existing.generation === generation && existing.readySeen) return existing;
    const handle = this.#spawnWorker(generation);
    try {
      await handle.ready.promise;
    } catch (error) {
      if (this.#handle === handle) this.#handle = undefined;
      await terminateChild(handle.child);
      throw error instanceof Error ? error : new Error(String(error));
    }
    return handle;
  }

  #spawnWorker(generation: number): WorkerHandle {
    const workerScript = fileURLToPath(new URL("../runtime/python-kernel.py", import.meta.url));
    const workerExecutable = this.#pythonExecutable ?? process.env.PI_CODE_MODE_PYTHON ?? "python3";
    // --persistent selects the long-lived loop in python-kernel.py (argv flag).
    const workerArgs = ["-u", workerScript, "--persistent"];
    const brokerScript = fileURLToPath(new URL("../runtime/protocol-broker.mjs", import.meta.url));
    const child = spawn(
      process.execPath,
      [brokerScript, workerExecutable, JSON.stringify(workerArgs)],
      { env: process.env, stdio: ["pipe", "pipe", "pipe"] },
    );
    let readyResolve!: () => void;
    let readyReject!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const handle: WorkerHandle = {
      child,
      generation,
      pid: child.pid ?? -1,
      stderr: "",
      ready: { promise, resolve: readyResolve, reject: readyReject },
      readySeen: false,
    };
    this.#handle = handle;
    this.#stdoutBuffer = Buffer.alloc(0);
    child.stdout.on("data", (chunk: Buffer) => this.#consumeStdout(handle, chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      handle.stderr = `${handle.stderr}${chunk.toString("utf8")}`.slice(-16_384);
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => this.#fail(handle, error));
    child.once("error", (error) => this.#fail(handle, error));
    child.once("close", (code, signal) => this.#onWorkerClose(handle, code, signal));
    return handle;
  }

  #fail(handle: WorkerHandle, error: Error): void {
    // Only act on the current worker; a superseded or stopped handle (even
    // within the same generation) is ignored.
    if (this.#handle !== handle) return;
    const active = this.#active;
    if (active && active.handle === handle && !active.settled) {
      this.#rejectActive(active, error);
      return;
    }
    if (!handle.readySeen) {
      handle.ready.reject(error); // still awaiting ready; #ensureWorker throws
      return;
    }
    // Idle worker emitted a corrupt frame/event: terminate so the next eval respawns.
    void terminateChild(handle.child);
  }

  #consumeStdout(handle: WorkerHandle, chunk: Buffer): void {
    if (this.#handle !== handle) return;
    if (this.#stdoutBuffer.length + chunk.length > MAX_PROTOCOL_FRAME_BYTES) {
      this.#dropStdout(handle);
      this.#fail(handle, new Error("python kernel protocol frame exceeded the limit."));
      return;
    }
    this.#stdoutBuffer = Buffer.concat([this.#stdoutBuffer, chunk]);
    let newline = this.#stdoutBuffer.indexOf(0x0a);
    while (newline >= 0) {
      const frame = this.#stdoutBuffer.subarray(0, newline);
      this.#stdoutBuffer = this.#stdoutBuffer.subarray(newline + 1);
      if (frame.length > MAX_PROTOCOL_FRAME_BYTES) {
        this.#fail(handle, new Error("python kernel protocol frame exceeded the limit."));
        return;
      }
      this.#handleLine(handle, frame.toString("utf8"));
      if (this.#handle !== handle) return;
      newline = this.#stdoutBuffer.indexOf(0x0a);
    }
  }

  #dropStdout(handle: WorkerHandle): void {
    this.#stdoutBuffer = Buffer.alloc(0);
    handle.child.stdout.removeAllListeners("data");
    handle.child.stdout.destroy();
  }

  #handleLine(handle: WorkerHandle, line: string): void {
    if (this.#handle !== handle) return;
    let message: WorkerMessage;
    try {
      message = parseWorkerMessage(line);
    } catch (error) {
      this.#fail(handle, invalidFrame(error));
      return;
    }
    switch (message.type) {
      case "ready": {
        if (message.runtime !== "python" || handle.readySeen) {
          this.#fail(handle, new Error("python kernel emitted an invalid ready frame."));
          return;
        }
        handle.readySeen = true;
        handle.ready.resolve();
        return;
      }
      case "protocol_error":
        this.#fail(handle, new Error(`python kernel protocol failed: ${message.error}`));
        return;
      case "eval_result": {
        const active = this.#active;
        if (
          !active ||
          active.handle !== handle ||
          active.settled ||
          message.id !== active.id ||
          active.candidate
        ) {
          this.#fail(
            handle,
            new Error("python kernel emitted an invalid or duplicate eval result."),
          );
          return;
        }
        active.candidate = message;
        active.finalizeToken = randomUUID();
        try {
          sendToChild(handle.child, {
            type: "finalize",
            id: active.id,
            token: active.finalizeToken,
          });
        } catch (error) {
          this.#rejectActive(active, error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }
      case "eval_complete": {
        const active = this.#active;
        if (
          !active ||
          active.handle !== handle ||
          !active.candidate ||
          active.evalComplete ||
          message.id !== active.id ||
          message.token !== active.finalizeToken
        ) {
          this.#fail(handle, new Error("python kernel emitted an invalid completion frame."));
          return;
        }
        active.evalComplete = true;
        this.#maybeResolve(active);
        return;
      }
      case "capability_call": {
        const active = this.#active;
        if (!active || active.handle !== handle || message.evalId !== active.id) {
          this.#fail(handle, new Error("python kernel emitted an invalid capability call."));
          return;
        }
        const operation = this.#handleCapabilityCall(handle, active, message);
        active.inFlight.add(operation);
        void operation.finally(() => {
          active.inFlight.delete(operation);
          this.#maybeResolve(active);
        });
      }
    }
  }

  #onWorkerClose(handle: WorkerHandle, code: number | null, signal: NodeJS.Signals | null): void {
    if (this.#handle === handle) this.#handle = undefined;
    const suffix = handle.stderr ? ` ${handle.stderr.trim()}` : "";
    const where = handle.readySeen ? "before the eval completed" : "before becoming ready";
    const exitError = new Error(
      `python kernel exited ${where} (${code ?? "no-code"}/${signal ?? "no-signal"}).${suffix}`,
    );
    // Reject an active eval bound to this handle on unexpected death.
    const active = this.#active;
    if (active && active.handle === handle && !active.settled) {
      this.#rejectActive(active, active.interrupt?.error ?? exitError);
      return;
    }
    // Always settle a still-pending ready (even for a superseded handle) so
    // #ensureWorker never hangs when reset/close races a spawn.
    if (!handle.readySeen) handle.ready.reject(exitError);
  }

  #runNow(request: KernelRunRequest, generation: number): Promise<KernelRunResult> {
    if (request.signal?.aborted) return Promise.reject(abortError());
    return this.#ensureWorker(generation).then((handle) => {
      if (this.#closed || generation !== this.#generation) {
        throw new Error("python eval was invalidated before execution.");
      }
      if (request.signal?.aborted) throw abortError();
      return new Promise<KernelRunResult>((resolve, reject) => {
        const active: ActiveEval = {
          id: randomUUID(),
          handle,
          request,
          controller: new AbortController(),
          startedAt: Date.now(),
          kernelReused: this.#hasRun,
          invocations: [],
          inFlight: new Set(),
          candidate: undefined,
          finalizeToken: undefined,
          evalComplete: false,
          settled: false,
          onAbort: () => {},
          timer: undefined as unknown as NodeJS.Timeout,
          resolve,
          reject,
        };
        this.#active = active;
        const fail = (error: Error) => this.#rejectActive(active, error);
        const onAbort = () => this.#interruptActive(active, abortError("python eval was aborted."));
        active.onAbort = onAbort;
        request.signal?.addEventListener("abort", onAbort, { once: true });
        active.timer = setTimeout(
          () =>
            this.#interruptActive(
              active,
              new Error(`python eval timed out after ${request.timeoutMs}ms.`),
            ),
          request.timeoutMs,
        );
        try {
          // Persistent eval frame omits host state: the worker keeps logical
          // state in-process across evals (no host round-trip).
          sendToChild(handle.child, {
            type: "eval",
            id: active.id,
            code: request.code,
            cwd: request.cwd,
            capabilities: this.#registry.catalog(),
            outputLimitBytes: request.outputLimitBytes,
          });
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }

  #interruptActive(active: ActiveEval, error: Error): void {
    if (active.settled || active.interrupt) return;
    clearTimeout(active.timer);
    active.controller.abort(abortError(error.message));
    const cancel = active.candidate
      ? guardChild(active.handle.child)
      : interruptChild(active.handle.child);
    active.interrupt = { error, cancel };
  }

  #rejectActive(active: ActiveEval, error: Error): void {
    if (active.settled) return;
    active.settled = true;
    clearTimeout(active.timer);
    active.interrupt?.cancel();
    active.request.signal?.removeEventListener("abort", active.onAbort);
    active.controller.abort(abortError(error.message));
    if (this.#active === active) this.#active = undefined;
    // Unrecoverable failures clear the handle so the next eval respawns.
    if (this.#handle === active.handle) this.#handle = undefined;
    void terminateChild(active.handle.child);
    active.reject(error);
  }

  #maybeResolve(active: ActiveEval): void {
    if (active.settled || !active.candidate || !active.evalComplete || active.inFlight.size > 0) {
      return;
    }
    if (active.interrupt && active.candidate.interruptHandled !== true) return;
    active.settled = true;
    clearTimeout(active.timer);
    active.request.signal?.removeEventListener("abort", active.onAbort);
    if (this.#active === active) this.#active = undefined;
    const interrupted = active.interrupt;
    interrupted?.cancel();
    const candidate = active.candidate;
    const partial: KernelRunResult = {
      language: "python",
      value: candidate.value,
      stdout: candidate.stdout ?? "",
      stderr: candidate.stderr ?? "",
      elapsedMs: candidate.elapsedMs ?? Date.now() - active.startedAt,
      capabilityInvocations: active.invocations,
      kernelReused: active.kernelReused,
    };
    // Settled user-code and interrupt errors keep the worker; only an
    // unrecoverable failure or completed escalation clears the handle.
    if (interrupted || !candidate.ok) {
      active.reject(
        new KernelExecutionError(
          interrupted?.error.message ?? candidate.error ?? "python eval failed.",
          partial,
        ),
      );
      return;
    }
    this.#hasRun = true;
    active.resolve(partial);
  }

  async #handleCapabilityCall(
    handle: WorkerHandle,
    active: ActiveEval,
    message: Extract<WorkerMessage, { type: "capability_call" }>,
  ): Promise<void> {
    if (active.controller.signal.aborted) return;
    const capability = this.#registry.get(message.name);
    const startedAt = Date.now();
    let ok = false;
    let value: unknown;
    let errorMessage: string | undefined;
    try {
      await active.request.onUpdate?.({
        content: [
          {
            type: "text",
            text: `Running python; invoking ${message.name} (${capability?.effect ?? "unknown"}).`,
          },
        ],
        details: progressDetails(active),
      });
      value = await this.#registry.invoke(message.name, message.input, {
        cwd: active.request.cwd,
        signal: active.controller.signal,
        allowedEffects: active.request.allowedEffects,
      });
      ok = true;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    active.invocations.push({
      name: message.name,
      effect: capability?.effect ?? "unknown",
      elapsedMs: Date.now() - startedAt,
      ok,
    });
    if (handle.child.exitCode === null && handle.child.signalCode === null) {
      const payload = ok ? { value } : { error: errorMessage ?? "Capability call failed." };
      if (!replyCapabilityResult(handle.child, message.callId, ok, payload)) {
        this.#rejectActive(active, abortError("Capability result could not be delivered."));
      }
    }
  }
}

function progressDetails(active: ActiveEval): EvalToolDetails {
  return {
    ok: true,
    language: "python",
    elapsedMs: Date.now() - active.startedAt,
    capabilityCalls: active.invocations.length,
    capabilityInvocations: [...active.invocations],
    kernelReused: active.kernelReused,
    truncated: false,
  };
}

function invalidFrame(error: unknown): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`python kernel emitted an invalid protocol message: ${reason}`);
}

function replyCapabilityResult(
  child: ChildProcessWithoutNullStreams,
  callId: string,
  ok: boolean,
  payload: Record<string, unknown>,
): boolean {
  try {
    sendToChild(child, { type: "capability_result", callId, ok, ...payload });
    return true;
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    try {
      sendToChild(child, { type: "capability_result", callId, ok: false, error: fallback });
      return true;
    } catch {
      return false;
    }
  }
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
