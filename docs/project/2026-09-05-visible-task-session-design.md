---
summary: "Proposed owner-split visible task-session launcher: shared Ghostty/Pi transport, task admission adapter, CLI/tool projections, distributed skill and staged proof."
read_when:
  - "Reviewing the fresh task-worker launch contract before an RFC or implementation wave."
  - "Adding model-selected Ghostty task windows, launch discovery, readiness or duplicate prevention."
type: "design_packet"
task_id: 5434
status: "draft_design_decision_required"
---

# Visible task-session launch — design packet

## Status, purpose and scope

This is the design artifact for **AK task 5434**, grounded in the separate [discovery packet](2026-09-05-visible-task-session-discovery.md). It proposes behavior; none of the proposed CLI/tool names, admission semantics or test results below is claimed shipped. AK owns packet identity/lifecycle and task/decision state; this document owns the design argument. Local requirement labels are document anchors, not new AK/ROCS entities.

Purpose: let an operator or harnessed LLM find and request a fresh, model-selected, visible Pi task session without inventing terminal automation, confusing session kinds, duplicating attempts, mutating an editor draft or inferring work authority from a window.

Alignment: [root vision](vision.md) requires shared policy/discovery once, package-local realization and no second planning authority. [Little-helpers](../../packages/pi-little-helpers/README.md) is the visible-session owner. SF7 is current repo context, but its IW8/task4165 is unrelated; this supporting design does not replace that execution path. Tasks 5133/5134 retain standing-agent/candidate obligations. Task 5432 owns unsolicited editor-prefill repair.

## ConOps and stakeholder needs

**Normal use:** an operator names an exact AK task and requests a fresh Astra window. A harness discovers the supported entrypoint, obtains a no-launch plan, inspects existing attempts and task admission, requests one launch, observes its exact session identity and ACK, and consults AK for claim/completion truth. A different harness can invoke the same CLI without an interactive parent Pi session.

**Exceptions:** missing model/cwd/task authority, policy drift, duplicate requests, unknown child effects, blocked startup, missing ACK, closed terminal, unavailable intercom and filtered/disabled skill discovery must remain distinguishable. Recovery begins with inspection, not blind relaunch. A GUI window is optional operator visibility, not a durable supervisor.

| Need | Source and evaluator | Desired capability |
|---|---|---|
| N1: do not reinvent launch scripts | Operator request and observed missed existing launcher; fresh-context agent plus operator judge usability | C1: discover and select the one supported operation from outside its source repo |
| N2: know what actually started | Operator asking how windows/prompts were launched; operator evaluates truthful visibility | C2: model-selected fresh startup with correlated observations and no editor side effects |
| N3: prevent duplicate or unauthorized work | Existing launch contract and Decisions 59/63; runtime and task owners judge safety | C3: fail-closed admission/recovery with task and candidate authority preserved |
| N4: avoid a Pi-only or universal-control-plane trap | Cross-harness operator intent and root vision; package/integration owners judge boundaries | C4: CLI/tool parity over one implementation, optional AK/fleet composition |

Excluded uses: arbitrary shell execution API; remote machines; non-Ghostty terminal adapters in v1; replacing ASC dispatch, agent-registry identity or AK; creating candidate worktrees outside lifecycle-v2; transferring controller continuation; autonomous fleet propagation; silently choosing another subscription; treating prompt-based read-only instructions as a sandbox.

## Architecture choice and rejected alternatives

**Selected proposal:** one package-owned visible-launch core, thin source-owner adapters and a distributed selection skill. The CLI is the portable invocation boundary; the Pi tool is a projection of the same contract. Deterministic code owns effect safety. Skills own approach selection and supervision guidance. Source-owner APIs retain authority.

