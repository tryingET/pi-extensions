import { lower, rankCandidatesFallback } from "./core.js";

/** @typedef {{id:string,label:string,detail:string,preview?:string,source?:string,[key:string]:unknown}} Candidate */
/** @typedef {{requestRender:()=>void}} OverlayTui */
/** @typedef {{fg:(name:string,text:string)=>string,bold:(text:string)=>string}} OverlayThemeApi */
/** @typedef {{accent:(text:string)=>string,muted:(text:string)=>string,dim:(text:string)=>string,match:(text:string)=>string,border:(text:string)=>string,bold:(text:string)=>string}} SelectorTheme */
/** @typedef {{matches:(data:string,keyName:string)=>boolean}} EditorKeybindings */
/** @typedef {new () => {focused:boolean,handleInput:(data:string)=>void,getValue:()=>string,render:(width:number)=>string[],invalidate:()=>void}} InputCtor */
/** @typedef {{custom?: (factory:(tui:OverlayTui,theme:OverlayThemeApi,kb:unknown,done:(value:unknown)=>void)=>{render:(width:number)=>string[],invalidate:()=>void,handleInput:(data:string)=>void,focused:boolean},options?:unknown)=>Promise<unknown>}} OverlayUI */
/** @typedef {{title:string,query?:string,maxOptions?:number,ui?:OverlayUI,onQueryChange?:(query:string)=>void}} OverlayOptions */

/** @type {(name: string) => string} */
let editorKey = (name) => name;
/** @type {new (...args: any[]) => { invalidate: () => void }} */
let Container = class {
  invalidate() {}
};

/** @param {unknown} text @param {number} width */
const defaultTruncateToWidth = (text, width) =>
  !Number.isFinite(width) || width <= 0 ? "" : String(text ?? "").slice(0, width);
/** @param {unknown} text */
const defaultVisibleWidth = (text) => String(text ?? "").length;

const ESC = "\\u001b";
const KITTY_KEY_RE = new RegExp(`^${ESC}\\[(\\d+)(?::\\d*)?(?::\\d+)?(?:;(\\d+))?(?::(\\d+))?u$`);
const DELETE_RE = new RegExp(`^${ESC}\\[3(?:;\\d+(?::\\d+)?)?~$`);
const PAGE_UP_RE = new RegExp(`^${ESC}\\[5(?:;\\d+(?::\\d+)?)?~$`);
const PAGE_DOWN_RE = new RegExp(`^${ESC}\\[6(?:;\\d+(?::\\d+)?)?~$`);

/** @param {string} data */
function parseKittyKey(data) {
  const m = typeof data === "string" ? data.match(KITTY_KEY_RE) : null;
  if (!m) return null;
  return {
    codepoint: Number(m[1]),
    modifier: m[2] ? Number(m[2]) : 1,
    eventType: m[3] ? Number(m[3]) : 1,
  };
}

/** @param {string} data */
function isDeleteSequence(data) {
  return typeof data === "string" && DELETE_RE.test(data);
}

/** @type {Record<"A"|"B"|"C"|"D", RegExp>} */
const ARROW_RE = {
  A: new RegExp(`^${ESC}\\[1;\\d+(?::\\d+)?A$`),
  B: new RegExp(`^${ESC}\\[1;\\d+(?::\\d+)?B$`),
  C: new RegExp(`^${ESC}\\[1;\\d+(?::\\d+)?C$`),
  D: new RegExp(`^${ESC}\\[1;\\d+(?::\\d+)?D$`),
};

/** @param {string} data @param {"A"|"B"|"C"|"D"} dir */
function isArrowSequence(data, dir) {
  const re = ARROW_RE[dir];
  return typeof data === "string" && Boolean(re?.test(data));
}

/** @param {string} data */
function isCtrlC(data) {
  if (data === "\x03") return true;
  const kitty = parseKittyKey(data);
  return Boolean(
    kitty && kitty.modifier >= 5 && (kitty.codepoint === 99 || kitty.codepoint === 67),
  );
}

class DefaultInput {
  constructor() {
    this.value = "";
    this.focused = false;
  }

