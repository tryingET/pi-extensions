#!/usr/bin/env node
// Loop telemetry aggregation over ~/.pi/agent/state/pi-society-orchestrator/loop-runs.
//
// The per-run JSON files (loop-runs/*.run.json) are written by the orchestrator's
// visible-loop runtime with full phase/attempt/effect-receipt detail — but nothing
// aggregated them, so cross-run signal (status distribution, repeated identical
// failure causes, duration norms) stayed invisible. 51 of 81 historical runs died
// on one fixable env error before this existed.
//
// Run provenance: records whose cwd sits under test-harness scratch (gate
// TMP_ROOT, pi-quests tmp, loop-tool dirs) are classified test-origin. This
// encodes the 2026-08-15 lesson: 51 historical "failures" were quality-gate
// artifacts written into live state; alarms must reflect operator runs only.
//
// Usage:
//   node scripts/loop-telemetry.mjs            # summary
//   node scripts/loop-telemetry.mjs --json     # machine-readable (incl. provenance)
//   node scripts/loop-telemetry.mjs --failures # ranked failure causes
//   node scripts/loop-telemetry.mjs --all      # include test-origin runs in alarms
// Exit codes: 0 ok, 1 = repeat-failure alarm (same OPERATOR cause >= 5 runs), 2 = tool failure.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const failuresOnly = args.includes("--failures");
const includeTestOrigin = args.includes("--all");
const RUNS_DIR = resolve(
  homedir(),
  ".pi/agent/state/pi-society-orchestrator/loop-runs",
);

if (!existsSync(RUNS_DIR)) {
  console.error(`loop-telemetry: no loop-runs dir at ${RUNS_DIR}`);
  process.exit(2);
}

const REPEAT_FAILURE_ALARM = 5;

function classifyRunProvenance(cwd) {
  const path = String(cwd ?? "");
  if (/(^|\/)\.pi\/tmp\//.test(path) || path.includes("/.pi/tmp/")) return "test";
  if (/pi-quests\/tmp\//.test(path)) return "test";
  if (/(^|\/)pi-(orch-)?(ln|loop-tool)-/.test(path.split("/").pop() ?? "")) return "test";
  return "operator";
}

function parseRun(file, raw) {
  try {
    const run = JSON.parse(raw);
    const toMin = (iso) => {
      const t = Date.parse(iso);
      return Number.isFinite(t) ? t / 60000 : null;
    };
    const last = Array.isArray(run.attempts) ? run.attempts[run.attempts.length - 1] : undefined;
    const created = toMin(run.createdAt);
    const updated = toMin(run.updatedAt);
    return {
      file,
      loop: file.replace(/-\d+\.run\.json$/, ""),
      status: run.status ?? "unknown",
      durationMin: created !== null && updated !== null ? Math.max(0, updated - created) : null,
      attempts: Array.isArray(run.attempts) ? run.attempts.length : 0,
      resumes: Number(run.resumeCount ?? 0),
      failedPhase: last?.phase ?? null,
      failureCause:
        typeof last?.output === "string" && last.status !== "done"
          ? last.output.replace(/\s+/g, " ").slice(0, 160)
          : null,
      provenance: classifyRunProvenance(JSON.parse(raw).cwd),
    };
  } catch (error) {
    return { file, loop: "?", status: "unparseable", durationMin: null, attempts: 0, resumes: 0, failedPhase: null, failureCause: `parse error: ${error.message?.slice(0, 80)}`, provenance: "operator" };
  }
}

const runs = readdirSync(RUNS_DIR)
  .filter((f) => f.endsWith(".run.json"))
  .map((f) => parseRun(f, readFileSync(resolve(RUNS_DIR, f), "utf8")));

const scoped = includeTestOrigin ? runs : runs.filter((run) => run.provenance === "operator");
const testOriginCount = runs.length - scoped.length;

const byStatus = {};
for (const run of scoped) byStatus[run.status] = (byStatus[run.status] ?? 0) + 1;

const byLoop = {};
for (const run of scoped) {
  const b = (byLoop[run.loop] ??= { runs: 0, durations: [], attempts: 0, resumes: 0, done: 0 });
  b.runs += 1;
  if (run.durationMin !== null) b.durations.push(run.durationMin);
  b.attempts += run.attempts;
  b.resumes += run.resumes;
  if (run.status === "done") b.done += 1;
}

const failureCauses = {};
for (const run of scoped) {
  if (run.status !== "failed" || !run.failureCause) continue;
  const key = `${run.failedPhase ?? "?"} :: ${run.failureCause}`;
  failureCauses[key] = (failureCauses[key] ?? 0) + 1;
}
const rankedCauses = Object.entries(failureCauses).sort((a, b) => b[1] - a[1]);
const alarmCauses = rankedCauses.filter(([, count]) => count >= REPEAT_FAILURE_ALARM);

if (asJson) {
  console.log(JSON.stringify({ total: runs.length, scopedTotal: scoped.length, testOriginCount, byStatus, byLoop, rankedCauses, alarmCauses }, null, 2));
} else if (failuresOnly) {
  for (const [cause, count] of rankedCauses) console.log(`${String(count).padStart(4)}  ${cause}`);
  console.log(`--- ${rankedCauses.length} distinct causes across ${runs.filter((r) => r.status === "failed").length} failed runs`);
} else {
  const med = (arr) => (arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] : null);
  console.log(`loop-telemetry: ${scoped.length} operator runs (${testOriginCount} test-origin excluded; --all to include)`);
  console.log(`  status: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  for (const [loop, b] of Object.entries(byLoop)) {
    console.log(
      `  ${loop.padEnd(12)} runs=${b.runs} done=${b.done} medDur=${med(b.durations)?.toFixed(1) ?? "?"}m avgAttempts=${(b.attempts / b.runs).toFixed(1)} resumes=${b.resumes}`,
    );
  }
  if (alarmCauses.length > 0) {
    console.log(`  REPEAT-FAILURE ALARM (>= ${REPEAT_FAILURE_ALARM} identical causes):`);
    for (const [cause, count] of alarmCauses) console.log(`    ${count}x  ${cause}`);
    console.log(`    -> these are environment/config defects invisible per-run; fix the cause, not the runs`);
  }
}

process.exit(alarmCauses.length > 0 && !asJson ? 1 : 0);
