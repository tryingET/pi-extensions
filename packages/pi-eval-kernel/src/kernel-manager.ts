import type { CapabilityRegistry } from "./capability-registry.ts";
import { KernelClient } from "./kernel-client.ts";
import type {
  CodeModeLanguage,
  CodeModeRuntime,
  KernelRunRequest,
  KernelRunResult,
} from "./types.ts";

export class KernelManager implements CodeModeRuntime {
  readonly #clients: Record<CodeModeLanguage, KernelClient>;

  constructor(options: { registry: CapabilityRegistry; pythonExecutable?: string }) {
    this.#clients = {
      javascript: new KernelClient({ language: "javascript", registry: options.registry }),
      python: new KernelClient({
        language: "python",
        registry: options.registry,
        pythonExecutable: options.pythonExecutable,
      }),
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
