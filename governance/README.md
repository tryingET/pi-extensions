---
summary: "Governance directory overview for pi-extensions policies and projections."
read_when:
  - "Inspecting pi-extensions governance projections, policies, or execution-seam fixtures."
---

# Project Work Items

This file tracks project-specific work (features, bugs, improvements).

## Purpose

**This is a PLANNING ARTIFACT, not an execution queue.**

| Aspect | Status |
|--------|--------|
| Structure | ✓ Complete |
| Validation | ✓ CUE schema |
| Operational | ✗ No scheduler support |

Projects may also use:
- Git issues / milestones
- FCOS work-items (for cross-repo work)
- External trackers

## Ontology

```
Milestone > Issue > Task
```

## State Machine

```
triage → queued → doing → review → done
```

| State | Meaning |
|-------|---------|
| triage | Not yet shaped |
| queued | Ready to start |
| doing | In progress |
| review | Awaiting review |
| done | Complete |

## Structure

| Field | Description |
|-------|-------------|
| `id` | Issue ID (e.g., `PROJ-M1-01`) |
| `title` | Short description |
| `state` | `triage` \| `queued` \| `doing` \| `review` \| `done` |
| `tasks` | List of tasks with `text` and `done` |
| `dod` | Definition of done |

## Validation

The retired `governance/work-items.json` AK projection was removed: it had no
live mechanical readers in this repo, and Agent Kernel (`ak task list`) is the
live authority. Do not reintroduce a hand-maintained task projection here
without a mechanical consumer.

## Additional governed fixtures

- `execution-seam-cases/` — shared canonical ASC → orchestrator seam scenarios used by contract tests, consumer tests, and installed release smoke.

## Program vs Project

| Type | Location | Scope | Operational? |
|------|----------|-------|--------------|
| **Program** | governance-kernel/governance/programs/ | Cross-company | Yes |
| **Program** | company-templates/governance/programs/ | Company | No |
| **Project** | AK task truth (`ak task list`, live authority) | This repo | Yes |

## When to Use This vs Alternatives

| Use This When | Use Alternative When |
|---------------|---------------------|
| Work is specific to this repo | Work spans multiple repos (→ FCOS) |
| You want structured tracking | Simple bugs (→ git issues) |
| You need milestone tracking | Quick tasks (→ TODO comments) |

## Related

- L0 Programs: `governance-kernel/governance/programs/`
- L1 Programs: `company-templates/governance/programs/`
- State Machine: `governance-kernel/governance/fcos/state-machine.yaml`
- Glossary: `governance-kernel/docs/core/glossary.md`
