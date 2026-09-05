---
summary: "Open RFC for visible task-session authority assurance and fail-closed Pi startup; owner decisions and review required before executable admission."
read_when:
  - "Reviewing the authorized architecture decision for task-authority assurance and fail-closed Pi startup."
  - "Choosing whether task workers retain asserted-local claim semantics or require a new delegated-authority contract."
type: "rfc"
task_id: 5435
status: "open_for_owner_input_not_ready_for_adr"
---

# RFC: Task-authority assurance and fail-closed Pi startup

## Authorization and current posture

The operator authorized opening the architecture decision covering task-authority assurance and fail-closed Pi startup after the [design](2026-09-05-visible-task-session-design.md), [independent design review](2026-09-05-visible-task-session-review.md) and [G1/G2 decision-input investigation](2026-09-05-visible-task-session-decision-inputs.md). This RFC carries that exact concern; it does not authorize ADR acceptance, runtime implementation, installation, task transfer, candidate admission or activation.

AK packet85 is the design identity. Task5435 supplies decision-support work after task5434's design-only completion. AK owns the decision ID/state and its passport. This file is the RFC body, not a state store. The current SF7/IW8/task4165 execution path remains unrelated and unchanged.

This is an **open proposal with material owner questions**, not a review-ready or accepted implementation contract. Opening the RFC is legal before its questions are resolved; closing review as ready-for-ADR is not. Earlier design-review passes do not review or approve this new RFC revision.

## Problem brief

An operator wants harnessed LLMs to launch a fresh, explicitly selected Pi task session in a visible Ghostty window, then know which task/session actually started. A reusable shared launcher and discovery skill should remove ad hoc shell duplication, preserve draft text and avoid duplicate workers after missing acknowledgements or lease rollover.

The initial design demanded stronger executable-task admission than current owner APIs establish. The approved AK pin supports atomic claimability with asserted-local actor identity, not authenticated requester-to-child delegation. Pi offers awaited input/lifecycle seams, but ordinary handler exceptions and missing handlers are not fail-closed task-start barriers. Copying the prior shell script or treating an ACK/live lease as authorization would hide this mismatch.

The architecture decision must determine the actual assurance contract and a mandatory startup path, not merely rename those existing primitives as safe delegation. It must also avoid building an unnecessary universal identity service for a local workstation use case.

## Evidence and fixed inputs

- [Discovery packet84](2026-09-05-visible-task-session-discovery.md): prior lane script, little-helpers transport, capability-discovery miss, fleet overlap and owner classification.
- [Design packet85](2026-09-05-visible-task-session-design.md): ConOps, N1–N4/C1–C4, R1–R8, B1–B11 and distinct V1–V7/U1–U3 commitments.
- [Design review](2026-09-05-visible-task-session-review.md): four material findings resolved in design, not code. AK evidence8333 anchors that stage.
- [Decision inputs](2026-09-05-visible-task-session-decision-inputs.md): exact source hash inventory; approved AK pin `cdeef5bfedcb1b19ee18921008f876ecd05eb8ca`; installed Pi 0.84.4 source; G2 production-exec-port caveat. AK evidence8334 anchors source investigation.
- Source-input artifact SHA-256: `a28d5f5e1a25abe75d957f03ec8681a69df00f776c031e9dbf92646fd3642868`.
- Reviewed design SHA-256: `82029ff772f54386c915d84d5691ac59baa4f28338f56f2bd0f2327ea6a79baa`.

Pinned code, current worktree, installed package and live runtime facts must remain separate. No task-authority transfer or feature launch experiment has validated this RFC. Renew owner readbacks before review or affected use; old hashes prove old source identity, not permanent currentness.

## Decision scope and owner boundaries

This is a cross-repo concern with its RFC and coordination in pi-extensions. Cross-repo decision capture is not cross-repo mutation authority.

| Concern | Owner / legal boundary |
|---|---|
| Task lifecycle, claimant assurance and accepted delegation semantics | Agent Kernel task/claim owner. Current asserted-local/no-delegation contract remains controlling until separately changed through its owner process. |
| Mandatory startup ordering and task-message/model admission | Pi runtime owner and its authorized integration adapter. Extension documentation alone cannot establish exclusive startup enforcement. |
| Shared visible transport, effect correlation and operational exclusion | Little-helpers. Terminal admission is not task authorization. Exclusion state cannot issue new grants. |
| AI Society task-adapter composition | Pi-society-orchestrator proposal, subject to review. Consume owner facts through the approved AK gate; no direct database or cloned claim protocol. |
| Standing agents and candidate workspaces | Agent-registry tasks5133/5134 and candidate lifecycle-v2 under Decisions59/63. Do not reassign, unblock or bypass them. |
| Skill discovery and lane compatibility | Package/discovery owners plus the owned lane. Separate owner tasks are required before migration; no unsafe fallback recipe. |
| Unsolicited editor-prefill repair | Existing task5432. This RFC forbids editor-based launch delivery but does not absorb that repair. |

