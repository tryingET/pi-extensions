#!/usr/bin/env node
// ---
// summary: "Live check of agy presence-lock binding: every running agy process, its presence locks, and whether the flock is matched (AK8809)."
// read_when: ["verifying agy lock matching on a real host, e.g. btrfs where /proc/locks and stat disagree on the device"]
// ---
import fs from "node:fs";
import { nodeProcfs } from "../src/native/agent-discovery.mjs";
import { heldLockInodes, resolveAgySession } from "../src/native/agy-discovery.mjs";

const locks = fs.readFileSync("/proc/locks", "utf8");
const rows = [];
for (const pid of fs
  .readdirSync("/proc")
  .filter((n) => /^\d+$/.test(n))
  .map(Number)) {
  let comm = "";
  try {
    comm = fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim();
  } catch {
    continue;
  }
  if (comm !== "agy") continue;
  const session = resolveAgySession(pid, nodeProcfs, {
    locks,
    lockInodeOf: nodeProcfs.lockInodeOf,
  });
  rows.push({
    pid,
    held: [...heldLockInodes(locks, pid)].length,
    conversation: session?.conversationId ?? null,
    evidence: session?.evidence ?? null,
  });
}
console.log(JSON.stringify(rows));
