import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseProcStat, recoveryHarness } from "../src/native/recovery-proc.mjs";
import {
  claudeRegistry,
  codexDescriptors,
  inspectTranscript,
  markRepublished,
  nodecodeShellRoot,
  nodecodeShells,
  sessionHeader,
  transcriptIndex,
} from "../src/native/recovery-sources.mjs";

const id = "11111111-2222-4333-8444-555555555555";
function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "recovery-synthetic-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("Codex read-only fd is only an open-descriptor association, with inode recheck", (t) => {
  const root = scratch(t);
  fs.mkdirSync(path.join(root, "sessions"));
  const file = path.join(root, "sessions", "rollout-synthetic.jsonl");
  fs.writeFileSync(
    file,
    `${JSON.stringify({ type: "session_meta", payload: { id, cwd: "/synthetic", timestamp: "2026-01-01T00:00:00Z" } })}\n`,
  );
  const fd = fs.openSync(file, "r");
  try {
    const found = codexDescriptors(
      [
        {
          pid: process.pid,
          harness: "codex",
          pidDomain: "synthetic",
          startTicks: "100",
          bootId: "synthetic",
        },
      ],
      root,
    );
    assert.equal(found.sessions.length, 1);
    assert.equal(found.sessions[0].sessionId, id);
    assert.equal(found.sessions[0].changed, false);
    assert.equal(found.sessions[0].source, "codex-open-rollout");
    assert.ok(!JSON.stringify(found).includes("writer"));
  } finally {
    fs.closeSync(fd);
  }
});

test("registry admits allowlisted metadata only and counts malformed/oversized entries", (t) => {
  const root = scratch(t);
  fs.writeFileSync(
    path.join(root, "20.json"),
    JSON.stringify({
      pid: 20,
      sessionId: id,
      cwd: "/synthetic",
      startedAt: 1800000000000,
      pidDomain: "synthetic",
      procStart: "16",
      name: "PRIVATE_SYNTHETIC_SENTINEL",
      messagingSocketPath: "PRIVATE_SYNTHETIC_SENTINEL",
    }),
  );
  fs.writeFileSync(path.join(root, "bad.json"), "not JSON");
  fs.writeFileSync(path.join(root, "large.json"), " ".repeat(262145));
  fs.writeFileSync(path.join(root, "invalid.json"), JSON.stringify({ pid: "20", sessionId: id }));
  const found = claudeRegistry(root);
  assert.equal(found.coverage.observed, 4);
  assert.equal(found.coverage.rejected, 3);
  assert.equal(found.sessions.length, 1);
  assert.ok(!JSON.stringify(found).includes("PRIVATE_SYNTHETIC_SENTINEL"));
  assert.equal(claudeRegistry(path.join(root, "absent")).coverage.state, "unavailable");
});

