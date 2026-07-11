import {
  transitionVisibleLoopController,
  type VisibleLoopControllerEvent,
} from "./visibleLoopController.ts";
import type { VisibleLoopControllerState, VisibleLoopRunConfig } from "./visibleLoopTypes.ts";

export interface VisibleLoopControllerHostState {
  config: VisibleLoopRunConfig;
  controllerState?: VisibleLoopControllerState;
  stopped: boolean;
}

export type AppendVisibleLoopControllerStatus = (
  config: VisibleLoopRunConfig,
  event: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
) => void;

export function recordVisibleLoopControllerEvent(
  state: VisibleLoopControllerHostState,
  event: VisibleLoopControllerEvent,
  env: NodeJS.ProcessEnv,
  appendStatus: AppendVisibleLoopControllerStatus,
): boolean {
  const config = state.config.adaptiveController;
  if (!config) return true;
  if (!state.controllerState) {
    state.stopped = true;
    appendStatus(
      state.config,
      {
        event: "adaptive_controller_failed",
        reason: "controller state unavailable",
        controllerEvent: event.kind,
        iteration: event.iteration,
      },
      env,
    );
    return false;
  }
  try {
    const transition = transitionVisibleLoopController(config, state.controllerState, event);
    state.controllerState = transition.state;
    appendStatus(
      state.config,
      {
        event: "adaptive_controller_transition",
        controllerEvent: event.kind,
        iteration: event.iteration,
        promptIndex: event.promptIndex ?? null,
        eventSequence: transition.eventSequence,
        eventCost: transition.eventCost,
        cumulativeWeightedCost: transition.state.weightedCost,
        maxWeightedCost: config.maxWeightedCost,
        addedProofIds: transition.addedProofIds,
        invalidatedProofIds: transition.invalidatedProofIds,
        authority: "diagnostic_transport_proof_only_non_authoritative",
      },
      env,
    );
    return true;
  } catch (error) {
    state.stopped = true;
    appendStatus(
      state.config,
      {
        event: "adaptive_controller_failed",
        controllerEvent: event.kind,
        iteration: event.iteration,
        reason: error instanceof Error ? error.message : String(error),
      },
      env,
    );
    return false;
  }
}
