import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { guardChild, interruptChild, terminateChild } from "./child-signal-escalation.ts";
import {
  MAX_PROTOCOL_FRAME_BYTES,
  parseWorkerMessage,
  type WorkerMessage,
} from "./kernel-protocol.ts";

interface PersistentPythonWorkerCallbacks {
  onMessage(worker: PersistentPythonWorker, message: WorkerMessage): void;
  onFatal(worker: PersistentPythonWorker, error: Error): void;
  onExit(worker: PersistentPythonWorker, error: Error): void;
}

interface PersistentPythonWorkerOptions extends PersistentPythonWorkerCallbacks {
  generation: number;
  pythonExecutable?: string;
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

/** Fail before any persistent broker can be spawned on an unverified native platform. */
export function assertPersistentPythonPlatform(platform: NodeJS.Platform = process.platform): void {
  if (platform === "win32") {
    throw new Error(
      "Persistent Python is unsupported on native win32 until worker-tree lifecycle termination is verified.",
    );
  }
}

/** Private owner of one persistent Python broker and its bounded JSONL transport. */
export class PersistentPythonWorker {
  readonly generation: number;
  readonly pid: number;
  readonly ready: Promise<void>;
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #callbacks: PersistentPythonWorkerCallbacks;
  readonly #readyDeferred = deferred();
  readonly #closedDeferred = deferred();
  #stdoutBuffer = Buffer.alloc(0);
  #stderr = "";
  #readySeen = false;
  #fatalSeen = false;
  #retiring = false;
  #retirement?: Promise<void>;

  constructor(options: PersistentPythonWorkerOptions) {
    assertPersistentPythonPlatform();
    this.generation = options.generation;
    this.#callbacks = options;
    const workerScript = fileURLToPath(new URL("../runtime/python-kernel.py", import.meta.url));
    const workerExecutable =
      options.pythonExecutable ?? process.env.PI_CODE_MODE_PYTHON ?? "python3";
    const brokerScript = fileURLToPath(new URL("../runtime/protocol-broker.mjs", import.meta.url));
    this.#child = spawn(
      process.execPath,
      [brokerScript, workerExecutable, JSON.stringify(["-u", workerScript, "--persistent"])],
      { env: process.env, stdio: ["pipe", "pipe", "pipe"] },
    );
    this.pid = this.#child.pid ?? -1;
    this.ready = this.#readyDeferred.promise;
    this.#child.stdout.on("data", (chunk: Buffer) => this.#consumeStdout(chunk));
    this.#child.stderr.on("data", (chunk: Buffer) => {
      this.#stderr = `${this.#stderr}${chunk.toString("utf8")}`.slice(-16_384);
    });
    this.#child.stdin.on("error", (error: NodeJS.ErrnoException) => this.#fail(error));
    this.#child.once("error", (error) => this.#fail(error));
    this.#child.once("close", (code, signal) => this.#onClose(code, signal));
  }

  send(message: Record<string, unknown>): void {
    if (this.#retiring || this.#child.stdin.destroyed) {
      throw new Error("Kernel input stream is unavailable.");
    }
    const frame = `${JSON.stringify(message)}\n`;
    if (Buffer.byteLength(frame, "utf8") > MAX_PROTOCOL_FRAME_BYTES) {
      throw new Error("Host-to-kernel protocol frame exceeded the limit.");
    }
    this.#child.stdin.write(frame);
  }

  interrupt(): () => void {
    return interruptChild(this.#child);
  }

  guard(): () => void {
    return guardChild(this.#child);
  }

  /** Return the same promise for every request to retire this exact broker. */
  retire(): Promise<void> {
    if (!this.#retirement) this.#retirement = this.#retireExactly();
    return this.#retirement;
  }

  async #retireExactly(): Promise<void> {
    this.#retiring = true;
    this.#child.stdout.removeAllListeners("data");
    await terminateChild(this.#child);
    await this.#closedDeferred.promise;
  }

  #consumeStdout(chunk: Buffer): void {
    if (this.#fatalSeen || this.#retiring) return;
    if (this.#stdoutBuffer.length + chunk.length > MAX_PROTOCOL_FRAME_BYTES) {
      this.#dropStdout();
      this.#fail(new Error("python kernel protocol frame exceeded the limit."));
      return;
    }
    this.#stdoutBuffer = Buffer.concat([this.#stdoutBuffer, chunk]);
    let newline = this.#stdoutBuffer.indexOf(0x0a);
    while (newline >= 0) {
      const frame = this.#stdoutBuffer.subarray(0, newline);
      this.#stdoutBuffer = this.#stdoutBuffer.subarray(newline + 1);
      if (frame.length > MAX_PROTOCOL_FRAME_BYTES) {
        this.#fail(new Error("python kernel protocol frame exceeded the limit."));
        return;
      }
      this.#handleLine(frame.toString("utf8"));
      if (this.#fatalSeen || this.#retiring) return;
      newline = this.#stdoutBuffer.indexOf(0x0a);
    }
  }

  #dropStdout(): void {
    this.#stdoutBuffer = Buffer.alloc(0);
    this.#child.stdout.removeAllListeners("data");
    this.#child.stdout.destroy();
  }

  #handleLine(line: string): void {
    let message: WorkerMessage;
    try {
      message = parseWorkerMessage(line);
    } catch (error) {
      this.#fail(invalidFrame(error));
      return;
    }
    if (message.type === "ready") {
      if (message.runtime !== "python" || this.#readySeen) {
        this.#fail(new Error("python kernel emitted an invalid ready frame."));
        return;
      }
      this.#readySeen = true;
      this.#readyDeferred.resolve();
      return;
    }
    if (!this.#readySeen) {
      this.#fail(new Error("python kernel emitted a protocol frame before becoming ready."));
      return;
    }
    this.#callbacks.onMessage(this, message);
  }

  #fail(error: Error): void {
    if (this.#fatalSeen || this.#retiring) return;
    this.#fatalSeen = true;
    if (!this.#readySeen) this.#readyDeferred.reject(error);
    this.#callbacks.onFatal(this, error);
  }

  #onClose(code: number | null, signal: NodeJS.Signals | null): void {
    const suffix = this.#stderr ? ` ${this.#stderr.trim()}` : "";
    const where = this.#readySeen ? "before the eval completed" : "before becoming ready";
    const error = new Error(
      `python kernel exited ${where} (${code ?? "no-code"}/${signal ?? "no-signal"}).${suffix}`,
    );
    if (!this.#readySeen) this.#readyDeferred.reject(error);
    this.#closedDeferred.resolve();
    this.#callbacks.onExit(this, error);
  }
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function invalidFrame(error: unknown): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`python kernel emitted an invalid protocol message: ${reason}`);
}