test("Given Nodecode shell presence records, when read, then only well-formed records are admitted and no resume command leaves", (t) => {
  const root = scratch(t);
  const shell = {
    version: 1,
    kind: "nodecode-shell",
    pid: 20,
    start_ticks: 16,
    session_id: "s-U82YC5MU",
    profile: "PRIVATE_SYNTHETIC_SENTINEL",
    home: "/PRIVATE_SYNTHETIC_SENTINEL/",
    cwd: "/synthetic",
    resume_argv: ["nodecode", "resume", "PRIVATE_SYNTHETIC_SENTINEL"],
    updated_at: 1800000000,
  };
  const write = (name, value, dir = root) =>
    fs.writeFileSync(
      path.join(dir, name),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  const { start_ticks: _ticks, ...withoutTicks } = shell;
  write("20.json", shell);
  // Without start ticks a record could claim a later Nodecode on its pid, so it is refused.
  write("28.json", { ...shell, pid: 28, start_ticks: null });
  write("33.json", { ...withoutTicks, pid: 33 });
  write("31.json", { ...shell, pid: 31, start_ticks: -1 });
  write("25.json", { ...shell, pid: 25, start_ticks: "16" });
  write("21.json", { ...shell, pid: 22 });
  write("30.json", { ...shell, pid: "30" });
  write("0.json", { ...shell, pid: 0 });
  write("23.json", { ...shell, pid: 23, kind: "nodecode-gateway" });
  write("24.json", { ...shell, pid: 24, version: 2 });
  write("26.json", { ...shell, pid: 26, session_id: "" });
  write("29.json", { ...shell, pid: 29, session_id: "s-U82YC5MU and more" });
  write("32.json", { ...shell, pid: 32, session_id: "s".repeat(129) });
  // Valid JSON, refused only for its size.
  write("27.json", JSON.stringify({ ...shell, pid: 27 }) + " ".repeat(262145));
  write("bad.json", "not JSON");
  // The writer never links; a link to an otherwise valid record is refused.
  const elsewhere = path.join(root, "elsewhere");
  fs.mkdirSync(elsewhere);
  write("35.json", { ...shell, pid: 35 }, elsewhere);
  fs.symlinkSync(path.join(elsewhere, "35.json"), path.join(root, "35.json"));
  const found = nodecodeShells(root);
  assert.equal(found.coverage.observed, 16);
  assert.equal(found.coverage.rejected, 15);
  assert.deepEqual(
    found.sessions.map((s) => [s.harness, s.sessionId, s.pid, s.procStart, s.source, s.pidDomain]),
    [["nodecode", "s-U82YC5MU", 20, "16", "nodecode-shell-presence", null]],
  );
  assert.equal(found.sessions[0].cwd, "/synthetic");
  assert.ok(!JSON.stringify(found).includes("PRIVATE_SYNTHETIC_SENTINEL"));
  assert.equal(nodecodeShells(path.join(root, "absent")).coverage.state, "unavailable");
});

test("Given XDG_RUNTIME_DIR, when the shell presence root is chosen, then only an absolute one is read, as Nodecode writes", () => {
  assert.equal(
    nodecodeShellRoot({ XDG_RUNTIME_DIR: "/run/user/1000" }),
    "/run/user/1000/nodecode/shells",
  );
  assert.equal(
    nodecodeShellRoot({ XDG_RUNTIME_DIR: "/run/user/1000/" }),
    "/run/user/1000/nodecode/shells",
  );
  for (const value of [undefined, "", "relative/dir", "./run"]) {
    assert.equal(nodecodeShellRoot({ XDG_RUNTIME_DIR: value }), null);
  }
  const none = nodecodeShells(null);
  assert.equal(none.coverage.state, "unavailable");
  assert.equal(none.coverage.observed, 0);
  assert.ok(none.coverage.limitations.includes("XDG_RUNTIME_DIR unset or relative"));
  assert.equal(none.sessions.length, 0);
});

test("Given a source reread after capture, when a row no longer says the same, then its observation is marked changed", () => {
  const shell = {
    harness: "nodecode",
    sessionId: "s-U82YC5MU",
    pid: 20,
    source: "nodecode-shell-presence",
    sourceRef: "/synthetic/20.json",
    cwd: "/synthetic",
    startedAt: 0,
    pidDomain: null,
    procStart: "16",
    bootId: null,
    changed: false,
    transcripts: [],
  };
  const reread = (after, row = shell) => {
    const sessions = [structuredClone(row)];
    markRepublished(sessions, new Map([["nodecode-shell-presence", after]]));
    return sessions[0].changed;
  };
  assert.equal(reread([{ ...shell }]), false);
  assert.equal(reread([{ ...shell, sessionId: "fork-turn-1U6LA5U-Y76LVYTQT8-1" }]), true);
  assert.equal(reread([{ ...shell, procStart: "17" }]), true);
  assert.equal(reread([]), true);
  assert.equal(reread([{ ...shell, changed: true }]), true);
  // A row already seen changing while it was read stays changed, whatever the reread says.
  assert.equal(reread([{ ...shell }], { ...shell, changed: true }), true);
  // A source with no reread keeps its own verdict.
  assert.equal(reread([], { ...shell, source: "codex-open-rollout" }), false);
});

test("jq reads first Pi header only; body and malformed later lines are not consumed", (t) => {
  const file = path.join(scratch(t), "pi.jsonl");
  fs.writeFileSync(
    file,
    `${JSON.stringify({ type: "session", id, cwd: "/synthetic", timestamp: "2026-01-01T00:00:00Z", arbitrary: "PRIVATE_SYNTHETIC_SENTINEL" })}\nnot JSON PRIVATE_SYNTHETIC_SENTINEL\n`,
  );
  assert.deepEqual(sessionHeader(file, "pi"), {
    id,
    cwd: "/synthetic",
    timestamp: "2026-01-01T00:00:00Z",
  });
  assert.equal(inspectTranscript(file, id, "pi").state, "header-id-matched");
  assert.equal(inspectTranscript(file, "different", "pi").state, "header-unconfirmed");
});

test("Codex root session_id is not confused with thread id; filename need not end in thread UUID", (t) => {
  const file = path.join(scratch(t), "rollout-thread_other-rollout-id.jsonl");
  fs.writeFileSync(
    file,
    `${JSON.stringify({ type: "session_meta", payload: { id, session_id: "22222222-2222-4333-8444-555555555555", cwd: "/synthetic", timestamp: "2026-01-01T00:00:00Z", instructions: "PRIVATE_SYNTHETIC_SENTINEL" } })}\nnot JSON\n`,
  );
  assert.equal(sessionHeader(file, "codex").id, id);
  assert.ok(!JSON.stringify(sessionHeader(file, "codex")).includes("PRIVATE_SYNTHETIC_SENTINEL"));
  assert.equal(inspectTranscript(file, id, "codex").state, "header-id-matched");
});

test("Claude transcript discovery is filename/stat only, even when body is invalid or private", (t) => {
  const root = scratch(t);
  fs.mkdirSync(path.join(root, "project"));
  const file = path.join(root, "project", `${id}.jsonl`);
  fs.writeFileSync(file, "PRIVATE_SYNTHETIC_SENTINEL invalid JSON");
  const found = transcriptIndex(root);
  assert.deepEqual(found.files.get(id), [file]);
  const observed = inspectTranscript(file, id, "claude");
  assert.equal(observed.state, "filename-candidate");
  assert.ok(!JSON.stringify(observed).includes("PRIVATE_SYNTHETIC_SENTINEL"));
  assert.equal(inspectTranscript(`${file}.absent`, id, "claude").state, "unavailable");
});

test("transcript index retains duplicate candidates; does not follow symlink directory or guess UUID", (t) => {
  const root = scratch(t);
  for (const name of ["a", "b"]) {
    fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, name, `${id}.jsonl`), "");
  }
  fs.symlinkSync(path.join(root, "a"), path.join(root, "symlink"));
  fs.writeFileSync(path.join(root, "not-a-uuid.jsonl"), "");
  const found = transcriptIndex(root);
  assert.equal(found.files.get(id).length, 2);
  assert.equal(found.coverage.observed, 3);
});

