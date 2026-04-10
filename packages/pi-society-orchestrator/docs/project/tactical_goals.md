---
summary: "Tactical goals for the active package-owned KES wave in pi-society-orchestrator."
read_when:
  - "You need the medium-sized package-local waves under the active KES strategic goal."
  - "You are deciding whether the next slice is contract, loop wiring, or validation proof."
system4d:
  container: "Tactical layer for package-owned KES activation."
  compass: "Land the bounded KES seam first, then route loop emission and validation behind it."
  engine: "Active strategic goal -> 2-3 tactical goals -> keep exactly one active package wave."
  fog: "The main risk is skipping the seam or proof step and widening loop behavior from stale diary assumptions."
---

# Tactical goals — package-owned KES wave

Active strategic goal: **SG1 — Make package-owned KES outputs truthful, bounded, and reusable before widening loop behavior**

## Tactical goal set

### TG1 — Define the bounded KES contract and scaffolding in `src/kes/`
- **State:** done
- **Completed by:** `task:1089`
- **Why this is complete:** the package now has one bounded seam for KES roots, artifact planning, markdown/frontmatter scaffolding, and lazy materialization under `diary/` plus `docs/learnings/`.
- **Carry-forward guardrail:** keep the seam package-owned and candidate-only; do not let `src/kes/` become a loop-runtime owner or a shadow persistence surface.

### TG2 — Wire loop execution to emit package-owned KES outputs through the new seam
- **State:** active
- **Current execution anchor:** `task:1090`
- **Why this is active:** loop execution still uses ad-hoc diary behavior in `src/loops/engine.ts`; the new contract exists, but runtime output truth now depends on consuming it.
- **Guardrails:** replace the local diary behavior instead of layering a second writer beside it, keep output roots bounded to the package contract, and do not widen loop-family semantics in the same pass.

### TG3 — Prove KES outputs through package checks, release smoke, and root validation
- **State:** next
- **Current execution anchor:** `task:1091`
- **Why next:** deterministic proof is only valuable once the loop/runtime path actually emits the bounded KES outputs from TG2.
- **Success signal:** package tests, release smoke, and root validation together prove the new KES path strongly enough to become the stable base for later loop hardening.

## Not the active tactical path

These were truthful earlier or later concerns, but they are not the current package-local tactical path:
- reopening the prompt-plane seam as if raw prompt-body access were still the active blocker
- treating runtime-truth footer/status follow-through as the active package wave
- widening loop-family semantics before loop execution consumes the bounded KES seam
- promoting higher-order ASC self follow-on before TG2/TG3 make the lower-plane outputs truthful
