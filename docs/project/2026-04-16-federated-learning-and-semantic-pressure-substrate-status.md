---
summary: "Umbrella status note for the broader federated learning and semantic-candidate substrate beyond the package-owned KES seam in pi-extensions."
read_when:
  - "You need the shortest truthful answer to what AK umbrella task #1478 actually changed."
  - "Before claiming pi-extensions now has a broader federated semantic-candidate substrate beyond KES."
type: "reference"
system4d:
  container: "Repo-root umbrella closure note for federated learning boundaries plus the self-to-governance semantic-pressure substrate in pi-extensions."
  compass: "Bind the governance staging rehome and the self-facing semantic-pressure surface into one clear beyond-KES posture without inventing a monorepo-wide learning bus."
  engine: "Map child-task outputs -> separate owner-local capture from repo-root staging -> record what is now true vs still not implemented."
  fog: "The main risk is over-reading the new substrate as a generic learning control plane or as automatic ontology promotion."
---

# 2026-04-16 — Federated learning and semantic-pressure substrate status

## Why this note exists

AK umbrella task `#1478` — `[UMBRELLA] Define broader federated learning and semantic-candidate substrate beyond KES` — depended on two narrower slices:

- `#1479` — define `governance/ontology-candidates` staging contract and rehome path
- `#1480` — revise `self` ontology-candidate memory into semantic-pressure annotations

Those child tasks are now landed.
This note records the smallest truthful answer to what now exists beyond the already-bounded package-owned KES seam in `pi-extensions`.

## What is now true

## 1. Package-owned KES remains package-owned

Nothing in this umbrella turns `packages/pi-society-orchestrator/src/kes/` into a monorepo-global learning owner.
The repo still treats KES as a **package-local seam**.

What changed is not KES ownership.
What changed is that the repo now has a clearer broader **federated semantic-candidate substrate** around it.

## 2. Repo-root ontology candidate staging is now an explicit governance surface

Repo-root ontology-specific candidate artifacts now stage under:

```text
governance/ontology-candidates/
```

That makes the repo-root semantic candidate surface:

- explicit
- narrow
- review-preserving
- clearly distinct from both package-owned KES and governed ontology truth

This surface is not a generic `docs/learnings/` replacement and not a dumping ground for package output.

## 3. `self` now exposes semantic-pressure annotations at the mirror layer

In `packages/pi-autonomous-session-control`, the preferred self-facing term is now **semantic-pressure annotation**.

That means `self` is framed more truthfully as preserving **pre-ontology semantic pressure** rather than asserting ontology truth too early.

Examples now include:

- `Remember semantic pressure: ...`
- `What semantic-pressure annotations have I recorded?`
- `Mark semantic-pressure annotation as rejected`
- `Forget semantic-pressure annotation`

Legacy ontology-candidate phrasing still works for compatibility, but the preferred operator-facing concept is now the pressure/annotation layer.

## 4. The broader substrate is layered, not centralized

The repo now has a clearer layered flow for semantic evolution:

```text
owner-local capture (package or repo)
  -> self semantic-pressure annotations when mirror memory is the right surface
  -> optional repo-root ontology candidate artifacts under governance/ontology-candidates/
  -> ontology_proposal assessment
  -> explicit review / AK-backed sequencing
  -> ontology_change plan/apply
```

This is broader than the original bounded KES seam because it defines a repo-level semantic-candidate path.
But it is still **federated by owner**, not centralized into one generic monorepo runtime.

## Authority snapshot after the umbrella

| Concern | Current truthful owner | Why |
|---|---|---|
| Package-local KES learnings | owning package | KES remains package-scoped |
| Self-facing semantic-pressure memory | `packages/pi-autonomous-session-control` | mirror/crystallization surface, not ontology authority |
| Repo-root ontology-specific candidate artifacts | `governance/ontology-candidates/` | explicit repo-root semantic staging |
| Plan-only ontology assessment | `ontology_proposal` / `pi-ontology-workflows` | candidate evaluation before mutation |
| Governed semantic truth | `ontology/` via ontology workflows | approved ontology state remains explicit and narrower |

## What this umbrella does **not** mean

This umbrella should **not** be read as having created any of the following:

- a monorepo-global KES writer
- a generic root learning bus
- automatic `self` file emission into `governance/ontology-candidates/`
- automatic semantic-pressure annotation to ontology promotion
- a signal that every package should now adopt the same repo-root candidate surface

The broader substrate is still intentionally bounded.

## Child-task mapping

| Task | Commit | Landed surface |
|---|---|---|
| `#1479` | `5fa667c` | explicit repo-root ontology candidate staging under `governance/ontology-candidates/` + rehome note |
| `#1480` | `addde39` | `self` semantic-pressure annotation query surface, compatibility aliases, and tests |

## Verification for umbrella closure

The umbrella was closed by:

1. verifying both dependency tasks were already completed
2. updating the older self-to-ontology and boundary docs so their current wording matches the new semantic-pressure surface and governance staging home
3. adding this umbrella status note and a scoped diary note
4. re-validating the touched docs with strict docs validation on a temp tree
5. re-running `packages/pi-autonomous-session-control` tests/checks because the umbrella binds the self-facing semantic-pressure surface

## Bottom line

`#1478` is complete when read as a **federated semantic-candidate substrate clarification** beyond KES:

- KES stays package-owned
- `self` captures semantic pressure as mirror memory
- repo-root ontology candidate artifacts stage explicitly under `governance/ontology-candidates/`
- `ontology_proposal` evaluates before mutation
- explicit review still gates promotion

So the repo now goes beyond a single package-owned KES seam without collapsing into a monorepo-wide learning authority.
