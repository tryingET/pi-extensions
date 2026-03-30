/**
 * Custom editor that integrates with the TriggerBroker.
 * Watches keystrokes and fires triggers when patterns match.
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { getBroker } from "@tryinget/pi-trigger-adapter";

/**
 * @typedef {{ line: number, col: number }} Cursor
 */

/**
 * @typedef {{
 *   notify?: (message: string, level?: "info"|"warning"|"error") => void,
 *   select?: (title: string, options: string[]) => Promise<string|null|undefined>,
 *   confirm?: (title: string, message: string) => Promise<boolean>,
 *   input?: (title: string, placeholder?: string) => Promise<string|null|undefined>,
 *   custom?: (factory: (tui: unknown, theme: unknown, kb: unknown, done: (value: unknown) => void) => unknown, options?: unknown) => Promise<unknown>,
 * }} TriggerEditorUI
 */

/**
 * @typedef {{
 *   fullText: string,
 *   textBeforeCursor: string,
 *   textAfterCursor: string,
 *   cursorLine: number,
 *   cursorColumn: number,
 *   totalLines: number,
 *   isLive: boolean,
 *   cwd?: string,
 *   sessionKey?: string,
 * }} TriggerContext
 */

/**
 * @typedef {{
 *   items: any[],
 *   prefix: string,
 * }} AutocompleteSuggestions
 */

/**
 * @typedef {{
 *   force: boolean,
 *   explicitTab: boolean,
 * }} AutocompleteRequestOptions
 */

const BaseCustomEditor = /** @type {any} */ (CustomEditor);
/** @type {Promise<any>|undefined} */
let selectListConstructorPromise;
let triggerEditorSessionCounter = 0;

/** @param {any} editor */
function isPasteInProgress(editor) {
  return Boolean(editor && (editor.isInPaste || editor.pasteBuffer));
}

function createTriggerEditorSessionKey() {
  triggerEditorSessionCounter += 1;
  return `trigger-editor-${triggerEditorSessionCounter}`;
}

/** @param {unknown} value */
function isPromiseLike(value) {
  const maybePromise = /** @type {{ then?: unknown }|null|undefined} */ (value);
  return Boolean(maybePromise && typeof maybePromise.then === "function");
}

/** @param {unknown} suggestions @returns {AutocompleteSuggestions|null} */
function normalizeAutocompleteSuggestions(suggestions) {
  if (!suggestions || typeof suggestions !== "object") return null;

  const candidate = /** @type {{ items?: unknown, prefix?: unknown }} */ (suggestions);
  if (!Array.isArray(candidate.items)) return null;

  return {
    items: candidate.items,
    prefix: typeof candidate.prefix === "string" ? candidate.prefix : "",
  };
}

async function loadSelectListConstructor() {
  if (!selectListConstructorPromise) {
    selectListConstructorPromise = (async () => {
      const piCodingAgentEntry = fileURLToPath(
        import.meta.resolve("@mariozechner/pi-coding-agent"),
      );
      const piCodingAgentRoot = path.resolve(path.dirname(piCodingAgentEntry), "..");
      const piScopeRoot = path.resolve(piCodingAgentRoot, "..");
      const piTuiEntry = path.join(piScopeRoot, "pi-tui", "dist", "index.js");
      const module = await import(pathToFileURL(piTuiEntry).href);
      return module.SelectList;
    })();
  }

  return selectListConstructorPromise;
}

export class TriggerEditor extends BaseCustomEditor {
  /** @type {number} */ autocompleteRequestId;
  /** @type {AbortController|undefined} */ autocompleteAbort;
  /** @type {unknown} */ lastAction;

  /**
   * @param {any} tui
   * @param {any} theme
   * @param {any} keybindings
   * @param {unknown} pi
   * @param {TriggerEditorUI|undefined} ui
   * @param {{ cwd?: string, sessionKey?: string }|undefined} sessionCtx
   */
  constructor(tui, theme, keybindings, pi, ui, sessionCtx) {
    super(tui, theme, keybindings);
    this.pi = pi;
    this.ui = ui;
    this.sessionCtx = sessionCtx;
    this.sessionKey = sessionCtx?.sessionKey || createTriggerEditorSessionKey();
    this.triggerApi = undefined;
    this.autocompleteRequestId = 0;
    this.autocompleteAbort = undefined;
    /** @type {import("@tryinget/pi-trigger-adapter").TriggerBroker} */
    this.broker = getBroker();
    this.broker.setAPI(this.createAPI());
  }

