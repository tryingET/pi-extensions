---
summary: "Proposed operating-loop design for agent_vent review cadence, human-approved owner handoffs with receipts, and usefulness measurement."
read_when:
  - "Designing or implementing an operator-visible agent_vent review cadence."
  - "Adding owner handoff approval, receipts, or outcome measurement to agent_vent."
  - "Evaluating whether agent_vent has become a useful AI Society feedback loop."
system4d:
  container: "Proposed review -> handoff -> outcome loop for local agent diagnostics."
  compass: "Turn reviewed local friction into measured, human-approved owner action without authority drift."
  engine: "Derive due review -> bind an operator decision to an immutable group snapshot -> preview and approve a handoff -> retain an owner receipt pointer -> measure local and verified outcomes with explicit denominators."
  fog: "Review states, local receipts, and activity counts can be mistaken for human approval, canonical owner acceptance, or useful outcomes."
---

# Design packet — `agent_vent` review, handoff, and outcome loop

Status: **proposed concern-local design; not adopted; no implementation or owner-system mutation authorized by this packet**.

This packet designs the next three bounded product steps recommended by the [usage-loop evidence spike](2026-08-08-agent-vent-usage-loop-evidence-spike.md):

1. an operator-visible review cadence;
2. explicit human-approved owner handoffs with receipts;
3. measurement of whether reviewed vents produce useful fixes, learnings, or justified dismissal.

It does not change the explicit `self -> toolbox -> agent_vent` capture membrane, introduce automatic capture, create an AK task/decision/evidence row, submit an issue, declare an incident, publish a learning, or install a background telemetry path.

## 1. Executive decision proposal

Adopt a staged operating loop:

```text
local recurrence group
-> derived review cadence
-> review intent bound to an immutable group snapshot
-> host-verified operator approval, or approval on the authenticated owner surface
-> draft-only owner payload
-> owner-system execution outside agent_vent
-> separate local intent and owner-native receipt facts
-> local and owner-verified outcome observations
-> cohort metrics with visible denominators and unknowns
-> optional owner-routed evidence or learning through its canonical surface
```

The selected posture is:

- **pull before push:** land a read-only cadence projection before any session-start nudge;
- **snapshot before approval:** a recurrence key alone is not stable enough for review or handoff identity;
- **two receipts, two authorities:** local operator intent and canonical owner acceptance are separate facts;
- **no direct writer in the first handoff slice:** `agent_vent` prepares and records local intent, while the owner surface creates the artifact;
- **no composite usefulness score:** measure review, handoff, and verified effect as separate cohorts;
- **unknown remains unknown:** silence, missing follow-up, and unverified references are not success or failure;
- **command-path observation is not human proof:** a locally recorded slash-command source is only an operator-visible command-path observation; a human-approved claim requires non-spoofable host origin or approval on the authenticated owner surface.

## 2. Why this design is needed

The package already has strong local mechanics:

- append-only minimized vent records;
- recurrence groups and advisory candidate incidents;
- `review`, `outcomes`, `compare`, `facets`, `draft`, `export`, and retention surfaces;
- local states `new`, `acknowledged`, `dismissed`, and `escalation_drafted`;
- draft-only GitHub, AK, incident-review, and maintainer-note text;
- explicit boundaries against AK, GitHub, incident, evidence, telemetry, publication, and ASC/self mutation.

Those mechanics do not yet form a closed useful loop.

The evidence spike observed six singleton groups, five still `new`, one `acknowledged`, no candidate incidents, and no curation, escalation-draft, or retention activity. That observation does not prove review failure, but it makes review value the largest unresolved evidence gap.

Three semantic gaps block truthful measurement today:

1. **A review event is not necessarily human review.** The LLM-facing `agent_vent` tool can set local review state. Current state therefore means "a local disposition event exists," not "a human approved this decision."
2. **A recurrence key is not an immutable reviewed object.** New records or curation can change the group after review without invalidating the old disposition.
3. **Current `outcomes` are workflow-state buckets.** `acknowledged`, `dismissed`, and `escalation_drafted` do not establish usefulness, owner acceptance, or verified improvement.

The design resolves those gaps without making local diagnostics authoritative.

## 3. Authority and decision posture

### 3.1 Existing authority boundary

The [self/toolbox/agent_vent boundary](2026-06-05-self-toolbox-agent-vent-diagnostic-boundary.md) remains unchanged:

- ASC/`self` owns moment-level mirror candidates, not durable recurrence;
- toolbox owns discovery and active-tool-set changes, not diagnostics;
- `pi-agent-vent` owns local diagnostic state and projections;
- target owner systems own tasks, issues, incident state, evidence, and publication.

