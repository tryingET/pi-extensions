import { randomUUID } from "node:crypto";
import { abortError, type CapabilityRegistry } from "./capability-registry.ts";
import { KernelExecutionError } from "./kernel-client.ts";
import type { EvalResultMessage, WorkerMessage } from "./kernel-protocol.ts";
import {
  assertPersistentPythonPlatform,
  PersistentPythonWorker,
} from "./persistent-python-worker.ts";
import type {
  EvalToolDetails,
  KernelCapabilityInvocation,
  KernelRunRequest,
  KernelRunResult,
} from "./types.ts";

interface ActiveEval {
  id: string;
  worker: PersistentPythonWorker;
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
  #retirementGate: Promise<void> = Promise.resolve();
  #registeredRetirements = new WeakSet<PersistentPythonWorker>();
  #generation = 0;
  #closed = false;
  #worker?: PersistentPythonWorker;
  #lastSuccessfulWorker?: PersistentPythonWorker;
  #active?: ActiveEval;

  constructor(options: PersistentPythonKernelClientOptions) {
    assertPersistentPythonPlatform();
    this.#registry = options.registry;
    this.#pythonExecutable = options.pythonExecutable;
  }

  /** Process id of the current long-lived broker worker (undefined when idle). */
  workerPid(): number | undefined {
    return this.#worker?.pid;
  }

