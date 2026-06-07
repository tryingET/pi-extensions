import {
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
  type FinalizeDecisionGroup,
  type FinalizeDecisionResult,
  type FinalizeDecisionStatus,
  type NextHypothesisDecisionResult,
  type NextHypothesisDecisionStatus,
  type SetupDecisionChecksRequired,
  type SetupDecisionPrimaryMetric,
  type SetupDecisionResult,
  type SetupDecisionStatus,
} from "./decisions-model.ts";
import type { MetricDirection } from "./runtime.ts";

const SETUP_REQUIRED_SECTIONS = [
  "STATUS",
  "GOAL",
  "PRIMARY_METRIC",
  "SECONDARY_METRICS",
  "BENCHMARK_COMMAND",
  "FILES_IN_SCOPE",
  "OFF_LIMITS",
  "HARD_CONSTRAINTS",
  "CHECKS_REQUIRED",
  "AUTORESEARCH_MD_PLAN",
  "AUTORESEARCH_SH_CONTRACT",
  "BASELINE_PLAN",
  "FIRST_EXPERIMENT_RULES",
  "MISSING_INFORMATION",
] as const;

const NEXT_HYPOTHESIS_REQUIRED_SECTIONS = [
  "STATUS",
  "STATE_READ",
  "NEXT_HYPOTHESIS",
  "WHY_NOW",
  "TARGET_FILES",
  "CHANGE_SHAPE",
  "EXPECTED_PRIMARY_EFFECT",
  "RISK_TO_GUARD",
  "RUN_PLAN",
  "ASI_TO_CAPTURE_IF_KEPT",
  "ASI_TO_CAPTURE_IF_DISCARDED",
  "STOP_CONDITION",
] as const;

const FINALIZE_REQUIRED_SECTIONS = [
  "STATUS",
  "BASE_REF",
  "TRUNK_REF",
  "OVERALL_RESULT",
  "PROPOSED_GROUPS",
  "GROUPING_RATIONALE",
  "APPROVAL_REQUIRED",
  "GROUPS_JSON_DRAFT",
  "RISK_NOTES",
  "CLEANUP_HINTS",
] as const;
export function parseSetupDecisionOutput(output: string): SetupDecisionResult {
  const sections = extractRequiredSections(output, SETUP_REQUIRED_SECTIONS);
  const status = parseEnumValue<SetupDecisionStatus>(sections.get("STATUS"), "STATUS", [
    "ready",
    "blocked",
  ]);
  const result: SetupDecisionResult = {
    kind: "setup",
    templateName: AUTORESEARCH_SETUP_TEMPLATE_NAME,
    status,
    goal: parseRequiredText(sections.get("GOAL"), "GOAL"),
    primaryMetric: parsePrimaryMetric(sections.get("PRIMARY_METRIC")),
    secondaryMetrics: parseStringList(sections.get("SECONDARY_METRICS"), "SECONDARY_METRICS", {
      splitOnComma: true,
    }),
    benchmarkCommand: parseRequiredText(sections.get("BENCHMARK_COMMAND"), "BENCHMARK_COMMAND"),
    filesInScope: parseStringList(sections.get("FILES_IN_SCOPE"), "FILES_IN_SCOPE", {
      splitOnComma: true,
    }),
    offLimits: parseStringList(sections.get("OFF_LIMITS"), "OFF_LIMITS", {
      splitOnComma: true,
    }),
    hardConstraints: parseStringList(sections.get("HARD_CONSTRAINTS"), "HARD_CONSTRAINTS"),
    checksRequired: parseEnumValue<SetupDecisionChecksRequired>(
      sections.get("CHECKS_REQUIRED"),
      "CHECKS_REQUIRED",
      ["none", "reuse_existing_checks", "create_autoresearch_checks_sh"],
    ),
    autoresearchMdPlan: parseStringList(
      sections.get("AUTORESEARCH_MD_PLAN"),
      "AUTORESEARCH_MD_PLAN",
    ),
    autoresearchShContract: parseStringList(
      sections.get("AUTORESEARCH_SH_CONTRACT"),
      "AUTORESEARCH_SH_CONTRACT",
    ),
    baselinePlan: parseStringList(sections.get("BASELINE_PLAN"), "BASELINE_PLAN"),
    firstExperimentRules: parseStringList(
      sections.get("FIRST_EXPERIMENT_RULES"),
      "FIRST_EXPERIMENT_RULES",
    ),
    missingInformation: parseStringList(sections.get("MISSING_INFORMATION"), "MISSING_INFORMATION"),
  };

  if (result.status === "blocked" && result.missingInformation.length === 0) {
    throw new Error("Blocked setup decisions must name the missing information.");
  }

  return result;
}

