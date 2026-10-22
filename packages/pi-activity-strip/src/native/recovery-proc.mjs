// ---
// summary: "Bounded procfs metadata collection without emitting environment or command-line text."
// read_when: ["changing recovery process observations"]
// ---

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { classifyAgentProcess } from "../common/agent-identity.mjs";

/** @param {string} file */
export function textFile(file) {
  return fs.readFileSync(file, "utf8");
}
/** @param {unknown} value */
export function string(value) {
  return typeof value === "string" ? value : "";
}
/** @param {unknown} value */
export function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}
/** @param {string} file */
export function fileIdentity(file) {
  const s = fs.statSync(file);
  return { identity: `${s.dev}:${s.ino}`, size: s.size, mtimeMs: s.mtimeMs };
}

/** @param {string} raw @param {number} pid */
export function parseProcStat(raw, pid) {
  const end = raw.lastIndexOf(")");
  if (!raw.startsWith(`${pid} (`) || end < 0) return null;
  const fields = raw
    .slice(end + 2)
    .trim()
    .split(/\s+/);
  if (!/^\d+$/.test(fields[19] ?? "") || !/^\d+$/.test(fields[1] ?? "")) return null;
  return { ppid: Number(fields[1]), startTicks: fields[19] };
}

/** @param {{comm: string; executable: string; argv0: string; argv1: string}} p */
export function recoveryHarness(p) {
  const exe = path.basename(p.executable);
  const first = path.basename(p.argv0);
  if (
    exe === "pi" ||
    p.comm === "pi" ||
    (exe.startsWith("node") && /\/pi-coding-agent\/(?:dist\/)?cli\.(?:js|mjs)$/.test(p.argv1))
  )
    return "pi";
  if (exe === "angel" && p.executable.includes("/angelx-pi/")) return "angelx";
  if (exe === "electron" && p.executable.includes("/agnt/")) return "agnt";
  if (exe === "omp" || first === "omp") return "omp";
  // Only the actual executable or runtime's script slot participates, never prompt arguments.
  return (
    classifyAgentProcess({
      command: exe,
      argv0: first,
      argv1: /^(node|bun|python)/.test(exe) ? p.argv1 : "",
    })?.kind ?? ""
  );
}

export function processClock() {
  const bootId = textFile("/proc/sys/kernel/random/boot_id").trim();
  const machineId = textFile("/etc/machine-id").trim();
  const namespace = fs.readlinkSync("/proc/self/ns/pid");
  const ticks = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).trim());
  const bootSeconds = Number(/^btime (\d+)$/m.exec(textFile("/proc/stat"))?.[1]);
  if (!bootId || !machineId || !namespace || !(ticks > 0) || !(bootSeconds > 0))
    throw new Error("process-clock-unavailable");
  return {
    bootId,
    machineId,
    pidDomain: `linux:${machineId}:${namespace}`,
    ticks,
    bootMs: bootSeconds * 1000,
  };
}

/** @param {ReturnType<typeof processClock>} clock */
export function scanProcesses(clock) {
  /** @type {import('../common/recovery-types.ts').ProcessObservation[]} */
  const processes = [];
  let rejected = 0;
  const entries = fs.readdirSync("/proc").filter((v) => /^\d+$/.test(v));
  let excluded = 0;
  for (const entry of entries) {
    const base = `/proc/${entry}`;
    try {
      if (fs.statSync(base).uid !== process.getuid?.()) {
        excluded++;
        continue;
      }
      const pid = Number(entry);
      const stat = parseProcStat(textFile(`${base}/stat`), pid);
      if (!stat) {
        rejected++;
        continue;
      }
      const executable = fs.readlinkSync(`${base}/exe`);
      // Inspect only executable/script selectors; no arguments or environ are retained.
      const argv = textFile(`${base}/cmdline`).split("\0", 2);
      const comm = textFile(`${base}/comm`).trim();
      const selectorDigest = createHash("sha256")
        .update(
          JSON.stringify([
            executable,
            comm,
            argv[0],
            /^(node|bun|python)/.test(path.basename(executable)) ? argv[1] : "",
          ]),
        )
        .digest("hex");
      const cwd = fs.readlinkSync(`${base}/cwd`);
      const executableIdentity = fileIdentity(`${base}/exe`).identity;
      // PID numbers read via this procfs belong to the observer's domain, not the target's ns.
      const pidDomain = clock.pidDomain;
      const check = parseProcStat(textFile(`${base}/stat`), pid);
      if (!check || check.startTicks !== stat.startTicks || check.ppid !== stat.ppid) {
        rejected++;
        continue;
      }
      processes.push({
        pid,
        ...stat,
        birthMs: clock.bootMs + (Number(stat.startTicks) * 1000) / clock.ticks,
        bootId: clock.bootId,
        pidDomain,
        executable,
        executableIdentity,
        selectorDigest,
        cwd,
        harness: recoveryHarness({ comm, executable, argv0: argv[0] ?? "", argv1: argv[1] ?? "" }),
      });
    } catch {
      rejected++;
    }
  }
  return {
    processes,
    coverage: {
      source: "procfs-current-user",
      state: "observed",
      observed: entries.length,
      rejected,
      limitations: [
        `other-user-pids-excluded:${excluded}`,
        "exec/script recognition is local evidence, not authentication",
        "processes may exit or appear during scan",
      ],
    },
  };
}

/** @param {number} pid */
export function openJsonlDescriptors(pid) {
  const dir = `/proc/${pid}/fd`;
  const results = [];
  try {
    for (const name of fs.readdirSync(dir)) {
      try {
        const descriptor = `${dir}/${name}`;
        const target = fs.readlinkSync(descriptor);
        if (target.endsWith(".jsonl"))
          results.push({ descriptor, target, identity: fileIdentity(descriptor).identity });
      } catch {
        /* An fd can close while it is enumerated. */
      }
    }
  } catch {
    return { state: "unavailable", descriptors: [] };
  }
  return { state: "observed", descriptors: results };
}