| Alternative | Decision rationale |
|---|---|
| Skill containing a copied Ghostty shell recipe | Reject: instructions cannot enforce checks or fix transport drift across copies. |
| Keep lane script and Pi peer launcher independent | Reject: two implementations diverge on cwd, admission, retries and model selection. |
| Pi-only tool | Reject as the sole interface: another harness would recreate launching. Retain as a thin native adapter. |
| Move task governance and terminal lifecycle into AK | Reject: AK owns task/evidence/decision facts, not Ghostty placement or host sessions. |
| New universal session daemon/package now | Reject for this slice: no demonstrated need for another service or package owner. Extract only if packaging proof requires it. |
| Reuse scout/fork/fresh-handoff under a different name | Reject: changes context, mutation or continuation semantics. |
| Force every task launch through candidate creation | Reject as universal policy: intentional main-first owner work exists. Candidate-class work still requires candidate admission. |

### Allocation

| Component | Owner and contract |
|---|---|
| Visible-launch core | `packages/pi-little-helpers`: existing Ghostty targeting/window transport, safe argv, startup correlation and bounded operational attempt records. Host-independent invocation must not load interactive extension registration as a side effect. |
| Pi tool and CLI | Same package, same validated request/response semantics. No second spawning implementation; CLI can run without a parent Pi session, but still launches Pi in the child. |
| AK task adapter | AI Society integration owner; proposed home `packages/pi-society-orchestrator`, subject to RFC ratification. Resolves exact task/repo/claim/authorization through the current approved AK gate and supplies validated admission to the core. No new AK wrapper or raw database access. Generic core does not import AK policy. |
| Standing-agent composition | `packages/pi-agent-registry`, tasks 5133/5134; persona/profile/revision and ASC/candidate composition stay there. Ordinary task workers do not require standing-agent enrollment. |
| Messaging and presence | Existing peer-messaging and session-presence owners. Reuse IDs/ACK protocol and identity observations; do not create a parallel session registry. |
| Selection skill | Package-owned skill named `visible-task-sessions` proposed; distributed through `pi.skills`, not a machine-local-only copy. Cross-harness discovery remains explicitly configured and tested. Proposed file layout appears below; it is not an existing resource. |
| Lane compatibility | Existing lane script becomes a thin consumer after an owner-scoped migration task. No independent fallback shell launcher; unsafe legacy behavior is disabled/deprecated explicitly. |
| Capability discovery | Little-helpers manifest/toolbox; pi-extensions root capabilities; lane routing map points to the owner contract. These are projections, not evidence or authorization. |

```text
operator / harness -> discovery and session-kind selection
                   -> task adapter -> current AK admission facts
                   -> CLI or Pi tool -> shared visible-launch core
                                      -> Ghostty -> child Pi
                                      <- admission / session / ACK observations
AK task/evidence and candidate lifecycle remain separate owner facts.
```

Proposed resource layout, not shipped files:

```text
packages/pi-little-helpers/skills/visible-task-sessions/SKILL.md
```

Negative discovery needs a carrier independent of the skill it diagnoses. For supported installations, the harness/installer owner must register an intended capability identity and provide a read-only comparison against loaded skill/tool identities and the installed CLI version. In Pi, consume package/settings/resource diagnostics through their owner surfaces; another harness needs its own explicit adoption/preflight adapter. The lane router points to that owner contract, not a replacement shell recipe. If both the capability and every independent discovery carrier are absent, a cold agent cannot diagnose a specific missing installation: the truthful result is capability unknown and an operator installation/routing request. B10 does not promise omniscient absence detection.

## Proposed interface contract

Names are proposals, not commands to run today:

- CLI family `pi-visible-session plan|launch|inspect|watch`.
- Pi tool `task_peer_spawn` for the fresh task-worker operation; read-only inspect/watch reuse existing messaging/presence where sufficient.
- A typed `fresh_task` request, not a generic `shellCommand`, overloaded scout or silent fork.