  /** @param {string} data */
  handleInput(data) {
    if (typeof data !== "string") return;
    const kitty = parseKittyKey(data);
    if (kitty && kitty.eventType === 3) return;

    if (
      data === "\u0008" ||
      data === "\u007f" ||
      (kitty && (kitty.codepoint === 8 || kitty.codepoint === 127))
    ) {
      this.value = this.value.slice(0, -1);
      return;
    }

    if (data === "\r" || data === "\n" || (kitty && kitty.codepoint === 13)) return;
    if (data === "\u001b" || (kitty && kitty.codepoint === 27)) return;

    if (kitty) {
      if (kitty.codepoint === 117 && kitty.modifier >= 5) {
        this.value = "";
        return;
      }
      if (kitty.modifier <= 2 && kitty.codepoint >= 32 && kitty.codepoint <= 0x10ffff) {
        this.value += String.fromCodePoint(kitty.codepoint);
      }
      return;
    }

    if (data.startsWith("\u001b")) return;
    this.value += data;
  }

  getValue() {
    return this.value;
  }

  /** @param {number} width */
  render(width) {
    return [defaultTruncateToWidth(`> ${this.value}`, width)];
  }

  invalidate() {}
}

/** @type {InputCtor} */
let Input = /** @type {InputCtor} */ (DefaultInput);
let truncateToWidth = defaultTruncateToWidth;
let visibleWidth = defaultVisibleWidth;

/** @type {() => EditorKeybindings} */
let getEditorKeybindings = () => {
  /** @type {Record<string, string[]>} */
  const keyMap = {
    selectUp: ["\u001b[A"],
    selectDown: ["\u001b[B"],
    selectPageUp: ["\u001b[5~"],
    selectPageDown: ["\u001b[6~"],
    selectConfirm: ["\r", "\n"],
    selectCancel: ["\u001b"],
    deleteCharBackward: ["\x7f", "\b"],
    deleteCharForward: ["\x1b[3~"],
  };

  return {
    /** @param {string} data @param {string} keyName */
    matches(data, keyName) {
      if ((keyMap[keyName] ?? []).includes(data)) return true;
      const kitty = parseKittyKey(data);
      if (kitty && kitty.eventType === 3) return false;

      switch (keyName) {
        case "selectUp":
          return isArrowSequence(data, "A");
        case "selectDown":
          return isArrowSequence(data, "B");
        case "selectPageUp":
          return PAGE_UP_RE.test(data);
        case "selectPageDown":
          return PAGE_DOWN_RE.test(data);
        case "selectConfirm":
          return Boolean(kitty && kitty.codepoint === 13);
        case "selectCancel":
          return Boolean(
            kitty && (kitty.codepoint === 27 || (kitty.codepoint === 91 && kitty.modifier >= 5)),
          );
        case "deleteCharBackward":
          return Boolean(
            kitty &&
              (kitty.codepoint === 8 ||
                kitty.codepoint === 127 ||
                (kitty.codepoint === 104 && kitty.modifier >= 5)),
          );
        case "deleteCharForward":
          return isDeleteSequence(data);
        default:
          return false;
      }
    },
  };
};

try {
  const codingAgent = /** @type {{ editorKey?: (name: string) => string }} */ (
    await import("@mariozechner/pi-coding-agent")
  );
  if (typeof codingAgent.editorKey === "function") editorKey = codingAgent.editorKey;
} catch (_error) {
  // test runtime
}

try {
  const piTui = /** @type {{
   * Container?: new (...args: any[]) => { invalidate: () => void },
   * getEditorKeybindings?: () => EditorKeybindings,
   * Input?: InputCtor,
   * truncateToWidth?: (text: unknown, width: number) => string,
   * visibleWidth?: (text: unknown) => number,
   * }} */ (await import("@mariozechner/pi-tui"));

  if (typeof piTui.Container === "function") Container = piTui.Container;
  if (typeof piTui.getEditorKeybindings === "function")
    getEditorKeybindings = piTui.getEditorKeybindings;
  if (typeof piTui.Input === "function") Input = /** @type {InputCtor} */ (piTui.Input);
  if (typeof piTui.truncateToWidth === "function") truncateToWidth = piTui.truncateToWidth;
  if (typeof piTui.visibleWidth === "function") visibleWidth = piTui.visibleWidth;
} catch (_error) {
  // test runtime
}

/** @param {string} key */
function prettyKey(key) {
  /** @type {Record<string, string>} */
  const symbols = { up: "↑", down: "↓", left: "←", right: "→", enter: "⏎", escape: "esc" };
  return String(key)
    .split("/")
    .map((part) => symbols[part] ?? part)
    .join("/");
}

