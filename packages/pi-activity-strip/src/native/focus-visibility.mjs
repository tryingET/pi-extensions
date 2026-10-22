/** @typedef {import("../common/workspace-view.mjs").FocusKind} FocusKind */
/** Controller-authorized hover/explicit ownership across transient Niri NULL focus. */
export function createFocusVisibility() {
  /** @type {FocusKind} */
  let focus = "unknown";
  /** @type {unknown} */
  let workspaceId = null;
  /** @type {number | null} */
  let keyboardRequest = null;
  let eligible = false;
  /** @type {"none" | "hover" | "explicit"} */
  let mode = "none";
  /** @type {number | null} */
  let hoverToken = null;
  function reset() {
    keyboardRequest = null;
    mode = "none";
    hoverToken = null;
    if (focus !== "agent") eligible = false;
  }
  return {
    /** @param {{workspaceId: unknown; focus: FocusKind; hasCards: boolean}} next */
    observe(next) {
      if (
        next.workspaceId !== workspaceId ||
        !next.hasCards ||
        !["agent", "none"].includes(next.focus)
      )
        reset();
      workspaceId = next.workspaceId;
      focus = next.focus;
      eligible =
        next.hasCards && (focus === "agent" || (focus === "none" && keyboardRequest !== null));
      return eligible;
    },
    /** Reserve BEFORE the panel write: NULL may precede the acknowledgement.
     * @param {number} request @param {boolean} clickThrough
     * @param {"hover" | "explicit"} [kind] @param {number | null} [token]
     */
    requestKeyboard(request, clickThrough, kind = "explicit", token = null) {
      if (!eligible || clickThrough || (kind === "hover" && mode !== "none")) return false;
      keyboardRequest = request;
      mode = kind;
      hoverToken = kind === "hover" ? token : null;
      return true;
    },
    /** Late acknowledgements cannot revive invalidated ownership. @param {number} request @param {boolean} active */
    keyboardChanged(request, active) {
      if (request !== keyboardRequest) return false;
      if (!active) reset();
      return true;
    },
    resetKeyboard: reset,
    /** Never cancel a newer hover or explicit upgrade. @param {number} token */
    cancelHover(token) {
      if (mode !== "hover" || token !== hoverToken) return false;
      reset();
      return true;
    },
    keyboardMode: () => mode,
    /** @param {number} request */
    ownsRequest: (request) => request === keyboardRequest,
    isEligible: () => eligible,
  };
}
