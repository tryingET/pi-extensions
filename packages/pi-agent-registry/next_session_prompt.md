---
summary: "Handoff for pi-agent-registry after the Fleet Phase-2 exact-task read-only dispatch proof (AK 5132)."
read_when:
  - "Starting a focused pi-agent-registry session."
  - "Preparing AK 5133+ or changing the dispatch/receipt/evidence boundary."
system4d:
  container: "Package handoff for the proven Phase-2 dispatch contract."
  compass: "Preserve one-settled-per-pair truth, ASC-owned execution, and receipt-first effect truth."
  engine: "Read AK authority -> inspect ledger -> change one bounded contract -> validate packed and live behavior."
  fog: "A settled proof can be mistaken for general enablement, or an unhealthy fleet for a broken contract."
---

# Next session — pi-agent-registry

## Read first

1. package `AGENTS.md`
2. root `docs/project/2026-08-27-agent-manifest-convention.md`
3. `docs/project/2026-08-27-agent-registry.md` (Phase-2 section)
4. `README.md` (Phase-2 dispatch contract + live dogfood record)
5. exact current AK task/evidence

## Current contract (Fleet Phase 2, AK 5132 — settled)

- `dispatch_agent { agent, task, objective }` executes at most ONE SETTLED
  read-only standing-agent run per `(agent, exact claimed AK task)` pair
  through ASC-owned execution; failed attempts stay as immutable receipts,
  bounded to three (`dispatch_attempts_exhausted`).
- Gates (fail-closed, `confirmed_no_effects` before spawn): request shape,
  recursion guard (`PI_PROVENANCE_STANDING_AGENT_DISPATCH`), ASC surface
  capability, known agent, attempt ledger, observable dispatch-origin repo,
  AK exact-task authorization (repo-bound + claimed + live lease), read-only
  tool subset `[read, bash]`, clean agent repo with committed manifest/prompt
  blob digests, launch resolution.
- Settlement requires: child `done`, agent-revision stable across the window,
  parent HEAD + porcelain digests unchanged (git-ignored files and
  out-of-repo surfaces are NOT observed — boundary text says so), ASC
  owner-issued effect receipt present with `consumerCorrelationId` echoing
  the composed correlation id, receipt-first disposition `settled`, and a
  complete ASC identity. Then: write-once attempt receipt
  (`ak-<task>.<agent>.<NN>.dispatch-receipt.json`, 0o400, canonical
  `receiptSha256`) plus exactly one AK evidence row
  (`standing-agent-dispatch`).
- Effect truth is receipt-first: terminal ASC details omit the declared
  `effectDisposition` field; only the ASC effect receipt is authoritative.
- Ledger integrity: filename↔attemptIndex and file↔content pair mismatches
  fail the ledger read closed; concurrent publication of one attempt yields
  exactly one winner (hard-link gate).
- `src/asc-execution-surface.ts` capability-gates the ASC execution imports;
  the published ASC 0.5.2 predates those exports, so packed artifacts fail
  closed `asc_execution_unavailable` until ASC ≥ 0.5.3 ships. The registry's
  first npm publish must sequence after that ASC release (reviewer F1).
- Dash-led prompts: the child transport passes the composed prompt as the
  child pi CLI's leading positional argument; persona YAML front matter would
  abort at argv parse — `dispatchPromptEnvelope` keeps it dash-safe
  (live-observed 2026-08-31).

## Live dogfood (2026-08-31, AK 5132)

- Attempt 1 failed closed at child argv parse (`Unknown option: ---`) →
  dash-safe envelope fix; attempt 2 ran `done` but was honestly recorded
  not-settled under the then-naive details-field read → receipt-first fix;
  attempt 3 SETTLED: receipt `ak-5132.agent-adoption-steward.03…`
  (sha256 `7eb7e467…f3e3`), ASC effect receipt `settled` bound to
  `pi-agent-registry:ak-5132:agent-adoption-steward:3e185cc57699dcf0`,
  `noMutationObserved=true`, AK evidence `#8091`; a live re-dispatch was
  rejected `dispatch_already_recorded` with `confirmed_no_effects`.
- The dispatched child's own report proposed the ledger-integrity hardening
  that is now implemented and tested.

## Quick verification

```bash
cd packages/pi-agent-registry
npm run check          # 105 tests incl. dispatch/receipt/authorization/resolver/extension
npm run release:check  # packed artifact + real Pi loader + fail-closed dispatch
```

Scoped root gate from the monorepo root with your changed paths:

```bash
LOOP_PATHS="<changed package paths + root docs>" just loop-impact-run
```

## Next legal execution work

- AK 5133 (Fleet Phase 3): clean visible standing agent in a Ghostty 1.4.0
  tab/window with ACK and dogfood proof. Phase-2 receipt/evidence semantics
  are the substrate; visibility is the new surface.
- Follow-ups recorded in the 5132 result: ASC ≥ 0.5.3 release sequencing
  before the registry's first npm publish (F1), per-agent-dir ledger scoping
  when fleet-wide uniqueness matters (F2), ledger-read locking if concurrent
  same-pair dispatches become real (F3), and the pi/ASC transport hardening
  for dash-led positional prompts.

## Boundaries that still hold

- One repo per agent; `softwareco-agents` owns fleet/lifecycle conventions;
  AK owns task/evidence truth; ASC owns all spawn/session/capacity machinery;
  the registry owns only authorization, receipts, and evidence recording.
- Fleet lint health and dispatch eligibility are separate: the real fleet
  remains lint-unhealthy by owner disposition; that never blocks a
  contract-eligible read-only dispatch.
- Do not route standing agents through peer/workflow/loop tools; those are
  separate capabilities, not standing-agent routes.
