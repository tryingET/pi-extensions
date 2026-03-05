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

```bash
cue vet governance/work-items.json governance/work-items.cue
```

## Program vs Project

| Type | Location | Scope | Operational? |
|------|----------|-------|--------------|
| **Program** | governance-kernel/governance/programs/ | Cross-company | Yes |
| **Program** | company-templates/governance/programs/ | Company | No |
| **Project** | repo/governance/work-items.json (this file) | This repo | No |

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
