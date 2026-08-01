// ---
// summary: "coalesces native-window alignment so stale async work cannot overwrite newer geometry"
// read_when:
//   - "changing Electron/Niri geometry reconciliation or testing rapid expansion transitions"
// ---

/**
 * @param {{ is_floating?: boolean, layout?: { tile_pos_in_workspace_view?: unknown } } | null | undefined} window
 */
export function hasNiriFloatingPosition(window) {
  const position = window?.layout?.tile_pos_in_workspace_view;
  return window?.is_floating === true && Array.isArray(position) && position.length >= 2;
}

/**
 * @param {(attempt: { generation: number, isCurrent: () => boolean }) => Promise<void>} run
 */
export function createLatestOnlyRunner(run) {
  if (typeof run !== "function") throw new TypeError("run must be a function");

  let requestedGeneration = 0;
  /** @type {Promise<void> | null} */
  let worker = null;

  async function drain() {
    while (true) {
      const generation = requestedGeneration;
      const isCurrent = () => generation === requestedGeneration;
      try {
        await run({ generation, isCurrent });
      } catch {
        // Alignment is best effort. A newer request must still be allowed to reconcile the window.
      }
      if (isCurrent()) return;
    }
  }

  function request() {
    requestedGeneration += 1;
    if (!worker) {
      worker = drain().finally(() => {
        worker = null;
      });
    }
    return requestedGeneration;
  }

  async function waitForIdle() {
    await worker;
  }

  return {
    request,
    waitForIdle,
  };
}