Minimum request fields: schema version; canonical target repo; exact task reference; selected provider/model/thinking; explicit `new_window` or `prefer_targeted_tab` placement; ordered prompt-file inputs; controller identity when available; report-back mode; caller-stable request ID; task-adapter admission reference. No default model/account substitution. The literal name Astra is resolved through the installed model registry, not hard-coded as permanent provider truth.

`plan` validates and returns the resolved operation, blockers, selected package/build identities, existing matching attempts and authority requirements without launching, claiming a task, spending model tokens or creating prompt/log/attempt directories. AK's own access-lock mechanics are not launcher effect records.

`launch` recaptures current admission inputs and compares them with the planned baseline; a stale plan is not permission. Prompt files are bounded, exact-byte UTF-8 inputs copied to private attempt storage before execution; their digests and ordering bind one initial message. No shell evaluation, clipboard use, editor prefill or queued follow-up is used to submit that task prompt. An input modification after capture cannot silently change the launched objective. Record hashes, not private prompt bodies, in ordinary diagnostic output.

`inspect` returns an existing attempt without advancing it. `watch` waits for bounded observations; watch timeout/cancellation cancels observation only, not the child. A missing parent/intercom endpoint yields an explicit supported manual/reporting-unavailable state rather than guessing another session. Launch acceptance does not depend on a claim that the desktop placed a window where the operator expected; requested/observed placement are separate.

### Admission and workspace safety

1. Validate request, canonical repo, installed package/model availability and exact task/repo scope before OS spawn. No arbitrary binary/path/env override that bypasses these checks.
2. Classify workspace use explicitly. An isolated-candidate request routes to existing lifecycle-v2 admission; `fresh_task` must not be a bypass flag. A shared owner checkout requires exact owner-authorized task scope and a conflict/claim disposition. Unknown overlap refuses auto-start of executable work.
3. Task IDs, repo paths, prompt text, an ACK or a live lease alone do not authenticate delegation. The AK adapter must verify the existing owner-authorized claimant/delegation route, not invent a token that grants authority. If that contract cannot be proven, admission is blocked.
4. Immediately before task effects, the child must re-read/claim through the owning AK surface under the accepted handoff contract. Parent readback is only a snapshot. If the required authorization transfer/revalidation is unavailable, no runnable task prompt is released by the supported path.
5. The exact pre-prompt child-admission hook and claimant handoff are an architecture-significant **decision-input gate G1** below. The required ordering is deterministic bootstrap identity -> owner-authenticated admission/revalidation -> release of the sole task message -> model execution. A first LLM prompt asking the child to claim, followed by a queued task prompt, is rejected. G1 must specify startup-extension effect bounds and prove that denied admission cannot reach task-model execution. No implementation may advertise deterministic task-write enforcement until that mechanism is ratified and tested. Pi tools with unrestricted filesystem access are not an OS sandbox; hostile same-UID bypass is not excluded.
6. Preserve company provenance through its owner mechanism. Scoped target repos recover their own company context; unscoped children require the supported provenance handoff. Never select company by a convenient environment override. Cross-company task input does not grant visibility.

### Effect protocol and observations

Use a product of facts, not one misleading success boolean:

| Dimension | Proposed values / interpretation |
|---|---|
| Transport | `not_attempted`, `confirmed_no_effects`, `command_admitted`, `effect_indeterminate` |
| Session | `unobserved`, `identity_observed`, `startup_failed`, `exited` |
| Worker report | `not_received`, `ack_received`, `final_received`, `reporting_unavailable` |
| Task authority | owner readback plus timestamp/version; `unknown`, `not_authorized`, `claimed` or owner-native status |
| Placement | requested placement plus independently observed location or `unknown` |

A session can ACK and later exit; preserve both observations. Out-of-order or conflicting observations do not regress historical facts or promote stronger claims. Match exact attempt nonce, session identity/incarnation and parent correlation, not repo basename, window title or PID alone. Distinguish a child self-report from owner-observed identity and AK state. A `PEER_FINAL` is communication, not completion evidence.