test("proc stat parser handles parentheses in comm and does not assume fixed comm width", () => {
  const fields = ["S", "10", ...Array(17).fill("0"), "12345"];
  assert.deepEqual(parseProcStat(`20 (claude (title)) ${fields.join(" ")}`, 20), {
    ppid: 10,
    startTicks: "12345",
  });
  assert.equal(parseProcStat(`21 (wrong) ${fields.join(" ")}`, 20), null);
});

test("classification does not treat shell prompt arguments or generic node as an agent", () => {
  assert.equal(
    recoveryHarness({ executable: "/usr/bin/bash", comm: "bash", argv0: "bash", argv1: "claude" }),
    "",
  );
  assert.equal(
    recoveryHarness({
      executable: "/usr/bin/node",
      comm: "node",
      argv0: "node",
      argv1: "/synthetic/not-agent.js",
    }),
    "",
  );
  assert.equal(
    recoveryHarness({
      executable: "/usr/bin/node",
      comm: "node",
      argv0: "node",
      argv1: "/synthetic/pi-coding-agent/dist/cli.js",
    }),
    "pi",
  );
  assert.equal(
    recoveryHarness({
      executable: "/usr/bin/claude",
      comm: "claude",
      argv0: "claude",
      argv1: "PRIVATE_SYNTHETIC_SENTINEL",
    }),
    "claude",
  );
});
