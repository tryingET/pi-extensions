/**
 * summary: "declares the trigger adapter context, broker surface, picker registration, and query parsing exports."
 * read_when:
 *   - "consuming or evolving the public types exposed by pi-trigger-adapter."
 */
export { getBroker, resetBroker, TriggerBroker } from "./broker.js";
export type { TriggerContext } from "./broker.js";

export declare function registerPickerInteraction(
  config: Record<string, unknown>,
  options?: Record<string, unknown>,
): Record<string, unknown>;
export declare function splitQueryAndContext(
  raw: unknown,
  separator?: string,
): { query: string; context: string };
