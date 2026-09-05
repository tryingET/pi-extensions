---
summary: "Decision151 revision02: operator-selected trusted-local fresh tasks, mandatory host task admission, separate task/workspace exclusion and explicit owner-ratification gates."
read_when:
  - "Reviewing the revised visible task-session contract after attempt624."
  - "Disposing AUTH, BOOT, EXCL, PKG and MIG findings before ADR."
type: "rfc"
task_id: 5451
status: "revised_proposal_owner_ratification_required"
---

# RFC revision02 — trusted-local visible task sessions

## 1. Decision requested and evidence boundary

Select **B: fresh, unclaimed tasks on a trusted single-user workstation**, with no parent-held transfer or authenticated delegation. The operator explicitly chose that first-use scope in the task5451 interview. Select a **mandatory Pi host-owned task execution boundary**, not an optional input hook, and retain one little-helpers transport shared by CLI/Pi projections. Use conservative, independent task and workspace exclusion; do not introduce a universal identity service, scheduler or task database.

This is a new candidate responding to [review attempt624](2026-09-05-visible-task-session-rfc-review-01.md), not an edit to the [original RFC](2026-09-05-visible-task-session-authority-startup-rfc.md). Original RFC hash: `e6a7bde8460c8e24c4cec877019879d28394a5571607b7d0103cb2029c5c1dc0`. The [design](2026-09-05-visible-task-session-design.md), [discovery](2026-09-05-visible-task-session-discovery.md) and [decision inputs](2026-09-05-visible-task-session-decision-inputs.md) remain historical inputs; section 10 declares this candidate's applicability changes rather than silently rewriting them. The [adjudication](2026-09-05-visible-task-session-adjudication-02.md) contains root-cause, competing-school and multi-order reasoning.

**Claim limit:** scope selection is observed; the contracts below are selected author proposals, not owner-approved APIs or installed behavior. AK and Pi owner ratification is still required before ready-for-ADR. Task5451 permits resolving or explicitly owner-blocking findings, not accepting an ADR, writing runtime code, installing packages, activating default-off task composition or migrating the lane. AK owns current decision/review state; this document does not.

### Evidence-backed problem

A temporary shell launcher was reinvented despite a checked-in lane launcher. The old script mixes task lookup, prompt construction, terminal spawning and mode defaults; little-helpers already owns stronger transport semantics. Pinned AK source provides atomic pending-task claimability with asserted-local identity, not delegated identity. Installed Pi source shows optional input/lifecycle hooks can fail open or be bypassed. These are distinct root causes: discovery failure, ownership conflation and incomplete admission mediation. Better documentation alone cannot repair the latter two.

Historical source inventory remains in decision inputs; [revision02 source findings](2026-09-05-visible-task-session-source-findings-02.md) add refreshed evidence and corrections. **Correction:** installed Pi CLI exits on diagnosed extension-load errors before entering a run mode. The actual gap is silently absent required admission registration, swallowed lifecycle/input exceptions and alternative execution paths; do not conflate those with an explicit missing `-e` file. Current source rechecks must bind each owner generation; dirty package work is not installed release truth. No proposed launcher race, denial, packing or live-use test has been executed by this revision.

## 2. Options, selection and excluded cases

| Option | Strongest reason to select | Cost / rejected claim | Disposition |
|---|---|---|---|
| A: authenticated delegated workers | Necessary if a required case transfers a parent-held task or distrusts callers sharing local APIs | Requires accepted delegation, replay, revocation and effect-fencing semantics absent from the pinned owner contract | Not first use; future architecture decision, not an assurance switch |
| B: asserted-local fresh claimable tasks | Matches the explicit operator choice and existing atomic claim semantics | No requester authentication or hostile same-UID protection; no atomic transfer | Selected first-use proposal |
| C: preparation/inspection only | Does not release a runnable task prompt while mandatory owner contracts are missing | Does not fulfill the end-to-end launch need | Holding posture until accepted architecture and affected-use proof |
| Optional startup extension as sole veto | Small apparent implementation footprint | Missing/throwing handlers and other turn routes invalidate exclusivity | Rejected as enforcement architecture |
| Bootstrap-only constrained profile using current hooks | Can remove an initial task argv message and reduce accidental startup paths | Its trusted code still has alternate turn routes; a profile alone is not a mandatory host veto | Defense in depth, not substitute for host boundary |
| New universal launch daemon/identity service | Could centralize broad fleet capabilities | Solves an excluded deployment and adds a second operational authority temptation | Rejected for this scope |

