// ---
// summary: "Allowlisted session metadata readers; JSONL is projected only by jq, never replayed."
// read_when: ["changing recovery registry or transcript discovery"]
// ---

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { sendBrokerMessage } from "../client/broker-client.mjs";
import { makeMessage } from "../common/protocol.mjs";
import { UUID } from "../common/recovery-identity.mjs";
import { fileIdentity, openJsonlDescriptors, record, string, textFile } from "./recovery-proc.mjs";

/** @typedef {import('../common/recovery-types.ts').SessionObservation} SessionObservation */
/** @typedef {import('../common/recovery-types.ts').SourceCoverage} SourceCoverage */
/** @typedef {import('../common/recovery-types.ts').TranscriptObservation} TranscriptObservation */

/** @param {string} file */
function metadataJson(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 262144) throw new Error("metadata-bound");
  return record(JSON.parse(textFile(file)));
}

/** @param {string} root */
export function claudeRegistry(root) {
  /** @type {SessionObservation[]} */
  const sessions = [];
  /** @type {SourceCoverage} */
  const coverage = { source: root, state: "observed", observed: 0, rejected: 0, limitations: [] };
  try {
    const names = fs
      .readdirSync(root)
      .filter((v) => v.endsWith(".json"))
      .sort();
    coverage.observed = names.length;
    if (names.length > 4096) coverage.limitations.push("registry-file-limit:4096");
    for (const name of names.slice(0, 4096)) {
      try {
        const file = path.join(root, name);
        const before = fileIdentity(file);
        const row = metadataJson(file);
        const after = fileIdentity(file);
        const pid = row.pid;
        const sessionId = string(row.sessionId);
        if (!Number.isSafeInteger(pid) || Number(pid) <= 0 || !UUID.test(sessionId)) {
          coverage.rejected++;
          continue;
        }
        sessions.push({
          harness: "claude",
          sessionId,
          pid: Number(pid),
          source: "claude-registry",
          sourceRef: file,
          cwd: string(row.cwd),
          startedAt: Number(row.startedAt),
          pidDomain: string(row.pidDomain) || null,
          procStart: string(row.procStart) || null,
          bootId: string(row.bootId) || null,
          changed: JSON.stringify(before) !== JSON.stringify(after),
          transcripts: [],
        });
      } catch {
        coverage.rejected++;
      }
    }
  } catch {
    coverage.state = "unavailable";
  }
  return { sessions, coverage };
}

export async function piBroker() {
  /** @type {SessionObservation[]} */
  const sessions = [];
  /** @type {SourceCoverage} */
  const coverage = {
    source: "pi-activity-strip-broker",
    state: "observed",
    observed: 0,
    rejected: 0,
    limitations: ["only broker publishers, not all Pi sessions; no source process-birth token"],
  };
  try {
    const response = await sendBrokerMessage(makeMessage("ping"), { expectReply: true });
    if (!response?.ok || !Array.isArray(response.snapshot?.sessions))
      throw new Error("broker-unavailable");
    const rows = response.snapshot.sessions;
    coverage.observed = rows.length;
    for (const row of rows) {
      if (!row.sessionId || !Number.isSafeInteger(row.processId)) {
        coverage.rejected++;
        continue;
      }
      sessions.push({
        harness: "pi",
        sessionId: row.sessionId,
        pid: row.processId,
        source: "pi-broker",
        sourceRef: "pi-activity-strip broker ping",
        cwd: row.cwd,
        startedAt: row.startedAt,
        updatedAt: row.updatedAt,
        pidDomain: null,
        procStart: null,
        changed: false,
        transcripts: [],
      });
    }
  } catch {
    coverage.state = "unavailable";
  }
  return { sessions, coverage };
}

/** Scan exactly root plus one directory level, filenames only; no symlink directories.
 * @param {string} root */