export function parseNextHypothesisDecisionOutput(output: string): NextHypothesisDecisionResult {
  const sections = extractRequiredSections(output, NEXT_HYPOTHESIS_REQUIRED_SECTIONS);

  return {
    kind: "next_hypothesis",
    templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
    status: parseEnumValue<NextHypothesisDecisionStatus>(sections.get("STATUS"), "STATUS", [
      "ready",
      "rebaseline_needed",
      "finalize_candidate",
      "blocked",
    ]),
    stateRead: parseRequiredText(sections.get("STATE_READ"), "STATE_READ"),
    nextHypothesis: parseRequiredText(sections.get("NEXT_HYPOTHESIS"), "NEXT_HYPOTHESIS"),
    whyNow: parseRequiredText(sections.get("WHY_NOW"), "WHY_NOW"),
    targetFiles: parseStringList(sections.get("TARGET_FILES"), "TARGET_FILES", {
      splitOnComma: true,
    }),
    changeShape: parseStringList(sections.get("CHANGE_SHAPE"), "CHANGE_SHAPE"),
    expectedPrimaryEffect: parseRequiredText(
      sections.get("EXPECTED_PRIMARY_EFFECT"),
      "EXPECTED_PRIMARY_EFFECT",
    ),
    riskToGuard: parseStringList(sections.get("RISK_TO_GUARD"), "RISK_TO_GUARD"),
    runPlan: parseStringList(sections.get("RUN_PLAN"), "RUN_PLAN"),
    asiToCaptureIfKept: parseStringList(
      sections.get("ASI_TO_CAPTURE_IF_KEPT"),
      "ASI_TO_CAPTURE_IF_KEPT",
    ),
    asiToCaptureIfDiscarded: parseStringList(
      sections.get("ASI_TO_CAPTURE_IF_DISCARDED"),
      "ASI_TO_CAPTURE_IF_DISCARDED",
    ),
    stopCondition: parseStringList(sections.get("STOP_CONDITION"), "STOP_CONDITION"),
  };
}

export function parseFinalizeDecisionOutput(output: string): FinalizeDecisionResult {
  const sections = extractRequiredSections(output, FINALIZE_REQUIRED_SECTIONS);
  const status = parseEnumValue<FinalizeDecisionStatus>(sections.get("STATUS"), "STATUS", [
    "ready",
    "blocked",
  ]);
  const proposedGroups = parseProposedGroups(sections.get("PROPOSED_GROUPS"));

  if (status === "ready" && proposedGroups.length === 0) {
    throw new Error("Ready finalize decisions must include at least one proposed group.");
  }

  return {
    kind: "finalize",
    templateName: AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
    status,
    baseRef: parseRequiredText(sections.get("BASE_REF"), "BASE_REF"),
    trunkRef: parseRequiredText(sections.get("TRUNK_REF"), "TRUNK_REF"),
    overallResult: parseRequiredText(sections.get("OVERALL_RESULT"), "OVERALL_RESULT"),
    proposedGroups,
    groupingRationale: parseStringList(sections.get("GROUPING_RATIONALE"), "GROUPING_RATIONALE"),
    approvalRequired: parseApprovalRequired(sections.get("APPROVAL_REQUIRED")),
    groupsJsonDraft: parseJsonDraft(sections.get("GROUPS_JSON_DRAFT")),
    riskNotes: parseStringList(sections.get("RISK_NOTES"), "RISK_NOTES"),
    cleanupHints: parseStringList(sections.get("CLEANUP_HINTS"), "CLEANUP_HINTS"),
  };
}
function extractRequiredSections(
  output: string,
  requiredLabels: readonly string[],
): Map<string, string> {
  const normalizedOutput = output.replace(/\r\n?/g, "\n");
  const required = new Set(requiredLabels);
  const sections = new Map<string, string>();
  let activeLabel: string | null = null;
  let activeLines: string[] = [];

  const flush = () => {
    if (!activeLabel) return;
    sections.set(activeLabel, normalizeSectionValue(activeLines));
  };

  for (const line of normalizedOutput.split("\n")) {
    const labelMatch = /^\s*([A-Z][A-Z0-9_]*):(.*)$/.exec(line);
    if (labelMatch && required.has(labelMatch[1])) {
      if (sections.has(labelMatch[1]) || activeLabel === labelMatch[1]) {
        throw new Error(`Duplicate required section: ${labelMatch[1]}.`);
      }
      flush();
      activeLabel = labelMatch[1];
      activeLines = [labelMatch[2].trim()];
      continue;
    }

    if (activeLabel) {
      activeLines.push(line);
    }
  }

  flush();

  for (const label of requiredLabels) {
    if (!sections.has(label)) {
      throw new Error(`Missing required section: ${label}.`);
    }
  }

  return sections;
}

