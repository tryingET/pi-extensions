import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { SelfQuery, SelfResponse } from "../types.ts";

/**
summary: "Resolves self runtime-health queries by running the repo-owned agent doctor."
read_when:
  - "Changing runtime-health intent matching, doctor execution, or response shaping."
 * Runtime health resolver: exposes install drift, broker liveness, session
 * storage pressure, and npm gate posture to the self tool by executing the
 * deterministic repo-owned doctor (scripts/agent-doctor.mjs).
 *
 * The doctor remains the single source of truth; this resolver only executes,
 * summarizes, and mirrors its report. It never mutates anything.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DOCTOR_SCRIPT = resolve(REPO_ROOT, "scripts/agent-doctor.mjs");
const DOCTOR_TIMEOUT_MS = 90_000;

export function isRuntimeHealthQuery(lower: string): boolean {
  return (
    lower.includes("runtime health") ||
    lower.includes("runtime-health") ||
    lower.includes("agent doctor") ||
    lower.includes("doctor status") ||
    lower.includes("install drift") ||
    lower.includes("drift status") ||
    lower.includes("broker health")
  );
}

export interface RuntimeHealthDoctorReport {
  ok: boolean;
  failures: string[];
  warnings: string[];
  info: Record<string, unknown>;
}

export interface RuntimeHealthDeps {
  runDoctor?: () => { status: number | null; stdout: string; stderr: string };
  doctorPath?: string;
}

function defaultRunDoctor(doctorPath: string) {
  return () => {
    const result = spawnSync(process.execPath, [doctorPath, "--json"], {
      encoding: "utf8",
      timeout: DOCTOR_TIMEOUT_MS,
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  };
}

function summarizeReport(report: RuntimeHealthDoctorReport): string {
  const lines: string[] = [];
  lines.push(
    report.ok
      ? "Runtime health: OK — no hard failures."
      : `Runtime health: FAILING — ${report.failures.length} hard failure(s).`,
  );

  const broker = report.info?.broker as { pid?: number; alive?: boolean } | null | undefined;
  if (broker && typeof broker === "object") {
    lines.push(
      `peer-messaging broker: pid ${broker.pid ?? "?"} ${broker.alive ? "alive" : "DEAD"}.`,
    );
  } else {
    lines.push("peer-messaging broker: not present (intercom supervision unavailable).");
  }

  const sessions = report.info?.sessions as { files?: number; bytes?: string } | null | undefined;
  if (sessions && typeof sessions === "object") {
    lines.push(`session storage: ${sessions.files ?? "?"} files, ${sessions.bytes ?? "?"}.`);
  }

  const npmGate = report.info?.npmGate;
  if (npmGate === "stale") {
    lines.push(
      "npm release-age gate: stale — governed preflight will fail closed until 'node scripts/maintain-npm-release-age.mjs' runs.",
    );
  } else if (npmGate === "ok") {
    lines.push("npm release-age gate: ok.");
  }

  for (const failure of report.failures.slice(0, 5)) lines.push(`FAIL: ${failure}`);
  for (const warning of report.warnings.slice(0, 5)) lines.push(`warn: ${warning}`);
  if (report.warnings.length > 5) lines.push(`... ${report.warnings.length - 5} more warnings`);
  return lines.join("\n");
}

export function resolveRuntimeHealthQuery(
  query: SelfQuery | undefined,
  deps: RuntimeHealthDeps = {},
): SelfResponse {
  void query;
  const doctorPath = deps.doctorPath ?? DOCTOR_SCRIPT;
  const hasInjectedRunner = typeof deps.runDoctor === "function";
  if (!hasInjectedRunner && !existsSync(doctorPath)) {
    return {
      understood: true,
      intent: "meta",
      answer: `Runtime health doctor not found at ${doctorPath}. Run 'node scripts/agent-doctor.mjs' from the pi-extensions repo root, or reinstall pi-autonomous-session-control from its monorepo path so the repo-owned doctor is reachable.`,
      data: { kind: "self.runtime_health.v1", available: false },
    };
  }

  const runDoctor = deps.runDoctor ?? defaultRunDoctor(doctorPath);
  const result = runDoctor();
  if (result.status === null || result.status === undefined || result.status >= 2) {
    return {
      understood: true,
      intent: "meta",
      answer: `Runtime health doctor failed to run (exit ${result.status ?? "n/a"}): ${(result.stderr || result.stdout).trim().slice(0, 300)}`,
      data: { kind: "self.runtime_health.v1", available: false, exitCode: result.status },
    };
  }

  let report: RuntimeHealthDoctorReport;
  try {
    const parsed = JSON.parse(result.stdout);
    report = {
      ok: parsed.ok === true,
      failures: Array.isArray(parsed.failures) ? parsed.failures : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      info: parsed.info ?? {},
    };
  } catch {
    return {
      understood: true,
      intent: "meta",
      answer: `Runtime health doctor produced unparseable output: ${result.stdout.trim().slice(0, 300)}`,
      data: { kind: "self.runtime_health.v1", available: false },
    };
  }

  return {
    understood: true,
    intent: "meta",
    answer: summarizeReport(report),
    data: {
      kind: "self.runtime_health.v1",
      available: true,
      ok: report.ok,
      failureCount: report.failures.length,
      warningCount: report.warnings.length,
      report,
      guidance: report.ok
        ? undefined
        : "Fix hard failures before trusting extension runtime behavior; drift failures mean Pi may execute uncommitted or out-of-tree code.",
    },
  };
}
