---
summary: "Proposal: explicitly admitted target-root SCI workers inside one controller, retaining immutable per-worker repository boundaries and actionable production failures."
read_when:
  - "Reviewing task5440 or admitting a phased multi-repository SCI implementation."
  - "Changing SCI target selection, worker lifecycle, or repository-bound evidence."
type: "design"
system4d:
  container: "Private trusted-local Pi SCI companion; isolated producer workers, not a new supervisor or global workspace service."
  compass: "Make ordinary multi-repo controller work useful without weakening source identity, instruction scope, or operator consent."
  engine: "Explicit target admission -> bounded lazy worker -> immutable request binding -> SCI composite -> scoped result or actionable refusal."
  fog: "Proposal only; Decision145 currently prohibits multi-workspace selection. Worker identity is not authority and read workflows can create contained runtime state."
---

# RFC: phased target-root SCI orchestration

## Status and decision boundary

**Proposed under AK task5440 and Decision152; not accepted or implemented.** Native review/acceptance remains required. The operator requested an executable phased wave, not removal of safety boundaries. Task5438 repairs producer public errors; task5439 repairs companion error feedback. Those repairs do not authorize the target-routing implementation proposed here.

Current gated Decision145 passport readback on 2026-09-05: accepted outcome, unblocked state, ADR-0007 recorded, but linked-task reevaluation and KES obligations remain pending. They are not silently reconciled by this work. The existing [companion NEXUS evidence](2026-09-02-ak-5245-nexus-companion-evidence.md) documents a successful single-repository installed profile, not multi-repository readiness. Producer [ADR-0007](../../../../../semantic-code-intelligence/docs/adr/0007-pi-composite-nexus-v1.md) is the controlling documentary boundary.

This proposal would permit **explicitly admitted independent workers**, while retaining the prohibition on rebinding an existing worker. No cross-root path is passed to one producer. Current Decision145 behavior remains the default until a new owner decision and separately scoped implementation/activation gates permit this extension.

## Problem and source-grounded cause

A controller session rooted in `softwareco/owned` legitimately reasons about several independently rooted child repos. Its single current SCI worker cannot lawfully interpret their files. Existing `assertPathInWorkspaceRepository` rejects nested Git boundaries. Three current-session paths reproduced two `workspace_ref_mismatch` results and one `workspace_path_unresolved` result (the last supplied file did not exist). The original live logs show a successful NEXUS handshake followed by unsuccessful queries; startup failure is not the demonstrated cause.

Local normal-mode producer-to-companion reproduction found a separate contract defect: `workspaceReferenceError` constructs NEXUS reason data, but `publicCoreErrorData` recognizes only the older `outside_workspace` case, and `handleAdapterError` removes other data outside DEBUG/test mode. Companion classification then cannot recover the reason. Its renderer additionally assumes success metadata and JSON model text, hiding plain-text failures in both collapsed and expanded views. Tasks5438/5439 own those repairs; global debug output is not a remedy.

Relevant existing implementation surfaces:

- Companion `src/mcp-bridge.ts`: lazy stdio connection, schema check, NEXUS handshake, immutable `pinnedCwd`, and a non-terminal close path with a statically identified late-startup publication race; currently one connection/workspace per bridge.
- Companion `src/nexus-workspace.ts`: opaque reference validation, injection, single-workspace session restoration; IDs are lineage, not grants.
- Companion `src/extension.ts`: native tools, Pi context binding and operator/model result separation.
- Companion `src/sci-error-projection.ts` / `src/explore-renderer.ts`: bounded public failures and display; task5439 owns initial repair.
- SCI `src/core/workspace-binding.ts`, `workspace-path.ts`, `workspace-state.ts`: final identity, realpath/descriptor, nested-repository and source-state boundaries. Preserve rather than duplicate their semantic implementation.
- Existing Pi target-root peer launch and context-packer repo-bounded instruction projection remain owning host surfaces. Neither needs a second LLM conversation for a deterministic SCI request in the proposed steady state.

## Purpose, ConOps and scope

