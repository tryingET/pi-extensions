// ---
// summary: "Builds and writes the run-bound evidence file for one Pi host canary run (identities, scenario coverage, outcome, output hashes)."
// read_when:
//   - "Changing what a hosted canary run records as evidence, request correlation, or pass criteria."
// ---
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const EVIDENCE_SCHEMA = "pi-host-compat-canary-evidence/v1";
export const REQUEST_ID_ENV = "PI_HOST_COMPAT_REQUEST_ID";
const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/u;

export function resolveRequestId(raw) {
  if (raw === undefined || raw === null || String(raw) === "") return null;
  if (!REQUEST_ID.test(raw)) {
    throw new Error(`env:${REQUEST_ID_ENV} must match ${REQUEST_ID.source}`);
  }
  return raw;
}

function digest(text) {
  if (typeof text !== "string") return null;
  return { sha256: createHash("sha256").update(text).digest("hex"), bytes: Buffer.byteLength(text) };
}

function githubIdentity(env) {
  const pick = (name) => (env[name] ? String(env[name]) : null);
  return {
    repository: pick("GITHUB_REPOSITORY"),
    runId: pick("GITHUB_RUN_ID"),
    runAttempt: pick("GITHUB_RUN_ATTEMPT"),
    sha: pick("GITHUB_SHA"),
    ref: pick("GITHUB_REF"),
    workflow: pick("GITHUB_WORKFLOW"),
    eventName: pick("GITHUB_EVENT_NAME"),
    job: pick("GITHUB_JOB"),
  };
}

function sanitizeResult(result) {
  const { stdout, stderr, ...rest } = result;
  return {
    ...rest,
    ...(stdout !== undefined ? { stdoutDigest: digest(stdout) } : {}),
    ...(stderr !== undefined ? { stderrDigest: digest(stderr) } : {}),
  };
}

// A run passes only when every requested scenario ran and passed, at least one ran,
// nothing aborted, and no lifecycle error escaped. Zero executed scenarios never pass.
export function evidenceOutcome({ payload, error, requested }) {
  if (error) return { outcome: "error", reasons: ["run-error"] };
  if (payload.dryRun) return { outcome: "dry-run", reasons: [] };
  const executed = new Set(payload.results.map((result) => result.id));
  const reasons = [];
  if (payload.results.length === 0) reasons.push("no-scenarios-executed");
  if (requested.some((id) => !executed.has(id))) reasons.push("requested-scenarios-not-run");
  if (payload.summary.failed > 0) reasons.push("scenario-failed");
  if (payload.aborted) reasons.push(`aborted:${payload.abortReason ?? "unknown"}`);
  if (payload.results.some((result) => result.status !== "passed")) reasons.push("non-passing-result");
  return { outcome: reasons.length === 0 ? "passed" : "failed", reasons: [...new Set(reasons)] };
}

export function buildRunEvidence({ payload, error, requestId, options, env = process.env, now = new Date() }) {
  const requested = payload?.requestedScenarioIds ?? options.scenarioIds ?? [];
  const { outcome, reasons } = evidenceOutcome({ payload, error, requested });
  const executedIds = new Set((payload?.results ?? []).map((result) => result.id));
  return {
    schema: EVIDENCE_SCHEMA,
    generatedAt: now.toISOString(),
    requestId,
    github: githubIdentity(env),
    profile: payload?.profile ?? options.profile ?? null,
    host: payload?.host ? { ...payload.host, expectedIntegrity: payload.host.expectedIntegrity ?? null } : null,
    outcome,
    reasons,
    ...(error ? { error: { code: error.code ?? null, message: error instanceof Error ? error.message : String(error) } } : {}),
    scenarios: {
      requested,
      executed: (payload?.results ?? []).map((result) => ({ id: result.id, status: result.status })),
      notRun: requested.filter((id) => !executedIds.has(id)),
    },
    summary: payload?.summary ?? null,
    aborted: payload?.aborted ?? null,
    ...(payload?.abortReason ? { abortReason: payload.abortReason } : {}),
    results: (payload?.results ?? []).map(sanitizeResult),
  };
}

export function writeRunEvidence(filePath, evidence) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  // Never overwrite: one evidence file per run attempt.
  writeFileSync(filePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
}