Included: one exact pending task, one canonical owner checkout, one explicit provider/model/thinking selection, fresh Pi context in a visible Ghostty window, cooperative installed callers and owner-operated recovery. CLI does not require a parent Pi session.

Excluded: parent-held transfer; automatic unclaim/reclaim; remote or multi-user service operation; hostile same-UID code; arbitrary shell commands or binary/env overrides; standing-agent identity; candidate-workspace creation/adoption; cross-company visibility expansion; batch/multi-task launching; resumed/forked task context; automatic relaunch; arbitrary startup extensions or secondary objectives. Candidate-class requests refuse with the existing lifecycle owner route rather than launching a non-candidate substitute. Exclusion does not waive the candidate owner's authority.

## 3. Target architecture and stable core/adapters

| Boundary | Owner | Proposed stable responsibility | Must not own |
|---|---|---|---|
| Task claim and recovery disposition | AK task owner | Native task identity, exact scope/guardrails/claim facts and lawful claim recovery | Ghostty placement, runtime profile loading |
| Mandatory task execution gate | Pi runtime owner | Default-deny supported task-session state, effective context binding and model/tool dispatch mediation | Issuing task authority or defining AK policy |
| Task integration | Pi-society-orchestrator proposal | Interpret current owner facts, bind admitted task baseline and translate refusal reasons | Raw DB access, cloned claim algorithm, new delegation token |
| Transport and exclusion | Little-helpers | One spawn implementation, durable operational attempt history, conflict admission and outcome correlation | Claims, task completion, authority grants |
| CLI/Pi projection and skill | Package/discovery owners | Typed requests, same normalized results and independently observable installation | Separate spawning or permission logic |
| Legacy lane compatibility | Owned lane owner | Later explicit option translation/refusal and coexistence disposition | Automatic unsafe fallback |

The generic core consumes opaque canonical task/conflict identities and admission observations from its adapter. It does not import AK. Private attempt nonces correlate local evidence; they do not authenticate actors or grant permissions. Any adapter ABI carries an explicit version and producer identity; incompatible or missing versions refuse launch rather than guessing.

No public arbitrary-command transport export is introduced. The internal ASC controller-tab-only observer remains internal and retains its existing placement refusal. Ordinary fork/scout/candidate/fresh-handoff semantics are not renamed or widened.

## 4. AUTH-02 — task admission and freshness contract

### Owner facts and operations

The supported B adapter uses the approved AK runtime gate and its policy-selected explicit DB routing. It reads exact task identity/status, scope, done contract/guardrails, dependencies/deferral/decision admission facts, current claimant and lease. Pin command/output compatibility before affected use. Require explicit bounded task scope; this is a stricter launcher policy, not AK's repo-default scope rule. Refuse FCOS-specialized or other owner-composed execution requiring a different admission protocol. The child alone issues one native `task claim --agent <attempt-specific-child-local-identity> --lease <explicit-seconds>` for a fresh pending task; the actor string remains an **auditable local assertion**. The pinned lease range is 1–86400 seconds, not a perpetual grant or renewal operation. `task handoff` preflight is not delegation, `task begin` is not activated, and no release/reclaim sequence is generated.

A launch baseline contains: canonical AK instance identity; task ID and relevant task/scope/contract revisions or canonical content digests; exact canonical target repo and conflict domain; intended actor/incarnation; requested model; captured objective/context/resource digests; owner read time and observed claim facts; request ID and semantic digest. Freshness is **comparison and owner admission**, not “read less than N seconds ago.” Missing fields or unsupported owner output yield unavailable/unsupported, never optimistic admission.

Native claim linearizes native claimability only. A sequence of `show -> claim -> show` is not an atomic transaction over every linked scope/contract/decision fact. The adapter must explicitly distinguish:

1. **Pre-claim comparison:** any change from the plan refuses this launch request; a new plan does not retry an indeterminate attempt.
2. **Claim result:** require an affirmative claim result and ordered owner readback before release. Pinned `claim_task_at` commits then calls `get_task`: a nonzero/error response can follow a committed claim. Unknown outcome denies task release and retains exclusion; a later matching snapshot is not an immutable operation/replay receipt. Do not automatically retry the claim or resume release after uncertainty.
3. **Post-claim baseline:** reread claimant and every admitted scope/contract dependency before task-message admission. Require exact actor/claim tuple, valid lease, unchanged scope/repo/intent and expected own-claim task version increment `v -> v+1`; unexplained change denies release. Compare companion/dependency/decision facts independently: they can change without bumping this task's version. Scope snapshot `exported_at` is derived from creation time in the pin, not read freshness; use actual ordered observations and versions. Drift denies execution while preserving any claim for recovery.
4. **Selected concurrency assurance:** use unchanged native claim, conservative drift refusal and an **owner-coordinated absence of concurrent authority-input mutation during deterministic startup**. Coordination covers task/scope/claim/lease, contracts, dependencies, blocking decisions and automatic recovery writers—not merely launchers sharing a checkout. It must be established through an accepted owner operating procedure, not a caller checkbox or child prompt. If it cannot be established, refuse executable startup. This is cooperative startup snapshot assurance, not atomic compare-baseline admission. An owner-side CAS route is a separately authorized alternative if this precondition is rejected; even CAS would not fence post-commit effects. AUTH-02 remains owner-blocked until AK/Pi accept the selected operating contract and evidence of coordination.

A later scope or ownership change is not a retroactive cancellation of completed/in-flight effects. This profile does **not continuously poll/revalidate AK authority** at every model/tool round. Owner coordination governs mid-run authority changes; a delivered local stop/denial closes future dispatch, not already-started effects. The known lease deadline is a local stop-new-dispatch bound, not renewal or live authority proof. No automatic renewal, same-attempt resend or re-claim is supported; tasks exceeding their selected lease need owner recovery. R4/B5's post-plan drift refusal applies to startup observations under the accepted operating precondition, not continuous revocation. No exactly-once effects or instantaneous fencing is promised.

### Claim-success/message-denial recovery

No automatic unclaim, release-expired, completion, process kill, candidate cleanup or relaunch is a launcher recovery operation. The operational record retains claim observations, exact attempt and last known host state. The AK task owner decides claim disposition; the host/transport owners supply their own effect observations. Recovery distinguishes **no task execution admitted** from **no effects whatsoever**: bootstrap resources and the claim itself may have effects.

If the host can durably prove no model/tool task admission occurred and cannot occur later for that attempt, that is bounded evidence for owner-driven claim recovery—not an authority-granting local receipt. For an ordinary B task, the proposed owner action is native `task unclaim <id>` only after trusted pre-admission effects and executor quiescence are accounted for, exact current claimant/version are rechecked, and competing authority edits are excluded. The pinned unclaim operation lacks claimant/version CAS: drift stops recovery rather than clearing someone else's claim. Read back the result; an uncertain response stays unresolved. This is an explicit owner operation, never launcher compensation. If release might have occurred, retain exclusion until the owning process/effect surfaces establish quiescence or fencing. PID absence, lease age, ACK/FINAL and task completion alone do not establish that condition. If sufficient evidence is unavailable, the attempt remains blocked with a named missing-fact/owner route. No v1 automatic safe-overlap override exists.

## 5. BOOT-01/02 — mandatory host boundary and trusted profile

### Enforcement allocation

Propose a dedicated, explicitly enabled **task-session mode in the Pi host**. Its denial state exists before admitting task input or initializing any task-capable execution path. Missing adapter, unsupported host build, profile drift, initialization exception, denied/unavailable owner facts and unknown gate state are terminal denial for that admission. Ordinary Pi sessions remain outside this guarantee; this RFC does not impose a universal host policy by extension installation.

The child starts with a private attempt locator, not the runnable task body as an initial CLI prompt, stdin prompt, extension command or editor text. The host loads the declared trusted bootstrap/integration resources and prepares a fresh empty task context. Only the host's task admission boundary can release the sole initial task message after owner admission. No first LLM bootstrap turn, queued follow-up or catch-and-continue fallback is allowed.

The owner must mediate all supported task execution entry paths—not just `AgentSession.prompt` ordinary input: command dispatch, extension-initiated/custom-message turns, queued steering/follow-ups, resume/retry/continuation paths, model rounds and tool dispatch. First-use task mode disables session switch/import/resume/fork/reload, manual shell `!`/`!!`, arbitrary extension commands, secondary objectives and model/config changes. Start with empty history and queues; reject secondary user/custom objective messages before command dispatch, queue insertion or context insertion, including non-triggering/next-turn messages. Control/status stays outside model context. Do not classify arbitrary injected strings as same-task using an LLM.

