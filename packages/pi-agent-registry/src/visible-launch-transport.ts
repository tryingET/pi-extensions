// ---
// summary: capability-checked loader for the little-helpers visible Ghostty launch transport.
// read_when:
//   - changing how pi-agent-registry consumes the shared visible-launch core.
// ---

import { authorizeExactTask, readAkTask } from "./dispatch-authorization.ts";
import type { AkTaskSnapshot } from "./dispatch-contract.ts";
import { canonicalJsonString } from "./dispatch-receipt.ts";
import type { VisibleLaunchTransport } from "./visible-launch-contract.ts";

export function hasVisibleLaunchTransportCapability(mod: Record<string, unknown>): boolean {
  return (
    mod.STANDING_AGENT_TRANSPORT_VERSION === 1 &&
    mod.STANDING_AGENT_DISPATCH_GUARD_VERSION === 1 &&
    typeof mod.launchPiQuestSession === "function"
  );
}

let cached: VisibleLaunchTransport | undefined | "unloaded" = "unloaded";

/**
 * Load the little-helpers visible-launch core (`launchPiQuestSession`). The
 * registry declares the workspace link; an installed/published
 * pi-little-helpers that predates the `./sidequest-launch` export resolves to
 * `undefined` and every Phase-3 launch fails closed with
 * `visible_transport_unavailable` (confirmed_no_effects). Ghostty/transport
 * mechanics stay little-helpers-owned; this loader checks version-1 final-guard capability too.
 */
export async function loadVisibleLaunchTransport(): Promise<VisibleLaunchTransport | undefined> {
  if (cached !== "unloaded") {
    return cached;
  }
  try {
    const mod = (await import("@tryinget/pi-little-helpers/sidequest-launch")) as Record<
      string,
      unknown
    >;
    cached = hasVisibleLaunchTransportCapability(mod)
      ? (mod as unknown as VisibleLaunchTransport)
      : undefined;
  } catch {
    cached = undefined;
  }
  return cached;
}

/** Test-only transport cache reset. */
export function resetVisibleLaunchTransportCache(): void {
  cached = "unloaded";
}

/** Read-only owner gate consumed by shared transport AFTER its FIFO/identity waits.
 * The original finite lease bounds dispatch even if time passes while this read resolves.
 * This is a final bounded observation, not atomic lifetime authority or claimant authentication.
 */
export function createVisibleLaunchDispatchGuard(
  task: AkTaskSnapshot,
  parentRoot: string,
  akBinary?: string,
) {
  const expected = canonicalJsonString(task);
  const dispatchDeadlineMs = Date.parse(task.lease_expires_at ?? "");
  return {
    dispatchDeadlineMs,
    async beforeDispatch(): Promise<boolean> {
      try {
        const latest = await readAkTask(task.id, { akBinary });
        return canonicalJsonString(latest) === expected && authorizeExactTask(latest, parentRoot).ok;
      } catch {
        return false;
      }
    },
  };
}
