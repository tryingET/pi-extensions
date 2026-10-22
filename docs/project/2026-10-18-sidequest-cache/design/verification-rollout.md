---
summary: "AK7208 owner-stage plan, requirement-linked verification, admitted live falsifiers and rollback. No execution approval."
read_when:
  - "Requesting authority to implement or qualify the proposed sidequest designs."
---

# Verification, owner decisions and rollout

> **REDACTED historical derivative (AK7403), not byte-identical original evidence.**
> Historical AK7208 proposal only; no current implementation/adoption or live proof.
> Source/authority statements are historical, not fresh admissions. See [public-copy provenance](../README.md).

Everything below is a **future plan**, not a list of executed tests. The only checks performed by AK7208 concern design artifacts and independent static inspection.

## Stages and non-transferable approvals

| Stage | Deliverable | Owner decision before proceeding | Exit evidence |
|---|---|---|---|
| D0 — this task | Design package and inspection dispositions | Operator's design-only instruction / AK7208 | Readable contracts, traceable tests, no overclaim |
| D1 — host contracts | Exact API/data shape and compatibility proposal for native attempt observation and snapshot transaction | Pi host/provider/session owners accept scope; AK-native decision workflow where applicable | Versioned API contract, threat model, existing-host refusal behavior |
| D2 — source/offline | Isolated implementation and synthetic tests | Exact successor tasks; allowed paths and repo ancestry; no live implication | RED→GREEN tests, receiver inspection, declared repo checks without held packaging |
| D3 — isolated live qualification | True interactive `/sidequest` with exact loaded generation | Fresh LH/host/account-owner admission, HOLD clarification, private GUI workflow and request budget | Native final-attempt records, snapshot/child identity, per-request usage and outcome receipts |
| D4 — affinity trial, optional | Single-factor candidate comparison | Causal evidence and provider-contract support; separate account/company/cost approval | Matched results including inconclusive/failure outcomes |
| D5 — adoption | Small manual pilot, then optional versioned tool contract | Receiver validation, owner decision, separate landing/install/publication permission | Correct useful-task outcomes and controlled rollout/rollback |

Do not batch approvals. A green offline suite does not permit paid calls; a live cache hit does not accept architecture; an accepted design does not release Decision151 or authorize canonical landing. No implementation tasks or decision acceptance are created by this plan itself.

## Existing HOLD and minimum clarification

`packages/pi-little-helpers/README.md:78–90` ties the shared `sidequestGhostty.ts` resolver to emitted Decision151 task-session artifact identity; build/runtime/activation/CI/landing reconciliation remains held, with bounded AK6626/6867 exceptions. Lines338–343 withhold the activation/verification checklist pending admission; that checklist includes `/sidequest`.

No blanket prohibition on ordinary already-loaded operator `/sidequest` use was established in AK7207. Equally, existing availability is not a live-test permit. Current controller expressly grants no new live admission. Minimum later clarification from LH/package/Decision151 owners:

- exact unchanged or candidate runtime generation admitted for the experiment;
- which launch/source/build paths remain held, especially shared resolver emission/prepack;
- whether the proposed isolated native observer/snapshot test is allowed without rebuilding task-session artifacts;
- exact consumer validation command that does not implicitly rebuild/publish held artifacts;
- separate owner decisions for any necessary rebuild, install/reload or landing.

For host changes, source belongs to the Pi host/provider owner, not this extension repo. Read target ancestry, engineering policy and task authority before future work; no external source writes occur here.

## Requirement-to-test matrix

