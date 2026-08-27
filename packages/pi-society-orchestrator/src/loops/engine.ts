// ---
// summary: "Compatibility facade for loop contracts, plugins, execution, registration, and command UI."
// read_when:
//   - "Importing the historical loop engine path or changing its public exports."
// ---

export { AgentKernel } from "./agent-kernel.ts";
export type {
  Artifact,
  CompactLoopResult,
  CompactPhaseResult,
  LoopContext,
  LoopDispatchFn,
  LoopExecutionOptions,
  LoopExecutionUpdate,
  LoopPlugin,
  LoopResult,
  PhaseResult,
} from "./contracts.ts";
export * from "./executor.ts";
export {
  ADKAR_PLUGIN,
  BUILT_IN_PLUGINS,
  KAIZEN_PLUGIN,
  OODA_PLUGIN,
  STRATEGIC_PLUGIN,
  TRANSCENDENT_PLUGIN,
} from "./plugins.ts";
export * from "./registration.ts";
