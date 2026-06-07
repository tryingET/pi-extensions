import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildAutoresearchSegmentCloseout } from "./runtime.ts";
import { AUTORESEARCH_DASHBOARD_EXPORT_FILE } from "./runtime-constants.ts";
import { renderAutoresearchDashboardHtml } from "./runtime-dashboard-html.ts";
import { discoverAutoresearchMatrixCampaignArtifacts } from "./runtime-matrix.ts";
import type { AutoresearchDashboardExportResult } from "./runtime-model.ts";
import { buildAutoresearchRuntimeStatus } from "./runtime-status.ts";

export function exportAutoresearchDashboardHtml(input: {
  cwd: string;
  outputPath?: string;
}): AutoresearchDashboardExportResult {
  const cwd = path.resolve(input.cwd);
  const outputPath = path.resolve(cwd, input.outputPath ?? AUTORESEARCH_DASHBOARD_EXPORT_FILE);
  const status = buildAutoresearchRuntimeStatus(cwd);
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  const matrixSummary = discoverAutoresearchMatrixCampaignArtifacts(cwd);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    renderAutoresearchDashboardHtml(status, closeout, matrixSummary),
    "utf8",
  );
  return {
    cwd,
    path: outputPath,
    fileUrl: pathToFileURL(outputPath).href,
    refreshedAt: Date.now(),
    status,
  };
}
