import path from "node:path";
import { isDeepStrictEqual } from "node:util";

/** Owner declarations, not authenticated attestations or execution authority. */
export interface RunMatrixContext {
  taskId: number;
  objective: string;
  cellId: string;
  laneId: string;
  hypothesis: string;
  implementationId: string;
}
export interface RunMeasurementContext {
  scenario: string;
  evaluator: string;
  evaluatorRevision: string;
  subject: string;
  subjectRevision: string;
  workloadRevision: string;
}
export interface RunProvenance {
  matrix?: RunMatrixContext;
  measurement?: RunMeasurementContext;
}
export interface RunExecutionRecord {
  cwd: string;
  benchmark: {
    exitCode: number | null;
    timedOut: boolean;
    aborted: boolean;
    outputLimitExceeded?: boolean;
  };
  checks: {
    state: "disabled" | "skipped" | "passed" | "failed";
    exitCode: number | null;
    timedOut: boolean;
    aborted: boolean;
    outputLimitExceeded?: boolean;
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Provenance must be an object.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 8192)
    throw new Error("Provenance requires bounded non-empty exact text.");
  return value;
}
function revision(value: unknown): string {
  const result = text(value);
  if (!/^sha256:[a-f0-9]{64}$/u.test(result))
    throw new Error("Provenance revision must be a pinned sha256 digest.");
  return result;
}
function exactKeys(value: Record<string, unknown>, expected: string[]) {
  if (Object.keys(value).some((k) => !expected.includes(k)))
    throw new Error("Unknown provenance field.");
}
/** Missing historical fields stay absent. Malformed present fields never downgrade to legacy. */
export function parseRunProvenance(value: unknown): RunProvenance | undefined {
  if (value === undefined) return undefined;
  const v = object(value);
  exactKeys(v, ["matrix", "measurement"]);
  if (!Object.keys(v).length) throw new Error("Empty provenance.");
  const result: RunProvenance = {};
  if (Object.hasOwn(v, "matrix")) {
    const m = object(v.matrix);
    exactKeys(m, ["taskId", "objective", "cellId", "laneId", "hypothesis", "implementationId"]);
    if (!Number.isSafeInteger(m.taskId) || (m.taskId as number) <= 0)
      throw new Error("Invalid provenance taskId.");
    result.matrix = {
      taskId: m.taskId as number,
      objective: text(m.objective),
      cellId: text(m.cellId),
      laneId: text(m.laneId),
      hypothesis: text(m.hypothesis),
      implementationId: text(m.implementationId),
    };
  }
  if (Object.hasOwn(v, "measurement")) {
    const m = object(v.measurement);
    exactKeys(m, [
      "scenario",
      "evaluator",
      "evaluatorRevision",
      "subject",
      "subjectRevision",
      "workloadRevision",
    ]);
    result.measurement = {
      scenario: text(m.scenario),
      evaluator: text(m.evaluator),
      evaluatorRevision: revision(m.evaluatorRevision),
      subject: text(m.subject),
      subjectRevision: revision(m.subjectRevision),
      workloadRevision: revision(m.workloadRevision),
    };
  }
  return result;
}
export function sameMatrixContext(expected: RunMatrixContext, run: unknown): boolean {
  try {
    return isDeepStrictEqual(expected, parseRunProvenance(object(run).provenance)?.matrix);
  } catch {
    return false;
  }
}
export function captureRunExecution(
  cwd: string,
  benchmark: RunExecutionRecord["benchmark"],
  checks: RunExecutionRecord["benchmark"] | null,
  checksCommand: string | null,
): RunExecutionRecord {
  const outcome = (o: RunExecutionRecord["benchmark"] | null) => ({
    exitCode: o?.exitCode ?? null,
    timedOut: o?.timedOut ?? false,
    aborted: o?.aborted ?? false,
    outputLimitExceeded: o?.outputLimitExceeded ?? false,
  });
  return {
    cwd,
    benchmark: outcome(benchmark),
    checks: {
      ...outcome(checks),
      state:
        checksCommand === null
          ? "disabled"
          : !checks
            ? "skipped"
            : checks.exitCode === 0 &&
                !checks.timedOut &&
                !checks.aborted &&
                !checks.outputLimitExceeded
              ? "passed"
              : "failed",
    },
  };
}

export function parseRunProtocol(run: unknown): RunExecutionRecord | undefined {
  const r = object(run);
  const execution = parseRunExecution(r.execution);
  if (!execution) return undefined;
  if (typeof r.benchmarkCommand !== "string" || !r.benchmarkCommand.trim())
    throw new Error("Execution requires the actual benchmark command.");
  if (r.checksCommand === null) {
    if (execution.checks.state !== "disabled")
      throw new Error("Disabled checks command conflicts with invocation state.");
  } else if (
    typeof r.checksCommand !== "string" ||
    !r.checksCommand.trim() ||
    execution.checks.state === "disabled"
  ) {
    throw new Error("Checks command is missing or conflicts with invocation state.");
  }
  return execution;
}

export function parseRunExecution(value: unknown): RunExecutionRecord | undefined {
  if (value === undefined) return undefined;
  const v = object(value);
  exactKeys(v, ["cwd", "benchmark", "checks"]);
  const outcome = (raw: unknown) => {
    const o = object(raw);
    if (o.exitCode !== null && !Number.isSafeInteger(o.exitCode))
      throw new Error("Invalid execution exit code.");
    if (typeof o.timedOut !== "boolean" || typeof o.aborted !== "boolean")
      throw new Error("Invalid execution outcome.");
    if (o.outputLimitExceeded !== undefined && typeof o.outputLimitExceeded !== "boolean")
      throw new Error("Invalid output-limit outcome.");
    return {
      exitCode: o.exitCode as number | null,
      timedOut: o.timedOut,
      aborted: o.aborted,
      ...(o.outputLimitExceeded === undefined
        ? {}
        : { outputLimitExceeded: o.outputLimitExceeded }),
    };
  };
  const checks = object(v.checks);
  if (
    typeof checks.state !== "string" ||
    !["disabled", "skipped", "passed", "failed"].includes(checks.state)
  )
    throw new Error("Invalid checks execution state.");
  exactKeys(object(v.benchmark), ["exitCode", "timedOut", "aborted", "outputLimitExceeded"]);
  exactKeys(checks, ["state", "exitCode", "timedOut", "aborted", "outputLimitExceeded"]);
  const cwd = text(v.cwd);
  if (!path.isAbsolute(cwd)) throw new Error("Execution cwd must be absolute.");
  const checksOutcome = outcome(checks);
  const checksSucceeded =
    checksOutcome.exitCode === 0 &&
    !checksOutcome.timedOut &&
    !checksOutcome.aborted &&
    !checksOutcome.outputLimitExceeded;
  if (
    (checks.state === "disabled" || checks.state === "skipped") &&
    (checksOutcome.exitCode !== null ||
      checksOutcome.timedOut ||
      checksOutcome.aborted ||
      checksOutcome.outputLimitExceeded)
  )
    throw new Error("Uninvoked checks cannot contain invocation outcomes.");
  if (
    (checks.state === "passed" && !checksSucceeded) ||
    (checks.state === "failed" && checksSucceeded)
  )
    throw new Error("Checks state conflicts with invocation outcome.");
  return {
    cwd,
    benchmark: outcome(v.benchmark),
    checks: { ...checksOutcome, state: checks.state as RunExecutionRecord["checks"]["state"] },
  };
}