The selected guarantee is **startup admission plus local run-origin confinement**, not continuous task-authority enforcement. No supported task-model request or task-tool invocation originates without this incarnation's successful bootstrap and sole admitted objective. Every internal round/retry must retain that local lineage; generic provider retry logic cannot retry an admission denial. There is no new AK claim or per-provider authority token for each round. The boundary does not fence in-flight requests, already-started child/tool effects or direct access by excluded raw SDK consumers.

Use existing owner seams where sufficient: a literal custom ResourceLoader; host-owned stream-function/provider-send assertions outside best-effort extension callbacks; mandatory local admission assertion before optional tool hooks and at actual tool execution, not just parallel preflight. Guard against mid-round model/system/tool refresh changing the frozen profile. These are proposed host compositions, not new universal agent-core semantics. Tool argument preparation and execution-start listeners are trusted code, not effects magically prevented by a later tool veto.

**First-use compaction decision:** disable automatic/manual compaction and branch summarization; context overflow stops with a truthful unsupported-continuation reason and retained attempt. No silent summary-generated objective or resume into ordinary Pi. Tool/model context may evolve under the admitted task lineage; representation-only serialization is pinned. This conservative limit creates a task-length/usability cost that must be evaluated before expanding the profile. Before activation, source control-flow coverage must identify each permitted path and its refusal boundary; a helper using an unguarded lower-level API is not covered. The required contract is absent from stock Pi 0.84.4.

### Proposed state machine

States below are local design labels, not new ROCS or AK lifecycle terms. They supplement the independent transport/session/report/task/placement facts from the design rather than replace them with a success boolean.

| State | Allowed transitions / effects | Required refusal behavior |
|---|---|---|
| `locked` | Validate host/profile identity; no task-model/tool execution; load only declared trusted bootstrap effects | Missing/throwing admission integration stays denied; no ordinary-session fallback |
| `prepared` | Capture objective and effective context; private correlation; reserve attempt before spawn; validate owner baseline | Command routing, resume and secondary objective input refuse |
| `claim_observed` | Expected native claim confirmed; post-claim baseline comparison only | Drift/error preserves claim/history and denies message release |
| `admitted` | Persist release intent, bind exact effective envelope, release sole task message through host gate | Release/persistence ambiguity moves to unresolved; no resend |
| `active` | Execute the admitted task; assert local lineage, frozen profile and known lease bound at new dispatch boundaries | Delivered local stop/denial, unapproved turn source, lease deadline or profile drift stops new dispatch; no continuous AK polling or in-flight fencing |
| `denied` | Read-only diagnostics and owner recovery route; no return to active on the same attempt | A fresh request cannot erase unresolved history |
| `unresolved` | Inspect and collect owner observations; no automatic new worker | No timeout/lease/window-based release |
| `retired` | Owner-correlated recovery has closed future task dispatch and disposed claim/effects for this attempt; history retained | Retirement does not grant authority to another attempt |

The implementation owner must distinguish bootstrap state before OS spawn from child-host state; the table expresses guarded protocol phases, not one cross-process atomic state machine. A durable release-intent record written before invocation permits conservative recovery if invocation succeeds but the response is lost. It cannot prove whether the model ran. No host receipt upgrades task authority.

### Resource and payload contract

