---
summary: "Decision151 post-ADR implementation plan: owner-native AK intervals, sealed Pi task host, shared transport/state, lane refusal and evidence-gated real dogfooding."
read_when:
  - "Implementing or coordinating Decision151 after accepted ADR recording."
type: "implementation_plan"
task_id: 5478
---

# Decision151 — implementation plan

## Authority and completion boundary

The operator explicitly authorized implementation planning, implementation, verification/validation through real dogfooding, and bounded bug/debt/gap repair **until done**. The accepted basis is [the ADR](../adr/2026-09-06-visible-task-session-authority-startup.md), SHA256 `6db4ce80dca8ec2d8cec296ddb14a11f32f09db1d976d874ad53f6375609dd35`, commit `645aa29e48a38f6223cba3d6ce238b08d85fa9f4`; AK Decision151 is accepted/adr_recorded with controlling review626. Task5477 recorded architecture only and is complete. Task5478 owns this plan and its [verification/validation/rollout/rollback companion](2026-09-07-visible-task-session-validation-rollout-rollback.md). Canonical task identities, claims, dependencies and release remain in AK, not this prose.

This is the implementation path for the full accepted contract, not a reduced launcher prototype. Nothing in the plan proves installed behavior, positive custody or completed delivery. Owner implementation tasks must be linked as post_adr_execution, explicitly re-evaluated and released through the existing decision lifecycle before code work. No new strategic frame, competing task database or fourth RFC review is introduced.

**Done means:** the owner implementations compose as the accepted production operation; independent tests cover required positive/negative/fault behavior; actual installed CLI/Pi operation passes authorized representative useful tasks and refusal/recovery/withdrawal dogfood in a positively custodied existing domain; verification and intended-use validation both pass; scoped commits/evidence, retained history and recovery owners are recorded. A plan, build, fake handshake, mock-only suite, refused launch, source manifest or terminal window is not done.

## Reconnaissance and bounded repairs

Read-only source investigations: AK dispatch `dispatch-1788744830192`, Pi `dispatch-1788744830203`, lane `dispatch-1788744830205`. These are implementation maps, not new authority or review votes.

- AK has strict readiness/query-only primitives newer than its approved installed pin. Reuse native transition semantics, but add an existing-only writable no-maintenance opener and complete authority facts. Public claim/unclaim wrappers perform repair; task-row rewrites can restore evidence attachments. Audit actual allowed effects rather than assume a claim writes one row.
- Ordinary gate holds one command's lock only. New supervisor must be dispatched before ordinary DB open and implement the accepted shared-OFD lifetime. Current install script points directly at the binary and does not publish the approved policy pin; installer/gate alignment is a bounded owner repair, not permission to bypass the gate.
- Existing Ghostty transport uses a login shell and debugging-shell fallback. Extract a shared restricted fixed target with no such effects, preserving ordinary sidequests and observer behavior.
- Node alone does not supply Linux flock/CLOEXEC. Select a small private native implementation, package its tested ABI and prove descriptor semantics. Do not expose arbitrary lock/FD/exec overrides or runtime compilation/download fallback.
- SDK auth can occur before provider streaming; guard auth entry as well as actual send and actual tool execution. Preserve native Codex serializer and selected account; reject refresh before network/mutation begins.
- Existing lane launcher cannot classify target task domains safely using its ordinary show path. Consume the AK/transport owners' read-only classification contract; unknown classification refuses before legacy effects. Do not create a lane registry or second runtime.

Small fixes include strict parsing, bounded decoding, native effect extraction, installer/gate alignment, dependency/build closure, diagnostics, test flakiness, and documented unsafe fallback removal within the accepted boundary. Material changes to authority, supported scope, provider/account fidelity, shared-OFD lifetime, custody/recovery or owner allocation require reconciliation and potentially the existing decision membrane. Never silently downgrade the contract to finish.

## Owner work packages and order

| Work package | Owner / bounded source | Deliverable and dependency |
|---|---|---|
| A — AK interval core and supervisor | agent-kernel core/CLI, owner scripts/tests/docs | Existing-only no-maintenance open; complete snapshots; native claim/unclaim sequencing; fixed shared-OFD startup/recovery supervisor; safe access/install contract. Share wire schema and synthetic traces with B before integration. |
| B — local host, transport and package composition | pi-extensions little-helpers + narrow orchestrator adapter | One shared restricted transport, state/inspection/native bridge, sealed SDK/resources/provider/tool ingress, public core/bin/thin Pi tool, emitted closure and discovery. Consume A's schema; no native task algorithm copied. |
| C — minimum lane controls | owned lane launcher/docs/tests | Whole-request enrollment-aware legacy refusal before effects; discovery/support withdrawal and enrollment/reinstatement runbook. Consume B's compatible DB-free domain/classification interface; no legacy translation or second registry. |
| D — independent integration and installed dogfood | controller plus explicit owner validation tasks | Cross-owner real-process faults, pack/install identities, positive custody, exact useful task canaries, repairs and repeated verification/validation. Begins integration after A/B contracts exist; live use waits for every rollout gate. |

A and B can implement independently after a shared wire contract is fixed; C can add isolated refusal fixtures while awaiting its actual producer interface. Do not serialize independent owner code work merely because AK database calls are serialized. Coordinate overlapping files explicitly: little-helpers README/manifest contain unrelated limits work; do not reset, absorb or commit that work. New sources/tests are additive; use exact snapshot edits only for owned hunks. A currently has unrelated untracked work; clean-release installation must not delete or bundle it.

