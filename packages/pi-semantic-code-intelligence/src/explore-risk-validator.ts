const SIGNAL_NAMES = ["publicApi", "state", "registry", "tests"] as const;
type SignalName = (typeof SIGNAL_NAMES)[number];

export type RiskImpactContext = {
  totalFiles: number;
  truncated: boolean;
  emittedPaths: ReadonlySet<string>;
};

const DEGRADED_RISK_REASON = "Impact evidence is degraded by failed or unusable evidence.";
type StructuralCounter =
  | "targetOccurrencesAnalyzed"
  | "symbolBodiesAnalyzed"
  | "writeNodesAnalyzed"
  | "importNodesAnalyzed";

type EvidenceContract = {
  confidence: "high" | "medium";
  reasons: readonly (string | RegExp)[];
  requiredCounters?: readonly StructuralCounter[];
};

const SIGNAL_EVIDENCE: Record<SignalName, Record<string, EvidenceContract>> = {
  publicApi: {
    "graph.exports": {
      confidence: "high",
      reasons: ["The graph backend returned a target-matching export declaration."],
    },
    "declaration.kind": {
      confidence: "high",
      reasons: ["The target declaration is structurally labelled as an export."],
    },
    "ast.export_declaration": {
      confidence: "high",
      reasons: ["An exact target occurrence participates directly in an export declaration."],
      requiredCounters: ["targetOccurrencesAnalyzed"],
    },
  },
  state: {
    "scip.roles.write": {
      confidence: "high",
      reasons: ["SCIP marks this target occurrence as a write access."],
    },
    "reference.assignment": {
      confidence: "medium",
      reasons: ["An AST-validated target occurrence is an assignment."],
    },
    "ast.definition_write": {
      confidence: "medium",
      reasons: [
        "The target definition body contains a structural member or indexed write; shared-state aliasing is not proved.",
      ],
      requiredCounters: ["symbolBodiesAnalyzed", "writeNodesAnalyzed"],
    },
    "ast.write_occurrence": {
      confidence: "high",
      reasons: [
        "The target occurrence is structurally on the written side of an assignment.",
        "The target occurrence is structurally updated.",
      ],
      requiredCounters: ["targetOccurrencesAnalyzed", "writeNodesAnalyzed"],
    },
  },
  registry: {
    "ast.keyed_collection_write": {
      confidence: "medium",
      reasons: [
        "The target is inserted by a structural keyed/set collection write; registry framework semantics are not proved.",
      ],
      requiredCounters: ["targetOccurrencesAnalyzed"],
    },
  },
  tests: {
    "scip.roles.test": {
      confidence: "high",
      reasons: ["SCIP marks this target occurrence as test code."],
    },
    "ast.imported_test_call": {
      confidence: "high",
      reasons: [
        /^The target occurrence is enclosed by [A-Za-z_$][\w$]*\(\.\.\.\) imported from a supported test module\.$/,
      ],
      requiredCounters: ["targetOccurrencesAnalyzed", "importNodesAnalyzed"],
    },
  },
};

const UNKNOWN_SIGNAL_REASON = "No supported structural evidence proved this signal.";
const FALLBACK_REASONS: Record<SignalName, string> = {
  publicApi:
    "A conventional public/api/index/export name matched, but no target-specific export was proved.",
  state: "A conventional state/store/schema/database name matched, but no write was proved.",
  registry:
    "A conventional registry/plugin/register name matched, but no registration mutation was proved.",
  tests: "A conventional test/spec path matched, but no test declaration or test role was proved.",
};
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