- Supported profile is explicit, versioned and installed-owner-controlled, independent of caller-selected Pi profiles. Resolve target-cwd context through the actual supported resource loader semantics and record exact resolved order; shell `cd` is not instruction projection. Include SYSTEM/APPEND_SYSTEM and actual override/worktree behavior where present. A literal/snapshot resource loader is the proposed integration seam; filtering after discovery/import cannot undo resource reads, factories or package installation. `--no-extensions` alone is not a no-install or no-effects guarantee.
- Trust includes the selected host build, provider/tool implementations, bootstrap/integration module, and explicitly enumerated resource factories with their declared startup effects. No arbitrary ambient extension discovery, auto-install, package update or unclassified executable resource is part of this task profile. Required missing resources block rather than silently disappear.
- Pre-admission effects are restricted by contract to identity/resource inspection, approved AK reads/claim, private attempt persistence, transport/reporting and context capture. They are trusted-code restrictions, not an OS sandbox. The exact allowlist and host enforcement allocation require owner acceptance.
- Keep raw objective bytes/order separate from the effective envelope: ordered project instructions, declared skills/context and model/tool/resource configuration. Bind both with digests and provenance. Capturing one original file hash is insufficient.
- The initial objective is **literal task data**, not slash/extension-command dispatch or an implicit skill/template invocation. An intended skill is an explicit resource input. Reject implicit command interpretation and unclassified input transformations. Mandatory instruction precedence remains intact; a task digest does not override system instructions.
- Freeze allowed contextual expansion before admission. No arbitrary post-gate `input`, `before_agent_start`, finalized-user-message, `context` or `before_provider_request` rewrite of task intent/instructions. Bind the selected provider serializer and model settings; arbitrary request-body overrides/custom streams are excluded. The final supported provider-send guard must run after allowed instruction-affecting transformations, outside best-effort extension dispatch. A different objective/context baseline requires denial and a new plan after recovery, not silent revalidation inside the same admitted request.
- Tool results produced during authorized work are new observations, not startup objective substitutions. They cannot authorize scope expansion or a secondary objective. Ordinary agent continuation is tied to the same admitted task, not counted as another initial message.
- Before-admission confidentiality is limited: trusted host/resource code may read payload/context. Private files protect accidental exposure, not hostile same-UID access. Ordinary output contains digests, bounded identifiers and reasons, not task bodies, credentials or copied environment values.
- Preserve the controller's editor bytes on all plan/launch/watch/error paths. No clipboard, keyboard injection or editor-based fallback. The separate ASC prefill repair remains task5432's concern.

## 6. EXCL-01 — exclusion independent of task authority

### Namespace and conflict identities

One owner-configured canonical private host namespace is shared across supported CLI/Pi callers, profiles and package versions. It is not derived from cwd, caller state-root overrides or a temporary handshake directory. Owner provisioning records namespace identity/schema and supported reader/writer versions. No namespace at launch time means `not_configured`, not silent creation of a competing root. Missing/incompatible/corrupt history disables writes/launch; version-compatible read-only inspection must remain available through the owner recovery route. Provisioning/upgrade is a separate owner operation, not a `plan` side effect.

Reservations index **both** independent domains:

- task: canonical AK instance + task ID, across every request ID and workspace;
- workspace: canonical owner-supplied shared-effect domain, across every task ID.

The conservative initial domain includes the whole canonical checkout and its shared Git common-directory identity; linked worktrees sharing common Git state are not assumed independent. Parent/controller mutation in that domain is excluded during child occupancy; observation is allowed. Parent recovery edits also need owner disposition, not an implicit controller exception. Resolve symlink/path aliases before lookup. Unknown overlapping external resources or other active writers require an owner conflict disposition; a filesystem key cannot discover all effects. Caller-supplied narrower path lists do not relax exclusion.

A single namespace admission lock performs cross-domain checks and durable reservation publication; it is held only for bounded local state operations. It is **not held while calling AK, spawning, waiting for ACK or invoking candidate admission**. The provisional reservation already excludes competitors while owner admission happens outside the lock. Re-enter to validate reservation identity/version and publish each durable observation. Lost owner replies retain the reservation. This avoids cross-owner nested locks rather than prescribing a new lock order to AK/candidate owners.

Concurrent taskA/workspaceX and taskB/workspaceX must conflict; taskA/workspaceX and taskA/workspaceY must conflict. Same request ID/same semantic digest inspects the existing attempt; same ID/different digest refuses. A task-scoped mutex or tuple-only key is insufficient.

### Durable record and recovery

Reserve and durably publish launch intent before any spawn. Atomically replace records with explicit persistence/error handling and stable identity; symlink/owner/mode ambiguity refuses. The file/schema/fsync protocol is an implementation-owner obligation to be tested before use, not established by a Markdown table. Temporary detached-handshake cleanup never deletes the operational record.

Retain unresolved reservations across claim expiry, reassignment, parent death and package upgrades. The recovery interface is **inspect plus evidence submission to the appropriate owner**, not a generic force-unlock. To retire an attempt, require correlated host closure of future dispatch, effect-owner disposition of already-started work, and AK claimant disposition. A host receipt alone does not clear a remote operation or task claim. In v1, uncertain cases stay blocked; no safe-overlap override or age-based garbage collection is exposed.

