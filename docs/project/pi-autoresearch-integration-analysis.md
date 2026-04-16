---
summary: "Assessment of how upstream pi-autoresearch should be incorporated or re-envisioned inside the pi-extensions ecosystem."
read_when:
  - "Deciding whether pi-autoresearch should be imported into the monorepo."
  - "Designing an experiment-loop capability that must fit AK, Prompt Vault, ROCS, and existing pi-extension package boundaries."
system4d:
  container: "Root-level analysis note for a prospective pi-autoresearch-derived package or package family."
  compass: "Preserve the useful operator mechanics while routing authority to AK, Prompt Vault, ROCS, and the established package seams."
  engine: "Inspect upstream prototype -> map responsibilities onto current package owners -> choose import vs reenvision path."
  fog: "The main risk is importing a compelling standalone prototype wholesale and creating a second control plane with overlapping authority and unsafe git/runtime behavior."
---

# pi-autoresearch integration analysis

## Executive summary

I cloned upstream `pi-autoresearch` into:

- `/home/tryinget/ai-society/softwareco/contrib/pi-autoresearch`
- upstream commit: `5a29db0`

Verdict:

- **Worth incorporating as a pattern and capability.**
- **Not worth importing wholesale as-is.**
- The right move is a **re-envisioned monorepo package** that preserves the good experiment-loop mechanics while routing authority to:
  - **AK** for task/runtime truth
  - **Prompt Vault** for prompt/control-plane truth
  - **ROCS / ontology** for governed semantics
  - existing **pi-extension packages** for runtime, interaction, telemetry, and overlays

In short:

> Keep the idea, the benchmark protocol, the append-only run log, the confidence/noise model, and the finalize workflow idea.
> Do not keep the monolithic self-owning architecture, local-file authority model, or broad git automation unchanged.

---

## What upstream pi-autoresearch currently is

Based on:

- `../../contrib/pi-autoresearch/README.md`
- `../../contrib/pi-autoresearch/package.json`
- `../../contrib/pi-autoresearch/extensions/pi-autoresearch/index.ts`
- `../../contrib/pi-autoresearch/skills/autoresearch-create/SKILL.md`
- `../../contrib/pi-autoresearch/skills/autoresearch-finalize/SKILL.md`
- `../../contrib/pi-autoresearch/skills/autoresearch-finalize/finalize.sh`
- `../../contrib/pi-autoresearch/tests/finalize_test.sh`

Upstream provides one integrated operator feature:

- `/autoresearch ...`
- tools:
  - `init_experiment`
  - `run_experiment`
  - `log_experiment`
- a persistent local benchmark session via:
  - `autoresearch.jsonl`
  - `autoresearch.md`
  - `autoresearch.sh`
  - optional `autoresearch.checks.sh`
  - optional `autoresearch.ideas.md`
- an in-session widget / overlay / browser dashboard
- a finalize skill that turns kept experiments into independent review branches

Conceptually, it is:

> an autonomous optimization loop for a repo-local benchmark target

That can mean:

- test runtime
- build speed
- bundle size
- training loss
- Lighthouse score
- or any custom metric emitted as `METRIC name=value`

This is a strong idea.

---

## What is genuinely good and should be preserved

### 1. The benchmark protocol is good

The `METRIC name=value` convention is simple, composable, and agent-friendly.

Why it is worth preserving:

- domain-agnostic
- scriptable
- easy to log and replay
- easy to extend to secondary metrics
- easy to adapt to governed receipts/evidence later

### 2. The append-only local run log is good

`autoresearch.jsonl` is a good *local receipt/projection* surface.

Why it is worth preserving:

- survives context resets
- survives process restarts
- is human-inspectable
- is cheap to append to
- is a good substrate for export/visualization/finalization

In our ecosystem, this should remain useful — but as a **projection/receipt**, not sole authority.

### 3. The benchmark/checks split is good

Separating:

- the primary benchmark (`autoresearch.sh`)
- correctness backpressure (`autoresearch.checks.sh`)

is sound.

That distinction maps well to our governance model:

- primary optimization signal
- correctness/evidence gates

### 4. The noise-aware confidence model is good

Upstream uses a MAD-based confidence score to estimate whether an improvement clears the noise floor.

That is valuable because many optimization loops fail by overfitting to noisy benchmarks.

### 5. The finalize idea is good

