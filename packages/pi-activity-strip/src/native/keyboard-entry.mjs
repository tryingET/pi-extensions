/**
 * Admit against the current compositor projection/event facts, not panel activity or card count.
 * Reserve before writing: Niri's NULL focus event may arrive before the panel acknowledgement.
 * No asynchronous queue may take the keyboard after this command has reported failure.
 * @param {{
 *   projection: ReturnType<typeof import("./panel-projection.mjs").createNativePanelProjection>;
 *   runtimeStatus: {clickThrough?: boolean; windowVisible?: boolean};
 *   writePanel: (message: {type: string; revision: number; epoch: number}) => boolean;
 * }} options
 */
export function createKeyboardEntry({ projection, runtimeStatus, writePanel }) {
  return function focusStrip() {
    if (runtimeStatus.clickThrough) {
      return { ok: false, error: "Keyboard entry is disabled in click-through mode." };
    }
    if (!runtimeStatus.windowVisible || !projection.isEligible()) {
      return { ok: false, error: "No eligible visible native strip exists on this workspace." };
    }
    const request = projection.requestKeyboard();
    if (
      request !== null &&
      writePanel({
        type: "focus-strip",
        revision: request,
        epoch: projection.getInteractionEpoch(),
      })
    )
      return { ok: true };
    projection.cancelKeyboard();
    return { ok: false, error: "Native panel is not ready for keyboard entry." };
  };
}
