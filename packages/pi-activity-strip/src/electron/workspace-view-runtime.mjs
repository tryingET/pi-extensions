// ---
// summary: "reconciles one workspace-local Niri strip view with native show, hide, move, and alignment effects"
// read_when:
//   - "changing workspace-local session filtering or Niri strip visibility lifecycle"
// ---

import { createLatestOnlyRunner } from "../common/alignment-controller.mjs";
import {
  resolveFocusedNiriWorkspace,
  resolveFocusedWorkspaceView,
  resolveWorkspaceView,
} from "../common/niri-focus.mjs";

const STRIP_DISCOVERY_ATTEMPTS = 8;
const STRIP_DISCOVERY_DELAY_MS = 80;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function emptyView(workspace = null) {
  return { workspace, sessions: [], focusedSessionId: null };
}

/** @param {Array<Record<string, unknown>>} left @param {Array<Record<string, unknown>>} right */
export function haveSameSessionIds(left, right) {
  if (left.length !== right.length) return false;
  const leftIds = new Set(left.map((session) => session.sessionId));
  return leftIds.size === left.length && right.every((session) => leftIds.has(session.sessionId));
}

/**
 * Keep the global broker snapshot authoritative while projecting one exact,
 * workspace-local renderer view. Native effects are injected so the lifecycle
 * can be tested without Electron or a compositor.
 * @param {{
 *   readWindows: () => Promise<Array<Record<string, unknown>>>;
 *   readWorkspaces: () => Promise<Array<Record<string, unknown>>>;
 *   getSessions: () => Array<Record<string, unknown>>;
 *   getStripWindow: (windows: Array<Record<string, unknown>>) => Record<string, unknown> | null;
 *   isWindowVisible: () => boolean;
 *   isWindowExpanded: () => boolean;
 *   showWindow: () => Promise<void> | void;
 *   hideWindow: () => void;
 *   concealWindow: () => Promise<boolean | void> | boolean | void;
 *   revealWindow: (isCurrent: () => boolean) => Promise<boolean | void> | boolean | void;
 *   cancelReveal: () => void;
 *   collapseWindow: () => Promise<unknown> | unknown;
 *   publishView: (view: {workspace: Record<string, unknown> | null; sessions: Array<Record<string, unknown>>; focusedSessionId: string | null}) => void;
 *   moveWindowToWorkspace: (window: Record<string, unknown>, workspace: Record<string, unknown>) => Promise<boolean>;
 *   alignWindow: (isCurrent: () => boolean) => Promise<{ok: boolean; animated: boolean}>;
 *   settleWindow: (isCurrent: () => boolean) => Promise<boolean>;
 *   isWindowAligned: (window: Record<string, unknown>) => boolean;
 *   identityOptions?: {env?: NodeJS.ProcessEnv; readFileSync?: Function; existsSync?: Function};
 *   wait?: (milliseconds: number) => Promise<unknown>;
 * }} options
 */
