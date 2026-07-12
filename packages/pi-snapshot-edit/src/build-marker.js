// ---
// summary: "exposes the injected bundle marker with a source-development fallback"
// read_when:
//   - "tracing build provenance between source and bundled extension code"
// ---
const injectedBuildMarker = "__PI_SNAPSHOT_EDIT_HELPER_BUILD_VALUE__";

export const SNAPSHOT_EDIT_HELPER_BUILD_MARKER = injectedBuildMarker.startsWith(
  "__PI_SNAPSHOT_EDIT_HELPER_",
)
  ? "source-development"
  : injectedBuildMarker;