All supported callers on one host must use one owner-configured, canonical, private operational exclusion namespace. It is independent of caller cwd, Pi agent/profile directories, harness, package version and caller-controlled state-root overrides. Canonical AK instance/task and affected-workspace identities are adapter-supplied; repo/worktree aliases cannot create fresh exclusion keys. Inaccessible, mismatched or incompatible namespace identity blocks admission. This namespace owns operational exclusion only, never task authority or new permissions.

The core linearizes admission under one task/workspace-key lock shared by every supported caller. Inside that lock it rechecks unresolved attempts across all request IDs and authorization generations, validates the adapter's current owner facts, and durably publishes one reservation/launch intent before spawn; a check followed by an unlocked create is forbidden. Request ID is additionally bound to a semantic request digest: same ID/same digest inspects the original attempt, same ID/different digest refuses. A separate per-request lock alone cannot satisfy duplicate exclusion. Existing candidate paths retain lifecycle-v2's own locks and admission; no nested lock order or migration is assumed without owner review.

Unresolved old workers exclude new executable admission even after lease expiry, reassignment or authorization-generation rollover. Only an owner disposition proving old effects quiescent/fenced, or explicitly authorizing bounded safe overlap, can release that exclusion. New lease, missing ACK, vanished window and age are never recovery proof. Legitimate multi-role work needs that owner disposition or distinct scoped tasks with a resolved affected-workspace conflict, not another random ID.

Persist preparation and an exclusive launch intent before effect dispatch. After OS spawn succeeds, timeout, cancellation, signal, missing handshake, parent death or lost response is indeterminate unless the owner transport proves otherwise. No automatic retry/fallback from that state. Exact-token atomic shell admission follows the existing little-helpers transport contract. A pre-spawn rejection can be reported as confirmed-no-effects for that attempt, not for unrelated task activity.

Operational records bind request digest, attempt identity, owner admission reference, package/build and model selection, timestamps and observations. They are not another task DB, authority-granting permit system or guarantee of exactly-once execution. Hard-crash recovery must inspect/reconcile the existing attempt; never reclaim a lock solely by age. Token directories/records use private permissions and reject symlink ambiguity. Unresolved evidence is retained; cleanup requires proved inactive, task-owned resources and explicit disposition, never automatic deletion of candidate worktrees.

## Requirement baseline and traceability

Baseline: this document's exact reviewed SHA-256, plus discovery source hashes and owner-native task/decision versions. V = conformance verification; U = intended-use validation. Each row traces to the architecture allocation above and the scenario below. Review owner is the named owner plus the independent design reviewer; actual owner acceptance remains separate.

| Requirement | Need / capability and rationale | Allocation | Scenario / V&V commitment |
|---|---|---|---|
| R1: correct fresh-task selection outside owner repo | N1/C1; finding the wrong peer family changes behavior | Distributed skill + capability projections | B1, V1/U1 |
| R2: one launch implementation across CLI/tool/legacy adapter | N4/C4; prevent transport drift | Little-helpers core + integration adapters | B2, V2/U2 |
| R3: bind cwd/model/prompt/context exactly, no editor writes | N2/C2; startup inputs must match request | Core + child Pi adapter | B3/B4, V3/U2 |
| R4: no unauthorized task/candidate/visibility escalation | N3/C3; launch is not authority | AK adapter + lifecycle-v2 + provenance owners | B5/B6, V4/U3; G1 blocks executable admission |
| R5: duplicate/crash safety without exactly-once overclaim | N3/C3; lost replies can duplicate mutations and spend | Core effect protocol + owner task readback | B7/B8, V5/U3 |
| R6: distinguish transport/session/report/task truth | N2/C2; a visible window is not work proof | Core + presence/messaging + AK | B9, V6/U2 |
| R7: skill/package availability is observed, not inferred | N1/C1 and N4/C4; source files may not be loaded | Package distribution + harness adapters | B1/B10, V1/U1 |
| R8: bounded migration and withdrawal preserve owners | N3/C3 and N4/C4; rollback must not resurrect unsafe transport | Package release + lane compatibility owner | B11, V7/U3 |