Decisions59/63 and AK task-composition assurance boundaries are constraints, not approvals for this proposal. This RFC must not supersede Decision140 or activate the direction-controller/supervisor by implication.

## Assurance alternatives requiring owner adjudication

### A. Authenticated delegated task workers

Bind requester and child identity/incarnation, exact task/repo/scope/version, permitted transition and existing claimant disposition through an accepted owner contract. Define atomic delegation/admission/revalidation, replay/revocation and old-worker fencing or explicitly bounded overlap. This can support a parent-held task transferred/delegated to another session without relying on a self-asserted actor name.

**Cost and gate:** current AK v1 does not provide this model. It needs owner review and potentially owner implementation before executable use. No launch-local token may silently create the missing authority. No hosted/multi-tenant assurance follows merely from a private local file.

### B. Explicit trusted-local, non-delegating workers

Keep AK's current asserted-local assurance, a trusted single-user workstation and new claimable tasks. Do not support parent-held task transfer or claim authenticated delegation. Use the normal atomic owner claimability checks, exact task scope, explicit operator launch intent and unresolved-attempt exclusion. Model the local actor string honestly; no authentication upgrade is implied.

**Cost and gate:** this is a deliberate requirement/ConOps revision, not an equivalent implementation of A. Owners must decide whether it satisfies the intended operator need and what deterministic startup admission can actually enforce. Revalidate R4 and dependent acceptance/security claims. A new lease cannot reconcile a surviving old worker, and local trust is not a filesystem sandbox.

### C. Preparation/inspection only while authority remains unresolved

Expose planning or inspection without releasing a runnable task prompt. Preserve full launch ambition and record the gate rather than claiming a safe executable worker.

**Cost and gate:** safe holding posture, but not fulfillment of the requested end-to-end task-launch outcome. It must not be sold as a completed launcher or permanent automatic scope reduction.

**Proposed decision posture:** retain A and B as explicit owner-adjudicated alternatives and C as the no-false-claim holding state. Do not choose stronger infrastructure solely because the design used the word authenticated; do not choose weaker assurance solely to avoid owner work. Need satisfaction, failure consequences and current trust boundaries decide. No alternative is accepted by opening this RFC.

## Common startup contract, independent of assurance choice

1. Resolve trusted installed runtime/package identities, exact task/cwd/model selection and intended owner admission route before dispatch. Plan/readback is not execution permission.
2. Require the designated bootstrap/admission path to be loaded and initialized. Missing handler, thrown exception, denied/unavailable owner readback or uncertain initialization must withhold task-model execution, not log-and-continue.
3. Specify the order: deterministic child identity/incarnation -> owner admission/revalidation -> sole task-message admission -> task-model execution. Do not use an LLM bootstrap prompt plus a second queued task prompt.
4. Cover command-shaped initial input, extension commands that bypass ordinary input, other extensions initiating turns and post-gate transformations. Define which trusted startup effects are allowed before admission. “Before model use” does not mean “before any extension reads the message.”
5. Bind the task payload and its transformations to the admitted baseline. Preserve exact prompt provenance without exposing private bodies in ordinary diagnostics. An admitted original hash does not authorize a later different task message.
6. Preserve editor drafts. No clipboard, keystroke automation or editor prefill/fallback sends may implement launch delivery.
7. Preserve task-workspace operational exclusion across callers, profiles, aliases and authorization generations until owner disposition establishes quiescence/fencing or safe overlap. Missing ACK, process/window disappearance or lease expiry is not that proof.
8. Distinguish command admission, child identity, ACK/FINAL communication, owner task state and actual effects. Watch cancellation cancels observation only. Indeterminate launch effects never cause automatic relaunch.

Current `session_start`, `input` and `before_agent_start` behavior does not by itself prove these requirements. Whether realization belongs in a required extension adapter, a host lifecycle seam or a combination is a material owner decision. No “catch an exception” implementation may be called fail-closed unless the host's subsequent control flow is actually blocked.

## G2 allocation carried into this RFC