export function transcriptIndex(root) {
  /** @type {Map<string, string[]>} */
  const files = new Map();
  /** @type {SourceCoverage} */
  const coverage = {
    source: root,
    state: "observed",
    observed: 0,
    rejected: 0,
    limitations: ["filenames only; depth <= 2; limit 100000; no historical-session inventory"],
  };
  let examined = 0;
  /** @param {string} dir @param {number} depth */
  function visit(dir, depth) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (++examined > 100000) {
          coverage.state = "truncated";
          return;
        }
        const file = path.join(dir, entry.name);
        if (entry.isDirectory() && depth === 0) visit(file, 1);
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
        coverage.observed++;
        const match = /(?:^|_)([0-9a-f-]{36})\.jsonl$/i.exec(entry.name);
        if (!match || !UUID.test(match[1])) continue;
        const id = match[1].toLowerCase();
        files.set(id, [...(files.get(id) ?? []), file]);
      }
    } catch {
      coverage.rejected++;
      coverage.state = "partial-or-unavailable";
    }
  }
  visit(root, 0);
  return { files, coverage };
}

/** First record only, projected through jq. No raw session text enters JS or diagnostic errors.
 * @param {string} file @param {string} harness */
export function sessionHeader(file, harness) {
  const filter =
    harness === "pi"
      ? 'if .type == "session" then {id, cwd, timestamp} else {} end, halt'
      : 'if .type == "session_meta" then .payload | {id, cwd, timestamp} else {} end, halt';
  try {
    const raw = execFileSync("jq", ["-c", filter, "--", file], {
      encoding: "utf8",
      maxBuffer: 65536,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return record(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** @param {string} file @param {string} id @param {string} harness @returns {TranscriptObservation} */
export function inspectTranscript(file, id, harness) {
  try {
    const before = fileIdentity(file);
    const header = harness === "claude" ? null : sessionHeader(file, harness);
    const after = fileIdentity(file);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    return {
      path: file,
      state:
        header === null
          ? "filename-candidate"
          : string(header.id) === id
            ? "header-id-matched"
            : "header-unconfirmed",
      method: header === null ? "filename-and-stat-only; content-not-read" : "jq-first-record-id",
      ...after,
      changed,
    };
  } catch {
    return { path: file, state: "unavailable", method: "stat" };
  }
}

/** @param {import('../common/recovery-types.ts').ProcessObservation[]} processes @param {string} codexHome */
export function codexDescriptors(processes, codexHome) {
  /** @type {SessionObservation[]} */
  const sessions = [];
  /** @type {SourceCoverage} */
  const coverage = {
    source: "codex-open-rollout-descriptors",
    state: "observed",
    observed: 0,
    rejected: 0,
    limitations: ["no SQLite reads or recent-cwd fallback; current display unsupported"],
  };
  for (const p of processes.filter((p) => p.harness === "codex")) {
    const fds = openJsonlDescriptors(p.pid);
    if (fds.state !== "observed") coverage.rejected++;
    const seen = new Set();
    for (const fd of fds.descriptors) {
      if (!fd.target.startsWith(`${codexHome}/sessions/`) || seen.has(fd.target)) continue;
      seen.add(fd.target);
      coverage.observed++;
      const header = sessionHeader(fd.target, "codex");
      const id = string(header.id);
      if (!UUID.test(id)) {
        coverage.rejected++;
        continue;
      }
      let changed = true;
      try {
        changed =
          fs.readlinkSync(fd.descriptor) !== fd.target ||
          fileIdentity(fd.descriptor).identity !== fd.identity ||
          fileIdentity(fd.target).identity !== fd.identity;
      } catch {
        /* retain changed */
      }
      sessions.push({
        harness: "codex",
        sessionId: id,
        pid: p.pid,
        source: "codex-open-rollout",
        sourceRef: fd.descriptor,
        cwd: string(header.cwd),
        startedAt: Date.parse(string(header.timestamp)),
        pidDomain: p.pidDomain,
        procStart: p.startTicks,
        bootId: p.bootId,
        changed,
        transcripts: [inspectTranscript(fd.target, id, "codex")],
      });
    }
  }
  return { sessions, coverage };
}
