/**
 * Core broker that manages input trigger registration and dispatch.
 */

const BROKER_GLOBAL_KEY = Symbol.for("@tryinget/pi-trigger-adapter.TriggerBroker/v1");
const BROKER_VERSION = 1;

function getGlobalBrokerCandidate() {
  return /** @type {any} */ (globalThis)[BROKER_GLOBAL_KEY];
}

/**
 * @param {TriggerBroker} broker
 * @returns {TriggerBroker}
 */
function setGlobalBrokerCandidate(broker) {
  /** @type {any} */ (globalThis)[BROKER_GLOBAL_KEY] = broker;
  return broker;
}

function clearGlobalBrokerCandidate() {
  delete (/** @type {any} */ (globalThis)[BROKER_GLOBAL_KEY]);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isCompatibleBroker(value) {
  const candidate = /** @type {any} */ (value);
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      candidate.__piTriggerBrokerVersion === BROKER_VERSION &&
      typeof candidate.setAPI === "function" &&
      typeof candidate.register === "function" &&
      typeof candidate.unregister === "function" &&
      typeof candidate.get === "function" &&
      typeof candidate.list === "function" &&
      typeof candidate.diagnostics === "function" &&
      typeof candidate.checkAndFire === "function" &&
      typeof candidate.clear === "function",
  );
}

/**
 * @typedef {(context: TriggerContext) => TriggerMatch|null} TriggerMatchFunction
 */

/**
 * @typedef {RegExp|string|TriggerMatchFunction} TriggerMatcher
 */

/**
 * @typedef {(match: TriggerMatch, context: TriggerContext, api: TriggerAPI) => Promise<void>|void} TriggerHandler
 */

/**
 * @typedef {Object} InputTrigger
 * @property {string} id - Unique identifier
 * @property {string} description - Human-readable description
 * @property {number} [priority=0] - Higher = checked first
 * @property {TriggerMatcher} match - Pattern matcher
 * @property {TriggerHandler} handler - Handler function
 * @property {boolean} [requireCursorAtEnd] - Only fire if cursor at end
 * @property {number} [debounceMs=100] - Debounce delay
 * @property {boolean} [showInPicker] - Show in manual picker
 * @property {string} [pickerLabel] - Label for picker
 * @property {string} [pickerDetail] - Detail for picker
 */

/**
 * @typedef {Object} TriggerContext
 * @property {string} fullText
 * @property {string} textBeforeCursor
 * @property {string} textAfterCursor
 * @property {number} cursorLine
 * @property {number} cursorColumn
 * @property {number} totalLines
 * @property {boolean} isLive
 * @property {string} [cwd]
 * @property {string} [sessionKey]
 */

/**
 * @typedef {Object} TriggerMatch
 * @property {string} matchedText
 * @property {number} startIndex
 * @property {number} endIndex
 * @property {string[]} [groups]
 * @property {Object.<string, string>} [namedGroups]
 * @property {*} [data]
 */

/**
 * @typedef {Object} TriggerAPI
 * @property {(text: string) => void} setText
 * @property {(text: string) => void} insertText
 * @property {(message: string, level?: "info"|"warning"|"error") => void} notify
 * @property {(title: string, options: string[]) => Promise<string|null|undefined>} select
 * @property {(title: string, message: string) => Promise<boolean>} confirm
 * @property {(title: string, placeholder?: string) => Promise<string|null|undefined>} input
 * @property {() => string} getText
 * @property {() => void} close
 * @property {*} ctx
 */

/**
 * @typedef {Object} RegisterTriggerOptions
 * @property {boolean} [skipIfExists]
 * @property {boolean} [replaceIfExists]
 * @property {boolean} [validate]
 */

/**
 * @typedef {Object} RegisterTriggerResult
 * @property {boolean} success
 * @property {string} id
 * @property {string} [error]
 * @property {string} [replaced]
 */

/**
 * @typedef {Object} TriggerDiagnostics
 * @property {string} id
 * @property {string} description
 * @property {number} priority
 * @property {string} matchType
 * @property {number} fireCount
 * @property {Date} [lastFired]
 * @property {string} [lastError]
 * @property {boolean} enabled
 */

/**
 * @typedef {InputTrigger & {
 *   fireCount: number,
 *   lastFired: Date|undefined,
 *   lastError: string|undefined,
 *   enabled: boolean,
 * }} RegisteredTrigger
 */

export class TriggerBroker {
  constructor() {
    Object.defineProperty(this, "__piTriggerBrokerVersion", {
      value: BROKER_VERSION,
      enumerable: false,
      configurable: true,
      writable: false,
    });
    /** @type {Map<string, RegisteredTrigger>} */
    this.triggers = new Map();
    /** @type {Map<string, ReturnType<typeof setTimeout>>} */
    this.debounceTimers = new Map();
    /** @type {TriggerAPI|null} */
    this.api = null;
  }

