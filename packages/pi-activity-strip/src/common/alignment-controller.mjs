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
 * @param {{ is_floating?: boolean, layout?: { tile_pos_in_workspace_view?: unknown, window_size?: unknown } } | null | undefined} window
 * @param {{x: number, y: number, width: number, height: number}} target
 */
export function isNiriWindowAligned(window, target) {
  if (!hasNiriFloatingPosition(window)) return false;
  const position = window?.layout?.tile_pos_in_workspace_view;
  const size = window?.layout?.window_size;
  return Boolean(
    Array.isArray(position) &&
      Array.isArray(size) &&
      Number(size[0]) === target.width &&
      Number(size[1]) === target.height &&
      Math.abs(Number(position[0]) - target.x) < 1 &&
      Math.abs(Number(position[1]) - target.y) < 1,
  );
}

/**
 * @param {(attempt: { generation: number, isCurrent: () => boolean }) => Promise<void>} run
 */
export function createLatestOnlyRunner(run) {
  if (typeof run !== "function") throw new TypeError("run must be a function");

  let requestedGeneration = 0;
  let completedGeneration = 0;
  /** @type {Promise<void> | null} */
  let worker = null;

  function ensureWorker() {
    if (!worker) worker = drain();
  }

  async function drain() {
    try {
      while (completedGeneration < requestedGeneration) {
        const generation = requestedGeneration;
        const isCurrent = () => generation === requestedGeneration;
        try {
          await run({ generation, isCurrent });
        } catch {
          // Alignment is best effort. A newer request must still be allowed to reconcile the window.
        }
        completedGeneration = generation;
      }
    } finally {
      worker = null;
      // A request can arrive after the loop condition was checked but before this finally block.
      // Hand it to a successor synchronously so no requested generation is lost.
      if (completedGeneration < requestedGeneration) ensureWorker();
    }
  }

  function request() {
    requestedGeneration += 1;
    ensureWorker();
    return requestedGeneration;
  }

  async function waitForIdle() {
    while (worker) await worker;
  }

  return {
    request,
    waitForIdle,
  };
}
