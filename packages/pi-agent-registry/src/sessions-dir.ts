// ---
// summary: quarantines the legacy registry-owned session-root adapter during Fleet Phase 0.
// read_when:
//   - changing where a future authorized dispatch_agent child records ASC sessions.
// ---

export function resolveRegistrySubagentSessionsDir(): never {
  throw new Error(
    "registry-owned subagent session-root resolution is disabled in Fleet Phase 0; ASC must own this contract when AK task 5132 enables dispatch",
  );
}
