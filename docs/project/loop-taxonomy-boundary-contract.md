---
summary: "Boundary contract for surfaces named loop across pi-extensions: visible execution loops, orchestrator cognitive/workflow loops, repo validation loops, and prompt templates."
read_when:
  - "Before adding, moving, renaming, or generalizing a loop surface in pi-extensions."
  - "When deciding whether /visible-loop, /nexus-loop, loop_execute, workflow_execute, Prompt Vault templates, or repo loop-* aliases should share code or ownership."
  - "When a task uses the word loop ambiguously across pi-little-helpers, pi-society-orchestrator, Prompt Vault, or repo validation commands."
type: "contract"
system4d:
  container: "Root-level taxonomy and source-owner boundary for loop-like surfaces in pi-extensions."
  compass: "Classify loops by identity criteria and owner seam, not by the shared word loop."
  engine: "Name the loop kind -> identify owner -> use lawful seam -> preserve authority boundary -> verify with owner-local checks."
  fog: "The main risk is collapsing visible execution, cognitive orchestration, validation evidence, prompts, and authority into one generic loop abstraction."
---

# Loop taxonomy boundary contract

## Purpose

This contract keeps `loop` surfaces in `pi-extensions` composable without pretending they are the same kind of thing.

Short form:

```text
same word ≠ same kind
```

Classify loop surfaces by **identity criteria**, owner seam, and authority boundary before sharing code, moving ownership, or claiming completion.

## Design lens

A Guizzardi/UFO-style reading separates:

- **descriptions** — prompt templates, workflow specs, validation contracts;
- **events/processes** — one concrete run of a loop/workflow/validation command;
- **roles** — a run segment playing validation, review, fan-in, cleanup, or commit role;
- **dispositions/modes** — cognitive postures such as adversarial review, OODA, reflection, or transcendent iteration;
- **relators** — task scope, dispatch binding, evidence provenance, authority approval, and owner seam.

Therefore `/nexus-loop`, `loop_execute`, and `loop-impact-run` must not be merged merely because they are all loop-shaped.

## Taxonomy

| Category | Examples | Identity criteria | Owner | It may do | It must not imply |
|---|---|---|---|---|---|
| Visible execution loop | `/visible-loop`, `/nexus-loop`, `/visible-loop-child`, `visible_loop_child_complete` | Slash command/profile identity, prompt queue, child-session run id, local state sidecars | `packages/pi-little-helpers` | Launch visible Pi child sessions, queue prompts, checkpoint completion, send intercom status | AK evidence, task closure, promotion, orchestrator approval, measured candidate result |
| Visible loop profile | `DEFAULT_VISIBLE_LOOP_PROFILE`, `DEFAULT_NEXUS_LOOP_PROFILE` | Prompt sequence + default delegation policy + command label | `packages/pi-little-helpers` | Specialize visible-loop behavior without duplicating runtime machinery | A new owner or durable workflow registry |
| Cognitive/control-plane loop | `loop_execute` built-ins such as `ooda`, `strategic`, `kaizen`, `adkar`, `transcendent` | Loop type, phase contract, phase dispatch binding, package-owned KES output contract | `packages/pi-society-orchestrator` | Coordinate phase execution over public execution seams, synthesize phase status, write package-owned KES candidates where allowed | Ghostty child-session ownership, visible peer launch ownership, AK truth, lower-plane runtime ownership |
| Workflow composition | `workflow_execute`, `/workflow` | Workflow spec shape: chain/parallel/worktree composition and execution binding | `packages/pi-society-orchestrator` | Compose lower-plane owner seams and fan in results | A cognitive loop, visible-loop runner, or hidden peer spawner |
| Repo validation loop/phase | `loop-doctor`, `loop-verify-fast`, `loop-impact-plan`, `loop-impact-run`, `loop-impact-wide`, `loop-landing-check` | Repo-local validation contract and exact command invocation | Owning repo/package | Produce validation diagnostics/evidence for the current repo | Authority, merge approval, production activation, or cognitive quality |
| Prompt/procedure template | Prompt Vault templates, `.pi/prompts/*`, slash prompt expansions like `/deep-review` and `/commit` | Template name/version/source and dispatch posture | Prompt Vault or Pi prompt source owner | Provide reusable procedure text or lawful dispatch binding | Runtime authority, execution by quotation, or bypass of dispatch gates |
| Empirical campaign/evaluation loop | `pi-autoresearch` campaigns, measured candidate waves | Campaign manifest/receipt identity, metric, candidate bindings, measurement/export packets | `packages/pi-autoresearch` | Measure candidates and emit empirical packets/receipts | Orchestrator ownership, promotion authority, AK evidence by itself |

