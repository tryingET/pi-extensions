// ---
// summary: "presents one Ghostty surface through the running process's session-bus present-surface action"
// read_when:
//   - "changing hidden-tab activation, Ghostty D-Bus targeting, or its fail-closed conditions"
// ---

import { normalizeGhosttySurfaceId } from "./terminal-identity.mjs";

const GHOSTTY_OBJECT_PATHS = new Map([
  ["main", "/com/mitchellh/ghostty"],
  ["legacy", "/com/tryinget/ghosttysidequest"],
]);
export const GHOSTTY_PRESENT_SURFACE_TIMEOUT_MS = 2000;

/** @typedef {(file: string, args: string[], options: object) => Promise<{stdout?: string}>} ExecFileAsync */
/** @typedef {{ok: true; busName: string} | {ok: false; error: string}} PresentSurfaceResult */

/** @param {unknown} family */
export function ghosttyObjectPathForFamily(family) {
  return GHOSTTY_OBJECT_PATHS.get(String(family ?? "")) ?? "";
}

/**
 * Every running Ghostty process, single-instance server or standalone window, exports
 * `org.gtk.Actions` on its unique bus name. `present-surface` selects the tab owning the surface
 * and presents its window; a surface id the process does not own is ignored by Ghostty itself.
 * The target is the exact host process already proven to contain the surface, never a
 * well-known name that another build could claim.
 * @param {{execFileAsync: ExecFileAsync; env?: NodeJS.ProcessEnv; hostPid: number; terminalFamily: unknown; surfaceId: unknown; timeout?: number}} options
 * @returns {Promise<PresentSurfaceResult>}
 */
export async function presentGhosttySurface({
  execFileAsync,
  env = process.env,
  hostPid,
  terminalFamily,
  surfaceId,
  timeout = GHOSTTY_PRESENT_SURFACE_TIMEOUT_MS,
}) {
  const objectPath = ghosttyObjectPathForFamily(terminalFamily);
  const normalizedSurfaceId = normalizeGhosttySurfaceId(surfaceId);
  if (
    !objectPath ||
    !normalizedSurfaceId ||
    normalizedSurfaceId === "0" ||
    !Number.isInteger(hostPid) ||
    hostPid <= 0
  ) {
    return { ok: false, error: "the surface target is incomplete" };
  }

  let rows;
  try {
    const { stdout } = await execFileAsync(
      "busctl",
      ["--user", "list", "--no-pager", "--no-legend"],
      { env, timeout },
    );
    rows = String(stdout ?? "")
      .split("\n")
      .map((line) => line.trim().split(/\s+/));
  } catch {
    return { ok: false, error: "the session bus is unavailable" };
  }
  const uniqueNames = rows
    .filter(
      (fields) => fields[0]?.startsWith(":") && Number.parseInt(fields[1] ?? "", 10) === hostPid,
    )
    .map((fields) => String(fields[0]));
  if (uniqueNames.length === 0) {
    return { ok: false, error: "the Ghostty process is not on the session bus" };
  }
  if (uniqueNames.length > 1) {
    return { ok: false, error: "the Ghostty process owns several bus connections" };
  }

  try {
    await execFileAsync(
      "busctl",
      [
        "--user",
        "call",
        uniqueNames[0],
        objectPath,
        "org.gtk.Actions",
        "Activate",
        "sava{sv}",
        "present-surface",
        "1",
        "t",
        normalizedSurfaceId,
        "0",
      ],
      { env, timeout },
    );
    return { ok: true, busName: uniqueNames[0] };
  } catch {
    return { ok: false, error: "Ghostty rejected present-surface" };
  }
}
