/**
 * summary: "declares the implementation-module factories and test reset hook for the shared runtime registry."
 * read_when:
 *   - "typing direct imports from the runtime registry implementation module."
 */
import type { RuntimeRegistry, RuntimeRegistryOptions } from "../index.js";

export function createRuntimeRegistry(options?: RuntimeRegistryOptions): RuntimeRegistry;
export function getGlobalRuntimeRegistry(): RuntimeRegistry;
export function resetGlobalRuntimeRegistry(): void;
