/**
summary: "Shows repository-controlled text to the operator without letting it hide or restyle anything: counted markers on one line, every hidden character spelled out in a full view, and machine output kept to printable ASCII."
read_when:
  - "Rendering mode prompts, labels, paths or diagnostics that come from a repository."
*/

// What a terminal hides, blanks, garbles or reorders: controls (escape sequences start with one),
// format characters (bidirectional overrides, zero-width characters, the tag characters of "ASCII
// smuggling"), lone surrogates, unassigned code points, line and paragraph separators,
// default-ignorable characters (Hangul fillers, variation selectors) and the braille blank. The
// model still reads all of them. Private-use characters are left alone: they show as a glyph or box.
const HIDDEN_CLASS = String.raw`\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}⠀`;
const HIDDEN_RUN = new RegExp(`[${HIDDEN_CLASS}]+`, "gu");
// In the full view a literal bracket is spelled out too, so every ⟨…⟩ there is a marker.
const REVEALED = new RegExp(`([${HIDDEN_CLASS}]+)|([⟨⟩])`, "gu");
// Recognized emoji sequences (families, flags, keycaps) use joiners, selectors and tag characters by
// design and show as one visible emoji, so they are not flagged; arbitrary tag text is not RGI.
// biome-ignore lint/complexity/useRegexLiterals: as a literal the v flag needs an ES2024 target; Node 22 runs it.
const EMOJI = new RegExp(String.raw`(\p{RGI_Emoji})`, "v");
const LAYOUT = new Set(["\n", "\t"]);
// Tag characters mirror printable ASCII at U+E0020..U+E007E.
const TAG_OFFSET = 0xe0000;
const isPrintableTag = (code: number) => code >= 0xe0020 && code <= 0xe007e;

/** Applies `plain` to the text between recognized emoji sequences; CRLF counts as one line break. */
function outsideEmoji(text: string, plain: (part: string) => string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(EMOJI)
    .map((part, index) => (index % 2 === 1 ? part : plain(part)))
    .join("");
}

/** One line for a dialog or message: hidden characters become a visible, counted marker. */
export function displaySafe(text: string): string {
  return outsideEmoji(text, (part) =>
    part.replace(/[\t\n]+/g, " ").replace(HIDDEN_RUN, (run) => `⟨${[...run].length} hidden⟩`),
  ).trim();
}

/** Hidden characters in `text`, line breaks and tabs aside. */
export function countHiddenCharacters(text: string): number {
  let count = 0;
  outsideEmoji(text, (part) => {
    for (const match of part.replace(/[\t\n]/g, "").matchAll(HIDDEN_RUN)) {
      count += [...match[0]].length;
    }
    return part;
  });
  return count;
}

function codePoint(code: number): string {
  return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

function spellOut(run: string): string {
  const chars = [...run];
  let shown = "";
  for (let index = 0; index < chars.length; ) {
    const char = chars[index] as string;
    const code = char.codePointAt(0) ?? 0;
    if (LAYOUT.has(char)) {
      shown += char;
      index += 1;
    } else if (isPrintableTag(code)) {
      let decoded = "";
      for (let next = code; isPrintableTag(next); next = chars[index]?.codePointAt(0) ?? 0) {
        decoded += String.fromCodePoint(next - TAG_OFFSET);
        index += 1;
      }
      shown += `⟨tags ${JSON.stringify(decoded)}⟩`;
    } else {
      let repeat = 0;
      for (; index < chars.length && chars[index] === char; index += 1) repeat += 1;
      shown += `⟨${codePoint(code)}${repeat > 1 ? ` ×${repeat}` : ""}⟩`;
    }
  }
  return shown;
}

/**
 * A full view for review: line breaks and tabs stay, every other hidden character is spelled out by
 * code point (so an escape sequence becomes inert text), and runs of tag characters are decoded so a
 * smuggled instruction can be read.
 */
export function revealHidden(text: string): string {
  return outsideEmoji(text, (part) =>
    part.replace(REVEALED, (_match, run: string | undefined, bracket: string | undefined) =>
      run ? spellOut(run) : `⟨${codePoint(bracket?.codePointAt(0) ?? 0)}⟩`,
    ),
  );
}

/**
 * JSON for programs, which a person may also read in a terminal: everything outside printable ASCII
 * is escaped, and JSON.parse gives back the exact text.
 */
export function inertJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[^\x20-\x7e]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
