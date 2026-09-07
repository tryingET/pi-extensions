// ---
// summary: "keeps the panel's colours in step with Ghostty's theme and the desktop's light/dark switch"
// read_when:
//   - "changing how often the ribbon re-reads the terminal theme"
// ---

import { paletteDefinitions } from "../common/ghostty-theme.mjs";
import { detectColorScheme, resolveRibbonTheme, themeSourceFingerprint } from "./theme-source.mjs";

/** A theme change is rare and never urgent, so it is polled on a calm clock. */
export const THEME_POLL_INTERVAL_MS = 20_000;

/**
 * @param {{
 *   execFileAsync: (file: string, args: string[], options: object) => Promise<{stdout?: string}>;
 *   env?: NodeJS.ProcessEnv;
 *   runtimeStatus: import("../common/contracts.ts").ActivityStripRuntimeStatus;
 *   publish: (definitions: string) => void;
 *   resolveTheme?: typeof resolveRibbonTheme;
 *   detectScheme?: typeof detectColorScheme;
 *   fingerprint?: typeof themeSourceFingerprint;
 * }} options
 */
export function createThemeRuntime({
  execFileAsync,
  env = process.env,
  runtimeStatus,
  publish,
  resolveTheme = resolveRibbonTheme,
  detectScheme = detectColorScheme,
  fingerprint = themeSourceFingerprint,
}) {
  let lastDefinitions = "";
  let inFlight = false;

  /**
   * Resolve the current theme and hand it to the panel when anything about it changed. `force`
   * republishes unchanged colours, which is what a freshly started panel needs.
   * @param {{force?: boolean}} [options]
   */
  async function refresh({ force = false } = {}) {
    if (inFlight) return false;
    inFlight = true;
    try {
      const scheme = await detectScheme({ execFileAsync, env });
      const resolved = resolveTheme({ scheme, env });
      const definitions = paletteDefinitions(resolved.palette);
      runtimeStatus.themeScheme = scheme;
      runtimeStatus.themeName = resolved.themeName || null;
      runtimeStatus.themeSource = resolved.themePath || resolved.configPath || null;
      runtimeStatus.themeFingerprint = fingerprint(resolved);
      if (!force && definitions === lastDefinitions) return false;
      lastDefinitions = definitions;
      publish(definitions);
      return true;
    } catch (error) {
      runtimeStatus.themeError = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      inFlight = false;
    }
  }

  return {
    refresh,
    /** Re-send the colours the panel already had, after it restarts with none. */
    republish: () => (lastDefinitions ? publish(lastDefinitions) : void refresh({ force: true })),
    get definitions() {
      return lastDefinitions;
    },
  };
}
