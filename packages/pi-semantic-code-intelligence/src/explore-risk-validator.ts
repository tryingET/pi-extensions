const SIGNAL_NAMES = ["publicApi", "state", "registry", "tests"] as const;
const STRUCTURAL_KEYS = [
  "fileBudget",
  "candidateBudgetPerFile",
  "sourceFileByteBudget",
  "totalSourceByteBudget",
  "parseTimeoutMicros",
  "astNodeBudgetPerFile",
  "astWorkUnitBudgetPerFile",
  "targetOccurrenceBudgetPerFile",
  "symbolBodyBudgetPerFile",
  "writeNodeBudgetPerFile",
  "importNodeBudgetPerFile",
  "observedFiles",
  "selectedFiles",
  "attemptedFiles",
  "analyzedFiles",
  "failedFiles",
  "oversizedFiles",
  "omittedFiles",
  "filesOmittedByFileBudget",
  "filesOmittedByTotalByteBudget",
  "totalBudgetRejectedFiles",
  "unattemptedFiles",
  "observedCandidates",
  "selectedCandidates",
  "omittedCandidates",
  "candidatesOmittedByFileBudget",
  "rejectedCandidates",
  "sourceBytesRead",
  "sourceBytesAnalyzed",
  "totalSourceByteBudgetExhausted",
  "astNodesInspected",
  "astNodeBudgetHits",
  "astWorkUnits",
  "astWorkBudgetHits",
  "targetOccurrencesObserved",
  "targetOccurrencesAnalyzed",
  "omittedTargetOccurrences",
  "symbolBodiesObserved",
  "symbolBodiesAnalyzed",
  "omittedSymbolBodies",
  "writeNodesObserved",
  "writeNodesAnalyzed",
  "omittedWriteNodes",
  "importNodesObserved",
  "importNodesAnalyzed",
  "omittedImportNodes",
  "limitations",
] as const;

export function validEditRisk(value: unknown): boolean {
  const risk = record(value);
  const signals = record(risk?.signals);
  const analysis = record(risk?.analysis);
  if (
    !risk ||
    !onlyKeys(risk, ["level", "reasons", "signals", "analysis"]) ||
    typeof risk.level !== "string" ||
    !["low", "medium", "high", "unknown"].includes(risk.level) ||
    !boundedStringArray(risk.reasons, 4, 200) ||
    !signals ||
    !onlyKeys(signals, SIGNAL_NAMES) ||
    !SIGNAL_NAMES.every((key) => validRiskSignal(signals[key])) ||
    !analysis ||
    !onlyKeys(analysis, ["structural"]) ||
    !validStructuralAnalysis(analysis.structural)
  ) {
    return false;
  }
  const detected = SIGNAL_NAMES.filter((key) => record(signals[key])?.detected === true);
  const elevated = detected.some(
    (key) => key === "publicApi" || key === "state" || key === "registry",
  );
  if (elevated && risk.level !== "high") return false;
  if (risk.level === "low" && detected.length > 0) return false;
  return (risk.level !== "high" && risk.level !== "unknown") || risk.reasons.length > 0;
}

function validRiskSignal(value: unknown): boolean {
  const signal = record(value);
  const fallback = record(signal?.namingFallback);
  if (
    !signal ||
    !onlyKeys(signal, [
      "detected",
      "status",
      "confidence",
      "files",
      "hiddenFiles",
      "reasons",
      "provenance",
      "namingFallback",
    ]) ||
    typeof signal.detected !== "boolean" ||
    !boundedStringArray(signal.files, 25, 1_024) ||
    !nonnegativeInteger(signal.hiddenFiles) ||
    !boundedStringArray(signal.reasons, 4, 200) ||
    !boundedStringArray(signal.provenance, 4, 80) ||
    !fallback ||
    !validNamingFallback(fallback)
  ) {
    return false;
  }
  if (signal.detected) {
    return (
      signal.status === "detected" &&
      (signal.confidence === "high" || signal.confidence === "medium") &&
      signal.files.length + Number(signal.hiddenFiles) > 0 &&
      signal.reasons.length > 0 &&
      signal.provenance.length > 0
    );
  }
  return (
    signal.status === "unknown" &&
    signal.confidence === "unknown" &&
    signal.files.length === 0 &&
    signal.hiddenFiles === 0 &&
    signal.reasons.length > 0 &&
    signal.provenance.length === 0
  );
}

function validNamingFallback(value: Record<string, unknown>): boolean {
  if (
    !onlyKeys(value, ["observed", "confidence", "files", "hiddenFiles", "reasons", "provenance"]) ||
    typeof value.observed !== "boolean" ||
    value.confidence !== "low" ||
    !boundedStringArray(value.files, 25, 1_024) ||
    !nonnegativeInteger(value.hiddenFiles) ||
    !boundedStringArray(value.reasons, 4, 200) ||
    !boundedStringArray(value.provenance, 1, 80)
  ) {
    return false;
  }
  if (value.observed) {
    return (
      value.files.length + Number(value.hiddenFiles) > 0 &&
      value.reasons.length > 0 &&
      value.provenance.length === 1 &&
      value.provenance[0] === "fallback.naming"
    );
  }
  return (
    value.files.length === 0 &&
    value.hiddenFiles === 0 &&
    value.reasons.length === 0 &&
    value.provenance.length === 0
  );
}

