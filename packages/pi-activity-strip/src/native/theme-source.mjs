// ---
// summary: "finds Ghostty's config and theme files and tracks the desktop's light/dark preference"
// read_when:
//   - "changing Ghostty theme discovery, colour-scheme detection, or the ribbon's theme refresh"
// ---

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildRibbonPalette,
  parseGhosttyConfig,
  parseGhosttyTheme,
  parseThemeSetting,
} from "../common/ghostty-theme.mjs";

export const COLOR_SCHEME_TIMEOUT_MS = 2000;
/** The desktop portal's `color-scheme`: 1 asks for dark, 2 for light, 0 expresses no preference. */
const PORTAL_ARGS = [
  "call",
  "--session",
  "--dest",
  "org.freedesktop.portal.Desktop",
  "--object-path",
  "/org/freedesktop/portal/desktop",
  "--method",
  "org.freedesktop.portal.Settings.ReadOne",
  "org.freedesktop.appearance",
  "color-scheme",
];

/** @typedef {{readFile: (p: string) => string; exists: (p: string) => boolean; mtime: (p: string) => number}} ThemeFs */

/** @type {ThemeFs} */
export const nodeThemeFs = {
  readFile(filePath) {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return "";
    }
  },
  exists(filePath) {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  },
  mtime(filePath) {
    try {
      return fs.statSync(filePath).mtimeMs;
    } catch {
      return 0;
    }
  },
};

/**
 * Where Ghostty looks for its configuration, in the order it reads them.
 * @param {{env?: NodeJS.ProcessEnv; homeDir?: string}} [options]
 */
export function ghosttyConfigPaths({ env = process.env, homeDir = os.homedir() } = {}) {
  const explicit = String(env.GHOSTTY_CONFIG_PATH ?? "").trim();
  const configHome = String(env.XDG_CONFIG_HOME ?? "").trim() || path.join(homeDir, ".config");
  return [
    ...(explicit ? [explicit] : []),
    path.join(configHome, "ghostty", "config"),
    path.join(homeDir, ".config", "ghostty", "config"),
  ];
}

/**
 * Directories that can hold a named theme. A user theme wins, as it does in Ghostty itself, and
 * installed builds are searched because the current release may ship without the theme set.
 * @param {{env?: NodeJS.ProcessEnv; homeDir?: string; fs?: ThemeFs}} [options]
 */
export function themeDirectories({
  env = process.env,
  homeDir = os.homedir(),
  fs: fsImpl = nodeThemeFs,
} = {}) {
  const configHome = String(env.XDG_CONFIG_HOME ?? "").trim() || path.join(homeDir, ".config");
  const resources = String(env.GHOSTTY_RESOURCES_DIR ?? "").trim();
  const candidates = [
    path.join(configHome, "ghostty", "themes"),
    ...(resources ? [path.join(resources, "themes")] : []),
    path.join(homeDir, ".local", "share", "ghostty", "themes"),
    "/usr/share/ghostty/themes",
    "/usr/local/share/ghostty/themes",
  ];
  // Installed builds keep their own resources; the newest that actually carries themes wins.
  const optRoot = path.join(homeDir, ".local", "opt");
  try {
    for (const entry of fs.readdirSync(optRoot)) {
      if (!entry.startsWith("ghostty")) continue;
      for (const release of fs.readdirSync(path.join(optRoot, entry))) {
        candidates.push(path.join(optRoot, entry, release, "share", "ghostty", "themes"));
      }
    }
  } catch {
    // No local installs to search.
  }
  return candidates.filter((directory) => fsImpl.exists(directory));
}

/**
 * Ask the desktop which colour scheme it wants. An unavailable portal is not an error: the ribbon
 * then follows whichever single theme the config names.
 * @param {{execFileAsync: (file: string, args: string[], options: object) => Promise<{stdout?: string}>; env?: NodeJS.ProcessEnv; timeout?: number}} options
 * @returns {Promise<"dark" | "light" | "unknown">}
 */
export async function detectColorScheme({
  execFileAsync,
  env = process.env,
  timeout = COLOR_SCHEME_TIMEOUT_MS,
}) {
  // An explicit choice pins the ribbon to one scheme, for a desktop with no portal and for
  // checking how the other scheme looks without changing the whole session.
  const pinned = String(env.PI_ACTIVITY_STRIP_COLOR_SCHEME ?? "")
    .trim()
    .toLowerCase();
  if (pinned === "dark" || pinned === "light") return pinned;
  try {
    const { stdout } = await execFileAsync("gdbus", PORTAL_ARGS, { env, timeout });
    const match = String(stdout ?? "").match(/uint32\s+(\d+)/);
    if (!match) return "unknown";
    if (match[1] === "1") return "dark";
    if (match[1] === "2") return "light";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Resolve the palette Ghostty is presenting right now: the configured theme for the active colour
 * scheme, read from the same files the terminal reads. Colours defined directly in the config take
 * precedence over the theme, matching Ghostty's own layering.
 * @param {{scheme?: "dark" | "light" | "unknown"; env?: NodeJS.ProcessEnv; homeDir?: string; fs?: ThemeFs}} [options]
 */
export function resolveRibbonTheme({
  scheme = "unknown",
  env = process.env,
  homeDir = os.homedir(),
  fs: fsImpl = nodeThemeFs,
} = {}) {
  const configPath = ghosttyConfigPaths({ env, homeDir }).find((candidate) =>
    fsImpl.exists(candidate),
  );
  const configText = configPath ? fsImpl.readFile(configPath) : "";
  const config = parseGhosttyConfig(configText);
  const setting = parseThemeSetting((config.get("theme") ?? []).at(-1) ?? "");
  const themeName =
    scheme === "light" ? setting.light || setting.dark : setting.dark || setting.light;

  let themeText = "";
  let themePath = "";
  if (themeName) {
    for (const directory of themeDirectories({ env, homeDir, fs: fsImpl })) {
      const candidate = path.join(directory, themeName);
      if (!fsImpl.exists(candidate)) continue;
      themePath = candidate;
      themeText = fsImpl.readFile(candidate);
      if (themeText) break;
    }
  }

  const theme = parseGhosttyTheme(themeText);
  const inline = parseGhosttyTheme(configText);
  const merged = {
    background: inline.background || theme.background,
    foreground: inline.foreground || theme.foreground,
    cursor: inline.cursor || theme.cursor,
    selectionBackground: inline.selectionBackground || theme.selectionBackground,
    palette: theme.palette.map((color, index) => inline.palette[index] || color),
  };
  return {
    scheme,
    themeName,
    configPath: configPath ?? "",
    themePath,
    palette: buildRibbonPalette(merged),
  };
}

/**
 * Files whose modification should retrigger a resolve.
 * @param {{configPath?: string; themePath?: string} | null} resolved
 * @param {ThemeFs} [fsImpl]
 */
export function themeSourceFingerprint(resolved, fsImpl = nodeThemeFs) {
  return [resolved?.configPath, resolved?.themePath]
    .filter(Boolean)
    .map((filePath) => `${filePath}:${fsImpl.mtime(String(filePath))}`)
    .join("|");
}