| Test | Proposed requirement | Scenario and observable pass condition |
|---|---|---|
| T-A1 | A1 | Fixture copies prior usage, branches, compacts, resumes ASC, retries and adds first child response. First-new-child and first-dispatch-invocation labels differ correctly; inherited usage never counted as new work. Zero/missing usage stays distinct. |
| T-A2 | A2 | Two payload-transform hooks, full SSE and compressed SSE, WebSocket full/delta, missing-continuation retry and fallback. Record matches each actual send argument, transport and attempt ordinal; no hook-level record mislabelled final. |
| T-A3 | A2 | Slow/failing/dropped collector, unsupported custom adapter, overflow, process interruption between prepare/send. Model payload/retry behavior unchanged; coverage is partial/unknown, trial invalidated rather than replayed. |
| T-A4 | A3 | Plant distinctive prompt/tool/signature/account/header/response-ID secrets in synthetic fixtures; scan every emitted file/event/error and crash path. No raw canary material; no secret-derived public fingerprint. Verify per-campaign HMAC separation and owner-only storage. |
| T-A6 | A3 | Campaign never closes, process crashes, lease expires while writer lives, aggregate quota fills, HMAC key remains. No new collection after expiry; safe owned-inactive disposal only; orphan/key custody counted and overdue privacy obligation visible. |
| T-A5 | A4 | Provider total/cached/write/output mapping, missing field,0tokens, usage on failed/retried attempts, cumulative updates, price-tier change. Correct denominator, no duplicate usage, unknown subtotal explicit; TTFT distinct from tool/orchestration time; estimate not invoice. |
| T-F1 | F1 | Mutations interleave before/during/after capture, including branch switch, context edit, compaction and tool-result append. Snapshot equals exactly one revision/leaf dependency closure; no half-entry or mixed checkpoint. Parent unchanged. |
| T-F2 | F1 | Parent-detectable snapshot publication/admission failures cause no child dispatch. Substitute/tamper snapshot between parent validation and bootstrap, or duplicate consumption: child may already exist, but refuses before snapshot use/provider request with correlated receipt. Distinct child ID, original lineage and exact selected context retained. |
| T-F3 | F2 | Long healthy tool, queued continuations, preprocessing, settlement handlers, user-bash and registered detached writers. Default waits with status; no routine short timeout; no silent drop/abort of parent work. |
| T-F4 | F2 | Cancel before capture/during publication/after dispatch; reentrant command from tool or lifecycle callback; model tool waits on itself. No deadlock, parent not aborted, pre-dispatch intent cancelled honestly, post-dispatch uncertainty preserved. |
| T-F5 | F3 | Parent tool already caused a non-idempotent synthetic effect but result delayed; detached job remains active. Host/adapter never automatically replay inherited calls; child receives unknown-outcome manifest. Model compliance is separately bounded behavioral evidence, not universal prevention. Dependent effect execution uses source-owned reconciliation/admission if stronger prevention is required. Empty tracked list with unknown coverage is not all-clear. |
| T-F6 | F4 | Session/generation/CWD/company/model changes while waiting; parent advances after snapshot. Changes requiring rebinding refuse/reconfirm; later parent revision does not alter frozen child snapshot. Fresh discovery still occurs as specified. |
| T-F7 | F4 | Ghostty admission refusal, indeterminate transport, late ACK, restart with pending intent. One-use launch and exact snapshot correlation; no duplicate automatic retry or restart launch. ACK not placement/caching proof. |
| T-F8 | F4 | Ordinary fork with no affinity candidate: unchanged but unknown/cross-company/account destination, mixed source history or missing source transfer permission. Refuse transfer before launch when parent-detectable; recheck at bootstrap before history use/provider sends. A provider alias/CWD never substitutes for transfer permission. |
| T-F9 | F1 | Repeated cancel/failure/consumption/indeterminate launch exhausts aggregate snapshot quota; crash interrupts release. Reservation accounting remains bounded; raw snapshots dispose only when owned/inactive and custody transferred; overdue/uncertain retention stops growth, not unsafe deletion. |
| T-C1 | C1 | Candidate family shared across two children; socket/session keys and continuation references remain independent. Reject global/same-session-ID fallback and cross-child response association. |
| T-C2 | C2 | Different/unknown account/company, unscoped target, credential-slot drift, expired family, unsupported provider. No candidate hint; truthful default/refusal and no credential changes. |
| T-C3 | C2 | Revoked authority/new AGENTS, changed tools/order/schema, semantic-preflight refresh, model overlay and service tier. Fresh changes reach outbound request; never masked to preserve a hit. |
| T-L1 | A2/A4 | Codex fixture rejects unsupported output-limit fields; hard-cap posture remains blocked without supported provider enforcement. Admitted soft-budget guard counts attempts including fallback/retries, stops new sends at the bound, reports watchdog cancellation/unknown usage and in-flight overshoot honestly. |
| T-C4 | C3 | Matched useful task with independent receiver judgment. Total new-work cost/time, output/retries/rework and quality satisfy approved margins; first-child cache fraction alone cannot pass. |

Fixture-provider/model tests establish local mechanics only. Production source and loaded bundle identity must be correlated separately; no proxy green result is sold as live provider behavior.

## Smallest future live experiment

**No such experiment is currently admitted.** Proposed first admission request, with owner-adjustable caps:

- One isolated nested-compositor TUI parent and its true manual `/sidequest` child using supported launch/control; no operator desktop focus changes, shell-improvised Ghostty spawn or `pi -p` substitution.
- Fixed provider/model and verified same account route; same cwd/company/tool set; no mutable file tasks, real side effects or private operator history. Use a bounded synthetic but representative stable prefix. Default production caching/auth unchanged.
- Native collector qualified offline and records exact generation, final sends, structured hashes, hooks/tool/route identity and incoming usage. Raw private text never retained.
- Sequence at most **five logical model requests**: warm parent seed, parent continuation, first fork request, second fork request, one clean same-model/account/cwd/tool control. Report sample ordering and fresh startup differences; clean-vs-fork is a contrast, not a one-factor proof. Requests must be intentionally tool-free or have strictly bounded synthetic follow-ups so a model tool loop cannot exceed the cap.
- Proposed planning targets:300k reported input tokens,1k output tokens and$10 estimated spend. These are **not all enforceable hard limits** on Codex. Owner chooses a smaller representative prefix and approves one of the output-bound dispositions below. Existing retries count as extra transport attempts. Proposed attempt allowance: at most7 sends for5 logical requests, enforced by a separately qualified provider-owner cancellation/admission guard adjacent to dispatch; unsupported guard means this envelope is not runnable. Exhaustion stops new sends; it does not prove in-flight effects/cost stopped. This temporary guard is part of separate trial admission, never an unapproved change to global retry policy.
- **Codex-specific open admission decision:** inspected Codex has no supported wire `max_output_tokens` field. If a hard output-token ceiling is mandatory, Codex D3 is **blocked** until a supported enforcement mechanism is independently established. Do not invent the field or substitute another provider and claim Codex proof. Alternatively the account owner may explicitly accept soft output/spend targets, request-level/attempt limits, best-effort watchdog cancellation, and possible in-flight output/cost overshoot. A short-answer instruction is only guidance, not enforcement. Native guard/watchdog behavior and cancellation accounting must be qualified offline before that soft-budget option is admitted. Neither option is approved here.
- Stop after the first discriminating observation; do not consume the whole matrix automatically. Any unknown attempt usage makes budget consumption uncertain and stops new sends pending owner reconciliation. An in-flight provider request may still incur cost; no guarantee of hard dollar/output caps is made without provider enforcement. Verify no unsupported output-limit parameter is added to the Codex payload.

