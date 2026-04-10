---
summary: "Tactical goals for pi-society-orchestrator after the first package-owned KES packet and first TG3 hardening slice closed."
read_when:
  - "You need the medium-sized package-local waves after the first KES packet and first TG3 hardening slice completed."
  - "You are deciding whether the next slice is loop hardening or whether no package-local task is actually ready."
system4d:
  container: "Tactical layer for package-local loop follow-through after KES proof and first TG3 hardening landed."
  compass: "Keep completed KES/TG3 work historical, and only open the next loop-hardening wave when AK makes it real."
  engine: "Active strategic goal -> 2-3 tactical goals -> keep exactly one candidate package wave active enough to guide the next session."
  fog: "The main risk is skipping AK reassessment and reopening the landed packet from stale diary memory."
---

# Tactical goals — package-owned KES follow-through

Active strategic goal: **SG2 — Harden loop-family and evidence semantics on top of the bounded KES base**

## Tactical goal set

### TG1 — Define the bounded KES contract and scaffolding in `src/kes/`
- **State:** done
- **Completed by:** `task:1089`
- **Why this is complete:** the package has one bounded seam for KES roots, artifact planning, markdown/frontmatter scaffolding, and lazy materialization under `diary/` plus `docs/learnings/`.
- **Carry-forward guardrail:** keep the seam package-owned and candidate-only; do not let `src/kes/` become a loop-runtime owner or a shadow persistence surface.

### TG2 — Wire loop execution to emit package-owned KES outputs through the new seam
- **State:** done
- **Completed by:** `task:1090` + `task:1091`
- **Why this is complete:** loop execution emits package-owned diary and candidate-only learning artifacts through the bounded seam, and installed-package release smoke proves the behavior from the packaged extension.
- **Carry-forward guardrail:** replace ad-hoc diary behavior rather than layering a second writer beside it, and treat the proof packet as landed history rather than a still-pending follow-up.

### TG3 — Harden loop family/evidence contracts around the proved KES base
- **State:** active
- **Completed slice:** `task:1107` + `task:1108`
- **Current execution anchor:** `task:1110`
- **Why this is active:** the lower prompt/KES packet is now strong enough to support loop-hardening follow-through, and the first hardening slice already landed by making invalid KES roots fail closed and by strengthening installed-package KES proof under the installed package root.
- **Current execution note:** `task:1110` is the authority-bound reassessment slice for the truthful post-hardening state while no further package-local TG3 implementation task is ready yet.
- **Success signal:** any new slice is bounded in AK before implementation starts, tightens loop-family/evidence semantics without reopening the KES contract or proof packet, and keeps higher-order ASC self explicitly downstream.

## Not the active tactical path

These were truthful earlier or remain explicitly deferred, but they are not the current package-local tactical path:
- reopening the prompt-plane seam as if raw prompt-body access were still the active blocker
- replaying the KES packet (`tasks:1089`, `1090`, `1091`) as if contract, loop emission, or proof were still missing
- replaying the first TG3 hardening slice (`tasks:1107`, `1108`) as if invalid-root fail-closed behavior or installed-package KES proof were still missing
- treating runtime-truth footer/status follow-through as the active package wave
- promoting higher-order ASC self follow-on before TG3 is justified and task-backed
