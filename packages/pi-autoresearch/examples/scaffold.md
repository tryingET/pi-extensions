---
summary: "Small example of the current pi-autoresearch bounded-runtime surface."
read_when:
  - "You want a concrete example of what the bounded runtime currently exposes."
system4d:
  container: "Package example artifact."
  compass: "Show the bounded runtime surface without pretending the higher-order autonomous loop already exists."
  engine: "Inspect command -> inspect tools -> note remaining control-plane work."
  fog: "Examples can drift if they silently imply capabilities not yet implemented."
---

# Example: bounded-runtime inspection

Current package surfaces:

- `/autoresearch`
- `autoresearch_runtime_status`
- `autoresearch_runtime_run`

Example tool/result themes:

- phase: `bounded_runtime_kernel`
- local receipt log: `autoresearch.jsonl`
- benchmark/check execution: one bounded local run at a time
- ready Prompt Vault templates:
  - `pi-autoresearch-setup`
  - `pi-autoresearch-next-hypothesis`
  - `pi-autoresearch-finalize`
- blocked router template:
  - `pi-autoresearch-state-router`
- still out of scope:
  - AK campaign binding
  - autonomous resume/loop lifecycle
  - finalization path orchestration
