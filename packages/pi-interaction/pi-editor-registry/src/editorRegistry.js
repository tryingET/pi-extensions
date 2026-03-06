/**
 * Lightweight editor ownership registry for interaction runtime mounting.
 */

/**
 * @typedef {{ hasUI?: boolean, ui?: { setEditorComponent?: (factory: Function) => void, notify?: (message: string, level?: "info"|"warning"|"error") => void } }} SessionContextLike
 */

/**
 * @typedef {{
 *   ownerId: string,
 *   mounted: boolean,
 *   mountCount: number,
 *   lastMountedAt?: string,
 * }} EditorRegistryDiagnostics
 */

/**
 * @param {{ ownerId?: string }} [options]
 */
export function createEditorRegistry(options = {}) {
  const ownerId = String(options.ownerId ?? "pi-interaction");

  /** @type {EditorRegistryDiagnostics} */
  const state = {
    ownerId,
    mounted: false,
    mountCount: 0,
  };

  return {
    /**
     * @param {{ ctx: SessionContextLike, factory: Function, notifyMessage?: string }} params
     */
    mount(params) {
      if (!params?.ctx?.hasUI || typeof params.ctx.ui?.setEditorComponent !== "function") {
        return false;
      }

      params.ctx.ui.setEditorComponent(params.factory);
      state.mounted = true;
      state.mountCount += 1;
      state.lastMountedAt = new Date().toISOString();

      if (params.notifyMessage) {
        params.ctx.ui.notify?.(params.notifyMessage, "info");
      }

      return true;
    },
    diagnostics() {
      return { ...state };
    },
  };
}
