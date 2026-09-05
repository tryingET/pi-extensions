---
summary: "Immutable first current-track RFC review for Decision151: revise_rfc with seven material authority/startup/exclusion/packaging/migration findings."
read_when:
  - "Revising Decision151 after its first exact-hash RFC review."
  - "Checking which findings must be disposed before a new review or ADR readiness."
type: "review_memo"
task_id: 5445
status: "immutable_review_attempt"
---

# Decision151 — RFC review attempt 01

The following is the independent reviewer result, persisted without changing its verdict or finding dispositions. Reviewer communication: `95151c44-37c6-47f4-99fb-42efad01886b`; peer run `scoutpeer-mtotmev9-9c33310a`. This document does not claim its own AK attachment occurred; current decision state is read from the AK passport.

## Review chain status
- review kind: Tier 1 pre-ADR review attempt
- reviewed artifact: docs/project/2026-09-05-visible-task-session-authority-startup-rfc.md (RFC below), Decision151, task5445, attempt01/current_track.
- exact identity: git 6343e5c8c5750acce2a758c3d5e04e02f8ae0949; SHA256 e6a7bde8460c8e24c4cec877019879d28394a5571607b7d0103cb2029c5c1dc0. Independently matched working-file hash at start and end and committed blob hash at end. HEAD matched at start/end.
- reviewer: spawned read-only scout peer, session 01a07334-e77d-76e8-8de2-0a53786de4a2; PI_MODEL=gpt-6-astra (environment-observed identifier; provider not independently established). Outer host Pi. System4D off. Exactly three lenses, one reviewer, no parallel synthesis.
- procedure: independently retrieved Prompt Vault layer12-070-decision-rfc-review and checked text_ok; registry_id a5920542375bf4e3c6f09b22c081b8cff29cad5f73da592ad43c9cde8ad57917.
- supporting docs read completely: dated review-01 plan, decision-inputs, design, prior design review, discovery; governance-kernel docs/dev/decision-lifecycle.md and review-synthesis.v6.toml; agent-kernel docs/project/decision-runtime-and-roadmap.md, layer-12-protocol.md, and 2026-03-21-first-live-multi-lane-rfc-review-process.md. Also read pi-extensions-operator skill; ancestor instructions were injected.
- required lifecycle artifacts present: documentary problem/evidence/design/RFC chain, exact-candidate review plan, available governed procedure, canonical lifecycle/topology/runtime/protocol documents. Canonical governance and AK docs were independently confirmed Git-tracked with git ls-files --error-unmatch.
- missing or unclear lifecycle artifacts: current AK attachment/passport facts are controller-supplied, not independently queried. Parent reports cross_repo/review_pending/bootstrap_single_track, task5445 decision_support claimed by parent, and no outcome/ADR/legal closure. This immutable memo/inventory still needs parent persistence and lawful attachment. Owner assurance/startup dispositions remain missing from the candidate. Post-ADR plans are future-stage obligations, not documents demanded now.
- ADR legal now?: no
- reason: material architecture questions remain; no recorded controlling ready_for_adr closure is established. Under the reported bootstrap_single_track policy, this current-track memo can become the controlling review after lawful attachment; an extra review lane or synthetic synthesis ceremony is not required.

## Overall verdict
- revise before ADR
- The operator problem and shared-package direction are credible, but this candidate specifies an unresolved choice of authority models and desired startup invariants rather than a selected, owner-disposed, testable admission contract. This is a useful initial review, not grounds to reject the whole direction.

## Lens 1 — Task authority/assurance
- strengths: distinguishes atomic asserted-local claimability from authentication/delegation; preserves AK/candidate/provenance ownership; offers a genuinely weaker non-delegating alternative without pretending equivalence; correctly refuses lease/ACK-based recovery.
- risks: the stated operator need is to start an explicitly selected task/model visibly, not necessarily transfer a parent-held task. Authenticated delegation could become unjustified infrastructure. Conversely, choosing B without revising the inherited authenticated-admission claims would silently weaken the contract.
- must-fix issues: AUTH-01 and AUTH-02. Establish need-to-assurance fit first, then the exact owner route and claimant/failure disposition for that choice. Existing owner operations plus explicit operator recovery may suffice for B; no universal identity service or new permit system is implied.
- evidence quality: strong documentary evidence of the problem and pinned assurance limits; insufficient evidence that A is necessary or B is stakeholder-accepted. Underlying source findings are attributed to decision-inputs, not independently rerun code or live authority proof in this review.

