---
summary: "Changelog for the pi-autoresearch package."
read_when:
  - "Preparing a release or reviewing package history."
system4d:
  container: "Release log for this extension package."
  compass: "Track meaningful deltas as the experiment-loop capability matures."
  engine: "Record shell -> runtime -> integration milestones as they land."
  fog: "Early versions may move quickly while package boundaries stabilize."
---

# Changelog

All notable changes to this project should be documented here.

## Unreleased

### Added

- Scaffold `@tryinget/pi-autoresearch` as the initial package shell.
- Add `/autoresearch` shell command and `autoresearch_runtime_status` tool.
- Add minimal local receipt-entry helpers and runtime tests.
- Add the bounded runtime kernel in `src/core/runtime.ts`.
- Add `autoresearch_runtime_run` for one bounded local benchmark/check execution path with append-only receipts.
- Add JSONL receipt loading/appending, baseline tracking, confidence scoring, and bounded runtime execution tests.
- Harden candidate-result adapter packet validation so malformed candidate binding fields and non-finite candidate-run metrics fail closed before downstream review/evidence adapters consume them.