### 3.2 Canonical decision boundary

Per the repo [decision runtime](../../../../docs/project/decision-runtime-and-roadmap.md), AK owns architecture decision truth. Checked-in prose must not assert current decision absence or legality. At execution time—and only when the AK runtime is healthy—the implementer must perform a fresh read-only decision list/passport readback and cite the live decision id/passport before crossing a decision gate.

The following may proceed as bounded package design or implementation after normal owner authorization:

- a pure read-only cadence projection over existing local state;
- output wording that distinguishes local disposition, command-path observation, and host-verified review;
- tests and docs for that projection.

Open an AK decision before implementing any concern that changes:

- default Pi startup/attention behavior through automatic review nudges;
- the durable operator-approval or cross-package handoff envelope contract;
- an owner-system submission adapter;
- canonical receipt verification or cross-owner idempotency semantics;
- society-wide usefulness measurement, promotion, or accepted-learning workflow.

A repo RFC or this packet can support such a decision; it cannot adopt it.

## 4. Design principles

1. **Review before authority.** No owner adapter handoff is eligible until the exact group snapshot has either a host-verified operator decision or approval on the authenticated owner surface. A local command-path marker alone is insufficient.
2. **Local state is local.** A local event can describe intent or cache a pointer; it cannot declare owner acceptance.
3. **Owner-issued receipts win.** AK, GitHub, an incident owner, or another target surface defines its canonical artifact identity and lifecycle.
4. **Freshness is explicit.** New group members or changed curation invalidate prior review/approval for the expanded snapshot.
5. **No hidden telemetry.** All events stay in `PI_AGENT_VENT_DIR`; empirical export is explicit and minimized.
6. **Negative outcomes are first-class.** Noise, wrong grouping, wrong owner, duplicate, rejection, no effect, and regression remain visible.
7. **No mechanical retry after indeterminate effects.** Reconcile with the owner system and idempotency key first.
8. **Measure value, not volume.** Vent count and escalation count are not success metrics.
9. **Preserve existing surfaces.** Extend `review`, `draft`, `outcomes`, `stats`, and `export`; do not build a parallel dashboard.
10. **Fail closed on identity drift.** Recurrence aliases aid lookup but never replace immutable snapshot identity.

## 5. Proposed architecture

```text
ASC/self candidate (optional)
        |
        v
agent_vent local record + recurrence projection
        |
        v
GroupSnapshotV1 ------------------------------+
        |                                      |
        v                                      |
ReviewCadenceProjectionV1                      |
        |                                      |
        v                                      |
review intent + origin-trust classification     |
        |                                      |
        v                                      |
draft preview + payload digest                 |
        |                                      |
        v                                      |
host/owner-surface approval --------------------+
        |
        v
HandoffIntentV1 (local cache, noncanonical)
        |
        +--> human/owner adapter executes on owning surface
                     |
                     v
             canonical owner receipt
                     |
                     v
OwnerReceiptPointerV1 (local cached pointer)
        |
        v
UsefulnessEventV1 + owner outcome observation
        |
        v
local cohort projection -> explicit Oracle/DSPx or AK/KES handoff if authorized
```

The prerequisite is immutable snapshot binding. Cadence, approval, receipts, and measurement must not bind only to a mutable recurrence key.

## 6. Prerequisite: immutable recurrence snapshots

### 6.1 Problem

Current group identity is a local recurrence key projected through curation. A later record can expand an acknowledged or dismissed group while leaving the old review state visibly attached. A merge or rename can also change projected membership.

### 6.2 Proposed contract

A reviewed object is a persisted canonical snapshot manifest, not a digest over mutable display keys or record ids alone:

```ts
interface AgentVentGroupSnapshotV1 {
  schemaVersion: 1;
  lineageId: string;              // stable random local lineage id
  groupGeneration: number;
  recurrenceKey: string;          // display and lookup alias only
  eligibleAt: string;             // generation-specific cadence origin
  timeDueAt: string;              // eligibleAt + 7 days
  criticalDueAt?: string;         // eligibleAt when critical
  members: Array<{
    occurrenceId: string;         // stable across archive/restore
    appendOrdinal: number;        // distinguishes reused/duplicate record ids
    canonicalRecordDigest: string;
  }>;
  curationDigest: string;
  snapshotDigest: string;
}
```

Hashing contract:

- canonicalize the normalized, redacted review-relevant record fields and manifest with RFC 8785 JSON Canonicalization Scheme semantics;
- hash UTF-8 canonical bytes with SHA-256 and encode lowercase hex;
- the record digest covers id, timestamp, category, severity, summary, evidence, expected/actual behavior, tags, tool, package, and source fields;
- assign legacy occurrence ids/append ordinals once under the shared state lock and persist them in an append-only snapshot manifest; do not derive durable identity from a rewritable line offset;
- persist lineage/generation manifests outside the active vents file so archive/restore cannot erase reviewed identity; retention receipts reference affected snapshot ids.

