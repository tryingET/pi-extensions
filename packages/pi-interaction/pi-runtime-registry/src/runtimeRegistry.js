/**
 * Shared runtime instance registry for pi-interaction extensions.
 *
 * Provides a central place for registering and discovering runtime instances
 * across extensions, with capability-based discovery and diagnostics.
 */

/**
 * @typedef {import('../index.d.ts').RuntimeCapability} RuntimeCapability
 * @typedef {import('../index.d.ts').RegisteredRuntime} RegisteredRuntime
 * @typedef {import('../index.d.ts').RuntimeRegistryDiagnostics} RuntimeRegistryDiagnostics
 * @typedef {import('../index.d.ts').RuntimeRegistryOptions} RuntimeRegistryOptions
 * @typedef {import('../index.d.ts').RuntimeRegistry} RuntimeRegistry
 */

/**
 * @param {RuntimeRegistryOptions} [options]
 * @returns {RuntimeRegistry}
 */
export function createRuntimeRegistry(options = {}) {
  const ownerId = String(options.ownerId ?? "pi-runtime-registry");

  /** @type {RegisteredRuntime[]} */
  const runtimes = [];

  /**
   * @param {string} owner
   * @param {string} runtimeId
   * @returns {number}
   */
  function findIndex(owner, runtimeId) {
    return runtimes.findIndex((r) => r.ownerId === owner && r.runtimeId === runtimeId);
  }

  return {
    register(owner, runtimeId, instance, capabilities = []) {
      const existingIndex = findIndex(owner, runtimeId);
      const entry = {
        ownerId: owner,
        runtimeId,
        instance,
        capabilities: [...capabilities],
        registeredAt: new Date(),
      };

      if (existingIndex >= 0) {
        runtimes[existingIndex] = entry;
      } else {
        runtimes.push(entry);
      }
    },

    unregister(owner, runtimeId) {
      const index = findIndex(owner, runtimeId);
      if (index < 0) return false;
      runtimes.splice(index, 1);
      return true;
    },

    get(owner, runtimeId) {
      return runtimes.find((r) => r.ownerId === owner && r.runtimeId === runtimeId);
    },

    getByOwner(owner) {
      return runtimes.filter((r) => r.ownerId === owner);
    },

    findByCapability(capabilityId) {
      return runtimes.filter((r) => r.capabilities.some((c) => c.id === capabilityId));
    },

    list() {
      return [...runtimes];
    },

    diagnostics() {
      const capabilityCount = runtimes.reduce((sum, r) => sum + r.capabilities.length, 0);

      return {
        ownerId,
        runtimeCount: runtimes.length,
        capabilityCount,
        runtimes: runtimes.map((r) => ({
          ownerId: r.ownerId,
          runtimeId: r.runtimeId,
          capabilityCount: r.capabilities.length,
          registeredAt: r.registeredAt.toISOString(),
        })),
      };
    },

    clear() {
      runtimes.length = 0;
    },
  };
}

/** @type {RuntimeRegistry|null} */
let globalRegistry = null;

/**
 * Get the global shared runtime registry instance.
 * This is a process-wide singleton for cross-extension runtime discovery.
 * @returns {RuntimeRegistry}
 */
export function getGlobalRuntimeRegistry() {
  if (!globalRegistry) {
    globalRegistry = createRuntimeRegistry({ ownerId: "global" });
  }
  return globalRegistry;
}

/**
 * Reset the global registry (for testing).
 */
export function resetGlobalRuntimeRegistry() {
  globalRegistry = null;
}
