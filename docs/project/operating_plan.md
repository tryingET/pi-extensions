---
summary: "Active operating slices for the seam-first tactical goal at the pi-extensions monorepo root."
read_when:
  - "You need the current root operating slices and their AK task bindings."
  - "AK readiness is non-empty but you need to distinguish the active routed wave from unrelated exploratory backlog."
system4d:
  container: "Operating layer for the active root tactical goal."
  compass: "Keep the plan focused on one tactical goal and bind each slice to authoritative AK task truth."
  engine: "Choose active tactical goal -> define 2-4 slices -> bind exact AK task IDs -> keep prose DRY."
  fog: "The main risk is letting unrelated pending exploration or completed package waves stand in for the current seam-first execution path."
---

# Operating Plan

Active strategic goal: **SG1 — Bind the next cross-package cognition control-plane wave explicitly and keep package-owner boundaries truthful**

Active tactical goal: **TG1 — Bind the thin prompt-plane seam between `pi-vault-client` and `pi-society-orchestrator` before broader KES/loop activation**

## Current bounded child-set rollover slices

### OP1 — Expose a supported non-UI `pi-vault-client` prompt-plane seam for orchestrator consumers
- **AK task:** `task:1050`
- **State:** active
- **Deliverable:** a supported `pi-vault-client` seam exists for orchestrator cognitive-tool consumers so the active wave no longer depends on raw prompt-plane reads from the consumer side.

### OP2 — Rewire `pi-society-orchestrator` prompt-plane reads to the supported seam
- **AK task:** `task:1049`
- **State:** staged behind OP1
- **Dependency:** repo-local AK task `task:1050`
- **Deliverable:** orchestrator stops treating local prompt-plane access as an acceptable long-term boundary and consumes the supported `pi-vault-client` seam instead.

### OP3 — Prove the new prompt-plane seam with package checks, release smoke, and root validation
- **AK task:** `task:1051`
- **State:** staged behind OP1-OP2
- **Dependency:** repo-local AK tasks `task:1049-1050`
- **Deliverable:** the new seam is covered by package checks, release smoke, and root validation strongly enough to become the stable base for the next KES and loop waves.

## Not the current operating path

- `task:962` remains a real pending exploratory task, but it is not the current routed wave and should not replace the seam-first packet as the active root execution anchor.
- the previously completed runtime-truth package work (`tasks:939-950`) remains important history, not the current operating queue.
- later KES activation and loop hardening belong to the next tactical goals after TG1 closes; do not pull them forward into this operating plan yet.
