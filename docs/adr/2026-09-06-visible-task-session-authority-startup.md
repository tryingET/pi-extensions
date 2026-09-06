---
summary: "Decision151: adopt the reviewed cooperative-local visible task-session architecture with AK-held startup custody, sealed SDK execution, same-Codex fidelity and positive writer enrollment; implementation remains gated."
read_when:
  - "Planning owner implementation or evaluating scope changes after Decision151."
  - "Distinguishing accepted task-session architecture from installed or enrolled capability."
type: "adr"
status: "accepted"
decision_id: 151
task_id: 5477
system4d:
  container:
    boundary: "Fresh ordinary explicit-scope task sessions on a cooperative single-user workstation, across AK, Pi integration, transport and writer-custody owners."
  compass:
    driver: "One discoverable exact-task/model operation without confusing claims, windows, admission and effect retirement."
  engine:
    invariants:
      - "Shared visible transport; separate AK authority; sealed local execution; positive writer custody."
      - "T0–T2 serialization, private nonreplayable CLOSED and separate host/effect/claim retirement."
      - "ADR acceptance does not install, enroll, activate or unblock execution."
  fog:
    risks:
      - "Stranded global custody and paused bulk recovery can block unrelated work."
      - "Restricted context, transport and credential lifetime may undermine task usefulness and encourage bypass."
---

# ADR — visible task-session authority and startup

## Status and authority

- Date: 2026-09-06.
- Status: accepted architecture, not implemented or activated. The operator explicitly instructed **“proceed to adr”** after controlling `ready_for_adr` review626; AK accepted the outcome under evidence8415. Canonical recording/current state is read through Decision151's passport.
- Decision: AK Decision151, cross-repo, architecture tier; `bootstrap_single_track`.
- Artifact owner: pi-extensions; implementation facts remain with the owners below.
- Recording task:5477, following completed revision/review task5451.
- Independent reviewer: peer `scoutpeer-mtqd3l30-412025b1`; session `01a078c2-b4a0-7203-be8e-c4d4b09d8eb7`.
- AK decision/passport owns acceptance and lifecycle state. This document is the durable architectural record, not an alternative state store. No upstream Pi approval is asserted.

## Executive summary

Adopt one discoverable CLI/Pi operation for **fresh, unclaimed, explicit-scope ordinary tasks on a cooperative single-user workstation**. Reuse one shared visible transport, allocate startup consistency and claim recovery to new AK-owned closed intervals, allocate task execution to a sealed local SDK host, and require positively evidenced workspace and authority-writer enrollment. Preserve the exact requested provider/model/reasoning/account. The initial same-Codex profile is SSE-only with no retries or in-run OAuth refresh. This accepts the reviewed architecture and its costs, not a claim that current commands, packages or workspaces implement it.

## Exact decision basis

The adopted contract is [RFC03](../project/2026-09-05-visible-task-session-authority-startup-rfc-03.md), including its explicit composition rule: [RFC02](../project/2026-09-05-visible-task-session-authority-startup-rfc-02.md) is the baseline, with RFC03's precise replacements governing the changed startup, host, state-publication and enrollment clauses. This ADR summarizes that exact contract; it does not introduce alternative protocol semantics or weaken an incorporated condition. A substantive divergence must reopen the existing decision/review membrane rather than be treated as an implementation detail.

| Input | SHA-256 / durable identity |
|---|---|
| RFC03 | `b6271a187109a7e0a5d021b96903b4e664fd5827d275a79e4502b78f6bbcf716` |
| RFC02 baseline | `a97c4acc15dcedeb17596882419f2c8a920918d394428e0b1912f419dee7cb14` |
| Candidate freeze | Git `6f761c5549586f54f4a42be2d8395fe2d4b3fe69` |
| [Independent review03](../project/2026-09-05-visible-task-session-rfc-review-03.md) | `22c1ef7e9766cb9723e71aa9422f5c3133f0e7390fd43cd90d1606167b1c45e8`; AK attempt626/artifact1400 |
| Review landing | Git `02e24547eb3af015136166c2c6045bc81f553176` |
| [Exact input manifest](../project/2026-09-05-visible-task-session-review/attempt-03-inputs.json) | `81d268055dfa96ab1d7d5c2d93e4dd8b7f9cafeca96142d044dfd97fddd3fd97` |
| [Resolved finding inventory](../project/2026-09-05-visible-task-session-review/findings-78aec293801eb8fa1e44510f0bf98a968f1fd5a1f8f53875cfe2fdd74ee9db54.json) | `78aec293801eb8fa1e44510f0bf98a968f1fd5a1f8f53875cfe2fdd74ee9db54` |
| [Review verification](../project/2026-09-05-visible-task-session-review/attempt-03-review-verification.json) | `dce5f3a7e15b557ac246672cad5dd57dd8b8c42970612c032cc89edb0854fde9` |