Rules:

- timestamps must be validated; malformed values cannot drive cadence;
- any member-content, membership, or curation change creates a new generation, new `eligibleAt`, and `needs_rereview` posture;
- old recurrence keys remain aliases for lookup only;
- handoffs, receipts, and usefulness events bind to `lineageId + groupGeneration + snapshotDigest`;
- review decisions record the exact snapshot digest, not an ambiguous latest record id.

`needs_rereview` is derived, not manually set. Existing state remains historical context:

```text
acknowledged at generation 2; current generation 3 needs re-review
```

Before Phase 1 implementation, retention/archive/restore tests must prove that snapshot manifests remain reproducible and duplicate/reused record ids cannot alias two members.

### 6.3 Explicit legacy materialization

Cadence never creates identity files implicitly. When legacy records lack manifests:

1. `/agent_vent snapshot init preview` computes the canonical mapping and input store/curation hashes without writing;
2. `/agent_vent snapshot init apply init:<token>` acquires the shared state lock and revalidates those hashes;
3. it writes one complete initial identity/lineage manifest to a sibling temporary file, fsyncs it, and atomically renames it into place only when no manifest exists;
4. a crash before rename leaves no visible migration; after rename the complete input hashes and deterministic mapping make retry an idempotent validation, not a second migration;
5. an existing mismatched or partial manifest fails closed and requires owner-scoped recovery—no automatic rewrite or rollback deletes user state.

Until initialization succeeds, cadence returns `snapshot_initialization_required` and remains read-only. Legacy replay uses validated append order to compute generation `eligibleAt` and historical queue-threshold crossings. This migration belongs behind the Phase 1 decision gate.

## 7. Step 2 — operator-visible review cadence

### 7.1 Selected first slice: pull-based derived cadence

Add a read-only cadence projection to existing command output and expose a focused query:

```text
/agent_vent cadence
/agent_vent review due 20
/agent_vent stats
```

Example:

```text
Review cadence: DUE
Reasons: 5 new/needs-rereview groups; oldest eligible group is 9 days old.
Priority: 0 critical; 0 candidate incidents.
Target: review every 7 days, or earlier at 5 eligible groups or any critical group.
Next: /agent_vent review due 20
Boundary: derived local diagnostic posture; no notification, assignment, or owner action occurred.
```

Initial deterministic precedence:

1. `clear` when no `new` or `needs_rereview` generation exists;
2. otherwise `overdue` when the oldest generation-specific `eligibleAt` is at least 14 days old;
3. otherwise `due` when a critical generation exists, oldest `eligibleAt` is at least 7 days old, or the eligible queue contains at least 5 generations;
4. otherwise `current`.

Candidate incidents raise priority in output but remain advisory. Only `critical` severity triggers immediate due status in this initial rule; other severities do not.

Each snapshot persists `timeDueAt=eligibleAt+7d` and optional `criticalDueAt=eligibleAt`. Queue-size due is represented by append-only `ReviewDueEventV1(snapshotDigest, dueAt, reason="queue_size")`: when a state mutation makes the verified-decision-eligible queue cross to at least five, the shared lock appends one due event for every currently eligible generation; a new generation entering an already-due queue receives its own event immediately. `effectiveDueAt` is the earliest time, critical, or queue due time. The denominator is therefore unique snapshot generations, never days or presentations.

### 7.2 Projection contract

```ts
interface ReviewCadenceProjectionV1 {
  schemaVersion: 1;
  computedAt: string;
  status: "clear" | "current" | "due" | "overdue";
  eligibleGroupCount: number;
  newGroupCount: number;
  needsRereviewCount: number;
  oldestEligibleAt?: string;
  oldestEligibleAgeDays?: number;
  criticalEligibleCount: number;
  candidateIncidentEligibleCount: number;
  reasons: Array<"weekly_age" | "queue_size" | "critical" | "overdue_age">;
  targetDays: 7;
  queueThreshold: 5;
  boundary: "local diagnostic projection only";
}
```

The projection writes no state. It is reproducible from persisted generation manifests, separate review projections, and the supplied clock. `overdue` takes precedence over `due`, while all applicable reason codes remain visible.

### 7.3 Separate disposition, command-path intent, and verified decision

Preserve current `set_review` only as `localDisposition`; it continues to drive existing local retention eligibility but never counts as human review. Add a separate review-decision projection keyed by snapshot:

