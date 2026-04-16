---
summary: "Problem description for bringing a pi-autoresearch-style experiment loop into the pi-extensions ecosystem without violating current authority and package-boundary rules."
read_when:
  - "Before deciding whether upstream pi-autoresearch should be imported directly or re-envisioned inside the monorepo."
  - "Before drafting tasks, ontology changes, Prompt Vault templates, or package boundaries for an experiment-loop capability."
system4d:
  container: "Root-level problem statement for a prospective experiment-loop capability in pi-extensions."
  compass: "Name the actual gap precisely enough that later RFC, AK tasks, Prompt Vault work, and ontology work solve the same problem instead of importing a prototype by vibe."
  engine: "State missing capability -> state why the gap matters -> bind constraints from current owners -> define success/failure criteria."
  fog: "The main risk is mistaking a compelling standalone prototype for a directly importable architecture and accidentally creating a second control plane."
---

# Problem description — governed experiment-loop capability for Pi

## Problem in one sentence

`pi-extensions` currently has **no governed, ecosystem-native way to run long-lived benchmark/optimization loops** that preserve the operator ergonomics of upstream `pi-autoresearch` while remaining truthful to **AK**, **Prompt Vault**, **ROCS/ontology**, and current package ownership boundaries.

---

## Why this problem exists now

We now have a credible upstream prototype:

- upstream repo: `/home/tryinget/ai-society/softwareco/contrib/pi-autoresearch`
- analyzed in: [pi-autoresearch integration analysis](./pi-autoresearch-integration-analysis.md)

That prototype proves there is a useful capability here:

- define a benchmark
- run repeated experiments
- track primary + secondary metrics
- keep improvements
- discard regressions
- summarize noisy exploration into reviewable change sets

But the prototype solves this as a **self-owning standalone extension**.

Our monorepo does not currently have a truthful home for that exact shape because the capability crosses multiple already-existing authority planes:

- **AK** owns execution/task truth
- **Prompt Vault** owns prompt/control-plane truth
- **ROCS / ontology** own governed semantics
- package seams own runtime/tool/UI behavior

So the problem is not only “we lack autoresearch.”
The problem is:

> we lack a way to express this capability **without breaking the system we already built around explicit authority and package ownership**.

---

## The user-facing capability we are missing

An operator should be able to do something like:

- start an experiment campaign against a repo-local benchmark target
- let Pi iterate through candidate changes in a bounded loop
- measure results through a deterministic metric protocol
- keep only trustworthy improvements
- preserve run history across session resets
- inspect live status and run history in Pi-native UX surfaces
- finalize the noisy search into reviewable artifacts

And that should work for domains like:

- test runtime
- build time
- bundle size
- compile latency
- local evaluation metrics
- training-loss slices
- or any workload that can emit structured metrics

Today, no current package gives us that end-to-end flow in a way that is both:

1. operator-friendly, and
2. architecturally truthful inside this monorepo.

---

## Why importing upstream as-is does not solve the problem

Upstream `pi-autoresearch` proves the capability, but not the right architecture for this monorepo.

Based on the integration analysis, the upstream prototype currently bundles together:

- prompt policy
- autonomous loop policy
- local session authority
- git mutation behavior
- UI widget/overlay/export behavior
- run logging
- finalize workflow

That is productive for a standalone tool.
It is not a truthful import shape here.

### If imported wholesale, it would create these failures

#### 1. A second authority plane

The prototype treats local files and git state as the de facto source of truth:

- `autoresearch.jsonl`
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- `autoresearch.ideas.md`

That conflicts with our current authority model where:

- AK should own task/campaign truth
- Prompt Vault should own durable loop-control prompts
- ROCS/ontology should own governed semantics

#### 2. A second runtime-control plane

The prototype includes strong session/continuation behavior such as:

- prompt injection via `before_agent_start`
- auto-resume behavior on `agent_end`
- local context-window budgeting and abort behavior

Those concerns overlap with the runtime/lifecycle plane already partially owned by `pi-autonomous-session-control` and coordinated above that by `pi-society-orchestrator`.

#### 3. Unsafe git defaults for our norms

The prototype uses broad behaviors such as:

- `git add -A`
- broad revert/clean on discard/crash
- merge-base reconstruction during finalize

Those are too broad for a system that increasingly depends on bounded scope and explicit authority.

#### 4. Monolithic ownership

The main extension file is a large monolith that mixes tool logic, runtime state, UI, persistence, git automation, and export behavior. That makes it hard to route responsibilities into current package seams.

So a direct import would not actually solve the real problem.
It would only move the prototype into the monorepo and defer the harder boundary problems.

---

## Constraints the solution must respect

Any truthful solution has to respect these existing boundaries.

## 1. AK constraint

Experiment work cannot live only as local JSONL + prose.

A real experiment campaign needs a mapping to:

- task identity
- allowed scope
- lifecycle state
- durable result/evidence references

If the loop runs without AK alignment, we lose the repo-native execution truth our broader system expects.

## 2. Prompt Vault constraint

The durable control-plane behavior should not live only in a bundled `SKILL.md` or package-local prompt blob.

