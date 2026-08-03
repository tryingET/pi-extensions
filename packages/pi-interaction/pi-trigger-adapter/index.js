/**
 * summary: "exposes trigger broker controls, picker registration, and the shared query-context parser."
 * read_when:
 *   - "importing pi-trigger-adapter features through the package entry point."
 */
// Convenience re-export for parser helpers used by downstream integrations.
export { splitQueryAndContext } from "@tryinget/pi-interaction-kit";
export { getBroker, resetBroker, TriggerBroker } from "./broker.js";
export { registerPickerInteraction } from "./src/register.js";
