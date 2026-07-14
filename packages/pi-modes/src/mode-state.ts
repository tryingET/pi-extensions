import {
  type DefinitionFingerprints,
  fingerprintsForKeys,
  isValidModeKey,
  type ResolvedMode,
} from "./mode-definitions.ts";

export const MODE_STATE_TYPE_V1 = "pi-mode-state.v1";
/** Legacy alias retained for package API compatibility. */
export const MODE_STATE_TYPE = MODE_STATE_TYPE_V1;
export const MODE_STATE_TYPE_V2 = "pi-mode-state.v2";
export const MODE_STATE_TYPE_V3 = "pi-mode-state.v3";
export type DriftPolicy = "block" | "warn" | "allow";
export type ActivationSource =
  | "command"
  | "selector"
  | "startup"
  | "migration"
  | "preset"
  | "reapprove"
  | "policy"
  | "delete";

export interface ModeSelection {
  baseKey: string | null;
  overlayKeys: string[];
}

export const MODE_SELECTION_MAX_OVERLAYS = 64;

/** Validate and clone the shared persisted/runtime selection shape. */
export function normalizeModeSelection(data: unknown): ModeSelection {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("mode selection must be an object");
  }
  const value = data as { baseKey?: unknown; overlayKeys?: unknown };
  if (value.baseKey !== null && typeof value.baseKey !== "string") {
    throw new Error("mode selection baseKey must be null or a canonical mode key");
  }
  if (typeof value.baseKey === "string" && !isValidModeKey(value.baseKey)) {
    throw new Error("mode selection baseKey must be null or a canonical mode key");
  }
  if (!Array.isArray(value.overlayKeys)) {
    throw new Error("mode selection overlayKeys must be an array");
  }
  if (value.overlayKeys.length > MODE_SELECTION_MAX_OVERLAYS) {
    throw new Error(`mode selection supports at most ${MODE_SELECTION_MAX_OVERLAYS} overlays`);
  }
  if (!value.overlayKeys.every((key) => typeof key === "string" && isValidModeKey(key))) {
    throw new Error("mode selection overlayKeys must contain canonical mode keys");
  }
  const overlayKeys = value.overlayKeys as string[];
  if (new Set(overlayKeys).size !== overlayKeys.length) {
    throw new Error("mode selection contains duplicate overlay keys");
  }
  if (value.baseKey !== null && overlayKeys.includes(value.baseKey)) {
    throw new Error("mode selection baseKey must not also be an overlay");
  }
  return { baseKey: value.baseKey as string | null, overlayKeys: [...overlayKeys] };
}

/** Legacy single-mode session state retained for chronological v1 replay. */
export interface ModeState {
  key: string | null;
}

export interface ModeStateV3 extends ModeSelection {
  fingerprints: DefinitionFingerprints;
  driftPolicy: DriftPolicy;
  activatedAt: string;
  source: ActivationSource;
}

export interface SelectionDiagnostic {
  key?: string;
  message: string;
}

export interface ResolvedModeSelection {
  base?: ResolvedMode;
  overlays: ResolvedMode[];
  diagnostics: SelectionDiagnostic[];
  driftedKeys: string[];
  blocked: boolean;
}

export interface ReplayedModeSelection {
  selection: ModeSelection;
  diagnostics: SelectionDiagnostic[];
  stateVersion: "v1" | "v2" | "v3" | null;
  state?: ModeStateV3;
}

export interface InitialSelectionResolution {
  source: "environment" | "session";
  selection: ModeSelection;
  error?: string;
}

export const EMPTY_MODE_SELECTION: ModeSelection = Object.freeze({
  baseKey: null,
  overlayKeys: [],
});

export function cloneModeSelection(selection: ModeSelection): ModeSelection {
  return { baseKey: selection.baseKey, overlayKeys: [...selection.overlayKeys] };
}

export function modeSelectionsEqual(left: ModeSelection, right: ModeSelection): boolean {
  return (
    left.baseKey === right.baseKey &&
    left.overlayKeys.length === right.overlayKeys.length &&
    left.overlayKeys.every((key, index) => key === right.overlayKeys[index])
  );
}

export function selectedKeys(selection: ModeSelection): string[] {
  return [...(selection.baseKey ? [selection.baseKey] : []), ...selection.overlayKeys];
}

export function selectionForModeKey(
  key: string | null,
  modes: readonly ResolvedMode[],
): InitialSelectionResolution {
  if (key === null) {
    return { source: "environment", selection: cloneModeSelection(EMPTY_MODE_SELECTION) };
  }
  const mode = modes.find((candidate) => candidate.key === key);
  if (!mode) {
    return {
      source: "environment",
      selection: cloneModeSelection(EMPTY_MODE_SELECTION),
      error: `mode is unavailable: ${key}`,
    };
  }
  return {
    source: "environment",
    selection:
      mode.promptStrategy === "append"
        ? { baseKey: null, overlayKeys: [key] }
        : { baseKey: key, overlayKeys: [] },
  };
}