We need a way to express:

- setup behavior
- next-hypothesis behavior
- finalize behavior
- stop/re-baseline routing behavior

through Prompt Vault or a Prompt Vault-aligned seam.

## 3. Ontology / ROCS constraint

If this capability becomes real, it needs governed concepts rather than only implicit local filenames.

We need stable semantics for things like:

- experiment session
- run
- metric
- hypothesis
- benchmark script
- evidence artifact
- kept change group

Otherwise later orchestration, search, and evidence/reporting will stay ad hoc.

## 4. Package-boundary constraint

The solution cannot silently collapse into one package owning everything.

At minimum we already have existing owners or likely owners for:

- prompt-plane logic
- ontology workflows
- runtime/session control
- higher-order coordination
- live activity surfaces
- deep context inspection

So the new capability must be designed as a participant in the ecosystem, not a replacement for it.

## 5. Operator-ergonomics constraint

We should not “solve” this by deleting the useful parts.

The solution still needs to feel like a strong operator affordance:

- one obvious entry point
- persistent local run history
- fast benchmark protocol
- visible status
- low-friction iteration
- clear finalization path

If the result is too abstract or governance-heavy to use, it will fail even if the architecture is pure.

---

## What a correct solution must preserve from upstream

The integration analysis already identified the highest-value mechanics worth preserving.
A real solution should keep at least these ideas:

### Metric protocol

A structured metric convention like:

```text
METRIC total_ms=15200
METRIC compile_ms=4200
METRIC render_ms=9800
```

Why this matters:

- simple
- domain-agnostic
- scriptable
- easy to parse
- easy to log/replay

### Append-only local receipt stream

A local run log like `autoresearch.jsonl` is still valuable as:

- a durable local receipt stream
- a compaction-resistant memory surface
- a lightweight visualization/export input

But it should be treated as a **projection/receipt**, not the only authority.

### Benchmark/check split

Separating optimization measurement from correctness backpressure is a good design and should remain explicit.

### Noise-aware confidence scoring

Benchmark loops need a way to distinguish real improvement from noise.
A confidence/noise model is part of the capability, not an optional extra.

### Finalization of noisy search into reviewable changes

The search loop only becomes operationally useful if it can turn many noisy trials into a bounded review surface.

---

## What a correct solution must not preserve unchanged

A truthful solution should **not** preserve these upstream properties unchanged:

- local files as sole source of truth
- broad git mutation defaults
- monolithic extension ownership
- package-local prompt policy as the primary control plane
- a second runtime-lifecycle plane independent of existing session-control work

---

## Success criteria

A solution is successful when all of the following are true:

### Operator success

- there is a clear `/autoresearch`-style entry point or equivalent
- benchmark setup is low-friction
- run history persists across session resets
- the operator can see current status and inspect run history
- the operator can finalize retained improvements into reviewable output

### Authority success

- AK can represent the campaign truthfully
- Prompt Vault can represent the loop-control prompts truthfully
- ontology/ROCS can represent the core semantics truthfully
- package boundaries remain explicit rather than collapsing into one god-package

### Runtime success

- experiment execution is bounded and resumable
- the git mutation path is scope-aware and safer than upstream defaults
- local receipts remain useful without pretending to be the only authority

### Evolution success

- later canary, replay, evidence, and reporting work can attach to explicit concepts and seams
- the capability can evolve without reopening the entire ownership argument each time

---

## Failure criteria

The effort should be considered a failure if it lands in any of these states:

### False import success

The upstream repo gets copied into `packages/` but still functions as a parallel architecture with only superficial adaptation.

### Governance-only failure

We produce docs and nouns but no operator-grade benchmark loop that anyone would actually use.

### Owner-collapse failure

One package quietly accumulates prompt logic, runtime control, ontology semantics, telemetry, and finalization logic without explicit seams.

### Local-authority drift

AK, Prompt Vault, and ontology remain nominally relevant, but real truth still only lives in JSONL files and git side effects.

---

## Non-goals

This problem statement does **not** require that the first slice:

- solve cross-repo experiment orchestration
- solve remote/distributed benchmarking
- solve full execution-graph lineage
- replace existing package owners
- fully cut over all loop-lifecycle behavior into ASC on day one
- standardize every future optimization workflow in the ecosystem immediately

The real requirement is smaller:

> create a truthful first ecosystem-native experiment-loop capability with clear authority boundaries and good operator ergonomics.

---

## Decisions forced by this problem

This problem statement forces at least these architectural questions:

1. **Where is the canonical package home?**
2. **What remains local receipt/projection vs canonical authority?**
3. **What Prompt Vault templates/control surfaces are required?**
4. **What ontology concepts must exist before the capability is considered governed?**
5. **How does the runtime reuse or align with existing session-control owners instead of inventing a second lifecycle plane?**
6. **How are git operations narrowed so the loop remains safe inside bounded repo work?**

Those questions are what the RFC should answer.

---

## Recommended next document

The next document after this problem statement should be the RFC that chooses:

- the package shape
- the authority split
- the receipt model
- the first implementation slices
- the explicit non-goals for V1