function normalizeSectionValue(lines: readonly string[]): string {
  const joined = lines.join("\n").trim();
  return joined;
}

function parsePrimaryMetric(value: string | undefined): SetupDecisionPrimaryMetric {
  const text = parseRequiredText(value, "PRIMARY_METRIC");
  const match = /^(.*?)\s*\((.*?),\s*(lower|higher)\s+is\s+better\)$/iu.exec(text);
  if (!match) {
    throw new Error("PRIMARY_METRIC must look like <name> (<unit>, lower|higher is better).");
  }

  const name = normalizeInlineText(match[1]);
  const unit = match[2].trim();
  const direction = match[3] as MetricDirection;
  if (!name) {
    throw new Error("PRIMARY_METRIC name cannot be empty.");
  }

  return { name, unit, direction };
}

function parseRequiredText(value: string | undefined, field: string): string {
  const normalized = normalizeInlineText(value ?? "");
  if (!normalized) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return normalized;
}

function parseStringList(
  value: string | undefined,
  field: string,
  options: { splitOnComma?: boolean } = {},
): string[] {
  const normalized = (value ?? "").trim();
  if (!normalized || /^none$/iu.test(normalized)) {
    return [];
  }

  const lineItems = normalized
    .split("\n")
    .map((line) => stripMarkdownListPrefix(line))
    .map((line) => line.trim())
    .filter(Boolean);

  const items =
    options.splitOnComma && lineItems.length <= 1 && lineItems[0]?.includes(",")
      ? lineItems[0]
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : lineItems;

  const normalizedItems = items.map((item) => normalizeInlineText(item)).filter(Boolean);
  if (normalizedItems.length === 0) {
    throw new Error(`${field} must contain at least one item or 'none'.`);
  }
  return normalizedItems;
}

function parseEnumValue<T extends string>(
  value: string | undefined,
  field: string,
  allowedValues: readonly T[],
): T {
  const normalized = normalizeInlineText(value ?? "") as T;
  if (allowedValues.includes(normalized)) {
    return normalized;
  }

  throw new Error(`${field} must be one of: ${allowedValues.join(", ")}.`);
}

function parseApprovalRequired(value: string | undefined): true {
  const normalized = normalizeInlineText(value ?? "").toLowerCase();
  if (normalized !== "yes") {
    throw new Error("APPROVAL_REQUIRED must be 'yes'.");
  }
  return true;
}

function parseJsonDraft(value: string | undefined): unknown {
  const text = parseRequiredText(value, "GROUPS_JSON_DRAFT");
  const unwrapped = unwrapFencedCodeBlock(text);
  try {
    return JSON.parse(unwrapped);
  } catch (error) {
    throw new Error(`GROUPS_JSON_DRAFT must be valid JSON. ${describeError(error)}`);
  }
}