Candidate-class requests are refused before reserving/spawning and routed descriptively to lifecycle-v2. Candidate mechanisms are not called while holding the launch lock; ordinary task mode never reuses their permit as its own authority. Existing candidate paths do not automatically participate in this namespace. First deployment therefore requires an explicit owner coexistence boundary with external/candidate/legacy writers; unknown coexistence blocks. No universal exclusion against unsupported callers is claimed.

Safety costs availability: a stuck attempt can monopolize a domain. `inspect` must expose exact blockers, last owner observations, missing evidence and the recovery owner without suggesting another profile, task ID or namespace. Post-ADR evaluation must test operator recovery behavior and pressure to bypass, not merely successful mutex acquisition.

## 7. PKG-01 — production contract and distribution

Keep one source implementation in little-helpers. Explicit production ports supply exec, model/thinking, parent cwd, provenance and placement observations without constructing a fake `ExtensionAPI`. A production exec port must retain detached private command admission, automatic ancestor/presence discovery, production staggering and placement checks. **Function injection is not test-mode selection.** Test overrides require an explicit test-only boundary unavailable through the public CLI/request schema.

Emit package-owned Node ESM JavaScript for public CLI/core; pin emitted import extensions, dependency closure, `bin`/`exports`/`files` coverage and Node version. No runtime TypeScript stripping assumption under installed `node_modules`; no CLI import of extension registration. Existing internal TypeScript exports are not silently repointed as part of this allocation. The non-Pi caller still needs a supported installed child Pi and its configured provider; no account/model substitution.

Retain G2-P1: real production exec injection without test declaration must exercise the production handshake/ancestor/stagger/placement policy. Independent packed-install tests must execute the emitted public boundary without a parent Pi session and without source-tree import leakage. Observer controller-tab-only refusal, provenance owner calls, CLI/Pi normalized error parity and privacy remain mandatory. Those are post-ADR implementation/affected-use gates, not tests claimed run now.

Package owner ratification of this selected ABI/allocation is still required. Current source manifest is evidence about source packaging, not proof of an installed CLI, export or skill.

## 8. Transitional compatibility, migration and withdrawal

### First-release boundary

Legacy lane replacement is **excluded from the first feature allocation**. This is not permission for uncontrolled coexistence: before any enrolled-workspace canary, the lane/task owners must identify existing launch routes/writers and explicitly exclude or disable competing direct-spawn use there. The launcher cannot infer that a script is inactive merely because it did not find a PID. If the required coexistence disposition cannot be established, stay preparation-only.

Existing script behavior outside that bounded enrollment is unchanged by this RFC. Do not advertise global duplicate exclusion while it remains independently callable. Existing tasks5133/5134 and candidate lifecycle remain separately owned.

### Later compatibility decision table

This table fixes the proposed boundary for a future thin adapter; it does not authorize changing the lane script now.

| Existing option/behavior | Proposed adapter disposition | Reason |
|---|---|---|
| One task, interactive default | Translate only with explicit task/model selection and new admission contract | Preserve intended use, not old unchecked spawning |
| Multiple IDs / automatic print default | Refuse as unsupported v1; no partial launch | A batch changes failure/recovery and mode semantics |
| `--interactive` | Translate for one admitted task | Explicit mode |
| `--print` | Refuse, not silently open interactive windows | Separate headless contract needed |
| `--dry-run` | Map to genuinely non-launching `plan`; no prompt/log/attempt directory creation | Old dry-run creates a log directory |
| `--focus-last` | Refuse until explicit optional placement behavior is accepted | Repo-title matching is not exact identity |
| `--hold-open`, `--no-hold-open` | Refuse | Legacy shell lifecycle is not worker/task completion |
| `--log-dir` / log-root overrides | Refuse as operational-state override; private package-owned diagnostics remain | Prevent split exclusion namespace and private payload leakage |
| Hard-coded pilot task set | Refuse | Historical task lists are not current authorization |
| `AK_WRAPPER` or arbitrary binary/provider overrides | Refuse | Preserve owner-selected runtime and explicit model identity |
| Missing/disabled new CLI | Clear unsupported/unavailable error | Never direct-spawn fallback |

