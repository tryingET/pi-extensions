---
summary: "Decision151 executable verification, intended-use dogfooding, staged rollout and safe rollback: exact production paths, positive custody and owner-gated installed proof."
read_when:
  - "Testing, installing, enrolling or dogfooding the accepted task-session implementation."
type: "validation_rollout_rollback"
task_id: 5478
---

# Decision151 — verification, validation, rollout and rollback

## Authority and test posture

This companion to [the implementation plan](2026-09-07-visible-task-session-implementation-plan.md) follows [the accepted ADR](../adr/2026-09-06-visible-task-session-authority-startup.md). The operator authorized implementation, verification/validation through real dogfooding and bounded fixes until done. Owner policies, candidate/effect authority and positive enrollment are not bypassed by that instruction. Tests must bind implemented revision and intended context, not only documentary structure.

**Verification:** does the actual implementation satisfy its requirements and failure invariants? **Validation:** does the constrained operation serve the stakeholder's useful task workflow? Both are required. Correct refusal, a window, one model response, fixture-only success or a packed manifest is insufficient final proof. A failure becomes an exact evidence item and bounded fix/retest, not a new generic review round.

## Verification matrix

| Contract / layer | Required executable case family | Independent oracle |
|---|---|---|
| Strict request/profile | Missing/unknown/duplicate/conflicting fields, command-shaped and malformed UTF-8 input, wrong model/account/profile, unsupported task class | Whole request refuses before reservation/claim/spawn; literal data is never expanded/executed during bootstrap |
| AK no-maintenance open | Existing synthetic DB only; absent/wrong schema/generation, malformed/noncanonical task row, repair-required state, evidence attachment preservation | No initialization/migration/repair/evidence or issue reconciliation; explicit documented claim/receipt/elapsed-deferral normalization only; compare full relevant family/effects |
| Complete authority snapshot | Scope/contract/guardrails/reconciliation changes, dependency lifecycle/membership, decision link role/state/membership, temporal deferral and lease changes | Actual values/membership bound; target version or blocking-ID lists alone cannot pass; relevant drift denies |
| Native claim uncertainty | Claim denied, commit then return/readback error, unexpected own version, independent companion drift | No prompt and no automatic retry/reclaim; exact result/effect disposition retained, never inferred from later matching state |
| Real shared-OFD lifetime | T0/read/claim/readback/T1/T2/CLOSED boundaries; supervisor or host or both die; stalled holder; unintended explicit unlock; leaked inherited FD; wrong inode/OFD | Real independent processes and same canonical Linux flock, not mocks; exclusion T0–T2, no provider dispatch before valid CLOSED; inspect works without AK lock |
| T1/history persistence | Missing/corrupt/duplicate/stale sidecar, failed file/directory fsync, projection lag, stale incarnation, lost/duplicate CLOSED, deadline elapsed after T2 | Durable pre-spawn reservation never disappears; no namespace lock acquired under AK custody; unknown outcomes remain unresolved |
| Recovery | Surviving tool/descendant, claimant/claimed_at/lease/version/repo drift, already reassigned task, interrupted unclaim/readback | Host future-dispatch and started effects close first; exact-tuple owner recovery in new interval; no clearing another claim or blind retry |
| Host construction/ingress | Absent/throwing registration, executable factories, secondary queue/context/nextTurn input, raw handle escape, compaction/replacement/summary | Terminal denial exists before SDK construction; one private literal ingress; all unsupported execution routes refused |
| Auth/send/tool boundary | Auth before stream, refresh/updater callback, credential expiry margin, compressed/byte-array payload, WS/auto/retry/redirect/override, stop between tool preflight and execute | Instrument actual auth/fetch/tool entry on production composition; zero forbidden network/updater/tool calls; denial survives ordinary SDK error conversion |
| Operational exclusion | Same task/different checkout, different tasks/same or overlapping checkout, common-Git worktrees, external shared effects, concurrent reservation, stale versions/history | Independent conflict predicates under real short mutex; no caller scope/profile/namespace escape or PID/age retirement |
| Lane coexistence | Legacy/preset/mixed batch, outside/inside/unknown classification, duplicate options, missing producer, aliases and unknown writers | Refuse entire affected/unknown request before mkdir/AK/terminal/focus; current outside-enrollment behavior only when positively classified; no fallback |
| Packaging/transport | Packed independent CLI and adapter closure, no source/global dependencies, native ABI mismatch, true production exec ports, ordinary sidequests/observer regressions | Run emitted installed artifacts; G2-P1 does not select fake handshake/placement; restricted target has no login/debug shell; old callers retain supported behavior |
| Withdrawal | Active/denied/unresolved attempts, incompatible old package/state schema, inspect after worker death, bulk trigger restart | Stop new admissions; keep inspector/history/custody; no claim release, kill, state deletion, old transport fallback or blind trigger reinstatement |

