import { createEditorRegistry } from "@tryinget/pi-editor-registry";
import {
  rankCandidatesFallback,
  rankCandidatesWithFzf,
  runFzfProbe,
  selectFuzzyCandidate,
  splitQueryAndContext,
} from "@tryinget/pi-interaction-kit";
import { getBroker } from "@tryinget/pi-trigger-adapter";

/**
 * @param {{ ownerId?: string, broker?: ReturnType<typeof getBroker> }} [options]
 */
export function createInteractionRuntime(options = {}) {
  const registry = createEditorRegistry({ ownerId: options.ownerId ?? "@tryinget/pi-interaction" });
  const triggers = options.broker ?? getBroker();

  return {
    registry,
    kit: {
      rankCandidatesFallback,
      rankCandidatesWithFzf,
      runFzfProbe,
      selectFuzzyCandidate,
      splitQueryAndContext,
    },
    triggers,
    diagnostics() {
      return {
        registry: registry.diagnostics(),
        triggerCount: triggers.list().length,
      };
    },
  };
}

/** @type {ReturnType<typeof createInteractionRuntime>|null} */
let runtimeInstance = null;

export function getInteractionRuntime() {
  if (!runtimeInstance) {
    runtimeInstance = createInteractionRuntime();
  }
  return runtimeInstance;
}

export function resetInteractionRuntime() {
  runtimeInstance = null;
}
