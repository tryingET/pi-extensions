// ---
// summary: "reads active Niri binding/action nodes with the KDL v1 grammar niri itself parses"
// read_when:
//   - "changing the conservative focus-strip hotkey discovery grammar"
// ---

// KDL v1 (what niri 26.04 parses): newlines terminate nodes; these spaces only separate entries.
const NEWLINE = /^(?:\r\n|[\n\r\f\u{85}\u{2028}\u{2029}])/u;
const SPACE = /^[\t \u{A0}\u{1680}\u{2000}-\u{200A}\u{202F}\u{205F}\u{3000}\u{FEFF}]+/u;
// A bare word: no control, space or newline character and none of KDL's `\/(){}<>;[]=,"`.
const WORD =
  /^[^\0-\x20\x7F-\x9F\u{A0}\u{1680}\u{2000}-\u{200A}\u{202F}\u{205F}\u{3000}\u{FEFF}\u{2028}\u{2029}\\/(){}<>;[\]=,"]+/u;
const NUMBER =
  /^[+-]?(?:[0-9][0-9_]*(?:\.[0-9][0-9_]*)?(?:[eE][+-]?[0-9][0-9_]*)?|0x[0-9a-fA-F][0-9a-fA-F_]*|0o[0-7][0-7_]*|0b[01][01_]*)$/;
const KEYWORDS = new Set(["true", "false", "null"]);
/** @type {Record<string, string>} */
const ESCAPES = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

/** @typedef {{kind: string; value: string; spaced: boolean}} Token */

/** @param {string} text @param {number} i @returns {number} index just past the comment */
function skipBlockComment(text, i) {
  let depth = 0;
  do {
    if (text.startsWith("/*", i)) {
      depth++;
      i += 2;
    } else if (text.startsWith("*/", i)) {
      depth--;
      i += 2;
    } else if (i < text.length) i++;
    else throw new Error("unterminated comment");
  } while (depth);
  return i;
}

/** @param {string} text @param {number} i @returns {number} index of the line's newline or end */
function skipLineComment(text, i) {
  while (i < text.length && !NEWLINE.test(text.slice(i, i + 1))) i++;
  return i;
}

/** `\` ws* (single-line comment | newline): joins a node's entries across lines.
 * @param {string} text @param {number} i @returns {number} */
function skipEscline(text, i) {
  i++;
  for (;;) {
    const space = text.slice(i).match(SPACE);
    if (space) i += space[0].length;
    else if (text.startsWith("/*", i)) i = skipBlockComment(text, i);
    else break;
  }
  if (text.startsWith("//", i)) i = skipLineComment(text, i);
  else if (!NEWLINE.test(text.slice(i))) throw new Error("unsupported continuation");
  return i + (text.slice(i).match(NEWLINE)?.[0].length ?? 0);
}

/** An escaped string with exactly KDL v1's escapes; literal newlines and tabs are content.
 * @param {string} text @param {number} i @returns {[string, number]} */
function readString(text, i) {
  let value = "";
  for (i++; ; ) {
    const c = text[i];
    if (c === undefined) throw new Error("unterminated string");
    if (c === '"') return [value, i + 1];
    if (c !== "\\") {
      value += c;
      i++;
      continue;
    }
    const unicode = text.slice(i).match(/^\\u\{([0-9a-fA-F]{1,6})\}/);
    const code = unicode ? Number.parseInt(unicode[1], 16) : -1;
    if (unicode && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
      value += String.fromCodePoint(code);
      i += unicode[0].length;
    } else if (Object.hasOwn(ESCAPES, text[i + 1])) {
      value += ESCAPES[text[i + 1]];
      i += 2;
    } else throw new Error("invalid string escape");
  }
}

/** Unsupported or malformed input yields no hint, never a guessed shortcut; nothing is evaluated.
 * @param {string} text @returns {Token[]} */
function tokenize(text) {
  if (text.length > 512 * 1024) throw new Error("config too large");
  /** @type {Token[]} */
  const tokens = [];
  let spaced = false;
  /** @param {string} kind @param {string} [value] */
  const push = (kind, value = kind) => {
    tokens.push({ kind, value, spaced });
    spaced = kind === "escline";
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const space = rest.match(SPACE);
    const newline = rest.match(NEWLINE);
    const raw = rest.match(/^r(#*)"/);
    const word = rest.match(WORD);
    if (space) {
      i += space[0].length;
      spaced = true;
    } else if (newline) {
      i += newline[0].length;
      push("newline");
    } else if (rest.startsWith("/*")) {
      i = skipBlockComment(text, i);
      spaced = true;
    } else if (rest.startsWith("//")) {
      i = skipLineComment(text, i);
    } else if (rest.startsWith("/-")) {
      i += 2;
      push("slashdash");
    } else if (rest[0] === "\\") {
      i = skipEscline(text, i);
      push("escline");
    } else if ("{};=".includes(rest[0])) {
      push(rest[0]);
      i++;
    } else if (raw) {
      const close = `"${raw[1]}`;
      const end = text.indexOf(close, i + raw[0].length);
      if (end < 0) throw new Error("unterminated raw string");
      push("raw", text.slice(i + raw[0].length, end));
      i = end + close.length;
    } else if (rest[0] === '"') {
      const [value, end] = readString(text, i);
      push("string", value);
      i = end;
    } else if (word) {
      // niri takes `!` only as a word's first character (after an optional sign). It joins a
      // byte-order mark to a preceding identifier; after a number or keyword the mark would be
      // whitespace, so refusing it there too only costs a hint.
      if (!/^[+-]?!?[^!]*$/.test(word[0]) || text[i + word[0].length] === "\u{FEFF}")
        throw new Error("unsupported KDL word");
      push("word", word[0]);
      i += word[0].length;
    } else throw new Error("unsupported KDL character");
  }
  push("eof");
  return tokens;
}

/** @typedef {{name: string; args: (string | null)[]; children: KdlNode[]}} KdlNode */
/** Active nodes of a config niri's KDL v1 parser accepts; any grammar error yields none.
 * Arguments keep string values; numbers and keywords become null and never match a command.
 * @param {string} text @returns {KdlNode[]} */
export function activeKdlNodes(text) {
  try {
    const tokens = tokenize(text);
    let i = 0;
    const peek = () => tokens[i];
    /** Node-space may hold line continuations; a node's own entries may span lines with them. */
    const skipEsclines = () => {
      while (peek().kind === "escline") i++;
    };
    /** niri takes raw strings as property keys but never as node names. */
    const identifier = (rawAllowed = false) => {
      const token = tokens[i++];
      if (token.kind === "string" || (rawAllowed && token.kind === "raw")) return token.value;
      const bare =
        token.kind === "word" && !KEYWORDS.has(token.value) && !/^[+-]?[0-9]/.test(token.value);
      if (!bare) throw new Error("expected KDL identifier");
      return token.value;
    };
    /** Bare identifiers are not values in KDL v1. */
    const value = () => {
      const token = tokens[i++];
      if (token.kind === "string" || token.kind === "raw") return token.value;
      if (token.kind === "word" && (KEYWORDS.has(token.value) || NUMBER.test(token.value)))
        return null;
      throw new Error("expected KDL value");
    };
    /** After a node only node-space, then `;`, a newline or the end; `}` is not a terminator. */
    const terminate = () => {
      skipEsclines();
      const end = peek().kind;
      if (end === "newline" || end === ";") i++;
      else if (end !== "eof") throw new Error("missing node terminator");
    };
    /** @param {number} depth @returns {KdlNode | null} */
    const node = (depth) => {
      const disabled = peek().kind === "slashdash";
      if (disabled) {
        i++;
        skipEsclines();
      }
      /** @type {KdlNode} */
      const result = { name: identifier(), args: [], children: [] };
      for (;;) {
        skipEsclines();
        const token = peek();
        if (["newline", ";", "eof", "}"].includes(token.kind)) break;
        const omit = token.kind === "slashdash";
        let ahead = i + (omit ? 1 : 0);
        while (tokens[ahead].kind === "escline") ahead++;
        if (tokens[ahead].kind === "{") {
          i = ahead + 1;
          const children = nodes(true, depth + 1);
          if (!omit) result.children = children;
          break;
        }
        if (!token.spaced) throw new Error("missing entry separator");
        if (omit) {
          i++;
          skipEsclines();
        }
        if (tokens[i + 1].kind === "=") {
          identifier(true);
          if (peek().spaced || tokens[i + 1].spaced) throw new Error("spaced property");
          i++;
          value();
        } else {
          const argument = value();
          if (!omit) result.args.push(argument);
        }
      }
      terminate();
      return disabled ? null : result;
    };
    /** @param {boolean} nested @param {number} depth @returns {KdlNode[]} */
    const nodes = (nested, depth) => {
      if (depth > 64) throw new Error("config too deep");
      /** @type {KdlNode[]} */
      const result = [];
      for (;;) {
        const { kind } = peek();
        if (kind === "newline") i++;
        else if (kind === "eof" || kind === "}") {
          if (nested !== (kind === "}")) throw new Error("unbalanced braces");
          i++;
          return result;
        } else {
          const parsed = node(depth);
          if (parsed) result.push(parsed);
        }
      }
    };
    return nodes(false, 0);
  } catch {
    return [];
  }
}

/** @param {KdlNode} action */
export function isFocusStripAction(action) {
  if (action.name !== "spawn") return false;
  const args = /(?:^|\/)node$/.test(action.args[0] ?? "") ? action.args.slice(1) : action.args;
  return /(?:^|\/)pi-activity-strip(?:\.mjs)?$/.test(args[0] ?? "") && args[1] === "focus-strip";
}
