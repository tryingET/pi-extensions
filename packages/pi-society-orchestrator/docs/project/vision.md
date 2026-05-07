---
summary: "North-star vision for pi-society-orchestrator as an above-seam witness, coordinator, and evidence projector."
read_when:
  - "Defining or revisiting pi-society-orchestrator direction."
  - "Deciding whether orchestration work belongs in pi-society-orchestrator or a lower owner package such as pi-autoresearch, DSPx, Prompt Vault, or AK."
  - "Adding supervision, workflow, loop, evidence, or cross-package coordination surfaces."
system4d:
  container: "Package-local north-star statement for the society orchestrator extension."
  compass: "Coordinate and witness governed work without absorbing lower-plane ownership or durable authority."
  engine:
    invariants:
      - "Call public owner seams instead of reimplementing lower-plane runtimes."
      - "Keep exact identity, evidence, and task anchors explicit."
      - "Project evidence only after verification and dedupe; do not become the source of campaign truth."
  fog:
    risks:
      - "Orchestration convenience can become authority drift."
      - "Supervision can be mistaken for owning execution."
      - "Generic workflow/loop surfaces can hide owner-specific review gates."
---

# Vision — `pi-society-orchestrator`

## North star

`pi-society-orchestrator` should be the above-seam coordination and witness layer for Pi-based society work.

It should help an operator or controller agent decide **how to coordinate** a bounded piece of work, call the right owner surfaces, supervise exact runtime artifacts, and project verified evidence upward when the authority contract allows it.

The guiding phrase is:

```text
coordinate above the seam; do not absorb the seam
```

The end state is not a mega-manager that owns tasks, reusable prompts, ontology, research runtimes, generated programs, learning persistence, and promotion decisions. The end state is a reliable orchestrator that routes, observes, gates, and explains while preserving the source-owner boundary of every lower plane.

## Owner-seam map

| Concern | Owner surface |
|---|---|
| Task identity, task status, durable evidence, direction, decision authority | AK / accepted society authority surfaces |
| Reusable prompts and governed cognitive procedures | Prompt Vault |
| Ontology / controlled semantics | ROCS / ontology owner repos |
| Local bounded experiment runtime, receipts, empirical interpretation, candidate packets | `packages/pi-autoresearch` |
| DSPy planner/program materialization, local behavior evidence, Oracle interpretation | DSPx / Oracle surfaces |
| Operator workbench, slash commands, widgets, editor UX | Pi runtime / package-local extensions |
| Learning persistence and activation | KES / notes / selected learning owners |
| Above-seam workflow, live supervision, exact evidence projection, coordination explanation | `packages/pi-society-orchestrator` |

`pi-society-orchestrator` may compose these surfaces. It must not silently become them.

## Reference lineage

For autoresearch-shaped work, the operator-experience reference is `softwareco/contrib/pi-autoresearch`: simple start, visible loop state, run logs, dashboard/export, and the practical promise of trying ideas, measuring them, and keeping only what works.

The orchestrator should preserve the **visible supervision** and **operator confidence** parts of that lineage without copying the old extension's unbounded-autonomy posture. In this repo, autoresearch work should flow through the governed package seam:

```text
operator / controller intent
-> pi-society-orchestrator exact start/observe/supervise request
-> pi-autoresearch bounded campaign runtime
-> optional DSPx/DSPy inner planning through pi-autoresearch/DSPx
-> verified runtime/ledger/receipt artifacts
-> evidence projection only when exact AK/task context verifies
```

This means:

- orchestrator can ask `pi-autoresearch` to run `planner=dspx_program` with `runDspxProgramGen=true`;
- DSPx can materialize and run the generated DSPy planner assembly;
- `pi-autoresearch` validates the generated DSPy output and applies it to the local campaign;
- orchestrator reports and supervises the result;
- orchestrator does **not** synthesize, apply, promote, or rank DSPy programs itself.

## Desired end-state behaviors

A mature orchestrator should be able to:

1. inspect current runtime truth without mutating it;
2. select the right coordination mode: direct owner call, workflow, loop, release workflow, supervision, or evidence projection;
3. require exact anchors where authority depends on identity, especially `taskId + cwd` pairs;
4. call package-owned public seams instead of importing private internals or duplicating runtimes;
5. make lower-plane boundaries visible in the operator-facing report;
6. supervise long-running or resumed work without hiding a daemon or inventing fuzzy lookup;
7. project evidence only after owner artifacts and AK/task context verify;
8. dedupe projections so observation does not spam durable authority;
9. keep KES/materialized learning work routed to package-owned or owner-approved surfaces;
10. fail closed when authority, lifecycle, owner, or artifact identity cannot be verified.

## Autoresearch and DSPx relationship

Autoresearch supervision is an exemplar seam, not a special exception.

The lawful shape is:

```text
pi-society-orchestrator = exact above-seam start/observe/supervise/project
pi-autoresearch = bounded experiment controller and receipt runtime
DSPx/DSPy = generated inner planner/program runtime and behavior evidence
AK/KES/Prompt Vault/ROCS = durable institutional owner surfaces
```

Reports should say plainly which layer did what. For example, if a campaign uses DSPx planning, the correct wording is:

```text
DSPx materialized and ran a generated DSPy planner assembly.
pi-autoresearch validated the generated DSPy output and used it as the local campaign plan.
pi-society-orchestrator requested the owner seam and supervised the result.
```

Avoid ambiguous wording like “the orchestrator used DSPy” or “DSPx output was accepted” when the important fact is that the generated DSPy planner output was validated inside the owner seam.

## Non-goals

`pi-society-orchestrator` must not become:

- a replacement for AK task/evidence/direction authority;
- a replacement for Prompt Vault procedure ownership;
- a replacement for ROCS semantic ownership;
- a hidden daemon manager;
- a package-local experiment runtime;
- a direct generated-DSPy program executor;
- an automatic peer spawner;
- a direct KES/notes/issue-tracker writer outside explicit owner-approved plans;
- a promotion or winner-selection authority.

## Non-negotiable invariants

Future work remains in-bounds only if these invariants hold:

1. exact identity is required wherever exact identity affects authority;
2. owner surfaces are called through public seams;
3. lower-plane artifacts remain lower-plane artifacts until projected through a verified owner path;
4. live supervision does not imply ownership of execution;
5. workflow and loop tools expose their gates and do not hide package-specific review requirements;
6. evidence writes are idempotent, scoped, and tied to verified context;
7. generated DSPy planner output is reported as generated/validated lower-plane output, not orchestrator-authored truth;
8. direction and promotion remain explicit owner-surface work;
9. failure to verify authority or artifact identity is a stop condition, not a prompt to improvise.

## Relationship to current posture

This document names the destination. It is not the live task queue, release gate, or current maturity claim.

Use package-local status/docs and AK task truth for execution planning. Keep this vision stable enough to prevent future implementation from drifting into authority absorption.
