// ---
// summary: ASC-owned subagent session-root resolution for Fleet Phase-2 standing-agent dispatch.
// read_when:
//   - changing where dispatched standing-agent children record ASC sessions.
// ---

import { loadAscExecutionSurface } from "./asc-execution-surface.ts";

export class RegistrySessionsDirError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistrySessionsDirError";
  }
}

/**
 * Fleet Phase 0 quarantined registry-owned session-root resolution; AK 5132
 * (Fleet Phase 2) lifts the quarantine by delegating to ASC's exported
 * contract when the installed ASC provides it. The registry never invents a
 * session root and never re-implements pi-native session directory semantics.
 */
export async function resolveRegistrySubagentSessionsDir(cwd: string): Promise<string> {
  const surface = await loadAscExecutionSurface();
  if (!surface) {
    throw new RegistrySessionsDirError(
      "ASC execution surface is unavailable; subagent session-root resolution stays ASC-owned and fails closed",
    );
  }
  return surface.resolveSubagentSessionsDir({ cwd }).path;
}
