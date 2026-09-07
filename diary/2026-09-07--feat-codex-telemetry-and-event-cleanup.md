---
summary: "Codex cards carry live state via its thread index and rollout files; orphaned hook records are retired."
read_when:
  - "Adding a telemetry adapter for another agent CLI."
  - "Investigating Codex session binding or leftover hook records."
type: "feature"
---

# Codex telemetry

Codex tabs were discovered and placed but showed only process facts. The gap was identity: which session is this process running?

## What Codex exposes

Sessions are rollout files under its home, indexed in a versioned SQLite database whose `threads` table names each session's rollout path, working directory, title and creation time. That index is the mapping layer.

The catch found by probing a live process: Codex holds its lock file, TUI log and state database open, but **no rollout until a task actually runs**. Starting the client and quitting created no rollout at all. So a descriptor-based link works only for a session that has done something.

## The binding rule

An open rollout descriptor is exact proof and wins. Before any task has run, a thread qualifies only when it was created after the process started **and** in the same working directory. Two candidates bind nothing, which keeps the same fail-closed contract as the rest of the ribbon.

## State

Every rollout record carries a timestamp and a payload type, so the newest timestamped record decides: a tool call means that tool is running and its arguments name the target, a completed turn means idle, anything else in flight means thinking. Approval policy and sandbox policy come along for free.

Verified against real rollouts: a completed session read as idle with its turn count and policies, and a rollout truncated mid tool call read as running `exec_command` with the exact command.

## The leak

A Claude Code session that dies without firing its end hook left its published record behind. Such a record could never produce a card, since a card needs a live process, but the files accumulated. They are now retired once no live tab claims them and they have stopped being recent, so a session that publishes before the scan first sees it is never swept away mid-startup.

Evidence and boundaries are in [Verification](../packages/pi-activity-strip/docs/project/verification.md).
