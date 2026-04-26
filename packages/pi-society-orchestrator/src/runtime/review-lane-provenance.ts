import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkflowAgentName, WorkflowStatus } from "./workflow.ts";

export const PI_PROVENANCE_REVIEW_LANE_ID = "PI_PROVENANCE_REVIEW_LANE_ID";
export const PI_PROVENANCE_OUTPUT_FILE = "PI_PROVENANCE_OUTPUT_FILE";

const DEFAULT_PROVENANCE_ARTIFACT_ROOT = path.join(os.tmpdir(), "pi-orch-review-lane-provenance");
const PROVENANCE_EXTENSION_RELATIVE_PATH = path.join(
  "..",
  "pi-provenance",
  "extensions",
  "provenance.ts",
);

export type ReviewLaneProvenanceMode = "off" | "review_lane";

export interface ReviewLaneProvenanceConfig {
  mode: ReviewLaneProvenanceMode;
  artifactRoot?: string;
  extensionPath?: string;
}

export interface ReviewLaneProvenanceRequest {
  laneId: string;
  outputFile: string;
  extensionPath?: string;
  warning?: string;
}

export type ReviewLaneProvenanceStatus = "captured" | "missing" | "unavailable" | "invalid";

export interface ReviewLaneProvenanceResult {
  status: ReviewLaneProvenanceStatus;
  laneId: string;
  path: string;
  provenance?: unknown;
  warning?: string;
  error?: string;
}

export function createReviewLaneProvenanceRequest(input: {
  config?: ReviewLaneProvenanceConfig;
  runId: string;
  stepIndex: number;
  agent: WorkflowAgentName;
}): ReviewLaneProvenanceRequest | undefined {
  if (!input.config || input.config.mode === "off") {
    return undefined;
  }

  const laneId = `orch-review-lane:${input.runId}:${input.stepIndex}:${input.agent}`;
  const artifactRoot = path.resolve(
    input.config.artifactRoot ||
      process.env.PI_ORCH_PROVENANCE_ARTIFACT_ROOT ||
      DEFAULT_PROVENANCE_ARTIFACT_ROOT,
  );
  const outputFile = path.join(
    artifactRoot,
    input.runId,
    "provenance",
    `${safeFileStem(laneId)}.json`,
  );
  const resolvedExtensionPath = resolvePiProvenanceExtensionPath(input.config.extensionPath);

  return {
    laneId,
    outputFile,
    ...(resolvedExtensionPath.path ? { extensionPath: resolvedExtensionPath.path } : {}),
    ...(resolvedExtensionPath.warning ? { warning: resolvedExtensionPath.warning } : {}),
  };
}

export function buildReviewLaneProvenanceEnv(
  request: ReviewLaneProvenanceRequest | undefined,
): Record<string, string> | undefined {
  if (!request || !request.extensionPath) {
    return undefined;
  }

  return {
    [PI_PROVENANCE_REVIEW_LANE_ID]: request.laneId,
    [PI_PROVENANCE_OUTPUT_FILE]: request.outputFile,
  };
}

export function mergeUniqueStrings(...groups: Array<string[] | undefined>): string[] | undefined {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const value of group ?? []) {
      if (seen.has(value)) {
        continue;
      }
      seen.add(value);
      merged.push(value);
    }
  }

  return merged.length > 0 ? merged : undefined;
}

export function readReviewLaneProvenanceResult(input: {
  request: ReviewLaneProvenanceRequest | undefined;
  stepStatus: WorkflowStatus;
}): ReviewLaneProvenanceResult | undefined {
  const request = input.request;
  if (!request) {
    return undefined;
  }

  if (!request.extensionPath) {
    return {
      status: "unavailable",
      laneId: request.laneId,
      path: request.outputFile,
      warning:
        request.warning ||
        "pi-provenance extension path was not available; provenance capture was not requested.",
    };
  }

  if (!fs.existsSync(request.outputFile)) {
    return {
      status: input.stepStatus === "done" ? "missing" : "unavailable",
      laneId: request.laneId,
      path: request.outputFile,
      warning:
        input.stepStatus === "done"
          ? "provenance_missing: review lane completed but no pi-provenance sidecar was written."
          : `provenance_unavailable: review lane ended with status ${input.stepStatus}.`,
    };
  }

  try {
    const provenance = JSON.parse(fs.readFileSync(request.outputFile, "utf-8"));
    return {
      status: "captured",
      laneId: request.laneId,
      path: request.outputFile,
      provenance,
    };
  } catch (error) {
    return {
      status: "invalid",
      laneId: request.laneId,
      path: request.outputFile,
      warning: "provenance_invalid: pi-provenance sidecar was present but not valid JSON.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function formatReviewLaneProvenanceLine(
  result: ReviewLaneProvenanceResult | undefined,
): string | undefined {
  if (!result) {
    return undefined;
  }

  if (result.status === "captured") {
    return `Provenance: captured (${result.path})`;
  }

  const reason = result.warning || result.error || result.status;
  return `Provenance: ${result.status} (${reason}; path: ${result.path})`;
}

function resolvePiProvenanceExtensionPath(overridePath?: string): {
  path?: string;
  warning?: string;
} {
  const candidates = [
    overridePath,
    process.env.PI_ORCH_PROVENANCE_EXTENSION_PATH,
    defaultMonorepoPiProvenanceExtensionPath(),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return { path: resolved };
    }
  }

  return {
    warning:
      "pi-provenance extension path could not be resolved; set PI_ORCH_PROVENANCE_EXTENSION_PATH or pass provenance.extensionPath.",
  };
}

function defaultMonorepoPiProvenanceExtensionPath(): string {
  const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
  const orchestratorPackageRoot = path.resolve(runtimeDir, "..", "..");
  return path.resolve(orchestratorPackageRoot, PROVENANCE_EXTENSION_RELATIVE_PATH);
}

function safeFileStem(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "_");
  return safe.length > 0 ? safe : "review-lane";
}
