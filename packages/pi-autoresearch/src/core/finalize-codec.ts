import type {
  AutoresearchFinalizationGroupDraftV1,
  AutoresearchFinalizationGroupsJsonDraftV1,
  AutoresearchFinalizationGroupV1,
  AutoresearchFinalizationPlanV1,
} from "./finalize-model.ts";

const AUTORESEARCH_FINALIZATION_PHASE = "bounded_runtime_kernel" as const;
const AUTORESEARCH_FINALIZE_TEMPLATE_NAME = "pi-autoresearch-finalize" as const;

export function parseAutoresearchFinalizationPlan(text: string): AutoresearchFinalizationPlanV1 {
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Finalization plan must decode to an object");
  }
  if (parsed.type !== "finalization_plan") {
    throw new Error(`Unsupported finalization plan type: ${String(parsed.type)}`);
  }
  if (parsed.version !== 1) {
    throw new Error(`Unsupported finalization plan version: ${String(parsed.version)}`);
  }
  if (parsed.phase !== AUTORESEARCH_FINALIZATION_PHASE) {
    throw new Error(`Unsupported finalization plan phase: ${String(parsed.phase)}`);
  }

  return {
    type: "finalization_plan",
    version: 1,
    phase: AUTORESEARCH_FINALIZATION_PHASE,
    cwd: coerceString(parsed.cwd, "cwd"),
    sourceBranch: coerceString(parsed.sourceBranch, "sourceBranch"),
    trunkRef: normalizeBranchRef(coerceString(parsed.trunkRef, "trunkRef")),
    baseRef: coerceString(parsed.baseRef, "baseRef"),
    finalTree: coerceString(parsed.finalTree, "finalTree"),
    goalSlug: normalizeGoalSlug(coerceString(parsed.goalSlug, "goalSlug")),
    segmentKey: parseNullableString(parsed.segmentKey, "segmentKey"),
    runtimeKey: parseNullableString(parsed.runtimeKey, "runtimeKey"),
    projectionSource: parseProjectionSource(parsed.projectionSource),
    createdAt: coerceNumber(parsed.createdAt, "createdAt"),
    decision: parseFinalizationDecisionSummary(parsed.decision),
    groups: parseFinalizationGroups(parsed.groups),
    groupsJsonDraft: parseFinalizationGroupsJsonDraft(parsed.groupsJsonDraft),
    approval: parseFinalizationApproval(parsed.approval),
    materialization: parseFinalizationMaterialization(parsed.materialization),
  };
}

function parseFinalizationDecisionSummary(
  value: unknown,
): AutoresearchFinalizationPlanV1["decision"] {
  if (!isRecord(value)) {
    throw new Error("decision must be an object");
  }
  if (value.templateName !== AUTORESEARCH_FINALIZE_TEMPLATE_NAME) {
    throw new Error(`Unsupported decision template: ${String(value.templateName)}`);
  }
  return {
    templateName: AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
    overallResult: coerceString(value.overallResult, "decision.overallResult"),
    groupingRationale: parseStringArray(value.groupingRationale, "decision.groupingRationale"),
    riskNotes: parseStringArray(value.riskNotes, "decision.riskNotes"),
    cleanupHints: parseStringArray(value.cleanupHints, "decision.cleanupHints"),
  };
}

function parseFinalizationGroups(value: unknown): AutoresearchFinalizationGroupV1[] {
  if (!Array.isArray(value)) {
    throw new Error("groups must be an array");
  }
  return value.map((group, index) => parseFinalizationGroup(group, index));
}

function parseFinalizationGroup(value: unknown, index: number): AutoresearchFinalizationGroupV1 {
  if (!isRecord(value)) {
    throw new Error(`groups[${index}] must be an object`);
  }
  return {
    index: coerceNumber(value.index, `groups[${index}].index`),
    title: coerceString(value.title, `groups[${index}].title`),
    slug: normalizeGoalSlug(coerceString(value.slug, `groups[${index}].slug`)),
    branchName: coerceString(value.branchName, `groups[${index}].branchName`),
    lastCommit: coerceString(value.lastCommit, `groups[${index}].lastCommit`),
    commits: parseStringArray(value.commits, `groups[${index}].commits`),
    files: parseStringArray(value.files, `groups[${index}].files`),
    metricEffect: coerceString(value.metricEffect, `groups[${index}].metricEffect`),
    dependencyNotes: parseStringArray(value.dependencyNotes, `groups[${index}].dependencyNotes`),
    body: coerceString(value.body, `groups[${index}].body`),
  };
}