The finalize workflow is one of the strongest parts of the project:

- take noisy experiment history
- group the kept changes
- reconstruct reviewable branches from merge-base
- ensure groups do not overlap on files

I ran the upstream finalize shell tests:

- `cd ../../contrib/pi-autoresearch && bash tests/finalize_test.sh`
- result: **18/18 passed**

So this part already has meaningful proof.

---

## Why it does not fit our system as a direct import

## 1. It is too monolithic

The main extension file is about **2.9k lines** and mixes too many responsibilities:

- runtime state
- Pi hooks
- loop control
- git operations
- UI widget rendering
- fullscreen overlay rendering
- browser export server
- persistence
- metrics parsing
- checks execution
- auto-resume logic

That is acceptable for an upstream prototype.
It is a bad fit for our current package-boundary discipline.

### Consequence

If we imported it as one package unchanged, we would create another package that implicitly owns:

- execution lifecycle
- prompt policy
- local authority state
- telemetry/rendering
- git behavior

That conflicts with the direction of this monorepo.

---

## 2. It creates a parallel authority model

Upstream authority is effectively:

- local files
- git state
- prompt instructions embedded in local skills

Our authority stack is intentionally different:

- **AK** = task/runtime truth
- **Prompt Vault** = governed prompt/control-plane truth
- **ROCS / ontology** = governed semantic truth
- **package-owned runtime seams** = execution/tool/UI ownership

A straight import would create a second quasi-authoritative plane.

### Consequence

The following would drift quickly if left as-is:

- what the experiment is actually for
- what files are actually in scope
- whether the loop is allowed to keep going
- what counts as evidence vs scratch memory
- how the operator should resume or finalize work

---

## 3. Its autonomous loop policy overlaps with current runtime owners

Upstream uses:

- `before_agent_start` prompt injection
- `agent_end` auto-resume via `pi.sendUserMessage(...)`
- local context-window tracking and abort logic
- strong skill language such as `NEVER STOP`

These are not just UI details.
They are **runtime lifecycle decisions**.

In our current monorepo, the closest current owner for that plane is:

- **`packages/pi-autonomous-session-control`**

And higher-order coordination sits with:

- **`packages/pi-society-orchestrator`**

### Consequence

A direct import would likely duplicate runtime-control behavior instead of composing with the existing seams.

---

## 4. Its git mutation model is too broad for our norms

Notable upstream behaviors include:

- `git add -A` before commit on keep
- broad revert/clean on discard/crash/checks failure
- finalize-time branch construction from merge-base

This is clever and productive in a personal/local prototype.
But it is too broad for our task-scope / bounded-authority expectations.

### Consequence

Without mediation through AK/task scope or explicit bounded session contracts, this is too risky for:

- monorepos
- cross-package repos
- repos with root-owned docs/policy surfaces
- sessions where only a subset of files are allowed to change

---

## 5. The local skill model is a weaker fit than Prompt Vault here

Upstream separates infrastructure from `SKILL.md`, which is directionally good.
But inside this monorepo, the better long-term fit for the loop policy is usually:

- Prompt Vault templates
- maybe a thin package-owned prompt seam
- maybe a small package-local prompt file

rather than relying primarily on bundled package-local Pi skills.

Notably, I found **no current `pi.skills` manifest entries** under `packages/*/package.json` in this monorepo.
That does not make skills invalid, but it does make them **non-idiomatic** here.

### Consequence

We should probably port the important behavioral content into Prompt Vault and keep only thin runtime/package prompts local.

---

## 6. There are already signs of code-quality drift

Two concrete observations:

### Missing stronger package validation

Upstream `package.json` has no meaningful build/check/test scripts for the extension runtime itself.
The notable executable test surface is the standalone finalize shell test.

### Likely runtime/type drift

`extensions/pi-autoresearch/index.ts` references:

- `runtime.pendingCompactResume = false`

but that field does not otherwise appear in the file.

This strongly suggests the package would need hardening before any serious adoption.

---

## How it maps onto our current ecosystem

The right question is not:

> “Should we import this repo?”

The right question is:

> “Which parts of this capability belong to which owners in our system?”

### Responsibility map