Every changed source/requirement invalidates potentially dependent current claims until review bounds impact. Preserve historical passes and old revisions. Record explicit no-impact rationale for retained claims; reverify behavior and revalidate use when its actor/environment/purpose changes. Use existing AK reconciliation and packet/domain-status owner commands when authorized; this packet does not implement automatic graph invalidation.

## BDD / acceptance scenarios

- **B1 Discovery:** Given an installed supported package in a fresh non-owner-repo session, when asked to open an exact task in Astra, then the agent finds the supported entrypoint and selects `fresh_task`, without improvising shell launch commands. Repeat with a second harness configured for the same skill.
- **B2 Parity:** Given identical admitted requests, when invoked through CLI or Pi tool, then normalized core inputs, effect dispositions and errors agree. Both exercise the same transport module. The compatibility adapter may only translate declared options, not spawn directly.
- **B3 Input binding:** Given paths with spaces/quotes, dash-led prompt content and a changed original file after capture, when launching, then the pinned prompt is delivered once as one initial message in the exact cwd with the selected model, no inherited controller conversation and no shell interpretation. Unsupported provider/model fails before spawn.
- **B4 Draft safety:** Given an existing operator editor draft, when planning, launching, watching or encountering a failed send, then its bytes remain unchanged. No launch path calls editor mutation as fallback.
- **B5 Authority:** Given a foreign claimant, expired authorization, completed/blocked task, missing scope, unknown workspace conflict or drift between plan and launch, then executable admission refuses with owner-specific reason and no task prompt release. Merely knowing task ID or setting environment variables never grants it.
- **B6 Candidate/provenance:** Given work requiring candidate isolation or another company's restricted context, then the request routes to the exact existing owner membrane or refuses; a fresh-task option does not waive a permit or reveal restricted prompts.
- **B7 Concurrency:** Given independent CLI and Pi processes in different harness/profile/state-root configurations, using repo/worktree aliases and equal or different request IDs for the same task, then they resolve one exclusion namespace/task-workspace key; only one owner-admitted attempt can reserve/dispatch. Inject a barrier between lookup and reservation to expose a check-create race. A caller cannot override the namespace, and equal ID with altered payload always refuses.
- **B8 Lost response/crash:** Given child admission followed by parent death, or spawn followed by handshake loss, when inspected/retried, then existing evidence remains and no second task worker is automatically created. Kill at each persistence/spawn/handshake boundary, including before a PID receipt is durable. Expire/reassign generation A to B while A is unresolved, then release delayed A: B remains excluded absent explicit owner reconciliation/fencing or safe-overlap authorization.
- **B9 Truthful supervision:** Given a terminal handshake but no Pi identity/ACK, then show command-admitted only; a stale title, reused PID or unrelated peer ACK cannot advance it. Watch cancellation, terminal closure and child FINAL remain distinct from AK completion.
- **B10 Unavailable resources:** Given the independent harness/installer capability preflight and its intended resource identity, but a filtered/colliding skill or missing CLI, then compare intended versus loaded resources and report the specific limitation without a shell-launch fallback. Cold-context tests must not seed the expected command in the user prompt. If the preflight/discovery carrier is also absent, report capability unknown rather than diagnose an unobserved missing resource. Once invoked, the supported entrypoint reports unsupported terminal/reporting limitations explicitly.
- **B11 Withdrawal:** Given a rejected canary or incompatible package upgrade, then disable new admission, preserve unresolved attempts for inspection, and keep candidate lifecycle and existing peer semantics intact. The old lane script must not silently reactivate direct spawning.

## Verification, validation and evidence ownership

No planned test below has run for this proposed feature.

