/**
 * summary: "exposes only trigger broker controls without loading picker registration dependencies."
 * read_when:
 *   - "importing the startup-safe trigger broker subpath."
 */
export { getBroker, resetBroker, TriggerBroker } from "./src/TriggerBroker.js";