  run(request: KernelRunRequest): Promise<KernelRunResult> {
    if (this.#closed) return Promise.reject(new Error("python kernel is closed."));
    const generation = this.#generation;
    const scheduled = this.#queue.then(async () => {
      this.#assertRunnable(generation);
      return this.#runNow(request, generation);
    });
    this.#queue = scheduled.then(
      () => undefined,
      () => undefined,
    );
    return scheduled;
  }

  async reset(): Promise<void> {
    const queueAtInvocation = this.#queue;
    this.#generation += 1;
    const retirementAtInvocation = this.#stopWorker("python kernel reset.");
    await Promise.all([queueAtInvocation, retirementAtInvocation]);
  }

  async close(): Promise<void> {
    const queueAtInvocation = this.#queue;
    this.#closed = true;
    this.#generation += 1;
    const retirementAtInvocation = this.#stopWorker("python kernel closed.");
    await Promise.all([queueAtInvocation, retirementAtInvocation]);
  }

  #stopWorker(reason: string): Promise<void> {
    const active = this.#active;
    const worker = active?.worker ?? this.#worker;
    if (worker) this.#beginRetirement(worker);
    if (active && !active.settled) this.#settleRejectedActive(active, new Error(reason));
    return this.#retirementGate;
  }

  #beginRetirement(worker: PersistentPythonWorker): Promise<void> {
    if (this.#worker === worker) this.#worker = undefined;
    const retirement = worker.retire();
    if (!this.#registeredRetirements.has(worker)) {
      this.#registeredRetirements.add(worker);
      const priorRetirements = this.#retirementGate;
      this.#retirementGate = Promise.all([priorRetirements, retirement]).then(() => undefined);
    }
    return retirement;
  }

  async #ensureWorker(generation: number): Promise<PersistentPythonWorker> {
    while (true) {
      const existing = this.#worker;
      if (existing) {
        if (existing.generation !== generation) {
          await this.#beginRetirement(existing);
          continue;
        }
        try {
          await existing.ready;
        } catch (error) {
          await this.#beginRetirement(existing);
          this.#assertRunnable(generation);
          throw asError(error);
        }
        if (this.#worker !== existing) {
          await existing.retire();
          this.#assertRunnable(generation);
          continue;
        }
        this.#assertRunnable(generation);
        return existing;
      }

      const gate = this.#retirementGate;
      await gate;
      if (gate !== this.#retirementGate) continue;
      this.#assertRunnable(generation);
      if (this.#worker) continue;

      const worker = new PersistentPythonWorker({
        generation,
        pythonExecutable: this.#pythonExecutable,
        onMessage: (source, message) => this.#onWorkerMessage(source, message),
        onFatal: (source, error) => this.#failWorker(source, error),
        onExit: (source, error) => this.#failWorker(source, error),
      });
      this.#worker = worker;
      try {
        await worker.ready;
      } catch (error) {
        await this.#beginRetirement(worker);
        this.#assertRunnable(generation);
        throw asError(error);
      }
      if (this.#worker !== worker || worker.generation !== this.#generation || this.#closed) {
        await this.#beginRetirement(worker);
        this.#assertRunnable(generation);
        continue;
      }
      return worker;
    }
  }

  #assertRunnable(generation: number): void {
    if (this.#closed) throw new Error("python kernel is closed.");
    if (generation !== this.#generation) {
      throw new Error("python eval was invalidated before execution.");
    }
  }

  #onWorkerMessage(worker: PersistentPythonWorker, message: WorkerMessage): void {
    if (this.#worker !== worker) return;
    switch (message.type) {
      case "ready":
        this.#failWorker(worker, new Error("python kernel emitted a duplicate ready frame."));
        return;
      case "protocol_error":
        this.#failWorker(worker, new Error(`python kernel protocol failed: ${message.error}`));
        return;
      case "eval_result":
        this.#handleEvalResult(worker, message);
        return;
      case "eval_complete":
        this.#handleEvalComplete(worker, message);
        return;
      case "capability_call":
        this.#handleCapabilityMessage(worker, message);
    }
  }

  #handleEvalResult(worker: PersistentPythonWorker, message: EvalResultMessage): void {
    const active = this.#active;
    if (
      !active ||
      active.worker !== worker ||
      active.settled ||
      message.id !== active.id ||
      active.candidate
    ) {
      this.#failWorker(
        worker,
        new Error("python kernel emitted an invalid or duplicate eval result."),
      );
      return;
    }
    active.candidate = message;
    active.finalizeToken = randomUUID();
    try {
      worker.send({ type: "finalize", id: active.id, token: active.finalizeToken });
    } catch (error) {
      this.#rejectActive(active, asError(error));
    }
  }

  #handleEvalComplete(
    worker: PersistentPythonWorker,
    message: Extract<WorkerMessage, { type: "eval_complete" }>,
  ): void {
    const active = this.#active;
    if (
      !active ||
      active.worker !== worker ||
      !active.candidate ||
      active.evalComplete ||
      message.id !== active.id ||
      message.token !== active.finalizeToken
    ) {
      this.#failWorker(worker, new Error("python kernel emitted an invalid completion frame."));
      return;
    }
    active.evalComplete = true;
    this.#maybeResolve(active);
  }

  #handleCapabilityMessage(
    worker: PersistentPythonWorker,
    message: Extract<WorkerMessage, { type: "capability_call" }>,
  ): void {
    const active = this.#active;
    if (!active || active.worker !== worker || message.evalId !== active.id) {
      this.#failWorker(worker, new Error("python kernel emitted an invalid capability call."));
      return;
    }
    const operation = this.#handleCapabilityCall(worker, active, message);
    active.inFlight.add(operation);
    void operation.finally(() => {
      active.inFlight.delete(operation);
      this.#maybeResolve(active);
    });
  }

  #failWorker(worker: PersistentPythonWorker, error: Error): void {
    const active = this.#active;
    if (this.#worker !== worker && active?.worker !== worker) return;
    this.#beginRetirement(worker);
    if (active?.worker === worker && !active.settled) {
      this.#settleRejectedActive(active, active.interrupt?.error ?? error);
    }
  }

  async #runNow(request: KernelRunRequest, generation: number): Promise<KernelRunResult> {
    if (request.signal?.aborted) throw abortError();
    const worker = await this.#ensureWorker(generation);
    this.#assertRunnable(generation);
    if (request.signal?.aborted) throw abortError();
    return new Promise<KernelRunResult>((resolve, reject) => {
      const active: ActiveEval = {
        id: randomUUID(),
        worker,
        request,
        controller: new AbortController(),
        startedAt: Date.now(),
        kernelReused: this.#lastSuccessfulWorker === worker,
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
        worker.send({
          type: "eval",
          id: active.id,
          code: request.code,
          cwd: request.cwd,
          capabilities: this.#registry.catalog(),
          outputLimitBytes: request.outputLimitBytes,
        });
      } catch (error) {
        this.#rejectActive(active, asError(error));
      }
    });
  }

  #interruptActive(active: ActiveEval, error: Error): void {
    if (active.settled || active.interrupt) return;
    clearTimeout(active.timer);
    active.controller.abort(abortError(error.message));
    const cancel = active.candidate ? active.worker.guard() : active.worker.interrupt();
    active.interrupt = { error, cancel };
  }

  #rejectActive(active: ActiveEval, error: Error): void {
    if (active.settled) return;
    this.#beginRetirement(active.worker);
    this.#settleRejectedActive(active, error);
  }

  #settleRejectedActive(active: ActiveEval, error: Error): void {
    if (active.settled) return;
    active.settled = true;
    clearTimeout(active.timer);
    active.interrupt?.cancel();
    active.request.signal?.removeEventListener("abort", active.onAbort);
    active.controller.abort(abortError(error.message));
    if (this.#active === active) this.#active = undefined;
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
    if (interrupted || !candidate.ok) {
      active.reject(
        new KernelExecutionError(
          interrupted?.error.message ?? candidate.error ?? "python eval failed.",
          partial,
        ),
      );
      return;
    }
    this.#lastSuccessfulWorker = active.worker;
    active.resolve(partial);
  }

  async #handleCapabilityCall(
    worker: PersistentPythonWorker,
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
    const payload = ok ? { value } : { error: errorMessage ?? "Capability call failed." };
    if (!replyCapabilityResult(worker, message.callId, ok, payload)) {
      this.#rejectActive(active, abortError("Capability result could not be delivered."));
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

function replyCapabilityResult(
  worker: PersistentPythonWorker,
  callId: string,
  ok: boolean,
  payload: Record<string, unknown>,
): boolean {
  try {
    worker.send({ type: "capability_result", callId, ok, ...payload });
    return true;
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    try {
      worker.send({ type: "capability_result", callId, ok: false, error: fallback });
      return true;
    } catch {
      return false;
    }
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