The operator keeps one controller conversation open while examining a named set of trusted local repositories. They explicitly admit intended analysis targets. The controller can issue a composite query against repository A, then B, without restarting the conversation or starting a new LLM executor for each symbol. Concurrent requests remain attached to the target selected at dispatch. The operator can see which target a result describes, remove an idle target or revoke future access, and distinguish a refusal from service failure.

Needs: correct source identity, useful failure recovery, low interaction/context overhead, bounded resources and preservation of repository instructions and owner authority. Excluded uses: automatic filesystem discovery, arbitrary root arguments, cross-repo rename/apply, hosted/multi-user operation, network service exposure, global indexes and new task/evidence/permission stores.

Read/navigation means no source-tree application and no caller-selected validation commands. It does **not** mean byte-preserving filesystem behavior: producer startup/queries may create contained `.ontology` state. Admission must disclose that local effect and respect owner-denied locations. Pure capability/status inspection must not start a producer or create its state.

## Alternatives and recommendation

| Alternative | Judgment |
|---|---|
| Disable SCI or always fall back to raw search | Loses semantic value and never repairs production feedback. |
| One whole-workspace producer | Wrong identity/safety model; unnecessary hashing, indexing and unrelated-change coupling. |
| Mutate the current bridge's root on each call | Reject: async races, snapshot confusion and silent authority/context change. |
| Full target-root LLM peer for each lookup | Supported immediate workaround, poor steady-state context/latency cost; reuse existing peers when needed today. |
| Global workspace broker/registry | Reject for this scope: extra durable state and operational/authority burden. |
| Explicit session-local targets, separate immutable producer workers | **Recommend.** Reuse the existing bridge per target and add narrow host-owned selection/lifecycle plumbing. |

## Proposed contract

### 1. Explicit admission, not root inference

The concrete initial host seam is registered `/sci-target admit <path>` (plus `list` and `revoke <selector>`), with `ctx.mode === "tui"`, `ctx.waitForIdle()`, and **actual explicit TUI confirmation**. A registered command is not proof of human-origin invocation: Pi permits extension-command expansion via `sendUserMessage(..., {expandPromptTemplates:true})`, and its input event occurs after command expansion. Therefore the handler grants nothing from command text/source inference; even programmatic invocation must reach a fresh explicit confirmation dialog showing the exact resolved target, scope and effects. No auto-confirm/context flag, model-callable grant tool or noninteractive grant path exists. RPC/print/JSON/unknown modes refuse admission. This is a trusted-local interactive-consent boundary, not authentication against hostile extensions or same-UID code.

V1 admits only the default root or an explicitly named Git working-tree root whose canonical parent is the controller's canonical session cwd. This serves the observed lane-root controller and its independently rooted child repos while retaining the same loaded ancestor context. The operator must additionally confirm target trust and same-company scope explicitly; `ctx.isProjectTrusted` covers only the current Pi project and cannot attest the target. Other topology, external symlink targets, company changes, ambiguous/missing roots and unsupported worktree identity fail closed. Broader same-company/cross-lane or cross-company admission is deferred until the existing host provenance/instruction owner provides a reviewed seam. This is not root autodiscovery or a hard-coded company path.

Instruction projection uses the public package-root export `buildContextPacket` from `@tryinget/pi-context-packer` (`package.json#exports["."]`, implemented in `src/context-pack.js`), not copied loader code or a private module import. Request `agents=required`, all other providers off, explicit target `cwd`/`repoRoot`, and an abort signal. **The current API is insufficient for admission:** `ok:true` can coexist with omissions, and `findAgentFiles` currently catches all stat failures as absence. An additive context-packer-owned completeness contract is an explicit implementation prerequisite in this same wave; no consumer scanner or optimistic `ok` check may substitute.