```ts
interface ReviewDecisionV1 {
  snapshotDigest: string;
  decision: "acknowledged" | "dismissed" | "escalation_drafted";
  originTrust: "command_path_observed" | "host_verified_operator_origin";
  createdAt: string;
  note?: string;
}
```

A proposed slash command may append `command_path_observed`, but that source string is forgeable local state and does not prove operator presence. It must not enter a human-review numerator or authorize an owner adapter. Only a non-spoofable Pi host-origin signal may emit `host_verified_operator_origin`; if the host cannot provide that signal, the design fails closed and relies on approval performed directly on the authenticated owner surface.

Projection precedence is explicit:

- `localDisposition` and `reviewDecision` are separate fields; latest-event-wins never crosses between them;
- later LLM `set_review` events cannot supersede a verified decision or clear human-review cadence;
- cadence reports command-path intent and host-verified decision counts separately;
- handoff adapter eligibility uses host-verified or owner-surface approval only;
- existing retention may continue to use local disposition, but output must not call that human review.

### 7.4 Deferred push-based cadence

After the pull-based pilot, an opt-in session-start nudge may be considered:

- disabled by default;
- no vent content in the notification;
- at most once per 24 hours while due;
- clears when no group is due, not merely when the notice is dismissed;
- a command can disable it immediately;
- no network, scheduler daemon, or owner-system write.

Because this changes Pi startup attention behavior, implementation requires the appropriate AK decision/default-workflow gate. Do not silently add it as part of the pull-based slice.

## 8. Step 3 — explicit human-approved owner handoffs with receipts

### 8.1 Selected flow

```text
1. inspect exact snapshot and draft
2. record command-path intent (local only, not human proof)
3. obtain host-verified operator approval or approve inside the authenticated owner surface
4. execute through the owner surface under its own legality contract
5. retain an unverified reference or cache an owner-verified receipt, never conflating them
6. reconcile owner outcome before any effect claim
```

Drafting and local intent create no owner artifact. If Pi cannot supply trusted operator-origin provenance, `agent_vent` must not label a local event human-approved; the human approves when acting in the authenticated owner system.

### 8.2 Structured owner identity and approval gate

Owner identity must be target-specific and validated, not arbitrary text:

```ts
type OwnerIdentityV1 =
  | { kind: "ak_repo"; canonicalRepoId: string }
  | { kind: "github_repo"; host: string; owner: string; repo: string }
  | { kind: "incident_system"; systemId: string; namespace: string }
  | { kind: "maintainer_channel"; systemId: string; channelId: string };
```

Preview binds the canonical snapshot, validated owner identity, target, sanitized sample digest, payload digest, privacy result, idempotency key, and expiry. Command-path intent may be recorded but cannot authorize an adapter. Approval requires either `host_verified_operator_origin` from a non-spoofable Pi host signal or owner-surface approval returned by the authenticated owner workflow.

Trusted host approval requires a runtime-owned opaque capability, not a caller-populated enum:

```ts
interface HostOperatorOriginReceiptV1 {
  receiptId: string;
  sessionId: string;
  surfaceId: string;
  commandInvocationId: string;
  commandDigest: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  hostSourceFingerprint: string;
  origin: "operator_submit";
}
```

Pi host owns issuance and verification. The extension must verify the opaque receipt through a trusted host API/capability, bind it to snapshot/owner/payload/command digests, reject cross-session or cross-surface use, and consume its nonce once under the shared lock. Local JSON fields cannot manufacture trust. Until Pi documents and ships this verifier, `host_verified_operator_origin` is unavailable and adapters require owner-surface approval.

All snapshot-, disposition-, cadence-, and approval-affecting mutations must share one `agent-vent-state` lock/transaction domain: vent append, existing `set_review`/local-disposition append, curation, snapshot/due-manifest append, review decision, retention archive/restore, and handoff approval. Approval acquires the lock, reloads and validates all state, recomputes snapshot and token, appends the intent atomically, then releases. A changed snapshot fails closed; this closes the validation-to-append race.

### 8.3 Separate local intent, unverified references, and verified receipts