Post-ADR migration mechanics require a lane-owned task, compatibility fixtures, updated discovery references and a reversible release plan. First activation must not wait for implementing every legacy option; it must wait for a truthful bounded coexistence decision.

### Withdrawal semantics

Stop new admissions, preserve all unresolved records and keep inspect/recovery available. Disable the entrypoint or refuse incompatible writes; do not interpret rollback as worker cancellation, claim release, record deletion or reactivation of old transport. Rollback to an older binary unable to interpret the record schema must retain a compatible read-only inspector rather than silently start with empty state. Package/version rollback and task/effect recovery are separate owner actions.

## 9. Deployment, discovery and operator examples

### Supported-environment and discovery table

| Situation | First-use behavior / claim limit |
|---|---|
| Trusted local Linux/Ghostty; supported task-mode Pi build; explicit installed profile; approved AK route; enrolled conflict domain | Eligible for admission checks, not automatic launch permission |
| Ordinary installed Pi 0.84.4 with optional input hooks only | Unsupported executable startup; plan/inspection only |
| Non-Pi harness with configured skill/capability discovery and installed CLI | Same request/result contract; no parent Pi TUI needed |
| Skill/CLI filtered, colliding or missing but independent capability preflight present | Compare intended vs loaded identities; report specific limitation |
| Skill and every independent discovery carrier absent | Capability unknown; do not claim to diagnose an unseen installation |
| Required project instruction/resource omitted by constrained profile | Deny or present an explicit unsupported profile; never silent context loss |
| Parent-held task, candidate-class work, remote/multi-user deployment, unknown workspace overlap | Refuse and name the owner route; no fallback |
| No intercom endpoint | Explicit reporting-unavailable/manual observation if supported; never guess a parent session |
| Window observed but no child admission | Transport/placement observation only; not authorization, readiness or completion |

Skill distribution through `pi.skills`, tool availability and rendered descriptions must be checked against the installed package/resource loader. A repository file is not a loaded skill. No AGENTS/template edits or global skill adoption occur in this task. Fresh-context discovery tests must avoid seeding the expected command and must inspect instruction/resource provenance, not just rendered Markdown correctness.

### Example 1: fresh pending task

Operator requests taskT with explicit provider/model and a new window. `plan` reports exact task and workspace, current owner facts, selected profile and no unresolved attempt. `launch` reserves, starts a locked child, performs owner admission and releases one bound task message only after the host gate admits. A window/ACK is displayed separately from the claim. This is expected proposed behavior, not an executed example.

### Example 2: task already held by another session

The same request sees an existing claimant. Refuse with the owner reason and existing attempt observations where available. Do not unclaim it, rewrite actor identity or suggest a second task ID to evade the restriction. The operator may pursue separately authorized task decomposition or a future delegation contract; this launch does neither.

### Example 3: parent disappeared after possible release

A repeated request finds unresolved attemptA. Return attemptA and its last host/task observations; no second worker. Missing ACK/expired lease/closed window does not clear it. The operator can inspect the named recovery route; inability to prove closure remains blocked. Reporting success would sacrifice the central duplicate-safety contract for superficial availability.

### Example 4: claim succeeded, host denied context drift

The host never admits task execution, records the denied baseline and closes future dispatch for attemptA. The claim remains an AK owner fact. Its owner evaluates bounded host/transport evidence and performs lawful claim recovery if warranted. Only after claim/effect disposition can the operational attempt retire. No automatic unclaim-and-retry.

## 10. Requirement applicability and verification

This table is an explicit candidate delta, not a retroactive edit to design packet85 or its reviewed pass.

| Inherited claim | Revision02 applicability |
|---|---|
| N1/C1, N2/C2, N4/C4; R1/R2/R3/R6/R7 | Retain fresh discovery, shared implementation, exact input/model/cwd, truthful observations and draft safety; constrain supported installed profile explicitly |
| N3/C3 and R4 | Retain no escalation; replace authenticated delegation with selected asserted-local non-delegating admission; candidate-class launch excluded, not bypassed |
| Design admission items3–5 | Authentication/handoff requirement does not apply to B; native claim plus ratified baseline ordering and mandatory host denial replace it; stronger A remains future |
| B5/V4 | Retain foreign claimant, completed/blocked/missing-scope/startup-observed drift refusal; remove delegated-attestation proof from B; require accepted cooperative authority-input ordering and native-claim/recovery fixtures; expressly exclude atomic baseline admission and continuous revocation |
| B6 | Verify candidate/visibility refusal; do not require candidate creation through this surface |
| R5/B7/B8/V5 | Strengthen task-vs-workspace keys and linked-worktree common-state conflicts; no lease-generation reset; no automatic safe overlap |
| B3/V3 | Raw objective is literal; ordered trusted context captured separately; one initial task message does not mean one model round |
| R8/B11/V7 | Retain withdrawal safety; defer lane replacement implementation, but require bounded coexistence before first activation |
| U1/U2 | Test capability discovery and constrained-profile task usefulness in Pi plus an explicitly configured second harness; no fleet claim |
| U3 | Rehearse B claimant refusal, claim-success/denied release, unknown effects and withdrawal; never call that authenticated delegation or continuous revocation proof |

