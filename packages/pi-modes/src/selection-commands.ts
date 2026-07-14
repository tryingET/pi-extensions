import {
  cloneModeSelection,
  type DefinitionFingerprints,
  EMPTY_MODE_SELECTION,
  type ModeSelection,
  modeDefinitionFingerprint,
  normalizeModeSelection,
  type ResolvedMode,
  resolveModeSelection,
  selectionForModeKey,
} from "./modes.ts";

export interface DirectSelectionResult {
  selection?: ModeSelection;
  error?: string;
  confirmExact?: boolean;
}

export function selectionLabel(selection: ModeSelection): string {
  const base = selection.baseKey ?? "native";
  return selection.overlayKeys.length > 0 ? `${base} +${selection.overlayKeys.length}` : base;
}

export function selectionDefinitionFingerprint(
  selection: ModeSelection,
  modes: readonly ResolvedMode[],
): string {
  const byKey = new Map(modes.map((mode) => [mode.key, mode]));
  const snapshot = (key: string | null) => {
    if (key === null) return null;
    const mode = byKey.get(key);
    return mode ? { key, ...modeDefinitionFingerprint(mode) } : { key, unavailable: true };
  };
  return JSON.stringify({
    base: snapshot(selection.baseKey),
    overlays: selection.overlayKeys.map((key) => snapshot(key)),
  });
}

