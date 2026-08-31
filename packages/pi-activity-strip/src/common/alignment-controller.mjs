// ---
// summary: "coalesces asynchronous reconciliation so stale work cannot publish over newer state"
// read_when:
//   - "changing latest-only native workspace reconciliation"
// ---

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