Unlisted design acceptance obligations are retained where their actors/environment remain applicable. Changed security, context/profile and conflict semantics invalidate dependent behavioral passes; none exist for this proposed feature. G2-P1 is retained. Second-order risks and their falsifiable signals are in the adjudication, not a second requirements store.

### Before ADR

Required: exact revised source/reference; immutable attempt624 disposition map; operator scope evidence; AK owner baseline/recovery disposition; Pi owner host-boundary/trust disposition; little-helpers/package and lane owner allocation/coexistence dispositions; source-grounded negative and recovery narratives; independent exact-candidate review. Owner-blocked rows are not closed by author confidence or a structural validator.

### Before executable affected use

Require independent executable checks for missing/throwing adapter, command/secondary-turn bypass, scope drift and claim-response loss, effective-context substitution, stale lease/generation, different-task shared-workspace races, aliases, parent death at each persist/spawn/claim/release boundary, production exec parity, packed dependency/resource closure, one-message delivery, draft preservation and withdrawal with unresolved history. Source-bound host-path coverage must reach automatic continuations/tool entries, not only the visible prompt handler. Live authorized Ghostty/Pi canaries must bind installed builds and exact task scope; no mock-only oracle or source-manifest confidence.

Validate representative task usefulness and operator recovery separately. Record capability omissions, refusal comprehension, recovery latency and bypass attempts without fabricating thresholds or interpreting one successful launch as fleet reliability. No production test, provider spend or canary is authorized by this RFC.

## 11. Finding dispositions and remaining decision gates

| Finding | Concrete revision | Remaining closure requirement |
|---|---|---|
| AUTH-01 | Sections1–2 select operator-chosen B; section10 explicitly revises assurance applicability | Task/integration owners acknowledge need-to-contract fit; operator choice is not their acceptance |
| AUTH-02 | Section4 pins native route, freshness distinction and non-automatic recovery | AK owner ratifies residual concurrency and failed-claim recovery contract |
| BOOT-01 | Section5 selects mandatory host denial boundary and phase/error behavior | Pi runtime owner ratifies enforcing seam and complete supported path coverage |
| BOOT-02 | Section5 fixes trusted profile, literal objective, effective context and transformation policy | Runtime/integration owners accept resource/effect set and privacy/continuation limits |
| EXCL-01 | Section6 separates keys, serializes local reservation only, excludes nested candidate admission and defines recovery | Task/transport owners ratify conflict identity, disposition evidence and coexistence; no unsupported universal exclusion |
| PKG-01 | Section7 selects production/test split and emitted-JS boundary with retained executable oracles | Package owner ratifies contract; installed proof remains post-ADR |
| MIG-01 | Section8 excludes first-release replacement, fixes later option behavior and first-use coexistence/withdrawal | Lane/package owners accept bounded coexistence and migration boundary |

All seven original IDs remain traceable; rows with missing owner disposition remain **owner-blocked**, not falsely resolved. This revision answers the architectural questions with concrete proposals, including the cost of choosing them. Fresh review should distinguish remaining semantic defects from missing owner acceptance and should not demand production implementation before ADR.

If owners reject the mandatory host change or cannot establish task-baseline/conflict semantics, keep C as the disclosed holding posture and escalate that exact decision. Do not weaken back to an optional hook, manufacture a permit, or repeatedly review unchanged bytes. Use the existing maximum-four-loop convergence/stall rule; this is revision02, not a second lifecycle. No ADR drafting or runtime activation follows without lawful ready-for-ADR closure and the subsequent required owner stages.
