// ---
// summary: "Read-only native recovery inventory: procfs, metadata registries, niri queries and AK list."
// read_when: ["operating or testing the recovery manifest CLI"]
// ---

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRecoveryManifest } from "../common/recovery-manifest.mjs";
import { fileIdentity, processClock, record, scanProcesses, string } from "./recovery-proc.mjs";
import {
  claudeRegistry,
  codexDescriptors,
  inspectTranscript,
  piBroker,
  transcriptIndex,
} from "./recovery-sources.mjs";

/** @typedef {import('../common/recovery-types.ts').SourceCoverage} SourceCoverage */
/** @typedef {import('../common/recovery-types.ts').SessionObservation} SessionObservation */

/** Commands are fixed read-only APIs, no shell, stderr never carries source text into output.
 * @param {string} executable @param {string[]} args */
function jsonCommand(executable, args) {
  try {
    const raw = execFileSync(executable, args, {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) throw new Error("not-array");
    return { state: "observed", rows: rows.map(record) };
  } catch {
    return { state: "unavailable", rows: [] };
  }
}

/** @param {SourceCoverage[]} sources @param {string} suffix */
function compositor(sources, suffix) {
  const windows = jsonCommand("niri", ["msg", "-j", "windows"]);
  const workspaces = jsonCommand("niri", ["msg", "-j", "workspaces"]);
  sources.push(
    ...[
      ["windows", windows],
      ["workspaces", workspaces],
    ].map(([label, data]) => {
      const source = /** @type {ReturnType<typeof jsonCommand>} */ (data);
      return {
        source: `niri-${label}-${suffix}`,
        state: source.state,
        observed: source.rows.length,
        rejected: 0,
        limitations: ["no titles retained; no compositor mutations"],
      };
    }),
  );
  return {
    windows: windows.rows
      .filter((r) => Number.isSafeInteger(r.id))
      .map((r) => ({
        id: Number(r.id),
        pid: Number.isSafeInteger(r.pid) ? Number(r.pid) : null,
        workspace_id: Number.isSafeInteger(r.workspace_id) ? Number(r.workspace_id) : null,
      })),
    workspaces: workspaces.rows
      .filter((r) => Number.isSafeInteger(r.id) && Number.isSafeInteger(r.idx))
      .map((r) => ({ id: Number(r.id), idx: Number(r.idx) })),
  };
}

/** @param {{includePaths?: boolean; piSessionRoot?: string; home?: string; noAk?: boolean}} [options] */
export async function collectRecoveryManifest({
  includePaths = false,
  piSessionRoot,
  home = os.homedir(),
  noAk = false,
} = {}) {
  const startedAt = Date.now();
  const clock = processClock();
  /** @type {SourceCoverage[]} */
  const sources = [];
  const before = scanProcesses(clock);
  sources.push(before.coverage);
  const niri = compositor(sources, "before");
  const registryRoot = path.join(home, ".claude", "sessions");
  const claude = claudeRegistry(registryRoot);
  const pi = await piBroker();
  const codex = codexDescriptors(
    before.processes,
    process.env.CODEX_HOME || path.join(home, ".codex"),
  );
  sources.push(claude.coverage, pi.coverage, codex.coverage);
  const claudeFiles = transcriptIndex(path.join(home, ".claude", "projects"));
  const piFiles = transcriptIndex(
    piSessionRoot ||
      process.env.PI_CODING_AGENT_SESSION_DIR ||
      path.join(process.env.PI_CODING_AGENT_DIR || path.join(home, ".pi", "agent"), "sessions"),
  );
  sources.push(claudeFiles.coverage, piFiles.coverage);
  const sessions = [...claude.sessions, ...pi.sessions, ...codex.sessions];
  for (const s of sessions) {
    if (s.harness !== "claude" && s.harness !== "pi") continue;
    const index = s.harness === "claude" ? claudeFiles : piFiles;
    const files = index.files.get(s.sessionId?.toLowerCase() ?? "") ?? [];
    s.transcripts = files.map((f) => inspectTranscript(f, s.sessionId ?? "", s.harness));
    if (files.length === 0)
      s.transcripts.push({
        path: "",
        state: "not-found-in-scanned-roots",
        method: "bounded-filename-inventory",
      });
    if (files.length > 1) for (const t of s.transcripts) t.state = "ambiguous-path";
  }
  const ak = noAk
    ? { state: "disabled", rows: [] }
    : jsonCommand(process.env.PI_ACTIVITY_STRIP_AK_BIN || "ak", [
        "task",
        "list",
        "--status",
        "claimed",
        "--format",
        "json",
        "--all",
        "--verbose",
      ]);
  const validClaims = ak.rows.filter(
    (r) => Number.isSafeInteger(r.id) && typeof r.claimed_by === "string",
  );
  sources.push({
    source: "ak-claimed-tasks",
    state: ak.state,
    observed: ak.rows.length,
    rejected: ak.rows.length - validClaims.length,
    limitations: ["read-only current claims; no task titles, no history, no custody transfer"],
  });
  // Recheck source identity as well as PID birth. Ordinary heartbeat updates do not change identity.
  const claudeAfter = claudeRegistry(registryRoot);
  const piAfter = await piBroker();
  for (const s of sessions) {
    const peers =
      s.source === "claude-registry"
        ? claudeAfter.sessions
        : s.source === "pi-broker"
          ? piAfter.sessions
          : null;
    if (peers) {
      const equal = peers.some(
        (a) =>
          a.pid === s.pid &&
          a.sessionId === s.sessionId &&
          a.startedAt === s.startedAt &&
          a.cwd === s.cwd &&
          a.procStart === s.procStart &&
          a.pidDomain === s.pidDomain &&
          !a.changed,
      );
      s.changed ||= !equal;
    }
    if (s.source === "codex-open-rollout") {
      try {
        s.changed ||=
          fs.readlinkSync(s.sourceRef) !== s.transcripts[0]?.path ||
          fileIdentity(s.sourceRef).identity !== s.transcripts[0]?.identity;
      } catch {
        s.changed = true;
      }
    }
    for (const t of s.transcripts) {
      if (!t.identity || !t.path) continue;
      try {
        const now = fileIdentity(t.path);
        t.changed ||= now.identity !== t.identity || now.size !== t.size;
        if (now.identity !== t.identity) t.state = "file-replaced";
      } catch {
        t.state = "unavailable-after-capture";
        t.changed = true;
      }
    }
  }
  sources.push(
    { ...claudeAfter.coverage, source: `${registryRoot} (after)` },
    { ...piAfter.coverage, source: "pi-activity-strip-broker-after" },
  );
  const niriAfter = compositor(sources, "after");
  const afterClock = processClock();
  const after = scanProcesses(afterClock);
  sources.push({ ...after.coverage, source: "procfs-current-user-after" });
  return buildRecoveryManifest(
    {
      startedAt,
      endedAt: Date.now(),
      bootId: clock.bootId,
      pidDomain: clock.pidDomain,
      before: before.processes,
      after: after.processes,
      sessions,
      sources,
      windows: niri.windows,
      windowsAfter: niriAfter.windows,
      workspaces: niri.workspaces,
      workspacesAfter: niriAfter.workspaces,
      claims: validClaims.map((r) => ({
        id: Number(r.id),
        claimed_by: string(r.claimed_by),
        status: string(r.status),
        lease_expires_at: string(r.lease_expires_at),
      })),
    },
    { includePaths },
  );
}