## Lens 2 — Startup/message-admission semantics
- strengths: explicitly covers absent/throwing handlers, command-shaped input, other turn initiators, post-gate transforms, privacy exposure, sole-message delivery and draft preservation; does not mistake awaited hooks for exclusive enforcement.
- risks: the common contract is presently a set of invariants, not an allocated mandatory host/adapter state machine. A correctly refusing extension cannot establish exclusivity when another path bypasses it. Private payload confidentiality is separate from stopping model execution.
- must-fix issues: BOOT-01 and BOOT-02. Name the supported launch boundary, trusted startup set, and exact denial/transform behavior. Define what happens after child claim but before message admission fails. Scope guarantees to the supported path and declared trusted extensions rather than implying same-UID sandboxing.
- evidence quality: the supporting source investigation supplies concrete counterexamples to current hook-only enforcement. No selected replacement contract or live proof exists. Runtime canaries are appropriately deferred until authorized affected use; lack of those canaries is not itself a pre-ADR failure.

## Lens 3 — Packaging/operability and V&V
- strengths: one little-helpers implementation with explicit ports and emitted Node ESM is proportionate; no new daemon/package is justified. G2-P1 correctly distinguishes production exec from test-injection shortcuts. Requirements trace to separate V1–V7 verification and U1–U3 intended-use validation. Durable unresolved-attempt history and no automatic relaunch are sound.
- risks: canonical operational namespace/recovery/lock composition are still unallocated; a generic task/workspace-key phrase can conceal overlap or deadlock mistakes. Legacy interactive-versus-multi-task-print compatibility remains undecided. Test stubs or source manifests cannot certify packed/live behavior.
- must-fix issues: EXCL-01, PKG-01 and MIG-01, with their stage distinctions below. Do not reopen the already supported same-package allocation merely to manufacture work, and do not require shipping the package to justify the RFC.
- evidence quality: strong design-stage allocation and falsifiable planned tests; no packed export, CLI parity, live Ghostty launch, transfer or discovery validation was executed or inferred.

## Cross-cutting contradictions
- AUTH-01: B is a legitimate RFC alternative, but the imported design still requires owner-authenticated admission/handoff (design Admission and workspace safety, especially items 3–5). An explicit requirement applicability delta is needed; a passing old design review cannot prove B's revised security claim.
- BOOT-01/BOOT-02: fail-closed mandatory startup is required while its enforcing owner boundary and trusted extension/transform set remain undecided. This is an acknowledged unresolved dependency, not a claim that the RFC falsely reports implementation.
- EXCL-01/AUTH-02: a new claim or generation may be legally admissible while old effects remain operationally unresolved. Authority and exclusion must both pass; neither may clear the other by implication.
- MIG-01: the design's G3 gates lane replacement, not design capture; the RFC leaves migration as a material question. Resolve it through an explicit compatibility decision or explicit first-release exclusion rather than dragging all legacy migration into a new pre-ADR implementation programme.

## Must-fix before ADR
Stable inventory below is scoped to the exact RFC hash above and this attempt. All seven items are OPEN; severity means impact on the proposed contract, not an observed production incident. Existing seed IDs are retained rather than creating a duplicate taxonomy. Source abbreviations: RFC = primary RFC; D = docs/project/2026-09-05-visible-task-session-design.md; I = docs/project/2026-09-05-visible-task-session-decision-inputs.md; Discovery = docs/project/2026-09-05-visible-task-session-discovery.md. Dependencies describe resolution order, not additional review tracks.

1. AUTH-01 — HIGH; architecture-shaping open question / requirement sufficiency.
   Sources: RFC lines 21–27, 56–76, 105, 117; D ConOps and R4; Discovery Problem and stakeholder evidence.
   Counterexample: an operator wants a fresh worker for an unclaimed task in one trusted account; requiring authenticated parent-to-child delegation would block that useful flow despite no parent claim needing transfer. Conversely, choosing B for a parent-held task cannot satisfy that transfer request.
   Dependencies: none; upstream of AUTH-02 and affected R4/B5/V4/U3 claims.
   Required owner disposition: operator + AK task owner + Pi integration select a proposed first-use assurance model with explicit included/excluded use cases and threats. State whether parent-held transfer is actually required and why. Record the impact on inherited requirements and acceptance claims. Reviewer recommendation: evaluate B against the actual local task-launch use case first; select A only if the unmet need/failure consequences warrant it. This is not acceptance of B.