/** @param {unknown} content @param {number} innerWidth @param {string} side */
function boxLine(content, innerWidth, side) {
  const safe = truncateToWidth(String(content ?? ""), Math.max(0, innerWidth));
  const width = visibleWidth(safe);
  return side + safe + " ".repeat(Math.max(0, innerWidth - width)) + side;
}

/** @param {Candidate} candidate */
function renderCandidateLine(candidate) {
  return candidate.detail ? `${candidate.label} — ${candidate.detail}` : candidate.label;
}

/** @param {string} text @param {string} query @param {(value: string) => string} matchFn */
function highlightQuery(text, query, matchFn) {
  const normalizedQuery = lower(query);
  if (!normalizedQuery) return text;
  const index = text.toLowerCase().indexOf(normalizedQuery);
  if (index < 0) return text;
  return `${text.slice(0, index)}${matchFn(text.slice(index, index + normalizedQuery.length))}${text.slice(index + normalizedQuery.length)}`;
}

const BaseContainer = /** @type {any} */ (Container);

class InteractiveFuzzySelector extends BaseContainer {
  /** @param {Candidate[]} candidates @param {string} title @param {number} maxVisible @param {string} initialQuery @param {SelectorTheme} selectorTheme */
  constructor(candidates, title, maxVisible, initialQuery, selectorTheme) {
    super();
    this.candidates = [...candidates];
    this.filtered = [...candidates];
    this.title = title;
    this.maxVisible = Math.max(1, maxVisible);
    this.selectorTheme = selectorTheme;
    this.selectedIndex = 0;
    this.query = "";
    this.input = new Input();
    this._focused = false;
    /** @type {((candidate: Candidate) => void)|undefined} */
    this.onSelect = undefined;
    /** @type {(() => void)|undefined} */
    this.onCancel = undefined;
    /** @type {((query: string) => void)|undefined} */
    this.onQueryChange = undefined;

    if (initialQuery) {
      for (const char of initialQuery) this.input.handleInput(char);
      this.applyFilter(this.input.getValue());
    }
  }

  get focused() {
    return this._focused;
  }

  /** @param {boolean} value */
  set focused(value) {
    this._focused = value;
    this.input.focused = value;
  }

  /** @param {string} data */
  handleInput(data) {
    const kb = getEditorKeybindings();

    if (kb.matches(data, "selectUp")) {
      if (this.filtered.length > 0)
        this.selectedIndex =
          this.selectedIndex === 0 ? this.filtered.length - 1 : this.selectedIndex - 1;
      return;
    }

    if (kb.matches(data, "selectDown")) {
      if (this.filtered.length > 0)
        this.selectedIndex =
          this.selectedIndex === this.filtered.length - 1 ? 0 : this.selectedIndex + 1;
      return;
    }

    if (kb.matches(data, "selectPageUp")) {
      if (this.filtered.length > 0)
        this.selectedIndex = Math.max(0, this.selectedIndex - this.maxVisible);
      return;
    }

    if (kb.matches(data, "selectPageDown")) {
      if (this.filtered.length > 0)
        this.selectedIndex = Math.min(
          this.filtered.length - 1,
          this.selectedIndex + this.maxVisible,
        );
      return;
    }

    if (kb.matches(data, "selectConfirm")) {
      const current = this.filtered[this.selectedIndex];
      if (current) this.onSelect?.(current);
      return;
    }

    if (kb.matches(data, "selectCancel")) {
      this.onCancel?.();
      return;
    }

    if (data === "\x7f" || data === "\b" || kb.matches(data, "deleteCharBackward")) {
      const before = this.input.getValue();
      this.input.handleInput("\x7f");
      const after = this.input.getValue();
      if (after !== before) {
        this.applyFilter(after);
        this.onQueryChange?.(after);
      }
      return;
    }

    if (data === "\x1b[3~" || kb.matches(data, "deleteCharForward")) {
      const before = this.input.getValue();
      this.input.handleInput("\x7f");
      const after = this.input.getValue();
      if (after !== before) {
        this.applyFilter(after);
        this.onQueryChange?.(after);
      }
      return;
    }

    if (isCtrlC(data)) {
      this.onCancel?.();
      return;
    }

    if (data === "\x15") {
      const before = this.input.getValue();
      this.input.handleInput("\x15");
      const after = this.input.getValue();
      if (after !== before) {
        this.applyFilter(after);
        this.onQueryChange?.(after);
      }
      return;
    }

    const before = this.input.getValue();
    this.input.handleInput(data);
    const after = this.input.getValue();
    if (after !== before) {
      this.applyFilter(after);
      this.onQueryChange?.(after);
    }
  }

