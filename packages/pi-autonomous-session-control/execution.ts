// ---
// summary: re-exports the public autonomous session control execution runtime, dispatch contracts, profiles, and session helpers.
// read_when:
//   - consuming the package-level execution API without importing extension internals.
// ---

export {
  ASC_EXECUTION_OBSERVATION_EVENT,
  ASC_EXECUTION_OBSERVATION_SCHEMA,
  type AscExecutionObservation,
  type AscExecutionObservationContext,
  type AscExecutionObservationGroupKind,
  type AscExecutionObservationProducer,
  type AscExecutionProgressObservation,
  type AscExecutionTerminalObservation,
  type AscExecutionTerminalStatus,
  projectAscExecutionFailure,
  projectAscExecutionGroupTerminal,
  projectAscExecutionResult,
  projectAscExecutionUpdate,
} from "./extensions/self/execution-observation.ts";
export { SUBAGENT_PROFILES } from "./extensions/self/subagent-profiles.ts";
export {
  type AscExecutionRuntime,
  type AscExecutionRuntimeOptions,
  createAscExecutionRuntime,
  type DispatchEffectDisposition,
  type DispatchEffectReceipt,
  type DispatchSubagentDetails,
  type DispatchSubagentExecutionResult,
  type DispatchSubagentExecutionUpdate,
  type DispatchSubagentFailureKind,
  type DispatchSubagentProfile,
  type DispatchSubagentRequest,
  type DispatchSubagentStatus,
  getDispatchSubagentDisplayOutput,
  type SubagentModelContext,
} from "./extensions/self/subagent-runtime.ts";
export type { SubagentState } from "./extensions/self/subagent-session.ts";
export {
  clearSubagentSessions,
  createSubagentState,
} from "./extensions/self/subagent-session.ts";
export {
  type AssistantStopReason,
  type ExecutionState,
  type SubagentDef,
  type SubagentResult,
  type SubagentSpawner,
  spawnSubagent,
  spawnSubagentWithSpawn,
} from "./extensions/self/subagent-spawn.ts";