The [AK](../project/2026-09-05-visible-task-session-ak-owner-disposition-03.md), [local Pi](../project/2026-09-05-visible-task-session-pi-owner-disposition-03.md) and [lane](../project/2026-09-05-visible-task-session-lane-owner-disposition-03.md) dispositions were explicitly delegated local proposed-contract judgments under tasks5462–5464, completed with evidence8386–8388. Their conditions are incorporated, not converted into upstream approval or deployed policy. Evidence8414 records the independent review's canonical attachment/readback. All seven findings resolved at proposal stage; zero material must-fixes, material nice-to-haves, architecture-shaping questions or contradictions remained. Historical attempts624/625 and their inputs stay immutable. No fourth unchanged review is required.

## Context, problem and drivers

An ad hoc visible-task shell recipe was reinvented despite a checked-in launcher. Discovery alone was not the whole problem: ordinary claim atomicity does not cover independent companion facts; nominal reads can maintain storage; optional Pi hooks do not mediate every execution path; inference payload hooks do not guard all transport/auth effects; and a new reservation registry cannot exclude existing unmodified writers.

The decision therefore requires both discoverability and a truthful execution contract. Drivers are exact task/model/cwd/context fidelity, no false delegation or admission claims, testable failure boundaries, explicit source ownership, safe retained uncertainty and useful recovery/inspection. Broad claims of current readiness would defeat those drivers.

## Decision

### 1. Scope and requirement applicability

Support one fresh ordinary non-FCOS/non-specialized task per request, with explicit scope and selected installed profile. Preserve typed `plan|launch|inspect|watch`, a caller-stable request ID plus semantic digest, canonical task/repo identity, ordered literal objective/context and independent transport/session/report/task/placement observations. Planning is read-only: no claim, spawn or attempt-directory creation. Missing/incompatible capabilities refuse without fallback; unavailable capability discovery must also work outside the missing capability itself.

Retain RFC02 §10's explicit applicability delta to inherited R4/B5/V4/U3: asserted-local non-delegating admission replaces authenticated delegation for this selected use case; baseline CAS and continuous revocation are not promised. Other compatible design obligations remain, including G2-P1, draft safety, CLI/Pi parity, explicit second-harness configuration and representative usefulness. Prior design-only passes are not behavioral approval of the changed scope.

Exclude parent-held transfer, automatic unclaim/reclaim/relaunch, candidate creation/adoption, standing-agent identity, remote/multi-user/hostile same-UID assurance, arbitrary binary/module/environment overrides, batches, fork/resume/import and full stock-TUI parity. Candidate-class work refuses with its existing owner route. A window, task ID, ACK, nonce or asserted actor string is not authenticated delegation.

### 2. Owner allocation

| Owner | Accepted responsibility | Boundary |
|---|---|---|
| AK | Native task facts/claim/recovery; new closed no-maintenance startup/recovery intervals; canonical DB lock/pin/policy identity | Not a terminal service, model loop or public arbitrary-command broker |
| Little-helpers | One shared transport; operational reservations; sealed local SDK host/resources/dispatch/UI/Codex-provider composition | Not another task DB or a copy of ASC execution runtime |
| Pi-society-orchestrator | Versioned emitted task-session adapter interpreting bounded AK protocol data/observations | No raw DB/lock, Agent/provider capability, Ghostty or independent model loop |
| Lane/candidate/automation/effect owners | Their own positive custody, competing-route restrictions, permits and effect dispositions | Launcher cannot mint consent, cancel permits or certify unknown writers |
| Package/discovery owners | Additive public emitted core/bin, narrow adapter and installed skill/tool/resource discovery | Projections of one capability, not separate orchestration authorities |

