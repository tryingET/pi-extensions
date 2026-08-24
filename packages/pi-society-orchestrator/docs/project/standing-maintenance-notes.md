---
summary: "Standing maintenance notes for loop dispatch classification and governed closure workflows."
read_when:
  - "Adding an early-return path to the loop dispatch() function in src/loops/engine.ts"
  - "Recording closure evidence after a loop's terminal publication"
  - "Exporting frozen task-scope snapshots for AK task closure"
type: "reference"
system4d:
  container: "Durable maintenance contracts for dispatch classification and governed closure."
  compass: "Session-boundary knowledge must live in repo artifacts, not conversation memory."
  engine: "Contract recorded at code site + reference doc -> validated by regression suite."
  fog: "Losing these notes to session churn recreates the original incidents."
---

# Standing notes: dispatch classification and governed closure

Notes that must survive session boundaries. Each records a contract or a
pending external dependency, with the origin incident or commit.

## 1. New early-return paths in loop `dispatch()` must opt into `preDispatchNoEffects`

Contract: `LoopDispatchFn` (src/loops/engine.ts) carries an optional
`preDispatchNoEffects: { failureKind, reason }` attestation. When dispatch
fails **before any child process is launched** (agent/team resolution,
cognitive-tool load, cognitive tool not visible, or any future early
return), it MUST set this marker. The engine then classifies the attempt as
`confirmed_no_effects` at the effectful dispatch boundary: checkpoint
status becomes `retryable`, no terminal KES is published, same-lineage
retry stays lawful. Without the marker, the same failure degrades to
`effect_indeterminate` and terminal — by design, because the engine must
not invent no-effects claims.

Rules when adding a new early return in `dispatch()`:

1. If the failure is provably pre-spawn (no `subagentExecutor.execute`
   call was made), set `failureKind` AND `preDispatchNoEffects` with a
   reason that names the boundary.
2. If the failure can occur after spawn intent, do NOT attest — leave the
   receipt path to ASC (`effect_indeterminate` is the honest fallback).
3. The negative test in `tests/loop-pre-dispatch-failure.test.mjs`
   ("same failure without the dispatcher attestation still fails closed as
   indeterminate") guards the engine side; new dispatch boundaries should
   add their own positive test.
4. Plugin `onEnter` hooks remain a separate owner surface: they block
   phase-wide confirmed-no-effects even with an attestation (mirrors the
   ASC receipt rule).

Origin: commit 5e6e0611a; incident runs transcendent-1786827059456
(concurrent linked-neighbor install broke the vault prompt-plane seam
mid-loop; pre-fix the run died terminal despite never spawning a child).
AK-4779 recorded the incident; AK-4781 fixed the unrelated rewind fault
observed alongside.

## 2. Upstream pi#8175 — compaction failure events for extensions

RESOLVED 2026-08-24: the proposed event shipped upstream in pi-coding-agent
**0.84.3** as `session_compact_failed` (carrying `reason`, `errorMessage?`,
`aborted`, `willRetry`, `fromExtension`; verified against installed 0.84.3
`dist/core/extensions/types.d.ts`) — despite the issue having been auto-closed
`NOT_PLANNED` by triage automation before landing.

- Issue: https://github.com/earendil-works/pi/issues/8175 ("Compaction
  failures are not exposed to extension handlers")
- History: submitted 2026-08-15 with explicit operator approval; auto-closed
  `NOT_PLANNED` within a minute by the new-contributor triage automation
  (`untriaged` label, same flow as #6000). Feature shipped anyway in 0.84.3.
- Adoption: tracked in monorepo ADR `docs/adr/2026-08-24-pi-0.84.x-adoption.md`
  and RFC `docs/project/2026-08-24-pi-0.84.x-adoption-rfc.md`. pi-telemetry is
  adopting `session_compact_failed` for causal failure records (AK #5005), which
  closes the unresolved-begins (~1.4k stalled compactions / 30d) blind spot
  described below.
- Tracker record: softwareco/infra/issue-tracker
  `pi-mono-upstream/compaction-failure-extension-events` updated with the
  resolution (AK #5007, upstream commit 75e3bfc).
- Outstanding: optional drafted closure comment on #8175 awaits explicit
  operator authority per Decision 68 before posting (RFC Appendix A).

## 3. Correct export order for frozen task-scope snapshots

`ak task scope export` snapshots whatever exists at export time. Running it
before the implementation commit exists records `commit_sha: null` — an
unbound snapshot that (since the AK-4787 fix) the deterministic landing
guard rejects with `snapshot-commit-unbound`.

Lawful order:

```text
1. implement
2. commit the implementation            (the SHA to bind)
3. ak task scope export <ID> --commit-sha <that-sha>
4. commit the refreshed snapshot file
5. closure / loop-landing-check
```

The guard (`scripts/loop-scope-check.ts` in
softwareco/owned/semantic-code-intelligence) also rejects a `commit_sha`
that is not an ancestor of HEAD (`snapshot-commit-not-in-history`) with a
re-export remediation. Origin: AK-4787; incident runs
transcendent-1786830891881 / transcendent-1786834204928, where a
null-bound snapshot passed the guard and surfaced only at closure-gate
after terminal publication (see also `tests/loop-scope-check.test.ts`).

## 4. Closure evidence after terminal publication (from the same incident)

Terminal publication is immutable. When closure evidence lands late:

- never resume the published lineage (strict recovery rejection is
  correct, not a defect);
- repair governance owner-side (re-export bound scope, supersede stale
  evidence on the AK task) — that already supersedes the loop's
  incomplete closure when the implementation itself was complete;
- run a fresh loop only if further loop-owned execution is actually
  required.