```ts
interface HandoffIntentEventV1 {
  schemaVersion: 1;
  eventType: "handoff_intent_observed" | "handoff_approved" | "handoff_abandoned";
  id: string;
  createdAt: string;
  snapshotDigest: string;
  targetKind: "github_issue" | "ak_task" | "incident_review" | "maintainer_note";
  ownerIdentity: OwnerIdentityV1;
  payloadDigest: string;
  selectedSampleDigest: string;
  idempotencyKey: string;
  approvalTrust:
    | "command_path_observed"
    | "host_verified_operator_origin"
    | "owner_surface_approval";
  hostOriginReceiptId?: string;
  ownerApprovalReceiptId?: string;
  boundary: "local intent cache; no owner artifact or acceptance implied";
}

interface OperatorAttestedOwnerReferenceV1 {
  schemaVersion: 1;
  eventType: "owner_reference_recorded";
  approvalId: string;
  ownerIdentity: OwnerIdentityV1;
  artifactReference: string;
  claimedDisposition: "unknown";
  boundary: "unverified operator-attested pointer";
}

interface VerifiedOwnerReceiptV1 {
  schemaVersion: 1;
  eventType: "owner_receipt_verified";
  approvalId: string;
  ownerIdentity: OwnerIdentityV1;
  ownerArtifactType: string;
  ownerArtifactId: string;
  ownerRevisionOrDigest?: string;
  ownerCorrelationId?: string;
  ownerDisposition:
    | "accepted"
    | "rejected"
    | "duplicate"
    | "not_found"
    | "effect_indeterminate";
  contentRelation: "exact_draft" | "human_edited" | "unknown";
  provenance: "owner_adapter_verified";
  boundary: "local cache of owner-issued receipt; owner system remains canonical";
}
```

Store these append-only under `PI_AGENT_VENT_DIR`. References are opaque, bounded, redacted pointers. Only the verified receipt type may carry owner disposition language.

### 8.4 Owner adapter contract

A future adapter requires an owner-specific legal AK decision/passport and executable owner contract. It accepts only current snapshot approval with `host_verified_operator_origin` or `owner_surface_approval`, validates structured owner identity, and returns an owner-native disposition plus correlation/idempotency data.

Rules:

- the target owner defines required scope, lifecycle, evidence, and artifact validation;
- a cached result cannot override owner-native truth;
- `effect_indeterminate` stops the loop;
- never mechanically retry an indeterminate write—query the owner by idempotency/correlation id first;
- adapter credentials and network policy stay with the owner integration;
- package/tool facets never become owner routing truth.

### 8.5 Owner-specific boundaries

| Target | Owner truth | `agent_vent` may do | `agent_vent` must not claim |
|---|---|---|---|
| AK task | AK runtime/DB | draft and retain a validated local intent or receipt pointer | task exists, is ready, assigned, completed, or evidenced without AK receipt |
| GitHub issue | target repository/GitHub | draft and retain issue URL/ID pointer | issue accepted, triaged, assigned, closed, or fixed without GitHub truth |
| Incident review | incident owner | draft and retain canonical incident-review pointer | incident declared, severity accepted, or incident resolved |
| Maintainer note | target communication surface | draft and retain a message/permalink pointer | maintainer accepted ownership or acted |
| KES learning | KES/accepted learning surface | retain a pointer after accepted promotion | local vent text is an accepted learning |

## 9. Step 4 — usefulness and outcome measurement

### 9.1 What to measure

Measure four separate cohorts:

1. **Local review cohort** — unique eligible snapshot generations, command-path review intents, and separately host-verified decisions.
2. **Local value cohort** — local usefulness ratings classified by origin trust; command-path ratings remain attestations, not verified human identity.
3. **Handoff cohort** — host/owner-approved intents, unverified owner references, and separately owner-verified receipts.
4. **Verified effect cohort** — owner-verified artifacts with owner-native follow-up showing improvement, no effect, regression, or still unknown.

The capture funnel—eligible ASC candidates, previews, recordable previews, and records—cannot be measured truthfully by `pi-agent-vent` alone. It requires an explicitly authorized ASC/empirical instrumentation design and remains out of scope here.

### 9.2 Separate local ratings from owner-verified effects

```ts
interface LocalUsefulnessRatingV1 {
  schemaVersion: 1;
  eventType: "local_usefulness_rating";
  snapshotDigest: string;
  rating: "useful" | "mixed" | "not_useful";
  reasonCodes: string[];
  burdenBand: "under_1m" | "1_to_3m" | "3_to_10m" | "over_10m" | "unknown";
  originTrust: "command_path_observed" | "host_verified_operator_origin";
  note?: string;
  boundary: "local diagnostic rating; not owner effect or canonical evidence";
}

interface VerifiedOwnerEffectObservationV1 {
  schemaVersion: 1;
  eventType: "owner_effect_verified";
  verifiedOwnerReceiptId: string;
  ownerEffect:
    | "owner_followup_observed"
    | "verified_improvement"
    | "no_measurable_effect"
    | "regression"
    | "owner_rejected"
    | "canonical_duplicate"
    | "not_found"
    | "effect_indeterminate";
  ownerEvidence: { ownerIdentity: OwnerIdentityV1; artifactId: string; revisionOrDigest?: string };
  followUpDueAt?: string;
  source: "owner_adapter_verified";
  boundary: "local cache of owner-native observation; owner remains canonical";
}
```

