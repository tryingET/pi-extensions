import { resolveFocusedWorkspaceView, resolveWindowDirectory } from "../common/workspace-view.mjs";
import { sourceIdentity } from "./interaction-context.mjs";
import { createWindowJump } from "./window-jump.mjs";
/** The SAME production binding is used by native event consumption and controlled pipe-race tests.
 * @param {{projection: ReturnType<typeof import("./panel-projection.mjs").createNativePanelProjection>;
 * getWindowFacts: (id: number) => Record<string, unknown> | null;
 * placementOptions: import("../common/workspace-view.mjs").ResolveOptions;
 * isNiriSession: () => boolean; readWindows: () => Promise<Record<string, unknown>[]>;
 * readWorkspaces: () => Promise<Record<string, unknown>[]>;
 * focusWindow: (id: number) => Promise<unknown>; reconcile: () => void}} options */
export function createPanelWindowJump({
  projection,
  placementOptions,
  getWindowFacts,
  ...options
}) {
  /** @param {{windowId?: unknown; request?: unknown; epoch?: unknown}} event */
  return async function requestJump(event) {
    const intent = projection.acceptJumpIntent(Number(event.request), Number(event.epoch));
    if (!intent)
      return { ok: false, error: "Jump has no current authorized source intent; nothing moved." };
    const sourceFacts = getWindowFacts(intent.windowId);
    const windowId = Number(event.windowId);
    const expectedTarget = projection.getDirectoryWindowIdentities(windowId);
    /** @type {Record<string, unknown>[]} */
    let workspaces = [];
    const jump = createWindowJump({
      ...options,
      readWindows: async () => {
        const [windows, freshWorkspaces] = await Promise.all([
          options.readWindows(),
          options.readWorkspaces(),
        ]);
        workspaces = freshWorkspaces;
        return windows;
      },
      isAdmittedWindow: (id, windows) => {
        if (!projection.hasDirectoryWindow(id)) return false;
        const fresh = resolveWindowDirectory(
          windows,
          [...new Set(windows.map((w) => w.workspace_id))].map((id) => ({ id })),
          projection.getRawSessions(),
          placementOptions,
        );
        return fresh.entries.some(
          (entry) =>
            entry.windowId === id &&
            expectedTarget.includes(
              sourceIdentity(entry.workspaceId, id, fresh.cards.get(entry.cardId)),
            ),
        );
      },
    });
    return jump(
      Number(event.windowId),
      intent.allowUnlisted && expectedTarget.length === 0,
      (windows) =>
        intent.isCurrent() &&
        Array.isArray(windows) &&
        Array.isArray(workspaces) &&
        workspaces.every(
          (w) =>
            w &&
            Number.isInteger(w.id) &&
            typeof w.is_focused === "boolean" &&
            (typeof w.name === "string" || Number.isInteger(w.idx)),
        ) &&
        new Set(workspaces.map((w) => w.id)).size === workspaces.length &&
        sourceFacts !== null &&
        windows.some(
          (w) =>
            w?.id === intent.windowId &&
            w?.workspace_id === sourceFacts.workspace_id &&
            w?.pid === sourceFacts.pid &&
            w?.app_id === sourceFacts.app_id,
        ) &&
        windows.every((w) => w && Number.isInteger(w.id) && typeof w.is_focused === "boolean") &&
        new Set(windows.map((w) => w.id)).size === windows.length &&
        intent.matchesSource(
          resolveFocusedWorkspaceView(
            windows,
            workspaces,
            projection.getRawSessions(),
            placementOptions,
          ),
        ),
    );
  };
}
