---
summary: "Handoff after locally implemented and live-verified Phase-3 admission (AK 5133); read AK for closeout and next-phase authority."
read_when:
  - "Starting a focused pi-agent-registry session."
  - "Closing out AK 5133 or reviewing the separate pending AK 5134 boundary."
system4d:
  container: "Package handoff for tested local Phase-3 admission and unchanged Phase-2 dispatch."
  compass: "Preserve owner boundaries, no automatic Phase-3 retry, and receipt versus reality truth."
  engine: "Read AK authority -> inspect ledger -> change one bounded contract -> validate packed and live behavior."
  fog: "A settled proof can be mistaken for general enablement, or an unhealthy fleet for a broken contract."
---

# Next session — pi-agent-registry

## Read first

1. package `AGENTS.md`
2. root `docs/project/2026-08-27-agent-manifest-convention.md`
3. `docs/project/2026-08-27-agent-registry.md` (Phase-3 section)
4. `README.md` (Phase-3 contract, live proof identifiers, release limits)
5. [Phase-3 dogfood evidence](docs/project/2026-09-07-fleet-phase3-dogfood.md)
   (includes receipt, session observation and real-runtime assertion output)
6. exact current AK task/evidence

## Current posture (AK 5133 — locally implemented and live verified)

- `standing_agent_spawn { agent, task, objective, parentPeerTarget, reportBack?, cwd? }`
  composes one clean visible TUI admission; registry owns composition and
  receipts, little-helpers owns version-1 `sidequest-launch` transport.
  Phase-2 ASC dispatch below is unchanged.
- Require an exact origin-repo-bound claimed task with live lease, a bounded
  read-only objective, same-repo cwd, clean committed agent inputs, and
  immediate pre-transport task/input/bootstrap/origin rechecks. Intercom mode
  defaults on and requires exact `session-<UUID>`; manual/none may omit it.
- Child uses `--offline --no-extensions --no-skills --no-prompt-templates`,
  approved installed intercom/presence, and explicit selected skills; retains
  cwd-bound AGENTS context, not controller conversation. Builtin `zai` works
  without an ambient provider extension. Manifest thinking is requested, not
  guaranteed: live `medium` was clamped by Pi to `high` on `zai/glm-5.3`.
- Persistent per-agent/task reservation (per visible-receipts directory);
  **never retry automatically**, even no-effects, reservation failure,
  cancellation, crash, or receipt failure. Reservations survive; explicit
  owner disposition is required. Supervise existing run ids, do not relaunch
  the dogfood pair to refresh evidence.
- Launch receipt is admission observation, not startup, ACK, completion, or
  read-only lifetime proof. No automatic AK evidence. `bash` is advisory;
  settings/auth/models/transitive imports and full runtime integrity are not
  proven by bootstrap entry hashes.
- Recorded real TUI driver → real child TUI proof for
  `standingagent-mtqmbq5w-aeaf6023`: correlated ACK/FINAL without duplicates,
  four read-only file inspections, no file/AK writes observed. Full receipt,
  revision, session/PID/terminal/surface and message identifiers are in the
  [README evidence summary](README.md#local-evidence-and-release-boundary-2026-09-07).
  Ghostty was `1.3.2-main` (`origin-main492300cad`), not literal 1.4.
- Final checks: registry **134/134**, helpers **430/430**, both full release
  checks pass. The real-fleet baseline refresh changes only its observation
  timestamp, engineering-core commit and two hashes after independent proof
  of docs-only upstream drift; no assertions or profile/fleet bytes changed.
- The new standing-agent reality assertion passes; the broad observer reality
  check still detects another session on retired Ghostty `9d8fbd15`. Read the
  dogfood evidence and AK closeout for this explicit external bound.
- Local helpers 0.9.0 source now exports version-1 `sidequest-launch`; its
  next release must ship that capability. Older npm helpers fail closed in a
  packed registry. Local success is not published availability.

## Preserved contract (Fleet Phase 2, AK 5132 — settled)

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
  ASC 0.5.2 predates those exports, so artifacts resolving that release fail
  closed `asc_execution_unavailable`. Phase-2 reviewer F1 required an ASC
  release shipping the exports (≥ 0.5.3) before registry publication; verify
  published capability rather than inferring it from the current local link.
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
npm run check          # full package gate, including exact real-fleet revision pin
npm run release:check  # packed artifact + real Pi loader + fail-closed dispatch
```

Scoped root gate from the monorepo root with your changed paths:

```bash
LOOP_PATHS="<changed package paths + root docs>" just loop-impact-run
```

## Next legal execution work

- AK 5133: inspect canonical task/evidence closeout; do not infer permission
  to repeat the reserved live launch.
- AK 5134: separate pending task, not authorized by this handoff. Read its exact
  AK scope before any lifecycle-v2/permit or other next-phase implementation.
- Follow-ups recorded in the 5132 result: ASC ≥ 0.5.3 release sequencing
  before the registry's first npm publish (F1), per-agent-dir ledger scoping
  when fleet-wide uniqueness matters (F2), ledger-read locking if concurrent
  same-pair dispatches become real (F3), and the pi/ASC transport hardening
  for dash-led positional prompts.

## Boundaries that still hold

- One repo per agent; `softwareco-agents` owns fleet/lifecycle conventions;
  AK owns task/evidence truth; ASC owns Phase-2 spawn/session/capacity machinery;
  little-helpers owns visible transport. Registry owns bounded composition,
  authorization and receipts, with automatic AK evidence only in Phase 2.
- Fleet lint health and dispatch eligibility are separate: the real fleet
  remains lint-unhealthy by owner disposition; that never blocks a
  contract-eligible read-only dispatch.
- Do not route standing agents through peer/workflow/loop tools; those are
  separate capabilities, not standing-agent routes.