| Concern | Best current owner | What to keep / change |
|---|---|---|
| Experiment task identity, scope, lifecycle | **AK** | Make each experiment campaign an AK task or task family; keep repo-local receipts as projections |
| Prompted setup / next-step selection / finalize guidance | **Prompt Vault + `pi-vault-client`** | Move behavior from `SKILL.md` into governed templates/routers |
| Experiment / metric / hypothesis semantics | **ROCS + `pi-ontology-workflows`** | Seed governed concepts and relation vocabulary in repo-local `pi-extensions/ontology/` first, then promote later if reuse proves it |
| Runtime loop lifecycle, abort/resume, bounded autonomy | **`pi-autonomous-session-control`** | Do not let a new package invent a second execution-control plane |
| Higher-order coordination across phases / subagents | **`pi-society-orchestrator`** | Optional campaign coordination layer, not mandatory for local single-loop use |
| Interactive selection / triggers / pickers | **`pi-interaction`** | Use shared trigger/picker runtime instead of bespoke trigger logic where possible |
| Live coarse telemetry across sessions | **`pi-activity-strip`** | Publish experiment state out to the strip |
| Deep inspection of run context/history | **`pi-context-overlay`** | Use overlay for segment/run/confidence/context inspection |
| Repo-local experiment receipts / dashboard data | **new package seam** | Keep JSONL + lightweight UI, but treat it as local receipt/projection rather than sole authority |

---

## Recommended re-envisioned architecture

## Core idea

Create a new monorepo capability that keeps `/autoresearch` as UX, but internally becomes a **governed experiment loop**.

Possible package names:

- `packages/pi-autoresearch`
- `packages/pi-experiment-loop`
- `packages/pi-governed-experiment-loop`

My preference:

- keep **`/autoresearch`** as the operator-facing command
- allow the internal package design to describe itself more accurately as an **experiment loop runtime**

---

## Proposed architecture layers

### Layer 1 — local experiment runtime package

Own only what must stay local and fast:

- `run_experiment`
- `log_experiment`
- metric parsing
- JSONL receipt append
- optional benchmark/check script conventions
- lightweight session widget
- optional browser export

This package should **not** own:

- final prompt policy
- cross-session orchestration truth
- cross-repo scope truth
- ontology semantics

### Layer 2 — AK binding

Each experiment campaign should bind to AK.

Possible model:

- one AK task = one experiment campaign
- optional child tasks for:
  - instrument benchmark
  - test candidate kept change-set
  - finalize split branches
  - review/promote kept groups

Useful AK payloads:

- objective
- repo-relative scope
- required artifacts
- status (`planned`, `running`, `paused`, `complete`, `superseded`)
- evidence refs

`autoresearch.jsonl` should then be a **receipt stream**, not the only durable truth.

### Layer 3 — Prompt Vault control plane

Prompt Vault should own the durable loop instructions.

Candidate template set:

1. **experiment-setup**
   - artifact_kind: `procedure`
   - control_mode: `one_shot`
   - formalization_level: `workflow`
   - purpose: generate benchmark plan, scope, constraints, scripts

2. **experiment-next-hypothesis**
   - artifact_kind: `procedure`
   - control_mode: `one_shot` or `loop`
   - formalization_level: `workflow`
   - purpose: pick the next optimization move from run history + ASI

3. **experiment-finalize**
   - artifact_kind: `procedure`
   - control_mode: `one_shot`
   - formalization_level: `workflow`
   - purpose: group kept runs into mergeable branches/changesets

4. **experiment-state-router**
   - artifact_kind: `procedure`
   - control_mode: `router`
   - formalization_level: `structured`
   - purpose: choose whether to continue, re-baseline, stop, finalize, or escalate review

This is much more in line with how the rest of our cognition/control-plane is moving.

### Layer 4 — ontology / ROCS model

We should make the experiment-loop semantics explicit in ontology.

Candidate concepts:

- `experiment_session`
- `experiment_run`
- `benchmark_metric`
- `benchmark_script`
- `correctness_check`
- `optimization_hypothesis`
- `kept_change`
- `discard_reason`
- `experiment_receipt`
- `finalization_group`

Candidate relations:

- `measures`
- `belongs_to_session`
- `tests_hypothesis`
- `produces_receipt`
- `promotes_to_change`
- `guards`

Then `pi-ontology-workflows` can provide:

- concept discovery
- pack/search support
- explicit plan/apply for seeding repo-local `pi-extensions/ontology/` first, with later promotion to company/core only if reuse proves it

