function isMissing(value) {
  return value === undefined || value === null || value.trim().length === 0;
}

function isLowSignalRough(value) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return /^(continue|ok|okay|yes|y|go on|next|proceed|done|thanks|thank you|thx)\.?$/.test(normalized);
}

function isStrictObjectiveHint(hint) {
  const text = (hint ?? "").toLowerCase();
  return /primary objective|problem statement|outcome is needed next|must replace/.test(text);
}

function ensureIndex(args, index) {
  while (args.length <= index) {
    args.push("");
  }
}

function inferSlotFromHint(index, hint) {
  const text = (hint ?? "").toLowerCase();

  if (/system4d|mode|off|lite|full/.test(text)) return "mode";
  if (/constraint|constraints|extra|extras|preference|preferences|requirement|requirements|notes?|override|overrides|context-pack/.test(text)) {
    return "extras";
  }
  if (/workflow|audience|context|repo|branch|project|environment/.test(text)) return "context";
  if (/rough|prompt|idea|task|problem|goal|request/.test(text)) return "rough";

  if (index === 1) return "rough";
  if (index === 2) return "context";
  if (index === 3) return "mode";

  return "extras";
}

function getSlotValue(slot, inferred) {
  switch (slot) {
    case "rough":
      return inferred.roughThought;
    case "context":
      return inferred.contextSummary;
    case "mode":
      return inferred.system4dMode || "lite";
    case "extras":
    default:
      return inferred.extrasSummary;
  }
}

function getRestStart(usage, hints) {
  const starts = [];

  for (const slice of usage.slices ?? []) {
    if (Number.isFinite(slice.start) && slice.start >= 1) starts.push(slice.start);
  }

  for (const hint of hints.restHints ?? []) {
    if (Number.isFinite(hint.start) && hint.start >= 1) starts.push(hint.start);
  }

  if (usage.usesAllArgs && starts.length === 0) {
    starts.push(3);
  }

  if (starts.length === 0) return undefined;
  return Math.min(...starts);
}

function resolveRestSlot(restStart, usage, hints) {
  const restHints = hints.restHints ?? [];
  const exact = restHints.find((entry) => entry.start === restStart);
  const fallback = exact ?? restHints[0];

  if (fallback?.hint) {
    return inferSlotFromHint(restStart, fallback.hint);
  }

  if (usage.usesAllArgs) return "context";
  return "extras";
}

function getRestValue(slot, inferred) {
  if (slot === "context") {
    return inferred.contextExtrasSummary || inferred.contextSummary;
  }

  return getSlotValue(slot, inferred);
}

/**
 * Deterministic + line-hint-aware mapping:
 * - reads template line hints around placeholders when args are missing
 * - fills missing positional args with inferred context snippets
 * - appends extrasSummary when template uses variadic args and no rest args exist
 */
export function mapArgsByUsage(providedArgs, inferred, usage, hints = {}) {
  const mapped = [...providedArgs];

  for (let position = 1; position <= usage.highestPositionalIndex; position += 1) {
    const index = position - 1;
    ensureIndex(mapped, index);

    const hint = hints.positionalHints?.[position];
    const slot = inferSlotFromHint(position, hint);

    if (!isMissing(mapped[index])) {
      if (slot === "mode") {
        const normalized = (mapped[index] ?? "").trim().toLowerCase();
        if (normalized === "off" || normalized === "lite" || normalized === "full") {
          mapped[index] = normalized;
        } else {
          mapped[index] = getSlotValue("mode", inferred) ?? "lite";
        }
      } else if (slot === "rough") {
        if (isStrictObjectiveHint(hint)) {
          mapped[index] = "<MUST_REPLACE_PRIMARY_OBJECTIVE>";
        } else if (isLowSignalRough(mapped[index])) {
          mapped[index] = getSlotValue("rough", inferred) ?? "<MUST_REPLACE_PRIMARY_OBJECTIVE>";
        }
      }
      continue;
    }

    if (slot === "rough" && isStrictObjectiveHint(hint)) {
      mapped[index] = "<MUST_REPLACE_PRIMARY_OBJECTIVE>";
    } else {
      mapped[index] = getSlotValue(slot, inferred) ?? "";
    }
  }

  const restStart = getRestStart(usage, hints);
  if (restStart === undefined) {
    return mapped;
  }

  const restStartIndex = Math.max(0, restStart - 1);
  const hasRestArgs = mapped.slice(restStartIndex).some((arg) => !isMissing(arg));

  if (!hasRestArgs) {
    const restSlot = resolveRestSlot(restStart, usage, hints);
    const restValue = getRestValue(restSlot, inferred);

    if (!isMissing(restValue ?? "")) {
      while (mapped.length < restStartIndex) {
        mapped.push("");
      }
      mapped.push(restValue);
    }
  }

  return mapped;
}
