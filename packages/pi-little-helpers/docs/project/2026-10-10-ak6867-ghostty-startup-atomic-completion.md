---
summary: "AK6867: rejected observer settlement remains indeterminate; atomic disposition of AK6664 successor findings."
read_when:
  - "Investigating missing Ghostty renderer ACKs or rejected launch callback settlement."
  - "Checking what AK6664's archived attempt and AK6867 verification actually prove."
system4d:
  container: "Package-local runtime contract for the sidequest Ghostty launch path."
  compass: "Keep Ghostty observation separate from execution/effect truth."
  engine: "Inspect retained evidence -> verify bounded repair -> record AK disposition."
  fog: "Transport acceptance, renderer startup and visible terminal state are different observations."
---

# AK6867 — Ghostty startup atomic completion

## Authority and scope

AK6664 was completed **as diagnosis**, not as a fix. Its owner rewrote the done contract
and accepted missing historical evidence. Evidence 14559/14560 contains the diagnosis;
14570 records the owner decision; 14613 explicitly accepts the advisory result-encoding
gap. The task is not reopened.

The operator separately authorized successor AK6867: a linked current-source worktree,
bounded instrumentation, controlled **new** isolated trials, repair only a demonstrated
mechanism, normal gates and canonical landing. No historical retry, publication, provider
changes, unrelated renderer changes or Decision151/task-session rebuild is authorized.

The prior 15-file attempt remains at `archive/ak6664/prior-fix-attempt`, commit
`6488032a0a6ec3441115147b229ccd823d26a660`. Its launch source hashes match evidence14560.
The successor recreated that archive in an isolated worktree and rebased onto current
main `cc278d46e`, including AK6844. The blanket reply-mode/shell-handshake proposal and
its invasive tests were then set aside, not promoted. `sidequestGhostty.ts`, the launch
adapter and renderer remain identical to this current-main source.

## Demonstrated gap and narrow repair

Before this change, a launch callback throwing after dispatch, or returning unsuccessful
without explicit effect disposition, became final observer `failed`. Receipt monitoring
stopped, so even a valid immediate/late renderer ACK could not confirm that attempt.

`src/ascExecutionObserver.ts` now normalizes unsuccessful settlements to
`effect_indeterminate` unless they explicitly establish `confirmed_no_effects`. This
also covers a contradictory unsuccessful result labelled `settled`. Existing private
session reservation, generation fencing and exact receipt checks remain unchanged.

- No ACK: pending becomes **unconfirmed**, not launched.
- Exact immediate/late ACK: the **same** attempt can become launched.
- Explicit `confirmed_no_effects`: stays failed even with a contradictory receipt.
- Further groups/reload: do not redispatch or manufacture another launch slot.

This is a callback-settlement/ACK correction, **not** a repair of the original missing
PTY mechanism. ACK proves renderer startup and first stdout write, not painted pixels,
correct window placement, ASC execution, or historical absence of effects.

## Observed verification and boundaries

- Nine offline Gherkin regressions failed on current main, including unsuccessful
  `settled` callbacks. The final focused observer/isolation set passed 82/82 after the
  repair. The declared package pre-push gate passed 65 files / 868 tests, with no failed
  or skipped tests; exact rerun/landing bindings live in AK6867 command evidence.
- Actual Ghostty/PTY barrier trials failed 2/2 on current main and passed 2/2 with the
  repair. A test-owned barrier withholds Node startup until the controller is unconfirmed;
  releasing that barrier permits only the original command, never a new activation.
- New trial assertions check receipt/session/token/PID, real terminal stdout, and exactly
  one Activate. They dispose their own controller and retain evidence.
- The new live assertion also requires the recorded **live nested niri** executable/config,
  both display/IPC socket inodes bound to that process's descriptors, matching client
  display/socket and independently different private/operator bus IDs. An opt-in flag
  alone cannot admit it. Offline refusal cases cover misconfiguration. These are Linux
  diagnostic checks under a trusted test harness, not a security boundary against the
  same user forging fixtures or processes.
- Fresh matched receiver trials requested auto, epoll and io_uring; actual backend logs
  and shell/PTY witnesses were retained. All three started. A separate hidden-workspace
  trial also started before reveal. None is a reproduction or causal fix of AK6664.
- The generic `npm run reality:check` invocation reported **3 pass / 4 fail / 3 skip**:
  two public-PID targeting census failures, one public presence/nested-window mismatch,
  and a separate new fresh-window handshake timeout. The relevant shared-viewer and two
  callback-loss assertions passed. The complete suite is **not** claimed green.
