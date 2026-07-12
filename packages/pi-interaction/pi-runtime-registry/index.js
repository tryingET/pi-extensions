/**
 * summary: "re-exports the runtime registry factory and process-global registry accessor."
 * read_when:
 *   - "importing the runtime registry package through its public javascript entry point."
 */
export { createRuntimeRegistry, getGlobalRuntimeRegistry } from "./src/runtimeRegistry.js";