Ordinary fork/scout/candidate/fresh-handoff and ASC observer semantics are unchanged. The local task UI exposes an SDK transcript/status/identity and stop/quit, not unchanged InteractiveMode; raw execution, credential and descriptor handles remain private.

### 3. AK startup and recovery custody

Adopt RFC03 §4's finite shared-open-file-description Linux flock protocol in full. This is **new owner functionality**, not today's per-command gate or a manual-freeze workaround.

1. Reserve task/workspace conflicts durably under the short namespace mutex; release it before owner calls or spawn. AK opens the permanent canonical lockfile without locking and intentionally shares the same OFD/private channel with the sealed host. Prepare resources, wrappers and the inert envelope outside DB locking.
2. **T0:** after PREPARED, acquire the canonical lock, drain cooperating calls and validate identity/policy. Closed no-maintenance reads, one native claim and independent readback bind task/scope/companions/dependency/decision membership, temporal facts, pin/profile/envelope and exact claim tuple. Account for expected own version increment and permitted normalization; refuse repair-required or unexpected drift. Unknown commit/result remains unresolved, never retried mechanically.
3. **T1:** under actual custody, the host durably admits exactly one bound envelope or irreversibly denies it. T1 is not prompt execution. Its private immutable sidecar is published without acquiring the namespace mutex inside AK custody.
4. **T2:** explicit supervisor unlock follows validated durable T1. Writer exclusion spans **T0–T2**, not just T1. Private, phase/incarnation-bound, nonpersistent/nonreplayable **CLOSED** plus local outcome/deadline checks then permits at most one guarded literal prompt. Denied/unknown/stale/missing CLOSED, failed post-unlock persistence or elapsed budget cannot enable dispatch.
5. Keep descriptors/channels private with immediate CLOEXEC after intentional inheritance, controlled native-operation exceptions and no leakage to tools/providers/UI. Explicit LOCK_UN by any shared holder unlocks despite other references: no unconditional-finally, EOF, PID or timeout unlock. Supervisor death before unlock leaves surviving host custody/no prompt; unlock-before-CLOSED loss leaves unresolved denial. All-holder death releases the kernel lock, not claim/effect/reservation uncertainty. Stranded inspection is DB-free; no lockfile deletion recovery.

After T2, unrelated work may continue, but enrolled affected authority writers use **stop-and-dispose-before-change**, even before the first prompt. Unknown or inseparable bulk routes are suspended. The simple v1 suspends DB-wide lease-recovery triggering while enrolled active/unresolved attempts could be affected, including queued/in-flight/restart routes; source does not prove a periodic daemon exists. Positive enrollment must establish actual triggers and reinstatement responsibility.

Recovery obtains host future-dispatch closure and started-effect disposition **outside** the global lock, then uses a new AK-owned interval for exact claimant/claimed_at/lease/task-version/repo comparison and one explicit owner-native unclaim with result/readback under custody. Drift or uncertainty stops; reassignment must not be undone. Host closure, effect disposition and AK claim resolution are three separate retirement conditions. Completion, lease age, ACK/FINAL or disappearing windows cannot replace them. Existing separately authorized DB incident recovery remains available; this ADR creates no incident fence.

### 4. Sealed SDK host and provider fidelity

Adopt RFC03 §5's supported effect/path/refusal map. Terminal-default-deny precedes construction; use fresh private session/settings/model resources, literal ordered context and zero executable extension factories, without ambient package discovery. Required context omissions/decoding ambiguity refuse. The named bootstrap set is bounded identity/resource/auth-presence inspection, owner admission operations, private metadata and exact transport/reporting/rendering—not repo writes, opportunistic maintenance, arbitrary resource factories, credential commands, provider/catalog networking, OAuth login/refresh, installs or editor/clipboard injection.

