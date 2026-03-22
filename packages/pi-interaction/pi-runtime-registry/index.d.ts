/**
 * Runtime capability descriptor registered by extensions.
 */
export interface RuntimeCapability {
  /** Unique identifier for this capability within the owner scope */
  id: string;
  /** Human-readable description */
  description?: string;
  /** Optional metadata for capability discovery */
  metadata?: Record<string, unknown>;
}

/**
 * Registered runtime entry in the registry.
 */
export interface RegisteredRuntime {
  /** Owner identifier (typically package name) */
  ownerId: string;
  /** Unique runtime identifier within owner scope */
  runtimeId: string;
  /** Runtime instance (type varies by owner) */
  instance: unknown;
  /** Capabilities exposed by this runtime */
  capabilities: RuntimeCapability[];
  /** Registration timestamp */
  registeredAt: Date;
}

/**
 * Diagnostics view for a runtime registry.
 */
export interface RuntimeRegistryDiagnostics {
  /** Registry owner identifier */
  ownerId: string;
  /** Total number of registered runtimes */
  runtimeCount: number;
  /** Total capabilities across all runtimes */
  capabilityCount: number;
  /** Summary of registered runtimes */
  runtimes: Array<{
    ownerId: string;
    runtimeId: string;
    capabilityCount: number;
    registeredAt: string;
  }>;
}

/**
 * Options for creating a runtime registry.
 */
export interface RuntimeRegistryOptions {
  /** Owner identifier for this registry instance */
  ownerId?: string;
}

/**
 * Runtime registry interface.
 */
export interface RuntimeRegistry {
  /**
   * Register a runtime instance with capabilities.
   * @param ownerId - Owner identifier
   * @param runtimeId - Unique runtime identifier within owner scope
   * @param instance - Runtime instance
   * @param capabilities - Capabilities exposed by this runtime
   */
  register(
    ownerId: string,
    runtimeId: string,
    instance: unknown,
    capabilities?: RuntimeCapability[],
  ): void;

  /**
   * Unregister a runtime by owner and ID.
   * @param ownerId - Owner identifier
   * @param runtimeId - Runtime identifier
   * @returns true if unregistered, false if not found
   */
  unregister(ownerId: string, runtimeId: string): boolean;

  /**
   * Get a runtime instance by owner and ID.
   * @param ownerId - Owner identifier
   * @param runtimeId - Runtime identifier
   * @returns Runtime entry or undefined
   */
  get(ownerId: string, runtimeId: string): RegisteredRuntime | undefined;

  /**
   * Get all runtimes for a given owner.
   * @param ownerId - Owner identifier
   * @returns Array of registered runtimes
   */
  getByOwner(ownerId: string): RegisteredRuntime[];

  /**
   * Find runtimes exposing a specific capability.
   * @param capabilityId - Capability identifier to search for
   * @returns Array of runtimes with matching capability
   */
  findByCapability(capabilityId: string): RegisteredRuntime[];

  /**
   * List all registered runtimes.
   * @returns Array of all registered runtimes
   */
  list(): RegisteredRuntime[];

  /**
   * Get registry diagnostics.
   * @returns Diagnostics view
   */
  diagnostics(): RuntimeRegistryDiagnostics;

  /**
   * Clear all registered runtimes.
   */
  clear(): void;
}

/**
 * Create a new runtime registry instance.
 * @param options - Registry options
 * @returns Runtime registry instance
 */
export function createRuntimeRegistry(options?: RuntimeRegistryOptions): RuntimeRegistry;

/**
 * Get the global shared runtime registry instance.
 * This is a process-wide singleton for cross-extension runtime discovery.
 * @returns Global runtime registry
 */
export function getGlobalRuntimeRegistry(): RuntimeRegistry;
