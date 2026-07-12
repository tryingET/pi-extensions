/**
 * summary: "exposes trigger broker controls, picker registration, and the shared query-context parser."
 * read_when:
 *   - "importing pi-trigger-adapter features through the package entry point."
 */
// Convenience re-export for parser helpers used by downstream integrations.
export { splitQueryAndContext } from "@tryinget/pi-interaction-kit";
export { registerPickerInteraction } from "./src/register.js";
export { getBroker, resetBroker, TriggerBroker } from "./src/TriggerBroker.js";
