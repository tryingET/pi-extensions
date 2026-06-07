import type {
  AutoresearchCandidateBinding,
  AutoresearchCandidateBindingInput,
  AutoresearchCandidateBindingSource,
  AutoresearchExperimentLineage,
  AutoresearchExperimentLineageInput,
} from "./runtime.ts";
import { isRecord, normalizeArray, parseStringArray, stringOrNull } from "./runtime-common.ts";

export function normalizeCandidateBinding(
  input: AutoresearchCandidateBindingInput | null | undefined,
): AutoresearchCandidateBinding | undefined {
  if (!input) return undefined;
  const binding: AutoresearchCandidateBinding = {
    source: isAutoresearchCandidateBindingSource(input.source) ? input.source : null,
    worktreePath: stringOrNull(input.worktreePath),
    branch: stringOrNull(input.branch),
    baseRef: stringOrNull(input.baseRef),
    diffSummary: stringOrNull(input.diffSummary),
    filesChanged: normalizeArray(input.filesChanged),
  };
  return binding.source ||
    binding.worktreePath ||
    binding.branch ||
    binding.baseRef ||
    binding.diffSummary ||
    binding.filesChanged.length > 0
    ? binding
    : undefined;
}

export function parseCandidateBinding(value: unknown): AutoresearchCandidateBinding | undefined {
  if (!isRecord(value)) return undefined;
  return normalizeCandidateBinding({
    source: isAutoresearchCandidateBindingSource(value.source) ? value.source : null,
    worktreePath: value.worktreePath === null ? null : stringOrNull(value.worktreePath),
    branch: value.branch === null ? null : stringOrNull(value.branch),
    baseRef: value.baseRef === null ? null : stringOrNull(value.baseRef),
    diffSummary: value.diffSummary === null ? null : stringOrNull(value.diffSummary),
    filesChanged: parseStringArray(value.filesChanged),
  });
}

export function isAutoresearchCandidateBindingSource(
  value: unknown,
): value is AutoresearchCandidateBindingSource {
  return value === "candidate_peer_spawn" || value === "manual";
}

export function normalizeExperimentLineage(
  input: AutoresearchExperimentLineageInput | null | undefined,
): AutoresearchExperimentLineage | undefined {
  if (!input) return undefined;
  const candidate = normalizeCandidateBinding(input.candidate);
  const lineage: AutoresearchExperimentLineage = {
    hypothesisId: stringOrNull(input.hypothesisId),
    hypothesis: stringOrNull(input.hypothesis),
    interventionSummary: stringOrNull(input.interventionSummary),
    expectedPrimaryEffect: stringOrNull(input.expectedPrimaryEffect),
    targetFiles: normalizeArray(input.targetFiles),
    risk: stringOrNull(input.risk),
    ...(candidate ? { candidate } : {}),
  };
  return lineage.hypothesisId ||
    lineage.hypothesis ||
    lineage.interventionSummary ||
    lineage.expectedPrimaryEffect ||
    lineage.targetFiles.length > 0 ||
    lineage.risk ||
    lineage.candidate
    ? lineage
    : undefined;
}

export function parseExperimentLineage(value: unknown): AutoresearchExperimentLineage | undefined {
  if (!isRecord(value)) return undefined;
  return normalizeExperimentLineage({
    hypothesisId: value.hypothesisId === null ? null : stringOrNull(value.hypothesisId),
    hypothesis: value.hypothesis === null ? null : stringOrNull(value.hypothesis),
    interventionSummary:
      value.interventionSummary === null ? null : stringOrNull(value.interventionSummary),
    expectedPrimaryEffect:
      value.expectedPrimaryEffect === null ? null : stringOrNull(value.expectedPrimaryEffect),
    targetFiles: parseStringArray(value.targetFiles),
    risk: value.risk === null ? null : stringOrNull(value.risk),
    candidate: parseCandidateBinding(value.candidate),
  });
}
