// ---
// summary: "Re-exports the package-owned KES scaffold functions, constants, artifact contracts, and source types."
// read_when:
//   - "Importing or changing the public KES API exposed by pi-society-orchestrator."
// ---

export {
  createKesArtifactPlan,
  ensureKesRoots,
  isKesMaterializationError,
  KES_MATERIALIZATION_FAILURE_KIND,
  KesMaterializationError,
  materializeKesArtifactPlan,
  resolveKesRoots,
} from "./scaffold.ts";
export {
  KES_ALLOWED_ROOTS,
  KES_CONTRACT_VERSION,
  KES_DIARY_DIR,
  KES_LEARNINGS_DIR,
  KES_PACKAGE_MANIFEST_NAME,
  KES_PACKAGE_NAME,
  type KesArtifactDraft,
  type KesArtifactKind,
  type KesArtifactPlan,
  type KesArtifactRequest,
  type KesDiaryEntryInput,
  type KesDiaryKind,
  type KesLearningCandidateInput,
  type KesLearningKind,
  type KesRoots,
  type KesSourceKind,
  type KesSourceRef,
} from "./types.ts";
