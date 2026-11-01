// ---
// summary: "pins and rechecks the exact presence-app window behind neutral keyboard authorization"
// read_when:
//   - "changing neutral-source lifetime across panel NULL focus or delayed jumps"
// ---

import { classifyAdmittedWindowFocus } from "../common/workspace-view.mjs";
import { sourceIdentity } from "./interaction-context.mjs";

/** A presence app is a source window, not a card. Copy its process/app facts at admission so a
 * fallback refresh cannot silently transfer an existing grant to a reused or relocated window.
 * Niri reports `pid: null` for a client whose process it does not know; that null is pinned like a
 * number, so the window keeps its presence and a pid that later differs still revokes it.
 * @param {(id: number) => Record<string, unknown> | null} getWindowFacts
 * @param {NodeJS.ProcessEnv} env
 */
export function createNeutralSource(getWindowFacts, env) {
  /** @type {Record<string, unknown> | null} */
  let source = null;
  return {
    /** @param {Record<string, unknown> | null} facts */
    admit(facts) {
      source = facts ? { ...facts } : null;
    },
    clear() {
      source = null;
    },
    /** @param {unknown} workspaceId @param {number | null} windowId
     * @param {Record<string, unknown>[]} sessions */
    holds(workspaceId, windowId, sessions) {
      if (!source || windowId === null) return false;
      const current = getWindowFacts(windowId);
      return (
        source.id === windowId &&
        source.workspace_id === workspaceId &&
        (source.pid === null || Number.isInteger(source.pid)) &&
        current?.id === windowId &&
        current.workspace_id === workspaceId &&
        current.pid === source.pid &&
        current.app_id === source.app_id &&
        classifyAdmittedWindowFocus(windowId, sessions, current, env) === "neutral"
      );
    },
    /** @param {unknown} workspaceId @param {number | null} windowId */
    context(workspaceId, windowId) {
      return JSON.stringify([
        sourceIdentity(workspaceId, windowId, undefined),
        source?.pid,
        source?.app_id,
      ]);
    },
  };
}