One private ingress supplies literal task data only after CLOSED. Reject secondary objective-bearing input before command dispatch, queue or context insertion, including nextTurn/non-trigger messages. Keep control/status outside model context. Mandatory lineage/profile/incarnation/denial/deadline assertions cover internal rounds, next-turn refresh, actual provider serialization/send and actual tool execution after preflight; denial latches despite ordinary error conversion. Pure bounded argument preparation/listeners are trusted, arbitrary effects are not. Disable compaction/summaries, session replacement and automatic retries. Ordinary admitted coding shell is cooperative trusted-local execution, not hostile descendant containment.

Preserve the requested native Astra/Codex model/reasoning/endpoint/OAuth subscription/account from the approved owner model source. The earlier openai-responses witness is not a substitute provider or billing choice. Initial profile: forced SSE, zero retries, no redirects or option override, native serializer plus private post-payload and actual-fetch guards. Zstd/byte-array bodies require bounded decompression or verified pinned compression mapping. Do not log raw credentials/headers/bodies.

Use read-only existing-account OAuth state; reject mutation callbacks before updater execution. No login, in-run refresh, account fallback, token substitution or snapshot writeback. Explicit model resources and refreshOnCreate:false avoid implicit refresh. Budget outside the native five-minute refresh window plus a versioned safety margin; insufficient lifetime refuses/stops with retained claim/exclusion. Separately lawful account-owner refresh may precede a new lawful attempt, never automatic recovery/relaunch. WS/auto/cached transports and refresh paths remain unsupported until separately accepted coverage. Requiring them or stock-TUI parity reopens need-fit; do not silently expand the profile.

### 5. Namespace, enrollment and packaging

Adopt RFC03 §§6–7: one owner-provisioned account-root locator/private namespace, independent task OR common-Git OR overlapping-checkout OR declared shared-effect conflicts, permanent lock inode and atomic durable reservations/history. Resolve from installed account identity, not caller HOME/XDG/profile. No scope-narrowed domain, alternative empty namespace, PID/age retirement, online migration or nested namespace/AK/spawn waits. Retain compatible DB-free inspectors across upgrades and withdrawal. The RFC's locator/state paths are provisioning targets, not resources created by this ADR.

First activation requires an explicitly named **existing** eligible owner-custodied checkout and its entire common-Git/overlap domain. Positively account for route owners, sessions/controllers, legacy recipes, editors/watch/build/automation, candidates, queued/restarting triggers, prior descendants and external effects. Unknown custody blocks eligibility; today's shared checkout is not certified. Candidate owners withhold admissions and dispose/drain their own work. Controllers/editors remain observation-only throughout occupied/unresolved/recovery custody. This is cooperative restriction, not universal interception.

Defer legacy translation/replacement, **not** minimum enrollment, discovery/support withdrawal or safe inspection. A required lane hard-refusal gate is explicitly excepted from that deferral before activation. Outside enrollment, legacy behavior remains unchanged until separately scoped migration. Later adapters retain help and one explicit interactive task/read-only plan; whole batches/presets, print/focus/hold/log-root/runtime overrides and duplicate/conflicting/unknown semantic options refuse before effects. No last-option-wins, partial launch or old-transport fallback.

Use additive same-source emitted Node ESM public core/bin and emitted adapter closure, preserving existing TS exports and extension registrations. Node floor >=22.19.0; exact tested runtime/SDK/provider identities are later proof. No source-tree/global-dependency, TS-stripping/jiti or auto-install assumptions. Explicit production ports never infer test mode from injection presence; retain G2-P1 and unpublished test-only overrides. Arbitrary-command observer transport stays internal; controller-tab-only/headless-warning observer policy and close-is-not-cancel semantics remain unchanged.

## Alternatives considered