Use synthetic task data and isolated test DBs for fault tests. No canonical DB copy or checkout CLI access is implied. Audit tests for ambient AK/model/network behavior. Owner-approved candidate-runtime tests must use only specifically created isolated data and preserve failure/effect receipts. Do not hide forbidden validation profiles behind individual commands. Heavy jobs use the workspace heavy-job/TMPDIR contract.

## Intended-use dogfooding

After installed identity and enrollment gates pass, use fresh, ordinary, unclaimed, explicit-scope AK canary tasks in one **existing owner-nominated checkout**. Do not select busy pi-extensions, a new candidate or another common-Git worktree by convenience.

Required useful scenarios:

1. Pi-facing operation: discover capability, inspect a genuinely read-only plan, launch an explicit requested Astra/Codex task, observe the real transcript/tools/status and complete the agreed useful artifact. Check the controller draft remains untouched and literal input is not command/skill-expanded.
2. Explicit configured second harness using the same installed public CLI/core: repeat a comparable bounded useful task with matching input/model/cwd semantics. Name the actual harness and configuration in evidence; a shell invocation alone must not be mislabeled a second harness if it does not exercise that consumer.
3. Negative/refusal rehearsal on installed artifacts: foreign/completed/blocked/missing-scope task, same-task or workspace conflict, absent/incompatible adapter/profile, unsupported option and insufficient credential lifetime. Do not spend provider tokens to prove a refusal that should occur before provider access.
4. Controlled failure/withdrawal rehearsal: safely induce a pre-dispatch failure on a designated canary; confirm independent inspection, retained exclusion, exact owner recovery/effect disposition and refusal of unsafe fallback. No surprise process kill, automatic unclaim or destructive state cleanup.

The task must fit declared context/lease/credential budgets without reducing the useful objective to a trivial echo. Preserve exact requested provider/account rather than switching to an easier API. If the profile cannot complete representative work, fix a bounded implementation fault or reopen the concrete need-fit issue. Do not lower acceptance merely to obtain a green launch.

Record functional success/failure, user-visible fidelity, capability omissions, refusal comprehension, task usefulness, contention/blocked duration, recovery effort/backlog and bypass pressure. Numeric performance SLOs are not fabricated; correctness gates are all required scenarios passing with no unresolved material finding. Broader reliability claims require broader data.

## Rollout gates and explicit owner facts

### G0 — released owner execution scope

Accepted ADR and current implementation/validation plans are attached in AK. Exact owner tasks have explicit scope/contracts/guardrails and post_adr_execution linkage; task reevaluation/release follows the existing decision state machine. Code/test authority is separate from live installation and enrollment.

### G1 — source, test and production-artifact proof

Owner implementations and their bounded repairs are committed after declared validation. Producer/consumer protocol fixtures agree. Independent real-process safety tests, emitted packing/ABI tests and ordinary-path regressions pass. Installed artifacts are not selected from mutable dirty source. Unrelated work remains untouched.