export function createModeState(
  selection: ModeSelection,
  modes: readonly ResolvedMode[],
  source: ActivationSource,
  options: {
    driftPolicy?: DriftPolicy;
    activatedAt?: string;
    fingerprints?: DefinitionFingerprints;
  } = {},
): ModeStateV3 {
  const normalized = normalizeModeSelection(selection);
  const candidate = {
    ...normalized,
    fingerprints: options.fingerprints ?? fingerprintsForKeys(selectedKeys(normalized), modes),
    driftPolicy: options.driftPolicy ?? "block",
    activatedAt: options.activatedAt ?? new Date().toISOString(),
    source,
  };
  const parsed = parseV3State(candidate);
  if (!parsed) {
    throw new Error("refusing to create mode state that cannot be replayed");
  }
  return parsed;
}

function parseSelection(data: unknown): ModeSelection | undefined {
  try {
    return normalizeModeSelection(data);
  } catch {
    return undefined;
  }
}

function parseV3State(data: unknown): ModeStateV3 | undefined {
  const selection = parseSelection(data);
  if (!selection || !data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const value = data as Record<string, unknown>;
  const allowedFields = new Set([
    "baseKey",
    "overlayKeys",
    "fingerprints",
    "driftPolicy",
    "activatedAt",
    "source",
  ]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) return undefined;
  if (
    !value.fingerprints ||
    typeof value.fingerprints !== "object" ||
    Array.isArray(value.fingerprints)
  ) {
    return undefined;
  }
  if (
    value.driftPolicy !== "block" &&
    value.driftPolicy !== "warn" &&
    value.driftPolicy !== "allow"
  ) {
    return undefined;
  }
  if (
    typeof value.activatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.activatedAt) ||
    Number.isNaN(Date.parse(value.activatedAt)) ||
    new Date(value.activatedAt).toISOString() !== value.activatedAt
  ) {
    return undefined;
  }
  const sources: ActivationSource[] = [
    "command",
    "selector",
    "startup",
    "migration",
    "preset",
    "reapprove",
    "policy",
    "delete",
  ];
  if (typeof value.source !== "string" || !sources.includes(value.source as ActivationSource)) {
    return undefined;
  }
  const fingerprints = value.fingerprints as Record<string, unknown>;
  const keys = selectedKeys(selection);
  if (
    Object.keys(fingerprints).length !== keys.length ||
    keys.some((key) => !(key in fingerprints))
  ) {
    return undefined;
  }
  const normalized: DefinitionFingerprints = {};
  for (const key of keys) {
    const fingerprint = fingerprints[key];
    if (!fingerprint || typeof fingerprint !== "object" || Array.isArray(fingerprint))
      return undefined;
    const item = fingerprint as Record<string, unknown>;
    if (Object.keys(item).some((field) => !["digest", "scope", "path"].includes(field))) {
      return undefined;
    }
    if (typeof item.digest !== "string" || !/^[a-f0-9]{64}$/.test(item.digest)) return undefined;
    if (item.scope !== "builtin" && item.scope !== "global" && item.scope !== "project") {
      return undefined;
    }
    if (item.path !== null && typeof item.path !== "string") return undefined;
    normalized[key] = { digest: item.digest, scope: item.scope, path: item.path as string | null };
  }
  return {
    ...selection,
    fingerprints: normalized,
    driftPolicy: value.driftPolicy,
    activatedAt: value.activatedAt,
    source: value.source as ActivationSource,
  };
}

export function selectionFromEntries(
  entries: readonly unknown[],
  modes: readonly ResolvedMode[],
): ReplayedModeSelection {
  let selection = cloneModeSelection(EMPTY_MODE_SELECTION);
  let diagnostics: SelectionDiagnostic[] = [];
  let stateVersion: ReplayedModeSelection["stateVersion"] = null;
  let state: ModeStateV3 | undefined;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { type?: string; customType?: string; data?: unknown };
    if (candidate.type !== "custom") continue;
    if (candidate.customType === MODE_STATE_TYPE_V1) {
      const data = candidate.data as { key?: unknown } | undefined;
      if (!data || (data.key !== null && typeof data.key !== "string")) continue;
      if (typeof data.key === "string" && !isValidModeKey(data.key)) continue;
      const translated = selectionForModeKey(data.key as string | null, modes);
      selection = translated.selection;
      stateVersion = "v1";
      state = undefined;
      diagnostics = translated.error
        ? [{ key: data.key as string, message: `${translated.error}; using native host` }]
        : [];
      continue;
    }
    if (candidate.customType === MODE_STATE_TYPE_V2) {
      const parsed = parseSelection(candidate.data);
      if (!parsed) continue;
      selection = parsed;
      stateVersion = "v2";
      state = undefined;
      diagnostics = [];
      continue;
    }
    if (candidate.customType === MODE_STATE_TYPE_V3) {
      const parsed = parseV3State(candidate.data);
      if (!parsed) continue;
      selection = { baseKey: parsed.baseKey, overlayKeys: [...parsed.overlayKeys] };
      stateVersion = "v3";
      state = parsed;
      diagnostics = [];
    }
  }
  return { selection, diagnostics, stateVersion, ...(state ? { state } : {}) };
}

/** Legacy helper that intentionally reads only v1 entries. */
export function selectedModeFromEntries(entries: readonly unknown[]): ModeState {
  let key: string | null = null;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { type?: string; customType?: string; data?: { key?: unknown } };
    if (candidate.type !== "custom" || candidate.customType !== MODE_STATE_TYPE_V1) continue;
    if (candidate.data?.key === null || typeof candidate.data?.key === "string")
      key = candidate.data.key;
  }
  return { key };
}
