// ---
// summary: "finds the compositor shortcut that enters the strip's keyboard mode, for the panel's hints"
// read_when:
//   - "changing how the strip learns or shows its keyboard-entry shortcut"
// ---

import { readFileSync as nodeReadFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { activeKdlNodes, isFocusStripAction } from "./strip-hotkey-kdl.mjs";

/**
 * The bind whose action runs this package's `focus-strip` command. Niri binds are KDL nodes named
 * by their chord, `Mod+Shift+A repeat=false { spawn "node" ".../pi-activity-strip.mjs" "focus-strip"; }`,
 * so discover it from active direct children of `binds` with an actual matching spawn action.
 * Comments, disabled subtrees and quoted command lookalikes never count.
 * @param {string} text
 * @returns {string | null}
 */
export function findFocusStripChord(text) {
  for (const group of activeKdlNodes(String(text ?? ""))) {
    if (group.name !== "binds") continue;
    for (const bind of group.children) {
      if (bind.children.some(isFocusStripAction)) return bind.name;
    }
  }
  return null;
}

/** Niri's `Mod` is Super in a normal session; spell the chord the way a keyboard does.
 * @param {string} chord */
export function humanizeChord(chord) {
  return chord
    .split("+")
    .map((part) => (part === "Mod" ? "Super" : part === "Mod5" ? "AltGr" : part))
    .join("+");
}

/**
 * `PI_ACTIVITY_STRIP_HOTKEY` names the shortcut directly (`none` hides it); otherwise the Niri
 * config is read once at startup. A missing or unreadable config shows no shortcut rather than a
 * guessed one: the hint must be the key the operator's compositor actually binds.
 * @param {{env?: NodeJS.ProcessEnv; readFileSync?: typeof nodeReadFileSync; homeDir?: string}} [options]
 * @returns {string | null}
 */
export function resolveStripHotkey({
  env = process.env,
  readFileSync = nodeReadFileSync,
  homeDir = os.homedir(),
} = {}) {
  const override = String(env.PI_ACTIVITY_STRIP_HOTKEY ?? "").trim();
  if (override) return override.toLowerCase() === "none" ? null : override;
  const configHome = String(env.XDG_CONFIG_HOME ?? "").trim() || path.join(homeDir, ".config");
  const configPath =
    String(env.NIRI_CONFIG ?? "").trim() || path.join(configHome, "niri", "config.kdl");
  try {
    const chord = findFocusStripChord(readFileSync(configPath, "utf8"));
    return chord ? humanizeChord(chord) : null;
  } catch {
    return null;
  }
}
