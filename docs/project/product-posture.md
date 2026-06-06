---
summary: "Root product posture for pi-extensions: monorepo control plane, package routing, and visible-loop entrypoint context."
read_when:
  - "Before running /visible-loop from the pi-extensions monorepo root."
  - "Before choosing whether a self-evolution slice belongs at root or in a package."
  - "When aligning root vision, visible self-evolution routing, or package product-posture docs."
type: "reference"
system4d:
  container: "Root product posture for the pi-extensions monorepo."
  compass: "Make root-level loop context truthful while routing implementation to package owners."
  engine: "Read root vision -> route through root capability map and visible self-evolution spine -> execute in the owning package -> validate through root/package gates."
  fog: "The main risk is letting a root visible-loop invent package authority or fail because the default prompt cannot find product posture."
---

# Product posture — pi-extensions monorepo root

## Vision relation

The root north star lives in [vision.md](./vision.md).
Root ownership details live in [root-capabilities.md](./root-capabilities.md).
Recursive-improvement routing lives in [visible-self-evolution-spine.md](./visible-self-evolution-spine.md).

This file exists so `/visible-loop` has a truthful root-level product-posture packet to read without duplicating package-local posture.

## Product promise

The monorepo root keeps shared extension policy, validation, release, compatibility, and package-routing context coherent.

Short form:

```text
route package work correctly; keep root policy dry
```

## Current product maturity

- maturity: `internal control-plane / package-routing baseline`
- current strategic line: keep root docs and validation surfaces coherent while package-local product posture owns implementation direction
- release posture: root validation gates and package quality gates exist; package-local checks remain the source of package implementation confidence

## Root-owned baseline

Root currently owns:

- shared validation and release-control surfaces described in [root-capabilities.md](./root-capabilities.md);
- repo-local operator routing prompts under `.pi/prompts/`;
- monorepo-level ownership/routing docs;
- DRY cross-package self-evolution routing through [visible-self-evolution-spine.md](./visible-self-evolution-spine.md);
- compatibility and governance surfaces that package work should not silently duplicate.

Root does not own package-local code, package-local tests, package product promises, AK task/evidence truth, ontology, Prompt Vault procedures, KES activation, or runtime execution authority.

## Visible-loop posture

`/visible-loop` defaults to reading this file and [vision.md](./vision.md) from the current working directory.
From the monorepo root, that means the loop must treat root as a router/control plane, not as the owner of every package implementation.

For live dogfood outside the current session, `pi -p` probes are useful but stateless. A `pi -p` prompt must include the repo path, package owner, exact objective, expected behavior, validation command, and non-authorizations; it cannot rely on this conversation or session memory. A fresh Ghostty tab can continue work with a new context window only when that prompt is self-contained.

Use root `/visible-loop` only when the target is one of these:

1. root-owned validation/release/compatibility/routing work;
2. cross-package documentation alignment that stays DRY and links to package owners;
3. a deliberately routed package implementation slice whose owner, metric, falsifier, and non-authorizations are already explicit.

For package implementation, prefer launching Pi from the owning package directory so the default visible-loop prompt reads that package's own `docs/project/vision.md` and `docs/project/product-posture.md`.

## Current recursive-improvement frontier

The current high-leverage self-evolution frontier is described once in [visible-self-evolution-spine.md](./visible-self-evolution-spine.md) and package postures linked from it.
That spine carries the DRY many-of-the-greats translation — cybernetic feedback, Popper falsifiers, PDCA/OODA traces, autonomy layers, specialist critics, decision budgets, and reflection guards — so package docs can link to one shared model instead of copying it.

The current routed ASC/self frontier is package-owned by [pi-autonomous-session-control](../../packages/pi-autonomous-session-control/docs/project/product-posture.md). The latest package-local slice is insight-promotion cue hardening:

```text
session-only self/subagent insight
-> typed self.insight_promotion_cue.v1 status
-> fail closed until promoted or explicitly deferred with owner/target and reason
```

Done means diagnostic/self-evolution responses name source artifact, typed promotion status, owner/target, required-before-completion, risk, next action, and non-authorizations; unresolved promotion stays required-before-completion even if caller context tries to suppress it; and ASC does not write owner docs, AK/evidence, incidents, visible-loop state, telemetry, `agent_vent`, KES, ontology, or Prompt Vault state.

## Trust gates

A root visible-loop result is trustworthy only when:

1. **File exists** — the loop can read both [vision.md](./vision.md) and this product posture.
2. **Owner route is explicit** — package implementation names the package owner and links to its posture.
3. **Session-only insight is promoted or explicitly deferred** — valuable JSONL, subagent, deep-review, or compaction insights that shaped the slice are present in the owning docs/runbook/task surface, or the loop states why they are not needed.
4. **No root authority drift** — root does not claim package-local, AK, ontology, Prompt Vault, KES, or evidence authority.
5. **Validation is scoped** — package changes run package checks; root docs/control-plane changes run root docs/quality gates.
6. **Dirty worktree is handled** — unrelated unstaged files are not staged or committed by a loop.

## Next product bets

### Bet 1 — Visible-loop root readiness

Keep this file and [vision.md](./vision.md) aligned so root `/visible-loop` naturally routes to the right package instead of failing on missing product posture or choosing vague monorepo work.

### Bet 2 — Package posture coverage

Packages that are intended visible-loop targets should maintain `docs/project/vision.md` and `docs/project/product-posture.md`, linked back to the root routing spine when cross-package self-evolution is involved.

### Bet 3 — Root/package validation routing

Make it obvious which validation gate belongs to root docs/control-plane changes versus package-local runtime changes, without copying every package's command list into root docs.

### Bet 4 — Session-output promotion discipline

When a session produces valuable analysis, especially from subagents or deep review, root posture should force one of three outcomes before `/visible-loop` is treated as ready:

1. promote the durable portion into the owning package/root doc;
2. create or route to the owning task/evidence/learning surface when appropriate;
3. explicitly defer it with the reason and owner.

Do not rely on session JSONL or a compaction summary as the only place where strategic rationale lives.
