import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import ext_extensions_input_triggers from "./extensions/input-triggers.ts";

export { createEditorRegistry } from "@tryinget/pi-editor-registry";
export {
  rankCandidatesFallback,
  rankCandidatesWithFzf,
  runFzfProbe,
  selectFuzzyCandidate,
  splitQueryAndContext,
} from "@tryinget/pi-interaction-kit";
export { getBroker, registerPickerInteraction, resetBroker } from "@tryinget/pi-trigger-adapter";

export {
  createInteractionRuntime,
  getInteractionRuntime,
  resetInteractionRuntime,
} from "./src/runtime.js";

export default function (pi: ExtensionAPI) {
  ext_extensions_input_triggers(pi);
}