Required proposed coverage receipt `pi.context-instruction-coverage.v1`: host-only canonical root/context-directory identity, ordered selected instruction files with content digests, consulted higher-priority candidate paths whose absence was confirmed, a dependency digest, bounded errors/omissions and `complete` boolean. Only ENOENT establishes absence; existing nonregular higher-priority candidates (including directories and unsupported symlinks), other stat/read failures, descriptor drift, truncation, redaction that prevents complete instruction review, unsupported roots or unclassified omissions force complete=false rather than falling through to a lower-priority file. Preserve Pi's first-matching-file priority per directory. No system/above-repo files are claimed covered by this provider. Default generic packet behavior can remain compatible; the strict receipt must be requested explicitly and tested by its owner. The SCI companion requires this exact supported receipt and complete=true, never just packet.ok. Missing support yields `instruction_context_unavailable` without worker startup. This remains projection, not permission authority.

The admission handler binds the currently loaded ancestor context from `ctx.getSystemPromptOptions()` and complete target-root packet, displays the selected root plus repo-wide navigation/contained `.ontology` effects and instruction content for operator confirmation, then publishes bounded source-labelled context using `pi.sendMessage` with `triggerTurn:false` and `deliverAs:'nextTurn'`. This is a custom message, not system-prompt replacement or acknowledgement of model understanding. Ordinary host `context` observation is **provisional only**: later context handlers and `before_provider_request` hooks may replace messages/payloads. It cannot make an admission eligible. **Selected implementation prerequisite: a Pi-owned final-request instruction-membership receipt**, emitted only after all context and provider-payload transformations, tied to the exact request/turn, session epoch, admission generation and confirmed packet digest. Pi must verify complete instruction-content membership in the final provider request, not merely a message ID or earlier canonical-message presence; unsupported/opaque provider encodings yield no positive receipt. This seam is not currently established and requires an exact Pi-owner implementation task in the same wave, not SCI monkey patches, handler-order assumptions or another supervisor. Until a matching positive receipt exists, remain `awaiting_context` and refuse dispatch without worker startup. Only subsequent tool calls causally tied by the host to that receipted request may use the admission; same-turn calls predating publication remain ineligible. Each later generating request needs renewed final-membership proof; compaction/omission, request mismatch, session epoch or admission-generation change invalidates eligibility. The receipt proves final request membership, not model understanding or compliance. Do not log full prompt options/payloads or start an automatic agent turn. Missing/rejected confirmation leaves no admission. Root-scoped instruction interpretation remains operator/agent responsibility; the host does not compile arbitrary Markdown into policy. No target skills are activated.

Before each dispatch, recollect the relevant target repo/package instruction chain using that public API (`repoRoot` fixed to the admitted root, `cwd` the validated context-file parent). A query without a file uses the admitted root as instruction context; a supplied missing file returns the distinct missing-file refusal, never a fileless fallback. Root-only coverage does not review all descendant instructions: later file-specific navigation/actions must collect and review their own applicable chain. If it introduces instruction content not covered by the confirmed admission, changes its digest, or has an omission, return `instruction_review_required` with a bounded packet for the next explicit operator review; do not start/dispatch the worker. Reuse a confirmed instruction context for repeated requests with the same complete digest. Ancestor context follows Pi's loaded-context lifecycle rather than claiming implicit reload of edited ancestor files; a host reload/session epoch invalidates the admission. This is at-most-on-change review, not another LLM executor per query.

The session-local record contains selector, canonical root and Git/filesystem identity, admission generation, host session epoch, confirmed instruction-context digest and producer descriptor. It is an execution cache, not a global registry or canonical permission/task record. The confirmation grants only the declared navigation profile and contained runtime-state effects. Worktrees with distinct working-tree roots remain distinct subjects. A model-authored path/task ID/workspace ID, receipt text or peer message cannot create or renew the record.

### 2. Stable default and explicit request target

The default selector always means the Pi session's original workspace. An optional target selector may select an already-admitted non-default worker for navigation. There is no mutable global "active target" that silently changes the meaning of an omitted selector.

Resolve and freeze the selected target record **and a validated deep copy of request arguments before the first await**. Immediately before actual producer dispatch, recheck the captured admission generation, host session epoch, confirmed instruction digest and worker identity. Queued work is not grandfathered through revocation. Strip the companion-only target selector before producer schema validation/wire dispatch. File arguments remain relative to the selected repository. Unknown/revoked selectors, wrong-workspace state refs and missing files yield distinct bounded refusals, never fileless search in a different repo.