function validStructuralAnalysis(value: unknown): boolean {
  const item = record(value);
  if (!item || !onlyKeys(item, STRUCTURAL_KEYS)) return false;
  const budgets: Record<string, number> = {
    fileBudget: 64,
    candidateBudgetPerFile: 256,
    sourceFileByteBudget: 524_288,
    totalSourceByteBudget: 4_194_304,
    parseTimeoutMicros: 100_000,
    astNodeBudgetPerFile: 100_000,
    astWorkUnitBudgetPerFile: 10_000,
    targetOccurrenceBudgetPerFile: 4_096,
    symbolBodyBudgetPerFile: 256,
    writeNodeBudgetPerFile: 4_096,
    importNodeBudgetPerFile: 1_024,
  };
  if (Object.entries(budgets).some(([key, expected]) => item[key] !== expected)) return false;

  const countKeys = STRUCTURAL_KEYS.filter(
    (key) =>
      ![...Object.keys(budgets), "totalSourceByteBudgetExhausted", "limitations"].includes(key),
  );
  if (!countKeys.every((key) => nonnegativeInteger(item[key]))) return false;
  if (
    typeof item.totalSourceByteBudgetExhausted !== "boolean" ||
    !boundedStringArray(item.limitations, 8, 200)
  ) {
    return false;
  }

  const n = (key: string) => Number(item[key]);
  return (
    n("selectedFiles") <= n("fileBudget") &&
    n("observedFiles") === n("selectedFiles") + n("filesOmittedByFileBudget") &&
    n("selectedFiles") === n("attemptedFiles") + n("unattemptedFiles") &&
    n("attemptedFiles") ===
      n("analyzedFiles") + n("failedFiles") + n("oversizedFiles") + n("totalBudgetRejectedFiles") &&
    n("filesOmittedByTotalByteBudget") === n("totalBudgetRejectedFiles") + n("unattemptedFiles") &&
    n("omittedFiles") === n("filesOmittedByFileBudget") + n("filesOmittedByTotalByteBudget") &&
    n("observedCandidates") ===
      n("selectedCandidates") + n("omittedCandidates") + n("rejectedCandidates") &&
    n("selectedCandidates") <= n("selectedFiles") * n("candidateBudgetPerFile") &&
    n("candidatesOmittedByFileBudget") <= n("omittedCandidates") &&
    n("sourceBytesAnalyzed") <= n("sourceBytesRead") &&
    n("sourceBytesRead") <= n("totalSourceByteBudget") &&
    n("sourceBytesRead") <= n("attemptedFiles") * n("sourceFileByteBudget") &&
    n("astNodesInspected") <= n("astNodeBudgetPerFile") * n("analyzedFiles") &&
    n("astWorkUnits") <= n("astWorkUnitBudgetPerFile") * n("analyzedFiles") &&
    n("astNodeBudgetHits") <= n("analyzedFiles") &&
    n("astWorkBudgetHits") <= n("analyzedFiles") &&
    n("astNodesInspected") >= n("astNodeBudgetHits") * n("astNodeBudgetPerFile") &&
    n("astWorkUnits") >= n("astWorkBudgetHits") * n("astWorkUnitBudgetPerFile") &&
    n("targetOccurrencesAnalyzed") <= n("targetOccurrenceBudgetPerFile") * n("analyzedFiles") &&
    n("symbolBodiesAnalyzed") <= n("symbolBodyBudgetPerFile") * n("analyzedFiles") &&
    n("writeNodesAnalyzed") <= n("writeNodeBudgetPerFile") * n("analyzedFiles") &&
    n("importNodesAnalyzed") <= n("importNodeBudgetPerFile") * n("analyzedFiles") &&
    n("filesOmittedByTotalByteBudget") > 0 === item.totalSourceByteBudgetExhausted &&
    validObservedAnalyzedOmitted(item, "targetOccurrences") &&
    validObservedAnalyzedOmitted(item, "symbolBodies") &&
    validObservedAnalyzedOmitted(item, "writeNodes") &&
    validObservedAnalyzedOmitted(item, "importNodes")
  );
}

function validObservedAnalyzedOmitted(item: Record<string, unknown>, prefix: string): boolean {
  const observed = Number(item[`${prefix}Observed`]);
  const analyzed = Number(item[`${prefix}Analyzed`]);
  const omittedPrefix =
    prefix === "targetOccurrences" ? "omittedTargetOccurrences" : `omitted${capitalize(prefix)}`;
  const omitted = Number(item[omittedPrefix]);
  return analyzed <= observed && observed === analyzed + omitted;
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const expected = new Set(allowed);
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  );
}

function boundedStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => typeof item === "string" && item.length > 0 && item.length <= maxLength)
  );
}

function nonnegativeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}
