import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CASEBOOK_DIR = path.dirname(fileURLToPath(import.meta.url));

export function getExecutionSeamCasesDir() {
  return CASEBOOK_DIR;
}

export function listExecutionSeamCaseIds() {
  return fs
    .readdirSync(CASEBOOK_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/, ""))
    .sort();
}

export function resolveExecutionSeamCasePath(caseId) {
  return path.join(CASEBOOK_DIR, `${caseId}.json`);
}

export function loadExecutionSeamCase(caseId) {
  const casePath = resolveExecutionSeamCasePath(caseId);
  if (!fs.existsSync(casePath)) {
    throw new Error(
      `Unknown execution seam case '${caseId}'. Available: ${listExecutionSeamCaseIds().join(", ")}`,
    );
  }

  return JSON.parse(fs.readFileSync(casePath, "utf8"));
}
