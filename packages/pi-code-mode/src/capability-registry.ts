import type {
  CapabilityCatalogEntry,
  CapabilityInvocationContext,
  CodeModeCapability,
} from "./types.ts";

const CAPABILITY_NAME = /^[a-z][a-z0-9_]{0,63}$/;

export class CapabilityRegistry {
  readonly #capabilities = new Map<string, CodeModeCapability>();

  constructor(capabilities: CodeModeCapability[] = []) {
    this.registerAll(capabilities);
  }

  register(capability: CodeModeCapability): void {
    if (!CAPABILITY_NAME.test(capability.name)) {
      throw new Error(
        `Invalid capability name "${capability.name}". Use lower-case snake_case with at most 64 characters.`,
      );
    }
    if (!capability.description.trim()) {
      throw new Error(`Capability ${capability.name} must have a description.`);
    }
    if (this.#capabilities.has(capability.name)) {
      throw new Error(`Capability already registered: ${capability.name}`);
    }
    this.#capabilities.set(capability.name, capability);
  }

  registerAll(capabilities: CodeModeCapability[]): void {
    for (const capability of capabilities) this.register(capability);
  }

  catalog(): CapabilityCatalogEntry[] {
    return [...this.#capabilities.values()]
      .map(({ name, description, effect }) => ({ name, description, effect }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  get(name: string): CodeModeCapability | undefined {
    return this.#capabilities.get(name);
  }

  async invoke(
    name: string,
    input: unknown,
    context: CapabilityInvocationContext,
  ): Promise<unknown> {
    if (context.signal?.aborted) throw abortError();

    const capability = this.#capabilities.get(name);
    if (!capability) {
      throw new Error(
        `Unknown code-mode capability: ${name}. Available: ${this.catalog()
          .map((entry) => entry.name)
          .join(", ")}`,
      );
    }
    if (!context.allowedEffects.has(capability.effect)) {
      throw new Error(
        `Capability ${name} has effect "${capability.effect}", which is not admitted for this eval call.`,
      );
    }

    return capability.execute(input, context);
  }
}

export function abortError(message = "Code-mode capability call was aborted."): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
