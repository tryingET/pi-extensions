// ---
// summary: re-exports the package's public model-selection API from its implementation module.
// read_when:
//   - importing or auditing the package entrypoint surface.
// ---
export {
  modelSelectionInternals,
  PREFERRED_PROVIDERS,
  parseModelSpecList,
  parseProviderModel,
  resolveModelAuth,
  resolveModelReference,
  selectModelCandidate,
} from "./src/modelSelection.js";