function validateCandidate(
  selection: ModeSelection,
  modes: readonly ResolvedMode[],
  confirmExact: boolean,
): DirectSelectionResult {
  let normalized: ModeSelection;
  try {
    normalized = normalizeModeSelection(selection);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  const resolved = resolveModeSelection(normalized, modes);
  if (resolved.blocked || resolved.diagnostics.length > 0) {
    return {
      error: resolved.diagnostics
        .map((item) => `${item.key ? `${item.key}: ` : ""}${item.message}`)
        .join("; "),
    };
  }
  return { selection: normalized, ...(confirmExact ? { confirmExact: true } : {}) };
}

export function parseDirectSelection(
  args: string,
  modes: readonly ResolvedMode[],
  current: ModeSelection,
): DirectSelectionResult {
  const rawTokens = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const confirmIndex = rawTokens.indexOf("--confirm-exact");
  const confirmExact = confirmIndex >= 0;
  if (confirmExact) rawTokens.splice(confirmIndex, 1);
  if (rawTokens.includes("--confirm-exact"))
    return { error: "--confirm-exact may appear only once" };
  const input = rawTokens.join(" ");
  if (!input) return {};
  if (["off", "default", "none"].includes(input)) {
    return validateCandidate(cloneModeSelection(EMPTY_MODE_SELECTION), modes, confirmExact);
  }
  if (input.startsWith("+")) {
    const key = input.slice(1);
    const mode = modes.find((candidate) => candidate.key === key);
    if (!mode || mode.promptStrategy !== "append")
      return { error: `${key} is not an append overlay` };
    const base = current.baseKey
      ? modes.find((candidate) => candidate.key === current.baseKey)
      : undefined;
    if (base?.promptStrategy === "replace_final") {
      return { error: "replace_final is exclusive; use /mode set native --overlay <key>" };
    }
    return validateCandidate(
      current.overlayKeys.includes(key)
        ? cloneModeSelection(current)
        : { baseKey: current.baseKey, overlayKeys: [...current.overlayKeys, key] },
      modes,
      confirmExact,
    );
  }
  if (input.startsWith("-")) {
    const key = input.slice(1);
    const mode = modes.find((candidate) => candidate.key === key);
    if (!mode || mode.promptStrategy !== "append")
      return { error: `${key} is not an append overlay` };
    if (!current.overlayKeys.includes(key)) return { error: `${key} is not selected` };
    return validateCandidate(
      {
        baseKey: current.baseKey,
        overlayKeys: current.overlayKeys.filter((candidate) => candidate !== key),
      },
      modes,
      confirmExact,
    );
  }
  const tokens = input.split(/\s+/).filter(Boolean);
  if (tokens[0] === "set") {
    const baseToken = tokens[1];
    if (!baseToken) return usageError();
    let baseKey: string | null = null;
    if (!["native", "off", "default", "none"].includes(baseToken)) {
      const base = modes.find((mode) => mode.key === baseToken);
      if (!base || base.promptStrategy === "append")
        return { error: `${baseToken} is not a base mode` };
      baseKey = base.key;
    }
    const overlayKeys: string[] = [];
    for (let index = 2; index < tokens.length; index += 2) {
      if (tokens[index] !== "--overlay") return usageError();
      const key = tokens[index + 1];
      if (!key) return usageError();
      const overlay = modes.find((mode) => mode.key === key);
      if (!overlay || overlay.promptStrategy !== "append")
        return { error: `${key} is not an append overlay` };
      if (overlayKeys.includes(key)) return { error: `duplicate overlay: ${key}` };
      overlayKeys.push(key);
    }
    const base = baseKey ? modes.find((mode) => mode.key === baseKey) : undefined;
    if (base?.promptStrategy === "replace_final" && overlayKeys.length > 0) {
      return { error: "replace_final is exclusive and cannot be combined with overlays" };
    }
    return validateCandidate({ baseKey, overlayKeys }, modes, confirmExact);
  }
  if (tokens.length !== 1) return usageError();
  const selected = selectionForModeKey(input, modes);
  return selected.error
    ? { error: `Unknown prompt mode: ${input}` }
    : validateCandidate(selected.selection, modes, confirmExact);
}

export function requiresReplaceFinalConfirmation(
  current: ModeSelection,
  next: ModeSelection,
  modes: readonly ResolvedMode[],
  approvedFingerprints?: DefinitionFingerprints,
): boolean {
  if (!next.baseKey) return false;
  const nextBase = modes.find((mode) => mode.key === next.baseKey);
  if (nextBase?.promptStrategy !== "replace_final") return false;
  if (next.baseKey !== current.baseKey) return true;
  const approved = approvedFingerprints?.[next.baseKey];
  if (!approved) return true;
  const currentDefinition = modeDefinitionFingerprint(nextBase);
  return (
    approved.digest !== currentDefinition.digest ||
    approved.scope !== currentDefinition.scope ||
    approved.path !== currentDefinition.path
  );
}

export function modeArgumentCompletions(
  prefix: string,
  modes: readonly ResolvedMode[],
  current: ModeSelection,
): string[] {
  const normalized = prefix.trimStart().toLowerCase();
  const bases = modes.filter((mode) => mode.promptStrategy !== "append").map((mode) => mode.key);
  const overlays = modes.filter((mode) => mode.promptStrategy === "append").map((mode) => mode.key);
  let values: string[];
  if (normalized.startsWith("+")) {
    values = overlays.filter((key) => !current.overlayKeys.includes(key)).map((key) => `+${key}`);
  } else if (normalized.startsWith("-")) {
    values = current.overlayKeys.map((key) => `-${key}`);
  } else if (/^set\s+\S*$/u.test(normalized)) {
    values = ["set native", ...bases.map((key) => `set ${key}`)];
  } else if (normalized.includes("--overlay")) {
    const head = normalized.replace(/(?:--overlay\s+\S*)?$/u, "").trimEnd();
    values = overlays.map((key) => `${head} --overlay ${key}`);
  } else {
    values = [
      "off",
      "set native",
      ...bases,
      ...overlays,
      ...overlays.filter((key) => !current.overlayKeys.includes(key)).map((key) => `+${key}`),
      ...current.overlayKeys.map((key) => `-${key}`),
    ];
  }
  return [...new Set(values)].filter((value) => value.startsWith(normalized));
}

function usageError(): DirectSelectionResult {
  return { error: "Usage: /mode set <base-key|native> [--overlay <key>]... [--confirm-exact]" };
}
