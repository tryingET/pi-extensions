import type { RuntimeRegistry, RuntimeRegistryOptions } from "../index.js";

export function createRuntimeRegistry(options?: RuntimeRegistryOptions): RuntimeRegistry;
export function getGlobalRuntimeRegistry(): RuntimeRegistry;
export function resetGlobalRuntimeRegistry(): void;
