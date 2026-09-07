// ---
// summary: "remembers which Niri window last displayed each Ghostty terminal surface so hidden tabs stay placed"
// read_when:
//   - "changing hidden-tab placement memory, its persistence, or its invalidation rules"
// ---

import fs from "node:fs";
import path from "node:path";
import { appIdForGhosttyFamily, normalizeGhosttySurfaceId } from "./terminal-identity.mjs";

export const SURFACE_BINDINGS_SCHEMA = "pi-activity-strip-surface-bindings.v1";
const TITLE_BINDING = / · gs:(main|legacy):(\d+) · ([0-9a-f]{32})$/i;
const SESSION_BINDING_PREFIX = "pi-session:";

/**
 * Ghostty surface ids are per-process handles that can drift from the value a long-lived Pi
 * process captured at startup, while the 32-hex session token in the same title never does. Both
 * keys are therefore remembered, and lookups prefer the more specific surface key.
 * @param {unknown} sessionToken
 */
export function sessionBindingKey(sessionToken) {
  const token = String(sessionToken ?? "")
    .trim()
    .toLowerCase();
  return /^[0-9a-f]{32}$/.test(token) ? `${SESSION_BINDING_PREFIX}${token}` : "";
}

/** @typedef {{windowId: number; windowPid: number; appId: string; observedAt: number}} SurfaceBinding */
/** @typedef {{instanceKey: string; filePath?: string; fs?: Pick<typeof fs, "readFileSync" | "writeFileSync" | "renameSync" | "mkdirSync" | "unlinkSync">; now?: () => number}} SurfaceBindingStoreOptions */

/**
 * A Ghostty window title only names its active tab. Parse that name into the bound terminal key so
 * every observation of a visible title teaches which window currently owns the surface.
 * @param {unknown} title
 */
export function parseTerminalTitleBinding(title) {
  const match = String(title ?? "").match(TITLE_BINDING);
  if (!match) return null;
  const surfaceId = normalizeGhosttySurfaceId(match[2]);
  if (!surfaceId) return null;
  const family = String(match[1]).toLowerCase();
  const sessionToken = String(match[3]).toLowerCase();
  return {
    family,
    surfaceId,
    sessionToken,
    terminalKey: `ghostty:${family}:${surfaceId}`,
    sessionKey: sessionBindingKey(sessionToken),
  };
}

/**
 * Every binding key a title or tab label teaches: the exact surface, and the logical session.
 * @param {ReturnType<typeof parseTerminalTitleBinding>} parsed
 */
export function bindingKeysFor(parsed) {
  return parsed ? [parsed.terminalKey, parsed.sessionKey].filter(Boolean) : [];
}

/**
 * Bindings are memory, not proof: they are only consulted for windows that still exist, still
 * belong to the same Ghostty process, and are still admitted by the terminal's own host process.
 * Persisted memory is bound to one Niri instance because window ids restart with the compositor.
 * @param {SurfaceBindingStoreOptions} options
 */