Target selectors and producer workspace IDs remain separate concepts: Pi selects an admitted worker; SCI mints/verifies its workspace lineage. Caller references cannot override the worker's workspace. Preserve NEXUS containment as final authority even after host preflight.

### 3. Bounded, lazy worker lifetime

Reuse the bridge's protocol/schema/containment machinery, **not its current non-terminal close behavior unchanged**. Source inspection shows `close()` can clear `connecting` while its awaited startup later publishes a connection; later calls can reconnect. The implementation must introduce a terminal worker generation, tracked startup/transport ownership and one shared close promise. This is a statically identified lifecycle defect, not a reproduced live incident.

| Worker transition | Required behavior |
|---|---|
| admitted → starting | Reserve a capacity slot before async spawn; freeze producer descriptor/root/generation. |
| starting → ready | Publish only if the same generation and admission/session epoch are still eligible; otherwise close the late transport without publishing. |
| ready ↔ busy | One serialization lane per worker; dequeue only after the second admission/context gate. |
| starting/ready/busy → closing | Mark terminal first, reject/remove queued requests, request cancellation and await the one owned close promise. |
| closing → closed | Confirm owned transport termination; starting/closing count against capacity until settled. A terminal instance never reconnects. |
| startup/crash/timeout → failed | Preserve failure/effect disposition; no automatic request replay. New generation requires a fresh explicit request and revalidated admission/producer identity. |

Concrete initial limits: eight admission records including default, three starting/ready/busy/closing workers total, four queued requests per worker and sixteen globally. One active request per worker, queue wait at most30s, existing startup handshake bound30s; retain operation-specific timeouts rather than inventing a short whole-agent deadline. Queue abort removes the request before dispatch. An unavailable slot may evict only an idle worker and must await its terminal close; otherwise refuse/queue within those bounds. Never evict an active worker or spawn an LLM peer as capacity fallback.

Startup cancellation must reach the owned transport, not just the eventual SDK call. Drain is bounded30s; use the MCP transport's owned-child close/termination mechanism with a final bounded5s termination observation, never kill by process-name pattern or release a capacity slot while the child is still unconfirmed. Unconfirmed termination returns an explicit cleanup failure and retains the slot/quarantine; it must not trigger a replacement storm. Add delayed-handshake revoke/shutdown and close-then-call fixtures proving no late publication/orphan/reopened instance.

Pin an explicit producer descriptor at admission: resolved command/interpreter and the producer-declared launcher/entry artifact identities/digests, plus negotiated profile/schema. Revalidate those identities on every recreation; never re-resolve ambient PATH/SCI_MCP_COMMAND into a different generation silently. A launcher hash alone is insufficient when it imports mutable shared `dist`; require a frozen compatible producer artifact or fail non-default startup closed. Default legacy behavior remains available under its existing contract until separately activated integration changes it.

The default worker's navigation and existing preview/check workflows share **one serialization lane**. An unrelated navigation abort cannot tear down a transport beneath a concurrently running check because concurrent execution on that worker is prohibited. Existing default check/apply gates and effect-indeterminate no-retry semantics remain intact. Non-default dispatch enforces an exact allowlist of `explore_symbol_impact` and `locate_confirm_definition`; model schemas/toolbox visibility alone are not enforcement. No caller-selected check commands or apply flags are accepted for those targets.

### 4. Revocation, reload and restoration

Revocation increments the admission generation, blocks new requests and cancels every queued/not-yet-dispatched request. Actual dispatch repeats generation/epoch checks after startup and queueing. For already-dispatched navigation, request cancellation and close under the terminal lifecycle; return a typed revoked/cancelled or effect-indeterminate result as appropriate, not usable success. V1 suppresses late successful payloads rather than automatically returning them as historical evidence; any later historical-view feature needs explicit design.

Maintain a companion session epoch driven by actual host session/branch/reload lifecycle events. An old-epoch request must not call `pi.appendEntry`, persist a workspace ref, append instruction context or retain an operator packet in the new epoch. A stale completion is discarded from current-session delivery with a bounded stale-epoch disposition, without claiming that the operation never ran. Source/transport cleanup remains attached to the old worker. Test branch/session switch during delayed startup and delayed result delivery.

