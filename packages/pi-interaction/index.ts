import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import ext_extensions_input_triggers from "./extensions/input-triggers.ts";

export {
  getBroker,
  rankCandidatesFallback,
  rankCandidatesWithFzf,
  registerPickerInteraction,
  resetBroker,
  runFzfProbe,
  selectFuzzyCandidate,
  splitQueryAndContext,
} from "./extensions/input-triggers.ts";

export default function (pi: ExtensionAPI) {
  ext_extensions_input_triggers(pi);
}
