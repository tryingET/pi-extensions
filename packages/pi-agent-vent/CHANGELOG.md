---
summary: "Changelog for pi-agent-vent package releases."
read_when:
  - "Preparing a release or reviewing pi-agent-vent history."
system4d:
  container: "Release log for the pi-agent-vent extension package."
  compass: "Track meaningful package deltas at release boundaries."
  engine: "Summarize shipped behavior -> align package version -> release through monorepo component flow."
  fog: "Scaffold changelog text can hide the real first-release payload."
---

# Changelog

All notable changes to this project should be documented here.

## [0.1.1] - 2026-05-22

### Changed

- Removed the `/agent-vent` command compatibility alias; runtime-facing tool, command, and toolbox bundle naming is now singularly `agent_vent`.

## [0.1.0] - 2026-05-21

### Added

- Added the `agent_vent` Pi tool for local agent frustration capture.
- Added `/agent_vent` inspection command.
- Added local append-only JSONL storage at `~/.pi/agent/agent-vent/vents.jsonl`, overridable with `PI_AGENT_VENT_DIR`.
- Added recurrence grouping, advisory candidate-incident heuristics, malformed-line tolerance, and conservative secret redaction.
- Added `node:test` coverage for redaction, JSONL round trips, recurrence summaries, and validation errors.
- Added engineering-core-aligned design and implementation-plan docs.
- Integrated discovery through the `pi-toolbox-discovery` `agent_vent` bundle while preserving ASC/self ownership boundaries.