  /** @param {string} query */
  applyFilter(query) {
    this.query = String(query ?? "");
    this.filtered = rankCandidatesFallback(this.candidates, this.query);
    if (this.filtered.length === 0) {
      this.selectedIndex = 0;
      return;
    }
    if (this.selectedIndex >= this.filtered.length) this.selectedIndex = this.filtered.length - 1;
  }

  /** @param {number} width */
  render(width) {
    const t = this.selectorTheme;
    const lines = [];
    const innerWidth = Math.max(1, width - 2);
    const side = t.border("│");

    lines.push(t.border("╭") + t.border("─".repeat(innerWidth)) + t.border("╮"));
    lines.push(
      boxLine(
        ` ${this.title} • ${this.query ? `query="${this.query}"` : "query=(empty)"}`,
        innerWidth,
        side,
      ),
    );

    for (const inputLine of this.input.render(innerWidth))
      lines.push(boxLine(inputLine, innerWidth, side));
    lines.push(t.border("├") + t.border("─".repeat(innerWidth)) + t.border("┤"));

    if (this.filtered.length === 0) {
      lines.push(boxLine("  No matches", innerWidth, side));
    } else {
      const total = this.filtered.length;
      const visible = Math.min(this.maxVisible, total);
      const start = Math.max(
        0,
        Math.min(this.selectedIndex - Math.floor(visible / 2), total - visible),
      );
      const end = Math.min(start + visible, total);

      for (let index = start; index < end; index++) {
        const entry = this.filtered[index];
        const prefix = index === this.selectedIndex ? "→ " : "  ";
        lines.push(
          boxLine(
            `${prefix}${highlightQuery(renderCandidateLine(entry), this.query, (chunk) => chunk)}`,
            innerWidth,
            side,
          ),
        );
      }
      if (total > visible)
        lines.push(boxLine(`  (${this.selectedIndex + 1}/${total})`, innerWidth, side));
    }

    const up = prettyKey(editorKey("selectUp"));
    const down = prettyKey(editorKey("selectDown"));
    const confirm = prettyKey(editorKey("selectConfirm"));
    const cancel = prettyKey(editorKey("selectCancel"));
    lines.push(
      boxLine(` ${up} ${down} navigate • ${confirm} select • ${cancel} cancel`, innerWidth, side),
    );
    lines.push(t.border("╰") + t.border("─".repeat(innerWidth)) + t.border("╯"));
    return lines;
  }

  invalidate() {
    super.invalidate();
    this.input.invalidate();
  }
}

/** @param {Candidate[]} candidates @param {OverlayOptions} options @returns {Promise<Candidate|null>} */
export async function selectWithInteractiveOverlay(candidates, options) {
  const ui = options.ui;
  if (!ui || typeof ui.custom !== "function") return null;

  const result = await ui.custom((tui, theme, _kb, done) => {
    const selectorTheme = /** @type {SelectorTheme} */ ({
      accent: (text) => theme.fg("accent", text),
      muted: (text) => theme.fg("muted", text),
      dim: (text) => theme.fg("dim", text),
      match: (text) => theme.fg("warning", theme.bold(text)),
      border: (text) => theme.fg("border", text),
      bold: (text) => theme.bold(text),
    });

    const selector = new InteractiveFuzzySelector(
      candidates,
      options.title,
      Math.max(1, Math.min(options.maxOptions ?? 25, 15)),
      options.query ?? "",
      selectorTheme,
    );

    selector.onSelect = (candidate) => done(candidate);
    selector.onCancel = () => done(null);
    selector.onQueryChange = (query) => options.onQueryChange?.(query);

    return {
      /** @param {number} width */
      render(width) {
        return selector.render(width);
      },
      invalidate() {
        selector.invalidate();
      },
      /** @param {string} data */
      handleInput(data) {
        selector.handleInput(data);
        tui.requestRender();
      },
      get focused() {
        return selector.focused;
      },
      /** @param {boolean} value */
      set focused(value) {
        selector.focused = value;
      },
    };
  });

  return /** @type {Candidate|null} */ (result ?? null);
}
