---
summary: "Claude Code cards now carry live state; OpenTelemetry was the wrong shape, the transcript was the right one."
read_when:
  - "Changing Claude Code telemetry or adding an adapter for another agent CLI."
  - "Deciding between hooks, transcripts and OpenTelemetry for live agent state."
type: "feature"
---

# Live telemetry for Claude Code tabs

Agent cards showed only process facts. The operator asked for real telemetry and pointed at two candidate sources.

## Choosing the source

**OpenTelemetry was rejected.** It exports aggregate usage and cost, and needs a collector or exporter to receive anything. It never names the tool a session is running now, nor reports that a session is blocked on the operator, so it cannot drive a per-tab indicator no matter how it is wired.

**The transcript became the default source.** Each session appends records carrying the topic, the current tool and its arguments, the last prompt, the latest reply, turn counts and timestamps. It needs no configuration and works retroactively for sessions already running. Its format is internal to Claude Code and can change on any release, so parsing failure degrades to a process-only card rather than invented activity.

**Hooks cover the one gap.** A transcript goes quiet both when a session finishes and when it is waiting for approval, and those look identical from outside. The `Notification` hook distinguishes them. The ribbon's hook entrypoint costs 43ms, so subscribing `PreToolUse` would tax every tool call; only per-turn and per-session events are hooked, and the transcript keeps supplying tool state for free.

## The derivation that matters

State comes from the newest transcript record **that carries a timestamp**. Claude Code rewrites a set of latched records after every turn with no timestamp, and reading those as the tail makes a busy session look idle. A hook record overrides the transcript only when it is newer, so a permission prompt wins while the transcript is quiet and real work wins again the moment it resumes.

## Result

Three live Claude tabs reported real state: the active one as `tool` running `Bash` with its command description, the two quiet ones as `idle` with their latest reply and turn counts. No configuration was required for any of it.

Evidence and boundaries are in [Verification](../packages/pi-activity-strip/docs/project/verification.md).
