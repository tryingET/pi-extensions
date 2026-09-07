// ---
// summary: "resolves the colours Ghostty is currently using into the ribbon's palette"
// read_when:
//   - "changing how the ribbon follows the Ghostty theme or the day/night switch"
// ---

/**
 * Ghostty writes its palette as `key = value` lines, in its config and in each theme file. A theme
 * setting may name one theme, or one per colour scheme as `light:Name,dark:Name`. The ribbon reads
 * the same files the terminal does, so the two always agree without any configuration of its own.
 */

const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const PALETTE_SIZE = 16;

/** @typedef {{background: string; foreground: string; accent: string; thinking: string; tool: string; waiting: string; success: string; error: string}} RibbonPalette */

/** Everforest-neutral defaults, used only when no theme can be read. */
/** @type {RibbonPalette} */
export const FALLBACK_PALETTE = Object.freeze({
  background: "#1e2326",
  foreground: "#d3c6aa",
  accent: "#7fbbb3",
  thinking: "#7fbbb3",
  tool: "#dbbc7f",
  waiting: "#e69875",
  success: "#a7c080",
  error: "#e67e80",
});

/** @param {unknown} value */
export function normalizeHexColor(value) {
  const raw = String(value ?? "").trim();
  if (!HEX_COLOR.test(raw)) return "";
  const body = raw.replace(/^#/, "").toLowerCase();
  const full =
    body.length === 3
      ? body
          .split("")
          .map((character) => character + character)
          .join("")
      : body;
  return `#${full}`;
}

/**
 * Read every `key = value` pair, ignoring comments and blank lines. Repeated keys are kept in
 * order, because `palette` appears once per colour index.
 * @param {string} text
 */
export function parseGhosttyConfig(text) {
  /** @type {Map<string, string[]>} */
  const entries = new Map();
  for (const line of String(text ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim().toLowerCase();
    const value = trimmed.slice(separator + 1).trim();
    entries.set(key, [...(entries.get(key) ?? []), value]);
  }
  return entries;
}

/**
 * Names of the themes a config selects. `light:A,dark:B` follows the desktop's colour scheme; a
 * bare name is used for both.
 * @param {string} value
 * @returns {{light: string; dark: string}}
 */
export function parseThemeSetting(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { light: "", dark: "" };
  if (!/(^|,)\s*(light|dark)\s*:/i.test(raw)) return { light: raw, dark: raw };
  const themes = { light: "", dark: "" };
  for (const part of raw.split(",")) {
    const match = part.match(/^\s*(light|dark)\s*:\s*(.+?)\s*$/i);
    if (match) themes[match[1].toLowerCase() === "dark" ? "dark" : "light"] = match[2];
  }
  return themes;
}

/**
 * Colours from a theme file or a config that carries them inline.
 * @param {string} text
 */
export function parseGhosttyTheme(text) {
  const entries = parseGhosttyConfig(text);
  /** @type {string[]} */
  const palette = new Array(PALETTE_SIZE).fill("");
  for (const value of entries.get("palette") ?? []) {
    const match = String(value).match(/^\s*(\d+)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const index = Number.parseInt(match[1], 10);
    const color = normalizeHexColor(match[2]);
    if (Number.isInteger(index) && index >= 0 && index < PALETTE_SIZE && color) {
      palette[index] = color;
    }
  }
  /** @param {string} key */
  const single = (key) => normalizeHexColor((entries.get(key) ?? []).at(-1));
  return {
    background: single("background"),
    foreground: single("foreground"),
    cursor: single("cursor-color"),
    selectionBackground: single("selection-background"),
    palette,
  };
}

/** @param {ReturnType<typeof parseGhosttyTheme>} theme @param {number} index @param {string} fallback */
function paletteColor(theme, index, fallback) {
  return theme?.palette?.[index] || fallback;
}

/**
 * Map terminal colours onto the ribbon's roles. State colours reuse the terminal's own semantics,
 * so a card reads the same way as output in the tab it points at: green settled, yellow working,
 * red failed, and the cursor colour for a session that wants the operator.
 * @param {ReturnType<typeof parseGhosttyTheme> | null} theme
 * @returns {RibbonPalette}
 */
export function buildRibbonPalette(theme) {
  if (!theme?.background || !theme?.foreground) return { ...FALLBACK_PALETTE };
  const blue = paletteColor(theme, 4, FALLBACK_PALETTE.thinking);
  return {
    background: theme.background,
    foreground: theme.foreground,
    accent: blue,
    thinking: blue,
    tool: paletteColor(theme, 3, FALLBACK_PALETTE.tool),
    waiting: theme.cursor || paletteColor(theme, 5, FALLBACK_PALETTE.waiting),
    success: paletteColor(theme, 2, FALLBACK_PALETTE.success),
    error: paletteColor(theme, 1, FALLBACK_PALETTE.error),
  };
}

/**
 * The GTK colour definitions the panel prepends to its stylesheet. Everything else the ribbon
 * draws is derived from these in CSS, so a theme change is a handful of values.
 * @param {RibbonPalette} palette
 */
export function paletteDefinitions(palette) {
  const colors = { ...FALLBACK_PALETTE, ...(palette ?? {}) };
  return Object.entries(colors)
    .map(([name, value]) => `@define-color pi_${name} ${normalizeHexColor(value) || "#000000"};`)
    .join("\n");
}