This first experiment tells whether the **current** path preserves prefix/state and exhibits the historical pattern. It cannot retroactively prove the historical cause. It may eliminate the need for an affinity experiment.

### Single-factor follow-up, separate permission

If final content/effective route are matched but cache behavior suggests affinity, request a small randomized paired experiment with default vs independent family hint. Keep transport/continuation policy fixed or stratify it; never reuse logical IDs. Proposed initial maximum two matched pairs, with a separately approved request/token/estimated-cost/attempt budget. If variance prevents discrimination, return **inconclusive**; do not keep running until a preferred result appears. Key-family TTL testing is unnecessary unless an actual supported retention contract makes it relevant.

A CWD/tool one-factor test is a separate pair: change exactly that factor, record resulting instruction/schema changes, and compare equality/usage. Do not mix it into the affinity pair or disable fresh company snapshots to manufacture a perfect match.

## Decision criteria and falsifiers

| Claim being tested | Would support it | Would falsify/narrow it |
|---|---|---|
| Early payload churn is avoidable and causal | Final records locate unintended early change; removing only it restores reuse in matched trials | Stable final prefix still misses, or change is necessary for freshness/tool truth |
| Affinity separation contributes materially | Same effective content/account/transport with only supported hint changed improves cost/reuse reproducibly | No benefit, highly variable effects, or improvement requires session/connection identity sharing |
| Quiescent capture prevents missing-result ambiguity | Concurrent synthetic test yields one consistent revision and no pending tracked calls; fork-now labels unknowns | False all-clear, duplicated effects, inconsistent snapshot or silent parent abort |
| New design improves the user's workflow | Receiver-confirmed correctness with lower total cost/time under predeclared margins | Worse correctness/privacy, lost independent inspection, more rework or merely higher cache% |

Before live approval, the receiver specifies noninferiority margins for completion quality and tail latency, minimum practically useful cost saving, instrumentation overhead tolerance and representative task cases. Unspecified margins cannot be replaced after seeing results. Tiny samples qualify mechanisms, not fleet-wide performance. Use within-task distributions/paired observations and disclose uncertainty rather than invent statistical confidence.

## Rollout and rollback

- **Attribution:** off by default → one explicit campaign → review sanitized output/overhead → opt-in owner-approved adoption. Rollback disables collection and final diagnostic events only; does not remove ordinary usage or alter payloads. Retention obligations survive rollback.
- **Manual fork snapshot:** capability-negotiated opt-in → admitted manual pilot → separately approved default. Unsupported hosts refuse guaranteed mode; old behavior, if offered, is explicitly legacy/unknown-consistency and requires its own user choice. Rollback cancels pending pre-dispatch intents safely and stops new use; never auto-launches them or removes already-running children.
- **Tool surface:** versioned asynchronous intent contract only after command contract proof and independent owner compatibility decision. No silently changed successful return shape.
- **Affinity:** opt-in bounded family only after proof → expiry to ordinary per-session hints. No global cache-key/auth change, warming, history migration or clearing unrelated sockets. Never retry an indeterminate request to make rollback appear clean.

Rollback trigger classes: data leak, account/company ambiguity, stale authority, response cross-talk, tool mismatch, duplicate/non-idempotent effect, deadlock/starvation beyond explicit operator tolerance, unbounded logs/overhead, unmeasured budget or no receiver-relevant improvement. Owner records what remained running/unknown; cancellation is not external rollback.

## Implementation decomposition — proposed, not authorized tasks

1. Host/provider observation contract and privacy/accounting tests (A1–A4).
2. Host snapshot transaction/queue contract and adversarial concurrency tests (F1–F3).
3. LH manual command UX and launch integration (F2–F4), without shared-resolver changes unless separately admitted.
4. Display/ASC wording and optional telemetry consumer adoption, preserving their ownership.
5. Exact isolated live qualification with source-to-runtime identity.
6. Conditional affinity decision/trial or explicit decision to retain current behavior.
7. Optional asynchronous tool contract and broader receiver validation.

Each source task needs its own exact authority, target repo ancestry, engineering contract, declared validation and owner decision. No commits, installation, upstream publication or lifecycle closeout are implied by this list.
