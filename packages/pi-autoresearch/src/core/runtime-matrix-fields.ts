import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { isRecord } from "./runtime-common.ts";
import type { AutoresearchMatrixCampaignArtifactKind } from "./runtime-matrix-model.ts";

const AUTORESEARCH_MATRIX_CAMPAIGN_ARTIFACT_KINDS = new Set<string>([
  "autoresearch.matrix_campaign_plan.v1",
  "autoresearch.matrix_campaign_runner_contract.v1",
  "autoresearch.matrix_campaign_runner_checkpoint.v1",
  "autoresearch.matrix_campaign_review.v1",
  "autoresearch.matrix_campaign_cockpit.v1",
  "autoresearch.matrix_campaign_operator_followup.v1",
]);

export function getStringField(value: unknown, field: string): string | null {
  if (!isRecord(value)) return null;
  const candidate = value[field];
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : null;
}

export function getNumberField(value: unknown, field: string): number | null {
  if (!isRecord(value)) return null;
  const candidate = value[field];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

export function getRecordField(value: unknown, field: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const candidate = value[field];
  return isRecord(candidate) ? candidate : null;
}

export function getArrayField(value: unknown, field: string): unknown[] {
  if (!isRecord(value)) return [];
  const candidate = value[field];
  return Array.isArray(candidate) ? candidate : [];
}

export function getStringArrayField(value: unknown, field: string): string[] {
  return getArrayField(value, field).filter(
    (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0,
  );
}

export function isAutoresearchMatrixCampaignArtifactKind(
  value: string | null,
): value is AutoresearchMatrixCampaignArtifactKind {
  return value !== null && AUTORESEARCH_MATRIX_CAMPAIGN_ARTIFACT_KINDS.has(value);
}

export function collectJsonFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(fullPath);
      }
    }
  };
  visit(root);
  return files.sort();
}

type ExtractedMatrixCampaignArtifact = {
  kind: AutoresearchMatrixCampaignArtifactKind;
  artifact: Record<string, unknown>;
  source: string;
};

export function extractMatrixArtifactsFromJson(value: unknown): ExtractedMatrixCampaignArtifact[] {
  const found: ExtractedMatrixCampaignArtifact[] = [];
  const maybeAdd = (candidate: unknown, source: string) => {
    if (!isRecord(candidate)) return;
    const kind = getStringField(candidate, "kind");
    if (isAutoresearchMatrixCampaignArtifactKind(kind)) {
      found.push({ kind, artifact: candidate, source });
    }
  };

  maybeAdd(value, "root");
  const details = getRecordField(value, "details");
  const unwrapSources: [string, unknown][] = [
    ["matrixCampaign", getRecordField(value, "matrixCampaign")],
    ["matrixCampaignRunner", getRecordField(value, "matrixCampaignRunner")],
    ["matrixCampaignRunnerCheckpoint", getRecordField(value, "matrixCampaignRunnerCheckpoint")],
    ["matrixCampaignReview", getRecordField(value, "matrixCampaignReview")],
    ["cockpit", getRecordField(value, "cockpit")],
    ["operatorFollowup", getRecordField(value, "operatorFollowup")],
    ["details.matrixCampaign", getRecordField(details, "matrixCampaign")],
    ["details.matrixCampaignRunner", getRecordField(details, "matrixCampaignRunner")],
    [
      "details.matrixCampaignRunnerCheckpoint",
      getRecordField(details, "matrixCampaignRunnerCheckpoint"),
    ],
    ["details.matrixCampaignReview", getRecordField(details, "matrixCampaignReview")],
  ];
  for (const [source, candidate] of unwrapSources) maybeAdd(candidate, source);

  return found;
}

export function readMatrixArtifactJson(filePath: string): unknown | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

export function relativeAutoresearchPath(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath).replaceAll(path.sep, "/");
}

export function inferMatrixCellIdFromPath(relativePath: string): string | null {
  return relativePath.match(/(cell-\d{2}-\d{2})/u)?.[1] ?? null;
}
