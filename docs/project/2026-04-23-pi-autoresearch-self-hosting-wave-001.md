---
summary: "Actual repo-root self-hosting campaign bundle for the first truthful pi-autoresearch wave: public self-hosting seam hardening under a pinned controller baseline, snapshot-owned source-inspection suites, and explicit external promotion discipline."
read_when:
  - "You want the real repo-root self-hosting campaign for pi-autoresearch instead of a toy scaffold."
  - "You are about to run autoresearch_self_hosting_run from the pi-extensions repo root."
  - "You need to know why the first actual evaluator bundle is source-inspection-only instead of package-manager-driven runtime execution."
type: "reference"
---

# pi-autoresearch self-hosting wave 001

## Intent

This is the first **actual repo-root self-hosting campaign** for `packages/pi-autoresearch`.

It exists to make one narrow real thing easier before any broader recursive ambition:

- harden the public supervised self-hosting seam
- keep operator-facing help/status/docs aligned
- preserve the authority split
- refuse hidden daemonization, package-local self-promotion, and AK mutation

## Campaign id

`self-hosting-wave-001-public-seam-hardening`

## Controller posture

- controller cwd: repo root
  - `/home/tryinget/ai-society/softwareco/owned/pi-extensions`
- controller mode: pinned commit
- target package scope:
  - `packages/pi-autoresearch/**`

## Why the first real evaluator is source-inspection-only

The first actual candidate worktree is a git worktree rooted at repo scope.
That worktree does **not** automatically carry ignored package-local `node_modules/` trees.

So the first truthful evaluator bundle deliberately avoids pretending that candidate runtime execution is already a solved substrate.
It does **not** use candidate-owned package-manager scripts as judge truth.
It does **not** silently hydrate candidate dependencies through hidden side effects.

Instead, the first evaluator bundle proves a narrower but real claim:

- the public self-hosting seam is present
- `start_and_watch` is visible in the public contract
- runtime/help/docs surfaces stay aligned
- the repo-root campaign remains externally governed

That is weaker than full behavioral execution, but it is stronger than fake automation.
A later widening can add explicit candidate dependency hydration only if it becomes a separately governed slice.

## Snapshot-owned suites

The repo-root evaluator bundle lives under:

- `evaluator-snapshot/manifest.json`
- `evaluator-snapshot/lib/source-assert.mjs`
- `evaluator-snapshot/suites/*.mjs`

Current suites:

- `dev-self-hosting-tool-surface`
  - check the candidate extension source still exposes the supervised self-hosting tool plus `start_and_watch`
- `holdout-operator-guidance-surface`
  - check the candidate README still describes the public self-hosting seam honestly
- `transfer-runtime-surface`
  - check the candidate runtime help/status surface still advertises the self-hosting seam and `start_and_watch`
- `transfer-status-doc-surface`
  - check package-local status truth still records the bounded public self-hosting posture

## Local campaign artifacts

Repo root controller-owned artifacts:

- `autoresearch.self-hosting.json`
- `artifacts/autoresearch.self-hosting.evaluator.lock.json`
- `autoresearch.self-hosting.promotion.json`

These are controller-owned campaign artifacts.
They are not candidate-owned mutator state.

## How to run

After `/reload`, run from the repo root with explicit metric inputs.

Status only:

```js
autoresearch_self_hosting_run({
  action: "status",
  cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions"
})
```

Prepare the candidate worktree:

```js
autoresearch_self_hosting_run({
  action: "prepare_candidate",
  cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
  apply: true
})
```

Controller-owned mutator for this first actual wave:

```bash
node /home/tryinget/ai-society/softwareco/owned/pi-extensions/scripts/autoresearch-self-hosting-wave-001-apply-current-package-diff.mjs \
  --controller-cwd /home/tryinget/ai-society/softwareco/owned/pi-extensions
```

Bounded watched wave:

```js
autoresearch_self_hosting_run({
  action: "start_and_watch",
  cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions",
  candidateCommand: [
    "node",
    "/home/tryinget/ai-society/softwareco/owned/pi-extensions/scripts/autoresearch-self-hosting-wave-001-apply-current-package-diff.mjs",
    "--controller-cwd",
    "/home/tryinget/ai-society/softwareco/owned/pi-extensions"
  ],
  primaryMetricBaseline: 2,
  primaryMetricCandidate: 1
})
```

## Important operational note

The campaign is pinned to a controller baseline.
If the working tree is dirty or materially ahead of the pinned controller ref, clean or commit the intended controller baseline before treating a run as promotion-worthy truth.

## Non-goals

This first actual wave still does **not** mean:

- hidden recursive autonomy
- automatic controller rotation
- package-local self-promotion
- direct AK mutation
- candidate-owned evaluator dispatch
- silent dependency hydration in the candidate worktree