Initial safe restoration policy: ordinary single-repo NEXUS restore remains compatible; **non-default admissions are not silently restored across reload, branch/session replacement or process restart**. Old selectors return admission-required, and operator re-admission revalidates identity/context. This is a deliberate first-phase refusal behavior, not seamless-resume proof. Later restoration of grants needs a separately reviewed owner-native continuation contract; session prose is never sufficient.

### 5. Failure feedback and applicability

Keep transport readiness, schema compatibility, bound identity, target applicability, completed query, no-symbol result and source-state currentness distinct. A running producer does not prove usefulness; a correct boundary refusal is not a backend outage.

The public projection contains only bounded owner-defined reason/classification and locally authored next-action guidance. Private diagnostic material stays separate and is never fallback model/TUI content. If safe classification is unavailable, return unknown with a host-correlatable receipt, not a guessed cause. Disclosure validation remains fail-closed.

Refusal caching is **deferred from the first implementation**. Return the precise reason and unchanged-retry guidance each time without hiding a newly valid path. The controller should avoid unchanged deterministic retries. A later bounded cache must include filesystem/currentness invalidation so creating a formerly missing file permits the same request to succeed; request-text equality alone is insufficient. No mechanical retry of effect-indeterminate work.

### 6. Provenance and owner boundaries

Proposed companion outcome envelope `pi.sci_call_outcome.v1` has these required bounded fields: `requestId`, opaque `targetSelector`, numeric `admissionGeneration`, numeric `sessionEpoch`, `workflow`, `stage` (admission/queue/startup/dispatch/validation/delivery), `disposition` (succeeded/refused/failed/cancelled/indeterminate), `revoked` boolean, `workspace` (verified reference or null), `state` (verified reference or null), `lineageVerified` boolean, and `delivery` (current_epoch/suppressed_stale_epoch). Fixed safe reason classification is optional when genuinely unavailable. No raw paths, credentials, stderr or arbitrary producer extensions belong in this envelope. These are local execution receipts, not canonical authority or permission grants.

Success requires the producer payload's workspace and state IDs to equal the **captured worker's handshake workspace**, not merely each other. Required navigation lineage must be present; validate every nested path/state/snapshot reference against that workspace before model/operator retention. On mismatch, withhold payload and return `response_lineage_mismatch`. A pre-handshake refusal has workspace/state=null and lineageVerified=false; never manufacture producer references. Error paths retain the safe captured target/request association without depending on success-packet metadata. Default single-repo output remains compatible while adding bounded receipt metadata.

Context-packer owns instruction projection and Pi owns loaded ancestor context; source instruction text does not become a new access-control language inside SCI. Company/topology restrictions above keep v1 within one inherited host context. Reading a target's code does not activate all its skills, promote knowledge or overwrite controller instructions.

SCI owns code semantics, public reason definitions, containment and state/snapshot receipts. Pi companion owns worker selection, lifecycle, rendering and host interaction. Existing context tooling owns instruction projection. AK owns tasks, decisions and accepted evidence. KES owns reviewed learning/adoption where accepted. No new supervisor, workflow engine or empirical-evaluation owner is introduced.

## Phased execution and gates

| Phase | Owning route | Entry / exit |
|---|---|---|
| A: repair current public errors | Tasks5438/5439, existing owner repos | Regression first; normal-mode wire and both-view tests; no multi-root permission inferred. |
| B: approve target-root contract | Task5440 + new native cross-repo decision | Producer/companion boundary review, threat/consent/restore/cancellation review and explicit accepted/revise/blocked disposition. |
| C: implement admitted navigation profile | New exact owner task(s) only after B | Add target admission/selection and bounded bridge pool; default-off non-default targets; preserve single-repo routes. |
| D: integration and activation | Exact implementation/review contracts | Production-mode subprocess/MCP tests, actual Pi TUI refusal/selection proof, then owner-approved install/reload in isolated target sessions. No operator draft manipulation. |
| E: adopt measured workflow | Existing owner acceptance/evidence | Representative multi-repo task success and costs reviewed; no automatic fleet rollout or KES promotion. |