AK-specific operational gate: current profiles/hooks/dirty-install/session-closeout restrictions remain. The completed operator interview authorizes an AK-owner task to establish/use synthetic candidate-CLI tests on newly created isolated databases only, and a clean immutable release-source route. No canonical database or copies, direct live-DB binary bypass, schema migration or forbidden broad profile. The owner must specify the truthful isolated test/landing contract and verify installer/gate alignment; authorization alone is not passing evidence.

### G2 — installed identity and inspector

The completed operator interview authorizes staged owner-gated Pi install/reload and approved AK pin publication plus live canaries only after independent tests, exact identity, rollback readiness and positive custody pass. Use owning installers with exact committed builds, production dependency closure and platform ABI. AK's approved policy/pin/entrypoint still enforces canonical exclusive gating; installation alone cannot activate an ungated binary. Pi packages are installed/reloaded through their owner contract and checked in a fresh actual runtime. Record Node/SDK/provider/native/adapter identities without secrets. Ensure the DB-free inspector survives disabled admission/worker death before admitting a canary.

### G3 — positive enrollment and effect custody

The completed interview delegates nomination to the controller and existing repo owner; it does not certify a domain. The controller obtains evidence from each actual owner, not a caller checkbox or an empty registry:

- Checkout/controller: exact existing physical/common-Git/overlap domains; all known sessions/manual routes, launch/custody history, prior descendants and observation-only commitment during occupancy/recovery.
- Lane: support withdrawal for direct scripts/presets/aliases/copied recipes; real refusal mechanism and caller acknowledgment. Private copies are not technically intercepted by the checked-in gate.
- Automation/editor: actual competing triggers, queued/in-flight/restart disposition and disabled readback; named reinstatement owner.
- Candidate: owner-native inventory/withholding/drain/disposition for the common-Git family; no new permit or borrowed admission.
- AK: actual authority writers/maintenance/import/recovery/policy/identity triggers, protected-attempt stop-and-dispose rules, bulk-recovery suspension and reinstatement owner. Source presence of release-expired is not proof of a timer.
- Effect owners: prior/current tool/subprocess/external-effect disposition; unknown effects block eligibility and retirement.

No live checkout is certified by this plan. If a fact is unknown, seek that exact fact while other lawful implementation work continues; do not claim a global freeze or use a different task/profile as an escape.

### G4 — authorized real canaries and fix loop

Verify fresh task/profile/enrollment/pin before each canary, then use the installed supported operation. Keep unrelated work outside the enrolled domain. Observe actual execution and artifacts; do not infer success from ACK/FINAL alone. On failure, separate transport/host/claim/provider/effect state, retain evidence, fix bounded causes and repeat only after lawful effect reconciliation. Indeterminate mutations cannot be mechanically retried.

### G5 — completion and future support

Close implementation/validation tasks only against their actual evidence/DoD. Record known unsupported paths, retained custody/history, recovery and reinstatement owners, installed identity and representative-use limitations. Promote reusable learnings through repo KES/AK owner surfaces; do not turn session memory into accepted guidance. Broader rollout is separate from proving the first enrolled domain.

## Rollback and escalation

Code rollback restores a known compatible package/pin only through owner installers/policy. Admission withdrawal stops new starts; it does not retire existing effects. Keep a compatible inspector and immutable history through downgrade or recovery. No lockfile unlink/recreate, age/PID force-unlock, automatic release/reclaim/relaunch, copied legacy fallback or blind bulk-recovery restart.

Bounded bugs, tests, diagnostics, dependency gaps, unsafe fallback and installer alignment should be repaired within the owning task and reverified. Escalate only material contract change, unresolvable custody, owner-policy conflict or effect-indeterminate operation. An escalation report names exact blocked action, observed evidence, permitted independent work, owner and smallest required decision. It must not relabel a blocker as successful completion.