function parseProposedGroups(value: string | undefined): FinalizeDecisionGroup[] {
  const text = (value ?? "").trim();
  if (!text || /^none$/iu.test(text)) {
    return [];
  }

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const groups: Array<{ header: string; lines: string[] }> = [];
  let currentHeader: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentHeader) return;
    groups.push({ header: currentHeader, lines: [...currentLines] });
  };

  for (const line of lines) {
    const match = /^\s*(\d+)\.\s*(.*)$/.exec(line);
    if (match) {
      flush();
      currentHeader = match[2].trim();
      currentLines = [];
      continue;
    }
    if (currentHeader !== null) {
      currentLines.push(line);
    }
  }

  flush();

  if (groups.length === 0) {
    throw new Error("PROPOSED_GROUPS must use numbered groups.");
  }

  return groups.map((group) => parseProposedGroup(group.header, group.lines));
}

function parseProposedGroup(header: string, lines: readonly string[]): FinalizeDecisionGroup {
  const fields = extractFlexibleFields([header, ...lines]);
  const title =
    fields.title !== null
      ? parseRequiredText(fields.title, "PROPOSED_GROUPS.title")
      : parseRequiredText(header, "PROPOSED_GROUPS.title");

  return {
    title,
    commits: parseStringList(fields.commits ?? undefined, "PROPOSED_GROUPS.commits", {
      splitOnComma: true,
    }),
    files: parseStringList(fields.files ?? undefined, "PROPOSED_GROUPS.files", {
      splitOnComma: true,
    }),
    metricEffect: parseRequiredText(
      fields.metricEffect ?? undefined,
      "PROPOSED_GROUPS.metricEffect",
    ),
    dependencyNotes: parseStringList(
      fields.dependencyNotes ?? undefined,
      "PROPOSED_GROUPS.dependencyNotes",
    ),
  };
}

function extractFlexibleFields(lines: readonly string[]): {
  title: string | null;
  commits: string | null;
  files: string | null;
  metricEffect: string | null;
  dependencyNotes: string | null;
} {
  const fields = new Map<string, string>();
  let currentField: string | null = null;
  let buffer: string[] = [];
  let headerTitle: string | null = null;

  const flush = () => {
    if (!currentField) return;
    fields.set(currentField, normalizeSectionValue(buffer));
  };

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (index === 0 && trimmed.length > 0 && !looksLikeFlexibleField(trimmed)) {
      headerTitle = trimmed;
      continue;
    }

    const fieldMatch = /^\s*(?:[-*]\s*)?([A-Za-z][A-Za-z_ ]+):(.*)$/.exec(line);
    const fieldName = normalizeFlexibleFieldName(fieldMatch?.[1] ?? "");
    if (fieldMatch && fieldName) {
      if (fields.has(fieldName) || currentField === fieldName) {
        throw new Error(`Duplicate finalize group field: ${fieldName}.`);
      }
      flush();
      currentField = fieldName;
      buffer = [fieldMatch[2].trim()];
      continue;
    }

    if (currentField) {
      buffer.push(line);
      continue;
    }

    if (trimmed.length > 0 && index !== 0) {
      throw new Error(`Unexpected finalize group content: ${trimmed}`);
    }
  }

  flush();

  return {
    title: fields.get("title") ?? headerTitle,
    commits: fields.get("commits") ?? null,
    files: fields.get("files") ?? null,
    metricEffect: fields.get("metricEffect") ?? null,
    dependencyNotes: fields.get("dependencyNotes") ?? null,
  };
}

function looksLikeFlexibleField(line: string): boolean {
  return (
    normalizeFlexibleFieldName(/^\s*(?:[-*]\s*)?([A-Za-z][A-Za-z_ ]+):/.exec(line)?.[1] ?? "") !==
    null
  );
}

function normalizeFlexibleFieldName(value: string): string | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, " ");
  switch (normalized) {
    case "title":
      return "title";
    case "commits":
      return "commits";
    case "files":
      return "files";
    case "metric effect":
      return "metricEffect";
    case "dependency notes":
      return "dependencyNotes";
    default:
      return null;
  }
}

function unwrapFencedCodeBlock(value: string): string {
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(value.trim());
  return fencedMatch ? fencedMatch[1].trim() : value.trim();
}

function stripMarkdownListPrefix(line: string): string {
  return line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "");
}

function normalizeInlineText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