export function createSurfaceBindingStore({
  instanceKey,
  filePath = "",
  fs: fsImpl = fs,
  now = Date.now,
}) {
  /** @type {Map<string, SurfaceBinding>} */
  const bindings = new Map();
  let dirty = false;

  function load() {
    if (!filePath) return;
    /** @type {any} */
    let parsed;
    try {
      parsed = JSON.parse(fsImpl.readFileSync(filePath, "utf8"));
    } catch {
      return;
    }
    if (parsed?.schema !== SURFACE_BINDINGS_SCHEMA || parsed.instanceKey !== instanceKey) return;
    const entries = /** @type {Array<[string, any]>} */ (Object.entries(parsed.bindings ?? {}));
    for (const [terminalKey, value] of entries) {
      if (
        !Number.isInteger(value?.windowId) ||
        !Number.isInteger(value?.windowPid) ||
        typeof value?.appId !== "string"
      ) {
        continue;
      }
      bindings.set(terminalKey, {
        windowId: value.windowId,
        windowPid: value.windowPid,
        appId: value.appId,
        observedAt: Number(value.observedAt) || 0,
      });
    }
  }

  function persist() {
    if (!filePath || !dirty) return false;
    const temporaryPath = `${filePath}.tmp.${process.pid}`;
    try {
      fsImpl.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      fsImpl.writeFileSync(
        temporaryPath,
        JSON.stringify({
          schema: SURFACE_BINDINGS_SCHEMA,
          instanceKey,
          savedAt: now(),
          bindings: Object.fromEntries(bindings),
        }),
        { mode: 0o600 },
      );
      fsImpl.renameSync(temporaryPath, filePath);
      dirty = false;
      return true;
    } catch {
      try {
        fsImpl.unlinkSync(temporaryPath);
      } catch {
        // The temporary file never existed or is already gone.
      }
      return false;
    }
  }

  /**
   * Learn from every Ghostty window whose title carries a surface segment. Accepts a complete
   * window list or a single window event. Returns the terminal keys whose binding changed.
   * @param {Array<Record<string, unknown>>} windows
   */
  function observeWindows(windows) {
    const changed = [];
    for (const window of windows ?? []) {
      if (!Number.isInteger(window?.id) || !Number.isInteger(window?.pid)) continue;
      const parsed = parseTerminalTitleBinding(window.title);
      if (!parsed) continue;
      const appId = String(window.app_id ?? "");
      if (appId !== appIdForGhosttyFamily(parsed.family)) continue;
      for (const key of bindingKeysFor(parsed)) {
        const previous = bindings.get(key);
        if (previous?.windowId === window.id && previous?.windowPid === window.pid) continue;
        bindings.set(key, {
          windowId: Number(window.id),
          windowPid: Number(window.pid),
          appId,
          observedAt: now(),
        });
        changed.push(key);
        dirty = true;
      }
    }
    return changed;
  }

  /**
   * Adopt bindings established by an exact external inventory (for example AT-SPI tab labels
   * already mapped onto windows). Returns the terminal keys whose binding changed.
   * @param {Array<{bindingKey: string; windowId: number; windowPid: number; appId: string}>} observed
   */
  function observeBindings(observed) {
    const changed = [];
    for (const binding of observed ?? []) {
      if (
        typeof binding?.bindingKey !== "string" ||
        !binding.bindingKey ||
        !Number.isInteger(binding.windowId) ||
        !Number.isInteger(binding.windowPid) ||
        typeof binding.appId !== "string"
      ) {
        continue;
      }
      const previous = bindings.get(binding.bindingKey);
      if (previous?.windowId === binding.windowId && previous?.windowPid === binding.windowPid) {
        continue;
      }
      bindings.set(binding.bindingKey, {
        windowId: binding.windowId,
        windowPid: binding.windowPid,
        appId: binding.appId,
        observedAt: now(),
      });
      changed.push(binding.bindingKey);
      dirty = true;
    }
    return changed;
  }

  /**
   * Forget bindings whose window vanished or changed process identity. Only a complete window list
   * may prune; an empty observation is indistinguishable from a failed read and is ignored.
   * @param {Array<Record<string, unknown>>} windows
   */
  function prune(windows) {
    if (!Array.isArray(windows) || windows.length === 0) return [];
    const byId = new Map(
      windows.filter((window) => Number.isInteger(window?.id)).map((window) => [window.id, window]),
    );
    const removed = [];
    for (const [terminalKey, binding] of bindings) {
      const window = byId.get(binding.windowId);
      if (
        window &&
        window.pid === binding.windowPid &&
        String(window.app_id ?? "") === binding.appId
      ) {
        continue;
      }
      bindings.delete(terminalKey);
      removed.push(terminalKey);
      dirty = true;
    }
    return removed;
  }

  load();
  return {
    observeWindows,
    observeBindings,
    prune,
    persist,
    /** @param {string} terminalKey */
    lookup: (terminalKey) => bindings.get(terminalKey) ?? null,
    entries: () => [...bindings.entries()],
    get size() {
      return bindings.size;
    },
  };
}