2. AUTH-02 — HIGH; must-fix owner admission/recovery contract.
   Sources: RFC lines 58–68, 81–86, 106; I G1 existing task APIs, especially lines 25–32; D Admission and workspace safety.
   Counterexample: another permitted caller supplies the same allowed actor string; atomic claimability still does not authenticate that caller. Or the child claims successfully, then task-message admission fails: blindly unclaiming/relaunching may discard unresolved effects, while leaving every claim unexplained makes recovery unusable.
   Dependencies: AUTH-01; coordinate with EXCL-01 and the BOOT-01 failure boundary.
   Required owner disposition: AK task/claim owner pins exact owner operations, identity assurance, admission inputs/freshness and claimant/failure disposition. For B, expressly refuse parent-held transfer and authentication claims; do not demand A's attestation machinery under another name. For A, specify accepted transfer/replay/revocation/fencing semantics or keep executable use blocked. Identify evidence and the existing owner action that resolves a failed/indeterminate child without a launch-local authority grant.

3. BOOT-01 — HIGH; must-fix exclusive startup enforcement allocation.
   Sources: RFC lines 78–89, 107, 119; I lines 34–45.
   Counterexample: the required input handler is missing or throws, ordinary processing continues; alternatively a command-shaped initial payload takes the pre-input extension-command path. Awaiting session_start or catching inside an optional handler does not make either path fail-closed.
   Dependencies: AUTH-01/02 determine the admission predicate; BOOT-02 defines the allowed effect/transform boundary. Resolve these as a coupled contract where needed, not through parallel legal closures.
   Required owner disposition: Pi runtime owner chooses the mandatory host/adapter seam and specifies initialization, missing/throwing handler, denial/unavailable readback, command dispatch and other-turn initiation behavior. Supply source-controlled control-flow reasoning and falsifiable negative narratives for the chosen path. A trusted, constrained launch profile is a possible bounded choice, not a proved implementation or universal runtime restriction.

4. BOOT-02 — HIGH; architecture-shaping trust and payload-integrity question.
   Sources: RFC lines 82–86, 108, 119–121; I lines 39–45; D R3/B3/V3.
   Counterexample: the owner admits hash H, then another extension transforms the task into H2 or initiates an independent model turn. Blocking the main initial message does not block that turn; checking H does not authorize H2. An extension may also read the private payload before model admission.
   Dependencies: BOOT-01's enforcing seam; AUTH-02's admitted baseline.
   Required owner disposition: Pi runtime + integration/security owners define trusted installed startup resources and allowable pre-admission effects, task-message exposure, transformations and secondary turn sources. Choose rejection or bounded revalidation for changed effective payloads; distinguish task-intent bytes from permitted contextual expansion. State exact observable denial outcomes and privacy limits. No same-UID filesystem sandbox claim.

5. EXCL-01 — HIGH; must-fix operational safety/liveness allocation.
   Sources: RFC lines 85–87, 109; D lines 119–127 and B7/B8/V5.
   Counterexample: generation A survives a lost response, generation B obtains a valid new lease, and B dispatches while delayed A still runs. Separately, different task IDs touching the same checkout can evade a tuple-only (task,workspace) lock unless shared-workspace conflict admission actually arbitrates them. Acquiring candidate and launch locks in opposite order can deadlock.
   Dependencies: AUTH-02 recovery facts; independent of requiring authenticated delegation.
   Required owner disposition: little-helpers + task/candidate owners name canonical namespace provisioning/version compatibility, exact exclusion/conflict key semantics, durable reservation/recovery facts and lock composition/order (or an allocation avoiding nested locks). Define a usable owner-disposition route for quiescence/fencing or explicit bounded overlap; age/lease/window absence is insufficient. This is a specification of the existing operational requirement, not permission to invent a second task database.

6. PKG-01 — MEDIUM; material owner-ratification / verification applicability question, not a newly found packaging defect.
   Sources: RFC lines 91–97, 110, 119–121; I lines 47–63, especially G2-P1.
   Counterexample: a real CLI adapter supplies options.exec and accidentally inherits test shortcuts, skipping detached handshake/ancestor/placement policy while stub parity tests pass. A TypeScript source import can work in development while packed Node ESM lacks emitted relative-import dependencies.
   Dependencies: none for same-package allocation; BOOT-01 for integration boundary and installed-use proof.
   Required owner disposition: little-helpers/package owner ratifies the explicit production-versus-test ports and same-source emitted-JS public boundary; retain G2-P1, installed dependency closure and observer-policy oracles in the implementation/affected-use gate. Existing allocation is substantively coherent. No pre-ADR install, export implementation or live canary is required to close this design-level item.