| Commitment | Method, subject and oracle | Pass / affected-use gate |
|---|---|---|
| V1 | Packed/installed skill+manifest inspection, independent intended-versus-loaded resource preflight and fresh-session discovery transcripts; exact package/skill hashes, harness configuration and task prompts retained with privacy bounds | Required cues discover the intended entrypoint; configured preflight detects absence/collision. With every carrier absent, only unknown is asserted. Structural skill audit alone cannot satisfy U1. |
| V2 | Differential CLI/tool tests over accepted/rejected request fixtures; import-graph/package smoke checks without a parent Pi TUI | Same normalized contract and one transport owner; no registration side effects. G2 must first establish a lawful import boundary. |
| V3 | Real child startup observation plus argv/prompt fixture tests and editor-state snapshots | Exact model/cwd/one message/fresh context; hostile inputs fail; unchanged editor. Synthetic process mocks alone insufficient. |
| V4 | Independent owner admission fixtures/canaries, authorization drift and candidate/provenance refusal tests | No false admission; identify exact owner receipt and child revalidation. Missing G1 proof blocks executable-task rollout. |
| V5 | Independent-process/different-profile/alias race fixtures against one namespace; lease-generation rollover with delayed old worker; fault tests and reality-anchored process interruption at every effect boundary | Atomic task/workspace reservation; unresolved-generation exclusion; no automatic duplicate dispatch; unknown remains unknown; same-ID/different-digest refusal. Task exactly-once effects are not claimed. |
| V6 | Correlation tests with stale/reordered/spoofed/missing observations; live startup/exit/watch canary | Each displayed assertion supported by its actual owner observation, with freshness and claim limit. |
| V7 | Installed-artifact compatibility/deprecation and withdrawal drill using disposable authorized task scope | New admission can stop without dropping unresolved history or resurrecting duplicate transport. |
| U1 | Fixed realistic discovery prompts from outside the owner repo, fresh independent sessions, baseline existing script/map versus proposed skill/CLI; operator evaluates selection | All critical mutation/context-choice cases correct; no ad hoc launcher creation. Record sample, models, configuration, misses and costs before broad claims. No claim of fleet-wide reliability from one success. |
| U2 | Operator observes one authorized representative task window from a Pi tool and one from a non-Pi caller | Correct task/model/window, understandable status, intact draft, no manual typing required. Operator confirms usefulness; process receipt alone insufficient. |
| U3 | Operator/runtime/task owners rehearse a missing ACK, stale authorization and withdrawal | They can locate the existing attempt and choose a legal next action without duplicate work or authority confusion. |

Little-helpers owner records transport tests and installed package identity; AK owner surfaces provide task/evidence readbacks; messaging/presence provide their observations; integration owner binds the task canary. DSPx/Oracle can analyze later discovery experiments if separately scoped, not judge normative launch legality. KES may capture the missed-discovery lesson, but no skill propagation or knowledge promotion follows automatically.

Existing package checks to preserve after implementation: `node --test tests/asc-execution-observer-launch.test.mjs tests/sidequest.test.mjs`, `npm run check`, `npm run release:check:quick`, `npm run reality:check`; installed release smoke and actual TUI canaries remain required for changed visible behavior. This design task uses scoped Markdown/ref checks, exact-hash semantic review and AK packet readback; those prove only design-stage claims.

## Decision-input gates and unresolved choices

| Gate | Question and selected boundary | Owner / closure evidence | Blocks |
|---|---|---|---|
| G1 | What existing exact claimant/delegation and pre-prompt child hook can bind executable-task admission without granting authority from prompt text? Parent live-lease checks alone are rejected. If no accepted owner route exists, narrow to launch-only preparation or seek its own owner design; never simulate one. | AK task/claim owner + Pi runtime integration; exact contract and negative handoff/revalidation proof | RFC readiness for executable-task semantics, runtime implementation/affected use |
| G2 | Can the existing little-helpers transport be exported without pulling an interactive extension or fleet/AK ownership into a generic CLI? Keep one owner; extraction into a new package requires demonstrated dependency need. | Little-helpers owner; bounded source/import review and proposed package export contract | Final RFC allocation and implementation slice definition |
| G3 | Which exact legacy options remain compatible and how is the lane script withdrawn? Proposed default for the new visible-task surface is interactive; old multi-task print behavior must not change silently. | Lane owner + package release owner; explicit compatibility table and separate owner task scope before migration | Lane replacement and broader activation, not design capture |