- A later new tab trial reported **1 pass / 1 fail**: no ACK for its rejected-settlement
  case, with receiver `SystemResources`/`SurfaceError` during core surface initialization.
  Its effect stays indeterminate. Fresh explicitly matched epoll and io_uring receivers
  then each passed 2/2 callback-loss assertions with their actual manual backend logged.
  This does not prove a backend-only cause or safe blanket mitigation. AK6879 owns the
  upstream receiver investigation; this patch is not called a resource-failure fix.

Artifacts are session-private under `$TMPDIR/ak6867-nested/`: backend `*-2/result.json`,
`hidden-auto-1/result.json`, `settlement-barrier-{red,green}-1/{test.log,driver-result.json}`
and `reality-suite-1/test.log`. Exact final source/command bindings and later installed
runtime proof belong in AK evidence, not inferred from this note.

## Owner-admitted gate set

Controller `session-01a1239a-2c21-71d1-a7a0-ede6fb3f1bb0` admitted the declared package
**pre-push** stages (structure, budgets, lint, typecheck, all tests), isolated relevant
live proof, normal staged commit hooks, and `land-canonical.sh` loading smoke for this
controller-only patch. This admission is recorded as AK6867 evidence14622.

Full CI packaging remains **blocked**, not skipped into a success claim: its
`release-check` invokes credential-isolated `npm pack`, whose prepack rebuilds
`dist/task-session`. Existing canonical dist bytes were copied unchanged as gate input;
they are not rebuilt or claimed freshly qualified. No push/release is part of this pass.

## Atomic finding disposition

| Finding | Disposition |
| --- | --- |
| Diagnosis title versus old fix-required contract | Owner reconciled AK6664; encoding gap explicitly accepted in14613. |
| Uncommitted unverified 15-file proposal | Exact archive retained; speculative behavior not shipped. |
| Outdated base versus AK6844 acknowledgment | New successor rebased onto current main; old ACK replacement rejected. |
| Callback rejection/unclassified failure suppresses valid ACK | Narrow controller repair with red-green tests and real PTY proof. |
| New live test could trust an isolation flag alone | Live compositor/socket and distinct bus checks; offline refusal coverage. |
| Matrix omitted unsuccessful `settled` callbacks | Explicit none/immediate/late coverage added. |
| Historical cause remains unproved | Accepted historical limitation under AK6664 v2, not a behavior success. |
| Legacy suite mixes public and isolated namespaces | AK6876, first-class deferral638. |
| New independent fresh-window timeout | AK6877, first-class deferral639; effect remains indeterminate. |
| New receiver core initialization `SystemResources` | Ghostty-owned AK6879, first-class deferral640; no speculative backend change. |

## Deferred with contract

| Finding | Hard constraint | Owner | Trigger | Deadline | Blast radius | Authority binding |
| --- | --- | --- | --- | --- | --- | --- |
| Legacy reality census namespace support | Silently filtering/skipping public assertions would weaken their contract; an owner-selected fixture/namespace contract is required beyond this patch. | pi-little-helpers verification maintainer/controller | Approved namespace-aware census/fixture design and exact scope | Owner triage/decision by2026-10-17 | False isolated failures or accidental operator-desktop testing | AK6876, until-decision deferral638 |
| Separate fresh-window command admission timeout | No failed-receiver allocation/init trace; guessing transport/backend/renderer fixes risks duplicate effects and crosses Ghostty ownership. | pi-little-helpers launch maintainer; Ghostty owner if needed | Authorized causal instrumentation and **new** controlled trials | Owner diagnosis/triage decision by2026-10-17 | Unobserved fresh-window commands; unsafe retries duplicate work | AK6877, until-decision deferral639 |
| Receiver core initialization `SystemResources` | Upstream allocation/lifecycle investigation exceeds the admitted controller patch; missing failed allocation trace and both backend controls passing rule out a demonstrated blanket mitigation. | Ghostty GTK/libxev maintainer via softwareco contrib controller | Exact instrumentation and new isolated-trial authorization; separate permission for upstream filing or installed runtime/config changes | Owner triage/decision by2026-10-17 | Intermittent tabs lack PTY/renderer; unsafe retries duplicate work | contrib/ghostty AK6879, until-decision deferral640 |

These are real open obligations, not hidden by the bounded repair. No automatic retry
or source-owner mutation is implied by any deferral. Original AK6664 fixtures and
all new uncertain attempts remain retained.