## Boundary rules

1. **Visible execution stays in `pi-little-helpers`.**
   - Owns Ghostty/Pi child launch, prompt queue delivery, local visible-loop state, intercom report-back, and completion checkpoint tooling.
   - `/nexus-loop` is a visible-loop profile, not an orchestrator loop.

2. **Control-plane cognition stays in `pi-society-orchestrator`.**
   - Owns `loop_execute` and `workflow_execute` as above-seam coordination surfaces over public execution seams.
   - May coordinate around visible loops, but must not absorb their launch/checkpoint/local-state machinery.

3. **Repo validation phases stay repo-owned.**
   - Visible or orchestrator loops may invoke repo-declared `loop-*` aliases.
   - Passing a validation phase is evidence/diagnostic context, not approval or authority.

4. **Prompt templates stay prompt-owner governed.**
   - A loop may expand or dispatch a template only through the prompt source's lawful seam.
   - Loop code must not treat prompt prose as a bypass around Prompt Vault dispatch posture or Pi prompt-source boundaries.

5. **Authority moves through authority owners only.**
   - AK owns durable task/evidence/decision truth.
   - ROCS/ontology owner repos own controlled semantics.
   - KES/learning owners own durable learning activation.
   - Child-session text, intercom messages, status JSONL, and local receipts are communication/diagnostic surfaces until promoted through the proper owner.

## Allowed seams

| From | To | Allowed seam |
|---|---|---|
| `/visible-loop` or `/nexus-loop` | repo validation | Use repo-declared `loop-*` command phase or closest documented fallback. |
| `/visible-loop` or `/nexus-loop` | `pi-society-orchestrator` | Prompt may ask the child to call `loop_execute(...)` or `workflow_execute(...)` when cognitive/workflow coordination is explicitly needed. |
| `pi-society-orchestrator` | visible loops | Recommend a visible-loop command, watch/report explicit outputs if supplied, or gate fan-in after controller verification; do not launch/own the visible-loop state machine unless a separate public seam is deliberately designed. |
| Prompt Vault | orchestrator loop | Use dispatch bindings such as known `vault_execute_template` / `loop_execute` mappings; fail closed when binding is missing. |
| Visible/cognitive/validation runs | AK/evidence/learning | Use exact owner-surface projection after verification; never infer authority from loop completion. |

## Refactor guidance

When changing loop code or docs:

1. Name the category first: visible execution loop, cognitive loop, workflow, validation phase, template, or empirical campaign.
2. Keep shared abstractions below the category boundary:
   - OK: shared labels/profile helpers inside `pi-little-helpers` for visible loop profiles.
   - OK: shared docs/taxonomy at repo root.
   - Not OK: moving Ghostty child launch into `pi-society-orchestrator` because it also has `loop_execute`.
3. Add tests at the boundary that would fail if categories collapse:
   - `/nexus-loop` remains command-aware and visible-loop-profile based.
   - `loop_execute` remains orchestrator-owned and does not spawn visible Ghostty children.
   - repo `loop-*` aliases are invoked as validation phases, not treated as approval.
4. Update product posture when maturity, proof, owner route, or next frontier changes.

## Completion contract for loop-related work

A loop-related change is complete only when the report names:

- category changed;
- owner surface;
- external seams used or intentionally not used;
- validation commands run;
- what the loop completion does **not** authorize.

This preserves the useful composition between loops while preventing word-level conflation.
