import type { CapabilityRegistry } from "./capability-registry.ts";
import { KernelClient } from "./kernel-client.ts";
import { PersistentPythonKernelClient } from "./persistent-python-client.ts";
import type {
  CodeModeEngine,
  CodeModeLanguage,
  CodeModeRuntime,
  KernelRunRequest,
  KernelRunResult,
} from "./types.ts";

interface LanguageClient {
  run(request: KernelRunRequest): Promise<KernelRunResult>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export class KernelManager implements CodeModeRuntime {
  readonly #clients: Record<CodeModeLanguage, LanguageClient>;

  constructor(options: {
    registry: CapabilityRegistry;
    pythonExecutable?: string;
    engine?: CodeModeEngine;
  }) {
    const engine: CodeModeEngine = options.engine ?? "disposable";
    // Python is the only language with a persistent engine in Wave 1A; JavaScript
    // always stays disposable until Wave 2 reuses the vm context.
    const python: LanguageClient =
      engine === "persistent"
        ? new PersistentPythonKernelClient({
            registry: options.registry,
            pythonExecutable: options.pythonExecutable,
          })
        : new KernelClient({
            language: "python",
            registry: options.registry,
            pythonExecutable: options.pythonExecutable,
          });
    this.#clients = {
      javascript: new KernelClient({ language: "javascript", registry: options.registry }),
      python,
    };
  }

  run(language: CodeModeLanguage, request: KernelRunRequest): Promise<KernelRunResult> {
    return this.#clients[language].run(request);
  }

  async reset(language?: CodeModeLanguage): Promise<void> {
    if (language) {
      await this.#clients[language].reset();
      return;
    }
    await Promise.all(Object.values(this.#clients).map((client) => client.reset()));
  }

  async close(): Promise<void> {
    await Promise.all(Object.values(this.#clients).map((client) => client.close()));
  }
}