Keep one little-helpers transport implementation. Give it explicit production exec/model/thinking, parent-cwd/context and placement/provenance ports. Pi and CLI adapters consume the same source; emit package-owned Node ESM JavaScript for the CLI/core with explicit dependency closure, relative import rewriting, bin/exports/files coverage and installed artifact proof. No new package/daemon is justified by the present source evidence.

Today's `options.exec` is partly a test-override discriminator: its presence changes ancestor discovery, detached-handshake routing, staggering and placement observation. Production CLI ports must not inherit those shortcuts. Keep test intent explicit and preserve the internal controller-tab-only ASC observer path. Do not expose its arbitrary-command seam as a public shell-command API. Preserve provenance-owner calls and candidate-owner admission.

G2 is a coherent design allocation, not a working packed export. G2-P1 and V2/V5/V6 tests from the decision inputs/design remain required at their lawful implementation/affected-use stages.

## Material review questions / finding seeds

These stable local IDs seed the RFC finding inventory; they are not already closed review findings.

| ID | Question / required disposition | Owner |
|---|---|---|
| AUTH-01 | Which assurance model satisfies the actual local operator need: A, B or a justified composition? State excluded users/threats and required claim changes. | Operator + AK task owner + Pi integration |
| AUTH-02 | What exact owner contract binds requester/child/task and handles current claimant, stale versions, revocation and surviving old effects? For B explicitly prohibit transfer and authentication claims. | AK task/claim owner |
| BOOT-01 | Which mandatory hook/host boundary guarantees admission failure cannot reach task-model execution, including absent/throwing handler and command-shaped input? | Pi runtime owner |
| BOOT-02 | Which startup effects, extensions and transformations are trusted/allowed, and how are other initial turns denied or admitted? | Pi runtime + integration/security owner |
| EXCL-01 | What stable canonical namespace and atomic task/workspace reservation cover different callers/versions/aliases without becoming task authority? How are candidate-owner locks composed without deadlock or bypass? | Little-helpers + task/candidate owners |
| PKG-01 | Ratify explicit production ports and same-source emitted-JS packaging; require production exec parity rather than test-stub success. | Little-helpers/package owner |
| MIG-01 | Which legacy options are retained/refused, who owns lane migration and how does withdrawal avoid unsafe direct-spawn fallback? | Lane/package owners |

Until material questions are resolved and the exact revised RFC is verified/reviewed, legal outcome cannot be ready-for-ADR. No review outcome is authored merely by listing these questions.

## Verification and validation commitments

Reuse design R1–R8 and B1–B11 rather than creating another requirements inventory. AUTH-01 changes must explicitly identify impacted needs/requirements, their revised or retained assurance and new V&V applicability. Preserve old failed findings and source generations.

Before RFC review closure: source-owned assurance/startup contracts, falsifiable denial/error/replay narratives, explicit trust model and implementation-owner allocation; inspect actual source control flow and obtain required owner dispositions. Record runtime proof as not executed or stage-not-applicable where lawful, never as a synthetic pass.

Before executable affected use: independent negative fixtures plus actual installed-artifact and live Ghostty/Pi canaries for denied/missing/throwing startup, task drift, command input, post-gate transformation, duplicate cross-profile/generation workers, lost response, observer policy, one-message delivery and unchanged draft. A stub sharing the implementation's assumption is not an independent oracle. Actual task authority and installed runtime identities must bind the evidence.

Validation separately asks whether representative operators and fresh-context agents can find the entrypoint, start the intended task/model and understand an indeterminate result without manual script construction or duplicate work. The operator and relevant owners accept their own outcomes; neither task completion nor a review memo grants that acceptance.

## Review, rollout and rollback boundaries

Opening scope is limited to RFC/decision capture and decision-support analysis/review. Preserve exact revision hashes for any governed review attempt. Use the existing AK decision passport and strict convergence cycle: exact-hash review -> finding inventory -> dispositions -> verification -> fresh review, with stall/loop bounds. Do not attach the earlier design review as this RFC's legal review closure.

After a lawful accepted ADR, author implementation and validation/rollout/rollback plans plus exact owner task scopes before executing. No automatic cross-repo fanout, owner route dispatch, task-identity change, startup hook install, candidate admission, live launch or fleet enablement occurs from this RFC.

If rejected or blocked, keep the preparation-only holding posture; do not convert old script behavior into an accepted fallback. Future rollout must support stopping new admission without deleting unresolved attempt history, killing workers or releasing task/candidate authority as an assumed rollback.