  /**
   * Create the TriggerAPI that handlers use to interact with the editor.
   */
  createAPI() {
    if (this.triggerApi) return this.triggerApi;

    this.triggerApi = {
      /** @param {string} text */
      setText: (text) => {
        this.setText(text);
      },

      /** @param {string} text */
      insertText: (text) => {
        /** @type {Cursor} */
        const cursor = this.getCursor();
        /** @type {string[]} */
        const lines = this.getLines();
        const line = lines[cursor.line] ?? "";
        const before = line.slice(0, cursor.col);
        const after = line.slice(cursor.col);
        lines[cursor.line] = before + text + after;
        this.setLines(lines);
        this.setCursor({ line: cursor.line, col: cursor.col + text.length });
      },

      /** @param {string} message @param {"info"|"warning"|"error"} [level] */
      notify: (message, level = "info") => {
        this.ui?.notify?.(message, level);
      },

      /** @param {string} title @param {string[]} options */
      select: async (title, options) => {
        return this.ui?.select?.(title, options) ?? null;
      },

      /** @param {string} title @param {string} message */
      confirm: async (title, message) => {
        return this.ui?.confirm?.(title, message) ?? false;
      },

      /** @param {string} title @param {string} [placeholder] */
      input: async (title, placeholder) => {
        return this.ui?.input?.(title, placeholder) ?? null;
      },

      /** @param {(tui: unknown, theme: unknown, kb: unknown, done: (value: unknown) => void) => unknown} factory @param {unknown} [options] */
      custom: async (factory, options) => {
        return this.ui?.custom?.(factory, options) ?? null;
      },

      getText: () => {
        return this.getLines().join("\n");
      },

      close: () => {
        // No-op for now
      },

      ctx: {
        pi: this.pi,
        cwd: this.sessionCtx?.cwd,
        sessionKey: this.sessionKey,
      },
    };

    return this.triggerApi;
  }

  /**
   * Get the current trigger context.
   * @param {boolean} isLive
   * @returns {TriggerContext}
   */
  getContext(isLive) {
    /** @type {Cursor} */
    const cursor = this.getCursor();
    /** @type {string[]} */
    const lines = this.getLines();
    const fullText = lines.join("\n");

    let textBeforeCursor = "";
    let textAfterCursor = "";

    for (let i = 0; i < lines.length; i++) {
      if (i < cursor.line) {
        textBeforeCursor += `${lines[i]}\n`;
      } else if (i === cursor.line) {
        textBeforeCursor += lines[i].slice(0, cursor.col);
        textAfterCursor = lines[i].slice(cursor.col);
      } else {
        textAfterCursor += `\n${lines[i]}`;
      }
    }

    return {
      fullText,
      textBeforeCursor,
      textAfterCursor,
      cursorLine: cursor.line,
      cursorColumn: cursor.col,
      totalLines: lines.length,
      isLive,
      cwd: this.sessionCtx?.cwd,
      sessionKey: this.sessionKey,
    };
  }

  cancelAutocompleteRequest() {
    this.autocompleteRequestId += 1;
    this.autocompleteAbort?.abort();
    this.autocompleteAbort = undefined;
  }

  cancelAutocomplete() {
    this.cancelAutocompleteRequest();
    super.cancelAutocomplete?.();
  }

  /**
   * @param {number} requestId
   * @param {AbortController} controller
   * @param {string} snapshotText
   * @param {number} snapshotLine
   * @param {number} snapshotCol
   */
  isAutocompleteRequestCurrent(requestId, controller, snapshotText, snapshotLine, snapshotCol) {
    return (
      !controller.signal.aborted &&
      requestId === this.autocompleteRequestId &&
      this.getText() === snapshotText &&
      this.state?.cursorLine === snapshotLine &&
      this.state?.cursorCol === snapshotCol
    );
  }

  /**
   * @param {AutocompleteRequestOptions} options
   * @param {AbortController} controller
   * @returns {Promise<AutocompleteSuggestions|null>}
   */
  async getAutocompleteSuggestions(options, controller) {
    const provider = this.autocompleteProvider;
    if (!provider) return null;

    const lines = this.state?.lines ?? [];
    const cursorLine = this.state?.cursorLine ?? 0;
    const cursorCol = this.state?.cursorCol ?? 0;

    let result;
    if (options.force && typeof provider.getForceFileSuggestions === "function") {
      result = provider.getForceFileSuggestions(lines, cursorLine, cursorCol);
    } else {
      result = provider.getSuggestions(lines, cursorLine, cursorCol, {
        signal: controller.signal,
        force: options.force,
      });
    }

    return normalizeAutocompleteSuggestions(isPromiseLike(result) ? await result : result);
  }

  /**
   * @param {AutocompleteSuggestions} suggestions
   * @param {"regular"|"force"} mode
   */
  async applyAutocompleteSuggestions(suggestions, mode) {
    const SelectList = await loadSelectListConstructor();
    this.autocompletePrefix = suggestions.prefix;
    this.autocompleteList = new SelectList(
      suggestions.items,
      this.autocompleteMaxVisible,
      this.theme.selectList,
    );
    this.autocompleteState = mode;
  }

