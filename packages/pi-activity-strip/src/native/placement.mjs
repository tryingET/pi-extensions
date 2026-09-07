// ---
// summary: "owns hidden-tab placement state: window memory, host resolution, and the bounded AT-SPI tab inventory"
// read_when:
//   - "changing hidden-tab placement inputs, inventory cadence, or placement runtime counters"
// ---

import path from "node:path";
import { ACTIVITY_STRIP_SOCKET_DIR } from "../common/constants.mjs";
import { resolvePiSessionIdentity, resolveSessionWindow } from "../common/niri-focus.mjs";
import {
  createSurfaceBindingStore,
  parseTerminalTitleBinding,
} from "../common/surface-bindings.mjs";
import {
  canonicalGhosttyTerminalKey,
  resolveTerminalHostPid,
} from "../common/terminal-identity.mjs";
import { mapTabInventoryToBindings, probeGhosttyTabInventory } from "./tab-inventory.mjs";

// The AT-SPI tab inventory is the only exact source for tabs that have never been shown while the
// strip ran. It is read-only, bounded, never concurrent, and backs off once the host reports it
// unavailable. Placement itself never depends on it: it only supplies more window memory.
export const TAB_INVENTORY_INTERVAL_MS = 10_000;
export const TAB_INVENTORY_URGENT_INTERVAL_MS = 3000;
export const TAB_INVENTORY_FAILURE_BACKOFF_MS = 30_000;
export const TAB_INVENTORY_UNAVAILABLE_RETRY_MS = 10 * 60_000;

/** @typedef {import("../common/contracts.ts").ActivityStripRuntimeStatus} ActivityStripRuntimeStatus */
/** @typedef {Record<string, unknown>} NiriWindow */

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv;
 *   runtimeStatus: ActivityStripRuntimeStatus;
 *   execFileAsync: (file: string, args: string[], options: object) => Promise<{stdout?: string}>;
 *   onBindingsLearned: () => void;
 *   now?: () => number;
 *   probeInventory?: typeof probeGhosttyTabInventory;
 *   bindingsFilePath?: string;
 * }} options
 */
