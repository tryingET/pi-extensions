---
summary: "Session-control note for subagents that timed out or were not useful enough to trust."
read_when:
  - "You are deciding whether to reuse a prior subagent session"
  - "A subagent timed out and you want the control-plane record"
system4d:
  container: "Control-plane memory for low-trust subagent sessions."
  compass: "Avoid reusing known-bad subagent sessions without fresh evidence."
  engine: "Record timeout/failure -> consult before reuse -> prefer local continuation when trust is low."
  fog: "Stale failure memory can overfit if not revisited."
type: "reference"
---

# Non-working subagents

## 2026-03-06
- reviewer
  - objective: diagnose failing `db::tests::migration_v5_restores_search_index_and_triggers` during task #6 in `agent-kernel`
  - outcome: timed out after 300s with no diagnosis
  - note: continue locally; do not rely on this reviewer session for this failure