export function validEditRisk(
  value: unknown,
  impact: RiskImpactContext,
  degraded: boolean,
): boolean {
  const risk = record(value);
  const signals = record(risk?.signals);
  const analysis = record(risk?.analysis);
  const structural = record(analysis?.structural);
  if (
    !Number.isSafeInteger(impact.totalFiles) ||
    impact.totalFiles < 1 ||
    typeof impact.truncated !== "boolean" ||
    !risk ||
    !onlyKeys(risk, ["level", "reasons", "signals", "analysis"]) ||
    typeof risk.level !== "string" ||
    !["medium", "high", "unknown"].includes(risk.level) ||
    !boundedStringArray(risk.reasons, 4, 200) ||
    !signals ||
    !onlyKeys(signals, SIGNAL_NAMES) ||
    !analysis ||
    !onlyKeys(analysis, ["structural"]) ||
    !structural ||
    !validStructuralAnalysis(structural) ||
    !SIGNAL_NAMES.every((key) => validRiskSignal(key, signals[key], structural, impact))
  ) {
    return false;
  }
  const detected = SIGNAL_NAMES.filter((key) => record(signals[key])?.detected === true);
  const elevated = detected.some(
    (key) => key === "publicApi" || key === "state" || key === "registry",
  );
  const expectedLevel =
    degraded || elevated ? "high" : impact.totalFiles > 3 ? "medium" : "unknown";
  const expectedReasons = [
    ...(detected.includes("publicApi")
      ? ["Target-specific export evidence means downstream consumers may be affected."]
      : []),
    ...(detected.includes("state") ? ["Structural write evidence requires invariant review."] : []),
    ...(detected.includes("registry")
      ? ["Structural registration evidence may require coordinated updates."]
      : []),
    ...(detected.includes("tests")
      ? ["Structurally identified impacted tests provide a focused validation target."]
      : []),
    ...(degraded ? [DEGRADED_RISK_REASON] : []),
    ...(expectedLevel === "unknown"
      ? ["No supported structural evidence established a low semantic edit risk."]
      : []),
  ].slice(0, 4);
  return (
    risk.level === expectedLevel && stringArraysEqual(risk.reasons as string[], expectedReasons)
  );
}

function validRiskSignal(
  name: SignalName,
  value: unknown,
  structural: Record<string, unknown>,
  impact: RiskImpactContext,
): boolean {
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
    !validSignalFiles(signal.files, signal.hiddenFiles, impact) ||
    !boundedStringArray(signal.reasons, 4, 200) ||
    !uniqueStringArray(signal.reasons) ||
    !boundedStringArray(signal.provenance, 4, 80) ||
    !uniqueStringArray(signal.provenance) ||
    !fallback ||
    !validNamingFallback(name, fallback, impact)
  ) {
    return false;
  }
  if (signal.detected) {
    const provenance = signal.provenance as string[];
    const contracts = SIGNAL_EVIDENCE[name];
    if (
      signal.status !== "detected" ||
      signal.files.length + Number(signal.hiddenFiles) === 0 ||
      provenance.length === 0 ||
      provenance.some((item) => !Object.hasOwn(contracts, item))
    ) {
      return false;
    }
    const evidence = provenance.map((item) => contracts[item] as EvidenceContract);
    const reasons = signal.reasons as string[];
    if (
      reasons.some((reason) => !evidence.some((item) => evidenceReasonMatches(item, reason))) ||
      evidence.some(
        (item) =>
          !reasons.some((reason) => evidenceReasonMatches(item, reason)) &&
          (item.confidence === "high" || reasons.length < 4),
      ) ||
      signal.confidence !==
        (evidence.some((item) => item.confidence === "high") ? "high" : "medium")
    ) {
      return false;
    }
    return evidence.every((item, index) => {
      if (!provenance[index]?.startsWith("ast.")) return true;
      return (
        Number(structural.analyzedFiles) > 0 &&
        Number(structural.sourceBytesAnalyzed) > 0 &&
        Number(structural.astNodesInspected) > 0 &&
        Number(structural.astWorkUnits) > 0 &&
        (item.requiredCounters ?? []).every((counter) => Number(structural[counter]) > 0)
      );
    });
  }
  return (
    signal.status === "unknown" &&
    signal.confidence === "unknown" &&
    signal.files.length === 0 &&
    signal.hiddenFiles === 0 &&
    signal.reasons.length === 1 &&
    signal.reasons[0] === UNKNOWN_SIGNAL_REASON &&
    signal.provenance.length === 0
  );
}

function evidenceReasonMatches(contract: EvidenceContract, reason: string): boolean {
  return contract.reasons.some((candidate) =>
    typeof candidate === "string" ? reason === candidate : candidate.test(reason),
  );
}