| Alternative | Benefit | Why not selected |
|---|---|---|
| Redistribute the legacy shell recipe | Immediate low integration cost | Discovery improves but admission/correlation/exclusion gaps remain |
| Authenticated parent delegation | Supports held-task transfer and distrusting callers | Different first-use scope; not manufactured from asserted identity |
| Ordinary show/claim/show plus manual freeze | Reuses current commands | Separate locks, maintenance, companion/time drift and recovery races remain |
| Mandatory upstream stock-Pi mode | Could retain full stock UI | Unnecessary for this bounded local SDK allocation; upstream approval not ours to assert |
| Universal daemon/global interception | Could centralize control | Exceeds selected owner boundaries and cooperative-local scope |
| Preparation/inspection only | Honest refusal while prerequisites are absent | Retained current holding posture, not the target delivered capability |

## Consequences and mitigations

Benefits: one discoverable capability, explicit owner seams, testable admission/lifetime boundaries and refusal rather than fabricated certainty. Local SDK allocation avoids a fictional upstream approval dependency while preserving the actual missing AK and custody work.

Costs and multi-order risks: a stranded holder can block unrelated AK operations; paused bulk recovery can accumulate unrelated orphan claims; common-Git exclusion reduces parallel throughput; conservative unresolved history may monopolize a domain; no compaction/retry/refresh can strand useful tasks. Those pressures can drive unsafe ordinary-Pi/script/profile workarounds. A passing safety test alone does not establish usefulness.

Required counterpressure: preload/no-maintenance/no-network startup, DB-free inspection, named recovery and trigger-reinstatement owners, explicit blockers/missing facts and lease/context/credential budgets. Measure contention, blocked duration, recovery backlog/effort, task usefulness, refusal comprehension and actual bypass attempts before broad adoption. No numerical threshold or reliability result is invented here. The [adjudication](../project/2026-09-05-visible-task-session-adjudication-03.md) preserves the first-principles and multi-order reasoning, not a second requirements or authority store.

## Rollout, rollback and validation gates

Acceptance records architecture only. **No code/schema/source-policy change, package installation, provider experiment, namespace provisioning, enrollment, live launch or execution unblocking is authorized by this ADR-recording task.** Post-ADR implementation, validation, rollout and rollback plans must be separately scoped at the owning surfaces before execution. Do not treat ordinary current commands as the accepted future protocol.

Required gates before affected use:

- Owner implementations and installed identity: AK closed no-maintenance startup/recovery mode; sealed host/provider ingress/send/tool enforcement; state/transport/adapter and independent inspector; emitted package/dependency closure.
- Positive actual authority/workspace writer, trigger and prior-effect custody with support withdrawal, candidate participation and safe reinstatement ownership.
- Independent negative/fault/concurrency cases at T0/read/claim-commit/readback/T1/T2/CLOSED/prompt, companion/temporal drift, native normalization/repair refusal, helper/host death, explicit unlock misuse, inherited-FD leakage, stale sidecars/CLOSED, failed persistence and projection lag.
- Provider/auth compressed payload, credential mutation, hidden retry/WS/refresh, tool preflight-to-execute stop and profile/lineage drift cases; no mock-only or manifest-only installed claim.
- Packed production CLI/adapter and CLI/Pi parity including G2-P1, whole-request legacy refusal, candidate/controller coexistence and rollback retaining unresolved history.
- Separately authorized real visible task canaries and representative-use validation for the exact installed task/provider/account/profile/context. Verification of requirements and validation of stakeholder usefulness remain distinct.

Withdrawal stops new admissions but retains compatible inspection/history and custody until correlated host/effect/claim retirement. It is not cancellation, permission to kill workers, claim release, lockfile deletion, automatic bulk-recovery reinstatement or restoration of unsafe legacy fallback. Genuine independent work can continue; a different task/profile/common-Git worktree is not an escape hatch.

## Follow-through and supersession

No architecture-shaping question remains in the accepted review basis. Exact implementation details, eligible checkout choice, deployment evidence and future profile expansion remain with their named owners and later gates. Do not invent implementation tasks as already released or use this ADR to close broader strategic work.

This records RFC03 as the durable basis after attempts624/625 required revision and attempt626 found it ready. It does not edit or erase those artifacts, supersede existing candidate/ASC/AK incident policies, or retroactively certify any earlier launch. Future changes to assurance, lifecycle, source-owner allocation, confinement, provider fidelity or custody require explicit impact assessment and the existing decision membrane.