export function createPlacementRuntime({
  env = process.env,
  runtimeStatus,
  execFileAsync,
  onBindingsLearned,
  now = Date.now,
  probeInventory = probeGhosttyTabInventory,
  bindingsFilePath,
}) {
  const isNiri = Boolean(env.NIRI_SOCKET);
  // Window ids restart with the compositor, so persisted memory is bound to one Niri instance.
  const bindings = createSurfaceBindingStore({
    instanceKey: String(env.NIRI_SOCKET ?? ""),
    filePath:
      bindingsFilePath ??
      (isNiri ? path.join(ACTIVITY_STRIP_SOCKET_DIR, "surface-bindings.json") : ""),
    now,
  });
  /** @type {Map<string, number>} */
  const hostPidCache = new Map();
  /** @type {Map<unknown, string>} */
  const windowSignatures = new Map();
  let inventoryInFlight = false;
  let inventoryNextAt = 0;

  const options = {
    env,
    /** @param {Record<string, unknown>} session */
    resolveHostPid: (session) => resolveTerminalHostPid(session, { cache: hostPidCache }),
    /** @param {string} bindingKey */
    lookupBinding: (bindingKey) => bindings.lookup(bindingKey),
  };

  /** Workspace plus visible surface: everything about a window that can move a card. */
  /** @param {NiriWindow} window */
  function signatureOf(window) {
    return `${window.workspace_id}|${parseTerminalTitleBinding(window.title)?.terminalKey ?? ""}`;
  }

  /**
   * Bound surfaces that resolve to no window at all: hidden tabs inside a multi-window Ghostty
   * process whose window has not been observed or inventoried yet.
   * @param {NiriWindow[]} windows
   * @param {Array<Record<string, unknown>>} sessions
   */
  function countUnplaced(windows, sessions) {
    let unplaced = 0;
    for (const session of sessions) {
      if (!canonicalGhosttyTerminalKey(session)) continue;
      const sessionId = resolvePiSessionIdentity(session, options);
      if (!sessionId) continue;
      if (!resolveSessionWindow(windows, sessionId, session, options)) unplaced += 1;
    }
    return unplaced;
  }

  /** @param {NiriWindow[]} windows */
  function observeWindowList(windows) {
    if (windows.length === 0) return;
    bindings.observeWindows(windows);
    bindings.prune(windows);
    bindings.persist();
    windowSignatures.clear();
    for (const window of windows) {
      if (Number.isInteger(window?.id)) windowSignatures.set(window.id, signatureOf(window));
    }
  }

  /**
   * A single window event. Returns true when the change can move or reveal a card.
   * @param {NiriWindow} window
   */
  function observeWindowEvent(window) {
    if (!Number.isInteger(window?.id)) return false;
    const learned = bindings.observeWindows([window]);
    const signature = signatureOf(window);
    const changed = windowSignatures.get(window.id) !== signature;
    windowSignatures.set(window.id, signature);
    return learned.length > 0 || changed;
  }

  /**
   * A card placed by a visible title proves which window holds that terminal. Remember it so the
   * same tab stays placed once it is hidden behind another tab.
   * @param {Array<Record<string, unknown>>} cards
   * @param {NiriWindow[]} windows
   */
  function learnFromPlacements(cards, windows) {
    const byId = new Map(
      windows.filter((window) => Number.isInteger(window?.id)).map((window) => [window.id, window]),
    );
    const observed = [];
    for (const card of cards ?? []) {
      if (card?.placement !== "title") continue;
      const cardId = String(card.cardId ?? "");
      if (!cardId.startsWith("terminal:")) continue;
      const window = byId.get(card.windowId);
      if (!window || !Number.isInteger(window.pid)) continue;
      observed.push({
        bindingKey: cardId.slice("terminal:".length),
        windowId: Number(window.id),
        windowPid: Number(window.pid),
        appId: String(window.app_id ?? ""),
      });
    }
    if (observed.length > 0 && bindings.observeBindings(observed).length > 0) bindings.persist();
  }

  /** @param {number} windowId */
  function forgetWindow(windowId) {
    return windowSignatures.delete(windowId);
  }

  /** @param {NiriWindow[]} windows */
  function ghosttyPidsOf(windows) {
    return [
      ...new Set(
        windows
          .filter(
            (window) =>
              Number.isInteger(window?.pid) && /ghostty/i.test(String(window?.app_id ?? "")),
          )
          .map((window) => Number(window.pid)),
      ),
    ];
  }

  /** @param {NiriWindow[]} windows */
  function scheduleInventory(windows) {
    if (runtimeStatus.tabInventoryState === "disabled" || inventoryInFlight) return;
    if (now() < inventoryNextAt) return;
    const pids = ghosttyPidsOf(windows);
    if (pids.length === 0) return;
    inventoryInFlight = true;
    return probeInventory({ execFileAsync, env, pids })
      .then((result) => {
        runtimeStatus.tabInventoryProbedAt = now();
        if (!result.ok) {
          runtimeStatus.tabInventoryState = result.unavailable ? "unavailable" : "failed";
          runtimeStatus.tabInventoryDetail = result.error;
          inventoryNextAt =
            now() +
            (result.unavailable
              ? TAB_INVENTORY_UNAVAILABLE_RETRY_MS
              : TAB_INVENTORY_FAILURE_BACKOFF_MS);
          return;
        }
        runtimeStatus.tabInventoryState = "ready";
        runtimeStatus.tabInventoryDetail = null;
        runtimeStatus.tabInventoryFrameCount = result.frames.length;
        runtimeStatus.tabInventoryTabCount = result.frames.reduce(
          (total, frame) => total + frame.tabs.length,
          0,
        );
        const learned = bindings.observeBindings(mapTabInventoryToBindings(result.frames, windows));
        // The shorter cadence is for catching up, so it only holds while the probe is still
        // learning. A surface the inventory cannot see would otherwise pin it there forever.
        const catchingUp = learned.length > 0 && (runtimeStatus.unplacedSurfaceCount ?? 0) > 0;
        inventoryNextAt =
          now() + (catchingUp ? TAB_INVENTORY_URGENT_INTERVAL_MS : TAB_INVENTORY_INTERVAL_MS);
        if (learned.length > 0) {
          bindings.persist();
          onBindingsLearned();
        }
      })
      .finally(() => {
        inventoryInFlight = false;
      });
  }

  return {
    options,
    observeWindowList,
    observeWindowEvent,
    learnFromPlacements,
    forgetWindow,
    countUnplaced,
    scheduleInventory,
    persist: () => bindings.persist(),
    get bindingCount() {
      return bindings.size;
    },
  };
}