  /**
   * @param {number} requestId
   * @param {AbortController} controller
   * @param {string} snapshotText
   * @param {number} snapshotLine
   * @param {number} snapshotCol
   * @param {AutocompleteRequestOptions} options
   */
  async runAutocompleteRequest(
    requestId,
    controller,
    snapshotText,
    snapshotLine,
    snapshotCol,
    options,
  ) {
    const provider = this.autocompleteProvider;
    if (!provider) return;

    let suggestions;
    try {
      suggestions = await this.getAutocompleteSuggestions(options, controller);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("[TriggerEditor] Error resolving autocomplete suggestions:", error);
      this.cancelAutocomplete();
      this.tui?.requestRender?.();
      return;
    }

    if (
      !this.isAutocompleteRequestCurrent(
        requestId,
        controller,
        snapshotText,
        snapshotLine,
        snapshotCol,
      )
    ) {
      return;
    }

    this.autocompleteAbort = undefined;

    if (!suggestions || suggestions.items.length === 0) {
      super.cancelAutocomplete?.();
      this.tui?.requestRender?.();
      return;
    }

    if (options.force && options.explicitTab && suggestions.items.length === 1) {
      const item = suggestions.items[0];
      this.pushUndoSnapshot?.();
      this.lastAction = null;
      const result = this.autocompleteProvider.applyCompletion(
        this.state.lines,
        this.state.cursorLine,
        this.state.cursorCol,
        item,
        suggestions.prefix,
      );
      this.state.lines = result.lines;
      this.state.cursorLine = result.cursorLine;
      this.setCursorCol?.(result.cursorCol);
      if (this.onChange) this.onChange(this.getText());
      this.tui?.requestRender?.();
      return;
    }

    await this.applyAutocompleteSuggestions(suggestions, options.force ? "force" : "regular");
    this.tui?.requestRender?.();
  }

  /** @param {AutocompleteRequestOptions} options */
  requestAutocomplete(options) {
    const provider = this.autocompleteProvider;
    if (!provider) return;

    if (options.force) {
      const shouldTrigger =
        !provider.shouldTriggerFileCompletion ||
        provider.shouldTriggerFileCompletion(
          this.state.lines,
          this.state.cursorLine,
          this.state.cursorCol,
        );
      if (!shouldTrigger) return;
    }

    this.cancelAutocompleteRequest();

    const controller = new AbortController();
    this.autocompleteAbort = controller;
    const requestId = ++this.autocompleteRequestId;
    const snapshotText = this.getText();
    const snapshotLine = this.state.cursorLine;
    const snapshotCol = this.state.cursorCol;

    void this.runAutocompleteRequest(
      requestId,
      controller,
      snapshotText,
      snapshotLine,
      snapshotCol,
      options,
    );
  }

  tryTriggerAutocomplete(explicitTab = false) {
    this.requestAutocomplete({ force: false, explicitTab });
  }

  forceFileAutocomplete(explicitTab = false) {
    this.requestAutocomplete({ force: true, explicitTab });
  }

  updateAutocomplete() {
    if (!this.autocompleteState || !this.autocompleteProvider) return;
    this.requestAutocomplete({ force: this.autocompleteState === "force", explicitTab: false });
  }

  /** @param {string} data */
  isInterruptInput(data) {
    const keybindings = this.keybindings;
    if (!keybindings || typeof keybindings.matches !== "function") return false;

    return keybindings.matches(data, "app.interrupt");
  }

  /**
   * Override handleInput to check triggers on keystroke.
   * @param {string} data
   */
  handleInput(data) {
    if (this.isInterruptInput(data)) {
      if (this.isShowingAutocomplete?.()) {
        this.cancelAutocomplete();
        return;
      }

      const handler = this.onEscape ?? this.actionHandlers?.get?.("app.interrupt");
      if (handler) {
        handler();
        return;
      }
    }

    super.handleInput(data);

    if (isPasteInProgress(this)) {
      return;
    }

    if (this.isInterruptInput(data)) {
      return;
    }

    const context = this.getContext(true);
    this.broker.checkAndFire(context, this.createAPI()).catch((error) => {
      console.error("[TriggerEditor] Error checking triggers:", error);
    });
  }

  /**
   * Override handleTabCompletion to check triggers.
   */
  handleTabCompletion() {
    const context = this.getContext(true);
    this.broker.checkAndFire(context, this.createAPI()).catch((error) => {
      console.error("[TriggerEditor] Error checking triggers on tab:", error);
    });

    if (!this.autocompleteProvider) return;

    const currentLine = this.state.lines[this.state.cursorLine] || "";
    const beforeCursor = currentLine.slice(0, this.state.cursorCol);

    if (this.isInSlashCommandContext(beforeCursor) && !beforeCursor.trimStart().includes(" ")) {
      this.tryTriggerAutocomplete(true);
    } else {
      this.forceFileAutocomplete(true);
    }
  }

  /**
   * Called when user presses Enter (before submit).
   * @returns {boolean}
   */
  allowSubmit() {
    // Context available for future validation
    return true;
  }
}
