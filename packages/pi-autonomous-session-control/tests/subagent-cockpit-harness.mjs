import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  COCKPIT_CHANNEL_ENV,
  createCockpitChannel,
  mutateChannel,
} from "../extensions/self/subagent-cockpit-channel.ts";
import {
  readSubagentCockpit,
  requestSubagentSteering,
} from "../extensions/self/subagent-cockpit-data.ts";
import { getProcessStartTicks, writeSessionStatus } from "../extensions/self/subagent-session.ts";

export function fixture() {
  const root = mkdtempSync(join(tmpdir(), "asc-cockpit-test-"));
  mkdirSync(join(root, ".git"));
  const sessionsDir = join(root, "sessions");
  mkdirSync(sessionsDir, { mode: 0o700 });
  const binding = {
    sessionsDir,
    sessionName: "child",
    dispatchId: "dispatch-1",
    attemptId: "attempt-1",
    parentSessionKey: "parent-1",
    parentRepoRoot: root,
    cwd: root,
    sessionFile: join(sessionsDir, "child.jsonl"),
  };
  const state = {
    sessionsDir,
    activeCount: 0,
    completedCount: 0,
    maxConcurrent: 5,
    reservedSessionNames: new Set(),
  };
  const fields = {
    status: "running",
    pid: process.pid,
    ppid: process.ppid,
    pidStartedAt: getProcessStartTicks(process.pid),
    pidIdentity: "proc-start-ticks",
    createdAt: new Date().toISOString(),
    sessionKind: "subagent",
    dispatchId: binding.dispatchId,
    attemptId: binding.attemptId,
    parentSessionKey: binding.parentSessionKey,
    parentRepoRoot: root,
    sessionFile: binding.sessionFile,
  };
  writeSessionStatus(sessionsDir, binding.sessionName, fields);
  const dir = createCockpitChannel(binding);
  return {
    root,
    dir,
    binding,
    state,
    fields,
    ready() {
      mutateChannel(dir, (c) => {
        c.phase = "open";
        c.childPid = process.pid;
        c.childTicks = getProcessStartTicks(process.pid);
      });
    },
    snapshot(options = { currentSessionKey: binding.parentSessionKey, currentRepoRoot: root }) {
      return readSubagentCockpit(sessionsDir, binding.sessionName, options);
    },
    send(overrides = {}) {
      return requestSubagentSteering({
        state,
        dispatchId: binding.dispatchId,
        attemptId: binding.attemptId,
        parentSessionKey: binding.parentSessionKey,
        parentRepoRoot: root,
        requestedBy: "operator",
        message: "Literal guidance",
        ...overrides,
      });
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export function withChannelEnv(dir, action) {
  const previous = process.env[COCKPIT_CHANNEL_ENV];
  process.env[COCKPIT_CHANNEL_ENV] = dir;
  try {
    return action();
  } finally {
    if (previous === undefined) delete process.env[COCKPIT_CHANNEL_ENV];
    else process.env[COCKPIT_CHANNEL_ENV] = previous;
  }
}
