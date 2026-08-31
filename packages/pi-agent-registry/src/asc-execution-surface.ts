// ---
// summary: capability-checked loader for the ASC-owned execution surface used by Fleet Phase-2 dispatch.
// read_when:
//   - changing how pi-agent-registry consumes ASC runtime/session/model contracts.
// ---

import type {
  AscExecutionRuntime,
  ResolvedSubagentModelSelection,
  ResolvedSubagentSessionsDir,
} from "@tryinget/pi-autonomous-session-control/execution";

export interface AscExecutionSurface {
  createAscExecutionRuntime: (options: unknown) => AscExecutionRuntime;
  resolveSubagentSessionsDir: (options?: {
    explicitDir?: string;
    cwd?: string;
    agentDir?: string;
    sessionDirEnv?: string;
  }) => ResolvedSubagentSessionsDir;
  resolveSubagentModelSelection: (ctx?: {
    model?: { provider?: unknown; id?: unknown };
  }) => ResolvedSubagentModelSelection;
}

let cached: AscExecutionSurface | undefined | "unloaded" = "unloaded";

/**
 * Load ASC's exported execution surface. The registry declares the ASC
 * dependency as a workspace link; an installed/published ASC that predates
 * the execution exports resolves to `undefined` and every Phase-2 dispatch
 * fails closed with `asc_execution_unavailable` (confirmed_no_effects).
 * Execution machinery stays ASC-owned; this loader only checks capability.
 */
export async function loadAscExecutionSurface(): Promise<AscExecutionSurface | undefined> {
  if (cached !== "unloaded") {
    return cached;
  }
  try {
    const mod = (await import("@tryinget/pi-autonomous-session-control/execution")) as Record<
      string,
      unknown
    >;
    const surface = {
      createAscExecutionRuntime: mod.createAscExecutionRuntime,
      resolveSubagentSessionsDir: mod.resolveSubagentSessionsDir,
      resolveSubagentModelSelection: mod.resolveSubagentModelSelection,
    };
    cached =
      typeof surface.createAscExecutionRuntime === "function" &&
      typeof surface.resolveSubagentSessionsDir === "function" &&
      typeof surface.resolveSubagentModelSelection === "function"
        ? (surface as AscExecutionSurface)
        : undefined;
  } catch {
    cached = undefined;
  }
  return cached;
}

/** Test-only surface cache reset. */
export function resetAscExecutionSurfaceCache(): void {
  cached = "unloaded";
}
