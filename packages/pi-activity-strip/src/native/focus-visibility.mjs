/** @typedef {import("../common/workspace-view.mjs").FocusKind} FocusKind */
/** Tracks only explicitly requested keyboard ownership, across the panel's transient NULL focus. */
export function createFocusVisibility() {
  /** @type {FocusKind} */
  let focus = "unknown";
  /** @type {unknown} */
  let workspaceId = null;
  /** @type {number | null} */
  let keyboardRequest = null;
  let eligible = false;
  return {
    /** @param {{workspaceId: unknown; focus: FocusKind; hasCards: boolean}} next */
    observe(next) {
      if (
        next.workspaceId !== workspaceId ||
        !next.hasCards ||
        !["agent", "none"].includes(next.focus)
      ) {
        keyboardRequest = null;
      }
      workspaceId = next.workspaceId;
      focus = next.focus;
      eligible =
        next.hasCards && (focus === "agent" || (focus === "none" && keyboardRequest !== null));
      return eligible;
    },
    /** Reserve before writing focus-strip: Niri's NULL event may precede the panel's ack.
     * @param {number} revision @param {boolean} clickThrough
     */
    requestKeyboard(revision, clickThrough) {
      if (!eligible || clickThrough) return false;
      keyboardRequest = revision;
      return true;
    },
    /** A stale active ack cannot undo a non-agent observation. @param {number} revision @param {boolean} active */
    keyboardChanged(revision, active) {
      if (revision !== keyboardRequest) return false;
      if (!active) {
        keyboardRequest = null;
        if (focus !== "agent") eligible = false;
      }
      return true;
    },
    resetKeyboard() {
      keyboardRequest = null;
      if (focus !== "agent") eligible = false;
    },
    isEligible: () => eligible,
  };
}
