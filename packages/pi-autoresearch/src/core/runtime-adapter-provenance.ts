import { parseRunExecution, parseRunProtocol, parseRunProvenance } from "./runtime-provenance.ts";
import { isAutoresearchEmpiricalDecisionClass } from "./runtime-receipts.ts";

/** Shared candidate/historical validation: malformed present fields never become legacy unknowns. */
export function validateRunProvenanceFields(
  run: Record<string, unknown>,
  prefix: string,
  addIssue: (pathName: string, message: string) => void,
): void {
  if (
    run.empiricalDecisionClass !== undefined &&
    !isAutoresearchEmpiricalDecisionClass(run.empiricalDecisionClass)
  )
    addIssue(
      `${prefix}empiricalDecisionClass`,
      "Invalid present historical classification; no legacy downgrade.",
    );
  for (const [key, parser] of [
    ["provenance", parseRunProvenance],
    ["execution", parseRunExecution],
  ] as const) {
    try {
      parser(run[key]);
    } catch (error) {
      addIssue(`${prefix}${key}`, String(error));
    }
  }
  try {
    parseRunProtocol(run);
  } catch (error) {
    addIssue(`${prefix}executionProtocol`, String(error));
  }
  for (const key of ["benchmarkCommand", "checksCommand"]) {
    if (run[key] !== undefined && run[key] !== null && typeof run[key] !== "string")
      addIssue(`${prefix}${key}`, "Command must be text, null or absent.");
  }
}