Thirty minutes is a coordination target for a healthy implementation pass, not a deadline that can waive independent review, owner approval, tests or effect reconciliation. Phases A and B may run in parallel; C cannot predate B acceptance. Failed bootstrap or checks require causal diagnosis rather than alternate unreviewed providers, broader permissions or silent scope expansion.

## Verification and validation

| Requirement / falsifier | Verification | Validation / accepting owner |
|---|---|---|
| Explicit admission only | Arbitrary paths/forged handles/model prose cannot start workers; capability listing starts none. | Operator can predict exactly which repos are admitted and why. |
| Final instruction membership | A later context handler removes the packet; separately a provider hook removes it. Each leaves ensuing SCI calls ineligible, without worker startup. Forged/stale/request-mismatched receipts and unsupported encodings also refuse. | Pi owner verifies the receipt is emitted after the last transformation and binds the actual generating request; neither intermediate context observation nor model understanding is claimed. |
| Correct repository under concurrency | Two repos with identical symbols, nested repos and separate worktrees; dispatch-time target immutable across awaits. | Controller completes a representative cross-repo investigation without wrong-source confirmation. |
| Currentness/lineage remains exact | Wrong state/snapshot refs, changed/deleted root, stale files and same-path replacement fail closed. | Source owner verifies claims remain tied to intended revisions. |
| No hidden privilege/effect escalation | Navigation target cannot enable check commands/apply, company switching, root inference or canonical DB access. | Security/owner review finds no transferred authority. |
| Failure path works in production | Normal environment, real producer/SDK/MCP/companion, malformed packets, known reason, unknown reason, non-JSON safe error, collapsed/expanded views. | Operator and agent choose the correct recovery action without raw diagnostics. |
| Bounded lifecycle | Worker cap, queue full, duplicate concurrent startup, idle eviction, cancel, crash, shutdown and revoked-target delivery. | Measured latency/memory/context cost improves over per-query LLM peers without excessive resident workers. |
| Truthful restore | Reload/branch/restart invalidate non-default admissions; stale selectors cannot silently bind elsewhere. | Operator sees actionable re-admission and can resume intentionally. |
| Compatible existing use | Existing single-repo composites and NEXUS tests remain unchanged in meaning; error refusals remain true tool failures. | Existing target-root workflow remains useful after installation. |

Report eligible-query success, actionable-refusal rate, unchanged-refusal repetition, recovery correctness, wrong-source confirmations (must be zero in fixtures), end-to-end task cost and evidence completeness. Report valid refusals separately from backend failures and missing-symbol results. Neither raw call count nor unit-test count alone is adoption success.

## Rollback, deferred work and implementation admission

Rollback first disables non-default admissions/selection and drains their workers without changing the default bridge, producer roots or stored snapshots. Preserve records required to explain already-dispatched operations. Source revert and shared-runtime activation rollback are separate owner actions. Never delete/rewrite `.ontology` identity metadata merely to regain a green result.

Deferred: persisted multi-target grants, automatic owner-task admission, federation of semantic graphs, cross-repo apply/check transactions, global service/index, hosted/multi-user support and fleet propagation. These are explicit exclusions, not missing functionality to implement opportunistically.

Before C, the decision must settle the concrete host admission seam, resource limits, lifecycle/currentness receipts and exact implementation file scope. The same-wave owner tasks must explicitly name context-packer strict instruction coverage/ENOENT handling, the selected Pi-owned final-request membership receipt (including causal tool-request binding), and the frozen compatible producer artifact prerequisite. These prerequisites are not supplied by this RFC, a generic packet.ok, ordinary context observation or a launcher hash; non-default admission/dispatch remains unavailable until their owner-reviewed contracts and decisive tests pass. Named unresolved choices are visible design work; no passing link checker or accepted task title is a substitute for that acceptance. No task/decision/worker activation follows from this document by itself.