export function parseFinalizationGroupsJsonDraft(
  value: unknown,
): AutoresearchFinalizationGroupsJsonDraftV1 {
  if (!isRecord(value)) {
    throw new Error("groupsJsonDraft must be an object");
  }
  const groupsValue = value.groups;
  if (!Array.isArray(groupsValue) || groupsValue.length === 0) {
    throw new Error("groupsJsonDraft.groups must be a non-empty array");
  }
  return {
    base: coerceString(value.base, "groupsJsonDraft.base"),
    trunk: normalizeBranchRef(coerceString(value.trunk, "groupsJsonDraft.trunk")),
    final_tree: coerceString(value.final_tree, "groupsJsonDraft.final_tree"),
    goal: normalizeGoalSlug(coerceString(value.goal, "groupsJsonDraft.goal")),
    groups: groupsValue.map((group, index) => parseFinalizationGroupDraft(group, index)),
  };
}

function parseFinalizationGroupDraft(
  value: unknown,
  index: number,
): AutoresearchFinalizationGroupDraftV1 {
  if (!isRecord(value)) {
    throw new Error(`groupsJsonDraft.groups[${index}] must be an object`);
  }
  return {
    title: coerceString(value.title, `groupsJsonDraft.groups[${index}].title`),
    body: coerceString(value.body, `groupsJsonDraft.groups[${index}].body`),
    last_commit: coerceString(value.last_commit, `groupsJsonDraft.groups[${index}].last_commit`),
    slug: normalizeGoalSlug(coerceString(value.slug, `groupsJsonDraft.groups[${index}].slug`)),
  };
}

function parseFinalizationApproval(value: unknown): AutoresearchFinalizationPlanV1["approval"] {
  if (!isRecord(value)) {
    throw new Error("approval must be an object");
  }
  const state = coerceString(value.state, "approval.state");
  if (
    state !== "pending" &&
    state !== "approved" &&
    state !== "materialized" &&
    state !== "superseded"
  ) {
    throw new Error(`Unsupported approval state: ${state}`);
  }
  return {
    required: true,
    state,
    reason: parseNullableString(value.reason, "approval.reason"),
    approvedAt: parseNullableNumber(value.approvedAt, "approval.approvedAt"),
  };
}

function parseFinalizationMaterialization(
  value: unknown,
): AutoresearchFinalizationPlanV1["materialization"] {
  if (!isRecord(value)) {
    throw new Error("materialization must be an object");
  }
  const status = coerceString(value.status, "materialization.status");
  if (status !== "not_started" && status !== "succeeded" && status !== "failed") {
    throw new Error(`Unsupported materialization status: ${status}`);
  }
  return {
    status,
    createdBranches: parseStringArray(value.createdBranches, "materialization.createdBranches"),
    verifiedAt: parseNullableNumber(value.verifiedAt, "materialization.verifiedAt"),
    failureReason: parseNullableString(value.failureReason, "materialization.failureReason"),
  };
}

function parseProjectionSource(value: unknown): "ledger" | "receipt_fallback" {
  if (value === "ledger" || value === "receipt_fallback") {
    return value;
  }
  throw new Error(`Unsupported projection source: ${String(value)}`);
}

export function normalizeGoalSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");
  if (!slug) {
    throw new Error(`Cannot derive a non-empty slug from ${JSON.stringify(value)}.`);
  }
  return slug;
}

export function normalizeBranchRef(value: string): string {
  return value.trim().replace(/^refs\/heads\//u, "") || "main";
}

function coerceString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function coerceNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function parseNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return coerceString(value, field);
}

function parseNullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return coerceNumber(value, field);
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value.map((entry, index) => coerceString(entry, `${field}[${index}]`));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
