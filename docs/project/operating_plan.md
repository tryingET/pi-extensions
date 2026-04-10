---
summary: "Active operating slices for the KES activation tactical goal at the pi-extensions monorepo root."
read_when:
  - "You need the current root operating slices and their AK task bindings."
  - "AK readiness is non-empty but you need to distinguish the active routed wave from unrelated exploratory backlog."
system4d:
  container: "Operating layer for the active root tactical goal."
  compass: "Keep the plan focused on one tactical goal and bind each slice to authoritative AK task truth."
  engine: "Choose active tactical goal -> define 2-4 slices -> bind exact AK task IDs -> keep prose DRY."
  fog: "The main risk is letting unrelated pending exploration or completed package waves stand in for the current KES activation path."
---

# Operating Plan

Active strategic goal: **SG1 — Bind the next cross-package cognition control-plane wave explicitly and keep package-owner boundaries truthful**

Active tactical goal: **TG2 — Activate package-owned KES crystallization outputs in `pi-society-orchestrator` once the prompt-plane seam is bound**

## Current bounded child-set KES slices

### OP1 — Define bounded KES crystallization contract and scaffolding in `pi-society-orchestrator`
- **AK task:** `task:1089`
- **State:** active
- **Deliverable:** a package-owned KES artifact contract exists in `src/kes/` with enough docs/tests scaffolding to anchor later loop integration truthfully.

### OP2 — Wire loop execution to emit package-owned KES outputs in `pi-society-orchestrator`
- **AK task:** `task:1090`
- **State:** staged behind OP1
- **Dependency:** repo-local AK task `task:1089`
- **Deliverable:** loop/runtime paths can emit bounded KES-ready diary/crystallization outputs without inventing a second authority surface.

### OP3 — Prove KES outputs with package checks, release smoke, and root validation
- **AK task:** `task:1091`
- **State:** staged behind OP1-OP2
- **Dependency:** repo-local AK task `task:1090`
- **Deliverable:** the new KES output path is covered by package checks, release smoke, and root validation strongly enough to become the stable base for TG3 loop hardening.

## Not the current operating path

- the seam-first prompt-plane wave (`tasks:1050`, `1049`, `1051`) is completed history, not the current operating queue
- `task:962` is a deferred exploratory task and should not replace the TG2 KES packet as the active root execution anchor
- the previously completed runtime-truth package work (`tasks:939-950`) remains important history, not the current operating queue
- higher-order ASC self follow-on work belongs after TG2 and TG3; do not pull it forward into this operating plan