Store these append-only in `outcome-events.jsonl`. Command-path ratings cannot claim owner effects. `verified_improvement`, regression, rejection, and other verified labels require `owner_adapter_verified`; an arbitrary evidence-pointer string is insufficient. Missing feedback or follow-up is projected as `unknown`, never synthesized as success or failure.

### 9.3 Operator UX

```text
/agent_vent outcome rate <snapshot> useful recurrence_visible burden=1_to_3m
/agent_vent outcome rate <snapshot> mixed insufficient_context burden=3_to_10m
/agent_vent outcome rate <snapshot> not_useful wrong_grouping burden=over_10m
/agent_vent outcomes all 20
/agent_vent stats
/agent_vent export markdown acknowledged
```

The command path may write a local rating with explicit origin trust. LLM actions may only preview the command or read aggregates. Owner-effect observations are ingested only through the verified owner contract, not a free-form slash command.

A dismissal may still be useful because it removed noise or prevented an unnecessary owner artifact. Review state and usefulness rating are intentionally orthogonal.

### 9.4 Metric definitions

Every metric must show numerator, denominator, cohort window, and unknown count.

| Metric | Definition | Required caveat |
|---|---|---|
| Due decision coverage | unique due snapshot generations with host-verified decision / unique generations whose `effectiveDueAt` falls in the cohort window | command-path intents reported separately; no daily/presentation duplication |
| Time to decision | verified decision time minus generation-specific `eligibleAt` | validated manifest timestamps only |
| Re-review freshness | current-generation verified decisions / generations created by post-decision record or curation change | old decisions remain historical |
| Rating coverage | rated snapshots / snapshots with same-trust-level decisions | unrated remains unknown; trust levels never combined silently |
| Local useful rate | `useful` / rated snapshots | always show rated, decided, and eligible counts |
| Handoff approval rate | host/owner-approved intents / verified `escalation_drafted` decisions eligible for handoff | acknowledged/dismissed snapshots excluded |
| Owner receipt coverage | owner-verified receipts / approved intents | unverified references reported separately |
| Owner acceptance mix | accepted/rejected/duplicate/not-found/indeterminate verified receipts | all owner dispositions visible |
| Effect follow-up coverage | verified effect observations / accepted owner receipts with an owner-defined `followUpDueAt` inside the window | receipts without a due rule remain unknown/not eligible |
| Verified improvement rate | verified improvements / receipts with verified effect outcomes | never divide by all vents |
| Burden mix | rating counts by burden band | no inferred wall-clock duration |
| Negative outcome mix | noise, wrong grouping/owner, rejection, duplicate, no effect, regression, and burden counts | do not hide negative cohorts |

Do not compute a single quality, health, conversion, or usefulness score across these cohorts.

### 9.5 Empirical and learning owner seam

`pi-agent-vent` may compute local diagnostic projections only.

- An Oracle/DSPx analysis may consume an explicitly exported, minimized cohort when empirical product behavior analysis is authorized.
- AK may receive decision/task evidence only through AK-native evidence workflows.
- KES may receive a learning only after an owner accepts the learning and its provenance.
- A local receipt pointer or usefulness event never performs those promotions.

No automatic export or telemetry is proposed.

## 10. Pilot and graduation gates

### 10.1 Pilot cohort

Use the current queue plus future records until at least:

- 10 host-verified snapshot decisions exist; command-path observations are reported separately and cannot satisfy this minimum;
- at least 30 days are reconstructible from persisted generation-specific `eligibleAt` manifests;
- any owner handoffs remain manual unless an accepted/legal AK passport authorizes an adapter.

A smaller sample may expose defects but must not support a broad adoption or automation claim.

### 10.2 Provisional hypotheses

These are evaluation hypotheses, not present facts:

- at least 80% of unique due generations receive a host-verified decision within 7 days;
- at least 70% of host-verified decisions receive a same-trust usefulness rating;
- at least 60% of rated reviews are `useful` or `mixed`;
- at least 80% of rated reviews report burden of 3 minutes or less;
- every handoff approval binds a current canonical snapshot, validated structured owner identity, and payload digest;
- no owner-system mutation occurs without host-verified or owner-surface approval;
- every indeterminate owner effect stops for reconciliation;
- every claimed verified improvement cites an owner-native evidence pointer.

The AK decision, if opened, should accept or revise these thresholds before they become a graduation gate.

### 10.3 Stop or redesign conditions

Stop expansion when any of these occur:

- review decisions attach to stale group generations or snapshot manifests cannot survive archive/restore;
- local command-path markers are presented as human/operator proof;
- owner routing is inferred from package/tool facets;
- a local pointer is reported as canonical acceptance;
- indeterminate owner writes are retried mechanically;
- raw/private vent content leaks into a handoff or metric export;
- unrated or unverified outcomes are counted as success or failure;
- review reminders become repetitive or materially disrupt Pi startup;
- review burden exceeds perceived value;
- metrics reward more vents, more escalations, or faster dismissal at the expense of quality.

## 11. Rollout plan

### Phase 0 — accept evidence and obtain live decision posture

- retain and review the evidence spike and this packet;
- when AK runtime health permits, perform fresh decision list/passport readback;
- open and legally advance an AK decision before adopting durable snapshot, approval, handoff, or outcome contracts;
- do not mutate the five `new` review states as part of design acceptance.

### Phase 1 — snapshot freshness and read-only cadence

Decision gate: accepted/legal AK passport for the durable snapshot manifest contract.

- implement canonical record/manifest serialization, stable lineage/occurrence identity, and shared lock semantics;
- prove archive/restore reproducibility and duplicate-id safety;
- derive `needs_rereview` and deterministic cadence from generation-specific eligibility;
- add `cadence` and `review due` read-only outputs;
- keep local disposition, command-path intent, and verified decision projections separate;
- no startup hook, notification, or owner-system change.

### Phase 2 — verified decisions and local handoff envelopes

Decision gate: the same accepted/legal passport plus verified Pi host-origin or owner-surface approval contract.

- add command-path intent without human-proof language;
- add handoff preview, structured owner validators, and exact approval token;
- append local intent and unverified reference events separately from verified receipts;
- keep intent/reference actions off the LLM tool mutation surface;
- fail closed if host origin cannot be verified.

### Phase 3 — usefulness events and cohort projections

Decision gate: accepted/legal passport covering the durable outcome schema and measurement use.

- add trust-classified local ratings and owner-verified effect observations;
- project exact cohort identities, denominators, unknown/not-found, negative-outcome, and burden bands;
- dogfood against a bounded local cohort;
- do not export automatically.

### Phase 4 — one owner adapter canary, if separately authorized

Decision gate: owner-specific AK decision/passport and executable owner contract.

- select one owner surface and one exact owner identity;
- use dry-run/preview before mutation;
- require idempotency and effect reconciliation;
- verify owner receipt through the owner system;
- do not generalize from one adapter to every owner.

### Phase 5 — empirical review and optional learning promotion

- explicitly export a minimized cohort to the authorized empirical owner;
- evaluate review value, burden, handoff integrity, and verified effects;
- record any accepted learning through KES/AK owner surfaces;
- decide whether an opt-in startup nudge or additional adapter is justified.

## 12. Validation contract

### 12.1 Pure logic tests

- RFC 8785 canonicalization and SHA-256 produce stable record and manifest digests;
- duplicate/reused record ids remain distinct through persisted occurrence id and append ordinal;
- member-content, membership, or curation change creates a new generation;
- snapshot manifests and lineage survive archive/restore;
- legacy initialization preview writes nothing; apply is token/hash bound, atomic, idempotent after success, and leaves no partial visible state after a pre-rename crash;
- the shared state lock prevents validation-to-approval races;
- malformed timestamps cannot control age/cadence;
- cadence thresholds use an injected deterministic clock;
- `needs_rereview` appears after post-decision membership change;
- stale approval tokens fail closed;
- host-origin receipts are verified by the runtime capability, bind session/surface/command/payload, expire, and reject replay or cross-session use;
- approval token binds owner, target, payload, snapshot, and expiry;
- recurrence aliases cannot substitute for snapshot identity;
- redaction/minimization applies to notes, owner references, payload metadata, and outcomes;
- outcome aggregates preserve denominators and unknowns;
- negative outcome classes remain visible;
- invalid/oversized/symlinked event files fail according to existing store guards.

### 12.2 Extension and command tests

- read-only cadence actions do not create files;
- LLM tool cannot emit host-verified approval or owner-effect events;
- command-path events remain labelled observed/unverified unless host provenance is demonstrated;
- `review`, `outcomes`, `stats`, `export`, and `path` explain new local stores and boundaries;
- handoff preview performs no owner mutation;
- approval performs only a local intent write;
- unverified owner references are never labelled accepted or verified;
- owner `effect_indeterminate` cannot emit a retry command;
- quoted legacy recurrence keys and owner references remain safe;
- command and LLM schemas fail closed before store reads for unknown syntax.

### 12.3 Live proof

For each live phase:

1. run the package gate;
2. reinstall the owning package into Pi;
3. use a fresh Pi session;
4. prove read-only calls leave stores unchanged;
5. prove operator-only commands are absent from the LLM tool action schema;
6. use isolated `PI_AGENT_VENT_DIR` for destructive or approval-flow dogfood;
7. verify no AK, GitHub, incident, evidence, KES, Prompt Vault, ROCS, or telemetry state changed unless that exact owner canary was separately authorized;
8. for an owner adapter canary, cite the owner-native receipt and reconcile any indeterminate effect before closeout.

## 13. Security, privacy, and Goodhart review

| Risk | Control |
|---|---|
| Local state presented as human identity | command-path observation is unverified; require host or owner-surface approval |
| Old review silently covers new recurrence | canonical snapshot generation and `needs_rereview` |
| Duplicate ids, recurrence collision, or curation drift | stable occurrence/lineage identity plus content/curation digests |
| Validation-to-approval race | one shared lock, reload, recompute, then append |
| Draft approval after payload/owner changes | exact digest-bound expiring token |
| Duplicate owner artifacts | idempotency key and owner-native duplicate disposition |
| Retry after unknown effect | fail closed and reconcile by correlation/idempotency key |
| Owner URL/reference leaks private data | opaque, length-bounded, redacted local pointer |
| Metrics reward vent/escalation volume | separate cohorts; no composite score |
| Missing follow-up treated as failure | project as `unknown` |
| Dismissal treated as inherently useless | independent usefulness rating and `noise_removed` reason |
| Local metric becomes canonical evidence | explicit export and owner acceptance required |
| Reminder fatigue | pull-first; any push nudge opt-in, rate-limited, decision-gated |

## 14. Alternatives considered

### A. Automatic capture plus weekly review

Rejected for this packet. Current evidence does not establish capture dropout as the principal bottleneck, and automatic recording changes the durable-consent boundary.

### B. Direct AK/GitHub/incident writers inside `agent_vent`

Rejected for the initial loop. It would introduce credentials, network effects, owner-schema coupling, and authority mutation into the local diagnostic owner.

### C. A separate review dashboard or service

Rejected. Existing Pi commands and tool projections are sufficient for a pilot; a service would add synchronization, telemetry, and lifecycle problems before review value is known.

### D. Treat `escalation_drafted` as approval and owner submission

Rejected. It can be set independently of draft generation, human presence, snapshot freshness, or owner acceptance.

### E. Treat current `outcomes` state counts as usefulness

Rejected. Workflow disposition is not product value or verified effect.

### F. Startup reminder enabled by default

Deferred. It changes default operator attention behavior before the pull-based cadence is proven useful.

## 15. Decision questions for AK review

1. Can Pi supply a non-spoofable operator-origin signal; if not, must approval occur only on the authenticated owner surface?
2. Should LLM `set_review` remain available only as local disposition, be renamed to suggestion-level semantics, or become read-only?
3. Are the canonical serialization, stable lineage/occurrence identity, shared-lock, and retention-survival contracts sufficient?
4. Should handoff approval remain local/manual indefinitely, or may one owner adapter be canaried?
5. Which owner surface should supply the first canonical receipt contract?
6. What empirical owner and cohort thresholds govern graduation?
7. May an opt-in startup nudge be added after pull-based review evidence, and who owns its UX?
8. Which outcome observations qualify for AK evidence or KES learning promotion, and through which explicit acceptance workflow?

## 16. Falsifiers

This design should be revised if:

- operators already maintain a reliable owner review cadence elsewhere that can consume minimized local diagnostics without duplicating state;
- owner systems expose a stronger universal preview/approval/receipt interface than the proposed manual envelope;
- immutable group snapshots cannot be reproduced after local retention without storing unacceptable data;
- the first pilot shows that recurrence review is too low-value to justify handoff machinery;
- Pi cannot provide a non-spoofable host-origin signal and the owner surface cannot supply approval;
- Oracle/DSPx determines that the proposed local cohorts cannot answer review-value questions without prohibited instrumentation;
- a lawful existing AK/KES workflow already owns the review-to-learning loop and only needs a draft/export adapter.

## 17. Smallest truthful next move

1. Review and retain this packet as a proposal.
2. When AK runtime health permits, perform fresh decision readback and open/advance the required AK decision before adopting durable snapshot, approval, handoff, outcome, or startup contracts.
3. If its passport permits bounded implementation, start only with Phase 1: canonical snapshot freshness, shared-lock safety, and pull-based read-only cadence.
4. Do not automatically record vents, disposition the five current `new` groups, create owner artifacts, or promote learnings as part of packet acceptance.