These are explicit missing evidence/decision inputs, not non-blocking implementation trivia. No `ready_for_adr` claim is permitted while G1/G2 or material review findings remain. A design-only artifact can be assessed with these blockers without claiming implementation readiness. Do not create a new wave to make coverage tooling appear green.

## Proposed sequencing, rollout and rollback

**Pre-decision/design continuation:** resolve G1/G2 by bounded owner-contract/source analysis or record the exact owner gap. This analysis precedes RFC readiness and does not require an accepted ADR. If closure needs new runtime behavior or experiments, route separately authorized evidence work; do not implement the production capability to justify its own decision. Obtain exact-scope authorization to open the decision; then produce/review the RFC through existing AK convergence. Independent review must challenge need-to-requirement sufficiency, not just section completeness. No ADR readiness while material prerequisites remain.

**Only after lawful review/ADR closure:**

1. Freeze the accepted request/observation/authority contract and publish post-ADR implementation plus validation/rollout/rollback plans.
2. Author exact owner implementation tasks: little-helpers core/CLI/tool; AI Society task admission; discovery/distribution; lane compatibility. Reconcile task5133/5134 allocation before creating overlapping execution. Do not activate fleet phases by implication.
3. Build deterministic parity, negative/race tests and installed-artifact checks, preserving existing fork/scout/candidate/continuation contracts.
4. Run one operator-authorized isolated/disposable canary per intended caller path, with live Ghostty/Pi observations and exact task authority. Canary authorization names allowed effects and model spend; this packet grants none.
5. Promote discovery claims only for the tested installed baseline. Migrate the lane adapter under its own owner task; retain explicit deprecation errors for removed options. Do not provide an unsafe automatic fallback.
6. On failure, stop new admission, retain unresolved attempt history and refer candidate cleanup/task recovery to their owners. Disable the new tool/CLI entrypoint or revert its release under owner control; do not kill workers, delete state, release claims or revert unrelated code as an assumed rollback.

## Existing state-machine continuation and stop rule

Use the current [AK Layer12 protocol](../../../agent-kernel/docs/project/layer-12-protocol.md) and [design model](../../../agent-kernel/docs/project/layer-12-discovery-and-design-packet-model.md). Discovery and design are separate packets. Register identity and source/task links through AK; independent design review is evidence, not an accepted ADR or owner execution permit.

Current repo cockpit's SF7/IW8/task4165 remains unchanged. Its legacy deterministic verifier does not apply transitions and is not scoped to this new concern. Use task5434/packet-specific readbacks for this design; do not manufacture a successful cockpit transition or override its unrelated active task.

**Next legal boundary after design review:** resolve/adjudicate material design inputs, obtain explicit authorization to open the exact launch-contract decision, then use `ak decision` RFC review/passport. The existing strict convergence loop is exact-hash review -> finding inventory -> resolution -> verification -> fresh review, at most four loops with explicit stall handling. Only legal `ready_for_adr` permits ADR drafting; ADR plus post-ADR plans precede scoped implementation. Generic proceed does not authorize ADR acceptance, wave activation, candidate admission, publication or runtime effects.

Suggested exact operator authorization at that boundary: “Open the architecture decision for the consolidated visible task-session launch contract in pi-extensions under task 5434's design packet, including G1/G2 resolution and RFC review; do not activate or implement before its required gates.” This is a proposed authorization string, not authorization already supplied.