  /**
   * Set the TriggerAPI instance.
   * @param {TriggerAPI} api
   */
  setAPI(api) {
    this.api = api;
  }

  /**
   * Resolve the dispatch scope for a trigger fire.
   * @param {TriggerContext|undefined} context
   * @param {TriggerAPI|undefined|null} api
   * @returns {string}
   */
  getDispatchScopeKey(context, api) {
    const contextSessionKey =
      typeof context?.sessionKey === "string" ? context.sessionKey.trim() : "";
    if (contextSessionKey) return contextSessionKey;

    const apiCtx = api && typeof api === "object" ? api.ctx : undefined;
    const apiSessionKey =
      apiCtx && typeof apiCtx === "object" && typeof apiCtx.sessionKey === "string"
        ? apiCtx.sessionKey.trim()
        : "";
    if (apiSessionKey) return apiSessionKey;

    return "__global__";
  }

  /**
   * Build a debounce key that isolates timers by trigger id and dispatch scope.
   * @param {string} triggerId
   * @param {TriggerContext|undefined} context
   * @param {TriggerAPI|undefined|null} api
   * @returns {string}
   */
  buildDebounceKey(triggerId, context, api) {
    return `${triggerId}::${this.getDispatchScopeKey(context, api)}`;
  }

  /**
   * Clear any pending debounce timers for a trigger across all dispatch scopes.
   * @param {string} triggerId
   */
  clearDebounceTimersForTrigger(triggerId) {
    const prefix = `${triggerId}::`;
    for (const [key, timer] of this.debounceTimers.entries()) {
      if (key === triggerId || key.startsWith(prefix)) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }
    }
  }

  /**
   * Register a new trigger.
   * @param {InputTrigger} trigger
   * @param {RegisterTriggerOptions} [options]
   * @returns {RegisterTriggerResult}
   */
  register(trigger, options = {}) {
    const { skipIfExists = false, replaceIfExists = false, validate = true } = options;

    if (validate) {
      const error = this.validateTrigger(trigger);
      if (error) {
        return { success: false, id: trigger.id, error };
      }
    }

    const existing = this.triggers.get(trigger.id);
    if (existing) {
      if (skipIfExists) {
        return { success: true, id: trigger.id };
      }
      if (!replaceIfExists) {
        return {
          success: false,
          id: trigger.id,
          error: `Trigger '${trigger.id}' already exists. Use replaceIfExists=true to replace.`,
        };
      }
    }

    const registered = {
      ...trigger,
      priority: trigger.priority ?? 0,
      fireCount: existing?.fireCount ?? 0,
      lastFired: existing?.lastFired,
      lastError: undefined,
      enabled: true,
    };

    this.triggers.set(trigger.id, registered);

    return {
      success: true,
      id: trigger.id,
      replaced: existing ? trigger.id : undefined,
    };
  }

  /**
   * Unregister a trigger.
   * @param {string} id
   * @returns {boolean}
   */
  unregister(id) {
    this.clearDebounceTimersForTrigger(id);
    return this.triggers.delete(id);
  }

  /**
   * Get a trigger by ID.
   * @param {string} id
   * @returns {RegisteredTrigger|undefined}
   */
  get(id) {
    return this.triggers.get(id);
  }

  /**
   * List all registered triggers.
   * @returns {RegisteredTrigger[]}
   */
  list() {
    return Array.from(this.triggers.values());
  }

  /**
   * Get diagnostics for all triggers.
   * @returns {TriggerDiagnostics[]}
   */
  diagnostics() {
    return Array.from(this.triggers.values()).map((t) => ({
      id: t.id,
      description: t.description,
      priority: t.priority ?? 0,
      matchType: this.getMatchType(t.match),
      fireCount: t.fireCount,
      lastFired: t.lastFired,
      lastError: t.lastError,
      enabled: t.enabled,
    }));
  }

  /**
   * Enable/disable a trigger.
   * @param {string} id
   * @param {boolean} enabled
   * @returns {boolean}
   */
  setEnabled(id, enabled) {
    const trigger = this.triggers.get(id);
    if (!trigger) return false;
    trigger.enabled = enabled;
    return true;
  }

  /**
   * Check triggers against current context and fire matching ones.
   * @param {TriggerContext} context
   * @param {TriggerAPI} [apiOverride]
   * @returns {Promise<boolean>}
   */
  async checkAndFire(context, apiOverride) {
    const dispatchApi = apiOverride ?? this.api;
    if (!dispatchApi) {
      console.warn("[TriggerBroker] No API set, cannot fire triggers");
      return false;
    }

    const sorted = Array.from(this.triggers.values())
      .filter((t) => t.enabled)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const trigger of sorted) {
      const match = this.matchTrigger(trigger, context);
      if (match) {
        if (trigger.requireCursorAtEnd) {
          if (match.endIndex !== context.textBeforeCursor.length) {
            continue;
          }
        }

        const debounceMs = trigger.debounceMs ?? 100;
        if (debounceMs > 0) {
          const debounceKey = this.buildDebounceKey(trigger.id, context, dispatchApi);
          const existing = this.debounceTimers.get(debounceKey);
          if (existing) {
            clearTimeout(existing);
          }

          return new Promise((resolve) => {
            this.debounceTimers.set(
              debounceKey,
              setTimeout(async () => {
                this.debounceTimers.delete(debounceKey);
                const fired = await this.fireTrigger(trigger, match, context, dispatchApi);
                resolve(fired);
              }, debounceMs),
            );
          });
        } else {
          return this.fireTrigger(trigger, match, context, dispatchApi);
        }
      }
    }

    return false;
  }

  /**
   * Fire a specific trigger.
   * @param {RegisteredTrigger} trigger
   * @param {TriggerMatch} match
   * @param {TriggerContext} context
   * @param {TriggerAPI} [apiOverride]
   * @returns {Promise<boolean>}
   */
  async fireTrigger(trigger, match, context, apiOverride) {
    const api = apiOverride ?? this.api;
    if (!api) {
      trigger.lastError = "Trigger API not set";
      return false;
    }

    try {
      await trigger.handler(match, context, api);
      trigger.fireCount++;
      trigger.lastFired = new Date();
      trigger.lastError = undefined;
      return true;
    } catch (error) {
      trigger.lastError = error instanceof Error ? error.message : String(error);
      console.error(`[TriggerBroker] Trigger '${trigger.id}' error:`, error);
      return false;
    }
  }

  /**
   * Match a trigger against context.
   * @param {InputTrigger} trigger
   * @param {TriggerContext} context
   * @returns {TriggerMatch|null}
   */
  matchTrigger(trigger, context) {
    const matcher = trigger.match;

    if (typeof matcher === "function") {
      return matcher(context);
    }

    if (typeof matcher === "string") {
      if (context.textBeforeCursor.endsWith(matcher)) {
        return {
          matchedText: matcher,
          startIndex: context.textBeforeCursor.length - matcher.length,
          endIndex: context.textBeforeCursor.length,
        };
      }
      return null;
    }

    if (matcher instanceof RegExp) {
      const regex = new RegExp(matcher.source, matcher.flags);
      let lastMatch = null;

      let m;
      // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex match loop TODO(#1)
      while ((m = regex.exec(context.textBeforeCursor)) !== null) {
        lastMatch = {
          matchedText: m[0],
          startIndex: m.index,
          endIndex: m.index + m[0].length,
          groups: m.slice(1),
          namedGroups: m.groups,
        };
        if (!matcher.global) break;
      }

      if (lastMatch && lastMatch.endIndex === context.textBeforeCursor.length) {
        return lastMatch;
      }
      return null;
    }

    return null;
  }

  /**
   * Get match type for diagnostics.
   * @param {*} matcher
   * @returns {string}
   */
  getMatchType(matcher) {
    if (matcher instanceof RegExp) return "regex";
    if (typeof matcher === "string") return "prefix";
    return "custom";
  }

  /**
   * Validate a trigger definition.
   * @param {InputTrigger} trigger
   * @returns {string|null}
   */
  validateTrigger(trigger) {
    if (!trigger.id || typeof trigger.id !== "string") {
      return "Trigger must have a string id";
    }
    if (!trigger.id.match(/^[a-zA-Z0-9_-]+$/)) {
      return "Trigger id must match /^[a-zA-Z0-9_-]+$/";
    }
    if (!trigger.description || typeof trigger.description !== "string") {
      return "Trigger must have a string description";
    }
    if (!trigger.match) {
      return "Trigger must have a match pattern";
    }
    if (typeof trigger.handler !== "function") {
      return "Trigger must have a handler function";
    }
    return null;
  }

  /**
   * Clear all triggers.
   */
  clear() {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.triggers.clear();
  }
}

export function getBroker() {
  const existing = getGlobalBrokerCandidate();
  if (isCompatibleBroker(existing)) {
    return existing;
  }

  if (existing !== undefined) {
    clearGlobalBrokerCandidate();
  }

  return setGlobalBrokerCandidate(new TriggerBroker());
}

export function resetBroker() {
  const existing = getGlobalBrokerCandidate();
  if (isCompatibleBroker(existing)) {
    existing.clear();
  }
  clearGlobalBrokerCandidate();
}
