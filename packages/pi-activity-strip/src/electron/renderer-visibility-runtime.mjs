// ---
// summary: "acknowledges renderer conceal and reveal frames before native Niri lifecycle effects"
// read_when:
//   - "changing renderer visibility handshakes or wrong-workspace flash prevention"
// ---

export const VISIBILITY_CHANNEL = "pi-activity-strip:visibility";
export const VISIBILITY_APPLIED_CHANNEL = "pi-activity-strip:visibility-applied";

/**
 * Coordinate one bounded main-to-renderer visibility request. The renderer
 * acknowledges only after its CSS visibility change crosses two animation
 * frames, so callers can keep stale cards concealed during native remaps.
 * @param {{
 *   getWebContents: () => {send: (channel: string, ...args: unknown[]) => void} | null;
 *   setInputEnabled: (enabled: boolean) => void;
 *   timeoutMs: number;
 *   setTimer?: typeof setTimeout;
 *   clearTimer?: typeof clearTimeout;
 * }} options
 */
export function createRendererVisibilityRuntime(options) {
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let nextRequestId = 0;
  let latestRequestId = 0;
  const pending = new Map();

  function settle(requestId, applied) {
    const request = pending.get(requestId);
    if (!request) return false;
    pending.delete(requestId);
    clearTimer(request.timer);
    request.resolve(applied);
    return true;
  }

  async function apply(visible, isCurrent = () => true) {
    const webContents = options.getWebContents();
    if (!webContents) return false;
    if (!visible) options.setInputEnabled(false);

    nextRequestId += 1;
    const requestId = nextRequestId;
    latestRequestId = requestId;
    const applied = new Promise((resolve) => {
      const timer = setTimer(() => settle(requestId, false), options.timeoutMs);
      pending.set(requestId, { resolve, timer, webContents, visible: Boolean(visible) });
    });
    try {
      webContents.send(VISIBILITY_CHANNEL, Boolean(visible), requestId);
    } catch {
      settle(requestId, false);
    }

    const succeeded = await applied;
    const appliedToCurrentRenderer =
      succeeded &&
      requestId === latestRequestId &&
      isCurrent() &&
      options.getWebContents() === webContents;
    if (appliedToCurrentRenderer && visible) options.setInputEnabled(true);
    return appliedToCurrentRenderer;
  }

  function acknowledge(event, requestId, visible, applied = true) {
    const request = pending.get(requestId);
    if (!request || event?.sender !== request.webContents || Boolean(visible) !== request.visible) {
      return false;
    }
    return settle(requestId, Boolean(applied));
  }

  function dispose() {
    nextRequestId += 1;
    latestRequestId = nextRequestId;
    for (const requestId of [...pending.keys()]) settle(requestId, false);
    options.setInputEnabled(false);
  }

  return {
    acknowledge,
    appliedChannel: VISIBILITY_APPLIED_CHANNEL,
    apply,
    dispose,
  };
}

/**
 * @param {() => import("electron").BrowserWindow | null} getWindow
 * @param {boolean} interactive
 */
export function createBrowserWindowVisibilityRuntime(getWindow, interactive) {
  return createRendererVisibilityRuntime({
    getWebContents: () => {
      const window = getWindow();
      return window && !window.isDestroyed() ? window.webContents : null;
    },
    setInputEnabled: (enabled) => {
      const window = getWindow();
      if (!window || window.isDestroyed()) return;
      window.setFocusable(enabled && interactive);
      window.setIgnoreMouseEvents(!enabled || !interactive, { forward: true });
    },
    timeoutMs: 750,
  });
}
