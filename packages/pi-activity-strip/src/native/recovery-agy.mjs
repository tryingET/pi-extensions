// ---
// summary: "agy (Antigravity CLI) recovery observations from the presence lock each process holds under flock"
// read_when: ["changing agy recovery evidence or its presence-lock proof"]
// ---

import fs from "node:fs";
import path from "node:path";
import { heldLockInodes } from "./agy-discovery.mjs";
import { fileIdentity, textFile } from "./recovery-proc.mjs";

/** @typedef {import('../common/recovery-types.ts').SessionObservation} SessionObservation */
/** @typedef {import('../common/recovery-types.ts').SourceCoverage} SourceCoverage */

const PRESENCE_LOCK =
  /^(.*\/antigravity-cli)\/presence\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.lock$/;
export const AGY_FLOCK_SOURCE = "agy-presence-flock";
export const AGY_OPEN_SOURCE = "agy-presence-open";
/** Each observed lock descriptor's target and identity, for the after-capture recheck. */
/** @type {Map<string, {target: string; identity: string}>} */
const lockTargets = new Map();

/** @returns {string} */
function readLocks() {
  try {
    return textFile("/proc/locks");
  } catch {
    return "";
  }
}

/**
 * agy holds `<home>/presence/<conversation>.lock` open under an exclusive flock for the conversation
 * it runs. The kernel's lock table attributes that flock to the process, which is stronger than an
 * open descriptor: a second process cannot hold it at the same time. Neither proves what the TUI is
 * displaying. Only the descriptor target, its inode and the lock table are read; the conversation
 * store is named but never opened.
 * @param {import('../common/recovery-types.ts').ProcessObservation[]} processes
 */
export function agyPresenceLocks(processes) {
  /** @type {SessionObservation[]} */
  const sessions = [];
  /** @type {SourceCoverage} */
  const coverage = {
    source: "agy-presence-lock-descriptors",
    state: "observed",
    observed: 0,
    rejected: 0,
    limitations: [
      "flock proves which conversation a process holds, not which one its TUI displays",
      "conversation store content not read; AK has no agy claimant prefix",
    ],
  };
  lockTargets.clear();
  const agy = processes.filter((p) => p.harness === "agy");
  const locks = agy.length > 0 ? readLocks() : "";
  if (agy.length > 0 && !locks) coverage.limitations.push("/proc/locks unavailable");
  for (const p of agy) {
    const fdDir = `/proc/${p.pid}/fd`;
    let names = [];
    try {
      names = fs.readdirSync(fdDir);
    } catch {
      coverage.rejected++;
      continue;
    }
    const held = heldLockInodes(locks, p.pid);
    for (const name of names) {
      const descriptor = path.join(fdDir, name);
      try {
        const target = fs.readlinkSync(descriptor);
        const match = PRESENCE_LOCK.exec(target);
        if (!match) continue;
        coverage.observed++;
        const identity = fileIdentity(descriptor).identity;
        const inode = identity.split(":")[1] ?? "";
        const id = match[2] ?? "";
        const store = path.join(match[1] ?? "", "conversations", `${id}.db`);
        let storeIdentity;
        try {
          storeIdentity = fileIdentity(store);
        } catch {
          storeIdentity = null;
        }
        sessions.push({
          harness: "agy",
          sessionId: id,
          pid: p.pid,
          source: held.has(inode) ? AGY_FLOCK_SOURCE : AGY_OPEN_SOURCE,
          sourceRef: descriptor,
          cwd: "",
          startedAt: p.birthMs,
          pidDomain: p.pidDomain,
          procStart: p.startTicks,
          bootId: p.bootId,
          changed: false,
          transcripts: [
            storeIdentity
              ? {
                  path: store,
                  state: "conversation-store-named-by-lock",
                  method: "stat-only; sqlite content not read",
                  ...storeIdentity,
                  changed: false,
                  sessionId: id,
                }
              : { path: store, state: "not-found", method: "stat" },
          ],
        });
        // Remembered for the after-capture recheck.
        lockTargets.set(descriptor, { target, identity });
      } catch {
        coverage.rejected++;
      }
    }
  }
  return { sessions, coverage };
}

/**
 * After the capture: the descriptor still names the same lock file, and a flock observation is
 * still held by the same process. Anything else marks the observation changed.
 * @param {SessionObservation} session
 */
export function agyObservationChanged(session) {
  const before = lockTargets.get(session.sourceRef);
  if (!before) return true;
  try {
    const identity = fileIdentity(session.sourceRef).identity;
    if (fs.readlinkSync(session.sourceRef) !== before.target || identity !== before.identity)
      return true;
    if (session.source !== AGY_FLOCK_SOURCE) return false;
    return !heldLockInodes(readLocks(), session.pid).has(identity.split(":")[1] ?? "");
  } catch {
    return true;
  }
}
