---
summary: "Bounded KES crystallization contract for package-owned diary and learning-candidate scaffolding in pi-society-orchestrator."
read_when:
  - "Implementing or reviewing KES outputs in pi-society-orchestrator."
  - "Before wiring loop execution to emit package-local diary or learning-candidate artifacts."
system4d:
  container: "Package-local contract note for orchestrator-owned KES outputs."
  compass: "Keep KES outputs bounded, attributable, and package-owned."
  engine: "Define roots -> define artifact kinds -> define seam -> stage follow-on work."
  fog: "The main risk is inventing a shadow authority surface or auto-promoting learning claims without bounded evidence."
---

# 2026-04-10 — KES crystallization contract

## Why this note exists

`pi-society-orchestrator` already has loop execution and diary-like writes, but until `task:1089` there was no package-owned contract for how KES artifacts should be shaped, bounded, or handed off to later loop integration.

This note defines the smallest truthful contract before runtime wiring:
- package-local KES helpers live in `src/kes/`
- raw capture lands in `diary/`
- durable promotion staging lands in `docs/learnings/`
- promotion remains candidate-only until a later explicit review chooses a broader landing

## Contract summary

| Artifact | Root | State | Purpose |
|---|---|---|---|
| Diary entry | `diary/` | raw capture | Preserve attributable execution memory before promotion or synthesis. |
| Learning candidate | `docs/learnings/` | candidate-only | Stage a durable reusable claim without inventing a second authority surface or auto-publishing to broader systems. |

Scaffold roots are created lazily by the helper when the first truthful emission happens. This task does **not** pre-populate those directories with placeholder files.

## Public seam

The initial package-owned seam is intentionally narrow:
- `resolveKesRoots(packageRoot)`
- `ensureKesRoots(packageRoot)`
- `createKesArtifactPlan(packageRoot, request)`
- `materializeKesArtifactPlan(plan)`

The seam owns only:
- bounded path resolution
- markdown/frontmatter scaffolding
- diary + learning-candidate artifact planning
- lazy creation of the two allowed roots

The seam does **not** own:
- loop execution semantics
- cross-package state
- Prompt Vault mutations
- Agent Kernel mutations
- automatic TIP/meta propagation

## Guardrails

- Keep all emitted artifacts inside the package root under `diary/` or `docs/learnings/`.
- Keep learning outputs candidate-only until a later explicit promotion step says otherwise.
- Do not write to repo-root `diary/`, external package paths, Prompt Vault, or ASC-owned state from `src/kes/`.
- Do not treat generated learnings as a second live authority surface; they remain package-owned narrative artifacts tied back to raw diary evidence.
- Keep the seam self-contained enough that later loop integration can consume it without reopening the ownership question.

## Task binding

- `task:1089` — define bounded KES crystallization contract and scaffolding in `pi-society-orchestrator`
- `task:1090` — wire loop execution to emit package-owned KES outputs through that seam
- `task:1091` — prove KES outputs with package checks, release smoke, and root validation

## Immediate consequence

The original execution order after this note landed was:
1. replace the ad-hoc loop-local diary behavior with the package-owned KES seam (`task:1090`)
2. then prove those emitted outputs through deterministic validation (`task:1091`)

That packet is now complete. Future work should start from the proved KES base rather than rediscovering whether the seam, loop emission, or validation surfaces exist.