Implementation peers own their source/tests and report exact commit/hash/effect evidence. The controller owns cross-owner AK coordination and plan projections. No peer may independently install/promote the active AK pin, modify the canonical database, enroll a live domain, clear claims/reservations, terminate another worker or run provider canaries without the named gate. Read-only or synthetic checks are not live activation.

## Private wire contract to freeze before integration

Wire field names are implementation choices to freeze jointly at A/B, not new governance vocabulary. Store the machine-readable producer contract with AK; consumers validate its version/digest and fixtures without owning its authority semantics. Use bounded strict UTF-8/JSON, duplicate-key refusal, stable canonical digest rules, explicit maxima and fail-closed unknown versions/fields. No credential or raw private-body diagnostics.

Every message binds protocol/version, AK identity/pin/policy generation, caller request+semantic digest, attempt/incarnation, reservation identity, host build/profile, raw/effective envelope digests and phase/kind. Private channel/FD is supplied by the fixed approved supervisor, never a public caller override.

| Transition | Producer / mandatory meaning |
|---|---|
| PREPARED | Host has frozen resources/tools/model/envelope, wrappers and default denial before DB lock; carries startup deadline/no-dispatch state. |
| T0 | Supervisor local lock acquisition/drain/post-acquisition identity validation; no prompt authorization. |
| Baseline/claim/readback | AK binds exact task/repo/class/status/scope, companion revisions/digests, dependency and decision membership/roles/state, effective deferrals/time and exact native claim tuple. Distinguish definitive denial from indeterminate commit; account only permitted normalization. |
| ADMISSION_RESULT | Supervisor sends bound owner observations and budgets; not permission to prompt. Unknown outcome denies/unresolved. |
| T1_PUBLISHED | Host persists one immutable admitted-or-denied sidecar without namespace mutex; includes full bindings, exact claim tuple and no-dispatch-yet. Supervisor independently validates durable bytes, not ACK alone. |
| T2 | Supervisor explicitly unlocks only after valid T1. All cooperating authority calls excluded T0–T2. |
| CLOSED | Private one-shot phase/incarnation-bound nonpersistent outcome; cannot be replayed after restart. |
| Dispatch | Host checks CLOSED, denial/outcome/deadlines, closes descriptor as prescribed and persists/projects state outside lock before one guarded literal prompt. |

No unconditional-finally/EOF/timeout/PID unlock. Supervisor death before T2 leaves host-held custody/no prompt; loss after T2 before CLOSED leaves unresolved denial. All-holder kernel release is not task/effect retirement. No namespace mutex inside the AK interval. Recovery first closes host/effects outside the global lock, then uses a new exact-tuple AK interval. Stop-and-dispose-before-change applies after T2, including while the first prompt is pending.

Public `plan|launch|inspect|watch` remains typed, same-source and non-authority-minting. The lane classification seam must evaluate a whole request, use canonical independent task/common-Git/checkout/shared-effect domains and positively classify outside-enrollment; unknown producer/custody/version refuses. Inspect must work when the AK lock is stranded. A fake production-success path or test injection that chooses different admission behavior is forbidden.

## Controlled execution and fix loop

1. Bind owner tasks/guardrails, exact file sets, dependency graph and current source state. Freeze producer/consumer contract fixtures before integration.
2. Implement with focused failing tests first where feasible; run owner-declared permitted synthetic checks after coherent slices. Preserve current ordinary behavior outside the new explicitly selected capability.
3. Independently inspect and fault-test production paths, not only injected branches. Fix bounded discrepancies under the same task, re-run affected tests and keep immutable failed receipts.
4. Land exact owned changes on main after declared validation and dirty-file coordination. Code commits are not pin/package activation.
5. Follow companion rollout gates for clean immutable artifacts, installed identity, positive writer/effect custody and real canaries. Fix and repeat until the acceptance obligations are met, without unauthorized mechanical retry after indeterminate effects.
6. Record actual evidence and task-native close checks; retain KES-worthy patterns with source/evidence links through the owner workflow. If a material gate remains, report exactly what is blocked and who can resolve it; do not call preparation-only done.

## Current constraints, not waivers

AK policy is normal for approved-pin gated operations, but current validation profiles, legacy runtime-bearing hook activation, dirty-checkout installation and session-closeout runtime modes remain separately disabled. Focused DB-free/static checks and audited synthetic core tests may run under implementation task authority; that is not re-enabling a forbidden profile. The completed operator interview explicitly authorizes the AK-owner task to establish/use isolated synthetic candidate-CLI tests and a clean immutable release-source route. It also authorizes staged owner-gated Pi install/reload, approved AK pin publication and live canaries **after** independent tests, exact identity, rollback readiness and positive custody pass. This does not activate a forbidden broad profile or permit dirty installation, schema migration, canonical DB copies, direct checked-out AK against the authoritative DB or automatic recovery. The AK owner must specify and verify the exact isolated test/landing/release commands within that authorization; absent proof still blocks the affected action.

The same completed interview delegates nomination of an existing canary checkout to the controller and existing repo owner, requiring positive custody evidence. The controller must obtain that evidence, not infer eligibility from a clean tree, absent PID, empty registry or candidate permit. No domain is currently certified. These are concrete operational gates, not missing architectural votes. Collect them while implementation proceeds; stop affected live actions if facts or authority remain missing.
