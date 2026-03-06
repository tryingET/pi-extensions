/**
 * Custom editor that integrates with the TriggerBroker.
 * Watches keystrokes and fires triggers when patterns match.
 */

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
 * }} TriggerContext
 */

const BaseCustomEditor = /** @type {any} */ (CustomEditor);

export class TriggerEditor extends BaseCustomEditor {
  /**
   * @param {any} tui
   * @param {any} theme
   * @param {any} keybindings
   * @param {unknown} pi
   * @param {TriggerEditorUI|undefined} ui
   */
  constructor(tui, theme, keybindings, pi, ui) {
    super(tui, theme, keybindings);
    this.pi = pi;
    this.ui = ui;
    /** @type {import("@tryinget/pi-trigger-adapter").TriggerBroker} */
    this.broker = getBroker();
    this.broker.setAPI(this.createAPI());
  }

  /**
   * Create the TriggerAPI that handlers use to interact with the editor.
   */
  createAPI() {
    return {
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

      getText: () => {
        return this.getLines().join("\n");
      },

      close: () => {
        // No-op for now
      },

      ctx: this.pi,
    };
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
    };
  }

  /**
   * Override handleInput to check triggers on keystroke.
   * @param {string} data
   */
  handleInput(data) {
    super.handleInput(data);

    const context = this.getContext(true);
    this.broker.checkAndFire(context).catch((error) => {
      console.error("[TriggerEditor] Error checking triggers:", error);
    });
  }

  /**
   * Override handleTabCompletion to check triggers.
   */
  handleTabCompletion() {
    const context = this.getContext(true);
    this.broker.checkAndFire(context).catch((error) => {
      console.error("[TriggerEditor] Error checking triggers on tab:", error);
    });

    super.handleTabCompletion();
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
