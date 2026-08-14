#!/usr/bin/env node
// Agent-runtime doctor: observability for the Pi harness surface.
//
// Checks:
//   broker      peer-messaging broker pid liveness + socket presence
//   sessions    session storage count/size with warn thresholds
//   drift       install provenance (delegates to check-install-drift.mjs)
//   extensions  broken symlinks / orphaned stash dirs in ~/.pi/agent/extensions
//   logs        recent crash/debug log activity
//
// Exit codes: 0 = healthy (warnings allowed), 1 = at least one hard failure, 2 = tool failure.
//
// Usage: node scripts/agent-doctor.mjs [--json] [--no-drift]

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentDir = resolve(homedir(), ".pi/agent");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const noDrift = args.includes("--no-drift");

const failures = [];
const warnings = [];
const info = {};

function dirSize(path) {
  let total = 0;
  let count = 0;
  const stack = [path];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const child = resolve(current, entry.name);
      if (entry.isDirectory()) stack.push(child);
      else {
        try {
          total += statSync(child).size;
          count += 1;
        } catch {
          // raced away; ignore
        }
      }
    }
  }
  return { bytes: total, files: count };
}

function human(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)}${units[unit]}`;
}

// --- broker ---
const brokerPidPath = resolve(agentDir, "peer-messaging/broker.pid");
const brokerSockPath = resolve(agentDir, "peer-messaging/broker.sock");
if (existsSync(brokerPidPath)) {
  const pid = Number(readFileSync(brokerPidPath, "utf8").trim());
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {
    alive = false;
  }
  info.broker = { pid, alive, socketPresent: existsSync(brokerSockPath) };
  if (!alive) failures.push(`peer-messaging broker pid ${pid} is recorded but not running (stale pid file)`);
  else if (!existsSync(brokerSockPath)) warnings.push("peer-messaging broker is alive but its socket is missing");
} else {
  info.broker = null;
  warnings.push("no peer-messaging broker pid file; intercom supervision unavailable");
}

// --- sessions ---
const sessionsDir = resolve(agentDir, "sessions");
if (existsSync(sessionsDir)) {
  const { bytes, files } = dirSize(sessionsDir);
  info.sessions = { files, bytes: human(bytes) };
  if (files > 500)
    warnings.push(
      `session storage has ${files} files (${human(bytes)}); archive with scripts/session-retention.mjs (never deletes content)`,
    );
} else {
  info.sessions = null;
}

// --- extensions hygiene ---
const extDir = resolve(agentDir, "extensions");
const broken = [];
const stash = [];
if (existsSync(extDir)) {
  for (const name of readdirSync(extDir)) {
    const child = resolve(extDir, name);
    const lstat = lstatSync(child);
    if (lstat.isSymbolicLink() && !existsSync(child)) broken.push(name);
    if (name.startsWith(".") && name.includes("backup")) stash.push(name);
    if (name.startsWith(".legacy-disabled")) stash.push(name);
  }
}
info.extensions = { brokenSymlinks: broken, stashDirs: stash };
if (broken.length > 0) failures.push(`broken extension symlinks: ${broken.join(", ")}`);
if (stash.length > 0) warnings.push(`stash/backup dirs present in extensions/: ${stash.join(", ")}`);

// --- logs ---
const now = Date.now();
const logs = {};
for (const logName of ["pi-crash.log", "pi-debug.log"]) {
  const logPath = resolve(agentDir, logName);
  if (existsSync(logPath)) {
    const ageDays = (now - statSync(logPath).mtimeMs) / 86_400_000;
    logs[logName] = { lastModifiedDaysAgo: Number(ageDays.toFixed(1)) };
    if (logName === "pi-crash.log" && ageDays < 7) warnings.push(`pi-crash.log modified ${ageDays.toFixed(1)} days ago; inspect recent crashes`);
  }
}
info.logs = logs;

// --- npm release-age gate ---
let npmGate = null;
{
  const maintainer = resolve(repoRoot, "scripts/maintain-npm-release-age.mjs");
  if (existsSync(maintainer)) {
    const run = spawnSync(process.execPath, [maintainer, "--check"], { encoding: "utf8" });
    npmGate = { exitCode: run.status };
    if (run.status !== 0) {
      warnings.push(
        `npm release-age gate 'before' is unset or stale; governed preflight will fail closed (run: node scripts/maintain-npm-release-age.mjs)`,
      );
    }
  }
}
info.npmGate = npmGate ? (npmGate.exitCode === 0 ? "ok" : "stale") : "skipped";

// --- drift ---
let drift = null;
if (!noDrift) {
  const driftScript = resolve(repoRoot, "scripts/check-install-drift.mjs");
  if (existsSync(driftScript)) {
    const run = spawnSync(process.execPath, [driftScript], { encoding: "utf8" });
    drift = { exitCode: run.status, output: (run.stdout + run.stderr).trim() };
    if (run.status === 1) failures.push("install provenance drift detected (see drift output)");
    else if (run.status !== 0) warnings.push("drift check could not run cleanly");
  }
}
info.drift = drift ? drift.exitCode : "skipped";

if (asJson) {
  console.log(JSON.stringify({ ok: failures.length === 0, failures, warnings, info }, null, 2));
} else {
  if (info.broker) console.log(`broker:  pid ${info.broker.pid} ${info.broker.alive ? "alive" : "DEAD"}${info.broker.socketPresent ? "" : " (socket missing)"}`);
  else console.log("broker:  not present");
  if (info.sessions) console.log(`storage: ${info.sessions.files} session files, ${info.sessions.bytes}`);
  console.log(`extdir:  ${broken.length} broken symlinks, ${stash.length} stash dirs`);
  for (const w of warnings) console.log(`warn:    ${w}`);
  for (const f of failures) console.log(`FAIL:    ${f}`);
  if (drift) for (const line of drift.output.split("\n")) if (line.trim()) console.log(`drift:   ${line}`);
  console.log(`agent-doctor: ${failures.length === 0 ? "OK" : "FAILED"} (${failures.length} failures, ${warnings.length} warnings)`);
}
process.exit(failures.length > 0 ? 1 : 0);