### Layer 5 — shared telemetry and overlays

Upstream’s UI is good, but we should integrate it into our UI surfaces instead of letting it remain fully self-contained.

Recommended split:

- keep a **small in-session widget** in the package
- publish a **coarse status stream** to `pi-activity-strip`
- expose a **deeper inspection view** through `pi-context-overlay`
- use `pi-interaction` for approval/grouping pickers when needed

This gives us both local ergonomics and ecosystem consistency.

---

## Import options

## Option A — Preferred: reimplement by decomposition

Use the upstream repo as a reference implementation and create a new package from scratch inside this monorepo.

### Keep

- metric protocol
- JSONL receipt shape ideas
- confidence/noise logic
- benchmark/check split
- finalize grouping idea
- `/autoresearch` operator affordance

### Replace or reroute

- local skill authority -> Prompt Vault
- runtime auto-resume authority -> ASC-compatible runtime seam
- authority model -> AK + ontology + package receipts
- bespoke all-in-one ownership -> split across existing owners
- broad git mutation defaults -> bounded, scope-aware workflow

### Why this is best

It fits current monorepo direction and avoids importing architecture debt.

---

## Option B — Short-term incubation package

If we want to move faster, we could create a direct import package first, but only under strict conditions:

- explicitly marked **incubation / prototype-derived**
- disabled by default
- no claim of owning final authority
- git operations narrowed and scope-guarded immediately
- Prompt Vault/AK integration planned from the start

This is viable only if we treat it as temporary.

---

## Option C — Leave in contrib only

Use it as inspiration without monorepo import yet.

This is acceptable if we are not ready to spend design energy now.
But if we want this capability, I think we *are* ready conceptually — we just should not import it blindly.

---

## Concrete recommendation

## Recommendation

Do **not** import upstream `pi-autoresearch` wholesale.

Do this instead:

1. keep the cloned repo in `softwareco/contrib/pi-autoresearch` as the upstream reference
2. create a short RFC / concept note for a new monorepo package
3. design the package around these boundaries:
   - **AK** = campaign/task truth
   - **Prompt Vault** = prompt/control-plane truth
   - **ROCS/ontology** = experiment semantics
   - **ASC** = runtime lifecycle seam
   - **activity/context/interaction packages** = shared UX surfaces
4. preserve the good local mechanics:
   - `METRIC` parsing
   - JSONL receipt stream
   - checks gating
   - confidence score
   - finalize grouping
5. add a root compatibility canary once the first package exists

---

## Suggested first implementation slices

### Slice 1 — concept + boundary RFC

Write an RFC that fixes:

- package name
- authority boundaries
- receipt model
- AK binding model
- Prompt Vault template set
- ontology concept set

### Slice 2 — ontology seed

Using `pi-ontology-workflows`, seed repo-local `pi-extensions/ontology/` concepts first for:

- experiment session
- run
- metric
- hypothesis
- evidence artifact
- finalize group

### Slice 3 — Prompt Vault seed

Add or draft these templates:

- `experiment-setup`
- `experiment-next-hypothesis`
- `experiment-finalize`
- `experiment-state-router`

### Slice 4 — runtime kernel

Implement the smallest local package-owned runtime that can:

- run the benchmark script
- parse metrics
- append signed/local receipts
- gate with checks
- emit status telemetry

without yet taking on full autonomous loop policy.

### Slice 5 — AK binding + bounded git behavior

Bind sessions to AK tasks and narrow git mutation defaults:

- repo-relative allowlists
- no blind `git add -A`
- explicit keep/discard transitions with scope awareness
- finalize only after explicit approval path

### Slice 6 — shared UX integration

- in-session widget stays local
- activity-strip integration for coarse live telemetry
- context-overlay integration for deep history inspection
- optional interaction-driven setup/finalize pickers

---

## Bottom line

`pi-autoresearch` is a **good prototype of a capability we probably do want**.

But the right move in this ecosystem is:

> **incorporate the capability, not the monolith**

The capability fits our system well if we route it through the owners we already have:

- AK
- Prompt Vault
- ROCS / ontology
- ASC
- interaction / activity-strip / context-overlay

That gives us something much stronger than the upstream repo:

- still fast and operator-friendly
- but now governed, composable, and consistent with the rest of `pi-extensions`