export function createNiriWorkspaceViewRuntime(options) {
  const wait = options.wait ?? delay;
  let passiveRequestQueued = false;
  let passiveProbe = null;
  let reconciling = false;
  let reconcilingWorkspaceId = null;
  let revealing = false;

  function requestLatest() {
    passiveRequestQueued = false;
    if (revealing) options.cancelReveal();
    return runner.request();
  }

  function probeFocusedWorkspace() {
    const expectedWorkspaceId = reconcilingWorkspaceId;
    if (expectedWorkspaceId == null || passiveProbe) return passiveProbe;
    passiveProbe = Promise.resolve()
      .then(() => options.readWorkspaces())
      .then((workspaces) => {
        if (!reconciling || reconcilingWorkspaceId !== expectedWorkspaceId) return;
        const focusedWorkspace = resolveFocusedNiriWorkspace(workspaces);
        if (!focusedWorkspace || focusedWorkspace.id !== expectedWorkspaceId) requestLatest();
      })
      .catch(() => {
        if (reconciling && reconcilingWorkspaceId === expectedWorkspaceId) requestLatest();
      })
      .finally(() => {
        passiveProbe = null;
      });
    return passiveProbe;
  }

  async function waitForPassiveProbe(isCurrent) {
    if (passiveProbe) await passiveProbe;
    return isCurrent();
  }

  async function findStripWindow(initialWindows, isCurrent) {
    let windows = initialWindows;
    for (let attempt = 0; attempt < STRIP_DISCOVERY_ATTEMPTS; attempt += 1) {
      const stripWindow = options.getStripWindow(windows);
      if (stripWindow) return stripWindow;
      if (attempt === STRIP_DISCOVERY_ATTEMPTS - 1) break;
      await wait(STRIP_DISCOVERY_DELAY_MS);
      if (!isCurrent()) return null;
      windows = await options.readWindows();
      if (!isCurrent()) return null;
    }
    return null;
  }

  async function concealAndClear(view, isCurrent) {
    let concealed = false;
    try {
      concealed = (await options.concealWindow()) !== false;
    } catch {
      // A transition may proceed only after renderer concealment is acknowledged.
    }
    if (!isCurrent()) return false;
    options.publishView(emptyView(view?.workspace ?? null));
    return concealed;
  }

  async function hideView(view, isCurrent, { skipConceal = false } = {}) {
    if (options.isWindowVisible() || options.isWindowExpanded()) {
      try {
        await options.collapseWindow();
      } catch {
        // Hiding remains fail-closed even if expansion reconciliation is unavailable.
      }
    }
    if (!isCurrent()) return;
    if (!skipConceal) {
      try {
        await options.concealWindow();
      } catch {
        // Native hiding remains the final fail-closed boundary.
      }
    }
    if (!isCurrent()) return;
    options.publishView(emptyView(view?.workspace ?? null));
    options.hideWindow();
  }

  async function parkView(view, isCurrent) {
    if (options.isWindowExpanded()) {
      try {
        await options.collapseWindow();
      } catch {
        // Concealment below remains the fail-closed visual boundary.
      }
    }
    if (!isCurrent()) return;
    const concealed = await concealAndClear(view, isCurrent);
    if (!isCurrent()) return;
    if (!concealed) await hideView(view, isCurrent, { skipConceal: true });
  }

  async function revealView(view, isCurrent) {
    let revealed = false;
    revealing = true;
    try {
      revealed = (await options.revealWindow(isCurrent)) !== false;
    } finally {
      revealing = false;
    }
    if (!isCurrent()) {
      try {
        await options.concealWindow();
      } catch {
        // A newer reconciliation owns the next fail-closed state.
      }
      return false;
    }
    if (!revealed) {
      await hideView(view, isCurrent);
      return false;
    }
    return true;
  }

  async function verifyPlacement(expectedWorkspace, isCurrent, requireAlignment = false) {
    for (let attempt = 0; attempt < STRIP_DISCOVERY_ATTEMPTS; attempt += 1) {
      const [windows, workspaces] = await Promise.all([
        options.readWindows(),
        options.readWorkspaces(),
      ]);
      if (!isCurrent()) return null;
      const focusedWorkspace = resolveFocusedNiriWorkspace(workspaces);
      const stripWindow = options.getStripWindow(windows);
      if (
        focusedWorkspace?.id === expectedWorkspace.id &&
        stripWindow?.workspace_id === expectedWorkspace.id &&
        (!requireAlignment || options.isWindowAligned(stripWindow))
      ) {
        const verifiedView = resolveFocusedWorkspaceView(
          windows,
          workspaces,
          options.getSessions(),
          options.identityOptions,
        );
        return verifiedView?.sessions.length ? verifiedView : null;
      }
      if (focusedWorkspace && focusedWorkspace.id !== expectedWorkspace.id) return null;
      if (attempt === STRIP_DISCOVERY_ATTEMPTS - 1) break;
      await wait(STRIP_DISCOVERY_DELAY_MS);
      if (!isCurrent()) return null;
    }
    return null;
  }

  async function reconcileOnce({ isCurrent }) {
    const [windows, workspaces] = await Promise.all([
      options.readWindows(),
      options.readWorkspaces(),
    ]);
    if (!isCurrent()) return;

    let view = resolveFocusedWorkspaceView(
      windows,
      workspaces,
      options.getSessions(),
      options.identityOptions,
    );
    if (!view) {
      // Ambiguous or missing focused-workspace truth must never reactivate a resident view.
      await parkView(null, isCurrent);
      return;
    }
    reconcilingWorkspaceId = view.workspace.id;
    if (passiveRequestQueued) void probeFocusedWorkspace();
    if (view.sessions.length === 0) {
      // Keep an aligned surface rendered on its prior workspace while that workspace still owns
      // exact tracked terminals. It then travels only with the workspace itself and never reopens
      // at Niri's middle-left default position on a return visit.
      const residentStrip = options.getStripWindow(windows);
      const residentWorkspaces = residentStrip
        ? workspaces.filter((workspace) => workspace?.id === residentStrip.workspace_id)
        : [];
      const residentView =
        residentWorkspaces.length === 1 && residentStrip && options.isWindowAligned(residentStrip)
          ? resolveWorkspaceView(
              windows,
              residentWorkspaces[0],
              options.getSessions(),
              options.identityOptions,
            )
          : null;
      if (residentView?.sessions.length) {
        if (!(await waitForPassiveProbe(isCurrent))) return;
        options.publishView(residentView);
        if (!isCurrent()) return;
        await revealView(residentView, isCurrent);
        return;
      }
      await parkView(view, isCurrent);
      return;
    }

    const wasVisible = options.isWindowVisible();
    const initialStripWindow = options.getStripWindow(windows);
    const requiresPlacement =
      !wasVisible ||
      !initialStripWindow ||
      initialStripWindow.workspace_id !== view.workspace.id ||
      !options.isWindowAligned(initialStripWindow);

    if (requiresPlacement) {
      const concealed = await concealAndClear(view, isCurrent);
      if (!isCurrent()) return;
      if (!concealed) {
        await hideView(view, isCurrent, { skipConceal: true });
        return;
      }
      if (!wasVisible) await options.showWindow();
    }

    const stripWindow = await findStripWindow(windows, isCurrent);
    if (!isCurrent()) return;
    if (!stripWindow) {
      await hideView(view, isCurrent, { skipConceal: requiresPlacement });
      return;
    }

    let movedBetweenWorkspaces = false;
    if (stripWindow.workspace_id !== view.workspace.id) {
      const moved = await options.moveWindowToWorkspace(stripWindow, view.workspace);
      if (!isCurrent()) return;
      if (!moved) {
        await hideView(view, isCurrent, { skipConceal: requiresPlacement });
        return;
      }
      movedBetweenWorkspaces = true;
    }

    if (requiresPlacement) {
      let verifiedView = await verifyPlacement(view.workspace, isCurrent);
      if (!verifiedView) {
        if (isCurrent()) await hideView(view, isCurrent, { skipConceal: true });
        return;
      }
      const alignment = await options.alignWindow(isCurrent);
      if (!isCurrent()) return;
      if (!alignment.ok) {
        await hideView(view, isCurrent, { skipConceal: true });
        return;
      }
      verifiedView = await verifyPlacement(view.workspace, isCurrent, true);
      if (!verifiedView) {
        if (isCurrent()) await hideView(view, isCurrent, { skipConceal: true });
        return;
      }

      // Niri reports final logical coordinates while its render offset is still animating. Wait
      // only after operations that can animate; an aligned resident window can reveal immediately.
      if (!wasVisible || movedBetweenWorkspaces || alignment.animated) {
        const settled = await options.settleWindow(isCurrent);
        if (!isCurrent()) return;
        if (!settled) {
          await hideView(view, isCurrent, { skipConceal: true });
          return;
        }
        verifiedView = await verifyPlacement(view.workspace, isCurrent, true);
        if (!verifiedView) {
          if (isCurrent()) await hideView(view, isCurrent, { skipConceal: true });
          return;
        }
      }
      view = verifiedView;
    }
    if (!isCurrent() || !(await waitForPassiveProbe(isCurrent))) return;

    options.publishView(view);
    if (!isCurrent()) return;
    await revealView(view, isCurrent);
  }

  let runner;
  async function reconcile(context) {
    reconciling = true;
    reconcilingWorkspaceId = null;
    try {
      await reconcileOnce(context);
    } catch {
      if (context.isCurrent()) await hideView(null, context.isCurrent);
    } finally {
      reconcilingWorkspaceId = null;
      reconciling = false;
      if (passiveRequestQueued && context.isCurrent()) requestLatest();
    }
  }

  runner = createLatestOnlyRunner(reconcile);
  return {
    request: requestLatest,
    requestPassive() {
      if (!reconciling) return requestLatest();
      passiveRequestQueued = true;
      void probeFocusedWorkspace();
      return null;
    },
    waitForIdle: runner.waitForIdle,
  };
}
