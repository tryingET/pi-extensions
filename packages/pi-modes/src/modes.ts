import { isValidModeKey, type ResolvedMode } from "./mode-definitions.ts";
import {
  cloneModeSelection,
  EMPTY_MODE_SELECTION,
  type InitialSelectionResolution,
  type ModeSelection,
  normalizeModeSelection,
  selectionForModeKey,
} from "./mode-state.ts";

export * from "./mode-definitions.ts";
export * from "./mode-state.ts";
export {
  buildCustomBasePrompt,
  composeModePrompt,
  composeModeSelection,
  resolveModeSelection,
} from "./prompt-composition.ts";

export interface StartupModeSelection {
  configured: boolean;
  key: string | null;
  error?: string;
}

export interface StartupCompositionSelection {
  configured: boolean;
  selection: ModeSelection;
  error?: string;
}

export interface InitialModeResolution {
  source: "environment" | "session";
  key: string | null;
  error?: string;
}

/** Resolve the explicit launch-time mode selector without reading arbitrary environment values. */
export function startupModeFromEnvironment(value: string | undefined): StartupModeSelection {
  if (value === undefined || value.trim() === "") return { configured: false, key: null };
  const key = value.trim().toLowerCase();
  if (key === "off" || key === "default" || key === "none") {
    return { configured: true, key: null };
  }
  if (!isValidModeKey(key)) {
    return {
      configured: true,
      key: null,
      error: "PI_MODE must name a valid mode key or use off",
    };
  }
  return { configured: true, key };
}

/** Structured multi-component startup contract; takes precedence over PI_MODE when configured. */
export function startupCompositionFromEnvironment(
  value: string | undefined,
): StartupCompositionSelection {
  if (value === undefined || value.trim() === "") {
    return { configured: false, selection: cloneModeSelection(EMPTY_MODE_SELECTION) };
  }
  try {
    const raw = JSON.parse(value) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("must be a JSON object");
    const candidate = raw as Record<string, unknown>;
    if (Object.keys(candidate).some((key) => key !== "baseKey" && key !== "overlayKeys")) {
      throw new Error("contains unknown fields");
    }
    const selection = normalizeModeSelection(candidate);
    return { configured: true, selection };
  } catch (error) {
    return {
      configured: true,
      selection: cloneModeSelection(EMPTY_MODE_SELECTION),
      error: `PI_MODES ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Legacy single-key startup resolver retained for package API compatibility. */
export function resolveInitialModeSelection(options: {
  applyEnvironment: boolean;
  environmentValue: string | undefined;
  sessionKey: string | null;
  availableKeys: readonly string[];
}): InitialModeResolution {
  if (!options.applyEnvironment) return { source: "session", key: options.sessionKey };
  const startup = startupModeFromEnvironment(options.environmentValue);
  if (!startup.configured) return { source: "session", key: options.sessionKey };
  if (startup.error) return { source: "environment", key: null, error: startup.error };
  if (startup.key && !options.availableKeys.includes(startup.key)) {
    return {
      source: "environment",
      key: null,
      error: `PI_MODE names an unavailable mode: ${startup.key}`,
    };
  }
  return { source: "environment", key: startup.key };
}

export function resolveInitialSelection(options: {
  applyEnvironment: boolean;
  environmentValue: string | undefined;
  compositionEnvironmentValue?: string | undefined;
  sessionSelection: ModeSelection;
  modes: readonly ResolvedMode[];
}): InitialSelectionResolution {
  if (!options.applyEnvironment) {
    return { source: "session", selection: cloneModeSelection(options.sessionSelection) };
  }
  const composition = startupCompositionFromEnvironment(options.compositionEnvironmentValue);
  if (composition.configured) {
    return {
      source: "environment",
      selection: composition.selection,
      ...(composition.error ? { error: composition.error } : {}),
    };
  }
  const startup = startupModeFromEnvironment(options.environmentValue);
  if (!startup.configured) {
    return { source: "session", selection: cloneModeSelection(options.sessionSelection) };
  }
  if (startup.error) {
    return {
      source: "environment",
      selection: cloneModeSelection(EMPTY_MODE_SELECTION),
      error: startup.error,
    };
  }
  const resolved = selectionForModeKey(startup.key, options.modes);
  return {
    source: "environment",
    selection: resolved.selection,
    ...(resolved.error ? { error: `PI_MODE names an unavailable mode: ${startup.key}` } : {}),
  };
}
