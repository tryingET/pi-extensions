/** Bounded panel-request/controller-grant handshake, using the production admission state.
 * No GTK focus signal is an authority source. No deferred command is queued on write failure.
 * @param {{
 * projection: ReturnType<typeof import("./panel-projection.mjs").createNativePanelProjection>;
 * runtimeStatus: {clickThrough?: boolean; windowVisible?: boolean};
 * writePanel: (message: {type: string; token: number; epoch: number; request?: number}) => boolean;
 * }} options
 */
export function createHoverKeyboard({ projection, runtimeStatus, writePanel }) {
  // Tokens are unique for the lifetime of one panel. This binding is recreated on panel restart.
  let lastToken = 0;
  return {
    /** @param {number} token @param {number} epoch */
    request(token, epoch) {
      if (!Number.isSafeInteger(token) || token <= lastToken) return false;
      lastToken = token;
      const request =
        runtimeStatus.windowVisible && !runtimeStatus.clickThrough
          ? projection.requestHoverKeyboard(epoch, token, false)
          : null;
      if (request !== null) {
        if (writePanel({ type: "hover-grant", token, epoch, request })) return true;
        projection.cancelHoverKeyboard(token);
      } else {
        writePanel({ type: "hover-denied", token, epoch });
      }
      return false;
    },
    /** @param {number} token */
    cancel: (token) => projection.cancelHoverKeyboard(token),
  };
}