function validSignalFiles(
  files: unknown,
  hiddenFiles: unknown,
  impact: RiskImpactContext,
): files is string[] {
  if (
    !boundedStringArray(files, 25, 1_024) ||
    !uniqueStringArray(files) ||
    !nonnegativeInteger(hiddenFiles)
  ) {
    return false;
  }
  const hidden = Number(hiddenFiles);
  return (
    files.length + hidden <= impact.totalFiles &&
    hidden < impact.totalFiles &&
    (impact.truncated || hidden === 0) &&
    (impact.truncated || files.every((file) => impact.emittedPaths.has(file)))
  );
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function validNamingFallback(
  name: SignalName,
  value: Record<string, unknown>,
  impact: RiskImpactContext,
): boolean {
  if (
    !onlyKeys(value, ["observed", "confidence", "files", "hiddenFiles", "reasons", "provenance"]) ||
    typeof value.observed !== "boolean" ||
    value.confidence !== "low" ||
    !validSignalFiles(value.files, value.hiddenFiles, impact) ||
    !boundedStringArray(value.reasons, 4, 200) ||
    !uniqueStringArray(value.reasons) ||
    !boundedStringArray(value.provenance, 1, 80) ||
    !uniqueStringArray(value.provenance)
  ) {
    return false;
  }
  if (value.observed) {
    return (
      value.files.length + Number(value.hiddenFiles) > 0 &&
      value.reasons.length === 1 &&
      value.reasons[0] === FALLBACK_REASONS[name] &&
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
  const specializedCounters = [
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
  ] as const;
  const hasSpecializedWork = specializedCounters.some((key) => n(key) > 0);
  const completedFiles =
    n("attemptedFiles") - n("failedFiles") - n("oversizedFiles") - n("totalBudgetRejectedFiles");
  if (!stringArraysEqual(item.limitations as string[], expectedStructuralLimitations(item))) {
    return false;
  }

  return (
    n("selectedFiles") === Math.min(n("observedFiles"), n("fileBudget")) &&
    n("observedFiles") === n("selectedFiles") + n("filesOmittedByFileBudget") &&
    n("selectedFiles") === n("attemptedFiles") + n("unattemptedFiles") &&
    n("analyzedFiles") + n("oversizedFiles") + n("totalBudgetRejectedFiles") <=
      n("attemptedFiles") &&
    n("failedFiles") + n("oversizedFiles") + n("totalBudgetRejectedFiles") <= n("attemptedFiles") &&
    n("attemptedFiles") <=
      n("analyzedFiles") + n("failedFiles") + n("oversizedFiles") + n("totalBudgetRejectedFiles") &&
    n("totalBudgetRejectedFiles") <= 1 &&
    n("filesOmittedByTotalByteBudget") === n("totalBudgetRejectedFiles") + n("unattemptedFiles") &&
    n("omittedFiles") === n("filesOmittedByFileBudget") + n("filesOmittedByTotalByteBudget") &&
    n("observedCandidates") ===
      n("selectedCandidates") + n("omittedCandidates") + n("rejectedCandidates") &&
    n("selectedCandidates") >= n("selectedFiles") &&
    n("selectedCandidates") <= n("selectedFiles") * n("candidateBudgetPerFile") &&
    n("candidatesOmittedByFileBudget") >= n("filesOmittedByFileBudget") &&
    n("candidatesOmittedByFileBudget") <=
      n("filesOmittedByFileBudget") * n("candidateBudgetPerFile") &&
    n("candidatesOmittedByFileBudget") <= n("omittedCandidates") &&
    n("candidatesOmittedByFileBudget") > 0 === n("filesOmittedByFileBudget") > 0 &&
    (n("omittedCandidates") === n("candidatesOmittedByFileBudget") ||
      n("selectedCandidates") + n("candidatesOmittedByFileBudget") >=
        n("candidateBudgetPerFile")) &&
    n("sourceBytesAnalyzed") <= n("sourceBytesRead") &&
    n("sourceBytesRead") - n("sourceBytesAnalyzed") <=
      n("failedFiles") * n("sourceFileByteBudget") &&
    n("sourceBytesAnalyzed") <= (completedFiles + n("failedFiles")) * n("sourceFileByteBudget") &&
    minimumFailedFilesForSourceBytes(item) <= n("failedFiles") &&
    n("sourceBytesRead") <= n("totalSourceByteBudget") &&
    n("sourceBytesRead") <= (completedFiles + n("failedFiles")) * n("sourceFileByteBudget") &&
    completedFiles >= 0 &&
    completedFiles <= n("analyzedFiles") &&
    n("astNodesInspected") <= n("astNodeBudgetPerFile") * completedFiles &&
    n("astWorkUnits") <= n("astWorkUnitBudgetPerFile") * completedFiles &&
    n("astNodesInspected") >= completedFiles &&
    n("astWorkUnits") >= completedFiles &&
    n("astNodesInspected") <= n("astWorkUnits") &&
    n("astNodeBudgetHits") <= completedFiles &&
    n("astWorkBudgetHits") <= completedFiles &&
    n("astNodeBudgetHits") <= n("astWorkBudgetHits") &&
    n("astNodesInspected") >=
      n("astNodeBudgetHits") * Math.min(n("astNodeBudgetPerFile"), n("astWorkUnitBudgetPerFile")) &&
    n("astWorkUnits") >= n("astWorkBudgetHits") * n("astWorkUnitBudgetPerFile") &&
    (n("astWorkBudgetHits") > 0 ||
      n("astWorkUnits") >=
        n("astNodesInspected") +
          2 * n("targetOccurrencesAnalyzed") +
          Number(n("writeNodesAnalyzed") > 0)) &&
    n("targetOccurrencesObserved") + n("writeNodesObserved") + n("importNodesObserved") <=
      n("astNodesInspected") &&
    n("symbolBodiesObserved") <= n("targetOccurrencesAnalyzed") &&
    n("targetOccurrencesAnalyzed") <= n("targetOccurrenceBudgetPerFile") * completedFiles &&
    n("symbolBodiesAnalyzed") <= n("symbolBodyBudgetPerFile") * completedFiles &&
    n("writeNodesAnalyzed") <= n("writeNodeBudgetPerFile") * completedFiles &&
    n("importNodesAnalyzed") <= n("importNodeBudgetPerFile") * completedFiles &&
    (n("omittedTargetOccurrences") === 0 ||
      n("targetOccurrencesAnalyzed") >= n("targetOccurrenceBudgetPerFile")) &&
    (n("omittedSymbolBodies") === 0 || n("symbolBodiesAnalyzed") >= n("symbolBodyBudgetPerFile")) &&
    (n("omittedWriteNodes") === 0 || n("writeNodesAnalyzed") >= n("writeNodeBudgetPerFile")) &&
    (n("omittedImportNodes") === 0 || n("importNodesAnalyzed") >= n("importNodeBudgetPerFile")) &&
    (!hasSpecializedWork ||
      (n("analyzedFiles") > 0 &&
        n("sourceBytesAnalyzed") > 0 &&
        n("astNodesInspected") > 0 &&
        n("astWorkUnits") > 0)) &&
    n("filesOmittedByTotalByteBudget") > 0 === item.totalSourceByteBudgetExhausted &&
    (!item.totalSourceByteBudgetExhausted ||
      n("sourceBytesRead") > n("totalSourceByteBudget") - n("sourceFileByteBudget")) &&
    validObservedAnalyzedOmitted(item, "targetOccurrences") &&
    validObservedAnalyzedOmitted(item, "symbolBodies") &&
    validObservedAnalyzedOmitted(item, "writeNodes") &&
    validObservedAnalyzedOmitted(item, "importNodes")
  );
}

function expectedStructuralLimitations(item: Record<string, unknown>): string[] {
  const n = (key: string) => Number(item[key]);
  return [
    ...(n("omittedCandidates") > 0
      ? ["Structural source candidates exceeded an analysis budget and were omitted."]
      : []),
    ...(n("omittedFiles") > 0
      ? ["Structural source files exceeded an analysis budget and were omitted deterministically."]
      : []),
    ...(n("oversizedFiles") > 0
      ? [
          "Oversized structural source files were not read or parsed; affected signals remain unknown.",
        ]
      : []),
    ...(n("failedFiles") > 0
      ? [
          "Structural source analysis failed for one or more files; affected signals remain unknown.",
        ]
      : []),
    ...(n("astNodeBudgetHits") > 0 || n("astWorkBudgetHits") > 0
      ? [
          "Structural AST analysis reached a deterministic work budget; affected signals remain unknown.",
        ]
      : []),
    ...(n("omittedTargetOccurrences") > 0 ||
    n("omittedSymbolBodies") > 0 ||
    n("omittedWriteNodes") > 0 ||
    n("omittedImportNodes") > 0
      ? ["Structural AST evidence exceeded an item budget and was omitted deterministically."]
      : []),
    ...(item.totalSourceByteBudgetExhausted
      ? [
          "Structural source analysis reached its total byte budget; remaining signals remain unknown.",
        ]
      : []),
  ].sort();
}

function minimumFailedFilesForSourceBytes(item: Record<string, unknown>): number {
  const perFile = Number(item.sourceFileByteBudget);
  const sourceRead = Number(item.sourceBytesRead);
  const sourceAnalyzed = Number(item.sourceBytesAnalyzed);
  const completedFiles =
    Number(item.attemptedFiles) -
    Number(item.failedFiles) -
    Number(item.oversizedFiles) -
    Number(item.totalBudgetRejectedFiles);
  const parsedCapacity = completedFiles * perFile;
  const postReadFailures = Math.ceil(Math.max(0, sourceAnalyzed - parsedCapacity) / perFile);
  const partialBytes = sourceRead - sourceAnalyzed;
  const partialReadFailures = Math.ceil(partialBytes / (perFile - 1));
  return postReadFailures + partialReadFailures;
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

function uniqueStringArray(value: unknown): boolean {
  return Array.isArray(value) && new Set(value).size === value.length;
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