7. MIG-01 — MEDIUM; material compatibility/rollout-boundary question.
   Sources: RFC lines 111, 125–131; D G3 and B11/V7; Discovery Inspected surfaces, lane script row.
   Counterexample: a legacy multi-task print caller silently gets interactive task windows, or disabling the new CLI causes the old lane script to resume direct background Ghostty spawning without exclusion/startup admission.
   Dependencies: AUTH-01 and BOOT-01 determine supported launch semantics; EXCL-01 determines coexistence safety.
   Required owner disposition: lane/package owners choose retained/refused options and migration/withdrawal behavior, or explicitly exclude legacy replacement from the first accepted allocation and pin the separate owner gate before migration. Define coexistence and fail-without-fallback behavior. A separate migration task after ADR can carry implementation detail; do not require migrating the lane during RFC review.

## Nice-to-have improvements
- Non-material editorial improvement: one compact reader-facing example contrasting 'fresh claimable task', 'parent-held task refused under B', and 'indeterminate prior attempt: inspect, do not relaunch'. Derive it from owner decisions; do not add another requirements inventory or authority store.

## Questions reviewers should force the authors to answer
- Which actual operator use case fails without authenticated delegation, rather than simply lacking a discoverable shared launcher?
- What exact owner-controlled path stops every supported initial/secondary task turn when admission is absent, throwing, denied or unavailable?
- If claim succeeds but message release fails, what facts remain and which owner can lawfully recover without assuming the worker is quiescent?
- How are different task IDs sharing one checkout arbitrated, and how are candidate locks composed?
- Is legacy migration part of the first release or explicitly separate, and what prevents unsafe fallback during coexistence/withdrawal?

## Workflow result
- review_outcome: revise_rfc
- next legal move: revise_rfc
- controlling rationale:
  - The direction remains viable; the exact local need does not yet justify mandating A, and B must not inherit A's assurance claims unchanged.
  - A mandatory, owner-allocated startup/message boundary and operational recovery contract remain material architecture questions.
  - Packaging is coherently allocated; proof stages must remain honest rather than requiring implementation before decision closure.
  - Parent must preserve this exact review and inventory, obtain finding-level dispositions, verify the changed candidate, then admit a fresh exact-hash review.
- missing artifacts or gates:
  - Parent persistence/content addressing and lawful current-track AK attachment/passport readback; no such mutation was performed by this reviewer.
  - AUTH/BOOT/EXCL owner decisions and explicit PKG/MIG dispositions against the revised source baseline.
  - Exact revised-candidate verification receipt and fresh review; maximum four convergence loops, unchanged/unverified repeat is not progress; escalate a real stall.
- notes on legality vs quality:
  - Parent's supplied bootstrap_single_track state is not upgraded into independently queried runtime truth. v6's general synthesis posture does not require inventing a parallel review set for this single-track attempt.
  - Historical design passes concern old design-stage claims, not this RFC's legal closure. Preparing this memo does not accept an ADR, authorize implementation, release tasks or certify runtime behavior.
  - Source freshness/owner currentness must be renewed before closing the relevant findings. The pinned task-source investigation is evidence of that pin, not a live AK capability certification.

## Final recommendation
- request another RFC revision round
- First concrete controller action: persist this exact memo and content-addressed inventory and attach/read back through the existing authorized AK route; then obtain AUTH-01's narrowly framed operator/owner choice before revising dependent claims. Do not launch a feature experiment to answer that policy choice.
- Expected impact: a smaller, honest and testable local launch contract without either unnecessary identity infrastructure or hidden authentication/startup overclaims.
- Risks/rollback: owner choice may retain A and require separate owner work; that is an explicit dependency, not grounds to relabel B. Keep preparation-only as a disclosed holding state, not fulfillment. No reviewer changes need rollback. Future withdrawal stops new admission while preserving unresolved records and owner task/candidate authority.
- What not to try again: unchanged-hash re-review as progress; optional hook exceptions as fail-closed proof; asserted actor strings or ACK/lease as authenticated delegation; per-profile/per-request or lease-generation-only exclusion; real exec disguised as a test override; unsafe direct-spawn/editor-prefill fallback.
- Evidence/DoD: complete RFC and named supporting/lifecycle reads; read-only sha256sum, git rev-parse, git show <frozen-commit>:<RFC> | sha256sum, bounded nl/grep references, Git-tracked checks, and selected PI session/model environment observations. I hash a28d5f5e1a25abe75d957f03ec8681a69df00f776c031e9dbf92646fd3642868 and D hash 82029ff772f54386c915d84d5691ac59baa4f28338f56f2bd0f2327ea6a79baa independently match the RFC. No AK/DB commands, task claims, file/code edits, installs, credentials, feature launches, provider experiments or owner actions. Exactly three lenses and one normalized outcome. RFC unchanged at start/end. Stopping after this PEER_FINAL.
